"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { checkIsAdmin } from "@/lib/admin-api";

export function AdminRoute({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    let alive = true;

    checkIsAdmin().then((isAdmin) => {
      if (!alive) return;
      if (!isAdmin) {
        setDenied(true);
        router.replace("/");
        return;
      }
      setReady(true);
    });

    return () => {
      alive = false;
    };
  }, [router]);

  if (denied) return null;

  return (
    <ProtectedRoute>
      {ready ? (
        children
      ) : (
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose-200 border-t-rose-600" />
        </div>
      )}
    </ProtectedRoute>
  );
}
