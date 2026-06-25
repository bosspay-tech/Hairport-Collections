/**
 * Site & deployment configuration.
 * Set production values in your hosting dashboard (e.g. Vercel → Environment Variables).
 */

const defaultSiteUrl = "http://localhost:3000";

function normalizeUrl(url: string) {
  return url.replace(/\/$/, "");
}

/** Public site URL — use SITE_URL on server, NEXT_PUBLIC_SITE_URL in the browser. */
export function getSiteUrl() {
  const url =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    defaultSiteUrl;
  return normalizeUrl(url);
}

export const siteConfig = {
  name: "The Hairport Salon",
  shortName: "Hairport",
  tagline: "Collections",
  description:
    "Shop salon-grade hair care, skin care, and treatments with secure checkout and fast delivery across India.",
  url: getSiteUrl(),
  contact: {
    email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@thehairportsalon.com",
    phone: process.env.NEXT_PUBLIC_CONTACT_PHONE || "",
  },
  /** Comma-separated in ADMIN_EMAILS env (server-only). */
  adminEmailsEnvKey: "ADMIN_EMAILS",
} as const;

/** Env vars required for production. */
export const productionEnvKeys = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SITE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "ADMIN_EMAILS",
] as const;
