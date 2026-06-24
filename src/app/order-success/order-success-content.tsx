"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/utils";

function normalizeStatus(raw?: string | null) {
  const value = String(raw || "").toLowerCase().trim();
  if (value === "success" || value === "confirmed") return "success";
  if (value === "failed") return "failed";
  return "unknown";
}

export default function OrderSuccessPage() {
  const searchParams = useSearchParams();
  const status = normalizeStatus(searchParams.get("status"));
  const txnId =
    searchParams.get("txn") || searchParams.get("clientTxnId") || "";
  const amount = searchParams.get("amount") || "";
  const message = searchParams.get("message") || "";

  const isSuccess = status === "success";
  const isUnknown = status === "unknown";

  const icon = useMemo(() => {
    if (isSuccess) return <CheckCircle2 className="h-8 w-8 text-emerald-600" />;
    if (isUnknown) return <Clock3 className="h-8 w-8 text-amber-600" />;
    return <XCircle className="h-8 w-8 text-red-600" />;
  }, [isSuccess, isUnknown]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-linear-to-b from-rose-50/60 to-white px-4 py-12">
      <div className="w-full max-w-lg rounded-[2rem] border border-rose-100 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50">
          {icon}
        </div>
        <h1 className="font-display text-3xl text-rose-950">
          {isSuccess
            ? "Order placed successfully"
            : isUnknown
              ? "Order received"
              : "Order failed"}
        </h1>
        <p className="mt-2 text-sm text-rose-600">
          {isSuccess
            ? "Thank you! We will contact you for delivery and payment details."
            : isUnknown
              ? "Your order details were saved. Our team will confirm shortly."
              : message || "Something went wrong while placing your order."}
        </p>
        {txnId ? (
          <p className="mt-4 text-xs text-rose-500">
            Order reference: <span className="font-semibold">{txnId}</span>
          </p>
        ) : null}
        {amount ? (
          <p className="text-xs text-rose-500">
            Amount: <span className="font-semibold">{formatMoney(amount)}</span>
          </p>
        ) : null}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/products">
            <Button>Continue shopping</Button>
          </Link>
          <Link href="/orders">
            <Button variant="outline">View my orders</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
