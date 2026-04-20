import type { BridgeHandlers } from '@bosspay/bridge-node';
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

/**
 * Build the real SabPaisa handlers that the BossPay bridge will call.
 *
 * `bridgeBaseUrl` is the public HTTPS URL of this bridge server
 * (e.g. https://hairportcollections.com — no trailing slash).
 */
export function createSabPaisaHandlers(
  config: SabPaisaConfig,
  bridgeBaseUrl: string,
): BridgeHandlers {
  return {
    sabpaisa: {
      createCollection: async (req) => {
        // Use BossPay's txn_id directly as clientTxnId.
        // This keeps the IDs aligned: the callbackURL, the status API lookup,
        // and BossPay's reconciliation all reference the same UUID.
        const clientTxnId = req.txn_id;

        // Unique callback URL per transaction so SabPaisa can POST back
        // to the correct BossPay callback route.
        const callbackUrl =
          `${bridgeBaseUrl}/wp-json/bosspay/v1/callback/sabpaisa/${clientTxnId}`;

        // BossPay sends amount in paisa — SabPaisa expects rupees
        const amountRupees = req.amount / 100;

        const { encData, formActionUrl } = buildSabPaisaEncData(config, {
          clientTxnId,
          amount: amountRupees,
          payerName: 'Customer',
          payerEmail: req.customer_email ?? 'noreply@example.com',
          payerMobile: req.customer_phone ?? '0000000000',
          callbackUrl,
        });

        console.log(
          `[collect] clientTxnId=${clientTxnId} amount=${amountRupees} ` +
          `callbackUrl=${callbackUrl}`,
        );

        // Store for the /pay/:pgTxnId auto-submit page
        pendingPayments.set(clientTxnId, {
          encData,
          formActionUrl,
          clientCode: config.clientCode,
        });

        // Clean up after 30 minutes
        setTimeout(() => pendingPayments.delete(clientTxnId), 30 * 60 * 1000);

        return {
          payment_url: `${bridgeBaseUrl}/pay/${clientTxnId}`,
          pg_transaction_id: clientTxnId,
          mode: 'redirect' as const,
        };
      },

      checkStatus: async (req) => {
        // pg_txn_id is the pg_transaction_id we returned from createCollection.
        // Strip legacy sp_ prefix if present (from old deployments).
        const clientTxnId = req.pg_txn_id.replace(/^sp_/, '');

        console.log(
          `[checkStatus] pg_txn_id=${req.pg_txn_id} → clientTxnId=${clientTxnId}`,
        );

        try {
          const statusResp = await querySabPaisaStatus(config, clientTxnId);
          const resolvedStatus = resolveSabPaisaStatus(statusResp);

          // Amount from SabPaisa is in rupees — convert back to paisa for BossPay
          const amountRupees = Number(
            statusResp['amount'] ??
            statusResp['paidAmount'] ??
            statusResp['txnAmount'] ??
            0,
          );
          const amountPaisa = Math.round(amountRupees * 100);

          console.log(
            `[checkStatus] clientTxnId=${clientTxnId} ` +
            `status=${resolvedStatus} amount=${amountRupees}₹`,
          );

          return {
            status: resolvedStatus,
            pg_transaction_id: req.pg_txn_id,
            amount: amountPaisa,
          };
        } catch (err) {
          // Log but don't crash — return pending so BossPay retries later
          console.error(
            `[checkStatus] SabPaisa status API failed for ${clientTxnId}:`,
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
