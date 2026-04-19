/**
 * Server-side SabPaisa encryption/decryption + payment URL generation.
 * Ported from sabpaisa-pg-dev (browser SDK) to work in Node.js 18+.
 *
 * Uses Node's built-in crypto module (not webcrypto) for clean type compat.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const IV_SIZE = 12;
const TAG_SIZE = 16;
const HMAC_LENGTH = 48; // SHA-384 = 48 bytes

// ── SabPaisa environment URLs ──────────────────────────────────────
const SABPAISA_URLS: Record<string, string> = {
  uat: 'https://secure.sabpaisa.in/SabPaisa/sabPaisaInit?v=1',
  stag: 'https://stage-securepay.sabpaisa.in/SabPaisa/sabPaisaInit?v=1',
  prod: 'https://securepay.sabpaisa.in/SabPaisa/sabPaisaInit?v=1',
};

function getPaymentUrl(env: string): string {
  return SABPAISA_URLS[env] ?? SABPAISA_URLS['stag'];
}

// ── Helpers ────────────────────────────────────────────────────────
function bytesToHex(buf: Buffer): string {
  return buf.toString('hex').toUpperCase();
}

function hexToBuffer(hex: string): Buffer {
  return Buffer.from(hex, 'hex');
}

// ── AES-256-GCM + HMAC-SHA384 (same algorithm as sabpaisa-pg-dev) ─

function encrypt(aesKeyBase64: string, hmacKeyBase64: string, plaintext: string): string {
  const aesKey = Buffer.from(aesKeyBase64, 'base64');
  const hmacKey = Buffer.from(hmacKeyBase64, 'base64');

  const iv = randomBytes(IV_SIZE);

  const cipher = createCipheriv('aes-256-gcm', aesKey, iv, { authTagLength: TAG_SIZE });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // encryptedMessage = iv + ciphertext + authTag
  const encryptedMessage = Buffer.concat([iv, encrypted, authTag]);

  // HMAC-SHA384 over the encryptedMessage
  const hmac = createHmac('sha384', hmacKey).update(encryptedMessage).digest();

  // final = hmac + encryptedMessage
  const finalBuffer = Buffer.concat([hmac, encryptedMessage]);
  return bytesToHex(finalBuffer);
}

function decrypt(aesKeyBase64: string, hmacKeyBase64: string, hexCipherText: string): string {
  const aesKey = Buffer.from(aesKeyBase64, 'base64');
  const hmacKey = Buffer.from(hmacKeyBase64, 'base64');
  const fullMessage = hexToBuffer(hexCipherText);

  if (fullMessage.length < HMAC_LENGTH + IV_SIZE + TAG_SIZE) {
    throw new Error('Invalid ciphertext length');
  }

  const hmacReceived = fullMessage.subarray(0, HMAC_LENGTH);
  const encryptedData = fullMessage.subarray(HMAC_LENGTH);

  // Verify HMAC
  const hmacComputed = createHmac('sha384', hmacKey).update(encryptedData).digest();
  if (!timingSafeEqual(hmacReceived, hmacComputed)) {
    throw new Error('HMAC validation failed — data may be tampered');
  }

  const iv = encryptedData.subarray(0, IV_SIZE);
  const cipherTextWithTag = encryptedData.subarray(IV_SIZE);

  // AES-GCM: last TAG_SIZE bytes are the auth tag
  const cipherText = cipherTextWithTag.subarray(0, cipherTextWithTag.length - TAG_SIZE);
  const authTag = cipherTextWithTag.subarray(cipherTextWithTag.length - TAG_SIZE);

  const decipher = createDecipheriv('aes-256-gcm', aesKey, iv, { authTagLength: TAG_SIZE });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
  return decrypted.toString('utf-8');
}

// ── Public API ─────────────────────────────────────────────────────

export interface SabPaisaConfig {
  clientCode: string;
  transUserName: string;
  transUserPassword: string;
  authKey: string;   // base64 AES key
  authIV: string;    // base64 HMAC key
  env: string;       // 'uat' | 'stag' | 'prod'
}

export interface SabPaisaPaymentParams {
  clientTxnId: string;
  amount: number;
  payerName: string;
  payerEmail: string;
  payerMobile: string;
  callbackUrl: string;
  channelId?: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
}

/**
 * Build the encrypted `encData` payload and return it along with the
 * SabPaisa form-post URL. The bridge serves an auto-submitting HTML
 * page at `/pay/:pgTxnId` so that the redirect works.
 */
export function buildSabPaisaEncData(
  config: SabPaisaConfig,
  params: SabPaisaPaymentParams,
): { encData: string; formActionUrl: string } {
  const qs = new URLSearchParams({
    payerName: params.payerName,
    payerEmail: params.payerEmail,
    payerMobile: params.payerMobile,
    clientTxnId: params.clientTxnId,
    amount: String(params.amount),
    clientCode: config.clientCode,
    transUserName: config.transUserName,
    transUserPassword: config.transUserPassword,
    callbackUrl: params.callbackUrl,
    channelId: params.channelId ?? 'npm',
    udf1: params.udf1 ?? '',
    udf2: params.udf2 ?? '',
    udf3: params.udf3 ?? '',
    udf4: params.udf4 ?? '',
    udf5: params.udf5 ?? '',
  });

  const encData = encrypt(config.authKey, config.authIV, qs.toString());
  const formActionUrl = getPaymentUrl(config.env.toLowerCase());

  return { encData, formActionUrl };
}

/**
 * Decrypt the `encResponse` query-param that SabPaisa appends
 * when redirecting back to the callback URL.
 */
export function decryptSabPaisaResponse(
  config: SabPaisaConfig,
  encResponse: string,
): Record<string, string> {
  // Restore + signs that Express URL-decodes to spaces
  const cleaned = encResponse.replace(/ /g, '+');

  // Detect encoding: pure hex contains only 0-9 a-f A-F.
  // If the response has +, /, or = it is base64 — convert to hex first
  // so the decrypt function (which expects a hex string) works correctly.
  const isHex = /^[0-9a-fA-F]+$/.test(cleaned);
  const hexString = isHex
    ? cleaned
    : Buffer.from(cleaned, 'base64').toString('hex');

  console.log(
    `[sabpaisa-decrypt] encoding=${isHex ? 'hex' : 'base64'} len=${cleaned.length} sample=${cleaned.slice(0, 40)}`,
  );

  const plaintext = decrypt(config.authKey, config.authIV, hexString);
  return Object.fromEntries(new URLSearchParams(plaintext));
}

/**
 * Resolve the payment status from a decrypted SabPaisa response.
 */
export function resolveSabPaisaStatus(
  response: Record<string, string>,
): 'success' | 'failed' | 'pending' {
  const statusFields = [
    'status', 'txnStatus', 'paymentStatus', 'spRespStatus',
    'responseStatus', 'txn_status', 'payment_status',
    'responseCode', 'spRespCode',
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

  const combined = `${getFirst(statusFields)} ${getFirst(messageFields)}`.toLowerCase();

  const successWords = ['success', 'successful', 'succeeded', 'captured', 'completed', 'approved', 'paid', '0300'];
  const failedWords = ['fail', 'failed', 'failure', 'declined', 'cancelled', 'canceled', 'aborted', 'error', 'invalid'];

  if (successWords.some((w) => combined.includes(w))) return 'success';
  if (failedWords.some((w) => combined.includes(w))) return 'failed';
  return 'pending';
}
