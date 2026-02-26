import React from "react";
import { Link } from "react-router-dom";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-[70vh] bg-linear-to-b from-rose-50 via-pink-50 to-white">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="rounded-3xl border border-rose-200 bg-white p-6 shadow-sm">
          <div className="text-sm text-rose-600">
            <Link to="/" className="hover:text-rose-900">
              Home
            </Link>{" "}
            <span className="text-rose-300">/</span>{" "}
            <span className="font-semibold text-rose-950">Privacy Policy</span>
          </div>

          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-rose-950 sm:text-3xl">
            Privacy Policy
          </h1>
        </div>

        <div className="mt-6 space-y-5 rounded-3xl border border-rose-200 bg-white p-6 shadow-sm">
          <section>
            <h2 className="text-sm font-bold text-rose-950">Overview</h2>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              This Privacy Policy explains how we collect, use, disclose, and
              protect your information when you use our website and services.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">
              Information We Collect
            </h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-rose-700">
              <li>
                Personal details: name, phone number, email, shipping address.
              </li>
              <li>
                Order details: products purchased, order history, payment
                status.
              </li>
              <li>
                Device data: IP address, browser type, cookies, and usage
                analytics.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">
              How We Use Your Information
            </h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-rose-700">
              <li>To process orders, deliveries, returns, and refunds.</li>
              <li>To communicate order updates and support responses.</li>
              <li>
                To improve our website experience, products, and services.
              </li>
              <li>To prevent fraud and secure our platform.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">Cookies</h2>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              We use cookies to enhance your browsing experience and analyze
              site traffic. You can disable cookies from your browser settings,
              but some features may not function properly.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">
              Sharing of Information
            </h2>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              We may share your information with trusted third parties only to
              fulfill services: payment providers, courier partners, and
              analytics tools. We do not sell your personal data.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">Data Security</h2>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              We implement reasonable security measures to protect your data.
              However, no online transmission is 100% secure, so we cannot
              guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">Your Rights</h2>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6 text-rose-700">
              <li>Access, correct, or update your personal information.</li>
              <li>
                Request deletion of your account/data (subject to legal
                obligations).
              </li>
              <li>Opt out of marketing communications.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-sm font-bold text-rose-950">Contact</h2>
            <p className="mt-2 text-sm leading-6 text-rose-700">
              If you have questions about this policy, contact{" "}
              <span className="font-semibold">support@homeportcollections.com</span>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
