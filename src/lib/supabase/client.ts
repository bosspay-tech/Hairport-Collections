import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/public-env";

let browserClient: SupabaseClient | null = null;

export function getSupabase() {
  if (browserClient) return browserClient;

  const { url, key } = getSupabasePublicConfig();
  browserClient = createClient(url, key);
  return browserClient;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getSupabase(), prop, receiver);
  },
});
