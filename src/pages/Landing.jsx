import { Link } from "react-router-dom";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Pagination, Navigation } from "swiper/modules";

import "swiper/css";
import "swiper/css/pagination";
import "swiper/css/navigation";

const HERO_BANNERS = [
  {
    src: "https://plus.unsplash.com/premium_photo-1729291859746-be07b464bccf?q=80&w=870&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    eyebrow: "Salon-grade essentials",
    title: "Healthy hair starts here.",
    subtitle: "Shampoos, conditioners & treatments made for real results.",
    cta: { label: "Shop Hair Care", to: "/products?category=hair-care" },
  },
  {
    src: "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?q=80&w=870&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
    eyebrow: "Glow-worthy skin",
    title: "Moisturize like a pro.",
    subtitle: "Hydration-first formulas for soft, radiant skin.",
    cta: { label: "Shop Skin Care", to: "/products?category=skin-care" },
  },
  {
    src: "https://images.unsplash.com/photo-1596755389378-c31d21fd1273?q=80&w=1600&auto=format&fit=crop&ixlib=rb-4.1.0",
    eyebrow: "New launches",
    title: "Your daily routine, upgraded.",
    subtitle: "Clean ingredients. Premium feel. Visible results.",
    cta: { label: "Explore New", to: "/products?category=new-arrivals" },
  },
];

const COLLECTIONS = [
  {
    key: "hair-care",
    title: "Hair Care",
    desc: "Shampoo • Conditioner • Serum",
    badge: "Best Sellers",
    imageUrl:
      "https://images.unsplash.com/photo-1717160675489-7779f2c91999?q=80&w=870&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    key: "skin-care",
    title: "Skin Care",
    desc: "Moisturizers • Cleansers",
    badge: "Trending",
    imageUrl:
      "https://plus.unsplash.com/premium_photo-1674739375749-7efe56fc8bbb?q=80&w=1972&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    key: "treatments",
    title: "Treatments",
    desc: "Masks • Oils • Repair",
    badge: "Pro Picks",
    imageUrl:
      "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?q=80&w=1200&auto=format&fit=crop&ixlib=rb-4.1.0",
  },
];

