import express, { type Request, type Response } from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import {
  createBossPayBridge,
  toExpress,
  SupabaseTxnStore,
} from '@bosspay/bridge-node';
import { createClient } from '@supabase/supabase-js';
import { createSabPaisaHandlers, pendingPayments } from './handlers.js';
import {
  buildSabPaisaEncData,
  decryptSabPaisaResponse,
  querySabPaisaStatus,
  resolveSabPaisaStatus,
  validateSabPaisaConfig,
  type SabPaisaConfig,
} from './sabpaisa.js';
import { startSabPaisaReconciler } from './reconciler.js';
import {
  buildAirpayV4Fields,
  decryptAirpayCallback,
  resolveAirpayStatus,
  validateAirpayConfig,
  verifyAirpayTransaction,
  type AirpayConfig,
} from './airpay.js';

// ── Global Error Handlers ──────────────────────────────────────────
// Prevent unhandled promise rejections (like the UPI_INTENT_MINT_FAILED
// from the bridge-node library) from crashing the entire Node process.
process.on('unhandledRejection', (reason, promise) => {
  console.error('[uncaught-rejection] Unhandled Rejection at:', promise, 'reason:', reason);
});

// ── Environment ────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 3000);
const BRIDGE_SECRET = process.env.BOSSPAY_BRIDGE_SECRET;
const API_BASE = process.env.BOSSPAY_API_BASE ?? 'https://api.bosspay24.com';
const BRIDGE_BASE_URL = process.env.BRIDGE_BASE_URL;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SABPAISA_CLIENT_CODE = process.env.SABPAISA_CLIENT_CODE;
const SABPAISA_USERNAME = process.env.SABPAISA_USERNAME;
const SABPAISA_PASSWORD = process.env.SABPAISA_PASSWORD;
const SABPAISA_AUTH_KEY = process.env.SABPAISA_AUTH_KEY;
const SABPAISA_AUTH_IV = process.env.SABPAISA_AUTH_IV;
const SABPAISA_ENV = process.env.SABPAISA_ENV ?? 'prod';

// ── Validate required env vars exist ───────────────────────────────
const missing = (
  [
    ['BOSSPAY_BRIDGE_SECRET', BRIDGE_SECRET],
    ['BRIDGE_BASE_URL', BRIDGE_BASE_URL],
    ['SUPABASE_URL', SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY],
    ['SABPAISA_CLIENT_CODE', SABPAISA_CLIENT_CODE],
    ['SABPAISA_USERNAME', SABPAISA_USERNAME],
    ['SABPAISA_PASSWORD', SABPAISA_PASSWORD],
    ['SABPAISA_AUTH_KEY', SABPAISA_AUTH_KEY],
    ['SABPAISA_AUTH_IV', SABPAISA_AUTH_IV],
  ] as const
).filter(([, v]) => !v).map(([k]) => k);

if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  process.exit(1);
}

