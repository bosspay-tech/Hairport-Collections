"use client";

import Link from "next/link";
import Image from "next/image";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getProxiedImage } from "@/lib/image-proxy";
import { formatMoney } from "@/lib/utils";
import { useCartStore } from "@/store/cart-store";

export default function CartPage() {
  const { items, removeItem, updateQty, total, count } = useCartStore();

  if (!items.length) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center bg-linear-to-b from-rose-50/60 to-white px-4 py-12">
        <div className="w-full max-w-lg rounded-[2rem] border border-rose-100 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <ShoppingBag className="h-6 w-6" />
          </div>
          <h1 className="font-display text-3xl text-rose-950">Your cart is empty</h1>
          <p className="mt-2 text-sm text-rose-600">
            Looks like you have not added anything yet.
          </p>
          <Link href="/products" className="mt-6 inline-block">
            <Button size="lg">Continue shopping</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] bg-linear-to-b from-rose-50/60 via-white to-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-4xl text-rose-950">Your Cart</h1>
            <p className="mt-2 text-sm text-rose-600">
              Review items and proceed to checkout.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="rounded-2xl border border-rose-100 bg-white px-4 py-2 text-sm">
              Items: <span className="font-semibold text-rose-950">{count()}</span>
            </div>
            <div className="rounded-2xl border border-rose-100 bg-white px-4 py-2 text-sm">
              Total: <span className="font-semibold text-rose-950">{formatMoney(total())}</span>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {items.map((item, index) => (
              <div
                key={`${item.productId}-${index}`}
                className="flex gap-4 rounded-3xl border border-rose-100 bg-white p-4 shadow-sm"
              >
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-rose-50">
                  <Image
                    src={getProxiedImage(item.imageUrl)}
                    alt={item.title}
                    fill
                    className="object-cover"
                    sizes="96px"
                  />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-rose-950">{item.title}</h3>
                      <p className="mt-1 text-sm text-rose-600">
                        {formatMoney(item.price)} each
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="rounded-xl p-2 text-rose-500 transition hover:bg-rose-50"
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-auto flex items-center justify-between pt-4">
                    <div className="inline-flex items-center rounded-2xl border border-rose-100 bg-rose-50">
                      <button
                        type="button"
                        onClick={() => updateQty(index, item.quantity - 1)}
                        className="p-2 text-rose-700"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="min-w-8 text-center text-sm font-semibold">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQty(index, item.quantity + 1)}
                        className="p-2 text-rose-700"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="font-bold text-rose-950">
                      {formatMoney(item.price * item.quantity)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="h-fit rounded-[2rem] border border-rose-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-rose-950">Order summary</h2>
            <div className="mt-4 space-y-3 text-sm text-rose-700">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="font-semibold text-rose-950">
                  {formatMoney(total())}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Shipping</span>
                <span className="font-semibold text-emerald-600">
                  {total() >= 999 ? "Free" : "Calculated at checkout"}
                </span>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-rose-100 pt-5">
              <span className="font-semibold text-rose-950">Total</span>
              <span className="text-2xl font-bold text-rose-950">
                {formatMoney(total())}
              </span>
            </div>
            <Link href="/checkout" className="mt-6 block">
              <Button className="w-full" size="lg">
                Proceed to checkout
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
