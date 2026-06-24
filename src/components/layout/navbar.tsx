"use client";

import { useEffect, useState } from "react";
import NextImage from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  ShoppingBag,
  User,
  X,
  LogOut,
  Package,
  Settings,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { checkIsAdmin } from "@/lib/admin-api";
import { useCartStore } from "@/store/cart-store";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/products", label: "Shop" },
  { href: "/contact", label: "Contact" },
];

export function Navbar() {
  const pathname = usePathname();
  const { user, loading, signOut } = useAuth();
  const cartCount = useCartStore((s) => s.count());
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <header className="sticky top-0 z-50 border-b border-rose-100/80 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto h-16 max-w-7xl px-4 sm:px-6" />
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-50 border-b border-rose-100/80 bg-white/70 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="group flex items-center gap-3"
          onClick={() => setOpen(false)}
        >
          <NextImage
            src="/hairport_logo.png"
            alt="The Hairport Salon"
            width={100}
            height={100}
            className="h-11 w-auto"
            priority
          />
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-medium transition",
                pathname.startsWith(link.href)
                  ? "bg-rose-100 text-rose-900"
                  : "text-rose-700 hover:bg-rose-50 hover:text-rose-900",
              )}
            >
              {link.label}
            </Link>
          ))}

          <Link
            href="/cart"
            className="ml-2 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
          >
            <ShoppingBag className="h-4 w-4" />
            Cart
            <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white">
              {cartCount}
            </span>
          </Link>

          {user ? (
            <>
              <Link
                href="/orders"
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
              >
                <Package className="h-4 w-4" />
                Orders
              </Link>
              <button
                type="button"
                onClick={() => signOut()}
                className="ml-2 inline-flex items-center gap-2 rounded-2xl bg-rose-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-800"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
              >
                <User className="h-4 w-4" />
                Login
              </Link>
              <Link
                href="/signup"
                className="ml-2 rounded-2xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-400"
              >
                Sign up
              </Link>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <Link
            href="/cart"
            className="relative rounded-xl p-2 text-rose-800"
            onClick={() => setOpen(false)}
          >
            <ShoppingBag className="h-5 w-5" />
            {cartCount > 0 ? (
              <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {cartCount}
              </span>
            ) : null}
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-xl border border-rose-200 p-2 text-rose-900"
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {open ? (
        <div className="border-t border-rose-100 bg-white/95 px-4 py-4 md:hidden">
          <div className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-rose-800 hover:bg-rose-50"
              >
                {link.label}
              </Link>
            ))}
            {user ? (
              <>
                <Link
                  href="/orders"
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-2.5 text-sm font-medium text-rose-800 hover:bg-rose-50"
                >
                  My Orders
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    signOut();
                  }}
                  className="mt-2 rounded-2xl bg-rose-900 px-4 py-2.5 text-left text-sm font-semibold text-white"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="rounded-xl px-3 py-2.5 text-sm font-medium text-rose-800 hover:bg-rose-50"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setOpen(false)}
                  className="mt-2 rounded-2xl bg-rose-500 px-4 py-2.5 text-center text-sm font-semibold text-white"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
