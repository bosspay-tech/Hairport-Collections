import type { BridgeHandlers } from '@bosspay/bridge-node';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildSabPaisaEncData,
  querySabPaisaStatus,
  resolveSabPaisaStatus,
  type SabPaisaConfig,
} from './sabpaisa.js';

// In-memory store for encrypted payloads keyed by clientTxnId.
// The /pay/:pgTxnId endpoint reads from here to serve the auto-submit form.
export const pendingPayments = new Map<
  string,
  { encData: string; formActionUrl: string; clientCode: string }
>();

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
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

        // Unique callback URL per transaction so SabPaisa can POST back
        // to the correct BossPay callback route.
        const callbackUrl =
          `${normalizedBridgeBaseUrl}/wp-json/bosspay/v1/callback/sabpaisa/${clientTxnId}`;

        // BossPay sends amount in paisa — SabPaisa expects rupees
        const amountRupees = req.amount / 100;

        console.log('[sabpaisa-createCollection] txn_id=', req.txn_id);
        console.log('[sabpaisa-createCollection] clientTxnId=', clientTxnId);
        console.log('[sabpaisa-createCollection] callbackUrl=', callbackUrl);
        console.log('[sabpaisa-createCollection] amountRupees=', amountRupees);

        const { encData, formActionUrl } = buildSabPaisaEncData(config, {
          clientTxnId,
          amount: amountRupees,
          payerName: 'Customer',
          payerEmail: req.customer_email ?? 'noreply@example.com',
          payerMobile: req.customer_phone ?? '0000000000',
          callbackUrl,
        });

        const paymentEntry = { encData, formActionUrl, clientCode: config.clientCode };
        pendingPayments.set(clientTxnId, paymentEntry);

        // Clean up after 30 minutes
        setTimeout(() => pendingPayments.delete(clientTxnId), 30 * 60 * 1000);

        // Persist to Supabase so the /pay/:pgTxnId page survives server restarts.
        // Delay 2 s to allow SupabaseTxnStore to create the row first.
        setTimeout(async () => {
          try {
            const { error } = await supabase
              .from('bosspay_txns')
              .update({
                gateway_payload: paymentEntry,
                updated_at: new Date().toISOString(),
              })
              .eq('pg_transaction_id', clientTxnId);
            if (error) {
              console.warn('[sabpaisa-createCollection] Supabase persist error:', error.message);
            } else {
              console.log('[sabpaisa-createCollection] Supabase persist ok:', clientTxnId);
            }
          } catch (err) {
            console.warn('[sabpaisa-createCollection] Supabase persist threw:', err);
          }
        }, 2000);

        console.log(
          '[sabpaisa-createCollection] payment_url=',
          `${normalizedBridgeBaseUrl}/pay/${clientTxnId}`,
        );

        return {
          payment_url: `${normalizedBridgeBaseUrl}/pay/${clientTxnId}`,
          pg_transaction_id: clientTxnId,
          mode: 'redirect' as const,
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

          const amountRupees = Number(
            statusResp['amount'] ??
            statusResp['paidAmount'] ??
            statusResp['txnAmount'] ??
            0,
          );
          const amountPaisa = Math.round(amountRupees * 100);

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

          const cachedAmount = Number(data?.amount_paisa ?? 0);

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
