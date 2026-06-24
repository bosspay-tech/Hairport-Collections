import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Sparkles, Truck, Shield, RotateCcw } from "lucide-react";
import { HeroCarousel } from "@/components/home/hero-carousel";

const HERO_BANNERS = [
  {
    src: "https://plus.unsplash.com/premium_photo-1729291859746-be07b464bccf?q=80&w=1600&auto=format&fit=crop",
    eyebrow: "Salon-grade essentials",
    title: "Healthy hair starts here.",
    subtitle: "Shampoos, conditioners & treatments made for real results.",
    cta: { label: "Shop Hair Care", href: "/products?category=hair-care" },
  },
  {
    src: "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?q=80&w=1600&auto=format&fit=crop",
    eyebrow: "Glow-worthy skin",
    title: "Moisturize like a pro.",
    subtitle: "Hydration-first formulas for soft, radiant skin.",
    cta: { label: "Shop Skin Care", href: "/products?category=skin-care" },
  },
  {
    src: "https://images.unsplash.com/photo-1596755389378-c31d21fd1273?q=80&w=1600&auto=format&fit=crop",
    eyebrow: "New launches",
    title: "Your daily routine, upgraded.",
    subtitle: "Clean ingredients. Premium feel. Visible results.",
    cta: { label: "Explore New", href: "/products?category=new-arrivals" },
  },
];

const COLLECTIONS = [
  {
    key: "hair-care",
    title: "Hair Care",
    desc: "Shampoo • Conditioner • Serum",
    badge: "Best Sellers",
    imageUrl:
      "https://images.unsplash.com/photo-1717160675489-7779f2c91999?q=80&w=1200&auto=format&fit=crop",
  },
  {
    key: "skin-care",
    title: "Skin Care",
    desc: "Moisturizers • Cleansers",
    badge: "Trending",
    imageUrl:
      "https://plus.unsplash.com/premium_photo-1674739375749-7efe56fc8bbb?q=80&w=1200&auto=format&fit=crop",
  },
  {
    key: "treatments",
    title: "Treatments",
    desc: "Masks • Oils • Repair",
    badge: "Pro Picks",
    imageUrl:
      "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?q=80&w=1200&auto=format&fit=crop",
  },
];

export default function HomePage() {
  return (
    <div className="bg-rose-50/40">
      <HeroCarousel slides={HERO_BANNERS} />

      <section className="border-b border-rose-100 bg-white">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-10 sm:px-6 md:grid-cols-3">
          {[
            { icon: Truck, title: "Fast delivery", desc: "Quick dispatch & reliable shipping." },
            { icon: Shield, title: "Secure payments", desc: "100% safe checkout experience." },
            { icon: RotateCcw, title: "Easy returns", desc: "Hassle-free return policy." },
          ].map((item) => (
            <div
              key={item.title}
              className="flex gap-4 rounded-3xl border border-rose-100 bg-rose-50/50 p-5"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-rose-600 shadow-sm">
                <item.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-rose-950">{item.title}</p>
                <p className="mt-1 text-sm text-rose-600">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-linear-to-b from-rose-50/60 via-white to-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-4xl text-rose-950">Shop by category</h2>
              <p className="mt-2 text-sm text-rose-600">
                Build a routine you will actually love.
              </p>
            </div>
            <Link
              href="/products"
              className="inline-flex items-center gap-2 text-sm font-semibold text-rose-700 hover:text-rose-900"
            >
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {COLLECTIONS.map((collection) => (
              <Link
                key={collection.key}
                href={`/products?category=${collection.key}`}
                className="group overflow-hidden rounded-3xl border border-rose-100 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-900/5"
              >
                <div className="relative h-52">
                  <Image
                    src={collection.imageUrl}
                    alt={collection.title}
                    fill
                    className="object-cover transition duration-500 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                  <div className="absolute inset-0 bg-linear-to-t from-rose-950/70 via-rose-950/20 to-transparent" />
                  <span className="absolute top-4 left-4 rounded-full bg-rose-500 px-3 py-1 text-xs font-semibold text-white">
                    {collection.badge}
                  </span>
                  <div className="absolute right-0 bottom-0 left-0 p-5 text-white">
                    <p className="font-display text-2xl">{collection.title}</p>
                    <p className="mt-1 text-sm text-white/80">{collection.desc}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-900">
              <Sparkles className="h-3.5 w-3.5" />
              Routine made simple
            </span>
            <h3 className="mt-4 font-display text-4xl text-rose-950 sm:text-5xl">
              3 steps to salon-smooth.
            </h3>
            <p className="mt-4 max-w-xl text-sm leading-7 text-rose-600 sm:text-base">
              Start with a gentle cleanse, lock in moisture, then finish with a
              treatment. Perfect for daily care, repair, and shine.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                { n: "1", title: "Cleanse", desc: "Shampoos" },
                { n: "2", title: "Condition", desc: "Conditioners" },
                { n: "3", title: "Treat", desc: "Masks & Serums" },
              ].map((step) => (
                <div
                  key={step.n}
                  className="rounded-3xl border border-rose-100 bg-rose-50/70 p-4"
                >
                  <p className="text-xs font-semibold text-rose-500">Step {step.n}</p>
                  <p className="mt-1 font-semibold text-rose-950">{step.title}</p>
                  <p className="mt-1 text-sm text-rose-600">{step.desc}</p>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/products?category=hair-care"
                className="rounded-2xl bg-rose-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-rose-800"
              >
                Build Hair Routine
              </Link>
              <Link
                href="/products?category=skin-care"
                className="rounded-2xl border border-rose-200 bg-white px-6 py-3 text-sm font-semibold text-rose-900 transition hover:bg-rose-50"
              >
                Shop Moisturizers
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ["Salon-grade formulas", "Pro performance"],
              ["Hydration-first", "Soft, healthy feel"],
              ["Clean ingredients", "Everyday safe"],
              ["Fast delivery", "Quick dispatch"],
            ].map(([title, subtitle]) => (
              <div
                key={title}
                className="rounded-3xl border border-rose-100 bg-rose-50/70 p-5"
              >
                <p className="text-sm font-semibold text-rose-950">{title}</p>
                <p className="mt-1 text-xs text-rose-600">{subtitle}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pb-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="overflow-hidden rounded-[2rem] bg-linear-to-r from-rose-950 via-rose-900 to-rose-800 px-8 py-12 text-white shadow-2xl shadow-rose-900/20">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-display text-3xl">Ready for your best hair day?</h3>
                <p className="mt-2 text-sm text-white/75">
                  Shop shampoos, conditioners & moisturizers in one place.
                </p>
              </div>
              <Link
                href="/products"
                className="inline-flex rounded-2xl bg-rose-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-rose-400"
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
