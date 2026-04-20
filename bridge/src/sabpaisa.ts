/**
 * SabPaisa AES-256-GCM + HMAC-SHA384 HEX (aka `AES256HMACSHA384HEX`) helpers.
 *
 * This is the **only** SabPaisa crypto scheme we support. The previous
 * AES-CBC implementation was wrong — SabPaisa's production API uses the
 * authenticated scheme below for all three paths:
 *
 *   1. collect   → buildSabPaisaEncData       → form POST to SabPaisa init
 *   2. status    → querySabPaisaStatus        → JSON POST to TxnEnquiry API
 *   3. callback  → decryptSabPaisaResponse    → decrypt SabPaisa-posted encResponse
 *
 * Wire layout (uppercase HEX of):
 *
 *     HMAC-SHA384(48B) ‖ GCM_IV(12B) ‖ ciphertext ‖ GCM_TAG(16B)
 *
 * Key derivation:
 *
 *   - `authKey` is base64 (preferred) / hex / raw. Must decode to exactly **32 bytes**.
 *     Used as the AES-256 key. GCM nonce = first **12 bytes** of the key (SabPaisa's spec).
 *   - `authIV` is base64 / hex / raw of any length ≥ 1. It is **NOT a cipher IV** — it
 *     is the **HMAC-SHA384 key** used to authenticate `GCM_IV ‖ ciphertext ‖ tag`.
 *
 * Source of truth: `plugins/bosspay-bridge/includes/class-sabpaisa-handler.php`
 * (`sp_aes_gcm_hmac_encrypt` / `sp_aes_gcm_hmac_decrypt`).
 */
import { createCipheriv, createDecipheriv, createHmac, timingSafeEqual } from 'node:crypto';

const SP_AES_KEY_BYTES = 32;
const SP_GCM_IV_BYTES = 12;
const SP_GCM_TAG_BYTES = 16;
const SP_HMAC_BYTES = 48;

// Production-only. Staging URLs were intentionally removed — merchant flows
// always run against live SabPaisa. The `SABPAISA_ENV` env var is still read
// for logs/diagnostics but never selects a different host.
const SABPAISA_FORM_URL =
  'https://securepay.sabpaisa.in/SabPaisa/sabPaisaInit?v=1';
const SABPAISA_STATUS_URL =
  'https://txnenquiry.sabpaisa.in/SPTxtnEnquiry/getTxnStatusByClientxnId';

// ── Credential decoding ────────────────────────────────────────────

type DecodeShape = 'base64' | 'hex' | 'raw';
interface DecodedCredential {
  bytes: Buffer;
  shape: DecodeShape;
}

/**
 * Mirror of the WP `decode_sabpaisa_credential` helper. Operators sometimes
 * paste base64, sometimes hex, sometimes raw ASCII. We accept all three and
 * return the *shape* used so boot-time logs can aid diagnosis.
 */
function decodeCredential(raw: string): DecodedCredential | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;

  if (/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) {
    const b = Buffer.from(trimmed, 'base64');
    if (b.length > 0 && b.toString('base64') === trimmed) {
      return { bytes: b, shape: 'base64' };
    }
  }

  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    const b = Buffer.from(trimmed, 'hex');
    if (b.length > 0) {
      return { bytes: b, shape: 'hex' };
    }
  }

  const rawBuf = Buffer.from(trimmed, 'utf8');
  return { bytes: rawBuf, shape: 'raw' };
}

function resolveAuthKey(raw: string): { key: Buffer; shape: DecodeShape } {
  const decoded = decodeCredential(raw);
  if (!decoded) {
    throw new Error('[sabpaisa] authKey is empty');
  }
  if (decoded.bytes.length !== SP_AES_KEY_BYTES) {
    throw new Error(
      `[sabpaisa] authKey must decode to ${SP_AES_KEY_BYTES} bytes; got ${decoded.bytes.length} ` +
        `(shape=${decoded.shape}, raw=${raw.trim().length}ch). ` +
        `Expected base64 of 32 raw bytes (≈44 chars, usually ends with "=").`,
    );
  }
  return { key: decoded.bytes, shape: decoded.shape };
}

