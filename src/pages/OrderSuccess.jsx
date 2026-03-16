import { Link, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useCartStore } from "../store/cart.store";
import { parsePaymentResponse } from "sabpaisa-pg-dev";

const authKey = import.meta.env.VITE_SABPAISA_AUTHENTICATION_KEY;
const authIV = import.meta.env.VITE_SABPAISA_AUTHENTICATION_IV;

function formatMoney(value) {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return value || "";
  return `₹${num.toFixed(0)}`;
}

function normalizeObject(data) {
  if (!data) return {};

  if (typeof data === "object" && !Array.isArray(data)) {
    return data;
  }

  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data);
      return parsed && typeof parsed === "object" ? parsed : { raw: data };
    } catch {
      return { raw: data };
    }
  }

  return { raw: String(data) };
}

function getValue(obj, keys = []) {
  if (!obj || typeof obj !== "object") return "";

  for (const key of keys) {
    if (
      obj[key] !== undefined &&
      obj[key] !== null &&
      String(obj[key]).trim() !== ""
    ) {
      return obj[key];
    }

    const matchedKey = Object.keys(obj).find(
      (existingKey) => existingKey.toLowerCase() === key.toLowerCase(),
    );

    if (
      matchedKey &&
      obj[matchedKey] !== undefined &&
      obj[matchedKey] !== null &&
      String(obj[matchedKey]).trim() !== ""
    ) {
      return obj[matchedKey];
    }
  }

  return "";
}

function resolvePaymentStatus(response) {
  const statusValue = String(
    getValue(response, [
      "status",
      "txnStatus",
      "paymentStatus",
      "spRespStatus",
      "responseStatus",
      "txn_status",
      "payment_status",
      "responseCode",
      "spRespCode",
    ]) || "",
  ).toLowerCase();

  const messageValue = String(
    getValue(response, [
      "message",
      "statusMessage",
      "responseMessage",
      "spRespMessage",
      "statusDesc",
      "txnMessage",
    ]) || "",
  ).toLowerCase();

  const combined = `${statusValue} ${messageValue}`;

  const successChecks = [
    "success",
    "successful",
    "succeeded",
    "captured",
    "completed",
    "approved",
    "paid",
    "0300",
  ];

  const failedChecks = [
    "fail",
    "failed",
    "failure",
    "declined",
    "cancelled",
    "canceled",
    "aborted",
    "error",
    "invalid",
  ];

  if (successChecks.some((word) => combined.includes(word))) {
    return "success";
  }

  if (failedChecks.some((word) => combined.includes(word))) {
    return "failed";
  }

  return "unknown";
}

export default function OrderSuccess() {
  const location = useLocation();
  const { clearCart } = useCartStore();
  const handledRef = useRef(false);

  const [responseEntries, setResponseEntries] = useState([]);
  const [status, setStatus] = useState("processing");
  const [txnId, setTxnId] = useState("");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");

  const updateOrder = async (transactionId, orderStatus) => {
    if (!transactionId) return;

    const { error } = await supabase
      .from("orders")
      .update({ status: orderStatus })
      .eq("transaction_id", transactionId);

    if (error) {
      throw new Error(error.message);
    }
  };

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const parseResponse = async () => {
      try {
        const data = await parsePaymentResponse(authKey, authIV);
        const parsed = normalizeObject(data);

        setResponseEntries(Object.entries(parsed));

        const query = new URLSearchParams(location.search);

        const resolvedTxnId = String(
          getValue(parsed, [
            "clientTxnId",
            "client_txn_id",
            "clientTransactionId",
            "txnId",
            "txn_id",
            "transId",
            "transactionId",
          ]) ||
            query.get("clientTxnId") ||
            query.get("txnId") ||
            "",
        );

        const resolvedAmount = String(
          getValue(parsed, [
            "amount",
            "txnAmount",
            "paidAmount",
            "transAmount",
          ]) ||
            query.get("amount") ||
            "",
        );

        const resolvedMessage = String(
          getValue(parsed, [
            "message",
            "statusMessage",
            "responseMessage",
            "spRespMessage",
            "statusDesc",
            "txnMessage",
          ]) || "",
        );

        const resolvedStatus = resolvePaymentStatus(parsed);

        setTxnId(resolvedTxnId);
        setAmount(resolvedAmount);
        setMessage(resolvedMessage);

        if (resolvedStatus === "success") {
          await updateOrder(resolvedTxnId, "success");
          clearCart();
          setStatus("success");
          return;
        }

        if (resolvedStatus === "failed") {
          await updateOrder(resolvedTxnId, "failed");
          setStatus("failed");
          return;
        }

        await updateOrder(resolvedTxnId, "pending");
        setStatus("unknown");
      } catch (error) {
        console.error("Error parsing payment response:", error);
        setMessage(error?.message || "Unable to verify payment response.");
        setStatus("failed");
      }
    };

    parseResponse();
  }, [clearCart, location.search]);

  if (status === "processing") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        Processing payment...
      </div>
    );
  }

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

          {responseEntries.length ? (
            <details className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
              <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                Payment response details
              </summary>

              <div className="mt-3 space-y-2 text-xs text-slate-600">
                {responseEntries.map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-start justify-between gap-3 border-b border-slate-200 pb-2"
                  >
                    <span className="font-medium text-slate-700">{key}</span>
                    <span className="text-right break-all">
                      {typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          Need help? Visit{" "}
          <Link
            to="/help"
            className="font-semibold text-slate-900 hover:underline"
          >
            Help Center
          </Link>
        </p>
      </div>
    </div>
  );
}
