import Link from "next/link";
import { trendOf } from "./AssetRow";
import Sparkline from "./Sparkline";
import ChangePill from "./ChangePill";
import { assetLabel, formatPrice } from "@/lib/format";
import { useAnimatedNumber, useFlashOnChange } from "@/lib/useLivePrice";
import { downsample, Point } from "@/lib/usePrices";

export default function FocusTile({
  symbol,
  price,
  changePct,
  points,
  loading,
}: {
  symbol: string;
  price: number | null;
  changePct: number | null;
  points: Point[];
  loading: boolean;
}) {
  const prezzoAnimato = useAnimatedNumber(price);
  const pctAnimata = useAnimatedNumber(changePct);
  const flash = useFlashOnChange(price);

  return (
    <Link
      href={`/asset/${symbol}/`}
      className={`card group p-4 transition hover:border-accent/50 ${
        flash === "su" ? "flash-su" : flash === "giu" ? "flash-giu" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{symbol}</p>
          <p className="truncate text-[11px] text-muted">{assetLabel(symbol)}</p>
        </div>
      </div>
      <p className="num mt-3 text-xl font-semibold tracking-tight">
        {loading ? (
          <span className="inline-block h-6 w-24 animate-pulse rounded bg-surface2" />
        ) : (
          formatPrice(symbol, prezzoAnimato)
        )}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <ChangePill value={pctAnimata} size="sm" />
        <Sparkline
          values={downsample(points, 30).map((x) => x.p)}
          trend={trendOf(changePct)}
          className="h-6 w-16"
        />
      </div>
    </Link>
  );
}