function resolveAuthIv(raw: string): { iv: Buffer; shape: DecodeShape } {
  const decoded = decodeCredential(raw);
  if (!decoded || decoded.bytes.length === 0) {
    throw new Error('[sabpaisa] authIV is empty (used as HMAC-SHA384 key; any non-zero length is OK).');
  }
  return { iv: decoded.bytes, shape: decoded.shape };
}

/**
 * Called ONCE at server boot so we fail fast on misconfigured creds.
 * Throws with a diagnostic message; server.ts exits on throw.
 */
export function validateSabPaisaConfig(authKey: string, authIV: string): void {
  const k = resolveAuthKey(authKey);
  const iv = resolveAuthIv(authIV);
  console.log(
    `[sabpaisa-config] OK — authKey=${k.key.length}B (${k.shape}) ` +
      `authIV=${iv.iv.length}B (${iv.shape}) cipher=aes-256-gcm+hmac-sha384`,
  );
}

// ── Encrypt / decrypt ──────────────────────────────────────────────

/**
 * Encrypt `plaintext` with SabPaisa's AES256HMACSHA384HEX scheme.
 *
 * Returns uppercase hex of: `HMAC(48) ‖ IV(12) ‖ ciphertext ‖ TAG(16)`
 *
 * GCM nonce is the first 12 bytes of the AES key (SabPaisa's deliberate choice
 * — they key-derive the nonce so ciphertexts are deterministic per plaintext).
 */
export function encryptSabPaisa(
  plaintext: string,
  authKeyRaw: string,
  authIvRaw: string,
): string {
  const { key } = resolveAuthKey(authKeyRaw);
  const { iv: hmacKey } = resolveAuthIv(authIvRaw);

  const gcmIv = key.subarray(0, SP_GCM_IV_BYTES);

  const cipher = createCipheriv('aes-256-gcm', key, gcmIv, {
    authTagLength: SP_GCM_TAG_BYTES,
  });
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const encryptedMessage = Buffer.concat([gcmIv, ciphertext, tag]);
  const hmac = createHmac('sha384', hmacKey).update(encryptedMessage).digest();

  if (hmac.length !== SP_HMAC_BYTES) {
    throw new Error(`[sabpaisa] HMAC length ${hmac.length} != ${SP_HMAC_BYTES}`);
  }

  return Buffer.concat([hmac, encryptedMessage]).toString('hex').toUpperCase();
}

/**
 * Decrypt SabPaisa `encResponse` / `statusResponseData` / callback encData.
 *
 * Input is uppercase hex (per spec, but we accept any hex case / base64 as a
 * tolerance). HMAC is verified with timing-safe compare **before** GCM
 * authenticated decrypt — two belt-and-braces MACs.
 *
 * Returns plaintext on success, or throws on any structural / HMAC / tag failure.
 */
export function decryptSabPaisa(
  encoded: string,
  authKeyRaw: string,
  authIvRaw: string,
): string {
  const { key } = resolveAuthKey(authKeyRaw);
  const { iv: hmacKey } = resolveAuthIv(authIvRaw);

  const cleaned = (encoded ?? '').trim().replace(/\s+/g, '');
  if (!cleaned) throw new Error('[sabpaisa] decrypt: empty ciphertext');

  let full: Buffer;
  if (/^[0-9a-fA-F]+$/.test(cleaned) && cleaned.length % 2 === 0) {
    full = Buffer.from(cleaned, 'hex');
  } else {
    full = Buffer.from(cleaned, 'base64');
    if (full.length === 0) {
      throw new Error('[sabpaisa] decrypt: ciphertext is neither hex nor base64');
    }
  }

  const minLen = SP_HMAC_BYTES + SP_GCM_IV_BYTES + SP_GCM_TAG_BYTES;
  if (full.length < minLen) {
    throw new Error(
      `[sabpaisa] decrypt: payload too short (${full.length}B < ${minLen}B minimum)`,
    );
  }

  const hmacReceived = full.subarray(0, SP_HMAC_BYTES);
  const encryptedMessage = full.subarray(SP_HMAC_BYTES);
  const hmacExpected = createHmac('sha384', hmacKey).update(encryptedMessage).digest();

  if (
    hmacExpected.length !== hmacReceived.length ||
    !timingSafeEqual(hmacExpected, hmacReceived)
  ) {
    throw new Error('[sabpaisa] decrypt: HMAC verification failed');
  }

  const gcmIv = encryptedMessage.subarray(0, SP_GCM_IV_BYTES);
  const rest = encryptedMessage.subarray(SP_GCM_IV_BYTES);
  const tag = rest.subarray(rest.length - SP_GCM_TAG_BYTES);
  const ciphertext = rest.subarray(0, rest.length - SP_GCM_TAG_BYTES);

  const decipher = createDecipheriv('aes-256-gcm', key, gcmIv, {
    authTagLength: SP_GCM_TAG_BYTES,
  });
  decipher.setAuthTag(tag);

  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString('utf8');
}

