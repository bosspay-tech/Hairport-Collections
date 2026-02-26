import { useMemo, useState } from "react";
import { signUp } from "./auth.service";

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [touched, setTouched] = useState({
    email: false,
    password: false,
    confirmPassword: false,
  });

  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  const emailErr = useMemo(() => {
    if (!touched.email) return "";
    if (!email.trim()) return "Email is required.";
    if (!isValidEmail(email)) return "Please enter a valid email address.";
    return "";
  }, [email, touched.email]);

  const passwordErr = useMemo(() => {
    if (!touched.password) return "";
    if (!password) return "Password is required.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    return "";
  }, [password, touched.password]);

  const confirmErr = useMemo(() => {
    if (!touched.confirmPassword) return "";
    if (!confirmPassword) return "Confirm password is required.";
    if (password && confirmPassword && password !== confirmPassword)
      return "Passwords do not match.";
    return "";
  }, [password, confirmPassword, touched.confirmPassword]);

  const canSubmit =
    !loading &&
    email.trim() &&
    password &&
    confirmPassword &&
    !emailErr &&
    !passwordErr &&
    !confirmErr;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    // show errors on submit if user didn't touch fields
    setTouched({ email: true, password: true, confirmPassword: true });

    // final guard
    if (
      !email.trim() ||
      !isValidEmail(email) ||
      !password ||
      password.length < 6 ||
      !confirmPassword ||
      password !== confirmPassword
    ) {
      setFormError("Please fix the errors below and try again.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await signUp(email.trim(), password);
      if (error) {
        setFormError(error.message || "Signup failed. Please try again.");
      } else {
        alert("Signup successful! You can now log in.");
      }
    } catch (err) {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-50 to-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Header */}
          <div className="px-6 pt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                Create your account
              </h2>
              <span className="text-xs font-semibold rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                New Customer
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Create an account to save your details and checkout faster.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-6 pb-6 pt-5">
            {formError ? (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {formError}
              </div>
            ) : null}

            {/* Email */}
            <label className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <div className="mt-2">
              <input
                type="email"
                value={email}
                placeholder="you@domain.com"
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                className={[
                  "w-full rounded-xl border bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400",
                  "outline-none transition focus:ring-4",
                  emailErr
                    ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                    : "border-slate-200 focus:border-slate-400 focus:ring-slate-100",
                ].join(" ")}
                autoComplete="email"
              />
              {emailErr ? (
                <p className="mt-2 text-xs text-red-600">{emailErr}</p>
              ) : null}
            </div>

            {/* Password */}
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Password
            </label>
            <div className="mt-2">
              <input
                type="password"
                value={password}
                placeholder="Minimum 6 characters"
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                className={[
                  "w-full rounded-xl border bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400",
                  "outline-none transition focus:ring-4",
                  passwordErr
                    ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                    : "border-slate-200 focus:border-slate-400 focus:ring-slate-100",
                ].join(" ")}
                autoComplete="new-password"
              />
              {passwordErr ? (
                <p className="mt-2 text-xs text-red-600">{passwordErr}</p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  Tip: Use a mix of letters and numbers.
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Confirm password
            </label>
            <div className="mt-2">
              <input
                type="password"
                value={confirmPassword}
                placeholder="Re-enter password"
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() =>
                  setTouched((t) => ({ ...t, confirmPassword: true }))
                }
                className={[
                  "w-full rounded-xl border bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400",
                  "outline-none transition focus:ring-4",
                  confirmErr
                    ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                    : "border-slate-200 focus:border-slate-400 focus:ring-slate-100",
                ].join(" ")}
                autoComplete="new-password"
              />
              {confirmErr ? (
                <p className="mt-2 text-xs text-red-600">{confirmErr}</p>
              ) : null}
            </div>

            {/* CTA */}
            <button
              type="submit"
              disabled={!canSubmit}
              className={[
                "mt-5 w-full rounded-xl py-3 text-sm font-semibold transition",
                "focus:outline-none focus:ring-4 focus:ring-slate-200",
                canSubmit
                  ? "bg-slate-900 text-white hover:bg-slate-800"
                  : "bg-slate-200 text-slate-500 cursor-not-allowed",
              ].join(" ")}
            >
              {loading ? "Creating account..." : "Sign Up"}
            </button>

            {/* Footer */}
            <div className="mt-5 text-center text-sm text-slate-600">
              Already have an account?{" "}
              <button
                type="button"
                className="font-semibold text-slate-900 hover:underline"
                onClick={() => alert("Route to /login")}
              >
                Sign in
              </button>
            </div>

            <div className="mt-4 text-center text-xs text-slate-400">
              By creating an account, you agree to our{" "}
              <span className="underline cursor-pointer">Terms</span> &{" "}
              <span className="underline cursor-pointer">Privacy Policy</span>.
            </div>
          </form>
        </div>

        {/* Trust row */}
        <div className="mt-4 flex items-center justify-center gap-3 text-xs text-slate-500">
          <span className="rounded-full bg-slate-100 px-3 py-1">🔒 Secure</span>
          <span className="rounded-full bg-slate-100 px-3 py-1">
            🚚 Fast checkout
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1">
            ✅ Trusted
          </span>
        </div>
      </div>
    </div>
  );
}
