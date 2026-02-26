import { create } from "zustand";

const STORAGE_KEY = "cart";

export const useCartStore = create((set, get) => ({
  items: JSON.parse(localStorage.getItem(STORAGE_KEY)) || [],

  addItem: (item) => {
    const items = get().items;
    const existing = items.find((i) => i.productId === item.productId);

    let updated;
    if (existing) {
      updated = items.map((i) =>
        i === existing ? { ...i, quantity: i.quantity + 1 } : i,
      );
    } else {
      updated = [...items, { ...item, quantity: 1 }];
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    set({ items: updated });
  },

  removeItem: (index) => {
    const updated = get().items.filter((_, i) => i !== index);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    set({ items: updated });
  },

  updateQty: (index, qty) => {
    const updated = get().items.map((item, i) =>
      i === index ? { ...item, quantity: qty } : item,
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    set({ items: updated });
  },

  clearCart: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ items: [] });
  },

  total: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
}));
