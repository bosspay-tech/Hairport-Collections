"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Product } from "@/types";

export type ProductFormValues = {
  title: string;
  description: string;
  base_price: string;
  mrp: string;
  image_url: string;
  categories: string;
  badge: string;
  rating: string;
  is_active: boolean;
};

export function productToFormValues(product?: Product | null): ProductFormValues {
  return {
    title: product?.title ?? "",
    description: product?.description ?? "",
    base_price: product?.base_price != null ? String(product.base_price) : "",
    mrp: product?.mrp != null ? String(product.mrp) : "",
    image_url: product?.image_url ?? "",
    categories: product?.categories?.join(", ") ?? "",
    badge: product?.badge ?? "",
    rating: product?.rating != null ? String(product.rating) : "",
    is_active: product?.is_active !== false,
  };
}

type ProductFormProps = {
  initial?: Product | null;
  submitLabel: string;
  onSubmit: (values: ProductFormValues) => Promise<void>;
  onCancel?: () => void;
};

export function ProductForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: ProductFormProps) {
  const [values, setValues] = useState<ProductFormValues>(() =>
    productToFormValues(initial),
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (
    field: keyof ProductFormValues,
    value: string | boolean,
  ) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!values.title.trim()) {
      setError("Title is required.");
      return;
    }

    if (!values.base_price || Number(values.base_price) < 0) {
      setError("A valid base price is required.");
      return;
    }

    setLoading(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Title *" className="sm:col-span-2">
          <Input
            value={values.title}
            onChange={(e) => handleChange("title", e.target.value)}
            placeholder="Salon Repair Shampoo"
            required
          />
        </Field>

        <Field label="Description" className="sm:col-span-2">
          <textarea
            value={values.description}
            onChange={(e) => handleChange("description", e.target.value)}
            rows={4}
            placeholder="Product description..."
            className="w-full rounded-2xl border border-rose-200/80 bg-white px-4 py-3 text-sm text-rose-950 outline-none transition placeholder:text-rose-400 focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
          />
        </Field>

        <Field label="Base price (₹) *">
          <Input
            type="number"
            min="0"
            step="1"
            value={values.base_price}
            onChange={(e) => handleChange("base_price", e.target.value)}
            placeholder="499"
            required
          />
        </Field>

        <Field label="MRP (₹)">
          <Input
            type="number"
            min="0"
            step="1"
            value={values.mrp}
            onChange={(e) => handleChange("mrp", e.target.value)}
            placeholder="699"
          />
        </Field>

        <Field label="Image URL" className="sm:col-span-2">
          <Input
            type="url"
            value={values.image_url}
            onChange={(e) => handleChange("image_url", e.target.value)}
            placeholder="https://..."
          />
        </Field>

        <Field label="Categories" className="sm:col-span-2">
          <Input
            value={values.categories}
            onChange={(e) => handleChange("categories", e.target.value)}
            placeholder="hair-care, skin-care"
          />
          <p className="mt-1.5 text-xs text-rose-500">
            Comma-separated: hair-care, skin-care, treatments, new-arrivals
          </p>
        </Field>

        <Field label="Badge">
          <Input
            value={values.badge}
            onChange={(e) => handleChange("badge", e.target.value)}
            placeholder="Best Seller"
          />
        </Field>

        <Field label="Rating (0–5)">
          <Input
            type="number"
            min="0"
            max="5"
            step="0.1"
            value={values.rating}
            onChange={(e) => handleChange("rating", e.target.value)}
            placeholder="4.5"
          />
        </Field>

        <div className="sm:col-span-2">
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-rose-100 bg-rose-50/50 px-4 py-3">
            <input
              type="checkbox"
              checked={values.is_active}
              onChange={(e) => handleChange("is_active", e.target.checked)}
              className="h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-300"
            />
            <span className="text-sm font-medium text-rose-900">
              Active (visible in shop)
            </span>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="text-sm font-medium text-rose-900">{label}</label>
      <div className="mt-2">{children}</div>
    </div>
  );
}
