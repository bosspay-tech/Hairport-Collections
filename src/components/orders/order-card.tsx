"use client";

import Image from "next/image";
import { toast } from "sonner";
import { getProxiedImage } from "@/lib/image-proxy";
import { cn, formatMoney } from "@/lib/utils";
import type { Order } from "@/types";

function statusStyles(status = "") {
  const value = String(status).toLowerCase();
  if (value.includes("success") || value.includes("paid") || value.includes("delivered")) {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }
  if (value.includes("failed") || value.includes("cancel")) {
    return "bg-red-50 text-red-700 border-red-200";
  }
  if (value.includes("shipped")) {
    return "bg-blue-50 text-blue-700 border-blue-200";
  }
  if (value.includes("pending") || value.includes("processing")) {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  return "bg-rose-50 text-rose-700 border-rose-200";
}

export function OrderCard({ order }: { order: Order }) {
  const orderNo = order.id ? order.id.slice(0, 8).toUpperCase() : "—";
  const dateStr = order.created_at
    ? new Date(order.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";
  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <div className="overflow-hidden rounded-3xl border border-rose-100 bg-white shadow-sm transition hover:shadow-md">
      <div className="flex flex-col gap-3 border-b border-rose-100 bg-rose-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wide text-rose-500">
            ORDER #{orderNo}
          </p>
          <p className="mt-1 text-sm font-medium text-rose-950">{dateStr}</p>
        </div>
        <span
          className={cn(
            "inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold",
            statusStyles(order.status),
          )}
        >
          {order.status || "Unknown"}
        </span>
      </div>

      <div className="px-5 py-4">
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={`${item.productId}-${index}`}
              className="flex items-start gap-3 rounded-2xl border border-rose-100 bg-white p-3"
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-rose-50">
                <Image
                  src={getProxiedImage(item.imageUrl)}
                  alt={item.title || "Product"}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              </div>
              <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-rose-950">
                    {item.title || "Item"}
                  </p>
                  <p className="mt-2 text-xs text-rose-600">
                    Qty: {item.quantity} • {formatMoney(item.price)} each
                  </p>
                </div>
                <p className="shrink-0 text-sm font-bold text-rose-950">
                  {formatMoney(item.price * item.quantity)}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-rose-100 bg-rose-50/70 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-rose-700">Total</span>
            <span className="text-lg font-bold text-rose-950">
              {formatMoney(order.total)}
            </span>
          </div>
        </div>
      </div>

      <div className="border-t border-rose-100 px-5 py-4">
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(order.id);
            toast.success("Order ID copied");
          }}
          className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-900 transition hover:bg-rose-50"
        >
          Copy Order ID
        </button>
      </div>
    </div>
  );
}
