/**
 * Copy products from Hairport-Collections Supabase → new-hairport Supabase.
 *
 * Reads OLD credentials from ../Hairport-Collections/.env automatically.
 * Run: npm run db:migrate
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const oldEnvPath = path.join(root, "..", "Hairport-Collections", ".env");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );
}

const env = { ...loadEnv(path.join(root, ".env")), ...process.env };
const oldEnv = loadEnv(oldEnvPath);

const newUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const newKey = env.SUPABASE_SERVICE_ROLE_KEY;

const oldUrl =
  env.OLD_SUPABASE_URL || oldEnv.VITE_SUPABASE_URL || oldEnv.NEXT_PUBLIC_SUPABASE_URL;
const oldKey =
  env.OLD_SUPABASE_SERVICE_ROLE_KEY ||
  env.OLD_SUPABASE_ANON_KEY ||
  oldEnv.VITE_SUPABASE_PUBLISHABLE_KEY ||
  oldEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const STORE_ID = env.STORE_ID || "all-store";
const BATCH_SIZE = 100;

if (!newUrl || !newKey) {
  console.error("Missing NEW Supabase credentials in new-hairport/.env");
  process.exit(1);
}

if (!oldUrl || !oldKey) {
  console.error(
    "Missing OLD Supabase credentials.\n" +
      "Add them to Hairport-Collections/.env or set OLD_SUPABASE_URL in new-hairport/.env",
  );
  process.exit(1);
}

const newDb = createClient(newUrl, newKey);
const oldDb = createClient(oldUrl, oldKey);

async function ensureSchema() {
  const { error } = await newDb.from("products").select("id").limit(1);
  if (error) {
    console.error(
      "Products table not found in NEW Supabase.\n" +
        "Run: npm run db:schema\n" +
        "Or paste supabase/schema.sql into Supabase SQL Editor.",
    );
    process.exit(1);
  }
}

async function fetchAllOldProducts() {
  const all = [];
  let from = 0;

  while (true) {
    const { data, error } = await oldDb
      .from("products")
      .select("*")
      .eq("store_id", STORE_ID)
      .order("created_at", { ascending: true })
      .range(from, from + BATCH_SIZE - 1);

    if (error) {
      console.error("Failed to read old products:", error.message);
      process.exit(1);
    }

    if (!data?.length) break;
    all.push(...data);
    if (data.length < BATCH_SIZE) break;
    from += BATCH_SIZE;
    process.stdout.write(`\rFetched ${all.length} products...`);
  }

  console.log(`\nFound ${all.length} products in old database.`);
  return all;
}

async function migrateProducts(products) {
  const { count } = await newDb
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("store_id", STORE_ID);

  if ((count ?? 0) > 0) {
    console.log(`New database already has ${count} products. Clearing store products first...`);
    const { error: deleteError } = await newDb
      .from("products")
      .delete()
      .eq("store_id", STORE_ID);
    if (deleteError) {
      console.error("Could not clear existing products:", deleteError.message);
      process.exit(1);
    }
  }

  let inserted = 0;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE).map((product) => ({
      store_id: product.store_id || STORE_ID,
      title: product.title,
      description: product.description,
      base_price: product.base_price,
      mrp: product.mrp,
      image_url: product.image_url,
      categories: product.categories,
      badge: product.badge,
      rating: product.rating,
      is_active: product.is_active ?? true,
      created_at: product.created_at,
      updated_at: product.updated_at || product.created_at,
    }));

    const { error } = await newDb.from("products").insert(batch);
    if (error) {
      console.error(`Insert failed at batch ${i}:`, error.message);
      process.exit(1);
    }

    inserted += batch.length;
    process.stdout.write(`\rInserted ${inserted}/${products.length}...`);
  }

  console.log(`\nMigrated ${inserted} products to new Supabase.`);
}

await ensureSchema();
const products = await fetchAllOldProducts();

if (!products.length) {
  console.log("Nothing to migrate.");
  process.exit(0);
}

await migrateProducts(products);
