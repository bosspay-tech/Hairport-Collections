import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SAMPLE_PRODUCTS = [
  {
    title: "Salon Repair Shampoo",
    description: "Gentle cleanse for damaged hair with keratin and argan oil.",
    base_price: 499,
    mrp: 699,
    categories: ["hair-care"],
    badge: "Best Seller",
    rating: 4.6,
    image_url:
      "https://images.unsplash.com/photo-1717160675489-7779f2c91999?q=80&w=1200&auto=format&fit=crop",
  },
  {
    title: "Silk Smooth Conditioner",
    description: "Deep moisture lock for frizz-free, salon-smooth finish.",
    base_price: 549,
    mrp: 749,
    categories: ["hair-care"],
    badge: "Trending",
    rating: 4.5,
    image_url:
      "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?q=80&w=1200&auto=format&fit=crop",
  },
  {
    title: "Hydrating Face Moisturizer",
    description: "Lightweight daily moisturizer for soft, radiant skin.",
    base_price: 699,
    mrp: 899,
    categories: ["skin-care"],
    badge: "New",
    rating: 4.7,
    image_url:
      "https://plus.unsplash.com/premium_photo-1674739375749-7efe56fc8bbb?q=80&w=1200&auto=format&fit=crop",
  },
  {
    title: "Vitamin C Glow Serum",
    description: "Brightening serum for even tone and healthy glow.",
    base_price: 899,
    mrp: 1199,
    categories: ["skin-care"],
    badge: "Pro Pick",
    rating: 4.8,
    image_url:
      "https://images.unsplash.com/photo-1596755389378-c31d21fd1273?q=80&w=1200&auto=format&fit=crop",
  },
  {
    title: "Hair Repair Mask",
    description: "Weekly treatment mask for strength, shine, and repair.",
    base_price: 649,
    mrp: 849,
    categories: ["treatments", "hair-care"],
    badge: "Salon Grade",
    rating: 4.4,
    image_url:
      "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?q=80&w=1200&auto=format&fit=crop",
  },
  {
    title: "Scalp Nourish Oil",
    description: "Lightweight oil blend for scalp health and hair growth support.",
    base_price: 599,
    mrp: 799,
    categories: ["treatments", "new-arrivals"],
    badge: "New Arrival",
    rating: 4.3,
    image_url:
      "https://plus.unsplash.com/premium_photo-1729291859746-be07b464bccf?q=80&w=1200&auto=format&fit=crop",
  },
];

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  const db = createClient(url, key);
  const { count, error: countError } = await db
    .from("products")
    .select("*", { count: "exact", head: true });

  if (countError) {
    return NextResponse.json(
      {
        error:
          "Products table not found. Run supabase/schema.sql in Supabase SQL Editor first.",
        details: countError.message,
      },
      { status: 400 },
    );
  }

  if ((count ?? 0) > 0) {
    return NextResponse.json({ ok: true, message: `Already has ${count} products` });
  }

  const rows = SAMPLE_PRODUCTS.map((product) => ({
    ...product,
    is_active: true,
  }));

  const { error } = await db.from("products").insert(rows);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inserted: rows.length });
}
