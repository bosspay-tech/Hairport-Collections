"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ProductCard, ProductCardSkeleton } from "@/components/products/product-card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { supabase } from "@/lib/supabase/client";
import type { Product } from "@/types";

const ITEMS_PER_PAGE = 9;

export function ProductsContent() {
  const searchParams = useSearchParams();
  const category = searchParams.get("category");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    let alive = true;

    async function fetchProducts() {
      setLoading(true);
      setError("");

      let request = supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (category) {
        request = request.contains("categories", [category]);
      }

      const { data, error: fetchError } = await request;
      if (!alive) return;

      if (fetchError) {
        setError(fetchError.message || "Failed to load products.");
        setProducts([]);
      } else {
        setProducts((data as Product[]) || []);
      }
      setLoading(false);
    }

    fetchProducts();
    return () => {
      alive = false;
    };
  }, [category]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, category]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) =>
      `${product.title ?? ""} ${product.description ?? ""}`
        .toLowerCase()
        .includes(term),
    );
  }, [products, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  return (
    <div className="min-h-[70vh] bg-linear-to-b from-rose-50/60 via-white to-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-4xl text-rose-950">Products</h1>
            <p className="mt-2 text-sm text-rose-600">
              {category
                ? `Showing ${category.replace("-", " ")} collection`
                : "Discover styles curated just for you."}
            </p>
          </div>
          <div className="w-full sm:w-80">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products..."
            />
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-8">
          {loading ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 9 }).map((_, index) => (
                <ProductCardSkeleton key={index} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-3xl border border-rose-100 bg-white p-10 text-center">
              <h3 className="text-lg font-semibold text-rose-950">No products found</h3>
              <p className="mt-2 text-sm text-rose-600">
                {query.trim()
                  ? "Try a different search term."
                  : "New styles are coming soon."}
              </p>
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-rose-600">
                Showing {paginatedProducts.length} of {filtered.length} items
              </p>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {paginatedProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                className="mt-12"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
