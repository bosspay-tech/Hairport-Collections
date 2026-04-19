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
  decryptSabPaisaResponse,
  resolveSabPaisaStatus,
  type SabPaisaConfig,
} from './sabpaisa.js';

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
const SABPAISA_ENV = process.env.SABPAISA_ENV ?? 'stag';

// ── Validate required env vars ─────────────────────────────────────
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

    // application/x-www-form-urlencoded body as raw text fallback
    if (rawBody.includes('=')) {
      const params = new URLSearchParams(rawBody);
      for (const [key, value] of params.entries()) {
        if (!(key in merged)) {
          merged[key] = value;
        }
      }
    } else if (!('encResponse' in merged)) {
      // some providers may send only the encResponse value
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
    (routeTxnId ? `sp_${routeTxnId}` : '')
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

  if (!Number.isFinite(amountRupees)) {
    return 0;
  }

  return Math.max(0, Math.round(amountRupees * 100));
}

function buildOrderSuccessRedirectUrl(args: {
  bareTxnId: string;
  status: 'success' | 'failed' | 'pending';
  encResponse?: string;
  callbackForwardFailed?: boolean;
}): string {
  const params = new URLSearchParams();

  if (args.bareTxnId) {
    params.set('txn', args.bareTxnId);
  }

  params.set('status', args.status);

  if (args.encResponse) {
    params.set('encResponse', args.encResponse);
  }

  if (args.callbackForwardFailed) {
    params.set('callbackForwardFailed', '1');
  }

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
    const expectedPgTxnId = routeTxnId ? `sp_${routeTxnId}` : '';

    if (expectedPgTxnId) {
      if (pgTxnId && pgTxnId !== expectedPgTxnId) {
        res.status(400).send(
          `Callback txn mismatch. expected ${expectedPgTxnId}, got ${pgTxnId}.`,
        );
        return;
      }
      pgTxnId = expectedPgTxnId;
    }

    if (!pgTxnId) {
      res.status(400).send('Missing pg transaction id in SabPaisa callback.');
      return;
    }

    const bareTxnId = getBareTxnId(pgTxnId);
    const status = resolveSabPaisaStatus(parsed);
    const amountPaisa = getAmountPaisaFromSabPaisaPayload(parsed);

    console.log(
      `[sabpaisa-callback] parsed source=${payloadSource} pgTxnId=${pgTxnId} status=${status} amountPaisa=${amountPaisa}`,
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

    const { error: updateError } = await supabaseClient
      .from('bosspay_txns')
      .update({
        payment_status: status,
        amount_paisa: amountPaisa,
        gateway_payload: {
          source: payloadSource,
          raw,
          parsed,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('pg_transaction_id', pgTxnId);

    if (updateError) {
      console.error('[sabpaisa-callback] failed to update txn row:', updateError);
    }

    if (alreadyForwarded) {
      console.log(`[sabpaisa-callback] duplicate callback ignored for ${pgTxnId}`);
      respondAfterCallback({
        req,
        res,
        bareTxnId,
        status,
        encResponse,
        body: {
          ok: true,
          duplicate: true,
          pgTxnId,
          status,
        },
      });
      return;
    }

    if (status === 'pending') {
      console.warn(
        `[sabpaisa-callback] ambiguous/pending callback for ${pgTxnId}; not forwarding to BossPay yet`,
      );

      respondAfterCallback({
        req,
        res,
        bareTxnId,
        status,
        encResponse,
        body: {
          ok: true,
          forwarded: false,
          pgTxnId,
          status,
        },
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
      `[sabpaisa-callback] BossPay response: HTTP ${result.status} (attempts=${result.attempts}) body=${result.body}`,
    );

    const { error: forwardUpdateError } = await supabaseClient
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

    if (forwardUpdateError) {
      console.error('[sabpaisa-callback] failed to store forward result:', forwardUpdateError);
    }

    if (result.status < 200 || result.status >= 300) {
      console.error(
        `[sabpaisa-callback] BossPay callback failed for ${pgTxnId} with HTTP ${result.status}`,
      );

      if (req.method === 'POST') {
        res.status(502).json({
          ok: false,
          pgTxnId,
          status,
          forwardStatus: result.status,
        });
        return;
      }

      respondAfterCallback({
        req,
        res,
        bareTxnId,
        status,
        encResponse,
        callbackForwardFailed: true,
        body: {
          ok: false,
          pgTxnId,
          status,
          forwardStatus: result.status,
        },
      });
      return;
    }

    respondAfterCallback({
      req,
      res,
      bareTxnId,
      status,
      encResponse,
      body: {
        ok: true,
        forwarded: true,
        pgTxnId,
        status,
        forwardStatus: result.status,
      },
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
// custom SabPaisa callback route requested by the client.
// ════════════════════════════════════════════════════════════════════
app.use((req, res, next) => {
  const isSabPaisaCallback =
    req.path.startsWith('/wp-json/bosspay/v1/callback/sabpaisa/');

  if (isSabPaisaCallback) {
    return next();
  }

  if (req.path.includes('/bosspay/v1/')) {
    console.log(`[bridge] ${req.method} ${req.path} → bridgeHandler`);
    return bridgeHandler(req, res, next);
  }

  next();
});

// ── /pay/:pgTxnId — auto-submitting form that POSTs to SabPaisa ───
app.get('/pay/:pgTxnId', (req, res) => {
  const { pgTxnId } = req.params;
  const pending = pendingPayments.get(pgTxnId);

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

// ── New callback route requested by client ─────────────────────────
app.get(
  '/wp-json/bosspay/v1/callback/sabpaisa/:txnId',
  handleSabPaisaCallback,
);

app.post(
  '/wp-json/bosspay/v1/callback/sabpaisa/:txnId',
  ...callbackBodyParsers,
  handleSabPaisaCallback,
);

// ── Legacy fallback callback route for older in-flight payments ────
app.get('/webhooks/sabpaisa', handleSabPaisaCallback);

app.post(
  '/webhooks/sabpaisa',
  ...callbackBodyParsers,
  handleSabPaisaCallback,
);

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
      req.path.startsWith('/webhooks/')
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
    'SabPaisa callback routes: /wp-json/bosspay/v1/callback/sabpaisa/:txnId and /webhooks/sabpaisa',
  );
});
