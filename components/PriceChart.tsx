"use client";

import { Maximize2, X } from "lucide-react";
import { useId, useState } from "react";
import { formatOraRoma, formatPrice } from "@/lib/format";
import { useEspanso } from "@/lib/useEspanso";
import type { Point } from "@/lib/usePrices";

export default function PriceChart({
  symbol,
  points,
  trend,
}: {
  symbol: string;
  points: Point[];
  trend: "up" | "down" | "flat";
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const { espanso, apri, chiudi } = useEspanso();

  if (points.length < 2) {
    return (
      <div className="flex h-44 items-center justify-center rounded-xl bg-surface2 text-sm text-muted">
        Il grafico compare dopo i primi aggiornamenti automatici.
      </div>
    );
  }

  const W = 600;
  const H = 180;
  const min = Math.min(...points.map((p) => p.p));
  const max = Math.max(...points.map((p) => p.p));
  const range = max - min || 1;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const dt = t1 - t0 || 1;
  const x = (t: number) => ((t - t0) / dt) * W;
  const y = (v: number) => H - 14 - ((v - min) / range) * (H - 28);

  const linea = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)} ${y(p.p).toFixed(1)}`).join(" ");
  const area = `${linea} L${W} ${H} L0 ${H} Z`;
  const colore = trend === "up" ? "text-up" : trend === "down" ? "text-down" : "text-accent";

  const ultimo = points[points.length - 1];
  const sel = hover !== null ? points[hover] : null;

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const target = t0 + frac * dt;
    let best = 0;
    let bd = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(p.t - target);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best);
  }

  const focus = sel ?? ultimo;
  const fx = (x(focus.t) / W) * 100;
  const fy = (y(focus.p) / H) * 100;

  return (
    <div
      className={espanso ? "fixed inset-0 z-50 flex flex-col bg-bg p-3" : ""}
      style={
        espanso
          ? {
              paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)",
              paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)",
            }
          : undefined
      }
    >
      <div className="mb-2 flex justify-end">
        <button
          onClick={espanso ? chiudi : apri}
          aria-label={espanso ? "Chiudi schermo intero" : "Schermo intero"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface2 text-muted transition hover:text-fg"
        >
          {espanso ? <X size={15} /> : <Maximize2 size={14} />}
        </button>
      </div>
      <div
        className={`relative w-full touch-pan-y select-none ${espanso ? "min-h-0 flex-1" : "h-44 sm:h-52"}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`h-full w-full ${colore}`}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.2" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1="0"
              x2={W}
              y1={H * f}
              y2={H * f}
              stroke="rgb(var(--line))"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              strokeDasharray="3 5"
            />
          ))}
          <path d={area} fill={`url(#${id})`} />
          <path
            d={linea}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {sel && (
          <div
            className="pointer-events-none absolute top-0 h-full w-px bg-line"
            style={{ left: `${fx}%` }}
          />
        )}
        <div
          className={`pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-current ${colore}`}
          style={{ left: `${fx}%`, top: `${fy}%` }}
        />
        {sel && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-line bg-surface px-2 py-1 text-xs shadow-card"
            style={{ left: `${Math.min(88, Math.max(12, fx))}%`, top: 0 }}
          >
            <span className="num font-semibold">{formatPrice(symbol, sel.p)}</span>
            <span className="ml-2 text-muted">{formatOraRoma(sel.t)}</span>
          </div>
        )}
      </div>
      <div className="num mt-2 flex justify-between text-[11px] text-muted">
        <span>{formatOraRoma(t0)}</span>
        <span>
          min {formatPrice(symbol, min)} · max {formatPrice(symbol, max)}
        </span>
        <span>{formatOraRoma(t1)}</span>
      </div>
    </div>
  );
}
