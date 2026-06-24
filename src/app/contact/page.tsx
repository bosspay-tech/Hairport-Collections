import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ContactPage() {
  return (
    <div className="min-h-[70vh] bg-linear-to-b from-rose-50/60 via-white to-white">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="rounded-[2rem] border border-rose-100 bg-white p-6 shadow-sm">
          <h1 className="font-display text-4xl text-rose-950">Contact Us</h1>
          <p className="mt-2 text-sm text-rose-600">
            We are here to help. Reach out using the details below.
          </p>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <div className="rounded-[2rem] border border-rose-100 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold tracking-[0.2em] text-rose-500 uppercase">
              Company
            </p>
            <h2 className="mt-2 text-xl font-semibold text-rose-950">
              THE HAIRPORT SALON
            </h2>
            <div className="mt-5 space-y-4 text-sm text-rose-700">
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
          </div>

          <div className="rounded-[2rem] border border-rose-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-rose-950">Send a message</h2>
            <form className="mt-5 space-y-4">
              <Input placeholder="Your name" />
              <Input type="email" placeholder="Your email" />
              <textarea
                rows={4}
                placeholder="How can we help?"
                className="w-full rounded-2xl border border-rose-200/80 bg-white px-4 py-3 text-sm text-rose-950 outline-none focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
              />
              <Button type="button" className="w-full">
                Send message
              </Button>
            </form>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link href="/products" className="text-sm font-semibold text-rose-700 hover:text-rose-900">
            Continue shopping →
          </Link>
        </div>
      </div>
    </div>
  );
}
