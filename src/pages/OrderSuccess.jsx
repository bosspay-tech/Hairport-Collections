import { Link, useLocation } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCartStore } from "../store/cart.store";

// Payment verification happens on the bridge server; this page only needs to
// read the status/txn/amount/message that the server already set on the
// redirect query string after decrypting SabPaisa's callback. If the user
// lands here without a terminal status (e.g. SabPaisa's browser-redirect
// dropped `encResponse` or routed them back too fast), we short-poll the
// server's on-demand status probe for ~20 s.

const PROBE_INTERVAL_MS = 2_000;
const PROBE_MAX_ATTEMPTS = 10;

function formatMoney(value) {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return value || "";
  return `₹${num.toFixed(0)}`;
}

function normalizeStatus(raw) {
  const value = String(raw || "").toLowerCase().trim();
  if (value === "success" || value === "failed") return value;
  if (value === "pending" || value === "initiated") return "unknown";
  return "unknown";
}

export default function OrderSuccess() {
  const location = useLocation();
  const { clearCart } = useCartStore();
  const cartClearedRef = useRef(false);

  const query = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );

  const [status, setStatus] = useState(() => normalizeStatus(query.get("status")));
  const [txnId] = useState(() => query.get("txn") || query.get("clientTxnId") || "");
  const [amount, setAmount] = useState(() => query.get("amount") || "");
  const [message] = useState(() => query.get("message") || "");

  useEffect(() => {
    if (status === "success" && !cartClearedRef.current) {
      cartClearedRef.current = true;
      clearCart();
    }
  }, [status, clearCart]);

  useEffect(() => {
    if (status !== "unknown" || !txnId) return;

    let cancelled = false;
    let attempt = 0;
    let timer = null;

    const probe = async () => {
      if (cancelled) return;
      attempt += 1;
      try {
        const resp = await fetch(
          `/api/hairport/status/${encodeURIComponent(txnId)}`,
          { headers: { accept: "application/json" } },
        );
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const body = await resp.json();
        if (cancelled) return;

        const next = normalizeStatus(body?.status);
        if (next === "success" || next === "failed") {
          setStatus(next);
          if (!amount && body?.amount) setAmount(String(body.amount));
          return;
        }
        if (attempt < PROBE_MAX_ATTEMPTS) {
          timer = setTimeout(probe, PROBE_INTERVAL_MS);
        }
      } catch {
        if (!cancelled && attempt < PROBE_MAX_ATTEMPTS) {
          timer = setTimeout(probe, PROBE_INTERVAL_MS);
        }
      }
    };

    timer = setTimeout(probe, PROBE_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [status, txnId, amount]);

  const isSuccess = status === "success";
  const isUnknown = status === "unknown";

  return (
    <div className="min-h-[70vh] bg-linear-to-b from-slate-50 to-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          <div
            className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${
              isSuccess
                ? "bg-emerald-50"
                : isUnknown
                  ? "bg-amber-50"
                  : "bg-red-50"
            }`}
          >
            <span className="text-2xl">
              {isSuccess ? "✅" : isUnknown ? "⏳" : "❌"}
            </span>
          </div>

          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
            {isSuccess
              ? "Payment successful"
              : isUnknown
                ? "Payment status pending"
                : "Payment failed"}
          </h2>

          <p className="mt-2 text-sm text-slate-600">
            {isSuccess
              ? "Your order has been placed successfully."
              : isUnknown
                ? "We received a payment response, but the final status could not be confirmed yet."
                : message || "Something went wrong with your payment."}
          </p>

          {txnId ? (
            <div className="mt-4 text-xs text-slate-500">
              Transaction ID: <span className="font-semibold">{txnId}</span>
            </div>
          ) : null}

          {amount ? (
            <div className="text-xs text-slate-500">
              Amount:{" "}
              <span className="font-semibold">{formatMoney(amount)}</span>
            </div>
          ) : null}

          <div className="my-6 h-px w-full bg-slate-200" />

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/products"
              className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Continue shopping
            </Link>

            <Link
              to="/orders"
              className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              View my orders
            </Link>
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-2 text-xs text-slate-600">
            <span className="rounded-full bg-slate-100 px-3 py-1">
              📦 Packed soon
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1">
              🚚 Fast delivery
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1">
              🔒 Secure payments
            </span>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          Need help? Visit{" "}
          <Link
            to="/contact"
            className="font-semibold text-slate-900 hover:underline"
          >
            Help Center
          </Link>
        </p>
      </div>
    </div>
  );
}
