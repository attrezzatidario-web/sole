import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { formatPct } from "@/lib/format";

export default function ChangePill({
  value,
  size = "md",
}: {
  value: number | null | undefined;
  size?: "sm" | "md" | "lg";
}) {
  const v = value ?? null;
  const su = v !== null && v > 0.004;
  const giu = v !== null && v < -0.004;
  const colori = su ? "bg-up/12 text-up" : giu ? "bg-down/12 text-down" : "bg-surface2 text-muted";
  const dim =
    size === "lg" ? "h-8 px-2.5 text-sm gap-1" : size === "sm" ? "h-6 px-1.5 text-xs gap-0.5" : "h-7 px-2 text-[13px] gap-0.5";
  const Icona = su ? ArrowUpRight : giu ? ArrowDownRight : Minus;
  return (
    <span className={`num inline-flex items-center rounded-lg font-semibold ${dim} ${colori}`}>
      <Icona size={size === "lg" ? 16 : 13} strokeWidth={2.4} />
      {formatPct(v)}
    </span>
  );
}
