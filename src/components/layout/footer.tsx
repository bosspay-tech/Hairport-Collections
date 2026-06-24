import Link from "next/link";
import { Mail, MapPin, Phone, ShieldCheck, Truck, Undo2 } from "lucide-react";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-rose-100 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-linear-to-br from-rose-500 to-rose-800 text-sm font-bold text-white">
                HP
              </div>
              <div>
                <p className="font-display text-xl text-rose-950">The Hairport Salon</p>
                <p className="text-xs tracking-[0.18em] text-rose-500 uppercase">
                  Premium beauty & care
                </p>
              </div>
            </div>

            <p className="mt-5 max-w-sm text-sm leading-7 text-rose-600">
              Salon-grade hair and skin essentials with a modern shopping experience,
              secure checkout, and fast support.
            </p>

            <div className="mt-6 space-y-3 text-sm text-rose-700">
              <div className="flex gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                <p>
                  No : 70, Q Block, Thirukurlar Street, MMDA Colony,
                  Arumbakkam, Chennai, Tamil Nadu 600106
                </p>
              </div>
              <a href="tel:+919363625841" className="flex items-center gap-3 hover:text-rose-950">
                <Phone className="h-4 w-4 text-rose-500" />
                +91 93636 25841
              </a>
              <a
                href="mailto:support@homeportcollections.com"
                className="flex items-center gap-3 hover:text-rose-950"
              >
                <Mail className="h-4 w-4 text-rose-500" />
                support@homeportcollections.com
              </a>
            </div>

            <div className="mt-5 flex flex-wrap gap-2 text-xs text-rose-600">
              <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1">
                GST: 33DJZPG1620K1Z0
              </span>
              <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1">
                UDYAM-TN-34-0100208
              </span>
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-3 lg:col-span-8">
            <div>
              <h4 className="text-sm font-bold text-rose-950">Shop</h4>
              <ul className="mt-4 space-y-3 text-sm text-rose-700">
                <li><Link href="/products" className="hover:text-rose-950">All Products</Link></li>
                <li><Link href="/products?category=hair-care" className="hover:text-rose-950">Hair Care</Link></li>
                <li><Link href="/products?category=skin-care" className="hover:text-rose-950">Skin Care</Link></li>
                <li><Link href="/cart" className="hover:text-rose-950">Cart</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-bold text-rose-950">Support</h4>
              <ul className="mt-4 space-y-3 text-sm text-rose-700">
                <li><Link href="/shipping" className="hover:text-rose-950">Shipping Policy</Link></li>
                <li><Link href="/returns-refunds" className="hover:text-rose-950">Returns & Refunds</Link></li>
                <li><Link href="/contact" className="hover:text-rose-950">Contact</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-bold text-rose-950">Company</h4>
              <ul className="mt-4 space-y-3 text-sm text-rose-700">
                <li><Link href="/privacy-policy" className="hover:text-rose-950">Privacy Policy</Link></li>
                <li><Link href="/terms-of-service" className="hover:text-rose-950">Terms of Service</Link></li>
                <li><Link href="/orders" className="hover:text-rose-950">My Orders</Link></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            { icon: Truck, title: "Free shipping", desc: "On orders above ₹999" },
            { icon: Undo2, title: "Easy returns", desc: "7-day return window" },
            { icon: ShieldCheck, title: "Secure checkout", desc: "UPI / Cards / Wallets" },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-3xl border border-rose-100 bg-rose-50/60 p-5"
            >
              <item.icon className="h-5 w-5 text-rose-500" />
              <p className="mt-3 text-sm font-semibold text-rose-950">{item.title}</p>
              <p className="mt-1 text-xs text-rose-600">{item.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-rose-100 pt-6 text-xs text-rose-600 sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} The Hairport Salon. All rights reserved.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/privacy-policy" className="hover:text-rose-950">Privacy</Link>
            <Link href="/terms-of-service" className="hover:text-rose-950">Terms</Link>
            <Link href="/returns-refunds" className="hover:text-rose-950">Returns</Link>
            <Link href="/shipping" className="hover:text-rose-950">Shipping</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
