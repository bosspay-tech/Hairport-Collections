import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { STORE_ID } from "../config/store";
import { useCartStore } from "../store/cart.store";
import toast from "react-hot-toast";
import { getProxiedImage } from "../lib/imageproxy";

/* ---------- SKELETON ---------- */
function SkeletonDetail() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="grid gap-10 md:grid-cols-2">
        <div className="animate-pulse overflow-hidden rounded-2xl border border-rose-200 bg-white">
          <div className="h-105 bg-rose-100" />
        </div>

        <div className="animate-pulse">
          <div className="h-7 w-2/3 rounded bg-rose-100" />
          <div className="mt-4 h-4 w-full rounded bg-rose-100" />
          <div className="mt-2 h-4 w-5/6 rounded bg-rose-100" />
          <div className="mt-2 h-4 w-2/3 rounded bg-rose-100" />
          <div className="mt-6 h-8 w-28 rounded bg-rose-100" />
          <div className="mt-6 h-10 w-full rounded-xl bg-rose-100" />
          <div className="mt-3 h-10 w-full rounded-xl bg-rose-100" />
        </div>
      </div>
    </div>
  );
}

/* ---------- SMALL UI BITS ---------- */
function StarRow({ rating = 4.4, count = 128 }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center">
        {Array.from({ length: 5 }).map((_, i) => {
          const filled = i < full || (i === full && half);
          return (
            <span
              key={i}
              className={filled ? "text-amber-500" : "text-rose-200"}
            >
              ★
            </span>
          );
        })}
      </div>
      <span className="text-sm font-semibold text-rose-950">{rating}</span>
      <span className="text-sm text-rose-600">({count} reviews)</span>
    </div>
  );
}

