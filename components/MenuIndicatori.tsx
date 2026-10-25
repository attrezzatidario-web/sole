"use client";

import { BarChart3, CalendarRange, ChevronDown, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { InizioGiornata } from "@/lib/domain/giorni";
import type { OpzioniOverlay } from "@/lib/grafico/overlay";

export interface VoceMenu {
  id: keyof OpzioniOverlay;
  label: string;
}

/** Menu "Indicatori" + interruttore "Giorni" (separatori di giornata e massimo/minimo del giorno prima). */
export default function MenuIndicatori({
  voci,
  overlay,
  onOverlay,
  giorniAttivi,
  onGiorni,
  mostraGiorni = true,
  inizio,
  onInizio,
  linkVolume,
}: {
  voci: VoceMenu[];
  overlay: OpzioniOverlay;
  onOverlay: (o: OpzioniOverlay) => void;
  giorniAttivi: boolean;
  onGiorni: (v: boolean) => void;
  mostraGiorni?: boolean;
  inizio: InizioGiornata;
  onInizio: (v: InizioGiornata) => void;
  linkVolume?: string;
}) {
  const [aperto, setAperto] = useState(false);
  const rif = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aperto) return;
    const click = (e: MouseEvent) => {
      if (rif.current && !rif.current.contains(e.target as Node)) setAperto(false);
    };
    document.addEventListener("mousedown", click);
    return () => document.removeEventListener("mousedown", click);
  }, [aperto]);

  const attivi = voci.filter((v) => overlay[v.id]).length;

  return (
    <div className="flex items-center gap-2">
      <div ref={rif} className="relative">
        <button
          type="button"
          onClick={() => setAperto((v) => !v)}
          className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition ${
            attivi > 0 ? "border-accent/40 bg-accent/10 text-accent" : "border-line bg-surface2 text-muted hover:text-fg"
          }`}
        >
          <SlidersHorizontal size={13} />
          Indicatori
          {attivi > 0 && <span className="num">{attivi}</span>}
          <ChevronDown size={13} className={aperto ? "rotate-180 transition-transform" : "transition-transform"} />
        </button>
        {aperto && (
          <div className="absolute left-0 top-9 z-20 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
            {voci.map((v) => (
              <label key={v.id} className="flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-sm hover:bg-surface2">
                <span>{v.label}</span>
                <input
                  type="checkbox"
                  checked={overlay[v.id]}
                  onChange={(e) => onOverlay({ ...overlay, [v.id]: e.target.checked })}
                  className="accent-accent"
                />
              </label>
            ))}
            {mostraGiorni && (
              <div className="mt-1 border-t border-line px-2.5 pb-1 pt-2.5">
                <p className="mb-1.5 text-[11px] text-muted">La giornata comincia alle (ora italiana)</p>
                <div className="flex rounded-lg border border-line bg-surface2 p-0.5">
                  {(["23:00", "00:00"] as const).map((x) => (
                    <button
                      key={x}
                      type="button"
                      onClick={() => onInizio(x)}
                      className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition ${
                        inizio === x ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"
                      }`}
                    >
                      {x === "23:00" ? "23:00 (forex/oro)" : "Mezzanotte"}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {linkVolume && (
              <div className="mt-1 border-t border-line px-2.5 pt-2">
                <Link href={linkVolume} className="flex items-center gap-1.5 py-1 text-xs text-accent hover:underline">
                  <BarChart3 size={12} /> Volume Profile →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {mostraGiorni && (
        <button
          type="button"
          onClick={() => onGiorni(!giorniAttivi)}
          className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition ${
            giorniAttivi ? "border-accent/40 bg-accent/10 text-accent" : "border-line bg-surface2 text-muted hover:text-fg"
          }`}
          title="Linee che separano le giornate e massimo/minimo del giorno prima"
        >
          <CalendarRange size={13} />
          Giorni
        </button>
      )}
    </div>
  );
}
