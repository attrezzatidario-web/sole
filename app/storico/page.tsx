"use client";

import { AlertTriangle, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

interface EventoTimeline {
  tipo: "report" | "divergenza";
  ts: string;
  asset_symbol: string;
  correlato_symbol?: string;
  testo: string;
}

async function caricaStorico(): Promise<EventoTimeline[]> {
  if (!supabase) return [];
  const [reportsRes, divergenzeRes] = await Promise.all([
    supabase
      .from("analysis_reports")
      .select("asset_symbol, timestamp, testo_generato_ai")
      .order("timestamp", { ascending: false })
      .limit(20),
    supabase
      .from("correlation_checks")
      .select("asset_symbol, correlato_symbol, ts")
      .eq("stato", "divergente")
      .order("ts", { ascending: false })
      .limit(20),
  ]);
  const reports: EventoTimeline[] = (reportsRes.data ?? []).map((r) => ({
    tipo: "report",
    ts: r.timestamp,
    asset_symbol: r.asset_symbol,
    testo: r.testo_generato_ai,
  }));
  // Le divergenze si ripetono a ogni ciclo: si mostra una sola riga per coppia.
  const viste = new Set<string>();
  const divergenze: EventoTimeline[] = [];
  for (const d of divergenzeRes.data ?? []) {
    const chiave = [d.asset_symbol, d.correlato_symbol].sort().join("|");
    if (viste.has(chiave)) continue;
    viste.add(chiave);
    divergenze.push({
      tipo: "divergenza",
      ts: d.ts,
      asset_symbol: d.asset_symbol,
      correlato_symbol: d.correlato_symbol,
      testo: `La correlazione tra ${d.asset_symbol} e ${d.correlato_symbol} non sta rispettando la relazione attesa.`,
    });
  }
  return [...reports, ...divergenze].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}

function quando(ts: string) {
  return new Date(ts).toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  });
}

export default function StoricoPage() {
  const [eventi, setEventi] = useState<EventoTimeline[] | null>(null);
  const [aperto, setAperto] = useState<number | null>(null);

  useEffect(() => {
    caricaStorico().then(setEventi);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Storico H24</h1>
        <p className="mt-1 text-sm text-muted">
          Cosa è successo mentre non guardavi: report AI automatici e divergenze di correlazione.
        </p>
      </div>

      {eventi === null ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-24 animate-pulse" />
          ))}
        </div>
      ) : eventi.length === 0 ? (
        <p className="card p-5 text-sm text-muted">
          Nessun evento ancora. Il primo report automatico arriva entro un'ora.
        </p>
      ) : (
        <ol className="relative space-y-3 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-line">
          {eventi.map((e, i) => {
            const div = e.tipo === "divergenza";
            return (
              <li key={i} className="relative pl-11">
                <span
                  className={`absolute left-0 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface ${
                    div ? "text-warn" : "text-accent"
                  }`}
                >
                  {div ? <AlertTriangle size={15} /> : <Sparkles size={15} />}
                </span>
                <div className="card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/asset/${e.asset_symbol}/`} className="font-semibold hover:text-accent">
                      {e.asset_symbol}
                      {e.correlato_symbol ? <span className="text-muted"> ↔ </span> : null}
                      {e.correlato_symbol}
                    </Link>
                    <span className="num text-xs text-muted">{quando(e.ts)}</span>
                  </div>
                  <p
                    className={`mt-2 whitespace-pre-line text-sm leading-relaxed text-muted ${
                      aperto === i ? "" : "line-clamp-3"
                    }`}
                  >
                    {e.testo}
                  </p>
                  {!div && (
                    <button
                      onClick={() => setAperto(aperto === i ? null : i)}
                      className="mt-2 text-xs font-medium text-accent"
                    >
                      {aperto === i ? "Riduci" : "Leggi tutto"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
