"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ProductForm, type ProductFormValues } from "@/components/admin/product-form";
import { adminFetch } from "@/lib/admin-api";

export default function NewProductPage() {
  const router = useRouter();

  const handleSubmit = async (values: ProductFormValues) => {
    const res = await adminFetch("/api/admin/products", {
      method: "POST",
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
      throw new Error(body.error || "Failed to create product.");
    }

    router.push("/admin/products");
    router.refresh();
  };

  return (
    <div className="max-w-2xl">
      <Link
        href="/admin/products"
        className="text-sm font-medium text-rose-600 hover:text-rose-900"
      >
        ← Back to products
      </Link>
      <h2 className="mt-4 font-display text-3xl text-rose-950">Add product</h2>
      <p className="mt-1 text-sm text-rose-600">Create a new item for the shop.</p>

      <div className="mt-8 rounded-3xl border border-rose-100 bg-white p-6 shadow-sm sm:p-8">
        <ProductForm
          submitLabel="Create product"
          onSubmit={handleSubmit}
          onCancel={() => router.push("/admin/products")}
        />
      </div>
    </div>
  );
}
