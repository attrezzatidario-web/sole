"use client";

import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  calcolaJournal,
  calcolaPiano,
  euro,
  IMPOSTAZIONI_PREDEFINITE,
  ImpostazioniConto,
  lotti,
  percento,
  riepilogo,
  VoceJournal,
} from "@/lib/domain/conto";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";

const CAMPI: { chiave: keyof ImpostazioniConto; etichetta: string; suffisso: string; step: string }[] = [
  { chiave: "capitale_iniziale", etichetta: "Capitale iniziale", suffisso: "€", step: "any" },
  { chiave: "profitto_pct", etichetta: "Profitto per periodo", suffisso: "%", step: "any" },
  { chiave: "rischio_pct", etichetta: "Rischio per operazione", suffisso: "%", step: "any" },
  { chiave: "pips_stop", etichetta: "Pips stop loss", suffisso: "pips", step: "any" },
  { chiave: "valore_pip", etichetta: "Valore pip (1 lotto)", suffisso: "€", step: "any" },
  { chiave: "periodi", etichetta: "Periodi del piano", suffisso: "", step: "1" },
];

const oggi = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
const dataBreve = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "2-digit" });
const num = (v: number) => v.toLocaleString("it-IT", { maximumFractionDigits: 2 });
const colore = (v: number | null) => (v === null || Math.abs(v) < 0.005 ? "" : v > 0 ? "text-up" : "text-down");