// ── Fail fast on bad SabPaisa key/IV ───────────────────────────────
// Refuses to start the server if AUTH_KEY / AUTH_IV can't be resolved
// to valid AES sizes (16/24/32 bytes for key, 16 bytes for IV).
try {
  validateSabPaisaConfig(SABPAISA_AUTH_KEY!, SABPAISA_AUTH_IV!);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[startup] SabPaisa config invalid — refusing to boot.\n${msg}`);
  process.exit(1);
}

// ── Supabase client (server-side, service role) ────────────────────
const supabaseClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const txnStore = new SupabaseTxnStore({ client: supabaseClient });

// ── SabPaisa config ────────────────────────────────────────────────
const sabpaisaConfig: SabPaisaConfig = {
  clientCode: SABPAISA_CLIENT_CODE!,
  transUserName: SABPAISA_USERNAME!,
  transUserPassword: SABPAISA_PASSWORD!,
  authKey: SABPAISA_AUTH_KEY!,
  authIV: SABPAISA_AUTH_IV!,
  env: SABPAISA_ENV,
};

const handlers = createSabPaisaHandlers(
  sabpaisaConfig,
  BRIDGE_BASE_URL!,
  supabaseClient,
);

// ── Airpay v4 OAuth config (optional — Airpay disabled if credentials missing) ──
// Credentials map to Airpay merchant portal fields:
//   AIRPAY_MERCHANT_ID  → Portal "MID"
//   AIRPAY_CLIENT_ID    → Portal "Client ID"
//   AIRPAY_CLIENT_SECRET→ Portal "Secret Key" (32 hex chars)
//   AIRPAY_USERNAME     → Portal "Username"
//   AIRPAY_PASSWORD     → Portal "Password"
//   AIRPAY_API_KEY      → Portal "API Key" (used for privatekey, not OAuth)
const airpayMissing = validateAirpayConfig({
  merchantId: process.env.AIRPAY_MERCHANT_ID,
  clientId: process.env.AIRPAY_CLIENT_ID,
  clientSecret: process.env.AIRPAY_CLIENT_SECRET,
  username: process.env.AIRPAY_USERNAME,
  password: process.env.AIRPAY_PASSWORD,
  apiKey: process.env.AIRPAY_API_KEY,
});

const airpayConfig: AirpayConfig | null = airpayMissing.length === 0
  ? {
      merchantId: process.env.AIRPAY_MERCHANT_ID!,
      clientId: process.env.AIRPAY_CLIENT_ID!,
      clientSecret: process.env.AIRPAY_CLIENT_SECRET!,
      username: process.env.AIRPAY_USERNAME!,
      password: process.env.AIRPAY_PASSWORD!,
      apiKey: process.env.AIRPAY_API_KEY!,
      oauthUrl: process.env.AIRPAY_OAUTH_URL ?? 'https://kraken.airpay.co.in/airpay/pay/v4/api/oauth2',
      payUrl: process.env.AIRPAY_PAY_URL ?? 'https://payments.airpay.co.in/pay/v4/',
      verifyUrl: process.env.AIRPAY_VERIFY_URL ?? 'https://payments.airpay.co.in/order/verify.php',
      successUrl: process.env.AIRPAY_SUCCESS_URL ?? '',
      failureUrl: process.env.AIRPAY_FAILURE_URL ?? '',
      domain: process.env.BRIDGE_BASE_URL ?? '',
    }
  : null;

if (airpayMissing.length > 0) {
  console.warn(
    `[airpay] Missing env vars: ${airpayMissing.join(', ')} — Airpay payment option disabled.`,
  );
} else {
  console.log('[airpay] Config loaded — Airpay payment option enabled.');
}

// ── BossPay Bridge ─────────────────────────────────────────────────
const bridge = createBossPayBridge({
  bridgeSecret: BRIDGE_SECRET!,
  bosspayApiBase: API_BASE,
  handlers,
  txnStore,
  version: '1.0.0',
});

// ── SabPaisa callback-miss reconciler ──────────────────────────────
// SabPaisa's async callback is unreliable; poll the TxnEnquiry API for any
// pending bridge transaction in the last 15 min and synthesise a webhook
// when a terminal status is seen. Idempotent vs. the real callback path.
const reconciler = startSabPaisaReconciler({
  supabase: supabaseClient,
  config: sabpaisaConfig,
  bridge,
  enabled: process.env.SABPAISA_RECONCILER_ENABLED !== '0',
});

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.once(sig, () => {
    void reconciler.stop().finally(() => process.exit(0));
  });
}

// ── Express app ────────────────────────────────────────────────────
const app = express();

// ── Bridge handler ─────────────────────────────────────────────────
const bridgeHandler = toExpress({
  ctx: {
    handlers,
    txnStore,
    bosspayApiBase: API_BASE,
    version: '1.0.0',
  },
  bridgeSecret: BRIDGE_SECRET!,
});

// ── Helpers ────────────────────────────────────────────────────────

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstString(item);
      if (found) return found;
    }
  }
  return undefined;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * CSP + Referrer-Policy for the two HTML pages that host a cross-origin POST
 * to SabPaisa (`/pay/:pgTxnId` and `/upi/:pgTxnId`).
 *
 * - Happy path is untouched: if no upstream CSP is set, this header lets the
 *   existing auto-submit cross into `*.sabpaisa.in`.
 * - If an upstream proxy/edge injects a restrictive `form-action 'self'`, the
 *   browser intersects CSPs so this alone won't override it — but the paired
 *   hidden user-gesture fallback in the HTML body still satisfies the separate
 *   "bounce tracker / auto-submit" browser heuristic.
 * - `allowFrame` is true for `/upi/`, which uses a hidden <iframe name="sp_iframe">
 *   to perform the SabPaisa handshake in parallel with the upi:// redirect.
 *
 * No COOP/COEP is set — the bridge has no existing helmet layer and we don't
 * want to introduce net-new policy surface that could interact with SabPaisa.
 */
function applySabPaisaHtmlHeaders(res: Response, allowFrame: boolean): void {
  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "form-action 'self' https://securepay.sabpaisa.in https://*.sabpaisa.in",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ];
  if (allowFrame) {
    directives.push("frame-src 'self' https://*.sabpaisa.in");
  }
  res.setHeader('Content-Security-Policy', directives.join('; '));
  res.setHeader('Referrer-Policy', 'no-referrer-when-downgrade');
}

/**
 * Inline sentinel script embedded in the two SabPaisa auto-submit pages.
 * Reveals the hidden `<div id="${targetId}" hidden>` fallback ONLY when
 * auto-submit/redirect clearly didn't navigate away — so the happy path
 * renders zero new UI in browsers that allow the cross-origin POST.
 *
 * Three independent reveal triggers (any one wins):
 *   1. 2000 ms elapsed AND pagehide/beforeunload never fired AND page is still visible
 *      → browser silently blocked the submit (most common on iOS Safari).
 *   2. pageshow event with persisted=true → bfcache restore after a blocked submit.
 *   3. If the user later backgrounds the tab we do NOT reveal — only a still-visible
 *      same-URL state after the timer qualifies as "submit clearly failed".
 */
function buildFallbackSentinelScript(targetId: string): string {
  return `(function(){
  var leaving = false;
  function reveal(){
    if (leaving) return;
    var el = document.getElementById(${JSON.stringify(targetId)});
    if (el) el.hidden = false;
  }
  window.addEventListener('pagehide', function(){ leaving = true; }, { once: true });
  window.addEventListener('beforeunload', function(){ leaving = true; }, { once: true });
  window.addEventListener('pageshow', function(e){ if (e.persisted) reveal(); });
  setTimeout(function(){
    if (document.visibilityState === 'visible') reveal();
  }, 2000);
})();`;
}

/**
 * Strip the legacy `sp_` prefix that old deployments added to pg_transaction_id.
 * New deployments use the raw BossPay UUID as clientTxnId directly.
 */
function getBareTxnId(pgTxnId: string): string {
  return pgTxnId.startsWith('sp_') ? pgTxnId.slice(3) : pgTxnId;
}

function stringifyRecord(input: Record<string, unknown>): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const str = firstString(value);
    if (str !== undefined) {
      output[key] = str;
    }
  }
  return output;
}

function mergeRawCallbackInput(req: Request): Record<string, unknown> {
  const merged: Record<string, unknown> = {};

  if (req.query && typeof req.query === 'object') {
    Object.assign(merged, req.query as Record<string, unknown>);
  }

  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    Object.assign(merged, req.body as Record<string, unknown>);
  }

  if (typeof req.body === 'string' && req.body.trim()) {
    const rawBody = req.body.trim();
    if (rawBody.includes('=')) {
      const params = new URLSearchParams(rawBody);
      for (const [key, value] of params.entries()) {
        if (!(key in merged)) merged[key] = value;
      }
    } else if (!('encResponse' in merged)) {
      merged['encResponse'] = rawBody;
    }
  }

  return merged;
}

function getPgTxnIdFromSabPaisaPayload(
  parsed: Record<string, string>,
  routeTxnId?: string,
): string {
  return (
    parsed['clientTxnId'] ??
    parsed['client_txn_id'] ??
    parsed['txnId'] ??
    parsed['order_id'] ??
    routeTxnId ??
    ''
  );
}

function getAmountPaisaFromSabPaisaPayload(parsed: Record<string, string>): number {
  const amountRupees = Number(
    parsed['amount'] ??
    parsed['paidAmount'] ??
    parsed['txnAmount'] ??
    parsed['paid_amount'] ??
    0,
  );
  if (!Number.isFinite(amountRupees)) return 0;
  return Math.max(0, Math.round(amountRupees * 100));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatInrFromPaisa(paisa: number): string {
  const r = paisa / 100;
  if (!Number.isFinite(r)) return '—';
  return r % 1 === 0 ? `₹${r.toFixed(0)}` : `₹${r.toFixed(2)}`;
}

type ThankYouFlow = 'bosspay_routed' | 'hairport_native';

/** Inline thank-you HTML at the callback URL (no redirect to /order-success). */
function renderThankYouPage(args: {
  status: 'success' | 'failed' | 'pending';
  txnId: string;
  amountPaisa: number;
  message?: string;
  flow: ThankYouFlow;
  callbackForwardFailed?: boolean;
}): string {
  const { status, txnId, amountPaisa, message, flow, callbackForwardFailed } = args;
  const icon = status === 'success' ? '✅' : status === 'pending' ? '⏳' : '❌';
  const title =
    status === 'success'
      ? 'Payment successful'
      : status === 'pending'
        ? 'Payment status pending'
        : 'Payment could not be completed';
  const defaultSub =
    status === 'success'
      ? 'Your payment has been recorded.'
      : status === 'pending'
        ? 'We are confirming your payment. This may take a moment.'
        : 'Something went wrong with your payment.';
  const subtitleText =
    status === 'failed' && message ? message : defaultSub;
  const amountLine =
    amountPaisa > 0
      ? `<p class="muted">Amount: <strong>${escapeHtml(
        formatInrFromPaisa(amountPaisa),
      )}</strong></p>`
      : '';
  const txnLine = txnId
    ? `<p class="muted small">Reference: <strong>${escapeHtml(txnId)}</strong></p>`
    : '';
  const forwardWarn = callbackForwardFailed
    ? '<p class="warn">Your payment may have succeeded, but confirmation to the merchant may be delayed. If money was debited, keep this reference and contact support.</p>'
    : '';

  const navBlock =
    flow === 'hairport_native'
      ? `<div class="nav"><a class="btn" href="/products">Continue shopping</a><a class="btn secondary" href="/orders">View orders</a></div>${
        status === 'success'
          ? `<script>try{localStorage.removeItem('cart');}catch(e){}</script>`
          : ''
      }`
      : '<p class="muted small">You can close this window and return to the merchant.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;color:#0f172a;}
.card{max-width:28rem;padding:2rem;border-radius:1rem;border:1px solid #e2e8f0;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.06);text-align:center;}
h1{font-size:1.25rem;margin:0 0 .5rem;}
p{margin:.5rem 0;}
.muted{color:#64748b;font-size:.875rem;}
.small{font-size:.75rem;}
.warn{color:#b45309;font-size:.875rem;}
.nav{display:flex;gap:.75rem;flex-wrap:wrap;justify-content:center;margin-top:1.25rem;}
.btn{display:inline-block;padding:.6rem 1rem;border-radius:.75rem;background:#0f172a;color:#fff;text-decoration:none;font-weight:600;font-size:.875rem;}
.btn.secondary{background:#fff;color:#0f172a;border:1px solid #e2e8f0;}
.icon{font-size:2rem;margin-bottom:.75rem;}
</style>
</head>
<body>
<div class="card">
<div class="icon">${icon}</div>
<h1>${escapeHtml(title)}</h1>
<p class="muted">${escapeHtml(subtitleText)}</p>
${forwardWarn}
${amountLine}
${txnLine}
${navBlock}
</div>
</body>
</html>`;
}

