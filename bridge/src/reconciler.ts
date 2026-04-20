/**
 * SabPaisa callback-miss reconciler.
 *
 * SabPaisa's hosted checkout sometimes fails to POST back to the merchant's
 * `callbackURL` (flaky browser redirect, ad-blockers, hostname allow-lists on
 * their side, etc.). We cannot rely on the callback as the sole delivery
 * channel. This reconciler polls the SabPaisa TxnEnquiry API every 5 s for
 * any bridge transaction created in the last 15 min that hasn't been forwarded
 * to BossPay yet, and synthesises the callback via `bridge.forwardCallback`
 * when a terminal status is seen.
 *
 * Idempotency: both the callback path (`server.ts::handleSabPaisaCallback`)
 * and this poller short-circuit if `callback_forwarded_at IS NOT NULL`, and
 * the SQL selector here excludes already-forwarded rows from the sweep. So
 * whichever path wins first, the loser is a no-op.
 *
 * Mirrors `plugins/bosspay-bridge/includes/class-sabpaisa-reconciler.php`
 * (Bridge 1.4.0) in intent.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BossPayBridge } from '@bosspay/bridge-node';
import {
  querySabPaisaStatus,
  resolveSabPaisaStatus,
  coerceNullLiteral,
  type SabPaisaConfig,
} from './sabpaisa.js';

export interface ReconcilerOptions {
  supabase: SupabaseClient;
  config: SabPaisaConfig;
  bridge: BossPayBridge;
  enabled: boolean;

  /** Poll interval, ms. Default 5_000 (5 s). */
  intervalMs?: number;
  /** Maximum age of a row considered "still worth polling". Default 15 min. */
  windowMinutes?: number;
  /** A row must be at least this old before first poll. Default 5 s. */
  minAgeSeconds?: number;
  /** Per-row cooldown between reconcile attempts. Default 10 s. */
  backoffSeconds?: number;
  /** Cap on rows reconciled per tick. Default 25. */
  maxPerRun?: number;
  /** Table name override. Default `bosspay_txns`. */
  table?: string;
}

export interface ReconcilerHandle {
  stop: () => Promise<void>;
}

interface PendingRow {
  pg_transaction_id: string;
  txn_id: string;
  created_at: string;
  payment_status: string | null;
}