export default function ContoPage() {
  const [imp, setImp] = useState<ImpostazioniConto>(IMPOSTAZIONI_PREDEFINITE);
  const [bozza, setBozza] = useState<Record<string, string>>({});
  const [voci, setVoci] = useState<VoceJournal[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [impAperte, setImpAperte] = useState(false);
  const [pianoCompleto, setPianoCompleto] = useState(false);

  async function carica() {
    if (!supabase) {
      setVoci([]);
      return;
    }
    const [i, j] = await Promise.all([
      supabase.from("conto_impostazioni").select("*").eq("id", 1).maybeSingle(),
      supabase.from("conto_journal").select("id, data, pnl, nota").order("data"),
    ]);
    if (i.error || j.error) {
      setErrore("Tabelle del conto non trovate: esegui 14_CONTO.sql su Supabase.");
      setVoci([]);
      return;
    }
    if (i.data) {
      const s = { ...IMPOSTAZIONI_PREDEFINITE };
      for (const c of CAMPI) if (i.data[c.chiave] != null) s[c.chiave] = Number(i.data[c.chiave]);
      setImp(s);
    }
    setVoci((j.data ?? []).map((v: any) => ({ ...v, pnl: Number(v.pnl) })));
  }

  useEffect(() => {
    carica();
  }, []);

  const piano = useMemo(() => calcolaPiano(imp), [imp]);
  const journal = useMemo(() => calcolaJournal(voci ?? [], imp.capitale_iniziale), [voci, imp.capitale_iniziale]);
  const r = useMemo(() => riepilogo(imp, piano, journal), [imp, piano, journal]);

  async function aggiungi(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    const form = e.currentTarget;
    const f = new FormData(form);
    const pnl = Number(String(f.get("pnl")).replace(",", "."));
    if (!Number.isFinite(pnl)) return;
    setSalvo(true);
    await supabase.from("conto_journal").insert({ data: f.get("data") || oggi(), pnl, nota: f.get("nota") || null });
    setSalvo(false);
    form.reset();
    (form.elements.namedItem("data") as HTMLInputElement).value = oggi();
    carica();
  }

  async function elimina(id: string) {
    if (!supabase) return;
    await supabase.from("conto_journal").delete().eq("id", id);
    carica();
  }

  async function salvaImpostazioni() {
    if (!supabase) return;
    const nuove = { ...imp };
    for (const c of CAMPI) {
      const v = Number(String(bozza[c.chiave] ?? imp[c.chiave]).replace(",", "."));
      if (Number.isFinite(v) && v > 0) nuove[c.chiave] = c.chiave === "periodi" ? Math.min(1000, Math.round(v)) : v;
    }
    setSalvo(true);
    await supabase.from("conto_impostazioni").upsert({ id: 1, ...nuove, aggiornato_il: new Date().toISOString() });
    setSalvo(false);
    setImp(nuove);
    setBozza({});
    setImpAperte(false);
  }

  // del piano mostro il periodo in corso e i successivi, a meno di aprirlo tutto
  const daMostrare = pianoCompleto ? piano : piano.slice(Math.max(0, r.periodoAttuale - 1), r.periodoAttuale + 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conto</h1>
        <p className="mt-1 text-sm text-muted">Piano di compounding e journal del conto.</p>
      </div>

      {!isSupabaseConfigured ? (
        <p className="card border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">Collega Supabase per usare il conto.</p>
      ) : errore ? (
        <p className="card border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">{errore}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="card p-4">
              <p className="text-xs text-muted">Capitale attuale</p>
              <p className="num mt-1 text-xl font-semibold">{euro(r.capitaleAttuale)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-muted">Profitto</p>
              <p className={`num mt-1 text-xl font-semibold ${colore(r.profittoEuro)}`}>{euro(r.profittoEuro, true)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-muted">Profitto %</p>
              <p className={`num mt-1 text-xl font-semibold ${colore(r.profittoPct)}`}>{percento(r.profittoPct)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-muted">Rispetto al piano</p>
              <p className={`num mt-1 text-xl font-semibold ${colore(r.scartoPiano)}`}>{euro(r.scartoPiano, true)}</p>
              <p className="num mt-0.5 text-[11px] text-muted">Periodo {r.periodoAttuale}</p>
            </div>
          </div>

          <div className="card p-5">
            <p className="card-title">Prossima operazione</p>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-muted">Lotto</p>
                <p className="num mt-0.5 text-lg font-semibold">{lotti(r.prossima.lotto)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Rischio</p>
                <p className="num mt-0.5 text-lg font-semibold">{euro(r.prossima.rischio)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Obiettivo</p>
                <p className="num mt-0.5 text-lg font-semibold">{euro(r.prossima.obiettivo)}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Pips da fare</p>
                <p className="num mt-0.5 text-lg font-semibold">{r.prossima.pips.toLocaleString("it-IT", { maximumFractionDigits: 1 })}</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-muted">
              Calcolato sul capitale attuale · stop {num(imp.pips_stop)} pips · rischio {num(imp.rischio_pct)}% · obiettivo {num(imp.profitto_pct)}%
            </p>
          </div>

          <div>
            <p className="card-title mb-2">Journal</p>
            <form onSubmit={aggiungi} className="card grid grid-cols-2 gap-3 p-4 sm:grid-cols-[150px_180px_1fr_auto]">
              <input name="data" type="date" defaultValue={oggi()} required className="input" />
              <input name="pnl" type="text" inputMode="decimal" placeholder="P/L € (con commiss.)" required className="input" />
              <input name="nota" placeholder="Nota (facolt.)" className="input col-span-2 sm:col-span-1" />
              <button type="submit" disabled={salvo} className="btn-primary col-span-2 !h-11 sm:col-span-1">
                <Plus size={16} /> Aggiungi
              </button>
            </form>

            {voci === null ? (
              <div className="card mt-3 h-32 animate-pulse" />
            ) : journal.length === 0 ? (
              <p className="card mt-3 p-5 text-sm text-muted">Nessuna operazione registrata. Aggiungi il primo risultato qui sopra.</p>
            ) : (
              <div className="card mt-3 divide-y divide-line/70">
                {[...journal].reverse().map((j) => (
                  <div key={j.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        <span className="num text-muted">#{j.numero}</span> · {dataBreve(j.data)}
                      </p>
                      <p className="num text-xs text-muted">
                        {euro(j.capitaleIniziale)} → {euro(j.capitaleFinale)}
                      </p>
                      {j.nota && <p className="mt-0.5 truncate text-xs text-muted">{j.nota}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <p className={`num text-sm font-semibold ${colore(j.pnl)}`}>{euro(j.pnl, true)}</p>
                        <p className="num text-xs text-muted">{percento(j.pct)}</p>
                      </div>
                      <button
                        onClick={() => elimina(j.id)}
                        aria-label="Elimina"
                        className="rounded-lg p-2 text-muted transition hover:bg-surface2 hover:text-down"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="card-title">Piano compounding</p>
              <button onClick={() => setPianoCompleto((v) => !v)} className="text-xs font-medium text-accent">
                {pianoCompleto ? "Mostra meno" : `Tutti i ${imp.periodi} periodi`}
              </button>
            </div>
            <div className="card overflow-x-auto">
              <table className="num w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                    <th className="px-4 py-2.5 font-semibold">Periodo</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Capitale</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Rischio</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Profitto</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Lotto</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Pips</th>
                  </tr>
                </thead>
                <tbody>
                  {daMostrare.map((p) => {
                    const corrente = p.periodo === r.periodoAttuale;
                    const fatto = p.periodo < r.periodoAttuale;
                    return (
                      <tr
                        key={p.periodo}
                        className={`border-b border-line/60 last:border-0 ${corrente ? "bg-accent/10" : fatto ? "text-muted" : ""}`}
                      >
                        <td className="px-4 py-2">
                          {p.periodo}
                          {corrente && <span className="ml-2 text-[11px] font-medium text-accent">attuale</span>}
                        </td>
                        <td className="px-4 py-2 text-right">{euro(p.capitale)}</td>
                        <td className="px-4 py-2 text-right">{euro(p.rischio)}</td>
                        <td className="px-4 py-2 text-right">{p.profitto === null ? "—" : euro(p.profitto)}</td>
                        <td className="px-4 py-2 text-right">{lotti(p.lotto)}</td>
                        <td className="px-4 py-2 text-right">{p.pips === null ? "—" : p.pips.toLocaleString("it-IT", { maximumFractionDigits: 1 })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Fine piano: {euro(piano[piano.length - 1].capitale)} dopo {imp.periodi} periodi.
            </p>
          </div>

          <div className="card">
            <button onClick={() => setImpAperte((v) => !v)} className="flex w-full items-center justify-between px-5 py-4">
              <span className="card-title">Impostazioni</span>
              <ChevronDown size={16} className={`text-muted transition ${impAperte ? "rotate-180" : ""}`} />
            </button>
            {impAperte && (
              <div className="border-t border-line px-5 pb-5 pt-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {CAMPI.map((c) => (
                    <label key={c.chiave} className="block">
                      <span className="text-xs text-muted">
                        {c.etichetta}
                        {c.suffisso && ` (${c.suffisso})`}
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={bozza[c.chiave] ?? String(imp[c.chiave]).replace(".", ",")}
                        onChange={(e) => setBozza((b) => ({ ...b, [c.chiave]: e.target.value }))}
                        className="input mt-1"
                      />
                    </label>
                  ))}
                </div>
                <button onClick={salvaImpostazioni} disabled={salvo} className="btn-primary mt-4 w-full sm:w-auto">
                  {salvo ? "Salvo…" : "Salva"}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
