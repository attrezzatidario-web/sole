"use client";

import { useEffect, useState } from "react";
import { calcolaScenario } from "@/lib/domain/scenario";
import type { PriceInfo } from "@/lib/usePrices";
import ChangePill from "./ChangePill";

const STATI = {
  in_attesa: { testo: "In attesa", cls: "bg-surface2 text-muted" },
  in_formazione: { testo: "In formazione", cls: "bg-warn/15 text-warn" },
  maturo: { testo: "Maturo", cls: "bg-up/12 text-up" },
  chiuso: { testo: "Sessione chiusa", cls: "bg-surface2 text-muted" },
} as const;

const SCENARI = [
  { id: "A", nome: "Indici e oro insieme, dollaro contrario", prob: "70%" },
  { id: "B", nome: "Indici e dollaro insieme, oro contrario", prob: "15%" },
  { id: "C", nome: "Dollaro e oro insieme, indici contrari", prob: "15%" },
];

/** Bussola della giornata: quale delle 3 correlazioni USD–Indici–XAU è in corso (matura verso le 16:00). */
export default function ScenarioCard({ prices }: { prices: Record<string, PriceInfo> }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  if (!now) return <div className="card h-64 animate-pulse" />;

  const s = calcolaScenario(
    {
      usd: prices.DXY?.changePct ?? null,
      xau: prices.XAUUSD?.changePct ?? null,
      indici: [prices.DJI?.changePct ?? null, prices.SPX?.changePct ?? null, prices.NDQ?.changePct ?? null],
    },
    now
  );
  const stato = STATI[s.stato];
  const spento = s.stato === "in_attesa";

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="card-title">Scenario USD · Indici · Oro</p>
          <h2 className="mt-1.5 text-lg font-semibold leading-snug tracking-tight">{s.titolo}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{s.descrizione}</p>
        </div>
        <span className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold ${stato.cls}`}>{stato.testo}</span>
      </div>

      <div className={`mt-4 grid grid-cols-3 gap-2.5 ${spento ? "opacity-50" : ""}`}>
        {[
          { nome: "Dollaro", sub: "DXY", v: s.usd },
          { nome: "Oro", sub: "XAUUSD", v: s.xau },
          { nome: "Indici", sub: "media DJI·SPX·NDQ", v: s.indici },
        ].map((x) => (
          <div key={x.nome} className="rounded-xl bg-surface2 px-3 py-3">
            <p className="text-sm font-semibold">{x.nome}</p>
            <p className="mb-2 truncate text-[10px] text-muted">{x.sub}</p>
            <ChangePill value={x.v} size="sm" />
          </div>
        ))}
      </div>

      <ul className="mt-4 space-y-1.5">
        {SCENARI.map((x) => {
          const attivo = s.id === x.id && !spento;
          return (
            <li
              key={x.id}
              className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-[13px] transition ${
                attivo ? "bg-accent/12 font-medium text-fg ring-1 ring-accent/40" : "text-muted"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${
                    attivo ? "bg-accent text-white" : "bg-surface2"
                  }`}
                >
                  {x.id}
                </span>
                <span className="truncate">{x.nome}</span>
              </span>
              <span className="num shrink-0 text-xs">{x.prob}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Le percentuali sono la frequenza storica indicata dal corso. Dopo le 16:00 lo scenario è considerato maturo.
      </p>
    </section>
  );
}
