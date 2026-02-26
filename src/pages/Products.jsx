import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { STORE_ID } from "../config/store";
import { Link, useLocation } from "react-router-dom";
import ProductCard from "../components/ProductCard";

const ITEMS_PER_PAGE = 6; // Adjust this number as needed

/* ---------- SKELETON ---------- */
function SkeletonCard() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-rose-200 bg-white">
      <div className="h-48 bg-rose-100" />
      <div className="p-4">
        <div className="h-4 w-2/3 rounded bg-rose-100" />
        <div className="mt-3 h-3 w-full rounded bg-rose-100" />
        <div className="mt-2 h-3 w-5/6 rounded bg-rose-100" />
        <div className="mt-4 h-5 w-24 rounded bg-rose-100" />
        <div className="mt-4 h-9 w-full rounded-xl bg-rose-100" />
      </div>
    </div>
  );
}

export default function Products() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const category = params.get("category");

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  // PAGINATION STATE
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    let alive = true;

    const fetchProducts = async () => {
      setLoading(true);
      setErr("");

      let query = supabase
        .from("products")
        .select("*")
        .eq("store_id", STORE_ID)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (category) query = query.contains("categories", [category]);

      const { data, error } = await query;

      if (!alive) return;

      if (error) {
        setErr(error.message || "Failed to load products.");
        setProducts([]);
      } else {
        setProducts(data || []);
      }

      setLoading(false);
    };

    fetchProducts();
    return () => {
      alive = false;
    };
  }, [category]); // Added category to dependency to re-fetch if category changes

  // RESET PAGE ON SEARCH OR CATEGORY CHANGE
  useEffect(() => {
    setCurrentPage(1);
  }, [q, category]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products;
    return products.filter((p) =>
      `${p.title ?? ""} ${p.description ?? ""}`.toLowerCase().includes(s),
    );
  }, [products, q]);

  // CALCULATE PAGINATED DATA
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filtered.slice(start, start + ITEMS_PER_PAGE);
  }, [filtered, currentPage]);

  const handlePageChange = (newPage) => {
    const next = Math.max(1, Math.min(newPage, totalPages || 1));
    setCurrentPage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-[70vh] bg-linear-to-b from-rose-50 via-pink-50 to-white">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {/* HEADER */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-rose-950 sm:text-3xl">
              Products
            </h2>
            <p className="mt-1 text-sm text-rose-700">
              Discover styles curated just for you.
            </p>
          </div>

          {/* SEARCH */}
          <div className="w-full sm:w-80">
            <label className="sr-only">Search products</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search styles..."
              className="w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-950 outline-none transition focus:border-pink-400 focus:ring-4 focus:ring-pink-100"
            />
          </div>
        </div>

        {/* ERROR */}
        {err ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {err}
          </div>
        ) : null}

        {/* CONTENT */}
        <div className="mt-8">
          {loading ? (
            <>
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-rose-700">Loading products…</p>
                <div className="h-4 w-24 animate-pulse rounded bg-rose-100" />
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            </>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-rose-200 bg-white p-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
                🛍️
              </div>
              <h3 className="text-lg font-semibold text-rose-950">
                No products found
              </h3>
              <p className="mt-1 text-sm text-rose-700">
                {q.trim()
                  ? "Try a different search term."
                  : "New styles are coming soon."}
              </p>
              {q.trim() && (
                <button
                  onClick={() => setQ("")}
                  className="mt-5 rounded-xl bg-pink-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-pink-400 focus:outline-none focus:ring-4 focus:ring-pink-200"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <>
              {/* RESULTS META */}
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-rose-700">
                  Showing{" "}
                  <span className="font-semibold text-rose-950">
                    {paginatedProducts.length}
                  </span>{" "}
                  of{" "}
                  <span className="font-semibold text-rose-950">
                    {filtered.length}
                  </span>{" "}
                  items
                </p>
              </div>

              {/* GRID */}
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3">
                {paginatedProducts.map((product) => (
                  <Link
                    key={product.id}
                    to={`/products/${product.id}`}
                    className="block rounded-2xl focus:outline-none focus:ring-4 focus:ring-pink-200"
                  >
                    <ProductCard product={product} />
                  </Link>
                ))}
              </div>

              {totalPages > 1 && (
                <Pagination
                  totalPages={totalPages}
                  currentPage={currentPage}
                  onChange={handlePageChange}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- PAGINATION HELPERS ---------- */
function getPageItems(totalPages, currentPage) {
  // Returns an array like: [1, '...', 4, 5, 6, '...', 20]
  const siblingCount = 1; // pages shown on each side of current
  const showEdges = true;

  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const items = [];
  const leftSibling = Math.max(currentPage - siblingCount, 1);
  const rightSibling = Math.min(currentPage + siblingCount, totalPages);

  const shouldShowLeftDots = leftSibling > 2;
  const shouldShowRightDots = rightSibling < totalPages - 1;

  if (showEdges) items.push(1);

  if (shouldShowLeftDots) items.push("...");
  else {
    for (let p = 2; p < leftSibling; p++) items.push(p);
  }

  for (let p = leftSibling; p <= rightSibling; p++) {
    if (p !== 1 && p !== totalPages) items.push(p);
  }

  if (shouldShowRightDots) items.push("...");
  else {
    for (let p = rightSibling + 1; p < totalPages; p++) items.push(p);
  }

  if (showEdges) items.push(totalPages);

  // Remove duplicates (can happen near edges)
  return items.filter((v, i, a) => i === a.indexOf(v));
}

/* ---------- PAGINATION UI ---------- */
function Pagination({ totalPages, currentPage, onChange }) {
  const items = useMemo(
    () => getPageItems(totalPages, currentPage),
    [totalPages, currentPage],
  );

  const canPrev = currentPage > 1;
  const canNext = currentPage < totalPages;

  return (
    <div className="mt-12">
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
        {/* Meta */}
        <div className="text-sm text-rose-700">
          Page{" "}
          <span className="font-semibold text-rose-950">{currentPage}</span> of{" "}
          <span className="font-semibold text-rose-950">{totalPages}</span>
        </div>

        {/* Controls */}
        <nav
          aria-label="Pagination"
          className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-white p-2 shadow-sm"
        >
          {/* Prev */}
          <button
            type="button"
            disabled={!canPrev}
            onClick={() => onChange(currentPage - 1)}
            className="group inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-base leading-none">←</span>
            <span className="hidden sm:inline">Prev</span>
          </button>

          <div className="h-6 w-px bg-rose-200" />

          {/* Page pills */}
          <div className="flex items-center gap-1">
            {items.map((it, idx) =>
              it === "..." ? (
                <span
                  key={`dots-${idx}`}
                  className="px-2 text-sm font-semibold text-rose-400"
                >
                  …
                </span>
              ) : (
                <button
                  key={it}
                  type="button"
                  onClick={() => onChange(it)}
                  aria-current={currentPage === it ? "page" : undefined}
                  className={[
                    "h-10 min-w-10 rounded-xl px-3 text-sm font-semibold transition",
                    currentPage === it
                      ? "bg-pink-500 text-white shadow-sm"
                      : "text-rose-700 hover:bg-rose-50",
                  ].join(" ")}
                >
                  {it}
                </button>
              ),
            )}
          </div>

          <div className="h-6 w-px bg-rose-200" />

          {/* Next */}
          <button
            type="button"
            disabled={!canNext}
            onClick={() => onChange(currentPage + 1)}
            className="group inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="hidden sm:inline">Next</span>
            <span className="text-base leading-none">→</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
