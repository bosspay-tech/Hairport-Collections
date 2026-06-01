import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useCartStore } from "../store/cart.store";
import { STORE_ID } from "../config/store";
import { useAuth } from "../features/auth/useAuth";

// Payment init goes through the bridge server (server-side SabPaisa creds).
// DO NOT import `sabpaisa-pg-dev` here — that shipped creds to every
// visitor's browser. The backend now owns all SabPaisa interaction.

function formatMoney(n) {
  const num = Number(n || 0);
  return `₹${num.toFixed(0)}`;
}

function generateTxnId() {
  return "TXN_" + Date.now();
}

function Spinner({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        strokeOpacity="0.25"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export default function Checkout() {
  const [customer, setCustomer] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
  });
  const { items, total } = useCartStore();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Payment method selection state
  const [step, setStep] = useState("form"); // "form" | "choosing"
  const [pendingTxnId, setPendingTxnId] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(null); // null | "sabpaisa" | "airpay" | "airpay2"

  const subtotal = useMemo(() => Number(total()), [total]);
  const totalItems = useMemo(
    () => items.reduce((sum, it) => sum + Number(it.quantity || 0), 0),
    [items],
  );

  useEffect(() => {
    if (!user) return;
    setCustomer((prev) => ({
      ...prev,
      name: user?.user_metadata?.full_name || prev.name,
      email: user?.email || prev.email,
      phone: user?.phone || prev.phone,
      address: user?.user_metadata?.address || prev.address,
      city: user?.user_metadata?.city || prev.city,
      state: user?.user_metadata?.state || prev.state,
      pincode: user?.user_metadata?.pincode || prev.pincode,
    }));
  }, [user]);

  const handleCustomerChange = (e) => {
    const { name, value } = e.target;
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

  // Step 1: validate + create order, then show payment picker
  const handleSubmit = async () => {
    try {
      setError("");
      const validationError = validateForm();
      if (validationError) {
        setError(validationError);
        return;
      }
      setLoading(true);
      const txnId = generateTxnId();
      await createOrder(txnId);
      setPendingTxnId(txnId);
      setStep("choosing");
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  // Step 2a: pay via SabPaisa (existing flow, unchanged)
  const handleSabPaisa = async () => {
    try {
      setError("");
      setPaymentLoading("sabpaisa");

      const resp = await fetch("/api/hairport/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          txnId: pendingTxnId,
          amount: subtotal,
          payerName: customer.name,
          payerEmail: customer.email,
          payerMobile: customer.phone,
        }),
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error || `Checkout init failed (HTTP ${resp.status})`);
      }

      const { payUrl } = await resp.json();
      if (!payUrl) throw new Error("Checkout init returned no redirect URL.");

      window.location.assign(payUrl);
    } catch (err) {
      setError(err.message || "Something went wrong.");
      setPaymentLoading(null);
    }
  };

  // Step 2b: pay via Airpay — backend computes hash, frontend auto-submits form
  const handleAirpay = async (gateway = "airpay") => {
    const isAirpay2 = gateway === "airpay2";
    const label = isAirpay2 ? "Airpay 2" : "Airpay";
    const endpoint = isAirpay2
      ? "/api/hairport/airpay2/create"
      : "/api/hairport/airpay/create";

    try {
      setError("");
      setPaymentLoading(gateway);

      const nameParts = customer.name.trim().split(/\s+/);
      const buyerFirstName = nameParts[0] || "";
      const buyerLastName =
        nameParts.length > 1 ? nameParts.slice(1).join(" ") : nameParts[0] || "";

      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          txnId: pendingTxnId,
          buyerFirstName,
          buyerLastName,
          buyerEmail: customer.email,
          buyerPhone: customer.phone,
          buyerAddress: customer.address,
          buyerCity: customer.city,
          buyerState: customer.state,
          buyerCountry: "India",
          buyerPinCode: customer.pincode,
        }),
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.error || `${label} init failed (HTTP ${resp.status})`);
      }

      const { fields, payUrl } = await resp.json();
      if (!fields || !payUrl) throw new Error(`${label} init returned incomplete data.`);

      // Build a hidden form and auto-submit to Airpay's hosted payment page
      const form = document.createElement("form");
      form.method = "POST";
      form.action = payUrl;
      form.style.display = "none";
      for (const [key, value] of Object.entries(fields)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = String(value ?? "");
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      setError(err.message || `Could not initiate ${label} payment.`);
      setPaymentLoading(null);
    }
  };

  const createOrder = async (txnId) => {
    const { error } = await supabase.from("orders").insert({
      store_id: STORE_ID,
      user_id: user?.id || null,
      items,
      total: subtotal,
      transaction_id: txnId,
      status: "pending",
      customer_name: customer.name,
      customer_email: customer.email,
      customer_phone: customer.phone,
      customer_address: customer.address,
      customer_city: customer.city,
      customer_state: customer.state,
      customer_pincode: customer.pincode,
    });
    if (error) {
      throw new Error(error.message);
    }
  };

  if (!items?.length) {
    return (
      <div className="min-h-[70vh] bg-linear-to-b from-slate-50 to-white flex items-center justify-center px-4 py-12">
        {" "}
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          {" "}
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
            {" "}
            🧺{" "}
          </div>{" "}
          <h2 className="text-xl font-bold text-slate-900">
            {" "}
            Your cart is empty{" "}
          </h2>{" "}
          <p className="mt-2 text-sm text-slate-600">
            {" "}
            Add items to your cart to proceed to checkout.{" "}
          </p>{" "}
          <Link
            to="/products"
            className="mt-6 inline-flex rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200"
          >
            {" "}
            Browse products{" "}
          </Link>{" "}
        </div>{" "}
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] bg-linear-to-b from-slate-50 to-white">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {/* Page header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Checkout
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Review your items, add customer details and place your order.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm">
              <span className="text-slate-500">Items:</span>{" "}
              <span className="font-semibold text-slate-900">{totalItems}</span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm">
              <span className="text-slate-500">Total:</span>{" "}
              <span className="font-semibold text-slate-900">{formatMoney(subtotal)}</span>
            </div>
          </div>
        </div>

        {/* Error banner */}
        {error ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {/* ── Left column: form + order summary ── */}
          <div
            className={[
              "space-y-6 lg:col-span-2 transition-opacity duration-200",
              step === "choosing" ? "opacity-60 pointer-events-none select-none" : "",
            ].join(" ")}
          >
            {/* Customer details */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                <h3 className="text-sm font-semibold text-slate-900">Customer Details</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Please enter billing / shipping information.
                </p>
              </div>
              <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Full Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={customer.name}
                    onChange={handleCustomerChange}
                    placeholder="Enter full name"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={customer.email}
                    onChange={handleCustomerChange}
                    placeholder="Enter email"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={customer.phone}
                    onChange={handleCustomerChange}
                    placeholder="Enter phone number"
                    maxLength={10}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Address
                  </label>
                  <textarea
                    name="address"
                    value={customer.address}
                    onChange={handleCustomerChange}
                    placeholder="House no, street, area"
                    rows={3}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    City
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={customer.city}
                    onChange={handleCustomerChange}
                    placeholder="Enter city"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    State
                  </label>
                  <input
                    type="text"
                    name="state"
                    value={customer.state}
                    onChange={handleCustomerChange}
                    placeholder="Enter state"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Pincode
                  </label>
                  <input
                    type="text"
                    name="pincode"
                    value={customer.pincode}
                    onChange={handleCustomerChange}
                    placeholder="Enter pincode"
                    maxLength={6}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Order summary */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                <h3 className="text-sm font-semibold text-slate-900">Order Summary</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Confirm quantities and variant selections.
                </p>
              </div>
              <div className="px-5 py-4">
                <div className="space-y-3">
                  {items.map((item, i) => {
                    const qty = Number(item.quantity || 0);
                    const line = Number(item.price || 0) * qty;
                    return (
                      <div
                        key={`${item.productId || item.title}-${item.variantSku || ""}-${i}`}
                        className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {item.title}
                          </p>
                          {item.variantLabel ? (
                            <p className="mt-0.5 text-xs text-slate-500">{item.variantLabel}</p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                            <span className="rounded-full bg-slate-100 px-3 py-1">
                              Qty: {qty}
                            </span>
                            <span className="rounded-full bg-slate-100 px-3 py-1">
                              Each: {formatMoney(item.price)}
                            </span>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold text-slate-900">{formatMoney(line)}</p>
                          <p className="mt-0.5 text-xs text-slate-500">Line total</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between text-sm text-slate-700">
                    <span>Subtotal</span>
                    <span className="font-semibold text-slate-900">{formatMoney(subtotal)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm text-slate-700">
                    <span>Shipping</span>
                    <span className="text-slate-500">Calculated later</span>
                  </div>
                  <div className="my-3 h-px bg-slate-200" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-900">Total</span>
                    <span className="text-lg font-extrabold text-slate-900">
                      {formatMoney(subtotal)}
                    </span>
                  </div>
                </div>
                <div className="mt-4">
                  <Link
                    to="/cart"
                    className="text-sm font-semibold text-slate-900 hover:underline"
                  >
                    ← Edit cart
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right column: action panel ── */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              {step === "form" ? (
                /* ── Step 1: Place order button ── */
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-900">Place your order</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    By placing the order you agree to our policies.
                  </p>
                  <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className={[
                      "mt-5 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition",
                      "focus:outline-none focus:ring-4",
                      loading
                        ? "cursor-not-allowed bg-slate-200 text-slate-500"
                        : "bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-200",
                    ].join(" ")}
                  >
                    {loading ? (
                      <>
                        <Spinner size={15} />
                        <span>Preparing order…</span>
                      </>
                    ) : (
                      `Place Order • ${formatMoney(subtotal)}`
                    )}
                  </button>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="rounded-full bg-slate-100 px-3 py-1">🔒 Secure payments</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1">📦 Packed soon</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1">↩️ Easy returns</span>
                  </div>
                </div>
              ) : (
                /* ── Step 2: Payment method selection ── */
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  {/* Header */}
                  <div className="border-b border-slate-100 px-5 pt-5 pb-4">
                    <button
                      onClick={() => {
                        setStep("form");
                        setPendingTxnId(null);
                        setPaymentLoading(null);
                        setError("");
                      }}
                      disabled={paymentLoading !== null}
                      className="mb-3 flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="15 18 9 12 15 6" />
                      </svg>
                      Edit details
                    </button>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Choose payment method
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Select how you'd like to complete your purchase.
                    </p>
                  </div>

                  {/* Payment options */}
                  <div className="space-y-2 p-3">
                    {/* SabPaisa card */}
                    <button
                      onClick={handleSabPaisa}
                      disabled={paymentLoading !== null}
                      className={[
                        "w-full flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all",
                        "focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-1",
                        paymentLoading === "sabpaisa"
                          ? "border-slate-300 bg-slate-50 cursor-not-allowed"
                          : paymentLoading !== null
                          ? "border-slate-200 bg-white opacity-50 cursor-not-allowed"
                          : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50 hover:shadow-sm cursor-pointer",
                      ].join(" ")}
                    >
                      {/* Icon badge */}
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        <ShieldIcon />
                      </span>

                      {/* Label */}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900 leading-tight">
                          SabPaisa
                        </span>
                        <span className="block text-xs text-slate-500 mt-0.5">
                          UPI · Cards · Net Banking · Wallets
                        </span>
                      </span>

                      {/* Trailing indicator */}
                      <span className="shrink-0 text-slate-400">
                        {paymentLoading === "sabpaisa" ? (
                          <Spinner size={16} />
                        ) : (
                          <ChevronRight />
                        )}
                      </span>
                    </button>

                    {/* Airpay card */}
                    <button
                      onClick={() => handleAirpay()}
                      disabled={paymentLoading !== null}
                      className={[
                        "w-full flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all",
                        "focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:ring-offset-1",
                        paymentLoading === "airpay"
                          ? "border-indigo-200 bg-indigo-50/60 cursor-not-allowed"
                          : paymentLoading !== null
                          ? "border-slate-200 bg-white opacity-50 cursor-not-allowed"
                          : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 hover:shadow-sm cursor-pointer",
                      ].join(" ")}
                    >
                      {/* Icon badge */}
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                        <CardIcon />
                      </span>

                      {/* Label / redirect notice */}
                      <span className="min-w-0 flex-1">
                        {paymentLoading === "airpay" ? (
                          <span className="block text-sm font-medium text-indigo-700 leading-tight">
                            Redirecting to Airpay…
                          </span>
                        ) : (
                          <>
                            <span className="block text-sm font-semibold text-slate-900 leading-tight">
                              Airpay
                            </span>
                            <span className="block text-xs text-slate-500 mt-0.5">
                              Cards · UPI · Wallets · Net Banking
                            </span>
                          </>
                        )}
                      </span>

                      {/* Trailing indicator */}
                      <span className="shrink-0 text-slate-400">
                        {paymentLoading === "airpay" ? (
                          <Spinner size={16} />
                        ) : (
                          <ChevronRight />
                        )}
                      </span>
                    </button>

                    {/* Airpay 2 card */}
                    <button
                      onClick={() => handleAirpay("airpay2")}
                      disabled={paymentLoading !== null}
                      className={[
                        "w-full flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all",
                        "focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:ring-offset-1",
                        paymentLoading === "airpay2"
                          ? "border-indigo-200 bg-indigo-50/60 cursor-not-allowed"
                          : paymentLoading !== null
                          ? "border-slate-200 bg-white opacity-50 cursor-not-allowed"
                          : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 hover:shadow-sm cursor-pointer",
                      ].join(" ")}
                    >
                      {/* Icon badge */}
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                        <CardIcon />
                      </span>

                      {/* Label / redirect notice */}
                      <span className="min-w-0 flex-1">
                        {paymentLoading === "airpay2" ? (
                          <span className="block text-sm font-medium text-indigo-700 leading-tight">
                            Redirecting to Airpay 2…
                          </span>
                        ) : (
                          <>
                            <span className="block text-sm font-semibold text-slate-900 leading-tight">
                              Airpay 2
                            </span>
                            <span className="block text-xs text-slate-500 mt-0.5">
                              Cards · UPI · Wallets · Net Banking
                            </span>
                          </>
                        )}
                      </span>

                      {/* Trailing indicator */}
                      <span className="shrink-0 text-slate-400">
                        {paymentLoading === "airpay2" ? (
                          <Spinner size={16} />
                        ) : (
                          <ChevronRight />
                        )}
                      </span>
                    </button>
                  </div>

                  {/* Footer */}
                  <div className="border-t border-slate-100 px-5 py-4">
                    <p className="text-xs text-slate-500">
                      Order total:{" "}
                      <span className="font-semibold text-slate-800">{formatMoney(subtotal)}</span>
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="rounded-full bg-slate-50 border border-slate-100 px-2.5 py-1">
                        🔒 Secure payments
                      </span>
                      <span className="rounded-full bg-slate-50 border border-slate-100 px-2.5 py-1">
                        📦 Packed soon
                      </span>
                      <span className="rounded-full bg-slate-50 border border-slate-100 px-2.5 py-1">
                        ↩️ Easy returns
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
