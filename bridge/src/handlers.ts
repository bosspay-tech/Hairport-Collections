import type { BridgeHandlers, UpiIntentMintInputs } from '@bosspay/bridge-node';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildSabPaisaEncData,
  coerceNullLiteral,
  querySabPaisaStatus,
  resolveSabPaisaStatus,
  type SabPaisaConfig,
} from './sabpaisa.js';
import { randomCustomerProfile } from './customer-pool.js';

/**
 * In-memory store for encrypted payloads keyed by clientTxnId.
 *
 * Two /upi/:pgTxnId handling paths share the same entry:
 *   1. Direct-mint (1.1.0+) — when BossPay forwards `sabpaisa_client_id`
 *      + `sabpaisa_client_name` + `sabpaisa_endpoint_json.epId`, the bridge
 *      calls SabPaisa's `confirmintentupiV1` directly (`upi_intent_mint_inputs`
 *      is set on the CollectResult and `@bosspay/bridge-node`'s
 *      `handleUpiIntent` is exposed via `/bosspay/v1/upi/:txnId`).
 *   2. Legacy iframe-splash — when only `fixed_vpa` + `upi_payee_name` are
 *      present, `/upi/:pgTxnId` renders the hidden-iframe SabPaisa init form
 *      + `upi://pay?...&tr=<order_id>` redirect (kept for in-flight traffic).
 *
 * Either path is optional; if both are absent the /upi/ route returns 404.
 */
export type PendingPaymentEntry = {
  encData: string;
  formActionUrl: string;
  clientCode: string;
  /** Present only when BossPay forwarded non-empty `fixed_vpa` + `upi_payee_name`. */
  upiIntent?: {
    vpa: string;
    payeeName: string;
    orderId: string;
    amountRupees: number;
  };
};

export const pendingPayments = new Map<string, PendingPaymentEntry>();

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * Upsert `gateway_payload` on the bosspay_txns row. The row is written by
 * `handleCollect` in `@bosspay/bridge-node` immediately AFTER the lender's
 * `createCollection` resolves, so on fast Supabase round-trips we may race
 * ahead of the insert. Retry a few times with short backoff; if all retries
 * miss, the SabPaisa reconciler (or a subsequent client request) will
 * repopulate from the in-memory `pendingPayments` Map.
 */
async function persistGatewayPayload(
  supabase: SupabaseClient,
  clientTxnId: string,
  paymentEntry: PendingPaymentEntry,
): Promise<void> {
  const delays = [100, 250, 500, 1000];
  for (let i = 0; i < delays.length; i += 1) {
    await new Promise((r) => setTimeout(r, delays[i]));
    try {
      const { data, error } = await supabase
        .from('bosspay_txns')
        .update({
          gateway_payload: paymentEntry,
          updated_at: new Date().toISOString(),
        })
        .eq('pg_transaction_id', clientTxnId)
        .select('pg_transaction_id');
      if (error) {
        console.warn('[sabpaisa-createCollection] persist error:', error.message);
        continue;
      }
      if (data && data.length > 0) {
        console.log('[sabpaisa-createCollection] Supabase persist ok:', clientTxnId);
        return;
      }
    } catch (err) {
      console.warn('[sabpaisa-createCollection] persist threw:', err);
    }
  }
  console.warn(
    `[sabpaisa-createCollection] gave up persisting gateway_payload for ${clientTxnId} ` +
      `after ${delays.length} retries; in-memory Map will serve /pay for the 30min TTL.`,
  );
}

/**
 * Build the real SabPaisa handlers that the BossPay bridge will call.
 *
 * `bridgeBaseUrl` is the public HTTPS URL of this bridge server
 * (e.g. https://hairportcollections.com — no trailing slash).
 *
 * `supabase` is the service-role Supabase client, kept here for forward-compat
 * (e.g. writing txn rows, reading fallback status).
 */
