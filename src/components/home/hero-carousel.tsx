"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type HeroSlide = {
  src: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: { label: string; href: string };
};

export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [
    Autoplay({ delay: 4500, stopOnInteraction: false }),
  ]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    onSelect();
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

  return (
    <section className="relative overflow-hidden">
      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex">
          {slides.map((slide, index) => (
            <div key={slide.title} className="relative min-w-0 shrink-0 grow-0 basis-full">
              <div className="relative h-[28rem] md:h-[36rem]">
                <Image
                  src={slide.src}
                  alt={slide.title}
                  fill
                  priority={index === 0}
                  className="object-cover"
                  sizes="100vw"
                />
                <div className="absolute inset-0 bg-linear-to-r from-rose-950/75 via-rose-950/35 to-transparent" />

                <div className="absolute inset-0 flex items-center">
                  <div className="mx-auto w-full max-w-7xl px-6">
                    <div className="max-w-2xl animate-in fade-in slide-in-from-bottom-4 duration-700">
                      <span className="mb-4 inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold tracking-widest text-white/90 uppercase backdrop-blur-md">
                        {slide.eyebrow}
                      </span>
                      <h1 className="font-display text-4xl leading-tight font-medium text-white md:text-6xl">
                        {slide.title}
                      </h1>
                      <p className="mt-4 max-w-lg text-base text-white/80 md:text-lg">
                        {slide.subtitle}
                      </p>
                      <div className="mt-8 flex flex-wrap gap-3">
                        <Link
                          href={slide.cta.href}
                          className="rounded-2xl bg-rose-500 px-7 py-3 text-sm font-semibold text-white shadow-xl shadow-rose-500/30 transition hover:bg-rose-400"
                        >
                          {slide.cta.label}
                        </Link>
                        <Link
                          href="/products"
                          className="rounded-2xl border border-white/25 bg-white/10 px-7 py-3 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/20"
                        >
                          View all products
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={scrollPrev}
        aria-label="Previous slide"
        className="absolute top-1/2 left-4 hidden -translate-y-1/2 rounded-full border border-white/20 bg-white/10 p-3 text-white backdrop-blur-md transition hover:bg-white/20 md:flex"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={scrollNext}
        aria-label="Next slide"
        className="absolute top-1/2 right-4 hidden -translate-y-1/2 rounded-full border border-white/20 bg-white/10 p-3 text-white backdrop-blur-md transition hover:bg-white/20 md:flex"
      >
        <ArrowRight className="h-5 w-5" />
      </button>

      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2">
        {slides.map((slide, index) => (
          <button
            key={slide.title}
            type="button"
            aria-label={`Go to slide ${index + 1}`}
            onClick={() => emblaApi?.scrollTo(index)}
            className={cn(
              "h-2 rounded-full transition-all",
              selectedIndex === index ? "w-8 bg-white" : "w-2 bg-white/40",
            )}
          />
        ))}
      </div>
    </section>
  );
}
