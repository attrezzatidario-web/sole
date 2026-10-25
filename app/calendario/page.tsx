"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { ASSETS } from "@/lib/domain/correlations";
import { TIPI_NOTIZIA } from "@/lib/domain/news";
import { supabase } from "@/lib/supabaseClient";

interface EventoNotizia {
  titolo: string;
  orario: string;
  importanza: "alta" | "media" | "bassa";
  asset_impattati: string[] | null;
}

const TZ = "Europe/Rome";
const giorno = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: TZ });

function etichettaGiorno(chiave: string) {
  const oggi = giorno(new Date());
  const domani = giorno(new Date(Date.now() + 86400000));
  if (chiave === oggi) return "Oggi";
  if (chiave === domani) return "Domani";
  return new Date(chiave + "T12:00:00").toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

type Importanza = "tutte" | "media" | "alta";
const SOGLIE: { id: Importanza; label: string }[] = [
  { id: "tutte", label: "Tutte" },
  { id: "media", label: "Media e alta" },
  { id: "alta", label: "Solo alta" },
];

export default function CalendarioPage() {
  const [eventi, setEventi] = useState<EventoNotizia[] | null>(null);
  const [soglia, setSoglia] = useState<Importanza>("media");
  const [assetFiltro, setAssetFiltro] = useState<string>("Tutti");

  useEffect(() => {
    let attivo = true;
    async function carica() {
      if (!supabase) {
        setEventi([]);
        return;
      }
      let q = supabase
        .from("news_events")
        .select("titolo, orario, importanza, asset_impattati")
        .gte("orario", new Date().toISOString())
        .order("orario", { ascending: true })
        .limit(80);
      if (soglia === "media") q = q.in("importanza", ["alta", "media"]);
      if (soglia === "alta") q = q.eq("importanza", "alta");
      if (assetFiltro !== "Tutti") q = q.contains("asset_impattati", [assetFiltro]);
      const { data } = await q;
      if (attivo) setEventi((data ?? []) as EventoNotizia[]);
    }
    carica();
    return () => {
      attivo = false;
    };
  }, [soglia, assetFiltro]);

  const gruppi = new Map<string, EventoNotizia[]>();
  for (const e of eventi ?? []) {
    const k = giorno(new Date(e.orario));
    gruppi.set(k, [...(gruppi.get(k) ?? []), e]);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notizie</h1>
        <p className="mt-1 text-sm text-muted">Eventi macro in arrivo, in orario italiano.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-line bg-surface2 p-0.5">
          {SOGLIE.map((s) => (
            <button
              key={s.id}
              onClick={() => setSoglia(s.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                soglia === s.id ? "bg-surface text-fg shadow-sm" : "text-muted"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <select
          value={assetFiltro}
          onChange={(e) => setAssetFiltro(e.target.value)}
          className="input !h-9 !w-auto"
        >
          <option value="Tutti">Tutti gli asset</option>
          {ASSETS.map((a) => (
            <option key={a.symbol} value={a.symbol}>
              {a.symbol}
            </option>
          ))}
        </select>
      </div>

      {eventi === null ? (
        <div className="card h-56 animate-pulse" />
      ) : eventi.length === 0 ? (
        <p className="card p-5 text-sm text-muted">Nessun evento in arrivo con questi filtri.</p>
      ) : (
        [...gruppi.entries()].map(([k, lista]) => (
          <section key={k}>
            <h2 className="mb-2 px-1 text-sm font-semibold capitalize">{etichettaGiorno(k)}</h2>
            <div className="card divide-y divide-line/70">
              {lista.map((e, i) => (
                <div key={i} className="flex items-start gap-4 px-4 py-3.5">
                  <span className="num w-12 shrink-0 pt-0.5 text-sm font-semibold">
                    {new Date(e.orario).toLocaleTimeString("it-IT", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: TZ,
                    })}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">{e.titolo}</p>
                    {e.asset_impattati && (
                      <p className="mt-1 truncate text-xs text-muted">{e.asset_impattati.slice(0, 6).join(" · ")}</p>
                    )}
                  </div>
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                      e.importanza === "alta" ? "bg-down" : e.importanza === "media" ? "bg-warn" : "bg-muted/50"
                    }`}
                    title={`Importanza ${e.importanza}`}
                  />
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      <details className="card group p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
          Glossario delle notizie fondamentali
          <ChevronDown size={16} className="text-muted transition group-open:rotate-180" />
        </summary>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {TIPI_NOTIZIA.map((t) => (
            <div key={t.chiave}>
              <p className="text-sm font-semibold">{t.nome}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.spiegazione}</p>
              <p className="mt-1 text-xs leading-relaxed text-accent">{t.usoOperativo}</p>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