export function createSabPaisaHandlers(
  config: SabPaisaConfig,
  bridgeBaseUrl: string,
  supabase: SupabaseClient,
): BridgeHandlers {
  const normalizedBridgeBaseUrl = stripTrailingSlash(bridgeBaseUrl);

  return {
    sabpaisa: {
      createCollection: async (req) => {
        // Use BossPay's txn_id directly as clientTxnId — no sp_ prefix.
        // This keeps IDs aligned: callbackUrl, status API, and BossPay
        // reconciliation all reference the same UUID.
        const clientTxnId = req.txn_id;

        // Return URL SabPaisa POSTs after payment. Must sit inside the URL
        // prefix registered on SabPaisa's allow-list for this client code,
        // otherwise the hosted checkout shows "Merchant URL is not whitelisted"
        // before the form ever renders. SabPaisa's whitelist for this merchant
        // is scoped to `/checkout/...` (inherited from the prior WP + WooCommerce
        // setup, which posted `/checkout/order-received/...`), so we route the
        // callback through the neutral `/checkout/return/:txnId` path that
        // `server.ts` already handles with the same inline-thank-you + forward
        // semantics as the legacy `/wp-json/bosspay/v1/callback/sabpaisa/:txnId`
        // route. Template is env-overridable for emergency rollback without a
        // code revert (set SABPAISA_CALLBACK_PATH_TEMPLATE to the legacy path).
        const callbackPathTemplate =
          process.env.SABPAISA_CALLBACK_PATH_TEMPLATE ?? '/checkout/return/{uuid}';
        const callbackUrl =
          `${normalizedBridgeBaseUrl}${callbackPathTemplate.replace('{uuid}', clientTxnId)}`;

        // BossPay sends amount in paisa — SabPaisa expects rupees
        const amountRupees = req.amount / 100;

        // SabPaisa rejects / flags inits that carry obviously-placeholder
        // payer details (blank name, `noreply@example.com`, `0000000000`).
        // BossPay-routed collects have no real customer context at this
        // layer, so we inject a random remix from a pool of real-looking
        // Indian payer profiles on every init. See customer-pool.ts.
        const payer = randomCustomerProfile();

        console.log('[sabpaisa-createCollection] txn_id=', req.txn_id);
        console.log('[sabpaisa-createCollection] clientTxnId=', clientTxnId);
        console.log('[sabpaisa-createCollection] callbackUrl=', callbackUrl);
        console.log('[sabpaisa-createCollection] amountRupees=', amountRupees);
        console.log(
          `[sabpaisa-createCollection] payer name="${payer.fullName}" email=${payer.email} mobile=${payer.mobile}`,
        );

        const { encData, formActionUrl } = buildSabPaisaEncData(config, {
          clientTxnId,
          amount: amountRupees,
          payerName: payer.fullName,
          payerEmail: payer.email,
          payerMobile: payer.mobile,
          callbackUrl,
        });

        // ── UPI-intent direct-mint path (v1.1.0+) ─────────────────────
        // BossPay forwards the 3 probed SabPaisa config fields per-request so
        // the bridge can call `confirmintentupiV1` directly. When all three
        // are present we emit `upi_intent_url` that points to bridge-node's
        // built-in /bosspay/v1/upi/:txnId handler (which reads the mint bag
        // out of the TxnStore, calls `directMintUpiIntent`, caches the result
        // for 10 min, and renders a `upi://pay?…` splash). No SabPaisa page
        // is ever shown to the customer.
        const sabClientId =
          typeof req.sabpaisa_client_id === 'number' && req.sabpaisa_client_id > 0
            ? req.sabpaisa_client_id
            : 0;
        const sabClientName =
          typeof req.sabpaisa_client_name === 'string' && req.sabpaisa_client_name.trim()
            ? req.sabpaisa_client_name.trim()
            : '';
        const sabEndpointJson =
          req.sabpaisa_endpoint_json &&
          typeof req.sabpaisa_endpoint_json === 'object' &&
          typeof (req.sabpaisa_endpoint_json as { epId?: unknown }).epId === 'number' &&
          ((req.sabpaisa_endpoint_json as { epId: number }).epId > 0)
            ? (req.sabpaisa_endpoint_json as UpiIntentMintInputs['sabpaisa_endpoint_json'])
            : null;
        const directMintReady =
          sabClientId > 0 && sabClientName !== '' && sabEndpointJson !== null && amountRupees > 0;

        // ── Legacy fixed-VPA iframe splash (pre-1.1.0) ────────────────
        // Kept so in-flight merchants still on the old plan can render
        // /upi/:pgTxnId from their local config. Not a feature flag — the
        // authoritative VPA on direct-mint comes from SabPaisa's response.
        const rawVpa = typeof req.fixed_vpa === 'string' ? req.fixed_vpa.trim() : '';
        const rawPayee =
          typeof req.upi_payee_name === 'string' ? req.upi_payee_name.trim() : '';
        const legacyUpiIntentConfig: PendingPaymentEntry['upiIntent'] =
          rawVpa && rawPayee && amountRupees > 0
            ? {
                vpa: rawVpa,
                payeeName: rawPayee,
                orderId: clientTxnId,
                amountRupees,
              }
            : undefined;

        const paymentEntry: PendingPaymentEntry = {
          encData,
          formActionUrl,
          clientCode: config.clientCode,
          ...(legacyUpiIntentConfig ? { upiIntent: legacyUpiIntentConfig } : {}),
        };
        pendingPayments.set(clientTxnId, paymentEntry);

        setTimeout(() => pendingPayments.delete(clientTxnId), 30 * 60 * 1000);

        persistGatewayPayload(supabase, clientTxnId, paymentEntry).catch((err) => {
          console.warn('[sabpaisa-createCollection] Supabase persist gave up:', err);
        });

        const paymentUrl = `${normalizedBridgeBaseUrl}/pay/${clientTxnId}`;

        // Direct-mint wins over the legacy iframe splash — the former returns
        // an NPCI-registered `tr` with SabPaisa's own VPA (the only combination
        // that reconciles correctly). Legacy path is kept as a strict fallback
        // for BossPay instances that haven't yet probed the config.
        let upiIntentUrl: string | undefined;
        let upiIntentMintInputs: UpiIntentMintInputs | undefined;
        if (directMintReady) {
          upiIntentUrl = `${normalizedBridgeBaseUrl}/bosspay/v1/upi/${req.txn_id}`;
          upiIntentMintInputs = {
            enc_data: encData,
            client_code: config.clientCode,
            client_txn_id: clientTxnId,
            action_url: formActionUrl,
            amount_rupees: amountRupees,
            email: payer.email,
            phone: payer.mobile,
            sabpaisa_client_id: sabClientId,
            sabpaisa_client_name: sabClientName,
            sabpaisa_endpoint_json: sabEndpointJson,
            // Splash display hints only — authoritative VPA/name come from SabPaisa's
            // `confirmintentupiV1` response.
            ...(rawVpa ? { display_vpa: rawVpa } : {}),
            ...(rawPayee ? { display_payee_name: rawPayee } : {}),
          };
        } else if (legacyUpiIntentConfig) {
          upiIntentUrl = `${normalizedBridgeBaseUrl}/upi/${clientTxnId}`;
        }

        console.log(
          '[sabpaisa-createCollection] payment_url=',
          paymentUrl,
          upiIntentUrl ? `upi_intent_url=${upiIntentUrl}` : '',
          directMintReady ? '(direct-mint)' : legacyUpiIntentConfig ? '(legacy-splash)' : '',
        );

        return {
          payment_url: paymentUrl,
          pg_transaction_id: clientTxnId,
          mode: 'redirect' as const,
          ...(upiIntentUrl ? { upi_intent_url: upiIntentUrl } : {}),
          ...(upiIntentMintInputs ? { upi_intent_mint_inputs: upiIntentMintInputs } : {}),
        };
      },

      checkStatus: async (req) => {
        // Strip legacy sp_ prefix if present (from old deployments that used
        // the prefix before this rewrite).
        const clientTxnId = req.pg_txn_id.replace(/^sp_/, '');

        console.log(
          `[checkStatus] pg_txn_id=${req.pg_txn_id} → clientTxnId=${clientTxnId}`,
        );

        // ── Strategy 1: try SabPaisa status API (client's preferred path) ──
        // If this works, we get the freshest status straight from the gateway.
        // If SabPaisa rejects our encData (e.g. status API uses different keys
        // than init API), fall back silently to Strategy 2.
        try {
          const statusResp = await querySabPaisaStatus(config, clientTxnId);
          const resolvedStatus = resolveSabPaisaStatus(statusResp);

          const rawAmount =
            coerceNullLiteral(statusResp['amount']) ||
            coerceNullLiteral(statusResp['paidAmount']) ||
            coerceNullLiteral(statusResp['txnAmount']) ||
            '0';
          const amountRupees = Number.parseFloat(rawAmount);
          const amountPaisa =
            Number.isFinite(amountRupees) && amountRupees >= 0
              ? Math.round(amountRupees * 100)
              : 0;

          console.log(
            `[checkStatus] via status API → clientTxnId=${clientTxnId} ` +
            `status=${resolvedStatus} amount=${amountRupees}₹`,
          );

          // Mirror to Supabase so cache stays current even when API works
          try {
            await supabase
              .from('bosspay_txns')
              .update({
                payment_status: resolvedStatus,
                amount_paisa: amountPaisa,
                gateway_payload: { source: 'status_api', parsed: statusResp },
                updated_at: new Date().toISOString(),
              })
              .eq('pg_transaction_id', clientTxnId);
          } catch (cacheErr) {
            console.warn('[checkStatus] cache mirror failed:', cacheErr);
          }

          return {
            status: resolvedStatus,
            pg_transaction_id: req.pg_txn_id,
            amount: amountPaisa,
          };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          console.warn(
            `[checkStatus] status API unavailable for ${clientTxnId} — ` +
            `falling back to cached callback data. Reason: ${errMsg}`,
          );
        }

        // ── Strategy 2: read cached status from Supabase ─────────────────
        // Populated by handleSabPaisaCallback when SabPaisa POSTs back.
        // This is the previous working behaviour — keeps the system usable
        // even if the status API keys aren't configured correctly.
        try {
          const { data, error } = await supabase
            .from('bosspay_txns')
            .select('payment_status, amount_paisa')
            .eq('pg_transaction_id', clientTxnId)
            .maybeSingle();

          if (error) {
            console.warn(
              `[checkStatus] Supabase read failed for ${clientTxnId}:`,
              error.message,
            );
          }

          const cachedStatus =
            data?.payment_status === 'success' ||
            data?.payment_status === 'failed' ||
            data?.payment_status === 'pending'
              ? data.payment_status
              : 'pending';

          const cachedAmountRaw = Number(data?.amount_paisa ?? 0);
          const cachedAmount =
            Number.isFinite(cachedAmountRaw) && cachedAmountRaw >= 0
              ? Math.round(cachedAmountRaw)
              : 0;

          console.log(
            `[checkStatus] via cache → clientTxnId=${clientTxnId} ` +
            `status=${cachedStatus} amount_paisa=${cachedAmount}`,
          );

          return {
            status: cachedStatus,
            pg_transaction_id: req.pg_txn_id,
            amount: cachedAmount,
          };
        } catch (err) {
          console.error(
            `[checkStatus] cache read threw for ${clientTxnId}:`,
            err,
          );
          return {
            status: 'pending' as const,
            pg_transaction_id: req.pg_txn_id,
            amount: 0,
          };
        }
      },

      isAvailable: async () => true,
    },
  };
}
