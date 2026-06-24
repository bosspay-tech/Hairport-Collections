import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-2xl border border-rose-200/80 bg-white px-4 py-3 text-sm text-rose-950 outline-none transition placeholder:text-rose-400 focus:border-rose-400 focus:ring-4 focus:ring-rose-100",
        className,
      )}
      {...props}
    />
  );
}