function respondAfterCallback(args: {
  req: Request;
  res: Response;
  bareTxnId: string;
  status: 'success' | 'failed' | 'pending';
  amountPaisa: number;
  message?: string;
  flow: ThankYouFlow;
  body: Record<string, unknown>;
  callbackForwardFailed?: boolean;
}): void {
  if (args.req.method === 'GET' || args.req.accepts('html')) {
    const html = renderThankYouPage({
      status: args.status,
      txnId: args.bareTxnId,
      amountPaisa: args.amountPaisa,
      message: args.message,
      flow: args.flow,
      callbackForwardFailed: args.callbackForwardFailed,
    });
    args.res.status(200).type('html').send(html);
    return;
  }
  args.res.status(200).json(args.body);
}

// ── SabPaisa callback handler ──────────────────────────────────────
async function handleSabPaisaCallback(req: Request, res: Response) {
  try {
    console.log(`[sabpaisa-callback] inbound ${req.method} ${req.originalUrl}`);

    const routeTxnId = firstString(req.params['txnId']) ?? '';
    const raw = mergeRawCallbackInput(req);
    const encResponse = firstString(raw['encResponse']);

    let parsed: Record<string, string>;
    let payloadSource: 'encResponse' | 'plain';

    if (encResponse) {
      parsed = decryptSabPaisaResponse(sabpaisaConfig, encResponse);
      payloadSource = 'encResponse';
    } else {
      parsed = stringifyRecord(raw);
      payloadSource = 'plain';
    }

    let pgTxnId = getPgTxnIdFromSabPaisaPayload(parsed, routeTxnId);

    if (routeTxnId) {
      const expectedBare = routeTxnId;
      const actualBare = getBareTxnId(pgTxnId);

      if (pgTxnId && actualBare !== expectedBare) {
        res.status(400).send(
          `Callback txn mismatch. expected ${expectedBare}, got ${pgTxnId}.`,
        );
        return;
      }
      pgTxnId = pgTxnId || routeTxnId;
    }

    if (!pgTxnId) {
      res.status(400).send('Missing pg transaction id in SabPaisa callback.');
      return;
    }

    const bareTxnId = getBareTxnId(pgTxnId);
    const status = resolveSabPaisaStatus(parsed);
    const amountPaisa = getAmountPaisaFromSabPaisaPayload(parsed);
    const humanMessage =
      parsed['message'] ||
      parsed['statusMessage'] ||
      parsed['responseMessage'] ||
      parsed['statusDesc'] ||
      '';

    console.log(
      `[sabpaisa-callback] parsed source=${payloadSource} pgTxnId=${pgTxnId} ` +
      `status=${status} amountPaisa=${amountPaisa}`,
    );

    const { data: existing, error: existingError } = await supabaseClient
      .from('bosspay_txns')
      .select('payment_status, amount_paisa, callback_forwarded_at')
      .eq('pg_transaction_id', pgTxnId)
      .maybeSingle();

    if (existingError) {
      console.error('[sabpaisa-callback] failed to read existing txn row:', existingError);
    }

    const alreadyForwarded =
      !!existing?.callback_forwarded_at &&
      existing?.payment_status === status &&
      Number(existing?.amount_paisa ?? 0) === amountPaisa;

    await supabaseClient
      .from('bosspay_txns')
      .update({
        payment_status: status,
        amount_paisa: amountPaisa,
        gateway_payload: { source: payloadSource, raw, parsed },
        updated_at: new Date().toISOString(),
      })
      .eq('pg_transaction_id', pgTxnId);

    if (alreadyForwarded) {
      console.log(`[sabpaisa-callback] duplicate callback ignored for ${pgTxnId}`);
      respondAfterCallback({
        req,
        res,
        bareTxnId,
        status,
        amountPaisa,
        message: humanMessage,
        flow: 'bosspay_routed',
        body: { ok: true, duplicate: true, pgTxnId, status },
      });
      return;
    }

    if (status === 'pending') {
      console.warn(
        `[sabpaisa-callback] ambiguous/pending callback for ${pgTxnId}; ` +
        `not forwarding to BossPay yet`,
      );
      respondAfterCallback({
        req,
        res,
        bareTxnId,
        status,
        amountPaisa,
        message: humanMessage,
        flow: 'bosspay_routed',
        body: { ok: true, forwarded: false, pgTxnId, status },
      });
      return;
    }

    const callbackUrl = `${API_BASE}/callbacks/sabpaisa/${bareTxnId}`;
    console.log(`[sabpaisa-callback] forwarding via POST → ${callbackUrl}`);

    const result = await bridge.forwardCallback({
      pgType: 'sabpaisa',
      pgTransactionId: pgTxnId,
      payload: {
        status,
        pg_transaction_id: pgTxnId,
        amount: amountPaisa,
        metadata: parsed,
      },
    });

    console.log(
      `[sabpaisa-callback] BossPay response: HTTP ${result.status} ` +
      `(attempts=${result.attempts}) body=${result.body}`,
    );

    await supabaseClient
      .from('bosspay_txns')
      .update({
        callback_forward_http_status: result.status,
        callback_forwarded_at:
          result.status >= 200 && result.status < 300
            ? new Date().toISOString()
            : null,
        updated_at: new Date().toISOString(),
      })
      .eq('pg_transaction_id', pgTxnId);

    if (result.status < 200 || result.status >= 300) {
      console.error(
        `[sabpaisa-callback] BossPay callback failed for ${pgTxnId} ` +
        `with HTTP ${result.status}`,
      );
      if (req.method === 'POST') {
        res.status(502).json({ ok: false, pgTxnId, status, forwardStatus: result.status });
        return;
      }
      respondAfterCallback({
        req,
        res,
        bareTxnId,
        status,
        amountPaisa,
        message: humanMessage,
        flow: 'bosspay_routed',
        callbackForwardFailed: true,
        body: { ok: false, pgTxnId, status, forwardStatus: result.status },
      });
      return;
    }

    respondAfterCallback({
      req,
      res,
      bareTxnId,
      status,
      amountPaisa,
      message: humanMessage,
      flow: 'bosspay_routed',
      body: { ok: true, forwarded: true, pgTxnId, status, forwardStatus: result.status },
    });
  } catch (err) {
    console.error('[sabpaisa-callback] error:', err);
    res.status(500).send('Error processing payment callback.');
  }
}

