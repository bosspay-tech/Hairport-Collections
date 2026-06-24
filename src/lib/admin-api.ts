import { supabase } from "@/lib/supabase/client";

async function getAccessToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function adminFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const token = await getAccessToken();
  if (!token) {
    return new Response(JSON.stringify({ error: "Not signed in" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
}

export async function checkIsAdmin(): Promise<boolean> {
  const res = await adminFetch("/api/admin/me");
  if (!res.ok) return false;
  const body = await res.json();
  return Boolean(body.isAdmin);
}
