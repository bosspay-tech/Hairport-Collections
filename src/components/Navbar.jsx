import { useMemo, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../features/auth/useAuth";
import { signOut } from "../features/auth/auth.service";
import { useCartStore } from "../store/cart.store";

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

export default function Navbar() {
  const { user, loading } = useAuth();
  const items = useCartStore((s) => s.items);
  const [open, setOpen] = useState(false);

  const cartCount = useMemo(
    () => items.reduce((sum, it) => sum + (it.qty ?? 1), 0),
    [items],
  );

  if (loading) return null;

  const NavItem = ({ to, children, onClick }) => (
    <NavLink
      to={to}
      onClick={(e) => {
        onClick?.(e);
        setOpen(false);
      }}
      className={({ isActive }) =>
        cx(
          "rounded-lg px-3 py-2 text-sm font-medium transition",
          "hover:bg-rose-100 hover:text-rose-900",
          isActive ? "bg-rose-100 text-rose-900" : "text-rose-700",
        )
      }
    >
      {children}
    </NavLink>
  );

  return (
    <header className="sticky top-0 z-50 border-b border-rose-200 bg-white/80 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        {/* BRAND */}
        <div className="flex items-center gap-3">
          <Link
            to="/"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-xl px-2 py-1 font-bold tracking-tight text-rose-950 hover:bg-rose-100"
            aria-label="Go to homepage"
          >
            <img src="/hairport_logo.png" alt="logo" className="h-18 w-24"/>
          </Link>
        </div>

        {/* DESKTOP */}
        <div className="hidden items-center gap-2 md:flex">
          <NavItem to="/cart">
            <span className="flex items-center gap-2">
              Cart
              <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-pink-500 px-2 py-0.5 text-xs font-semibold text-white">
                {cartCount}
              </span>
            </span>
          </NavItem>

          {user ? (
            <>
              <NavItem to="/orders">My Orders</NavItem>
              <button
                onClick={() => {
                  setOpen(false);
                  signOut();
                }}
                className="rounded-xl bg-pink-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-pink-400 focus:outline-none focus:ring-4 focus:ring-pink-300"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <NavItem to="/login">Login</NavItem>
              <Link
                to="/signup"
                onClick={() => setOpen(false)}
                className="rounded-xl bg-pink-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-pink-400 focus:outline-none focus:ring-4 focus:ring-pink-300"
              >
                Sign up
              </Link>
            </>
          )}
        </div>

        {/* MOBILE */}
        <div className="flex items-center gap-2 md:hidden">
          <Link
            to="/cart"
            onClick={() => setOpen(false)}
            className="relative rounded-xl px-3 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-100"
            aria-label="Cart"
          >
            Cart
            {cartCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-pink-500 px-1 text-[11px] font-bold text-white">
                {cartCount}
              </span>
            ) : null}
          </Link>

          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-900 hover:bg-rose-50 focus:outline-none focus:ring-4 focus:ring-pink-200"
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </nav>

      {/* MOBILE DROPDOWN */}
      <div className={cx("md:hidden", open ? "block" : "hidden")}>
        <div className="mx-auto max-w-6xl border-t border-rose-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-1">
            {user ? (
              <>
                <NavItem to="/orders">My Orders</NavItem>
                <button
                  onClick={() => {
                    setOpen(false);
                    signOut();
                  }}
                  className="mt-2 w-full rounded-xl bg-pink-500 px-4 py-2 text-left text-sm font-semibold text-white transition hover:bg-pink-400 focus:outline-none focus:ring-4 focus:ring-pink-300"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <NavItem to="/login">Login</NavItem>
                <Link
                  to="/signup"
                  onClick={() => setOpen(false)}
                  className="mt-2 w-full rounded-xl bg-pink-500 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-pink-400 focus:outline-none focus:ring-4 focus:ring-pink-300"
                >
                  Sign up
                </Link>
              </>
            )}

            <p className="mt-3 text-xs text-rose-500">
              Secure checkout • Fast support • Easy returns
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
