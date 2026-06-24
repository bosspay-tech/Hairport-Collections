import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(root, ".env"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }),
);

const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const password = env.SUPABASE_DB_PASSWORD;
const regions = [
  "ap-south-1",
  "ap-southeast-1",
  "us-east-1",
  "us-west-1",
  "eu-west-1",
  "eu-central-1",
  "ap-northeast-1",
  "ap-southeast-2",
  "ca-central-1",
  "sa-east-1",
];

for (const region of regions) {
  const host = `aws-0-${region}.pooler.supabase.com`;
  const connectionString = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:6543/postgres`;
  try {
    const db = postgres(connectionString, {
      ssl: "require",
      max: 1,
      connect_timeout: 8,
    });
    const rows = await db`select 1 as ok`;
    console.log("CONNECTED", region, rows);
    await db.end();
    process.exit(0);
  } catch (error) {
    console.log("fail", region, error.message.split("\n")[0]);
  }
}

process.exit(1);