export function startSabPaisaReconciler(opts: ReconcilerOptions): ReconcilerHandle {
  const intervalMs = opts.intervalMs ?? 5_000;
  const windowMinutes = opts.windowMinutes ?? 15;
  const minAgeSeconds = opts.minAgeSeconds ?? 5;
  const backoffSeconds = opts.backoffSeconds ?? 10;
  const maxPerRun = opts.maxPerRun ?? 25;
  const table = opts.table ?? 'bosspay_txns';

  if (!opts.enabled) {
    console.log('[reconciler] sabpaisa disabled via SABPAISA_RECONCILER_ENABLED=0');
    return { stop: async () => undefined };
  }

  console.log(
    `[reconciler] sabpaisa enabled poll=${Math.round(intervalMs / 1000)}s ` +
      `window=${windowMinutes}m minAge=${minAgeSeconds}s backoff=${backoffSeconds}s ` +
      `maxPerRun=${maxPerRun}`,
  );

  const inFlight = new Set<string>();
  let running = false;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let activeTick: Promise<void> | null = null;

  async function tick(): Promise<void> {
    if (stopped || running) return;
    running = true;

    try {
      const now = Date.now();
      const windowStart = new Date(now - windowMinutes * 60_000).toISOString();
      const maxCreatedAt = new Date(now - minAgeSeconds * 1000).toISOString();
      const maxLastAttemptAt = new Date(now - backoffSeconds * 1000).toISOString();

      // Pull candidates. We filter on:
      //   pg_type = sabpaisa, callback_forwarded_at IS NULL,
      //   created_at BETWEEN windowStart AND maxCreatedAt
      // and then filter "reconcile_last_attempt_at IS NULL OR older than backoff"
      // in JS (PostgREST `.or()` is awkward for that compound predicate).
      const { data, error } = await opts.supabase
        .from(table)
        .select('pg_transaction_id, txn_id, created_at, payment_status, reconcile_last_attempt_at')
        .eq('pg_type', 'sabpaisa')
        .is('callback_forwarded_at', null)
        .gte('created_at', windowStart)
        .lte('created_at', maxCreatedAt)
        .order('created_at', { ascending: true })
        .limit(maxPerRun * 3);

      if (error) {
        console.warn('[reconciler] supabase select failed:', error.message);
        return;
      }

      const eligible: PendingRow[] = [];
      for (const row of data ?? []) {
        const lastAttempt =
          typeof row['reconcile_last_attempt_at'] === 'string'
            ? row['reconcile_last_attempt_at']
            : null;
        if (lastAttempt && lastAttempt > maxLastAttemptAt) continue;
        if (inFlight.has(row['pg_transaction_id'] as string)) continue;

        const status = (row['payment_status'] as string | null) ?? null;
        if (status && status !== 'pending') continue;

        eligible.push({
          pg_transaction_id: row['pg_transaction_id'] as string,
          txn_id: row['txn_id'] as string,
          created_at: row['created_at'] as string,
          payment_status: status,
        });
        if (eligible.length >= maxPerRun) break;
      }

      if (!eligible.length) return;

      console.log(`[reconciler] tick picked ${eligible.length} row(s) to reconcile`);
      await Promise.all(eligible.map((row) => reconcileOne(row)));
    } catch (err) {
      console.error('[reconciler] tick threw:', err);
    } finally {
      running = false;
    }
  }

  async function reconcileOne(row: PendingRow): Promise<void> {
    const pgTxnId = row.pg_transaction_id;
    inFlight.add(pgTxnId);
    const nowIso = new Date().toISOString();

    try {
      await stampAttempt(pgTxnId, nowIso);

      const clientTxnId = pgTxnId.startsWith('sp_') ? pgTxnId.slice(3) : pgTxnId;
      let parsed: Record<string, string>;
      try {
        parsed = await querySabPaisaStatus(opts.config, clientTxnId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[reconciler] ${pgTxnId} status-api failed: ${msg}`);
        return;
      }

      const status = resolveSabPaisaStatus(parsed);
      const amountRupees = Number(coerceNullLiteral(parsed['paidAmount'] ?? parsed['amount'] ?? '')) || 0;
      const amountPaisa = Math.max(0, Math.round(amountRupees * 100));

      console.log(
        `[reconciler] ${pgTxnId} poll → status=${status} amountRupees=${amountRupees}`,
      );

      if (status === 'pending') {
        return;
      }

      const { error: updErr } = await opts.supabase
        .from(opts.table ?? 'bosspay_txns')
        .update({
          payment_status: status,
          amount_paisa: amountPaisa,
          gateway_payload: { source: 'reconciler_poll', parsed },
          updated_at: new Date().toISOString(),
        })
        .eq('pg_transaction_id', pgTxnId);
      if (updErr) {
        console.warn(`[reconciler] ${pgTxnId} row update failed: ${updErr.message}`);
      }

      let forwardHttpStatus: number | null = null;
      let forwardedAt: string | null = null;
      try {
        const result = await opts.bridge.forwardCallback({
          pgType: 'sabpaisa',
          pgTransactionId: pgTxnId,
          payload: {
            status,
            pg_transaction_id: pgTxnId,
            amount: amountPaisa,
            metadata: parsed,
          },
        });
        forwardHttpStatus = result.status;
        if (result.status >= 200 && result.status < 300) {
          forwardedAt = new Date().toISOString();
        }
        console.log(
          `[reconciler] ${pgTxnId} forwardCallback → HTTP ${result.status} ` +
            `(attempts=${result.attempts})`,
        );
      } catch (err) {
        console.error(`[reconciler] ${pgTxnId} forwardCallback threw:`, err);
      }

      const stampPayload: Record<string, unknown> = {
        callback_forward_http_status: forwardHttpStatus,
        updated_at: new Date().toISOString(),
      };
      if (forwardedAt) {
        stampPayload['callback_forwarded_at'] = forwardedAt;
      }
      const { error: stampErr } = await opts.supabase
        .from(opts.table ?? 'bosspay_txns')
        .update(stampPayload)
        .eq('pg_transaction_id', pgTxnId);
      if (stampErr) {
        console.warn(`[reconciler] ${pgTxnId} stamp update failed: ${stampErr.message}`);
      }
    } catch (err) {
      console.error(`[reconciler] ${pgTxnId} reconcileOne threw:`, err);
    } finally {
      inFlight.delete(pgTxnId);
    }
  }

  async function stampAttempt(pgTxnId: string, nowIso: string): Promise<void> {
    // Supabase-JS doesn't expose an atomic increment without RPC, so we read+write.
    // Contention is low: we hold inFlight for this pgTxnId through the whole cycle.
    const { data, error } = await opts.supabase
      .from(opts.table ?? 'bosspay_txns')
      .select('reconcile_attempts')
      .eq('pg_transaction_id', pgTxnId)
      .maybeSingle();

    const prev = Number(data?.['reconcile_attempts'] ?? 0);
    if (error) {
      console.warn(`[reconciler] ${pgTxnId} attempt-read failed: ${error.message}`);
    }

    const { error: updErr } = await opts.supabase
      .from(opts.table ?? 'bosspay_txns')
      .update({
        reconcile_last_attempt_at: nowIso,
        reconcile_attempts: prev + 1,
      })
      .eq('pg_transaction_id', pgTxnId);
    if (updErr) {
      console.warn(`[reconciler] ${pgTxnId} attempt-update failed: ${updErr.message}`);
    }
  }

  timer = setInterval(() => {
    if (stopped) return;
    activeTick = tick();
  }, intervalMs);

  // Fire an immediate tick soon after boot so restarts don't leave a gap.
  setTimeout(() => {
    if (!stopped) activeTick = tick();
  }, 1_000);

  return {
    stop: async () => {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (activeTick) {
        try {
          await activeTick;
        } catch {
          // already logged
        }
      }
      console.log('[reconciler] sabpaisa stopped');
    },
  };
}
