import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
};

const variants = {
  primary:
    "bg-rose-900 text-white hover:bg-rose-800 shadow-lg shadow-rose-900/15 focus-visible:ring-rose-300",
  secondary:
    "bg-rose-500 text-white hover:bg-rose-400 shadow-lg shadow-rose-500/20 focus-visible:ring-rose-300",
  ghost: "bg-transparent text-rose-900 hover:bg-rose-50 focus-visible:ring-rose-200",
  outline:
    "border border-rose-200 bg-white text-rose-900 hover:bg-rose-50 focus-visible:ring-rose-200",
};

const sizes = {
  sm: "px-4 py-2 text-xs",
  md: "px-5 py-2.5 text-sm",
  lg: "px-7 py-3 text-sm",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
