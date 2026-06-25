import { NextResponse } from "next/server";
import { unauthorizedResponse, verifyAdmin } from "@/lib/admin-auth";
import { getServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const user = await verifyAdmin(request);
  if (!user) return unauthorizedResponse();

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") || 10)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const db = getServiceClient();
  const { data, error, count } = await db
    .from("products")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    products: data ?? [],
    total: count ?? 0,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)),
  });
}

export async function POST(request: Request) {
  const user = await verifyAdmin(request);
  if (!user) return unauthorizedResponse();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const basePrice = Number(body.base_price);
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    return NextResponse.json({ error: "Valid base price is required" }, { status: 400 });
  }

  const mrp = body.mrp != null && body.mrp !== "" ? Number(body.mrp) : null;
  const rating =
    body.rating != null && body.rating !== "" ? Number(body.rating) : null;

  const row = {
    title,
    description: body.description ? String(body.description).trim() : null,
    base_price: basePrice,
    mrp: mrp != null && Number.isFinite(mrp) ? mrp : null,
    image_url: body.image_url ? String(body.image_url).trim() : null,
    categories: Array.isArray(body.categories)
      ? body.categories.map(String)
      : String(body.categories ?? "")
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
    badge: body.badge ? String(body.badge).trim() : null,
    rating: rating != null && Number.isFinite(rating) ? rating : null,
    is_active: body.is_active !== false,
    updated_at: new Date().toISOString(),
  };

  const db = getServiceClient();
  const { data, error } = await db.from("products").insert(row).select().single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ product: data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await verifyAdmin(request);
  if (!user) return unauthorizedResponse();

  let body: { ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.map(String).filter(Boolean)
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "No product IDs provided" }, { status: 400 });
  }

  const db = getServiceClient();
  const { error } = await db.from("products").delete().in("id", ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: ids.length });
}
