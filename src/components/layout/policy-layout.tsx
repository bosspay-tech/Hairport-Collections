import Link from "next/link";
import type { ReactNode } from "react";

export function PolicyLayout({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-[70vh] bg-linear-to-b from-rose-50 via-white to-rose-50/40">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="rounded-3xl border border-rose-100 bg-white p-6 shadow-sm">
          <div className="text-sm text-rose-600">
            <Link href="/" className="hover:text-rose-900">
              Home
            </Link>
            <span className="mx-2 text-rose-300">/</span>
            <span className="font-semibold text-rose-950">{title}</span>
          </div>
          <h1 className="mt-3 font-display text-3xl text-rose-950">{title}</h1>
        </div>

        <div className="mt-6 space-y-6 rounded-3xl border border-rose-100 bg-white p-6 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}

export function PolicySection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm font-bold text-rose-950">{title}</h2>
      <div className="mt-2 text-sm leading-7 text-rose-700">{children}</div>
    </section>
  );
}
