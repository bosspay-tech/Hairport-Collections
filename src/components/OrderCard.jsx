import toast from "react-hot-toast";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function formatMoney(n) {
  const num = Number(n || 0);
  return `₹${num.toFixed(0)}`;
}

function statusStyles(status = "") {
  const s = String(status).toLowerCase();
  if (s.includes("delivered"))
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s.includes("shipped") || s.includes("out"))
    return "bg-blue-50 text-blue-700 border-blue-200";
  if (s.includes("cancel")) return "bg-red-50 text-red-700 border-red-200";
  if (s.includes("pending") || s.includes("processing"))
    return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

export default function OrderCard({ order }) {
  const orderNo = order?.id ? String(order.id).slice(0, 8).toUpperCase() : "—";
  const dateStr = order?.created_at
    ? new Date(order.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

  const items = Array.isArray(order?.items) ? order.items : [];
  const total =
    typeof order?.total !== "undefined"
      ? Number(order.total)
      : items.reduce(
          (sum, it) => sum + Number(it.price || 0) * Number(it.quantity || 0),
          0,
        );

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wide text-slate-500">
            ORDER #{orderNo}
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">{dateStr}</p>
        </div>

        <span
          className={cx(
            "inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold",
            statusStyles(order?.status),
          )}
        >
          {order?.status || "Unknown"}
        </span>
      </div>

      {/* Items */}
      <div className="px-5 py-4">
        <div className="space-y-3">
          {items.map((item, i) => {
            const qty = Number(item?.quantity || 0);
            const lineTotal = Number(item?.price || 0) * qty;

            return (
              <div
                key={item?.id || item?.sku || `${item?.title}-${i}`}
                className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {item?.title || "Item"}
                  </p>

                  {item?.variantLabel ? (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {item.variantLabel}
                    </p>
                  ) : null}

                  <div className="mt-2 inline-flex items-center gap-2 text-xs text-slate-600">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5">
                      Qty: {qty}
                    </span>
                    <span className="text-slate-400">•</span>
                    <span>{formatMoney(item?.price)} each</span>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-slate-900">
                    {formatMoney(lineTotal)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">Line total</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between text-sm text-slate-700">
            <span>Items</span>
            <span className="font-semibold">{items.length}</span>
          </div>

          <div className="mt-2 flex items-center justify-between text-sm text-slate-900">
            <span className="font-semibold">Total</span>
            <span className="text-lg font-extrabold">{formatMoney(total)}</span>
          </div>
        </div>
      </div>

      {/* Footer (optional actions) */}
      <div className="flex flex-col gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">
          Need help? Contact support with Order #{orderNo}.
        </p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(String(order?.id || ""));
              toast.success('Order Id copied to clipboard');
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100"
          >
            Copy Order ID
          </button>
        </div>
      </div>
    </div>
  );
}
