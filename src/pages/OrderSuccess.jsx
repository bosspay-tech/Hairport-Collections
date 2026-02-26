import { Link } from "react-router-dom";

export default function OrderSuccess() {
  return (
    <div className="min-h-[70vh] bg-linear-to-b from-slate-50 to-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center">
          {/* Icon */}
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
            <span className="text-2xl">✅</span>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Order placed successfully
          </h2>

          {/* Subtitle */}
          <p className="mt-2 text-sm text-slate-600">
            Thank you for shopping with us. We’re getting your order ready and
            will update you soon.
          </p>

          {/* Divider */}
          <div className="my-6 h-px w-full bg-slate-200" />

          {/* Actions */}
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/products"
              className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200"
            >
              Continue shopping
            </Link>

            <Link
              to="/orders"
              className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100"
            >
              View my orders
            </Link>
          </div>

          {/* Tiny trust row */}
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

        {/* Optional footer text */}
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
