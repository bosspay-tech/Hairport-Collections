/**
 * SabPaisa's hosted checkout treats missing / obviously-placeholder payer info
 * as a hard failure (the TxnEnquiry API returns `payerName=" "`,
 * `payerEmail="NA"`, `payerMobile="null"` and never transitions out of
 * pending). Every BossPay-routed collect hitting this bridge has no real
 * customer context, so we seed each init with a random remix from a pool
 * of real-looking Indian first/last names, 10-digit mobiles and email
 * addresses.
 *
 * The pool is loaded once at module init from `customer-pool.json`. The
 * three arrays are sampled INDEPENDENTLY per `randomCustomerProfile()` call
 * so we don't repeatedly ship the same identity to SabPaisa — this is a
 * pure smoke-screen against their anti-fraud heuristics, not user data in
 * any PII sense (the txn still resolves to the BossPay merchant that
 * initiated the collect).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve the JSON relative to this TS file at BOTH `src/customer-pool.ts`
// (tsx / dev) and `dist/customer-pool.js` (compiled). The Dockerfile's build
// step copies the JSON alongside the compiled `.js` (see notes below).
const HERE = dirname(fileURLToPath(import.meta.url));
const poolPath = resolve(HERE, './customer-pool.json');

interface Pool {
  names: string[];
  mobiles: string[];
  emails: string[];
}

const POOL = JSON.parse(readFileSync(poolPath, 'utf8')) as Pool;

if (!Array.isArray(POOL.names) || POOL.names.length === 0) {
  throw new Error('[customer-pool] names array is empty');
}
if (!Array.isArray(POOL.mobiles) || POOL.mobiles.length === 0) {
  throw new Error('[customer-pool] mobiles array is empty');
}
if (!Array.isArray(POOL.emails) || POOL.emails.length === 0) {
  throw new Error('[customer-pool] emails array is empty');
}

console.log(
  `[customer-pool] loaded names=${POOL.names.length} ` +
    `mobiles=${POOL.mobiles.length} emails=${POOL.emails.length}`,
);

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export interface CustomerProfile {
  firstName: string;
  lastName: string;
  /** Convenience `${firstName} ${lastName}` for logging only — never pass
   *  this combined string to SabPaisa's `payerFirstName` field. */
  fullName: string;
  email: string;
  mobile: string;
}

export function randomCustomerProfile(): CustomerProfile {
  const firstName = pick(POOL.names);
  let lastName = pick(POOL.names);
  // Avoid `First First`: resample once if we picked the same name twice.
  if (lastName === firstName && POOL.names.length > 1) lastName = pick(POOL.names);
  return {
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    email: pick(POOL.emails),
    mobile: pick(POOL.mobiles),
  };
}
