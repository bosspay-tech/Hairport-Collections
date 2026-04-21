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

function buildOrderSuccessRedirectUrl(args: {
  bareTxnId: string;
  status: 'success' | 'failed' | 'pending';
  encResponse?: string;
  callbackForwardFailed?: boolean;
}): string {
  const params = new URLSearchParams();
  if (args.bareTxnId) params.set('txn', args.bareTxnId);
  params.set('status', args.status);
  if (args.encResponse) params.set('encResponse', args.encResponse);
  if (args.callbackForwardFailed) params.set('callbackForwardFailed', '1');
  return `/order-success?${params.toString()}`;
}

function respondAfterCallback(args: {
  req: Request;
  res: Response;
  bareTxnId: string;
  status: 'success' | 'failed' | 'pending';
  encResponse?: string;
  body: Record<string, unknown>;
  callbackForwardFailed?: boolean;
}) {
  const redirectUrl = buildOrderSuccessRedirectUrl({
    bareTxnId: args.bareTxnId,
    status: args.status,
    encResponse: args.encResponse,
    callbackForwardFailed: args.callbackForwardFailed,
  });

  if (args.req.method === 'GET' || args.req.accepts('html')) {
    args.res.redirect(302, redirectUrl);
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
        req, res, bareTxnId, status, encResponse,
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
        req, res, bareTxnId, status, encResponse,
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
        req, res, bareTxnId, status, encResponse, callbackForwardFailed: true,
        body: { ok: false, pgTxnId, status, forwardStatus: result.status },
      });
      return;
    }

    respondAfterCallback({
      req, res, bareTxnId, status, encResponse,
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
    req.path.startsWith('/wp-json/bosspay/v1/callback/sabpaisa/');

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
  <title>Redirecting to payment…</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; }
    .loader { text-align: center; }
    .spinner { width: 40px; height: 40px; border: 4px solid #e2e8f0;
               border-top: 4px solid #0f172a; border-radius: 50%;
               animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loader">
    <div class="spinner"></div>
    <p>Redirecting to payment gateway…</p>
  </div>
  <form id="pf" method="POST" action="${pending.formActionUrl}">
    <input type="hidden" name="encData" value="${pending.encData}" />
    <input type="hidden" name="clientCode" value="${pending.clientCode}" />
  </form>
  <script>document.getElementById('pf').submit();</script>
</body>
</html>`;

  pendingPayments.delete(pgTxnId);
  res.type('html').send(html);
});

// ── Per-transaction SabPaisa callback (client-requested route) ────
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

      // Storefront form gives a single "Full Name" string; SabPaisa
      // requires `payerFirstName` AND `payerLastName` separately and
      // rejects the request otherwise (literal error: "Payer name is
      // not passed correctly in the payment request. Please check.null").
      const nameParts = payerName.split(/\s+/).filter((p) => p.length > 0);
      const firstName = nameParts.shift() ?? 'Customer';
      const lastName = nameParts.length > 0 ? nameParts.join(' ') : 'Patron';

      const { encData, formActionUrl } = buildSabPaisaEncData(sabpaisaConfig, {
        clientTxnId: txnId,
        amount,
        payerFirstName: firstName,
        payerLastName: lastName,
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
        res.redirect(
          302,
          `/order-success?status=failed&message=${encodeURIComponent('Unable to verify payment response.')}`,
        );
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

    const qs = new URLSearchParams();
    if (txnId) qs.set('txn', txnId);
    qs.set('status', status);
    if (normalizedAmount > 0) qs.set('amount', String(normalizedAmount));
    if (message) qs.set('message', message);

    res.redirect(302, `/order-success?${qs.toString()}`);
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
      req.path.startsWith('/webhooks/') ||
      req.path.startsWith('/api/')
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
  console.log('Bridge routes: /wp-json/bosspay/v1/{health,collect,payout,status/:id}');
  console.log(
    'SabPaisa callback routes: ' +
    '/wp-json/bosspay/v1/callback/sabpaisa/:txnId and /webhooks/sabpaisa',
  );
});