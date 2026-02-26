import React from "react";
import { Link } from "react-router-dom";

export default function ShippingPolicy() {
  return (
    <div className="min-h-[70vh] bg-linear-to-b from-rose-50 via-pink-50 to-white">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        {/* Header */}
        <div className="rounded-3xl border border-rose-200 bg-white p-6 shadow-sm">
          <div className="text-sm text-rose-600">
            <Link to="/" className="hover:text-rose-900">
              Home
            </Link>{" "}
            <span className="text-rose-300">/</span>{" "}
            <span className="font-semibold text-rose-950">Shipping Policy</span>
          </div>

          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-rose-950 sm:text-3xl">
            Shipping Policy
          </h1>
        </div>

        {/* Content */}
        <div className="mt-6 space-y-5 rounded-3xl border border-rose-200 bg-white p-6 shadow-sm">
          <section>
            <h2 className="text-sm font-bold text-rose-950">
              Shipping Locations
            </h2>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              We currently ship across India. If your location is not
              serviceable, you will be informed at checkout or during order
              confirmation.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">
              Order Processing
            </h2>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              Orders are usually processed within{" "}
              <span className="font-semibold">24–48 hours</span> (excluding
              Sundays and public holidays). During high-volume sale periods,
              processing may take longer.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">
              Delivery Timelines
            </h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-rose-700">
              <li>Metro cities: 2–5 business days</li>
              <li>Other cities/towns: 3–7 business days</li>
              <li>Remote locations: 5–10 business days</li>
            </ul>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              Timelines are estimates and may vary due to courier delays,
              weather, strikes, or unforeseen events.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">
              Shipping Charges
            </h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-rose-700">
              <li>
                Free shipping on orders above{" "}
                <span className="font-semibold">₹999</span> (example)
              </li>
              <li>
                Flat shipping fee of <span className="font-semibold">₹79</span>{" "}
                below the threshold (example)
              </li>
            </ul>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              Exact charges (if applicable) will be shown at checkout.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">
              Tracking Your Order
            </h2>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              Once shipped, you will receive tracking details via SMS/email. You
              can also view order status in your account (if available).
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">
              Delivery Attempts
            </h2>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              Couriers typically attempt delivery 2–3 times. If delivery fails,
              the shipment may be returned to us. Re-shipping may incur
              additional charges.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">Contact</h2>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              Questions about shipping? Email us at{" "}
              <span className="font-semibold">support@homeportcollections.com</span>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
