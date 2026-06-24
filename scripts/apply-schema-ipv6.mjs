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

const attempts = [
  `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`,
  `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
  `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`,
];

for (const connectionString of attempts) {
  try {
    const db = postgres(connectionString, {
      ssl: "require",
      max: 1,
      connect_timeout: 15,
    });
    await db.unsafe(sql);
    await db.end();
    console.log("Schema applied:", connectionString.replace(password, "***"));
    process.exit(0);
  } catch (error) {
    console.log("Failed:", connectionString.replace(password, "***"));
    console.log(" ", error.message.split("\n")[0]);
  }
}

process.exit(1);
