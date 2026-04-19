import express from 'express';
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

const handlers = createSabPaisaHandlers(sabpaisaConfig, BRIDGE_BASE_URL!);

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

// ════════════════════════════════════════════════════════════════════
// BULLETPROOF MIDDLEWARE: intercept ALL /bosspay/v1/ requests at the
// top of the middleware chain. This runs BEFORE express.static or any
// SPA catch-all, so bridge routes can NEVER be shadowed by HTML.
// ════════════════════════════════════════════════════════════════════
app.use((req, res, next) => {
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

// ── /webhooks/sabpaisa — SabPaisa callback (browser redirect) ──────
app.get('/webhooks/sabpaisa', async (req, res) => {
  try {
    const encResponse = req.query['encResponse'] as string | undefined;

    if (!encResponse) {
      res.status(400).send('Missing encResponse parameter.');
      return;
    }

    const parsed = decryptSabPaisaResponse(sabpaisaConfig, encResponse);
    const status = resolveSabPaisaStatus(parsed);

    const pgTxnId =
      parsed['clientTxnId'] ?? parsed['client_txn_id'] ?? parsed['txnId'] ?? '';
    const amount = Number(parsed['amount'] ?? parsed['paidAmount'] ?? 0);

    console.log(`[sabpaisa-webhook] pgTxnId=${pgTxnId}, status=${status}, amount=${amount}`);

    const bossPayStatus: 'success' | 'failed' = status === 'success' ? 'success' : 'failed';

    try {
      const callbackUrl = `${API_BASE}/callbacks/sabpaisa/${pgTxnId}`;
      console.log(`[sabpaisa-webhook] forwarding via POST → ${callbackUrl}`);
      const result = await bridge.forwardCallback({
        pgType: 'sabpaisa',
        pgTransactionId: pgTxnId,
        payload: {
          status: bossPayStatus,
          pg_transaction_id: pgTxnId,
          amount: Math.round(amount * 100),
          metadata: parsed,
        },
      });
      console.log(`[sabpaisa-webhook] BossPay response: HTTP ${result.status} (attempts=${result.attempts}) body=${result.body}`);
      if (result.status === 404) {
        console.error(`[sabpaisa-webhook] 404 from BossPay — check if ${callbackUrl} is correct and accepts POST`);
      }
    } catch (fwdErr) {
      console.error('[sabpaisa-webhook] failed to forward to BossPay:', fwdErr);
    }

    const redirectUrl = `/order-success?encResponse=${encodeURIComponent(encResponse)}`;
    res.redirect(302, redirectUrl);
  } catch (err) {
    console.error('Error handling SabPaisa callback:', err);
    res.status(500).send('Error processing payment callback.');
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

  // SPA fallback: unmatched GET → index.html for React Router
  // Exclude API paths as extra safety (belt + suspenders)
  app.get('{*path}', (req, res) => {
    // Double-check: never serve HTML for API paths
    if (req.path.includes('/bosspay/') || req.path.startsWith('/pay/') || req.path.startsWith('/webhooks/')) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.sendFile(join(publicDir, 'index.html'));
  });
}

// ── Start ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`hairport-bosspay-bridge listening on :${PORT}`);
  console.log(`Bridge base URL: ${BRIDGE_BASE_URL}`);
  console.log(`SabPaisa env: ${SABPAISA_ENV}`);
  if (hasPublicDir) console.log('Frontend: serving React SPA');
  console.log('Bridge routes: /wp-json/bosspay/v1/{health,collect,payout,status/:id}');
});
