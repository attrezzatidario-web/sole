import Link from "next/link";
import { assetLabel, formatPrice } from "@/lib/format";
import { useAnimatedNumber, useFlashOnChange } from "@/lib/useLivePrice";
import { Point, downsample } from "@/lib/usePrices";
import ChangePill from "./ChangePill";
import Sparkline from "./Sparkline";

export function trendOf(pct: number | null | undefined): "up" | "down" | "flat" {
  if (pct === null || pct === undefined) return "flat";
  return pct > 0.004 ? "up" : pct < -0.004 ? "down" : "flat";
}

export default function AssetRow({
  symbol,
  price,
  changePct,
  points,
}: {
  symbol: string;
  price: number | null;
  changePct: number | null;
  points: Point[];
}) {
  const prezzoAnimato = useAnimatedNumber(price);
  const pctAnimata = useAnimatedNumber(changePct);
  const flash = useFlashOnChange(price);

  return (
    <Link
      href={`/asset/${symbol}/`}
      className={`grid grid-cols-[minmax(0,1fr)_64px_auto] items-center gap-3 px-4 py-3 transition hover:bg-surface2 sm:grid-cols-[minmax(0,1fr)_88px_auto] ${
        flash === "su" ? "flash-su" : flash === "giu" ? "flash-giu" : ""
      }`}
    >
      <div className="min-w-0">
        <p className="text-[15px] font-semibold leading-tight">{symbol}</p>
        <p className="truncate text-xs text-muted">{assetLabel(symbol)}</p>
      </div>
      <Sparkline
        values={downsample(points, 36).map((p) => p.p)}
        trend={trendOf(changePct)}
        className="h-7 w-full"
      />
      <div className="flex flex-col items-end gap-1">
        <span className="num text-[15px] font-medium leading-none">{formatPrice(symbol, prezzoAnimato)}</span>
        <ChangePill value={pctAnimata} size="sm" />
      </div>
    </Link>
  );
}
