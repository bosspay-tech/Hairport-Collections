"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ShoppingBag, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STORE_ID } from "@/config/store";
import { getProxiedImage } from "@/lib/image-proxy";
import { supabase } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/utils";
import { useCartStore } from "@/store/cart-store";
import type { Product } from "@/types";

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pincode, setPincode] = useState("");
  const [pinMessage, setPinMessage] = useState("");
  const addItem = useCartStore((s) => s.addItem);
  const items = useCartStore((s) => s.items);

  useEffect(() => {
    let alive = true;

    async function fetchProduct() {
      setLoading(true);
      setError("");

      const { data, error: fetchError } = await supabase
        .from("products")
        .select("*")
        .eq("id", params.id)
        .eq("store_id", STORE_ID)
        .single();

      if (!alive) return;

      if (fetchError) {
        setError(fetchError.message || "Failed to load product.");
        setProduct(null);
      } else {
        setProduct(data as Product);
      }
      setLoading(false);
    }

    if (params.id) fetchProduct();
    return () => {
      alive = false;
    };
  }, [params.id]);

  const qtyInCart =
    items.find((item) => item.productId === product?.id)?.quantity ?? 0;
  const price = Number(product?.base_price ?? 0);
  const mrp = Number(product?.mrp ?? 0);
  const hasDiscount = mrp > price;

  const handleAddToCart = () => {
    if (!product || product.is_active === false) return;
    addItem({
      productId: product.id,
      storeId: STORE_ID,
      title: product.title,
      price,
    });
    toast.success(
      qtyInCart > 0
        ? `Updated cart • ${qtyInCart + 1} in cart`
        : "Added to cart",
    );
  };

  const handleCheckPincode = () => {
    const valid = /^\d{6}$/.test(pincode.trim());
    setPinMessage(
      valid
        ? "Delivery available • Estimated 2–5 days • Free on orders above ₹999"
        : "Enter a valid 6-digit pincode",
    );
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl animate-pulse px-4 py-10 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2">
          <div className="aspect-4/5 rounded-3xl bg-rose-100" />
          <div className="space-y-4">
            <div className="h-8 w-2/3 rounded bg-rose-100" />
            <div className="h-4 w-full rounded bg-rose-100" />
            <div className="h-4 w-5/6 rounded bg-rose-100" />
            <div className="h-12 w-40 rounded bg-rose-100" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="rounded-3xl border border-rose-100 bg-white p-10 text-center">
          <h2 className="text-lg font-semibold text-rose-950">Product not found</h2>
          <p className="mt-2 text-sm text-rose-600">
            {error || "This product may no longer be available."}
          </p>
          <Link
            href="/products"
            className="mt-6 inline-flex rounded-2xl bg-rose-900 px-6 py-3 text-sm font-semibold text-white"
          >
            Back to products
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] bg-linear-to-b from-rose-50/60 via-white to-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-rose-600">
          <Link href="/" className="hover:text-rose-900">
            Home
          </Link>
          <span>/</span>
          <Link href="/products" className="hover:text-rose-900">
            Products
          </Link>
          <span>/</span>
          <span className="font-semibold text-rose-950">{product.title}</span>
        </div>

        <div className="grid gap-10 lg:grid-cols-2">
          <div className="overflow-hidden rounded-[2rem] border border-rose-100 bg-white shadow-sm">
            <div className="relative aspect-4/5 bg-rose-50">
              <Image
                src={getProxiedImage(product.image_url)}
                alt={product.title}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-rose-500 uppercase">
              {product.categories?.[0]?.replace("-", " ") || "Premium Collection"}
            </p>
            <h1 className="mt-3 font-display text-4xl text-rose-950 md:text-5xl">
              {product.title}
            </h1>

            <div className="mt-4 flex items-center gap-2 text-amber-500">
              {Array.from({ length: 5 }).map((_, index) => (
                <Star key={index} className="h-4 w-4 fill-current" />
              ))}
              <span className="text-sm font-semibold text-rose-950">4.4</span>
              <span className="text-sm text-rose-600">(128 reviews)</span>
            </div>

            <p className="mt-5 text-sm leading-7 text-rose-700">
              {product.description ||
                "Explore salon-grade care designed for everyday radiance and long-lasting results."}
            </p>

            <div className="mt-6 flex items-end gap-3">
              {hasDiscount ? (
                <span className="text-sm text-rose-400 line-through">
                  {formatMoney(mrp)}
                </span>
              ) : null}
              <span className="text-3xl font-bold text-rose-950">
                {formatMoney(price)}
              </span>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                onClick={handleAddToCart}
                className="w-full sm:w-auto"
                size="lg"
              >
                <ShoppingBag className="h-4 w-4" />
                Add to cart
              </Button>
              <Link href="/cart" className="w-full sm:w-auto">
                <Button variant="outline" className="w-full" size="lg">
                  Go to cart ({qtyInCart})
                </Button>
              </Link>
            </div>

            <div className="mt-8 rounded-3xl border border-rose-100 bg-rose-50/70 p-5">
              <p className="text-sm font-semibold text-rose-950">
                Check delivery availability
              </p>
              <div className="mt-3 flex gap-2">
                <Input
                  value={pincode}
                  onChange={(event) => setPincode(event.target.value)}
                  placeholder="Enter pincode"
                  maxLength={6}
                />
                <Button variant="secondary" onClick={handleCheckPincode}>
                  Check
                </Button>
              </div>
              {pinMessage ? (
                <p className="mt-3 text-sm text-rose-700">{pinMessage}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
