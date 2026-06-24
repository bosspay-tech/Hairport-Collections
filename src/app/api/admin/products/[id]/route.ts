import { NextResponse } from "next/server";
import { unauthorizedResponse, verifyAdmin } from "@/lib/admin-auth";
import { getServiceClient } from "@/lib/supabase/service";

const STORE_ID = process.env.STORE_ID || "all-store";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const user = await verifyAdmin(request);
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;
  const db = getServiceClient();

  const { data, error } = await db
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("store_id", STORE_ID)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json({ product: data });
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await verifyAdmin(request);
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (!title) {
      return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 });
    }
    updates.title = title;
  }

  if (body.description !== undefined) {
    updates.description = body.description ? String(body.description).trim() : null;
  }

  if (body.base_price !== undefined) {
    const basePrice = Number(body.base_price);
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      return NextResponse.json({ error: "Invalid base price" }, { status: 400 });
    }
    updates.base_price = basePrice;
  }

  if (body.mrp !== undefined) {
    const mrp = body.mrp != null && body.mrp !== "" ? Number(body.mrp) : null;
    updates.mrp = mrp != null && Number.isFinite(mrp) ? mrp : null;
  }

  if (body.image_url !== undefined) {
    updates.image_url = body.image_url ? String(body.image_url).trim() : null;
  }

  if (body.categories !== undefined) {
    updates.categories = Array.isArray(body.categories)
      ? body.categories.map(String)
      : String(body.categories ?? "")
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
  }

  if (body.badge !== undefined) {
    updates.badge = body.badge ? String(body.badge).trim() : null;
  }

  if (body.rating !== undefined) {
    const rating =
      body.rating != null && body.rating !== "" ? Number(body.rating) : null;
    updates.rating = rating != null && Number.isFinite(rating) ? rating : null;
  }

  if (body.is_active !== undefined) {
    updates.is_active = Boolean(body.is_active);
  }

  const db = getServiceClient();
  const { data, error } = await db
    .from("products")
    .update(updates)
    .eq("id", id)
    .eq("store_id", STORE_ID)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ product: data });
}

export async function DELETE(request: Request, context: RouteContext) {
  const user = await verifyAdmin(request);
  if (!user) return unauthorizedResponse();

  const { id } = await context.params;
  const db = getServiceClient();

  const { error } = await db
    .from("products")
    .delete()
    .eq("id", id)
    .eq("store_id", STORE_ID);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