// ── Public API ─────────────────────────────────────────────────────

export interface SabPaisaConfig {
  clientCode: string;
  transUserName: string;
  transUserPassword: string;
  authKey: string;
  authIV: string;
  env: string;
}

export interface SabPaisaPaymentParams {
  clientTxnId: string;
  amount: number;
  payerName: string;
  payerEmail: string;
  payerMobile: string;
  callbackUrl: string;
}

function statusUrlFor(_env: string): string {
  return SABPAISA_STATUS_URL;
}

function formUrlFor(_env: string): string {
  return SABPAISA_FORM_URL;
}

/**
 * Build the SabPaisa init `encData` (uppercase hex) + the environment-correct
 * form action URL. Customer's browser POSTs to `formActionUrl` with
 * `{ encData, clientCode }` to land on the hosted payment page.
 */
export function buildSabPaisaEncData(
  config: SabPaisaConfig,
  params: SabPaisaPaymentParams,
): { encData: string; formActionUrl: string } {
  const qs = new URLSearchParams({
    clientCode: config.clientCode,
    transUserName: config.transUserName,
    transUserPassword: config.transUserPassword,
    clientTxnId: params.clientTxnId,
    amount: String(params.amount),
    payerFirstName: params.payerName,
    payerEmail: params.payerEmail,
    payerContact: params.payerMobile,
    callbackURL: params.callbackUrl,
    channelId: 'npm',
    udf1: '',
    udf2: '',
    udf3: '',
    udf4: '',
    udf5: '',
  });

  const encData = encryptSabPaisa(qs.toString(), config.authKey, config.authIV);
  return { encData, formActionUrl: formUrlFor(config.env) };
}

/**
 * Decrypt a SabPaisa-posted `encResponse` / callback `encData`. Plaintext is
 * typically url-encoded key=value pairs; occasionally JSON. Both are handled.
 */
export function decryptSabPaisaResponse(
  config: SabPaisaConfig,
  encResponse: string,
): Record<string, string> {
  const plaintext = decryptSabPaisa(encResponse, config.authKey, config.authIV);
  return parsePlaintextToRecord(plaintext);
}

function parsePlaintextToRecord(plaintext: string): Record<string, string> {
  const text = (plaintext ?? '').trim();
  if (!text) return {};

  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const obj = JSON.parse(text) as unknown;
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
          out[k] = v === null || v === undefined ? '' : String(v);
        }
        return out;
      }
    } catch {
      // Fall through to urlencoded parse
    }
  }

  const params = new URLSearchParams(text);
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) {
    out[k] = v;
  }
  return out;
}

/**
 * Call SabPaisa's Transaction Enquiry API for `clientTxnId`.
 *
 * Uses the env-appropriate endpoint and a single uppercase-hex encrypt (no
 * base64 fallback — the spec is hex only). Returns the decrypted fields as a
 * flat string record (post-parse).
 *
 * Throws on network / HTTP / decrypt / SabPaisa-business errors.
 */
