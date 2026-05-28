import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// ── Config ─────────────────────────────────────────────────────────────────
//
// Portal field mapping (the part that trips people up):
//   Portal label    →   Field here
//   ─────────────────────────────────────────────
//   MID             →   merchantId
//   Client ID       →   clientId
//   Secret Key      →   clientSecret   (32 hex chars)
//   Username        →   username
//   Password        →   password
//   API Key         →   apiKey         (used for privatekey only, NOT for OAuth)
//
export interface AirpayConfig {
  merchantId: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  apiKey: string;
  payUrl: string;    // https://payments.airpay.co.in/pay/v4/
  oauthUrl: string;  // https://kraken.airpay.co.in/airpay/pay/v4/api/oauth2
  verifyUrl: string;
  successUrl: string;
  failureUrl: string;
  domain: string;    // merchant public domain, e.g. https://www.hairportcollections.com
}

export function validateAirpayConfig(config: Partial<AirpayConfig>): string[] {
  const required: (keyof AirpayConfig)[] = [
    'merchantId',
    'clientId',
    'clientSecret',
    'username',
    'password',
    'apiKey',
  ];
  return required.filter((k) => !config[k]);
}

// ── Crypto helpers (from official airpay-v4-oauth-sample.mjs) ─────────────

// AirPay servers run in IST — use IST date so their date('Y-m-d') check matches.
function todayInIst(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function md5Hex(s: string): string {
  return createHash('md5').update(s, 'utf8').digest('hex');
}

// key = md5(username.trim() + "~:~" + password.trim()) → 32 ASCII hex chars
function computeAesKey(config: AirpayConfig): string {
  return md5Hex(`${config.username.trim()}~:~${config.password.trim()}`);
}

// iv = bin2hex(randomBytes(8)) → 16 ASCII hex chars
// wire format: iv(16 ASCII) + base64(ciphertext)
function encryptAes256Cbc(plaintext: string, asciiKey32: string): string {
  if (asciiKey32.length !== 32) {
    throw new Error(`AirPay key must be 32 ASCII chars (got ${asciiKey32.length})`);
  }
  const iv = randomBytes(8).toString('hex'); // 16 ASCII hex chars
  const cipher = createCipheriv(
    'aes-256-cbc',
    Buffer.from(asciiKey32, 'utf8'),
    Buffer.from(iv, 'utf8'),
  );
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return iv + ct.toString('base64');
}

function decryptAes256Cbc(wire: string, asciiKey32: string): string {
  if (wire.length <= 16) throw new Error('AirPay ciphertext too short to contain iv + body');
  const iv = wire.slice(0, 16);
  const ctBase64 = wire.slice(16);
  const decipher = createDecipheriv(
    'aes-256-cbc',
    Buffer.from(asciiKey32, 'utf8'),
    Buffer.from(iv, 'utf8'),
  );
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctBase64, 'base64')),
    decipher.final(),
  ]);
  return pt.toString('utf8');
}

// sha256(ksort values concatenated + IST date)
function sortValuesSha256(payload: Record<string, string>, dateStr: string): string {
  const concat = Object.keys(payload)
    .sort()
    .map((k) => payload[k])
    .join('');
  return createHash('sha256').update(concat + dateStr, 'utf8').digest('hex');
}

// ── OAuth2 token ───────────────────────────────────────────────────────────

export interface AirpayTokenResult {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string | null;
}

export async function getAirpayAccessToken(
  config: AirpayConfig,
): Promise<AirpayTokenResult> {
  const oauthUrl = config.oauthUrl.replace(/\/$/, '');
  const key = computeAesKey(config);

  const body = {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'client_credentials',
    merchant_id: config.merchantId,
  };

  const encdata = encryptAes256Cbc(JSON.stringify(body), key);
  const checksum = sortValuesSha256(body, todayInIst());
  const form = new URLSearchParams({ merchant_id: config.merchantId, encdata, checksum });

  console.log('[airpay-oauth] POST', oauthUrl);
  const response = await fetch(oauthUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: form.toString(),
    signal: AbortSignal.timeout(15_000),
  });

  const rawBody = await response.text();
  console.log('[airpay-oauth] HTTP', response.status, rawBody.slice(0, 300));

  if (!response.ok) {
    throw new Error(`AirPay OAuth HTTP ${response.status}: ${rawBody.slice(0, 200)}`);
  }

  let envelope: Record<string, unknown> = {};
  try {
    envelope = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw new Error(`AirPay OAuth response not JSON: ${rawBody.slice(0, 200)}`);
  }

  const cipherText = String(envelope['response'] ?? '').trim();
  if (!cipherText) {
    throw new Error(`AirPay OAuth: missing "response" field. Raw: ${rawBody.slice(0, 200)}`);
  }

  let parsed: Record<string, unknown> = {};
  try {
    const plain = decryptAes256Cbc(cipherText, key);
    console.log('[airpay-oauth] decrypted:', plain.slice(0, 200));
    parsed = JSON.parse(plain) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`AirPay OAuth decrypt/parse failed: ${err}`);
  }

  const data = (parsed['data'] ?? {}) as Record<string, unknown>;
  const token = String(data['access_token'] ?? '').trim();
  if (!token) {
    const msg = String(parsed['message'] ?? JSON.stringify(parsed)).slice(0, 200);
    throw new Error(`AirPay OAuth: no access_token in response. Server: ${msg}`);
  }

  return {
    access_token: token,
    expires_in: Number(data['expires_in'] ?? 360),
    token_type: String(data['token_type'] ?? 'Bearer'),
    scope: data['scope'] != null ? String(data['scope']) : null,
  };
}

