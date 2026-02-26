import React from "react";
import { Link } from "react-router-dom";

export default function TermsOfService() {
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
              Terms of Service
            </span>
          </div>

          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-rose-950 sm:text-3xl">
            Terms of Service
          </h1>
        </div>

        <div className="mt-6 space-y-5 rounded-3xl border border-rose-200 bg-white p-6 shadow-sm">
          <section>
            <h2 className="text-sm font-bold text-rose-950">Agreement</h2>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              By using this website, you agree to these Terms. If you do not
              agree, please do not use our services.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">
              Products & Pricing
            </h2>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              We try to display accurate product information and pricing.
              However, errors may occur. We reserve the right to correct errors
              and cancel orders if necessary.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">
              Orders & Payments
            </h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-rose-700">
              <li>
                Orders are confirmed only after successful payment or COD
                confirmation (if available).
              </li>
              <li>
                We may cancel orders for suspected fraud, incorrect pricing, or
                stock unavailability.
              </li>
              <li>
                In case of cancellation, refunds will be processed as
                applicable.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">
              User Responsibilities
            </h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-rose-700">
              <li>
                You agree to provide accurate contact and delivery information.
              </li>
              <li>
                You will not misuse the site, attempt hacks, or violate
                applicable laws.
              </li>
              <li>
                You are responsible for maintaining confidentiality of your
                account (if applicable).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">
              Returns & Refunds
            </h2>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              Returns and refunds are governed by our Returns & Refund Policy.
              Please review it for details and eligibility.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">
              Intellectual Property
            </h2>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              All content on this website (images, logos, text, design) is owned
              by us or licensed. You may not copy, reproduce, or redistribute
              without written permission.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">
              Limitation of Liability
            </h2>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              To the maximum extent permitted by law, we are not liable for
              indirect or incidental damages arising from use of our services.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">Governing Law</h2>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              These Terms are governed by the laws of India. Any disputes shall
              be subject to the jurisdiction of{" "}
              <span className="font-semibold">your city/state</span>.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">Contact</h2>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              For questions, email{" "}
              <span className="font-semibold">support@homeportcollections.com</span>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
