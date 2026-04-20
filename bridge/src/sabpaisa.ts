/**
 * SabPaisa AES-128-CBC encryption/decryption + payment helpers.
 *
 * SabPaisa's S2S (server-to-server) API uses AES-128-CBC with PKCS7 padding.
 * The same authKey / authIV from the SabPaisa dashboard are used for both
 * encrypting outbound requests and decrypting inbound responses.
 *
 * Flow:
 *   collect  → buildSabPaisaEncData  → encrypted form POST to SabPaisa
 *   status   → querySabPaisaStatus   → encrypted POST to status API, decrypt response
 *   callback → decryptSabPaisaResponse → decrypt encResponse from SabPaisa
 */
import { createCipheriv, createDecipheriv } from 'node:crypto';

// ── SabPaisa environment URLs ──────────────────────────────────────
const SABPAISA_FORM_URLS: Record<string, string> = {
  uat: 'https://secure.sabpaisa.in/SabPaisa/sabPaisaInit?v=1',
  stag: 'https://stage-securepay.sabpaisa.in/SabPaisa/sabPaisaInit?v=1',
  prod: 'https://securepay.sabpaisa.in/SabPaisa/sabPaisaInit?v=1',
};

const SABPAISA_STATUS_URL =
  'https://txnenquiry.sabpaisa.in/SPTxtnEnquiry/getTxnStatusByClientxnId';

// ── Key normalisation ──────────────────────────────────────────────
/**
 * Resolve the raw key bytes and the correct AES-CBC algorithm variant
 * from whatever string the env var contains.
 *
 * SabPaisa dashboard can give keys as:
 *   - Raw 16-char string  → AES-128-CBC (16-byte key)
 *   - Raw 32-char string  → AES-256-CBC (32-byte key)
 *   - Base64 of 16 bytes  → AES-128-CBC
 *   - Base64 of 32 bytes  → AES-256-CBC  ← CURRENT COOLIFY KEYS
 *
 * Returns { keyBuf, algo } so the cipher uses the right variant automatically.
 */
function resolveAesKey(keyStr: string): { keyBuf: Buffer; algo: 'aes-128-cbc' | 'aes-256-cbc' } {
  const utf8 = Buffer.from(keyStr, 'utf8');
  if (utf8.length === 16) return { keyBuf: utf8, algo: 'aes-128-cbc' };
  if (utf8.length === 32) return { keyBuf: utf8, algo: 'aes-256-cbc' };

  const b64 = Buffer.from(keyStr, 'base64');
  if (b64.length === 16) return { keyBuf: b64, algo: 'aes-128-cbc' };
  if (b64.length === 32) return { keyBuf: b64, algo: 'aes-256-cbc' };

  // Unexpected length — truncate/pad to 16 bytes (AES-128) using decoded bytes
  const larger = b64.length > utf8.length ? b64 : utf8;
  console.warn(
    `[sabpaisa] authKey unexpected size: utf8=${utf8.length} base64=${b64.length}. ` +
    `Truncating/padding to 16 bytes.`,
  );
  const buf = Buffer.alloc(16, 0);
  larger.copy(buf, 0, 0, Math.min(larger.length, 16));
  return { keyBuf: buf, algo: 'aes-128-cbc' };
}

/**
 * Resolve the AES-CBC IV (always 16 bytes).
 *
 * SabPaisa may store the IV as a raw 16-char string. If the env var is
 * longer (e.g. the HMAC key from the browser SDK), we try multiple approaches
 * in priority order: raw-16, base64-decoded-16, first-16-of-raw-string.
 */
function resolveAesIV(ivStr: string): Buffer {
  const utf8 = Buffer.from(ivStr, 'utf8');
  if (utf8.length === 16) return utf8;

  const b64 = Buffer.from(ivStr, 'base64');
  if (b64.length === 16) return b64;

  // Common SabPaisa pattern: the IV is the first 16 characters of the raw
  // key string (not base64 decoded), e.g. "abcdefghijklmnop..."
  const rawFirst16 = Buffer.from(ivStr.slice(0, 16), 'utf8');
  if (rawFirst16.length === 16) {
    console.warn(
      `[sabpaisa] authIV: utf8=${utf8.length} b64=${b64.length}. ` +
      `Using first 16 raw chars.`,
    );
    return rawFirst16;
  }

  // Last resort: first 16 bytes of the base64-decoded value
  const buf = Buffer.alloc(16, 0);
  const larger = b64.length > utf8.length ? b64 : utf8;
  larger.copy(buf, 0, 0, 16);
  return buf;
}

