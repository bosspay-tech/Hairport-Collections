import React, { useState } from "react";
import { getProxiedImage } from "../lib/imageproxy";

function ProductCard({ product, onViewDetails }) {
  const price = Number(product?.base_price ?? 0);
  const mrp = Number(product?.mrp ?? 0);
  const hasDiscount = mrp > price;
  const discountPercentage = hasDiscount
    ? Math.round(((mrp - price) / mrp) * 100)
    : 0;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white transition-all duration-300 hover:border-blue-100 hover:shadow-xl hover:shadow-blue-500/10">
      {/* Image Container */}
      <div className="relative aspect-4/5 overflow-hidden bg-slate-100">
        <img
          src={getProxiedImage(product.image_url)}
          alt={product.title}          
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
        />

        {/* Badges Overlay */}
        <div className="absolute left-3 top-3 flex flex-col gap-2">
          {product?.badge && (
            <span className="rounded-full bg-slate-900/90 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-md">
              {product.badge}
            </span>
          )}
          {hasDiscount && (
            <span className="w-fit rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-bold text-white shadow-lg">
              {discountPercentage}% OFF
            </span>
          )}
        </div>

        {/* Floating Quick Action (Desktop) */}
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/20 opacity-0 backdrop-blur-[2px] transition-opacity duration-300 group-hover:opacity-100">
          <button
            onClick={() => onViewDetails?.(product)}
            className="translate-y-4 rounded-full bg-white px-6 py-2.5 text-sm font-bold text-slate-900 shadow-xl transition-transform duration-300 group-hover:translate-y-0 hover:bg-slate-50"
          >
            Quick View
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {product?.category || "Premium Collection"}
          </span>
          {typeof product?.rating === "number" && (
            <div className="flex items-center gap-1 text-xs font-bold text-amber-500">
              <span className="text-sm">★</span>
              <span>{product.rating.toFixed(1)}</span>
            </div>
          )}
        </div>

        <h3 className="mb-2 line-clamp-1 text-lg font-bold text-slate-800 transition-colors group-hover:text-blue-600">
          {product.title}
        </h3>

        <p className="mb-4 line-clamp-2 text-sm leading-relaxed text-slate-500">
          {product.description ||
            "Explore the details of this curated piece from our latest collection."}
        </p>

        <div className="mt-auto flex items-end justify-between border-t border-slate-50 pt-4">
          <div className="flex flex-col">
            {hasDiscount && (
              <span className="text-xs font-medium text-slate-400 line-through">
                ₹{mrp.toLocaleString()}
              </span>
            )}
            <span className="text-xl font-black text-slate-900">
              ₹{price.toLocaleString()}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onViewDetails?.(product)}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-900 transition-all hover:bg-blue-600 hover:text-white"
            aria-label="View Details"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ProductCard;
