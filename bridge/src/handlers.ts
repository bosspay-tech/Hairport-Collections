import type { BridgeHandlers } from '@bosspay/bridge-node';
import type { SupabaseClient } from '@supabase/supabase-js';
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

type StoredStatus = 'pending' | 'success' | 'failed';

function normalizeStoredStatus(value: unknown): StoredStatus {
  if (value === 'success' || value === 'failed' || value === 'pending') {
    return value;
  }
  return 'pending';
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function createSabPaisaHandlers(
  config: SabPaisaConfig,
  bridgeBaseUrl: string,
  supabase: SupabaseClient,
): BridgeHandlers {
  const normalizedBridgeBaseUrl = stripTrailingSlash(bridgeBaseUrl);

  return {
    sabpaisa: {
      createCollection: async (req) => {
        const pgTxnId = `sp_${req.txn_id}`;

        // New callbacks should hit the exact route the client asked for.
        // Keep /webhooks/sabpaisa support in server.ts as fallback for any
        // older in-flight transactions created before this deploy.
        const sabpaisaCallbackUrl =
          `${normalizedBridgeBaseUrl}/wp-json/bosspay/v1/callback/sabpaisa/${req.txn_id}`;

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

        pendingPayments.set(pgTxnId, {
          encData,
          formActionUrl,
          clientCode: config.clientCode,
        });

        setTimeout(() => pendingPayments.delete(pgTxnId), 30 * 60 * 1000);

        return {
          payment_url: `${normalizedBridgeBaseUrl}/pay/${pgTxnId}`,
          pg_transaction_id: pgTxnId,
          mode: 'redirect' as const,
        };
      },

      checkStatus: async (req) => {
        const { data, error } = await supabase
          .from('bosspay_txns')
          .select('payment_status, amount_paisa')
          .eq('pg_transaction_id', req.pg_txn_id)
          .maybeSingle();

        if (error) {
          console.error('[sabpaisa-status] failed to read bosspay_txns:', error);
        }

        return {
          status: normalizeStoredStatus(data?.payment_status),
          pg_transaction_id: req.pg_txn_id,
          amount: Number(data?.amount_paisa ?? 0),
        };
      },

      isAvailable: async () => true,
    },
  };
}