// ── AES-CBC encrypt / decrypt (auto-selects 128 or 256) ───────────

function cbcEncrypt(
  keyStr: string,
  ivStr: string,
  plaintext: string,
  outFormat: 'hex' | 'base64' = 'hex',
): string {
  const { keyBuf, algo } = resolveAesKey(keyStr);
  const ivBuf = resolveAesIV(ivStr);

  console.log(
    `[sabpaisa-crypto] encrypt algo=${algo} keyLen=${keyBuf.length} ` +
    `ivLen=${ivBuf.length} outFmt=${outFormat} ` +
    `keyHex=${keyBuf.toString('hex').slice(0, 16)}... ` +
    `ivHex=${ivBuf.toString('hex')}`,
  );

  const cipher = createCipheriv(algo, keyBuf, ivBuf);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return outFormat === 'base64'
    ? enc.toString('base64')
    : enc.toString('hex').toUpperCase();
}

function cbcDecrypt(keyStr: string, ivStr: string, ciphertext: string): string {
  const { keyBuf, algo } = resolveAesKey(keyStr);
  const ivBuf = resolveAesIV(ivStr);

  console.log(
    `[sabpaisa-crypto] decrypt algo=${algo} keyLen=${keyBuf.length} ivLen=${ivBuf.length}`,
  );

  const trimmed = ciphertext.trim().replace(/\s+/g, '');
  const isHex = /^[0-9a-fA-F]+$/.test(trimmed);
  const buf = isHex
    ? Buffer.from(trimmed, 'hex')
    : Buffer.from(trimmed, 'base64');

  const decipher = createDecipheriv(algo, keyBuf, ivBuf);
  const dec = Buffer.concat([decipher.update(buf), decipher.final()]);
  return dec.toString('utf8');
}

// Aliases kept for readability at call sites
const cbc128Encrypt = cbcEncrypt;
const cbc128Decrypt = cbcDecrypt;

// ── Public API ─────────────────────────────────────────────────────

export interface SabPaisaConfig {
  clientCode: string;
  transUserName: string;
  transUserPassword: string;
  authKey: string; // plain string from SabPaisa dashboard (16-char raw or base64)
  authIV: string;  // plain string from SabPaisa dashboard (16-char raw or base64)
  env: string;     // 'uat' | 'stag' | 'prod'
}

export interface SabPaisaPaymentParams {
  clientTxnId: string;
  amount: number;     // in rupees
  payerName: string;
  payerEmail: string;
  payerMobile: string;
  callbackUrl: string;
}

/**
 * Build the AES-128-CBC encrypted `encData` payload for SabPaisa's
 * form-POST endpoint and return it together with the form action URL.
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
    // SabPaisa form field names (confirmed from browser SDK + S2S spec)
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

  const encData = cbc128Encrypt(config.authKey, config.authIV, qs.toString());
  const formActionUrl =
    SABPAISA_FORM_URLS[config.env.toLowerCase()] ?? SABPAISA_FORM_URLS['stag'];

  return { encData, formActionUrl };
}

/**
 * Query SabPaisa's transaction status API for a given clientTxnId.
 *
 * Encrypts the request with AES-128-CBC, POSTs to the enquiry endpoint,
 * then decrypts the response (same algorithm).
 *
 * Returns the decoded key/value fields from SabPaisa's response.
 */
/**
 * POST to SabPaisa status API with a given statusTransEncData value.
 * Returns { status, body } so the caller can decide what to do.
 */
async function postSabPaisaStatus(
  clientCode: string,
  statusTransEncData: string,
  label: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  console.log(
    `[sabpaisa-status] attempt fmt=${label} encData=${statusTransEncData.slice(0, 50)}...`,
  );
  const resp = await fetch(SABPAISA_STATUS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ clientCode, statusTransEncData }),
  });
  const body = await resp.text();
  console.log(`[sabpaisa-status] fmt=${label} HTTP ${resp.status} raw=${body.slice(0, 200)}`);
  return { ok: resp.ok, status: resp.status, body };
}

/**
 * Parse the raw response body from the SabPaisa status API.
 *
 * SabPaisa can respond with:
 *   - JSON containing an `encResponse` field → decrypt with AES-CBC, then parse as QS
 *   - Plain JSON object (all fields already decoded)
 *   - URL-encoded query string directly (rare / some UAT environments)
 */
