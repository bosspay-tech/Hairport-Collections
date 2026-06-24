import Link from "next/link";
import { AdminRoute } from "@/components/auth/admin-route";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminRoute>
      <div className="min-h-[70vh] bg-linear-to-b from-rose-50/60 via-white to-white">
        <div className="border-b border-rose-100 bg-white/80">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-4 sm:px-6">
            <div>
              <p className="text-xs font-bold tracking-[0.2em] text-rose-500 uppercase">
                Admin
              </p>
              <h1 className="font-display text-2xl text-rose-950">Store management</h1>
            </div>
            <nav className="flex flex-wrap gap-2">
              <Link
                href="/admin/products"
                className="rounded-xl bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-900 transition hover:bg-rose-200"
              >
                Products
              </Link>
              <Link
                href="/products"
                className="rounded-xl px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
              >
                View shop
              </Link>
            </nav>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</div>
      </div>
    </AdminRoute>
  );
}
