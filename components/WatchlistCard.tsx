import { History, PriceInfo } from "@/lib/usePrices";
import AssetRow from "./AssetRow";

export default function WatchlistCard({
  title,
  descrizione,
  simboli,
  prices,
  history,
  loading,
}: {
  title: string;
  descrizione: string;
  simboli: string[];
  prices: Record<string, PriceInfo>;
  history: History;
  loading: boolean;
}) {
  // Ordinate per variazione % (in valore assoluto), come indicato dal corso.
  const ordinati = [...simboli].sort(
    (a, b) => Math.abs(prices[b]?.changePct ?? 0) - Math.abs(prices[a]?.changePct ?? 0)
  );

  return (
    <section className="card overflow-hidden">
      <div className="border-b border-line px-4 py-3.5">
        <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">{descrizione}</p>
      </div>
      <div className="divide-y divide-line/70">
        {loading
          ? simboli.map((s) => (
              <div key={s} className="flex items-center justify-between px-4 py-4">
                <div className="h-4 w-20 animate-pulse rounded bg-surface2" />
                <div className="h-4 w-24 animate-pulse rounded bg-surface2" />
              </div>
            ))
          : ordinati.map((s) => (
              <AssetRow
                key={s}
                symbol={s}
                price={prices[s]?.price ?? null}
                changePct={prices[s]?.changePct ?? null}
                points={history[s] ?? []}
              />
            ))}
      </div>
    </section>
  );
}
