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