function Accordion({ items }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="divide-y divide-rose-100 overflow-hidden rounded-2xl border border-rose-200 bg-white">
      {items.map((it, idx) => (
        <div key={it.title}>
          <button
            type="button"
            onClick={() => setOpen(open === idx ? -1 : idx)}
            className="flex w-full items-center justify-between px-5 py-4 text-left"
          >
            <span className="text-sm font-semibold text-rose-950">
              {it.title}
            </span>
            <span className="text-rose-500">{open === idx ? "−" : "+"}</span>
          </button>
          {open === idx ? (
            <div className="px-5 pb-5 text-sm leading-6 text-rose-700">
              {it.content}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default function ProductDetail() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // dummy fashion options (static)
  const colors = [
    { name: "Rose", class: "bg-rose-400" },
    { name: "Black", class: "bg-slate-900" },
    { name: "Cream", class: "bg-amber-100" },
  ];
  const sizes = ["XS", "S", "M", "L", "XL"];
  const [selectedColor, setSelectedColor] = useState(colors[0]);
  const [selectedSize, setSelectedSize] = useState("M");

  const [pincode, setPincode] = useState("");
  const [pinMsg, setPinMsg] = useState("");

  const addItem = useCartStore((s) => s.addItem);
  const items = useCartStore((s) => s.items);

  useEffect(() => {
    let alive = true;

    const fetchProduct = async () => {
      setLoading(true);
      setErr("");

      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .eq("store_id", STORE_ID)
        .single();

      if (!alive) return;

      if (error) {
        setErr(error.message || "Failed to load product.");
        setProduct(null);
      } else {
        setProduct(data);
        setSelectedVariant(null);
      }

      setLoading(false);
    };

    fetchProduct();
    return () => {
      alive = false;
    };
  }, [id]);

  const cartItem = items.find((it) => it.productId === product?.id);
  const qtyInCart = cartItem?.quantity ?? 0;

  const price = useMemo(() => {
    const p = selectedVariant?.price ?? product?.base_price ?? 0;
    return Number(p);
  }, [selectedVariant, product]);

  const handleAddToCart = () => {
    if (product?.is_active === false) return;

    addItem({
      productId: product.id,
      storeId: STORE_ID,
      title: product.title,
      price,
      // OPTIONAL: if your cart store supports meta
      // meta: { color: selectedColor?.name, size: selectedSize },
    });

    toast.success(
      qtyInCart > 0
        ? `Updated cart • ${qtyInCart + 1} in cart`
        : "Added to cart",
    );
  };

  const handleCheckPincode = () => {
    const ok = /^\d{6}$/.test(pincode.trim());
    setPinMsg(
      ok
        ? "✅ Delivery available • Estimated 2–5 days • Free on orders above ₹999"
        : "Enter a valid 6-digit pincode",
    );
  };

  if (loading) return <SkeletonDetail />;

  if (err) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {err}
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-rose-200 bg-white p-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100">
            🛍️
          </div>
          <h2 className="text-lg font-semibold text-rose-950">
            Product not found
          </h2>
          <p className="mt-1 text-sm text-rose-700">
            This product may no longer be available.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] bg-linear-to-b from-rose-50 via-pink-50 to-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* BREADCRUMB */}
        <div className="mb-6 flex flex-wrap items-center gap-2 text-sm text-rose-600">
          <Link to="/" className="hover:text-rose-900">
            Home
          </Link>
          <span className="text-rose-300">/</span>
          <Link to="/products" className="hover:text-rose-900">
            Products
          </Link>
          <span className="text-rose-300">/</span>
          <span className="font-semibold text-rose-950 line-clamp-1">
            {product.title}
          </span>
        </div>

        <div className="grid gap-10 lg:grid-cols-12">
          {/* LEFT: GALLERY */}
          <div className="lg:col-span-7">
            <div className="overflow-hidden rounded-3xl border border-rose-200 bg-white shadow-sm">
              <div className="relative bg-rose-50">
                <div className="group relative aspect-4/5 overflow-hidden">
                  <img
                    src={getProxiedImage(product.image_url)}
                    alt={product.title}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.06]"
                    loading="lazy"
                  />

                  {/* badge */}
                  {product?.badge ? (
                    <span className="absolute left-4 top-4 rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white shadow">
                      {product.badge}
                    </span>
                  ) : null}

                  {/* overlay chips */}
                  <div className="absolute bottom-4 left-4 right-4">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-rose-900 backdrop-blur">
                        ✨ Premium finish
                      </span>
                      <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-rose-900 backdrop-blur">
                        🧵 Soft-touch fabric
                      </span>
                      <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-rose-900 backdrop-blur">
                        🧼 Easy care
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* DETAILS STRIP */}
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                { t: "Free shipping", d: "Orders above ₹999" },
                { t: "Easy returns", d: "7-day return window" },
                { t: "Cash on delivery", d: "Available in most areas" },
              ].map((b) => (
                <div
                  key={b.t}
                  className="rounded-2xl border border-rose-200 bg-white p-4"
                >
                  <div className="text-sm font-semibold text-rose-950">
                    {b.t}
                  </div>
                  <div className="mt-1 text-xs text-rose-600">{b.d}</div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: BUY BOX (sticky on desktop) */}
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-6">
              <div className="rounded-3xl border border-rose-200 bg-white p-6 shadow-sm">
                <h1 className="text-2xl font-bold tracking-tight text-rose-950 sm:text-3xl">
                  {product.title}
                </h1>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <StarRow rating={4.4} count={128} />
                  <span
                    className={[
                      "rounded-full px-3 py-1 text-xs font-semibold",
                      product?.is_active === false
                        ? "bg-rose-100 text-rose-500"
                        : "bg-pink-100 text-pink-700",
                    ].join(" ")}
                  >
                    {product?.is_active === false ? "Out of stock" : "In stock"}
                  </span>
                </div>

                {product?.short_description ? (
                  <p className="mt-3 text-sm text-rose-700">
                    {product.short_description}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-rose-700">
                    A modern essential designed for everyday style — clean
                    lines, premium feel, effortless fit.
                  </p>
                )}

                {/* PRICE */}
                <div className="mt-5 flex flex-wrap items-end gap-3">
                  <div className="text-3xl font-extrabold text-rose-950">
                    ₹{price}
                  </div>

                  {product?.mrp ? (
                    <div className="pb-1 text-sm text-rose-400 line-through">
                      ₹{Number(product.mrp)}
                    </div>
                  ) : (
                    <div className="pb-1 text-sm text-rose-600">
                      MRP inclusive of all taxes
                    </div>
                  )}

                  <span className="pb-1 text-sm font-semibold text-emerald-700">
                    {product?.mrp ? "Limited-time price" : "Best price"}
                  </span>
                </div>

                <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <div className="text-sm font-semibold text-rose-950">
                    Check delivery
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value)}
                      placeholder="Enter pincode"
                      className="w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm text-rose-950 outline-none focus:border-pink-400 focus:ring-4 focus:ring-pink-100"
                    />
                    <button
                      type="button"
                      onClick={handleCheckPincode}
                      className="shrink-0 rounded-xl bg-rose-900 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800"
                    >
                      Check
                    </button>
                  </div>
                  {pinMsg ? (
                    <p className="mt-2 text-xs text-rose-700">{pinMsg}</p>
                  ) : (
                    <p className="mt-2 text-xs text-rose-600">
                      COD available • Easy returns
                    </p>
                  )}
                </div>

                {/* CTA */}
                <div className="mt-6 flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={handleAddToCart}
                    disabled={product?.is_active === false}
                    className={[
                      "w-full rounded-2xl px-6 py-3.5 text-sm font-semibold transition",
                      "focus:outline-none focus:ring-4",
                      product?.is_active === false
                        ? "cursor-not-allowed bg-rose-200 text-rose-500"
                        : "bg-pink-500 text-white hover:bg-pink-400 focus:ring-pink-300",
                    ].join(" ")}
                  >
                    {product?.is_active === false
                      ? "Out of stock"
                      : qtyInCart > 0
                        ? `In cart: ${qtyInCart} • Add more`
                        : "Add to cart"}
                  </button>
                </div>

                {/* OFFERS */}
                <div className="mt-6 rounded-2xl border border-rose-200 bg-white p-4">
                  <div className="text-sm font-semibold text-rose-950">
                    Offers for you
                  </div>
                  <ul className="mt-3 space-y-2 text-sm text-rose-700">
                    <li className="flex gap-2">
                      <span>🏷️</span> Flat 10% off on prepaid orders
                    </li>
                    <li className="flex gap-2">
                      <span>🎁</span> Free gift wrap on orders above ₹1499
                    </li>
                    <li className="flex gap-2">
                      <span>💳</span> Extra 5% off with select cards (dummy)
                    </li>
                  </ul>
                </div>
              </div>

              {/* DESCRIPTION + INFO */}
              <div className="mt-6">
                <Accordion
                  items={[
                    {
                      title: "Description",
                      content: product.description ? (
                        <p className="whitespace-pre-line">
                          {product.description}
                        </p>
                      ) : (
                        <p>
                          Crafted for everyday wear with a premium finish and a
                          flattering silhouette. Designed to pair effortlessly
                          with denim, trousers, and skirts.
                        </p>
                      ),
                    },
                    {
                      title: "Fabric & Care",
                      content: (
                        <ul className="list-disc pl-5">
                          <li>Material: 100% Cotton (dummy)</li>
                          <li>Fit: Regular fit • Mid-weight</li>
                          <li>Care: Machine wash cold • Do not bleach</li>
                          <li>Iron: Low heat • Inside out</li>
                        </ul>
                      ),
                    },
                    {
                      title: "Shipping & Returns",
                      content: (
                        <ul className="list-disc pl-5">
                          <li>Dispatch: within 24–48 hours (dummy)</li>
                          <li>Delivery: 2–5 business days (dummy)</li>
                          <li>Returns: 7-day easy returns</li>
                          <li>Exchange: available for size issues</li>
                        </ul>
                      ),
                    },
                  ]}
                />
              </div>
            </div>
          </div>
        </div>

        {/* FOOT TRUST */}
        <div className="mt-10 flex flex-wrap gap-2 text-xs text-rose-700">
          <span className="rounded-full bg-rose-100 px-3 py-1">
            🔒 Secure payments
          </span>
          <span className="rounded-full bg-rose-100 px-3 py-1">
            🚚 Fast shipping
          </span>
          <span className="rounded-full bg-rose-100 px-3 py-1">
            ↩️ Easy returns
          </span>
          <span className="rounded-full bg-rose-100 px-3 py-1">
            ✅ Quality checked
          </span>
        </div>
      </div>
    </div>
  );
}
