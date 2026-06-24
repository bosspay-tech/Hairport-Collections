"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { OrderCard } from "@/components/orders/order-card";
import { useAuth } from "@/components/providers/auth-provider";
import { STORE_ID } from "@/config/store";
import { supabase } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/utils";
import type { Order } from "@/types";

function OrdersContent() {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading || !user) return;

    let alive = true;

    async function fetchOrders() {
      setLoading(true);
      setError("");

      if (!user) return;

      const { data, error: fetchError } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .eq("store_id", STORE_ID)
        .order("created_at", { ascending: false });

      if (!alive) return;

      if (fetchError) {
        setError(fetchError.message || "Failed to load orders.");
        setOrders([]);
      } else {
        setOrders((data as Order[]) || []);
      }
      setLoading(false);
    }

    fetchOrders();
    return () => {
      alive = false;
    };
  }, [user, authLoading]);

  const stats = useMemo(() => {
    const count = orders.length;
    const totalSpent = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    return { count, totalSpent };
  }, [orders]);

  return (
    <div className="min-h-[70vh] bg-linear-to-b from-rose-50/60 via-white to-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-4xl text-rose-950">My Orders</h1>
            <p className="mt-2 text-sm text-rose-600">
              Track purchases and order status in one place.
            </p>
          </div>
          <div className="flex gap-2 text-sm">
            <div className="rounded-2xl border border-rose-100 bg-white px-4 py-2">
              Orders: <span className="font-semibold">{stats.count}</span>
            </div>
            <div className="rounded-2xl border border-rose-100 bg-white px-4 py-2">
              Spent: <span className="font-semibold">{formatMoney(stats.totalSpent)}</span>
            </div>
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-8 space-y-4">
          {loading || authLoading ? (
            Array.from({ length: 2 }).map((_, index) => (
              <div
                key={index}
                className="h-48 animate-pulse rounded-3xl border border-rose-100 bg-rose-50"
              />
            ))
          ) : orders.length === 0 ? (
            <div className="rounded-[2rem] border border-rose-100 bg-white p-10 text-center">
              <h2 className="text-lg font-semibold text-rose-950">No orders yet</h2>
              <p className="mt-2 text-sm text-rose-600">
                Start shopping to see your order history here.
              </p>
              <Link
                href="/products"
                className="mt-6 inline-flex rounded-2xl bg-rose-900 px-6 py-3 text-sm font-semibold text-white"
              >
                Shop now
              </Link>
            </div>
          ) : (
            orders.map((order) => <OrderCard key={order.id} order={order} />)
          )}
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <ProtectedRoute>
      <OrdersContent />
    </ProtectedRoute>
  );
}
