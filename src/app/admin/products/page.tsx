"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { adminFetch } from "@/lib/admin-api";
import { getProxiedImage } from "@/lib/image-proxy";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import type { Product } from "@/types";

const ITEMS_PER_PAGE = 25;

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const fetchProducts = useCallback(async (page: number) => {
    setLoading(true);
    setError("");

    const res = await adminFetch(
      `/api/admin/products?page=${page}&limit=${ITEMS_PER_PAGE}`,
    );
    const body = await res.json();

    if (!res.ok) {
      setError(body.error || "Failed to load products.");
      setProducts([]);
      setLoading(false);
      return;
    }

    setProducts(body.products ?? []);
    setTotal(body.total ?? 0);
    setTotalPages(body.totalPages ?? 1);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProducts(currentPage);
  }, [currentPage, fetchProducts]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [currentPage]);

  const pageIds = useMemo(() => products.map((p) => p.id), [products]);

  const allOnPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  const someOnPageSelected =
    pageIds.some((id) => selectedIds.has(id)) && !allOnPageSelected;

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;

    setDeletingId(id);
    const res = await adminFetch(`/api/admin/products/${id}`, { method: "DELETE" });
    const body = await res.json();

    if (!res.ok) {
      setError(body.error || "Failed to delete product.");
      setDeletingId(null);
      return;
    }

    setDeletingId(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    await fetchProducts(currentPage);
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const label =
      ids.length === 1
        ? "1 product"
        : `${ids.length} products`;

    if (
      !window.confirm(
        `Delete ${label}? This cannot be undone.`,
      )
    ) {
      return;
    }

    setBulkDeleting(true);
    setError("");

    const res = await adminFetch("/api/admin/products", {
      method: "DELETE",
      body: JSON.stringify({ ids }),
    });
    const body = await res.json();

    if (!res.ok) {
      setError(body.error || "Failed to delete products.");
      setBulkDeleting(false);
      return;
    }

    setSelectedIds(new Set());
    setBulkDeleting(false);
    await fetchProducts(currentPage);
  };

  const selectedCount = selectedIds.size;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-3xl text-rose-950">Products</h2>
          <p className="mt-1 text-sm text-rose-600">
            {total} product{total === 1 ? "" : "s"} in catalog
            {selectedCount > 0 ? ` · ${selectedCount} selected` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedCount > 0 ? (
            <Button
              variant="outline"
              onClick={handleBulkDelete}
              disabled={bulkDeleting || loading}
              className="border-red-200 text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              {bulkDeleting ? "Deleting..." : `Delete selected (${selectedCount})`}
            </Button>
          ) : null}
          <Link href="/admin/products/new">
            <Button>
              <Plus className="h-4 w-4" />
              Add product
            </Button>
          </Link>
        </div>
      </div>

      {error ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-8 overflow-hidden rounded-3xl border border-rose-100 bg-white shadow-sm">
        {loading ? (
          <div className="divide-y divide-rose-50">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex animate-pulse gap-4 p-4">
                <div className="h-16 w-16 rounded-2xl bg-rose-100" />
                <div className="flex-1 space-y-2 py-2">
                  <div className="h-4 w-1/3 rounded bg-rose-100" />
                  <div className="h-3 w-1/4 rounded bg-rose-100" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-rose-600">No products yet.</p>
            <Link href="/admin/products/new" className="mt-4 inline-block">
              <Button size="sm">Create your first product</Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-rose-100 bg-rose-50/60 text-xs font-semibold tracking-wide text-rose-600 uppercase">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someOnPageSelected;
                      }}
                      onChange={toggleSelectAll}
                      aria-label="Select all on this page"
                      className="h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-300"
                    />
                  </th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-50">
                {products.map((product) => {
                  const isSelected = selectedIds.has(product.id);
                  return (
                    <tr
                      key={product.id}
                      className={
                        isSelected ? "bg-rose-50/70 hover:bg-rose-50" : "hover:bg-rose-50/40"
                      }
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(product.id)}
                          aria-label={`Select ${product.title}`}
                          className="h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-300"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-rose-50">
                            <Image
                              src={getProxiedImage(product.image_url)}
                              alt={product.title}
                              fill
                              className="object-cover"
                              sizes="56px"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-rose-950">
                              {product.title}
                            </p>
                            <p className="truncate text-xs text-rose-500">
                              {product.categories?.join(", ") || "—"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-rose-900">
                        {formatMoney(product.base_price)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            product.is_active !== false
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-rose-100 text-rose-600"
                          }`}
                        >
                          {product.is_active !== false ? "Active" : "Hidden"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/admin/products/${product.id}/edit`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 text-rose-700 transition hover:bg-rose-50"
                            aria-label={`Edit ${product.title}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Link>
                          <button
                            type="button"
                            disabled={deletingId === product.id || bulkDeleting}
                            onClick={() => handleDelete(product.id, product.title)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                            aria-label={`Delete ${product.title}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        className="mt-8"
      />
    </div>
  );
}
