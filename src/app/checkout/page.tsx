"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/providers/auth-provider";
import { STORE_ID } from "@/config/store";
import { supabase } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/utils";
import { useCartStore } from "@/store/cart-store";
import type { CustomerDetails } from "@/types";

function generateTxnId() {
  return `TXN_${Date.now()}`;
}

function CheckoutContent() {
  const router = useRouter();
  const { user } = useAuth();
  const { items, total, clearCart } = useCartStore();
  const [customer, setCustomer] = useState<CustomerDetails>({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const subtotal = useMemo(() => total(), [total, items]);
  const totalItems = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items],
  );

  useEffect(() => {
    if (!user) return;
    setCustomer((prev) => ({
      ...prev,
      name: (user.user_metadata?.full_name as string) || prev.name,
      email: user.email || prev.email,
      phone: user.phone || prev.phone,
      address: (user.user_metadata?.address as string) || prev.address,
      city: (user.user_metadata?.city as string) || prev.city,
      state: (user.user_metadata?.state as string) || prev.state,
      pincode: (user.user_metadata?.pincode as string) || prev.pincode,
    }));
  }, [user]);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.target;
    setCustomer((prev) => ({ ...prev, [name]: value }));
  };

  const validateForm = () => {
    if (!customer.name.trim()) return "Please enter full name.";
    if (!customer.email.trim()) return "Please enter email address.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
      return "Please enter a valid email address.";
    }
    if (!customer.phone.trim()) return "Please enter phone number.";
    if (!/^\d{10}$/.test(customer.phone)) {
      return "Please enter a valid 10-digit phone number.";
    }
    if (!customer.address.trim()) return "Please enter address.";
    if (!customer.city.trim()) return "Please enter city.";
    if (!customer.state.trim()) return "Please enter state.";
    if (!customer.pincode.trim()) return "Please enter pincode.";
    if (!/^\d{6}$/.test(customer.pincode)) {
      return "Please enter a valid 6-digit pincode.";
    }
    return "";
  };

  const handlePlaceOrder = async () => {
    try {
      setError("");
      const validationError = validateForm();
      if (validationError) {
        setError(validationError);
        return;
      }

      setLoading(true);
      const txnId = generateTxnId();

      const { error: insertError } = await supabase.from("orders").insert({
        store_id: STORE_ID,
        user_id: user?.id || null,
        items,
        total: subtotal,
        transaction_id: txnId,
        status: "confirmed",
        customer_name: customer.name,
        customer_email: customer.email,
        customer_phone: customer.phone,
        customer_address: customer.address,
        customer_city: customer.city,
        customer_state: customer.state,
        customer_pincode: customer.pincode,
      });

      if (insertError) throw new Error(insertError.message);

      clearCart();
      toast.success("Order placed successfully!");
      router.push(
        `/order-success?status=success&txn=${encodeURIComponent(txnId)}&amount=${subtotal}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  if (!items.length) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg rounded-[2rem] border border-rose-100 bg-white p-10 text-center">
          <h2 className="font-display text-3xl text-rose-950">Your cart is empty</h2>
          <Link href="/products" className="mt-6 inline-block">
            <Button>Browse products</Button>
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
            <h1 className="font-display text-4xl text-rose-950">Checkout</h1>
            <p className="mt-2 text-sm text-rose-600">
              Enter shipping details and place your order. No external payment bridge required.
            </p>
          </div>
          <div className="flex gap-2 text-sm">
            <div className="rounded-2xl border border-rose-100 bg-white px-4 py-2">
              Items: <span className="font-semibold">{totalItems}</span>
            </div>
            <div className="rounded-2xl border border-rose-100 bg-white px-4 py-2">
              Total: <span className="font-semibold">{formatMoney(subtotal)}</span>
            </div>
          </div>
        </div>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="rounded-[2rem] border border-rose-100 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-rose-950">Customer details</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {(
                  [
                    { name: "name", label: "Full Name", type: "text", full: true },
                    { name: "email", label: "Email", type: "email", full: false },
                    { name: "phone", label: "Phone", type: "tel", full: false },
                    { name: "city", label: "City", type: "text", full: false },
                    { name: "state", label: "State", type: "text", full: false },
                    { name: "pincode", label: "Pincode", type: "text", full: false },
                  ] as const
                ).map((field) => (
                  <div
                    key={field.name}
                    className={field.full ? "sm:col-span-2" : ""}
                  >
                    <label className="text-sm font-medium text-rose-900">
                      {field.label}
                    </label>
                    <Input
                      name={field.name}
                      type={field.type}
                      value={customer[field.name]}
                      onChange={handleChange}
                      className="mt-2"
                    />
                  </div>
                ))}
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium text-rose-900">Address</label>
                  <textarea
                    name="address"
                    value={customer.address}
                    onChange={handleChange}
                    rows={3}
                    className="mt-2 w-full rounded-2xl border border-rose-200/80 bg-white px-4 py-3 text-sm text-rose-950 outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-rose-100 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-rose-950">Order summary</h2>
              <div className="mt-4 space-y-3">
                {items.map((item, index) => (
                  <div
                    key={`${item.productId}-${index}`}
                    className="flex justify-between rounded-2xl border border-rose-100 p-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-rose-950">{item.title}</p>
                      <p className="mt-1 text-rose-600">
                        Qty {item.quantity} • {formatMoney(item.price)}
                      </p>
                    </div>
                    <p className="font-bold text-rose-950">
                      {formatMoney(item.price * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="h-fit rounded-[2rem] border border-rose-100 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-rose-700">
              <ShieldCheck className="h-5 w-5" />
              <p className="text-sm font-medium">Direct Supabase checkout</p>
            </div>
            <p className="mt-3 text-sm text-rose-600">
              Orders are saved to your new Supabase project. Payment collection can be added later via Razorpay or another gateway.
            </p>
            <div className="mt-5 flex items-center justify-between border-t border-rose-100 pt-5">
              <span className="font-semibold text-rose-950">Payable amount</span>
              <span className="text-2xl font-bold text-rose-950">
                {formatMoney(subtotal)}
              </span>
            </div>
            <Button
              className="mt-6 w-full"
              size="lg"
              onClick={handlePlaceOrder}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Placing order...
                </>
              ) : (
                "Place order"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <ProtectedRoute>
      <CheckoutContent />
    </ProtectedRoute>
  );
}