export default function Landing() {
  return (
    <div className="bg-rose-50">
      {/* HERO SLIDER */}
      <section className="relative">
        <Swiper
          modules={[Autoplay, Pagination, Navigation]}
          loop
          autoplay={{ delay: 3500, disableOnInteraction: false }}
          pagination={{ clickable: true }}
          navigation
          className="h-72 w-full sm:h-105 md:h-140"
        >
          {HERO_BANNERS.map((b, idx) => (
            <SwiperSlide key={b.src}>
              <div className="relative h-full w-full">
                <img
                  src={b.src}
                  alt={`Hero banner ${idx + 1}`}
                  className="h-full w-full object-cover"
                  loading={idx === 0 ? "eager" : "lazy"}
                />

                {/* Overlay */}
                <div className="absolute inset-0 bg-linear-to-r from-black/55 via-black/20 to-black/10" />

                <div className="absolute inset-0 flex items-center">
                  <div className="mx-auto w-full max-w-6xl px-6">
                    <div className="max-w-xl">
                      <p className="mb-3 inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-white ring-1 ring-white/15 backdrop-blur">
                        {b.eyebrow}
                      </p>

                      <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl md:text-5xl">
                        {b.title}
                      </h2>

                      <p className="mt-3 max-w-lg text-sm text-white/80 sm:text-base">
                        {b.subtitle}
                      </p>

                      <div className="pointer-events-auto mt-6 flex flex-wrap gap-3">
                        <Link
                          to={b.cta.to}
                          className="inline-flex items-center justify-center rounded-xl bg-pink-500 px-7 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-pink-400 focus:outline-none focus:ring-4 focus:ring-pink-500/40"
                        >
                          {b.cta.label}
                        </Link>

                        <Link
                          to="/products"
                          className="inline-flex items-center justify-center rounded-xl bg-white/10 px-7 py-3 text-sm font-semibold text-white ring-1 ring-white/20 backdrop-blur transition hover:bg-white/15 focus:outline-none focus:ring-4 focus:ring-white/20"
                        >
                          View all products
                        </Link>
                      </div>

                      <div className="mt-6 flex flex-wrap gap-2 text-xs text-white/75">
                        <Pill>Salon-grade</Pill>
                        <Pill>Derm-friendly</Pill>
                        <Pill>Fast delivery</Pill>
                        <Pill>Secure payments</Pill>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-rose-900/35 to-transparent" />
      </section>

      {/* TRUST BAR */}
      <section className="border-b border-rose-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-8 sm:px-6 md:grid-cols-3">
          <TrustItem
            title="Fast delivery"
            desc="Quick dispatch & reliable shipping."
            icon="🚚"
          />
          <TrustItem
            title="Secure payments"
            desc="100% safe checkout experience."
            icon="🔒"
          />
          <TrustItem
            title="Easy returns"
            desc="Hassle-free return policy."
            icon="↩️"
          />
        </div>
      </section>

      {/* FEATURED CATEGORIES */}
      <section className="bg-linear-to-b from-rose-50 via-pink-50 to-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-rose-950 sm:text-3xl">
                Shop by category
              </h2>
              <p className="mt-1 text-sm text-rose-700">
                Build a routine you’ll actually love.
              </p>
            </div>

            <Link
              to="/products"
              className="text-sm font-semibold text-rose-700 hover:text-rose-900 hover:underline"
            >
              View all →{" "}
            </Link>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {COLLECTIONS.map((c) => (
              <CollectionCard
                key={c.key}
                title={c.title}
                desc={c.desc}
                tag={c.key}
                badge={c.badge}
                imageUrl={c.imageUrl}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ROUTINE BUILDER */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-900">
              ✨ Routine made simple
            </span>

            <h3 className="mt-4 text-3xl font-extrabold tracking-tight text-rose-950 sm:text-4xl">
              3 steps to salon-smooth.
            </h3>

            <p className="mt-3 max-w-xl text-sm text-rose-700 sm:text-base">
              Start with a gentle cleanse, lock in moisture, then finish with a
              treatment. Perfect for daily care, repair, and shine.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <RoutineStep n="1" title="Cleanse" desc="Shampoos" />
              <RoutineStep n="2" title="Condition" desc="Conditioners" />
              <RoutineStep n="3" title="Treat" desc="Masks & Serums" />
            </div>

            <div className="mt-7 flex gap-3">
              <Link
                to="/products?category=hair-care"
                className="inline-flex rounded-xl bg-rose-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-rose-900 focus:ring-4 focus:ring-rose-950/20"
              >
                Build Hair Routine
              </Link>
              <Link
                to="/products?category=skin-care"
                className="inline-flex rounded-xl border border-rose-200 bg-white px-6 py-3 text-sm font-semibold text-rose-900 transition hover:bg-rose-50 focus:ring-4 focus:ring-rose-200/50"
              >
                Shop Moisturizers
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <PreviewCard
              title="Salon-grade formulas"
              subtitle="Pro performance"
            />
            <PreviewCard
              title="Hydration-first"
              subtitle="Soft, healthy feel"
            />
            <PreviewCard title="Clean ingredients" subtitle="Everyday safe" />
            <PreviewCard title="Fast delivery" subtitle="Quick dispatch" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-linear-to-b from-white to-rose-50">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
          <div className="rounded-2xl border border-rose-200 bg-rose-950 px-6 py-10 text-white sm:px-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-xl font-bold">
                  Ready for your best hair day?
                </h3>
                <p className="mt-1 text-sm text-white/75">
                  Shop shampoos, conditioners & moisturizers in one place.
                </p>
              </div>

              <Link
                to="/products"
                className="rounded-xl bg-pink-500 px-6 py-3 text-sm font-semibold text-white hover:bg-pink-400"
              >
                Shop now
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ---------- SMALL UI HELPERS ---------- */

function Pill({ children }) {
  return (
    <span className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/15 backdrop-blur">
      {children}
    </span>
  );
}

function RoutineStep({ n, title, desc }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
      <p className="text-xs font-semibold text-rose-700">Step {n}</p>
      <p className="mt-1 font-semibold text-rose-950">{title}</p>
      <p className="mt-1 text-sm text-rose-700">{desc}</p>
    </div>
  );
}

function PreviewCard({ title, subtitle }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
      <p className="text-sm font-semibold text-rose-950">{title}</p>
      <p className="mt-1 text-xs text-rose-700">{subtitle}</p>
    </div>
  );
}

function TrustItem({ title, desc, icon }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-rose-200 bg-white p-5 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100">
        <span>{icon}</span>
      </div>
      <div>
        <p className="text-sm font-semibold text-rose-950">{title}</p>
        <p className="mt-1 text-sm text-rose-700">{desc}</p>
      </div>
    </div>
  );
}

function CollectionCard({ title, desc, tag, badge, imageUrl }) {
  return (
    <div className="group overflow-hidden rounded-2xl border border-rose-200 bg-white transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative h-44">
        <img
          src={imageUrl}
          alt={title}
          className="h-full w-full object-cover transition group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-linear-to-b from-rose-900/25 to-rose-900/55" />

        <span className="absolute left-4 top-4 rounded-full bg-pink-600 px-3 py-1 text-xs font-semibold text-white">
          {badge}
        </span>
      </div>

      <div className="p-5">
        <p className="font-semibold text-rose-950">{title}</p>
        <p className="mt-1 text-sm text-rose-700">{desc}</p>

        <Link
          to={`/products?category=${tag}`}
          className="mt-4 inline-flex text-sm font-semibold text-rose-700 hover:text-rose-900 hover:underline"
        >
          Shop now →
        </Link>
      </div>
    </div>
  );
}
