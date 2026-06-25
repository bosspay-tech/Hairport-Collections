import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getProxiedImage } from "@/lib/image-proxy";
import { formatMoney } from "@/lib/utils";
import type { Product } from "@/types";

export function ProductCard({ product }: { product: Product }) {
  const price = Number(product.base_price ?? 0);
  const mrp = Number(product.mrp ?? 0);
  const hasDiscount = mrp > price;
  const discountPercentage = hasDiscount
    ? Math.round(((mrp - price) / mrp) * 100)
    : 0;

  return (
    <Link
      href={`/products/${product.id}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-rose-100 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:border-rose-200 hover:shadow-xl hover:shadow-rose-900/5"
    >
      <div className="relative aspect-4/5 overflow-hidden bg-rose-50">
        <Image
          src={getProxiedImage(product.image_url)}
          alt={product.title}
          fill
          className="object-cover transition duration-500 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, 33vw"
        />
        <div className="absolute inset-0 bg-linear-to-t from-rose-950/30 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />

        <div className="absolute top-3 left-3 flex flex-col gap-2">
          {product.badge ? (
            <span className="rounded-full bg-rose-950/90 px-3 py-1 text-[10px] font-bold tracking-wider text-white uppercase backdrop-blur-md">
              {product.badge}
            </span>
          ) : null}
          {hasDiscount ? (
            <span className="w-fit rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-bold text-white">
              {discountPercentage}% OFF
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="text-[10px] font-bold tracking-[0.2em] text-rose-400 uppercase">
          {product.categories?.[0]?.replace("-", " ") || "Premium"}
        </p>
        <h3 className="mt-2 line-clamp-1 font-display text-xl text-rose-950">
          {product.title}
        </h3>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-rose-600">
          {product.description || "Salon-grade care for everyday radiance."}
        </p>

        <div className="mt-auto flex items-end justify-between border-t border-rose-50 pt-4">
          <div>
            {hasDiscount ? (
              <span className="text-xs text-rose-400 line-through">
                {formatMoney(mrp)}
              </span>
            ) : null}
            <p className="text-xl font-bold text-rose-950">{formatMoney(price)}</p>
          </div>
          <span
            className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-900 transition group-hover:bg-rose-900 group-hover:text-white"
            aria-hidden
          >
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-3xl border border-rose-100 bg-white">
      <div className="aspect-4/5 bg-rose-100" />
      <div className="space-y-3 p-5">
        <div className="h-3 w-1/3 rounded bg-rose-100" />
        <div className="h-5 w-2/3 rounded bg-rose-100" />
        <div className="h-4 w-full rounded bg-rose-100" />
        <div className="h-6 w-24 rounded bg-rose-100" />
      </div>
    </div>
  );
}