function parseSabPaisaStatusBody(
  config: SabPaisaConfig,
  rawBody: string,
  label: string,
): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    // Some SabPaisa environments return URL-encoded plaintext directly
    try {
      const qs = Object.fromEntries(new URLSearchParams(rawBody));
      console.log(`[sabpaisa-status] fmt=${label} parsed as QS: ${Object.keys(qs).join(',')}`);
      return qs;
    } catch {
      throw new Error(
        `SabPaisa status API non-JSON, non-QS response: ${rawBody.slice(0, 100)}`,
      );
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(
      `Unexpected SabPaisa status response shape: ${rawBody.slice(0, 100)}`,
    );
  }

  const obj = parsed as Record<string, unknown>;

  // If there's an encResponse field, decrypt it with the same AES-CBC key
  if (typeof obj['encResponse'] === 'string' && obj['encResponse'].trim()) {
    const decrypted = cbc128Decrypt(config.authKey, config.authIV, obj['encResponse']);
    console.log(`[sabpaisa-status] fmt=${label} decrypted encResponse=${decrypted.slice(0, 200)}`);
    return Object.fromEntries(new URLSearchParams(decrypted));
  }

  // Plain JSON — normalize all values to strings
  const result = Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, v == null ? '' : String(v)]),
  );
  console.log(`[sabpaisa-status] fmt=${label} plain JSON fields=${Object.keys(result).join(',')}`);
  return result;
}

export async function querySabPaisaStatus(
  config: SabPaisaConfig,
  clientTxnId: string,
): Promise<Record<string, string>> {
  const plaintext = `clientCode=${config.clientCode}&clientTxnId=${clientTxnId}`;

  // Try both output formats — SabPaisa S2S may expect base64 or hex
  // depending on dashboard/environment configuration.
  const attempts: Array<{ encData: string; label: string }> = [
    {
      encData: cbc128Encrypt(config.authKey, config.authIV, plaintext, 'base64'),
      label: 'base64',
    },
    {
      encData: cbc128Encrypt(config.authKey, config.authIV, plaintext, 'hex'),
      label: 'hex',
    },
  ];

  let lastError = '';

  for (const { encData, label } of attempts) {
    const result = await postSabPaisaStatus(config.clientCode, encData, label);

    if (result.ok) {
      return parseSabPaisaStatusBody(config, result.body, label);
    }

    lastError = `HTTP ${result.status}: ${result.body.slice(0, 100)}`;

    // Only try the next format if SabPaisa explicitly complained about
    // the encData format — otherwise a different error won't be fixed by retrying.
    if (!result.body.toLowerCase().includes('statusTransEncData'.toLowerCase())) break;
  }

  throw new Error(`SabPaisa status API failed — ${lastError}`);
}

/**
 * Decrypt the `encResponse` query-param that SabPaisa appends to the
 * callback redirect URL (browser GET) or POSTs in the callback body.
 */
export function decryptSabPaisaResponse(
  config: SabPaisaConfig,
  encResponse: string,
): Record<string, string> {
  // Express URL-decodes '+' as space — restore it before decryption
  const cleaned = encResponse.replace(/ /g, '+');
  console.log(
    `[sabpaisa-decrypt] len=${cleaned.length} sample=${cleaned.slice(0, 40)}`,
  );
  const plaintext = cbc128Decrypt(config.authKey, config.authIV, cleaned);
  return Object.fromEntries(new URLSearchParams(plaintext));
}

/**
 * Resolve a normalised payment status from any SabPaisa response object.
 * Works for both status API responses and callback decrypted payloads.
 */
export function resolveSabPaisaStatus(
  response: Record<string, string>,
): 'success' | 'failed' | 'pending' {
  const statusFields = [
    'status', 'txnStatus', 'paymentStatus', 'spRespStatus',
    'responseStatus', 'txn_status', 'payment_status',
    'responseCode', 'spRespCode', 'transStatus',
  ];
  const messageFields = [
    'message', 'statusMessage', 'responseMessage',
    'spRespMessage', 'statusDesc', 'txnMessage',
  ];

  const getFirst = (keys: string[]) => {
    for (const k of keys) {
      const val = response[k] ?? response[k.toLowerCase()];
      if (val && val.trim()) return val;
    }
    return '';
  };

  const combined =
    `${getFirst(statusFields)} ${getFirst(messageFields)}`.toLowerCase();

  const successWords = [
    'success', 'successful', 'succeeded', 'captured',
    'completed', 'approved', 'paid', '0300',
  ];
  const failedWords = [
    'fail', 'failed', 'failure', 'declined',
    'cancelled', 'canceled', 'aborted', 'error', 'invalid',
  ];

  if (successWords.some((w) => combined.includes(w))) return 'success';
  if (failedWords.some((w) => combined.includes(w))) return 'failed';
  return 'pending';
}
