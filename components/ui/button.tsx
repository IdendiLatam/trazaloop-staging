import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "quiet";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    "inline-flex w-full items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60";
  const styles =
    variant === "primary"
      ? "bg-loop text-white hover:bg-loop-deep"
      : "border border-hairline bg-surface text-ink hover:border-loop";
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}
