"use client";

import { Check, Minus, X } from "lucide-react";
import { useState } from "react";
import { formatPct, formatPrice } from "@/lib/format";
import type { Elemento } from "@/lib/domain/confluenze";
import { FibDati, PitchforkDati, pitchforkAt } from "@/lib/domain/tecniche";

export interface AnalisiRow {
  tipo: "fibonacci" | "pitchfork" | "struttura" | "ema_cross";
  timeframe: string;
  dati: any;
  ts: string;
}

const dist = (livello: number, prezzo: number | null) =>
  prezzo ? formatPct(((livello - prezzo) / prezzo) * 100) : "";

function Card({ titolo, azione, children }: { titolo: string; azione?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="card-title">{titolo}</h2>
        {azione}
      </div>
      {children}
    </section>
  );
}

export function ConfluenzeCard({ elementi }: { elementi: Elemento[] }) {
  const applicabili = elementi.filter((e) => e.esito !== "nd");
  const si = applicabili.filter((e) => e.esito === "si").length;
  return (
    <Card
      titolo="Confluenze"
      azione={
        <span className="num text-sm font-semibold">
          {si}
          <span className="text-muted">/{applicabili.length || elementi.length}</span>
        </span>
      }
    >
      <div className="mb-4 flex gap-1">
        {elementi.map((e, i) => (
          <span
            key={e.id}
            className={`h-1.5 flex-1 origin-left scale-x-0 rounded-full ${
              e.esito === "si" ? "bg-up" : e.esito === "no" ? "bg-down/70" : "bg-surface2"
            }`}
            style={{ animation: `sole-bar-in 0.45s cubic-bezier(.2,.8,.2,1) ${i * 55}ms forwards` }}
          />
        ))}
      </div>
      <ul className="space-y-2.5">
        {elementi.map((e, i) => (
          <li
            key={e.id}
            className="flex items-start gap-3 opacity-0"
            style={{ animation: `sole-riga-in 0.35s ease-out ${i * 55 + 120}ms forwards` }}
          >
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 scale-0 items-center justify-center rounded-full ${
                e.esito === "si" ? "bg-up/15 text-up" : e.esito === "no" ? "bg-down/15 text-down" : "bg-surface2 text-muted"
              }`}
              style={{ animation: `sole-pop-in 0.4s cubic-bezier(.2,.9,.3,1.3) ${i * 55 + 160}ms forwards` }}
            >
              {e.esito === "si" ? <Check size={12} strokeWidth={3} /> : e.esito === "no" ? <X size={12} strokeWidth={3} /> : <Minus size={12} strokeWidth={3} />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium leading-snug">{e.titolo}</p>
              <p className="text-xs text-muted">{e.dettaglio}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        Elenco di controllo informativo: mostra quanti elementi della metodologia sono allineati, non è un segnale.
      </p>
    </Card>
  );
}

export function FibonacciCard({ symbol, priceNow, righe }: { symbol: string; priceNow: number | null; righe: AnalisiRow[] }) {
  const fib = righe.filter((r) => r.tipo === "fibonacci");
  const [tf, setTf] = useState(fib.find((r) => r.timeframe === "H4") ? "H4" : fib[0]?.timeframe ?? "H4");
  const corrente = fib.find((r) => r.timeframe === tf);
  const d = corrente?.dati as FibDati | undefined;

  return (
    <Card
      titolo="Fibonacci"
      azione={
        fib.length > 1 ? (
          <div className="flex rounded-lg border border-line bg-surface2 p-0.5">
            {fib.map((r) => (
              <button
                key={r.timeframe}
                onClick={() => setTf(r.timeframe)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${tf === r.timeframe ? "bg-surface text-fg shadow-sm" : "text-muted"}`}
              >
                {r.timeframe}
              </button>
            ))}
          </div>
        ) : undefined
      }
    >
      {!d ? (
        <p className="text-sm text-muted">
          Non ancora calcolato: premi «Calcola» nel riquadro Key level di questo asset.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted">
            Gamba <span className="font-medium text-fg">{d.direzione}</span> da{" "}
            <span className="num text-fg">{formatPrice(symbol, d.da.p)}</span> a{" "}
            <span className="num text-fg">{formatPrice(symbol, d.a.p)}</span>
          </p>
          <ul className="mt-3 divide-y divide-line/70">
            {[...d.livelli]
              .sort((a, b) => b.prezzo - a.prezzo)
              .map((l) => (
                <li key={l.rapporto} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-muted">{(l.rapporto * 100).toFixed(1).replace(".", ",")}%</span>
                  <span className="flex items-baseline gap-3">
                    <span className="num font-medium">{formatPrice(symbol, l.prezzo)}</span>
                    <span className="num w-14 text-right text-xs text-muted">{dist(l.prezzo, priceNow)}</span>
                  </span>
                </li>
              ))}
          </ul>

          {d.zone.length > 0 && (
            <div className="mt-4">
              <p className="card-title mb-2">Zone di confluenza</p>
              <ul className="space-y-2">
                {d.zone.slice(0, 4).map((z, i) => (
                  <li key={i} className="rounded-xl border border-accent/30 bg-accent/8 px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <span className="num text-sm font-semibold">{formatPrice(symbol, z.prezzo)}</span>
                      <span className="num text-xs text-muted">
                        {dist(z.prezzo, priceNow)} · {z.forza} livelli
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted">{z.fonti.slice(0, 4).join(" · ")}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] leading-relaxed text-muted">
                Una zona è più forte quando si sovrappongono i ritracciamenti di più gambe di mercato o un key level
                (è il «scalare i massimi/minimi» del corso).
              </p>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

export function PitchforkCard({ symbol, priceNow, righe }: { symbol: string; priceNow: number | null; righe: AnalisiRow[] }) {
  const r = righe.find((x) => x.tipo === "pitchfork");
  const d = r?.dati as PitchforkDati | undefined;

  const linee = d
    ? (() => {
        const v = pitchforkAt(d.pivots, Math.floor(Date.now() / 1000));
        return [
          { nome: "Linea alta", valore: v.alta },
          { nome: "½ alta", valore: v.metaAlta },
          { nome: "Mediana", valore: v.mediana, evidenza: true },
          { nome: "½ bassa", valore: v.metaBassa },
          { nome: "Linea bassa", valore: v.bassa },
        ];
      })()
    : [];
  const piuVicina =
    priceNow !== null && linee.length
      ? linee.reduce((a, b) => (Math.abs(b.valore - priceNow) < Math.abs(a.valore - priceNow) ? b : a)).nome
      : null;

  return (
    <Card
      titolo="Pitchfork · H1"
      azione={
        d ? (
          <span className="rounded-md bg-surface2 px-2 py-1 text-[11px] font-semibold capitalize text-muted">{d.tipo}</span>
        ) : undefined
      }
    >
      {!d ? (
        <p className="text-sm text-muted">
          Non ancora calcolato: premi «Calcola» nel riquadro Key level di questo asset.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-line/70">
            {linee.map((l) => (
              <li
                key={l.nome}
                className={`flex items-center justify-between py-2 text-sm ${l.nome === piuVicina ? "font-semibold" : ""}`}
              >
                <span className={`flex items-center gap-2 ${l.evidenza ? "text-accent" : "text-muted"}`}>
                  {l.nome === piuVicina && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                  {l.nome}
                </span>
                <span className="flex items-baseline gap-3">
                  <span className="num">{formatPrice(symbol, l.valore)}</span>
                  <span className="num w-14 text-right text-xs font-normal text-muted">{dist(l.valore, priceNow)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Forcone dai 3 pivot più recenti ({d.tipo === "ribassista" ? "2 massimi e 1 minimo" : "2 minimi e 1 massimo"}).
            I valori sono quelli di adesso: le linee salgono o scendono con il tempo. La mediana è il livello più
            importante.
          </p>
        </>
      )}
    </Card>
  );
}
