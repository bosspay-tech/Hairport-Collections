"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { getVisiblePages } from "@/lib/pagination";
import { cn } from "@/lib/utils";

type PaginationProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
};

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getVisiblePages(currentPage, totalPages);

  const goTo = (page: number) => {
    onPageChange(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <nav
      className={cn("flex items-center justify-center gap-1.5 sm:gap-2", className)}
      aria-label="Pagination"
    >
      <button
        type="button"
        disabled={currentPage <= 1}
        onClick={() => goTo(currentPage - 1)}
        className="inline-flex h-10 items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Previous page"
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="hidden sm:inline">Prev</span>
      </button>

      {pages.map((page, index) =>
        page === "..." ? (
          <span
            key={`ellipsis-${index}`}
            className="flex h-10 min-w-10 items-center justify-center px-1 text-sm text-rose-400"
          >
            …
          </span>
        ) : (
          <button
            key={page}
            type="button"
            onClick={() => goTo(page)}
            aria-current={currentPage === page ? "page" : undefined}
            className={cn(
              "h-10 min-w-10 rounded-xl px-3 text-sm font-semibold transition",
              currentPage === page
                ? "bg-rose-500 text-white"
                : "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
            )}
          >
            {page}
          </button>
        ),
      )}

      <button
        type="button"
        disabled={currentPage >= totalPages}
        onClick={() => goTo(currentPage + 1)}
        className="inline-flex h-10 items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Next page"
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
