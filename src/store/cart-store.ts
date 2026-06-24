"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartItem } from "@/types";

type CartState = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (index: number) => void;
  updateQty: (index: number, qty: number) => void;
  clearCart: () => void;
  total: () => number;
  count: () => number;
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (item) => {
        const items = get().items;
        const existingIndex = items.findIndex(
          (i) => i.productId === item.productId && i.variantSku === item.variantSku,
        );

        if (existingIndex >= 0) {
          const updated = items.map((entry, index) =>
            index === existingIndex
              ? { ...entry, quantity: entry.quantity + 1 }
              : entry,
          );
          set({ items: updated });
          return;
        }

        set({ items: [...items, { ...item, quantity: 1 }] });
      },

      removeItem: (index) => {
        set({ items: get().items.filter((_, i) => i !== index) });
      },

      updateQty: (index, qty) => {
        const safeQty = Math.max(1, qty);
        set({
          items: get().items.map((item, i) =>
            i === index ? { ...item, quantity: safeQty } : item,
          ),
        });
      },

      clearCart: () => set({ items: [] }),

      total: () =>
        get().items.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0,
        ),

      count: () =>
        get().items.reduce((sum, item) => sum + item.quantity, 0),
    }),
    { name: "hairport-cart" },
  ),
);
