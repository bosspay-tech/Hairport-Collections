type PublicRuntimeEnv = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SITE_URL?: string;
};

declare global {
  interface Window {
    __RUNTIME_ENV__?: PublicRuntimeEnv;
  }
}

/** Static access required — Next.js only inlines NEXT_PUBLIC_* at build time this way. */
const BUILD_ENV: PublicRuntimeEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
};

function fromRuntime(key: keyof PublicRuntimeEnv): string | undefined {
  if (typeof window === "undefined") return undefined;
  const value = window.__RUNTIME_ENV__?.[key];
  return value?.trim() || undefined;
}

function fromBuild(key: keyof PublicRuntimeEnv): string | undefined {
  return BUILD_ENV[key]?.trim() || undefined;
}

/** Browser: runtime-env.js (Docker) first, then build-time env. Server: process.env. */
export function getPublicEnv(key: keyof PublicRuntimeEnv): string | undefined {
  return fromRuntime(key) || fromBuild(key);
}

export function getSupabasePublicConfig() {
  const url = getPublicEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key =
    getPublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    getPublicEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  if (!url || !key) {
    throw new Error(
      "Missing Supabase config. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env (local) or your server environment variables (Coolify/Docker), then redeploy.",
    );
  }

  return { url, key };
}
