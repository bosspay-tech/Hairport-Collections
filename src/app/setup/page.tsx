"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function SetupPage() {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const runSeed = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch("/api/setup/seed", { method: "POST" });
      const body = await res.json();
      setMessage(res.ok ? body.message || `Inserted ${body.inserted} products` : body.error);
    } catch {
      setMessage("Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-4xl text-rose-950">Database setup</h1>
      <p className="mt-3 text-sm text-rose-600">
        Your new Supabase project needs tables before products can load.
      </p>

      <ol className="mt-8 list-decimal space-y-4 pl-5 text-sm text-rose-800">
        <li>
          Open{" "}
          <a
            href="https://supabase.com/dashboard/project/gnaydajukbzespslsygy/sql/new"
            className="font-semibold text-rose-950 underline"
            target="_blank"
            rel="noreferrer"
          >
            Supabase SQL Editor
          </a>
        </li>
        <li>Copy everything from <code className="rounded bg-rose-50 px-1">supabase/schema.sql</code> and run it</li>
        <li>
          To copy real products from the old store, add to <code className="rounded bg-rose-50 px-1">.env</code>:
          <pre className="mt-2 overflow-x-auto rounded-2xl bg-rose-950 p-4 text-xs text-rose-50">
{`OLD_SUPABASE_URL=https://your-old-project.supabase.co
OLD_SUPABASE_SERVICE_ROLE_KEY=your_old_service_role_key`}
          </pre>
          Then run: <code className="rounded bg-rose-50 px-1">npm run db:migrate</code>
        </li>
        <li>Or seed sample products for testing:</li>
      </ol>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={runSeed} disabled={loading}>
          {loading ? "Seeding..." : "Seed sample products"}
        </Button>
        <Link href="/products">
          <Button variant="outline">Go to products</Button>
        </Link>
      </div>

      {message ? (
        <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {message}
        </p>
      ) : null}
    </div>
  );
}