// ── Payment form fields ────────────────────────────────────────────────────

export interface AirpayV4FormFields {
  encdata: string;
  checksum: string;
  merchant_id: string;
  privatekey: string;
  mer_dom: string;
}

// privatekey = sha256(apiKey@username:|:password)
export function computeAirpayPrivateKey(config: AirpayConfig): string {
  return createHash('sha256')
    .update(`${config.apiKey}@${config.username}:|:${config.password}`)
    .digest('hex');
}

function extractProtoDomain(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    const idx = url.indexOf('//');
    if (idx >= 0) {
      const rest = url.substring(idx + 2);
      const slash = rest.indexOf('/');
      return url.substring(0, idx + 2 + (slash >= 0 ? slash : rest.length));
    }
    return url;
  }
}

export async function buildAirpayV4Fields(
  config: AirpayConfig,
  params: {
    buyerEmail: string;
    buyerPhone: string;
    buyerFirstName: string;
    buyerLastName: string;
    buyerAddress: string;
    buyerCity: string;
    buyerState: string;
    buyerCountry: string;
    buyerPinCode: string;
    amount: number;
    orderid: string;
  },
): Promise<{ fields: AirpayV4FormFields; payUrl: string }> {
  const amount = params.amount.toFixed(2);

  // Step 1: OAuth token
  const { access_token } = await getAirpayAccessToken(config);

  // Step 2: JSON payload — alphabetical key order (matters for ksort checksum)
  const jsonPayload: Record<string, string> = {
    amount,
    app_intent: 'N',
    buyer_address: params.buyerAddress,
    buyer_city: params.buyerCity,
    buyer_country: params.buyerCountry === 'India' ? 'IN' : params.buyerCountry,
    buyer_email: params.buyerEmail,
    buyer_firstname: params.buyerFirstName,
    buyer_lastname: params.buyerLastName,
    buyer_phone: params.buyerPhone,
    buyer_pincode: params.buyerPinCode,
    buyer_state: params.buyerState,
    currency_code: '356',
    failureurl: config.failureUrl,
    iso_currency: 'INR',
    orderid: params.orderid,
    sb_amount: '0',
    successurl: config.successUrl,
    upi_intent: 'N',
  };

  // Step 3: checksum + encrypt
  const key = computeAesKey(config);
  const date = todayInIst();
  const checksum = sortValuesSha256(jsonPayload, date);
  const encdata = encryptAes256Cbc(JSON.stringify(jsonPayload), key);

  // Step 4: privatekey + mer_dom
  const privatekey = computeAirpayPrivateKey(config);
  const merDom = Buffer.from(extractProtoDomain(config.domain), 'utf8').toString('base64');
  const payUrlBase = config.payUrl.replace(/\/$/, '');
  const payUrl = `${payUrlBase}/?token=${encodeURIComponent(access_token)}`;

  console.log('[airpay-v4fields] date (IST):', date);
  console.log('[airpay-v4fields] jsonPayload:', JSON.stringify(jsonPayload));
  console.log('[airpay-v4fields] checksum:', checksum);
  console.log('[airpay-v4fields] privatekey:', privatekey);
  console.log('[airpay-v4fields] mer_dom (base64):', merDom);
  console.log('[airpay-v4fields] payUrl:', payUrl);
  console.log('[airpay-v4fields] encdata (first 60):', encdata.slice(0, 60));

  return {
    fields: {
      encdata,
      checksum,
      merchant_id: config.merchantId,
      privatekey,
      mer_dom: merDom,
    },
    payUrl,
  };
}

// ── Response status ────────────────────────────────────────────────────────

const AIRPAY_STATUS_MAP: Record<string, 'success' | 'pending' | 'failed'> = {
  '200': 'success',
  '211': 'pending',
  '400': 'failed',
  '401': 'failed',
  '402': 'failed',
  '403': 'failed',
  '405': 'failed',
  '503': 'failed',
};

export function resolveAirpayStatus(
  code: string | undefined,
): 'success' | 'pending' | 'failed' {
  if (!code) return 'pending';
  return AIRPAY_STATUS_MAP[code.trim()] ?? 'pending';
}

export interface AirpayVerifyResult {
  status: 'success' | 'pending' | 'failed';
  rawStatus: string;
  message: string;
  airpayTxnId: string;
  amount: string;
  raw: Record<string, unknown>;
}

export async function verifyAirpayTransaction(
  config: AirpayConfig,
  orderid: string,
): Promise<AirpayVerifyResult> {
  const privatekey = computeAirpayPrivateKey(config);
  const body = new URLSearchParams({ mercid: config.merchantId, orderid, privatekey });

  const response = await fetch(config.verifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(15_000),
  });

  const text = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    try {
      for (const [k, v] of new URLSearchParams(text).entries()) data[k] = v;
    } catch { /* leave empty */ }
  }

  const rawStatus = String(data['TRANSACTIONSTATUS'] ?? data['STATUS'] ?? data['status'] ?? '').trim();
  const message = String(data['STATUSMSG'] ?? data['MESSAGE'] ?? data['message'] ?? '').trim();
  const airpayTxnId = String(data['APTRANSACTIONID'] ?? data['TRANSACTIONID'] ?? '').trim();
  const amount = String(data['TRANSACTIONAMT'] ?? data['amount'] ?? '').trim();

  return { status: resolveAirpayStatus(rawStatus), rawStatus, message, airpayTxnId, amount, raw: data };
}
