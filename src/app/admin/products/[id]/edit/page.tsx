"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ProductForm, type ProductFormValues } from "@/components/admin/product-form";
import { adminFetch } from "@/lib/admin-api";
import type { Product } from "@/types";

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    adminFetch(`/api/admin/products/${id}`).then(async (res) => {
      const body = await res.json();
      if (!alive) return;

      if (!res.ok) {
        setError(body.error || "Product not found.");
        setLoading(false);
        return;
      }

      setProduct(body.product);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [id]);

  const handleSubmit = async (values: ProductFormValues) => {
    const res = await adminFetch(`/api/admin/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: values.title,
        description: values.description,
        base_price: Number(values.base_price),
        mrp: values.mrp ? Number(values.mrp) : null,
        image_url: values.image_url,
        categories: values.categories,
        badge: values.badge,
        rating: values.rating ? Number(values.rating) : null,
        is_active: values.is_active,
      }),
    });

    const body = await res.json();
    if (!res.ok) {
      throw new Error(body.error || "Failed to update product.");
    }

    router.push("/admin/products");
    router.refresh();
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose-200 border-t-rose-600" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm text-red-700">{error || "Product not found."}</p>
        <Link
          href="/admin/products"
          className="mt-4 inline-block text-sm font-semibold text-rose-900 hover:underline"
        >
          Back to products
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/products"
        className="text-sm font-medium text-rose-600 hover:text-rose-900"
      >
        ← Back to products
      </Link>
      <h2 className="mt-4 font-display text-3xl text-rose-950">Edit product</h2>
      <p className="mt-1 text-sm text-rose-600">{product.title}</p>

      <div className="mt-8 rounded-3xl border border-rose-100 bg-white p-6 shadow-sm sm:p-8">
        <ProductForm
          key={product.id}
          initial={product}
          submitLabel="Save changes"
          onSubmit={handleSubmit}
          onCancel={() => router.push("/admin/products")}
        />
      </div>
    </div>
  );
}
