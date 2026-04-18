import type { BridgeHandlers } from '@bosspay/bridge-node';
import {
  buildSabPaisaEncData,
  type SabPaisaConfig,
} from './sabpaisa.js';

// In-memory store for encrypted payloads keyed by pgTxnId.
// The /pay/:pgTxnId endpoint reads from here to serve the auto-submit form.
export const pendingPayments = new Map<
  string,
  { encData: string; formActionUrl: string; clientCode: string }
>();

/**
 * Build the real SabPaisa handlers that the BossPay bridge will call.
 *
 * `bridgeBaseUrl` is the public HTTPS URL of this bridge server so we
 * can construct the SabPaisa callback URL and the redirect payment URL.
 */
export function createSabPaisaHandlers(
  config: SabPaisaConfig,
  bridgeBaseUrl: string,
): BridgeHandlers {
  return {
    sabpaisa: {
      createCollection: async (req) => {
        const pgTxnId = `sp_${req.txn_id}`;

        // SabPaisa will redirect the customer back to this URL after payment.
        // The bridge intercepts it, decrypts, forwards callback to BossPay,
        // then redirects the customer onward.
        const sabpaisaCallbackUrl = `${bridgeBaseUrl}/webhooks/sabpaisa`;

        // BossPay sends amount in paisa — SabPaisa expects rupees
        const amountRupees = req.amount / 100;

        const { encData, formActionUrl } = buildSabPaisaEncData(config, {
          clientTxnId: pgTxnId,
          amount: amountRupees,
          payerName: 'Customer',
          payerEmail: req.customer_email ?? '',
          payerMobile: req.customer_phone ?? '',
          callbackUrl: sabpaisaCallbackUrl,
        });

        // Store the encrypted payload so /pay/:pgTxnId can serve it
        pendingPayments.set(pgTxnId, {
          encData,
          formActionUrl,
          clientCode: config.clientCode,
        });

        // Clean up after 30 minutes (payment should be initiated well before)
        setTimeout(() => pendingPayments.delete(pgTxnId), 30 * 60 * 1000);

        return {
          payment_url: `${bridgeBaseUrl}/pay/${pgTxnId}`,
          pg_transaction_id: pgTxnId,
          mode: 'redirect' as const,
        };
      },

      checkStatus: async (req) => {
        // SabPaisa doesn't have a simple status-check API in the SDK.
        // Return pending; the real status comes via the callback.
        return {
          status: 'pending' as const,
          pg_transaction_id: req.pg_txn_id,
          amount: 0,
        };
      },

      isAvailable: async () => true,
    },
  };
}
