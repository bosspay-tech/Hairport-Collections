"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signUp } from "@/lib/auth";
import { isValidEmail } from "@/lib/utils";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({ email: false, password: false });
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  const emailError = useMemo(() => {
    if (!touched.email) return "";
    if (!email.trim()) return "Email is required.";
    if (!isValidEmail(email)) return "Please enter a valid email address.";
    return "";
  }, [email, touched.email]);

  const passwordError = useMemo(() => {
    if (!touched.password) return "";
    if (!password) return "Password is required.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    return "";
  }, [password, touched.password]);

  const canSubmit =
    !emailError && !passwordError && email.trim() && password && !loading;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    setTouched({ email: true, password: true });

    if (!canSubmit) {
      setFormError("Please fix the errors below and try again.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await signUp(email.trim(), password);
      if (error) {
        setFormError(error.message || "Signup failed. Please try again.");
        return;
      }
      router.push("/login");
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-linear-to-b from-rose-50/60 to-white px-4 py-10">
      <div className="w-full max-w-md">
        <div className="rounded-[2rem] border border-rose-100 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="font-display text-3xl text-rose-950">Create account</h1>
          <p className="mt-2 text-sm text-rose-600">
            Join to track orders and checkout faster.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {formError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {formError}
              </div>
            ) : null}

            <div>
              <label className="text-sm font-medium text-rose-900">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                placeholder="you@domain.com"
                className="mt-2"
              />
              {emailError ? (
                <p className="mt-2 text-xs text-red-600">{emailError}</p>
              ) : null}
            </div>

            <div>
              <label className="text-sm font-medium text-rose-900">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
                placeholder="••••••••"
                className="mt-2"
              />
              {passwordError ? (
                <p className="mt-2 text-xs text-red-600">{passwordError}</p>
              ) : null}
            </div>

            <Button type="submit" className="w-full" disabled={!canSubmit}>
              {loading ? "Creating account..." : "Sign Up"}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-rose-600">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-rose-950 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