const callbackBodyParsers = [
  express.urlencoded({ extended: false }),
  express.json({ limit: '1mb' }),
  express.text({ type: '*/*' }),
] as const;

// ════════════════════════════════════════════════════════════════════
// Intercept BossPay bridge routes early, but DO NOT swallow the
// custom SabPaisa callback routes.
// ════════════════════════════════════════════════════════════════════
app.use((req, res, next) => {
  const isSabPaisaCallback =
    req.path.startsWith('/wp-json/bosspay/v1/callback/sabpaisa/') ||
    req.path.startsWith('/checkout/return/');

  if (isSabPaisaCallback) return next();

  if (req.path.includes('/bosspay/v1/')) {
    console.log(`[bridge] ${req.method} ${req.path} → bridgeHandler`);
    return bridgeHandler(req, res, next);
  }

  next();
});

// ── /pay/:pgTxnId — auto-submitting form that POSTs to SabPaisa ───
app.get('/pay/:pgTxnId', async (req, res) => {
  const { pgTxnId } = req.params;
  let pending = pendingPayments.get(pgTxnId);

  if (!pending) {
    try {
      const { data } = await supabaseClient
        .from('bosspay_txns')
        .select('gateway_payload')
        .eq('pg_transaction_id', pgTxnId)
        .maybeSingle();

      const gw = data?.gateway_payload as Record<string, unknown> | null;
      if (
        gw &&
        typeof gw['encData'] === 'string' &&
        typeof gw['formActionUrl'] === 'string'
      ) {
        pending = {
          encData: gw['encData'] as string,
          formActionUrl: gw['formActionUrl'] as string,
          clientCode: typeof gw['clientCode'] === 'string'
            ? gw['clientCode']
            : sabpaisaConfig.clientCode,
        };
        pendingPayments.set(pgTxnId, pending);
        setTimeout(() => pendingPayments.delete(pgTxnId), 30 * 60 * 1000);
        console.log(`[pay] restored from Supabase for ${pgTxnId}`);
      }
    } catch (err) {
      console.error('[pay] Supabase fallback error:', err);
    }
  }

  if (!pending) {
    res.status(404).send('Payment session expired or not found.');
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Redirecting to payment…</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc;
           color: #0f172a; padding: 1rem; }
    .loader { text-align: center; max-width: 22rem; }
    .spinner { width: 40px; height: 40px; border: 4px solid #e2e8f0;
               border-top: 4px solid #0f172a; border-radius: 50%;
               animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .fallback { margin-top: 1.5rem; padding: 1rem; border-radius: 12px;
                background: #fff; border: 1px solid #e2e8f0;
                box-shadow: 0 1px 3px rgba(0,0,0,.06); }
    .fallback p { margin: 0 0 .75rem; font-size: .875rem; color: #475569; }
    .btn-primary { display: inline-block; width: 100%; padding: .75rem 1rem;
                   border: 0; border-radius: 8px; background: #0f172a;
                   color: #fff; font-weight: 600; font-size: 1rem;
                   cursor: pointer; }
    .btn-primary:hover { background: #1e293b; }
  </style>
</head>
<body>
  <div class="loader">
    <div class="spinner"></div>
    <p>Redirecting to payment gateway…</p>
    <div id="manual-fallback" class="fallback" hidden>
      <p>If you aren't redirected automatically, tap the button below to continue.</p>
      <button type="submit" form="pf" class="btn-primary">Continue to payment</button>
    </div>
  </div>
  <form id="pf" method="POST" action="${pending.formActionUrl}">
    <input type="hidden" name="encData" value="${pending.encData}" />
    <input type="hidden" name="clientCode" value="${pending.clientCode}" />
  </form>
  <script>document.getElementById('pf').submit();</script>
  <script>${buildFallbackSentinelScript('manual-fallback')}</script>
</body>
</html>`;

  pendingPayments.delete(pgTxnId);
  applySabPaisaHtmlHeaders(res, false);
  res.type('html').send(html);
});

// ── /upi/:pgTxnId — experimental UPI-intent landing (B2 flow) ─────
// The customer opens this HTTPS URL (returned to the merchant as `upi_intent` on
// /collect). We render a minimal page that:
//   1. POSTs the SabPaisa `encData` form into a hidden iframe — this is the *same*
//      handshake the hosted checkout performs, so SabPaisa registers the txn
//      against `clientTxnId` and reconciliation (callback + TxnEnquiry polling)
//      continues to work exactly as for `/pay/:pgTxnId`.
//   2. After a short delay, redirects the top frame to `upi://pay?...` with
//      `tr=<clientTxnId>`. On mobile, this triggers the native UPI app chooser.
// Consumes the pending entry once (same cleanup contract as /pay). If the entry
// is absent, falls back to Supabase for post-restart recovery; if both miss, we
// respond 404 rather than emit a half-formed intent.
app.get('/upi/:pgTxnId', async (req, res) => {
  const { pgTxnId } = req.params;
  let pending = pendingPayments.get(pgTxnId);

  if (!pending) {
    try {
      const { data } = await supabaseClient
        .from('bosspay_txns')
        .select('gateway_payload')
        .eq('pg_transaction_id', pgTxnId)
        .maybeSingle();

      const gw = data?.gateway_payload as Record<string, unknown> | null;
      if (
        gw &&
        typeof gw['encData'] === 'string' &&
        typeof gw['formActionUrl'] === 'string'
      ) {
        const upiIntentRaw = gw['upiIntent'] as Record<string, unknown> | undefined;
        const upiIntent =
          upiIntentRaw &&
          typeof upiIntentRaw['vpa'] === 'string' &&
          typeof upiIntentRaw['payeeName'] === 'string' &&
          typeof upiIntentRaw['orderId'] === 'string' &&
          typeof upiIntentRaw['amountRupees'] === 'number'
            ? {
                vpa: upiIntentRaw['vpa'] as string,
                payeeName: upiIntentRaw['payeeName'] as string,
                orderId: upiIntentRaw['orderId'] as string,
                amountRupees: upiIntentRaw['amountRupees'] as number,
              }
            : undefined;

        pending = {
          encData: gw['encData'] as string,
          formActionUrl: gw['formActionUrl'] as string,
          clientCode:
            typeof gw['clientCode'] === 'string'
              ? (gw['clientCode'] as string)
              : sabpaisaConfig.clientCode,
          ...(upiIntent ? { upiIntent } : {}),
        };
        pendingPayments.set(pgTxnId, pending);
        setTimeout(() => pendingPayments.delete(pgTxnId), 30 * 60 * 1000);
        console.log(`[upi] restored from Supabase for ${pgTxnId}`);
      }
    } catch (err) {
      console.error('[upi] Supabase fallback error:', err);
    }
  }

  if (!pending || !pending.upiIntent) {
    res.status(404).send('Payment session expired or UPI intent not configured.');
    return;
  }

  const intent = pending.upiIntent;
  const amountStr = intent.amountRupees.toFixed(2);
  const upiDeeplink =
    'upi://pay?' +
    new URLSearchParams({
      pa: intent.vpa,
      pn: intent.payeeName,
      am: amountStr,
      cu: 'INR',
      tr: intent.orderId,
    }).toString();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Opening UPI app…</title>
  <style>
    body { font-family: system-ui, sans-serif; display:flex; align-items:center;
           justify-content:center; min-height:100vh; margin:0; background:#f8fafc; color:#0f172a; padding:1rem; }
    .card { max-width:22rem; text-align:center; padding:2rem; border-radius:1rem;
            background:#fff; border:1px solid #e2e8f0; box-shadow:0 1px 3px rgba(0,0,0,.06); }
    .spinner { width:36px; height:36px; border:4px solid #e2e8f0; border-top:4px solid #0f172a;
               border-radius:50%; animation:spin .8s linear infinite; margin:0 auto 1rem; }
    @keyframes spin { to { transform: rotate(360deg); } }
    a { color:#0f172a; }
    .small { font-size:.8rem; color:#64748b; margin-top:1rem; }
    iframe { border:0; width:1px; height:1px; position:absolute; top:-100px; left:-100px; }
    .fallback { margin-top:1.25rem; padding-top:1rem; border-top:1px solid #e2e8f0; }
    .fallback p { margin:0 0 .75rem; font-size:.875rem; color:#475569; }
    .btn-primary { display:inline-block; width:100%; padding:.75rem 1rem;
                   border:0; border-radius:8px; background:#0f172a;
                   color:#fff; font-weight:600; font-size:1rem;
                   text-decoration:none; cursor:pointer; }
    .btn-primary:hover { background:#1e293b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <p>Opening your UPI app…</p>
    <p class="small">If nothing happens, <a id="fallback" href="${escapeHtml(upiDeeplink)}">tap here</a>.</p>
    <div id="upi-fallback" class="fallback" hidden>
      <p>We couldn't open your UPI app automatically.</p>
      <a class="btn-primary" href="${escapeHtml(upiDeeplink)}">Tap to open UPI app</a>
    </div>
  </div>
  <iframe name="sp_iframe" title="sabpaisa handshake"></iframe>
  <form id="sp" method="POST" action="${pending.formActionUrl}" target="sp_iframe">
    <input type="hidden" name="encData" value="${pending.encData}" />
    <input type="hidden" name="clientCode" value="${pending.clientCode}" />
  </form>
  <script>
    // 1) Register the transaction with SabPaisa via browser POST (same as /pay/).
    document.getElementById('sp').submit();
    // 2) After a short delay, redirect to the UPI deeplink. 600 ms is enough for the
    //    iframe POST to fire; we don't need to wait for SabPaisa's response since
    //    reconciliation happens out-of-band via callback + TxnEnquiry polling.
    setTimeout(function () {
      window.location.href = ${JSON.stringify(upiDeeplink)};
    }, 600);
  </script>
  <script>${buildFallbackSentinelScript('upi-fallback')}</script>
</body>
</html>`;

  pendingPayments.delete(pgTxnId);
  applySabPaisaHtmlHeaders(res, true);
  res.type('html').send(html);
});

// ── SabPaisa browser return (neutral path; thank-you HTML inline) ─
app.get('/checkout/return/:txnId', handleSabPaisaCallback);

app.post(
  '/checkout/return/:txnId',
  ...callbackBodyParsers,
  handleSabPaisaCallback,
);

// ── Legacy BossPay-shaped callback (in-flight txns before /checkout cutover) ─
app.get(
  '/wp-json/bosspay/v1/callback/sabpaisa/:txnId',
  handleSabPaisaCallback,
);

app.post(
  '/wp-json/bosspay/v1/callback/sabpaisa/:txnId',
  ...callbackBodyParsers,
  handleSabPaisaCallback,
);

// ── Legacy shared callback route (fallback for old in-flight txns) ─
app.get('/webhooks/sabpaisa', handleSabPaisaCallback);

app.post(
  '/webhooks/sabpaisa',
  ...callbackBodyParsers,
  handleSabPaisaCallback,
);

// ════════════════════════════════════════════════════════════════════
// Hairport storefront routes
//
// The React frontend used to read VITE_SABPAISA_* env vars and call
// `sabpaisa-pg-dev` directly from the browser, which leaked credentials
// into every JS bundle shipped to customers. Those creds are now
// server-only; the storefront posts order details here and we build the
// encrypted init payload and the return-decrypt step server-side.
// ════════════════════════════════════════════════════════════════════

const NON_EMPTY_STRING_RE = /^[\w\s.@+\-:/,'()]{1,200}$/;

function sanitizeStorefrontString(v: unknown, max = 200): string {
  if (typeof v !== 'string') return '';
  const t = v.trim();
  return t.length > max ? t.slice(0, max) : t;
}

app.post(
  '/api/hairport/checkout',
  express.json({ limit: '64kb' }),
  async (req, res) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;

      const txnId = sanitizeStorefrontString(body['txnId'], 80);
      const amount = Number(body['amount'] ?? 0);
      const payerName = sanitizeStorefrontString(body['payerName'], 80);
      const payerEmail = sanitizeStorefrontString(body['payerEmail'], 120);
      const payerMobile = sanitizeStorefrontString(body['payerMobile'], 20);

      if (!txnId || !NON_EMPTY_STRING_RE.test(txnId)) {
        res.status(400).json({ ok: false, error: 'Missing or invalid txnId' });
        return;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        res.status(400).json({ ok: false, error: 'Invalid amount' });
        return;
      }
      if (!payerName || !payerEmail || !payerMobile) {
        res.status(400).json({ ok: false, error: 'Missing payer details' });
        return;
      }

      const normalizedBase = stripTrailingSlash(BRIDGE_BASE_URL!);
      const callbackUrl = `${normalizedBase}/api/hairport/callback/${encodeURIComponent(txnId)}`;

      const { encData, formActionUrl } = buildSabPaisaEncData(sabpaisaConfig, {
        clientTxnId: txnId,
        amount,
        payerName,
        payerEmail,
        payerMobile,
        callbackUrl,
      });

      const entry = {
        encData,
        formActionUrl,
        clientCode: sabpaisaConfig.clientCode,
      };
      pendingPayments.set(txnId, entry);
      setTimeout(() => pendingPayments.delete(txnId), 30 * 60 * 1000);

      console.log(
        `[hairport-checkout] txnId=${txnId} amount=${amount} payerEmail=${payerEmail}`,
      );

      res.json({
        ok: true,
        payUrl: `/pay/${encodeURIComponent(txnId)}`,
        txnId,
      });
    } catch (err) {
      console.error('[hairport-checkout] error:', err);
      res.status(500).json({ ok: false, error: 'Internal error' });
    }
  },
);

async function handleHairportCallback(req: Request, res: Response) {
  try {
    const routeTxnId = firstString(req.params['txnId']) ?? '';
    const raw = mergeRawCallbackInput(req);
    const encResponse = firstString(raw['encResponse']);

    let parsed: Record<string, string>;
    if (encResponse) {
      try {
        parsed = decryptSabPaisaResponse(sabpaisaConfig, encResponse);
      } catch (err) {
        console.error('[hairport-callback] decrypt failed:', err);
        respondAfterCallback({
          req,
          res,
          bareTxnId: routeTxnId || 'unknown',
          status: 'failed',
          amountPaisa: 0,
          message: 'Unable to verify payment response.',
          flow: 'hairport_native',
          body: { ok: false, error: 'decrypt_failed' },
        });
        return;
      }
    } else {
      parsed = stringifyRecord(raw);
    }

    const resolvedTxnId =
      parsed['clientTxnId'] ||
      parsed['client_txn_id'] ||
      parsed['txnId'] ||
      parsed['order_id'] ||
      routeTxnId;

    if (routeTxnId && resolvedTxnId && resolvedTxnId !== routeTxnId) {
      console.warn(
        `[hairport-callback] txn mismatch route=${routeTxnId} payload=${resolvedTxnId}`,
      );
    }

    const txnId = resolvedTxnId || routeTxnId;
    const status = resolveSabPaisaStatus(parsed);
    const amountRupees = Number(
      parsed['amount'] ?? parsed['paidAmount'] ?? parsed['txnAmount'] ?? 0,
    );
    const normalizedAmount = Number.isFinite(amountRupees) ? Math.max(0, amountRupees) : 0;
    const amountPaisaHairport = Math.round(normalizedAmount * 100);
    const message =
      parsed['message'] ||
      parsed['statusMessage'] ||
      parsed['responseMessage'] ||
      parsed['statusDesc'] ||
      '';

    console.log(
      `[hairport-callback] txnId=${txnId} status=${status} amount=${normalizedAmount}`,
    );

    if (txnId) {
      try {
        const orderStatus =
          status === 'success' ? 'success' : status === 'failed' ? 'failed' : 'pending';
        const { error } = await supabaseClient
          .from('orders')
          .update({ status: orderStatus })
          .eq('transaction_id', txnId);
        if (error) {
          console.warn('[hairport-callback] orders update failed:', error.message);
        }
      } catch (err) {
        console.warn('[hairport-callback] orders update threw:', err);
      }
    }

    const bareTxnId = txnId ? getBareTxnId(txnId) : routeTxnId || '';
    respondAfterCallback({
      req,
      res,
      bareTxnId,
      status,
      amountPaisa: amountPaisaHairport,
      message,
      flow: 'hairport_native',
      body: {
        ok: true,
        txnId,
        status,
        amount_paisa: amountPaisaHairport,
      },
    });
  } catch (err) {
    console.error('[hairport-callback] error:', err);
    res.status(500).send('Error processing payment callback.');
  }
}

app.get('/api/hairport/callback/:txnId', handleHairportCallback);

app.post(
  '/api/hairport/callback/:txnId',
  ...callbackBodyParsers,
  handleHairportCallback,
);

// ════════════════════════════════════════════════════════════════════
// Airpay payment routes
// POST /api/hairport/airpay/create      — build form fields, return to frontend
// POST /api/hairport/airpay/callback    — server-to-server notification from Airpay
// POST/GET /api/hairport/airpay/success — browser redirect from Airpay on success
// POST/GET /api/hairport/airpay/failure — browser redirect from Airpay on failure
// ════════════════════════════════════════════════════════════════════

app.post(
  '/api/hairport/airpay/create',
  express.json({ limit: '64kb' }),
  async (req, res) => {
    if (!airpayConfig) {
      res.status(503).json({ ok: false, error: 'Airpay payment is not configured on this server.' });
      return;
    }
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const txnId = sanitizeStorefrontString(body['txnId'], 80);

      if (!txnId || !NON_EMPTY_STRING_RE.test(txnId)) {
        res.status(400).json({ ok: false, error: 'Missing or invalid txnId' });
        return;
      }

      // Fetch real order amount from DB — never trust the frontend value
      const { data: order, error: orderError } = await supabaseClient
        .from('orders')
        .select('total, customer_email, customer_phone, customer_name, customer_address, customer_city, customer_state, customer_pincode')
        .eq('transaction_id', txnId)
        .maybeSingle();

      if (orderError || !order) {
        console.error('[airpay-create] order lookup failed:', orderError?.message ?? 'not found');
        res.status(404).json({ ok: false, error: 'Order not found' });
        return;
      }

      const amount = Number(order['total'] ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        res.status(400).json({ ok: false, error: 'Invalid order amount' });
        return;
      }

      // Accept buyer fields from the request body for cases where the DB
      // doesn't store all Airpay-required fields (address, city, state, pincode
      // ARE stored; we use those as authoritative and fall back to request).
      const buyerFirstName = sanitizeStorefrontString(body['buyerFirstName'], 60) ||
        sanitizeStorefrontString(String(order['customer_name'] ?? '').split(/\s+/)[0], 60);
      const rawNameParts = String(order['customer_name'] ?? '').trim().split(/\s+/);
      const buyerLastName = sanitizeStorefrontString(body['buyerLastName'], 60) ||
        (rawNameParts.length > 1 ? rawNameParts.slice(1).join(' ') : rawNameParts[0] ?? '');
      const buyerEmail = sanitizeStorefrontString(String(order['customer_email'] ?? ''), 120);
      const buyerPhone = sanitizeStorefrontString(String(order['customer_phone'] ?? ''), 20);
      const buyerAddress = sanitizeStorefrontString(String(order['customer_address'] ?? ''), 200);
      const buyerCity = sanitizeStorefrontString(String(order['customer_city'] ?? ''), 80);
      const buyerState = sanitizeStorefrontString(String(order['customer_state'] ?? ''), 80);
      const buyerCountry = sanitizeStorefrontString(body['buyerCountry'], 60) || 'India';
      const buyerPinCode = sanitizeStorefrontString(String(order['customer_pincode'] ?? ''), 10);

      if (!buyerEmail || !buyerFirstName) {
        res.status(400).json({ ok: false, error: 'Incomplete buyer details on order' });
        return;
      }

      console.log(`[airpay-create] txnId=${txnId} amount=${amount} buyer=${buyerEmail}`);

      const { fields, payUrl } = await buildAirpayV4Fields(airpayConfig, {
        buyerEmail,
        buyerPhone,
        buyerFirstName,
        buyerLastName,
        buyerAddress,
        buyerCity,
        buyerState,
        buyerCountry,
        buyerPinCode,
        amount,
        orderid: txnId,
      });

      // Mark the order as initiated via Airpay (best-effort)
      await supabaseClient
        .from('orders')
        .update({ gateway: 'airpay' } as Record<string, unknown>)
        .eq('transaction_id', txnId)
        .then(({ error: e }) => {
          if (e) console.warn('[airpay-create] gateway column update skipped:', e.message);
        });

      res.json({
        ok: true,
        fields,
        payUrl,
        txnId,
      });
    } catch (err) {
      console.error('[airpay-create] error:', err);
      res.status(500).json({ ok: false, error: 'Internal error' });
    }
  },
);

/** Shared handler for Airpay success, failure, and server-side callback. */
async function handleAirpayReturn(req: Request, res: Response) {
  if (!airpayConfig) {
    res.status(503).send('Airpay not configured.');
    return;
  }
  try {
    const raw: Record<string, unknown> = {};
    if (req.query && typeof req.query === 'object') {
      Object.assign(raw, req.query as Record<string, unknown>);
    }
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
      Object.assign(raw, req.body as Record<string, unknown>);
    }
    if (typeof req.body === 'string' && req.body.includes('=')) {
      for (const [k, v] of new URLSearchParams(req.body).entries()) {
        if (!(k in raw)) raw[k] = v;
      }
    }

    console.log(`[airpay-return] inbound ${req.method} ${req.originalUrl}`);

    // Airpay encrypts the entire callback body the same way as OAuth responses.
    // When present, decrypt `response` and merge its fields into `raw`.
    const encryptedResponse = firstString(raw['response']);
    if (encryptedResponse) {
      try {
        const decrypted = decryptAirpayCallback(airpayConfig, encryptedResponse);
        console.log('[airpay-return] decrypted callback:', JSON.stringify(decrypted).slice(0, 400));
        Object.assign(raw, decrypted);
        // Flatten nested `data` object — actual txn fields live there
        if (decrypted['data'] && typeof decrypted['data'] === 'object') {
          Object.assign(raw, decrypted['data'] as Record<string, unknown>);
        }
      } catch (err) {
        console.error('[airpay-return] failed to decrypt callback response:', err);
      }
    }

    // MERCHANTTRANSACTIONID is the orderid we sent — it equals txnId.
    const txnId =
      firstString(raw['MERCHANTTRANSACTIONID']) ||
      firstString(raw['merchanttransactionid']) ||
      firstString(raw['orderid']) ||
      firstString(raw['ORDERID']) ||
      firstString(raw['order_id']) ||
      firstString(raw['CUSTOMVAR']) ||
      firstString(raw['customvar']) ||
      '';

    const apTxnId =
      firstString(raw['APTRANSACTIONID']) ||
      firstString(raw['aptransactionid']) ||
      firstString(raw['ap_transactionid']) ||
      firstString(raw['TRANSACTIONID']) ||
      firstString(raw['transactionid']) ||
      '';

    const statusCode =
      firstString(raw['TRANSACTIONSTATUS']) ||
      firstString(raw['transactionstatus']) ||
      firstString(raw['transaction_status']) ||
      firstString(raw['STATUS']) ||
      firstString(raw['status']) ||
      '';

    const statusMsg =
      firstString(raw['STATUSMSG']) ||
      firstString(raw['statusmsg']) ||
      firstString(raw['MESSAGE']) ||
      firstString(raw['message']) ||
      '';

    const amountStr =
      firstString(raw['TRANSACTIONAMT']) ||
      firstString(raw['transactionamt']) ||
      firstString(raw['amount']) ||
      '0';

    if (!txnId) {
      console.error('[airpay-return] no merchant transaction ID after decryption. raw keys:', Object.keys(raw).join(', '));
      res.status(400).send('Missing transaction reference in Airpay response.');
      return;
    }

    let status = resolveAirpayStatus(statusCode);
    console.log(
      `[airpay-return] txnId=${txnId} apTxnId=${apTxnId} statusCode=${statusCode} resolved=${status}`,
    );

    // Server-side verification before marking as paid
    if (status === 'success') {
      try {
        const verifyResult = await verifyAirpayTransaction(airpayConfig, txnId);
        console.log(
          `[airpay-return] verify → status=${verifyResult.status} rawStatus=${verifyResult.rawStatus}`,
        );
        status = verifyResult.status;
      } catch (err) {
        // Verification failure → treat as pending; the merchant can manually verify
        console.error('[airpay-return] verify request failed:', err);
        status = 'pending';
      }
    }

    const amountRupees = Number(amountStr) || 0;
    const amountPaisa = Math.round(amountRupees * 100);
    const orderStatus =
      status === 'success' ? 'success' : status === 'failed' ? 'failed' : 'pending';

    // Update order status in Supabase
    try {
      const { error: updateError } = await supabaseClient
        .from('orders')
        .update({
          status: orderStatus,
          gateway: 'airpay',
          gateway_txn_id: apTxnId || undefined,
        } as Record<string, unknown>)
        .eq('transaction_id', txnId);
      if (updateError) {
        console.warn('[airpay-return] orders update failed:', updateError.message);
      }
    } catch (err) {
      console.warn('[airpay-return] orders update threw:', err);
    }

    respondAfterCallback({
      req,
      res,
      bareTxnId: txnId,
      status,
      amountPaisa,
      message: statusMsg,
      flow: 'hairport_native',
      body: {
        ok: true,
        txnId,
        status,
        statusCode,
        aptransactionid: apTxnId,
        amount_paisa: amountPaisa,
      },
    });
  } catch (err) {
    console.error('[airpay-return] error:', err);
    res.status(500).send('Error processing Airpay payment response.');
  }
}

app.post('/api/hairport/airpay/callback', ...callbackBodyParsers, handleAirpayReturn);
app.get('/api/hairport/airpay/callback', handleAirpayReturn);

app.post('/api/hairport/airpay/success', ...callbackBodyParsers, handleAirpayReturn);
app.get('/api/hairport/airpay/success', handleAirpayReturn);

app.post('/api/hairport/airpay/failure', ...callbackBodyParsers, handleAirpayReturn);
app.get('/api/hairport/airpay/failure', handleAirpayReturn);

// ── On-demand status probe for the /order-success page ───────────────
// SabPaisa's browser-redirect to our callbackURL is not 100% reliable —
// sometimes the customer lands on /order-success without `encResponse`
// in the URL. In that case the frontend polls this endpoint, which:
//   1. returns the current `orders.status` if already terminal, else
//   2. hits SabPaisa's TxnEnquiry API live, updates the row, and returns.
// The 15 s reconciler is still the long-tail safety net for txns where
// the user never comes back at all; this endpoint covers the case where
// they DO come back promptly.
app.get('/api/hairport/status/:txnId', async (req, res) => {
  try {
    const txnId = String(req.params['txnId'] ?? '').trim();
    if (!txnId) {
      res.status(400).json({ ok: false, error: 'Missing txnId' });
      return;
    }

    const { data: existing } = await supabaseClient
      .from('orders')
      .select('status, total, transaction_id')
      .eq('transaction_id', txnId)
      .maybeSingle();

    const currentStatus = (existing?.['status'] as string | undefined) ?? 'pending';
    if (currentStatus === 'success' || currentStatus === 'failed') {
      res.json({
        ok: true,
        txnId,
        status: currentStatus,
        amount: Number(existing?.['total'] ?? 0) || 0,
        source: 'orders_cache',
      });
      return;
    }

    let parsed: Record<string, string>;
    try {
      parsed = await querySabPaisaStatus(sabpaisaConfig, txnId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[hairport-status] ${txnId} live probe failed: ${msg}`);
      res.json({
        ok: true,
        txnId,
        status: 'pending',
        amount: 0,
        source: 'probe_error',
        error: msg,
      });
      return;
    }

    const resolved = resolveSabPaisaStatus(parsed);
    const amountRupees = Number(
      parsed['amount'] ?? parsed['paidAmount'] ?? parsed['txnAmount'] ?? 0,
    ) || 0;

    if (resolved === 'success' || resolved === 'failed') {
      try {
        await supabaseClient
          .from('orders')
          .update({ status: resolved })
          .eq('transaction_id', txnId);
      } catch (err) {
        console.warn('[hairport-status] orders update threw:', err);
      }
    }

    console.log(
      `[hairport-status] ${txnId} live probe → status=${resolved} amount=${amountRupees}`,
    );

    res.json({
      ok: true,
      txnId,
      status: resolved,
      amount: amountRupees,
      source: 'live_probe',
    });
  } catch (err) {
    console.error('[hairport-status] error:', err);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
});

// ════════════════════════════════════════════════════════════════════
// STATIC FILES + SPA FALLBACK — comes LAST, after all API routes
// ════════════════════════════════════════════════════════════════════
const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
const hasPublicDir = existsSync(publicDir);

if (hasPublicDir) {
  app.use(express.static(publicDir));

  app.get('{*path}', (req, res) => {
    if (
      req.path.includes('/bosspay/') ||
      req.path.startsWith('/pay/') ||
      req.path.startsWith('/upi/') ||
      req.path.startsWith('/webhooks/') ||
      req.path.startsWith('/api/') ||
      req.path.startsWith('/checkout/return')
    ) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.sendFile(join(publicDir, 'index.html'));
  });
}

// ── Start ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  const normalizedBridgeBaseUrl = stripTrailingSlash(BRIDGE_BASE_URL!);

  console.log(`hairport-bosspay-bridge listening on :${PORT}`);
  console.log(`Bridge base URL: ${normalizedBridgeBaseUrl}`);
  console.log(`SabPaisa env: ${SABPAISA_ENV}`);
  if (hasPublicDir) console.log('Frontend: serving React SPA');
  console.log('Bridge routes: /wp-json/bosspay/v1/{health,collect,payout,status/:id,upi/:txnId}');
  console.log('Hosted checkout: /pay/:pgTxnId (auto-submit form to SabPaisa)');
  console.log(
    'UPI intent (direct-mint, v1.1.0+): /bosspay/v1/upi/:txnId — ' +
    'confirmintentupiV1 → cached upi://pay?… (re-mint every 10 min)',
  );
  console.log(
    'UPI intent (legacy iframe splash): /upi/:pgTxnId — kept for in-flight traffic without probed SabPaisa config',
  );
  console.log(
    'SabPaisa callback routes: /checkout/return/:txnId (preferred); ' +
    'legacy /wp-json/bosspay/v1/callback/sabpaisa/:txnId; /webhooks/sabpaisa',
  );
  if (airpayConfig) {
    console.log(
      'Airpay routes: POST /api/hairport/airpay/create; ' +
      'POST+GET /api/hairport/airpay/{callback,success,failure}',
    );
    console.log(
      `Airpay success URL (register in Airpay merchant portal): ` +
      (airpayConfig.successUrl || `${normalizedBridgeBaseUrl}/api/hairport/airpay/success`),
    );
    console.log(
      `Airpay failure URL (register in Airpay merchant portal): ` +
      (airpayConfig.failureUrl || `${normalizedBridgeBaseUrl}/api/hairport/airpay/failure`),
    );
  } else {
    console.log('[airpay] Airpay not configured — set AIRPAY_MERCHANT_ID / AIRPAY_USERNAME / AIRPAY_PASSWORD / AIRPAY_API_KEY to enable.');
  }

  // Diagnostic: print the exact SabPaisa-bound callbackUrl shape so operators
  // can eyeball-compare it against the URL whitelisted on SabPaisa's merchant
  // profile. SabPaisa rejects with "Merchant Url is not whitelisted" if the
  // origin (scheme+host) of `callbackUrl` doesn't match what's registered for
  // this clientCode. The most common silent regression is shipping the apex
  // host (https://example.com) when SabPaisa was whitelisted with the WC
  // canonical (https://www.example.com), since the WP plugin always sent the
  // www variant. Also warn loudly when that's the case.
  const callbackPathTemplate =
    process.env.SABPAISA_CALLBACK_PATH_TEMPLATE ?? '/checkout/return/{uuid}';
  const sampleCallbackUrl =
    `${normalizedBridgeBaseUrl}${callbackPathTemplate.replace('{uuid}', '<txnId>')}`;
  console.log(`SabPaisa callbackUrl shape: ${sampleCallbackUrl}`);
  try {
    const host = new URL(normalizedBridgeBaseUrl).hostname;
    if (!host.startsWith('www.') && host.split('.').length === 2) {
      console.warn(
        `[sabpaisa-config] WARNING: BRIDGE_BASE_URL host is "${host}" (apex, no www). ` +
          'If SabPaisa returns "Merchant Url is not whitelisted" at the checkout ' +
          `screen, the most likely fix is BRIDGE_BASE_URL=https://www.${host} ` +
          '(the WC canonical the WP plugin always sent and which SabPaisa typically ' +
          'has on the merchant profile).',
      );
    }
  } catch {
    // BRIDGE_BASE_URL malformed — already validated upstream, ignore here.
  }
});