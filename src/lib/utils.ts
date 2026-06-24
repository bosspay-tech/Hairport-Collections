export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function formatMoney(value: number | string | null | undefined) {
  const num = Number(value || 0);
  return `₹${num.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}