export async function querySabPaisaStatus(
  config: SabPaisaConfig,
  clientTxnId: string,
): Promise<Record<string, string>> {
  const url = statusUrlFor(config.env);
  const plainQuery = `clientCode=${encodeURIComponent(
    config.clientCode,
  )}&clientTxnId=${encodeURIComponent(clientTxnId)}`;

  const statusTransEncData = encryptSabPaisa(plainQuery, config.authKey, config.authIV);

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      clientCode: config.clientCode,
      statusTransEncData,
    }),
  });

  const body = await resp.text();
  if (!resp.ok) {
    throw new Error(
      `SabPaisa status HTTP ${resp.status}: ${body.slice(0, 200)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`SabPaisa status returned non-JSON: ${body.slice(0, 200)}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`SabPaisa status unexpected shape: ${body.slice(0, 200)}`);
  }

  const envelope = parsed as Record<string, unknown>;
  const errorCode = typeof envelope['errorCode'] === 'string' ? envelope['errorCode'] : '';
  const message = typeof envelope['message'] === 'string' ? envelope['message'] : '';
  const statusResponseData = envelope['statusResponseData'];

  if (typeof statusResponseData !== 'string' || !statusResponseData.trim()) {
    const hint = errorCode || message || body.slice(0, 200);
    throw new Error(`SabPaisa status missing statusResponseData: ${hint}`);
  }

  const plaintext = decryptSabPaisa(statusResponseData, config.authKey, config.authIV);
  return parsePlaintextToRecord(plaintext);
}

// ── Status normalisation ───────────────────────────────────────────

/** SabPaisa occasionally returns the literal strings `"null"` / `"(null)"` for
 *  unpopulated fields. Treat them as empty so downstream logic doesn't mis-parse. */
export function coerceNullLiteral(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : String(value);
  const t = s.trim();
  if (!t) return '';
  const lower = t.toLowerCase();
  if (lower === 'null' || lower === '(null)') return '';
  return t;
}

/**
 * Map Transaction Enquiry / callback fields to a bridge-contract status
 * (`success | failed | pending`).
 *
 * Precedence (same as WP plugin's `normalize_txn_status`):
 *   1. text `status` (e.g. SUCCESS / FAILED / INITIATED)
 *   2. numeric `statusCode` / `responseCode` (0000 success, 0100 pending, 0200/0300 failed)
 *   3. `settlementStatus` fallback
 *   4. otherwise — scan `status` + `message` substring for success / failure words
 */
export function resolveSabPaisaStatus(
  response: Record<string, string>,
): 'success' | 'failed' | 'pending' {
  const get = (k: string) => coerceNullLiteral(response[k] ?? response[k.toLowerCase()]);

  const textMap: Record<string, 'success' | 'failed' | 'pending'> = {
    success: 'success',
    successful: 'success',
    succeeded: 'success',
    completed: 'success',
    paid: 'success',
    captured: 'success',
    approved: 'success',
    authorised: 'success',
    authorized: 'success',
    challanapproved: 'success',
    failed: 'failed',
    failure: 'failed',
    aborted: 'failed',
    cancelled: 'failed',
    canceled: 'failed',
    timeout: 'failed',
    declined: 'failed',
    invalid: 'failed',
    pending: 'pending',
    initiated: 'pending',
    processing: 'pending',
    in_progress: 'pending',
    challan_generated: 'pending',
  };

  const statusText = get('status').toLowerCase();
  if (statusText && textMap[statusText]) return textMap[statusText]!;

  const codeMap: Record<string, 'success' | 'failed' | 'pending'> = {
    '0000': 'success',
    '0100': 'pending',
    '0200': 'failed',
    '0300': 'failed',
  };
  const code = (get('statusCode') || get('responseCode')).toLowerCase();
  if (code && codeMap[code]) return codeMap[code]!;

  const settleMap: Record<string, 'success' | 'failed' | 'pending'> = {
    settled: 'success',
    success: 'success',
    failed: 'failed',
    failure: 'failed',
    pending: 'pending',
    initiated: 'pending',
  };
  const settle = get('settlementStatus').toLowerCase();
  if (settle && settleMap[settle]) return settleMap[settle]!;

  const msg = [
    get('status'),
    get('statusMessage'),
    get('responseMessage'),
    get('spRespMessage'),
    get('statusDesc'),
    get('txnMessage'),
    get('message'),
  ]
    .join(' ')
    .toLowerCase();

  const successWords = ['success', 'successful', 'succeeded', 'captured', 'completed', 'approved', 'paid'];
  const failedWords = ['fail', 'failed', 'failure', 'declined', 'cancelled', 'canceled', 'aborted', 'error', 'invalid'];

  if (successWords.some((w) => msg.includes(w))) return 'success';
  if (failedWords.some((w) => msg.includes(w))) return 'failed';
  return 'pending';
}
