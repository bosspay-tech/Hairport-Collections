/**
 * Apply supabase/schema.sql using the database password.
 * Set SUPABASE_DB_PASSWORD in .env (from Supabase → Settings → Database).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );
}

const env = { ...loadEnv(), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const password =
  env.DATABASE_URL ||
  env.SUPABASE_DB_PASSWORD ||
  env.DB_PASSWORD ||
  env.POSTGRES_PASSWORD;

if (!url) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL in .env");
  process.exit(1);
}

if (env.DATABASE_URL) {
  try {
    const db = postgres(env.DATABASE_URL, { ssl: "require", max: 1 });
    await db.unsafe(sql);
    await db.end();
    console.log("Schema applied via DATABASE_URL");
    process.exit(0);
  } catch (error) {
    console.error("DATABASE_URL failed:", error.message);
    process.exit(1);
  }
}

if (!password) {
  console.error(
    "Set DATABASE_URL (recommended) or SUPABASE_DB_PASSWORD in .env.\n" +
      "Get it from Supabase → Settings → Database → Connection string.",
  );
  process.exit(1);
}

const ref = new URL(url).hostname.split(".")[0];
const sqlFile = path.join(root, "supabase", "schema.sql");
const sql = fs.readFileSync(sqlFile, "utf8");

const hosts = [
  `db.${ref}.supabase.co`,
  `aws-0-ap-south-1.pooler.supabase.com`,
  `aws-0-ap-southeast-1.pooler.supabase.com`,
  `aws-0-us-east-1.pooler.supabase.com`,
];

let applied = false;
let lastError = null;

for (const host of hosts) {
  const connectionString =
    host.startsWith("db.")
      ? `postgresql://postgres:${encodeURIComponent(password)}@${host}:5432/postgres`
      : `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:6543/postgres`;

  try {
    const db = postgres(connectionString, { ssl: "require", max: 1 });
    await db.unsafe(sql);
    await db.end();
    console.log(`Schema applied via ${host}`);
    applied = true;
    break;
  } catch (error) {
    lastError = error;
  }
}

if (!applied) {
  console.error("Could not apply schema automatically:", lastError?.message);
  console.error("Paste supabase/schema.sql into Supabase SQL Editor and run it manually.");
  process.exit(1);
}
