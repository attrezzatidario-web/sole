"use client";

import { LineChart, Plus, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import CandleChart from "@/components/CandleChart";
import { ASSETS } from "@/lib/domain/correlations";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";

interface KeyLevel {
  id: string;
  asset_symbol: string;
  prezzo: number;
  timeframe: string;
  tipo: "resistenza" | "supporto";
  note: string | null;
  inserito_da_utente: boolean;
}

export default function KeyLevelsPage() {
  const [levels, setLevels] = useState<KeyLevel[] | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [filtro, setFiltro] = useState("Tutti");
  const [assetGrafico, setAssetGrafico] = useState("XAUUSD");

  async function load() {
    if (!supabase) {
      setLevels([]);
      return;
    }
    const { data } = await supabase
      .from("key_levels")
      .select("id, asset_symbol, prezzo, timeframe, tipo, note, inserito_da_utente")
      .order("asset_symbol", { ascending: true })
      .order("prezzo", { ascending: false });
    setLevels((data ?? []) as KeyLevel[]);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    const form = e.currentTarget;
    setSalvo(true);
    const f = new FormData(form);
    await supabase.from("key_levels").insert({
      asset_symbol: f.get("asset_symbol"),
      prezzo: Number(f.get("prezzo")),
      timeframe: f.get("timeframe"),
      tipo: f.get("tipo"),
      note: f.get("note") || null,
      inserito_da_utente: true,
    });
    setSalvo(false);
    form.reset();
    load();
  }

  async function elimina(id: string) {
    if (!supabase) return;
    await supabase.from("key_levels").delete().eq("id", id);
    load();
  }

  const simboli = ["Tutti", ...Array.from(new Set((levels ?? []).map((l) => l.asset_symbol)))];
  const visibili = (levels ?? []).filter((l) => filtro === "Tutti" || l.asset_symbol === filtro);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Key level</h1>
        <p className="mt-1 text-sm text-muted">
          I livelli calcolati in automatico si aggiornano ogni giorno. Qui puoi aggiungere i tuoi (non
          vengono mai sovrascritti).
        </p>
      </div>

      {!isSupabaseConfigured ? (
        <p className="card border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          Collega Supabase per salvare i key level.
        </p>
      ) : (
        <>
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="card-title flex items-center gap-2">
                <LineChart size={14} /> Grafico
              </h2>
              <select
                value={assetGrafico}
                onChange={(e) => setAssetGrafico(e.target.value)}
                className="input !h-9 !w-auto"
              >
                {ASSETS.map((a) => (
                  <option key={a.symbol} value={a.symbol}>
                    {a.symbol}
                  </option>
                ))}
              </select>
            </div>
            <CandleChart
              symbol={assetGrafico}
              mostraLivelliDiDefault
              livelli={(levels ?? [])
                .filter((l) => l.asset_symbol === assetGrafico)
                .map((l) => ({ prezzo: l.prezzo, tipo: l.tipo, timeframe: l.timeframe }))}
            />
          </section>

          <form onSubmit={handleSubmit} className="card grid gap-3 p-5 sm:grid-cols-6">
            <select name="asset_symbol" required className="input sm:col-span-1">
              {ASSETS.map((a) => (
                <option key={a.symbol} value={a.symbol}>
                  {a.symbol}
                </option>
              ))}
            </select>
            <input
              name="prezzo"
              type="number"
              step="any"
              inputMode="decimal"
              placeholder="Prezzo"
              required
              className="input sm:col-span-1"
            />
            <select name="timeframe" required className="input sm:col-span-1">
              <option value="Mensile">Mensile</option>
              <option value="Daily">Daily</option>
              <option value="H4">H4</option>
              <option value="H1">H1</option>
            </select>
            <select name="tipo" required className="input sm:col-span-1">
              <option value="resistenza">Resistenza</option>
              <option value="supporto">Supporto</option>
            </select>
            <input name="note" placeholder="Nota (facoltativa)" className="input sm:col-span-2" />
            <button type="submit" disabled={salvo} className="btn-primary sm:col-span-6 !h-11">
              <Plus size={16} /> {salvo ? "Salvo…" : "Aggiungi key level"}
            </button>
          </form>

          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {simboli.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setFiltro(s);
                  if (s !== "Tutti") setAssetGrafico(s);
                }}
                className={`h-9 shrink-0 rounded-full px-4 text-sm font-medium transition ${
                  filtro === s ? "bg-fg text-bg" : "border border-line bg-surface text-muted hover:text-fg"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {levels === null ? (
            <div className="card h-40 animate-pulse" />
          ) : visibili.length === 0 ? (
            <p className="card p-5 text-sm text-muted">Nessun livello. Aprendo un asset puoi calcolarli in automatico.</p>
          ) : (
            <div className="card divide-y divide-line/70">
              {visibili.map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${l.tipo === "resistenza" ? "bg-down" : "bg-up"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {l.asset_symbol}{" "}
                        <span className="font-normal text-muted">
                          {l.tipo === "resistenza" ? "Resistenza" : "Supporto"} · {l.timeframe}
                        </span>
                      </p>
                      <p className="truncate text-xs text-muted">
                        {l.inserito_da_utente ? l.note ?? "Manuale" : l.note ?? "Automatico"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="num text-sm font-medium">{l.prezzo}</span>
                    <button
                      onClick={() => elimina(l.id)}
                      aria-label="Elimina livello"
                      className="rounded-lg p-2 text-muted transition hover:bg-surface2 hover:text-down"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
