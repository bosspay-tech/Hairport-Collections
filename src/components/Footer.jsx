import { Link } from "react-router-dom";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-14 border-t border-rose-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {/* Top */}
        <div className="grid gap-10 lg:grid-cols-12">
          {/* Brand */}
          <div className="lg:col-span-4">
            <Link
              to="/"
              className="inline-flex items-center gap-3 rounded-2xl px-2 py-1 font-extrabold tracking-tight text-rose-950 hover:bg-rose-50"
              aria-label="Go to homepage"
            >
              <img src="/hairport_logo.png" alt="logo" className="h-18 w-28" />
            </Link>

            <p className="mt-4 max-w-sm text-sm leading-6 text-rose-700">
              Premium products, simple checkout, and fast support.
            </p>
            <p className="mt-4 max-w-sm text-sm leading-6 text-rose-700">
              Premium products, simple checkout, and fast support.
            </p>

            {/* Business Details */}
            <div className="mt-5 space-y-1 text-sm text-rose-700">
              <div className="font-semibold text-rose-950">
                THE HAIRPORT SALOON
              </div>
              <div>
                70/29, Arumbakkam, <br />
                Thirukural Street, MMDA Colony, <br />
                Chennai - 600106
              </div>
              <div className="mt-2">📞 +91 93636 25841</div>
              <div className="text-xs text-rose-600 mt-2">
                GST: 33DJZPG1620K1Z0
              </div>
              <div className="text-xs text-rose-600">
                UDYAM REG: UDYAM-TN-34-0100208
              </div>
            </div>

            {/* Trust badges */}
            <div className="mt-5 flex flex-wrap gap-2 text-xs text-rose-700">
              <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1">
                🔒 Secure payments
              </span>
              <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1">
                🚚 Fast shipping
              </span>
              <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1">
                ↩️ Easy returns
              </span>
            </div>

            {/* Newsletter (optional) */}
            <div className="mt-6 rounded-3xl border border-rose-200 bg-linear-to-b from-rose-50 to-white p-4">
              <div className="text-sm font-semibold text-rose-950">
                Get style drops & offers
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  placeholder="Enter your email"
                  className="w-full rounded-2xl border border-rose-200 bg-white px-4 py-2.5 text-sm text-rose-950 outline-none transition focus:border-pink-400 focus:ring-4 focus:ring-pink-100"
                />
                <button className="shrink-0 rounded-2xl bg-rose-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-900 focus:outline-none focus:ring-4 focus:ring-rose-200">
                  Join
                </button>
              </div>
              <p className="mt-2 text-xs text-rose-600">
                No spam. Unsubscribe anytime.
              </p>
            </div>
          </div>

          {/* Link Columns */}
          <div className="lg:col-span-8">
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
              <div>
                <h4 className="text-sm font-bold text-rose-950">Shop</h4>
                <ul className="mt-4 space-y-2.5 text-sm">
                  <li>
                    <Link
                      className="text-rose-700 hover:text-rose-950"
                      to="/products"
                    >
                      All Products
                    </Link>
                  </li>
                  <li>
                    <Link
                      className="text-rose-700 hover:text-rose-950"
                      to="/cart"
                    >
                      Cart
                    </Link>
                  </li>
                  <li>
                    <Link
                      className="text-rose-700 hover:text-rose-950"
                      to="/orders"
                    >
                      Orders
                    </Link>
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="text-sm font-bold text-rose-950">Support</h4>
                <ul className="mt-4 space-y-2.5 text-sm">
                  <li>
                    <Link
                      className="text-rose-700 hover:text-rose-950"
                      to="/shipping"
                    >
                      Shipping Policy
                    </Link>
                  </li>
                  <li>
                    <Link
                      className="text-rose-700 hover:text-rose-950"
                      to="/returns-refunds"
                    >
                      Returns & Refunds
                    </Link>
                  </li>
                </ul>

                <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <div className="text-xs font-semibold text-rose-950">
                    Customer care
                  </div>
                  <div className="mt-1 text-xs text-rose-700">
                    Email: support@homeportcollections.com
                  </div>
                  <div className="mt-1 text-xs text-rose-700">
                    Hours: Mon–Sat • 10am–6pm
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-rose-950">Company</h4>
                <ul className="mt-4 space-y-2.5 text-sm">
                  <li>
                    <Link
                      className="text-rose-700 hover:text-rose-950"
                      to="/privacy-policy"
                    >
                      Privacy Policy
                    </Link>
                  </li>
                  <li>
                    <Link
                      className="text-rose-700 hover:text-rose-950"
                      to="/terms-of-service"
                    >
                      Terms of Service
                    </Link>
                  </li>
                  <li>
                    <Link
                      className="text-rose-700 hover:text-rose-950"
                      to="/contact"
                    >
                      Contact
                    </Link>
                  </li>
                </ul>

                <div className="mt-5 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-rose-200 bg-white px-3 py-1 text-rose-700">
                    ✨ New arrivals weekly
                  </span>
                  <span className="rounded-full border border-rose-200 bg-white px-3 py-1 text-rose-700">
                    ✅ Quality checked
                  </span>
                </div>
              </div>
            </div>

            {/* Mini bar */}
            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {[
                { t: "Free shipping", d: "On orders above ₹999" },
                { t: "Easy returns", d: "7-day return window" },
                { t: "Secure checkout", d: "UPI / Cards / Wallets" },
              ].map((x) => (
                <div
                  key={x.t}
                  className="rounded-2xl border border-rose-200 bg-white p-4"
                >
                  <div className="text-sm font-semibold text-rose-950">
                    {x.t}
                  </div>
                  <div className="mt-1 text-xs text-rose-600">{x.d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-10 flex flex-col gap-4 border-t border-rose-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-rose-600">
            © {year} Store. All rights reserved.
          </p>

          <div className="flex flex-wrap items-center gap-3 text-xs text-rose-700">
            <Link className="hover:text-rose-950" to="/privacy-policy">
              Privacy
            </Link>
            <span className="text-rose-200">•</span>
            <Link className="hover:text-rose-950" to="/terms-of-service">
              Terms
            </Link>
            <span className="text-rose-200">•</span>
            <Link className="hover:text-rose-950" to="/returns-refunds">
              Returns
            </Link>
            <span className="text-rose-200">•</span>
            <Link className="hover:text-rose-950" to="/shipping">
              Shipping
            </Link>
          </div>

          <div className="flex items-center gap-2 text-xs text-rose-700">
            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1">
              Visa / Mastercard / UPI
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
