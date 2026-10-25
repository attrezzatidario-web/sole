import { ArrowDownRight, ArrowUpRight } from "lucide-react";

/** Data e ora in orario italiano, es. "02 ott, 14:33". */
export function quando(ts: string) {
  return new Date(ts).toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  });
}

export function PillDirezione({ direzione }: { direzione: "buy" | "sell" }) {
  const buy = direzione === "buy";
  const Icona = buy ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-lg px-2 py-0.5 text-xs font-semibold ${
        buy ? "bg-up/12 text-up" : "bg-down/12 text-down"
      }`}
    >
      <Icona size={13} strokeWidth={2.4} />
      {buy ? "Buy" : "Sell"}
    </span>
  );
}
