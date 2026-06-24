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
const sql = fs.readFileSync(path.join(root, "supabase", "schema.sql"), "utf8");

const prefixes = ["aws-0", "aws-1"];
const regions = [
  "ap-south-1",
  "ap-southeast-1",
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "eu-west-1",
  "eu-west-2",
  "eu-central-1",
  "ap-northeast-1",
  "ap-southeast-2",
  "ca-central-1",
  "sa-east-1",
];

for (const prefix of prefixes) {
  for (const region of regions) {
    for (const port of [5432, 6543]) {
      const host = `${prefix}-${region}.pooler.supabase.com`;
      const connectionString = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:${port}/postgres`;
      try {
        const db = postgres(connectionString, {
          ssl: "require",
          max: 1,
          connect_timeout: 6,
        });
        await db`select 1 as ok`;
        await db.unsafe(sql);
        await db.end();
        console.log("Schema applied via", host, port);
        process.exit(0);
      } catch {
        // try next
      }
    }
  }
}

console.error("Could not connect to database. Run supabase/schema.sql in SQL Editor.");
process.exit(1);
