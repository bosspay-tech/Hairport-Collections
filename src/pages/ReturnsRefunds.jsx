import React from "react";
import { Link } from "react-router-dom";

export default function ReturnsRefunds() {
  return (
    <div className="min-h-[70vh] bg-linear-to-b from-rose-50 via-pink-50 to-white">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="rounded-3xl border border-rose-200 bg-white p-6 shadow-sm">
          <div className="text-sm text-rose-600">
            <Link to="/" className="hover:text-rose-900">
              Home
            </Link>{" "}
            <span className="text-rose-300">/</span>{" "}
            <span className="font-semibold text-rose-950">
              Returns & Refunds
            </span>
          </div>

          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-rose-950 sm:text-3xl">
            Returns & Refund Policy
          </h1>          
        </div>

        <div className="mt-6 space-y-5 rounded-3xl border border-rose-200 bg-white p-6 shadow-sm">
          <section>
            <h2 className="text-sm font-bold text-rose-950">Return Window</h2>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              We offer returns within{" "}
              <span className="font-semibold">7 days</span> of delivery
              (example). Requests raised after the window may not be accepted.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">Eligibility</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-rose-700">
              <li>Item must be unused, unwashed, and in original condition.</li>
              <li>Original tags/labels and packaging must be intact.</li>
              <li>Return is subject to quality check upon pickup/receipt.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">
              Non-Returnable Items
            </h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-rose-700">
              <li>Innerwear, masks, or items marked “Final Sale” (example).</li>
              <li>Customized or altered products (if applicable).</li>
              <li>Products damaged due to misuse or mishandling.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">
              How to Initiate a Return
            </h2>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-6 text-rose-700">
              <li>
                Contact support at{" "}
                <span className="font-semibold">support@homeportcollections.com</span> with
                your order ID.
              </li>
              <li>Share images if the product is damaged/incorrect.</li>
              <li>
                We will arrange pickup (subject to serviceability) or provide
                return instructions.
              </li>
            </ol>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">Exchange</h2>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              Exchanges are available for size issues (subject to stock). If the
              requested size is unavailable, we will process a refund or store
              credit as per your preference.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">Refunds</h2>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              Once the returned item passes quality check, refunds are processed
              within <span className="font-semibold">5–10 business days</span>{" "}
              (example) to the original payment method. COD orders may be
              refunded via bank transfer/UPI after verification.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">
              Damaged / Wrong Item
            </h2>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              If you receive a damaged or incorrect item, please contact us
              within <span className="font-semibold">48 hours</span> of delivery
              with unboxing images/video (if available). We will resolve it via
              replacement or refund.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">Contact</h2>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              For any questions, reach us at{" "}
              <span className="font-semibold">support@homeportcollections.com</span>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
