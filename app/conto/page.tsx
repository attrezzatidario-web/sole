"use client";

import { Check, ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  calcolaJournal,
  calcolaPiano,
  Conto,
  IMPOSTAZIONI_PREDEFINITE,
  ImpostazioniConto,
  importo,
  leggiNumero,
  lotti,
  percento,
  RigaJournal,
  riepilogo,
  VoceJournal,
} from "@/lib/domain/conto";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";

// ---------- utilità ----------

const CHIAVE_CONTO = "sole-conto-selezionato";
const VALUTE = ["€", "$", "£", "CHF"];

const CAMPI: {
  chiave: keyof ImpostazioniConto;
  etichetta: string;
  unita: (valuta: string) => string;
  importo?: boolean;
  intero?: boolean;
  max?: number;
}[] = [
  { chiave: "capitale_iniziale", etichetta: "Capitale iniziale", unita: (v) => v, importo: true },
  { chiave: "profitto_pct", etichetta: "Profitto per periodo", unita: () => "%", max: 100 },
  { chiave: "rischio_pct", etichetta: "Rischio per operazione", unita: () => "%", max: 100 },
  { chiave: "pips_stop", etichetta: "Stop loss", unita: () => "pips" },
  { chiave: "valore_pip", etichetta: "Valore pip con 1 lotto", unita: (v) => v, importo: true },
  { chiave: "periodi", etichetta: "Periodi del piano", unita: () => "", intero: true, max: 1000 },
];

const oggi = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
const dataBreve = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
const numIt = (v: number, dec = 2) => v.toLocaleString("it-IT", { maximumFractionDigits: dec });
const colore = (v: number | null) => (v === null || Math.abs(v) < 0.005 ? "" : v > 0 ? "text-up" : "text-down");

function leggiLocale(): string | null {
  try {
    return localStorage.getItem(CHIAVE_CONTO);
  } catch {
    return null;
  }
}
function scriviLocale(id: string) {
  try {
    localStorage.setItem(CHIAVE_CONTO, id);
  } catch {}
}

const daRiga = (r: any): Conto => ({
  id: r.id,
  nome: r.nome,
  valuta: r.valuta || "€",
  ordine: Number(r.ordine ?? 0),
  capitale_iniziale: Number(r.capitale_iniziale),
  profitto_pct: Number(r.profitto_pct),
  rischio_pct: Number(r.rischio_pct),
  pips_stop: Number(r.pips_stop),
  valore_pip: Number(r.valore_pip),
  periodi: Number(r.periodi),
});

// ---------- pagina ----------

export default function ContoPage() {
  const [conti, setConti] = useState<Conto[] | null>(null);
  const [voci, setVoci] = useState<VoceJournal[]>([]);
  const [selezionato, setSelezionato] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<{ testo: string; tipo: "ok" | "errore" } | null>(null);
  const [impAperte, setImpAperte] = useState(false);
  const timerAvviso = useRef<ReturnType<typeof setTimeout>>();

  const mostra = useCallback((testo: string, tipo: "ok" | "errore" = "ok") => {
    setAvviso({ testo, tipo });
    clearTimeout(timerAvviso.current);
    timerAvviso.current = setTimeout(() => setAvviso(null), tipo === "ok" ? 2200 : 5000);
  }, []);

  const carica = useCallback(async () => {
    if (!supabase) return setConti([]);
    const [c, j] = await Promise.all([
      supabase.from("conti").select("*").order("ordine").order("creato_il"),
      supabase.from("conto_journal").select("id, conto_id, data, pnl, nota, creato_il"),
    ]);
    if (c.error || j.error) {
      setErrore("Le tabelle del conto non ci sono ancora: esegui 14_CONTO.sql nel SQL Editor di Supabase.");
      return setConti([]);
    }
    const lista = (c.data ?? []).map(daRiga);
    setConti(lista);
    setVoci((j.data ?? []).map((v: any) => ({ ...v, pnl: Number(v.pnl) })));
    setSelezionato((attuale) => {
      const voluto = attuale ?? leggiLocale();
      return lista.some((x) => x.id === voluto) ? voluto : lista[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    carica();
    return () => clearTimeout(timerAvviso.current);
  }, [carica]);

  useEffect(() => {
    if (selezionato) scriviLocale(selezionato);
  }, [selezionato]);

  const conto = conti?.find((c) => c.id === selezionato) ?? null;
  const vociConto = useMemo(() => voci.filter((v) => v.conto_id === selezionato), [voci, selezionato]);

  async function nuovoConto() {
    if (!supabase || !conti) return;
    const nomi = new Set(conti.map((c) => c.nome));
    let n = conti.length + 1;
    while (nomi.has(`Conto ${n}`)) n++;
    const { data, error } = await supabase
      .from("conti")
      .insert({ nome: `Conto ${n}`, ordine: Math.max(0, ...conti.map((c) => c.ordine)) + 1, ...IMPOSTAZIONI_PREDEFINITE })
      .select()
      .single();
    if (error || !data) return mostra("Conto non creato: riprova.", "errore");
    setConti([...conti, daRiga(data)]);
    setSelezionato(data.id);
    setImpAperte(true);
    mostra("Conto creato: dagli un nome e imposta il piano.");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conto</h1>
        <p className="mt-1 text-sm text-muted">Piano di compounding e journal, per ogni conto.</p>
      </div>

      {!isSupabaseConfigured ? (
        <p className="card border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">Collega Supabase per usare il conto.</p>
      ) : errore ? (
        <p className="card border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">{errore}</p>
      ) : conti === null ? (
        <div className="space-y-3">
          <div className="card h-12 animate-pulse" />
          <div className="card h-28 animate-pulse" />
          <div className="card h-48 animate-pulse" />
        </div>
      ) : (
        <>
          <SelettoreConti
            conti={conti}
            voci={voci}
            selezionato={selezionato}
            onSeleziona={(id) => {
              setSelezionato(id);
              setImpAperte(false);
            }}
            onNuovo={nuovoConto}
          />

          {!conto ? (
            <div className="card flex flex-col items-center gap-3 p-8 text-center">
              <p className="text-sm text-muted">Nessun conto ancora.</p>
              <button onClick={nuovoConto} className="btn-primary">
                <Plus size={16} /> Crea il primo conto
              </button>
            </div>
          ) : (
            <DettaglioConto
              key={conto.id}
              conto={conto}
              voci={vociConto}
              impAperte={impAperte}
              setImpAperte={setImpAperte}
              ricarica={carica}
              mostra={mostra}
              onEliminato={() => {
                setSelezionato(null);
                setImpAperte(false);
                carica();
              }}
            />
          )}
        </>
      )}

      {avviso && (
        <div
          role="status"
          className={`fixed inset-x-4 bottom-24 z-40 mx-auto max-w-sm rounded-xl px-4 py-3 text-center text-sm font-medium shadow-card md:bottom-8 ${
            avviso.tipo === "ok" ? "bg-fg text-bg" : "bg-down text-white"
          }`}
        >
          {avviso.testo}
        </div>
      )}
    </div>
  );
}

// ---------- selettore dei conti ----------

function SelettoreConti({
  conti,
  voci,
  selezionato,
  onSeleziona,
  onNuovo,
}: {
  conti: Conto[];
  voci: VoceJournal[];
  selezionato: string | null;
  onSeleziona: (id: string) => void;
  onNuovo: () => void;
}) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {conti.map((c) => {
        const tot = voci.filter((v) => v.conto_id === c.id).reduce((s, v) => s + v.pnl, 0);
        const on = c.id === selezionato;
        return (
          <button
            key={c.id}
            onClick={() => onSeleziona(c.id)}
            className={`flex h-12 shrink-0 flex-col items-start justify-center rounded-xl px-4 text-left transition ${
              on ? "bg-fg text-bg" : "border border-line bg-surface text-fg hover:bg-surface2"
            }`}
          >
            <span className="max-w-[160px] truncate text-sm font-semibold leading-tight">{c.nome}</span>
            <span className={`num text-[11px] leading-tight ${on ? "opacity-70" : "text-muted"}`}>
              {importo(c.capitale_iniziale + tot, c.valuta)}
            </span>
          </button>
        );
      })}
      <button
        onClick={onNuovo}
        className="flex h-12 shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-line px-4 text-sm font-medium text-muted transition hover:text-fg"
      >
        <Plus size={15} /> Nuovo conto
      </button>
    </div>
  );
}

// ---------- dettaglio di un conto ----------

function DettaglioConto({
  conto,
  voci,
  impAperte,
  setImpAperte,
  ricarica,
  mostra,
  onEliminato,
}: {
  conto: Conto;
  voci: VoceJournal[];
  impAperte: boolean;
  setImpAperte: (v: boolean) => void;
  ricarica: () => Promise<void>;
  mostra: (t: string, tipo?: "ok" | "errore") => void;
  onEliminato: () => void;
}) {
  const [pianoCompleto, setPianoCompleto] = useState(false);
  const piano = useMemo(() => calcolaPiano(conto), [conto]);
  const journal = useMemo(() => calcolaJournal(voci, conto.capitale_iniziale), [voci, conto.capitale_iniziale]);
  const r = useMemo(() => riepilogo(conto, piano, journal), [conto, piano, journal]);
  const v = conto.valuta;

  const inizio = Math.max(0, r.periodoAttuale - 1);
  const daMostrare = pianoCompleto ? piano : piano.slice(inizio, inizio + 12);

  return (
    <div className="space-y-6">
      {/* riepilogo */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Riquadro titolo="Capitale attuale" valore={importo(r.capitaleAttuale, v)} />
        <Riquadro titolo="Profitto" valore={importo(r.profittoEuro, v, true)} classe={colore(r.profittoEuro)} />
        <Riquadro titolo="Profitto %" valore={percento(r.profittoPct)} classe={colore(r.profittoPct)} />
        <Riquadro
          titolo="Rispetto al piano"
          valore={r.pianoFinito ? "Completato" : importo(r.scartoPiano, v, true)}
          classe={r.pianoFinito ? "text-up" : colore(r.scartoPiano)}
          nota={
            r.pianoFinito
              ? `${r.periodoAttuale} operazioni su ${conto.periodi}`
              : `Periodo ${r.periodoAttuale} · obiettivo ${importo(r.capitalePiano, v)}`
          }
        />
      </div>

      {/* prossima operazione */}
      <div className="card p-5">
        <p className="card-title">Prossima operazione</p>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Dato titolo="Lotto" valore={lotti(r.prossima.lottoBroker)} nota={`teorico ${numIt(r.prossima.lotto, 3)}`} />
          <Dato
            titolo="Rischio"
            valore={importo(r.prossima.rischioEffettivo, v)}
            nota={`max ${importo(r.prossima.rischio, v)} (${numIt(conto.rischio_pct)}%)`}
          />
          <Dato titolo="Obiettivo" valore={importo(r.prossima.obiettivo, v)} nota={`${numIt(conto.profitto_pct)}% del capitale`} />
          <Dato titolo="Pips da fare" valore={numIt(r.prossima.pips, 1)} nota={`stop ${numIt(conto.pips_stop)} pips`} />
        </div>
        {r.prossima.lottoBroker === 0 && (
          <p className="mt-3 text-xs text-warn">Con questo capitale e rischio il lotto è sotto 0,01: aumenta il rischio o riduci lo stop.</p>
        )}
      </div>

      <Journal conto={conto} journal={journal} ricarica={ricarica} mostra={mostra} />

      {/* piano */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="card-title">Piano compounding</p>
          {piano.length > 13 && (
            <button onClick={() => setPianoCompleto((x) => !x)} className="text-xs font-medium text-accent">
              {pianoCompleto ? "Mostra meno" : `Tutti i ${conto.periodi} periodi`}
            </button>
          )}
        </div>
        <div className={`card overflow-auto ${pianoCompleto ? "max-h-[70vh]" : ""}`}>
          <table className="num w-full text-[13px]">
            <thead className="sticky top-0 bg-surface">
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-muted">
                <th className="px-3 py-2.5 font-semibold sm:px-4">#</th>
                <th className="px-3 py-2.5 text-right font-semibold sm:px-4">Capitale</th>
                <th className="hidden px-3 py-2.5 text-right font-semibold sm:table-cell sm:px-4">Rischio</th>
                <th className="px-3 py-2.5 text-right font-semibold sm:px-4">Profitto</th>
                <th className="px-3 py-2.5 text-right font-semibold sm:px-4">Lotto</th>
                <th className="px-3 py-2.5 text-right font-semibold sm:px-4">Pips</th>
              </tr>
            </thead>
            <tbody>
              {daMostrare.map((p) => {
                const corrente = p.periodo === r.periodoAttuale;
                const reale = p.periodo >= 1 ? journal[p.periodo - 1] : null;
                return (
                  <tr
                    key={p.periodo}
                    className={`border-b border-line/60 last:border-0 ${corrente ? "bg-accent/10" : p.periodo < r.periodoAttuale ? "text-muted" : ""}`}
                  >
                    <td className="px-3 py-2 sm:px-4">
                      {p.periodo}
                      {corrente && <span className="ml-1.5 text-[11px] font-medium text-accent">ora</span>}
                    </td>
                    <td className="px-3 py-2 text-right sm:px-4">
                      {importo(p.capitale, v)}
                      {reale && (
                        <span className={`block whitespace-nowrap text-[11px] ${colore(reale.capitaleFinale - p.capitale)}`}>
                          <span className="hidden sm:inline">reale </span>
                          {importo(reale.capitaleFinale, v)}
                        </span>
                      )}
                    </td>
                    <td className="hidden px-3 py-2 text-right sm:table-cell sm:px-4">{importo(p.rischio, v)}</td>
                    <td className="px-3 py-2 text-right sm:px-4">{p.profitto === null ? "—" : importo(p.profitto, v)}</td>
                    <td className="px-3 py-2 text-right sm:px-4">{lotti(p.lotto)}</td>
                    <td className="px-3 py-2 text-right sm:px-4">{p.pips === null ? "—" : numIt(p.pips, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Fine piano: {importo(piano[piano.length - 1].capitale, v)} dopo {conto.periodi} periodi (
          {percento(piano[piano.length - 1].capitale / conto.capitale_iniziale - 1)}).
        </p>
      </div>

      <ImpostazioniPannello
        conto={conto}
        aperto={impAperte}
        setAperto={setImpAperte}
        numOperazioni={journal.length}
        ricarica={ricarica}
        mostra={mostra}
        onEliminato={onEliminato}
      />
    </div>
  );
}

function Riquadro({ titolo, valore, classe = "", nota }: { titolo: string; valore: string; classe?: string; nota?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{titolo}</p>
      <p className={`num mt-1 text-lg font-semibold sm:text-xl ${classe}`}>{valore}</p>
      {nota && <p className="num mt-0.5 text-[11px] leading-snug text-muted">{nota}</p>}
    </div>
  );
}

function Dato({ titolo, valore, nota }: { titolo: string; valore: string; nota: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{titolo}</p>
      <p className="num mt-0.5 text-lg font-semibold">{valore}</p>
      <p className="num text-[11px] text-muted">{nota}</p>
    </div>
  );
}

// ---------- journal ----------

function Journal({
  conto,
  journal,
  ricarica,
  mostra,
}: {
  conto: Conto;
  journal: RigaJournal[];
  ricarica: () => Promise<void>;
  mostra: (t: string, tipo?: "ok" | "errore") => void;
}) {
  const [salvo, setSalvo] = useState(false);
  const [pnlErrato, setPnlErrato] = useState(false);
  const [inModifica, setInModifica] = useState<string | null>(null);
  const [daEliminare, setDaEliminare] = useState<string | null>(null);
  const [bozza, setBozza] = useState({ data: "", pnl: "", nota: "" });

  async function aggiungi(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    const form = e.currentTarget;
    const f = new FormData(form);
    const pnl = leggiNumero(String(f.get("pnl") ?? ""), true);
    if (pnl === null) return setPnlErrato(true);
    setSalvo(true);
    const { error } = await supabase
      .from("conto_journal")
      .insert({ conto_id: conto.id, data: f.get("data") || oggi(), pnl, nota: String(f.get("nota") ?? "").trim() || null });
    setSalvo(false);
    if (error) return mostra("Operazione non salvata: riprova.", "errore");
    form.reset();
    (form.elements.namedItem("data") as HTMLInputElement).value = oggi();
    setPnlErrato(false);
    await ricarica();
    mostra("Operazione aggiunta");
  }

  function apriModifica(j: RigaJournal) {
    setDaEliminare(null);
    setInModifica(j.id);
    setBozza({ data: j.data, pnl: numIt(j.pnl), nota: j.nota ?? "" });
  }

  async function salvaModifica(id: string) {
    if (!supabase) return;
    const pnl = leggiNumero(bozza.pnl, true);
    if (pnl === null || !bozza.data) return mostra("Controlla data e importo.", "errore");
    const { error } = await supabase
      .from("conto_journal")
      .update({ data: bozza.data, pnl, nota: bozza.nota.trim() || null })
      .eq("id", id);
    if (error) return mostra("Modifica non salvata: riprova.", "errore");
    setInModifica(null);
    await ricarica();
    mostra("Operazione aggiornata");
  }

  async function elimina(id: string) {
    if (!supabase) return;
    const { error } = await supabase.from("conto_journal").delete().eq("id", id);
    setDaEliminare(null);
    if (error) return mostra("Eliminazione non riuscita: riprova.", "errore");
    await ricarica();
    mostra("Operazione eliminata");
  }

  const tasti = (id: string) => (e: KeyboardEvent) => {
    if (e.key === "Enter") salvaModifica(id);
    if (e.key === "Escape") setInModifica(null);
  };

  return (
    <div>
      <p className="card-title mb-2">Journal</p>
      <form onSubmit={aggiungi} className="card grid grid-cols-2 gap-3 p-4 sm:grid-cols-[160px_190px_1fr_auto]">
        <input name="data" type="date" defaultValue={oggi()} max={oggi()} required aria-label="Data" className="input" />
        <input
          name="pnl"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder={`P/L netto ${conto.valuta}`}
          aria-label="Profitto o perdita con commissioni"
          required
          onChange={() => pnlErrato && setPnlErrato(false)}
          className={`input ${pnlErrato ? "!border-down" : ""}`}
        />
        <input name="nota" placeholder="Nota (facoltativa)" maxLength={200} className="input col-span-2 sm:col-span-1" />
        <button type="submit" disabled={salvo} className="btn-primary col-span-2 !h-11 sm:col-span-1">
          <Plus size={16} /> {salvo ? "Salvo…" : "Aggiungi"}
        </button>
        <p className="col-span-2 -mt-1 text-[11px] text-muted sm:col-span-4">
          {pnlErrato ? (
            <span className="text-down">Scrivi un importo, es. 120,50 oppure -80.</span>
          ) : (
            "Importo con commissioni incluse: negativo per le perdite (es. -80,50)."
          )}
        </p>
      </form>

      {journal.length === 0 ? (
        <p className="card mt-3 p-5 text-sm text-muted">Nessuna operazione registrata su questo conto.</p>
      ) : (
        <div className="card mt-3 divide-y divide-line/70">
          {[...journal].reverse().map((j) =>
            inModifica === j.id ? (
              <div key={j.id} className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-[160px_150px_1fr_auto]">
                <input
                  type="date"
                  value={bozza.data}
                  max={oggi()}
                  onChange={(e) => setBozza({ ...bozza, data: e.target.value })}
                  onKeyDown={tasti(j.id)}
                  className="input !h-10"
                  aria-label="Data"
                />
                <input
                  autoFocus
                  inputMode="decimal"
                  value={bozza.pnl}
                  onChange={(e) => setBozza({ ...bozza, pnl: e.target.value })}
                  onKeyDown={tasti(j.id)}
                  className="input !h-10"
                  aria-label="Importo"
                />
                <input
                  value={bozza.nota}
                  maxLength={200}
                  placeholder="Nota"
                  onChange={(e) => setBozza({ ...bozza, nota: e.target.value })}
                  onKeyDown={tasti(j.id)}
                  className="input col-span-2 !h-10 sm:col-span-1"
                  aria-label="Nota"
                />
                <div className="col-span-2 flex justify-end gap-2 sm:col-span-1">
                  <button onClick={() => setInModifica(null)} className="btn-ghost !h-10 !px-3" aria-label="Annulla">
                    <X size={15} />
                  </button>
                  <button onClick={() => salvaModifica(j.id)} className="btn-primary !h-10 !px-3" aria-label="Salva">
                    <Check size={15} /> Salva
                  </button>
                </div>
              </div>
            ) : (
              <div key={j.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <button onClick={() => apriModifica(j)} className="min-w-0 flex-1 text-left" aria-label="Modifica operazione">
                  <p className="text-sm font-medium">
                    <span className="num text-muted">#{j.numero}</span> · {dataBreve(j.data)}
                  </p>
                  <p className="num text-xs text-muted">
                    {importo(j.capitaleIniziale, conto.valuta)} → {importo(j.capitaleFinale, conto.valuta)}
                  </p>
                  {j.nota && <p className="mt-0.5 truncate text-xs text-muted">{j.nota}</p>}
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <div className="mr-2 text-right">
                    <p className={`num text-sm font-semibold ${colore(j.pnl)}`}>{importo(j.pnl, conto.valuta, true)}</p>
                    <p className="num text-xs text-muted">{percento(j.pct)}</p>
                  </div>
                  {daEliminare === j.id ? (
                    <>
                      <button onClick={() => setDaEliminare(null)} className="btn-ghost !h-9 !px-2.5 !text-xs">
                        No
                      </button>
                      <button onClick={() => elimina(j.id)} className="btn !h-9 bg-down !px-2.5 !text-xs text-white">
                        Elimina
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => apriModifica(j)}
                        aria-label="Modifica"
                        className="rounded-lg p-2 text-muted transition hover:bg-surface2 hover:text-fg"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setDaEliminare(j.id)}
                        aria-label="Elimina"
                        className="rounded-lg p-2 text-muted transition hover:bg-surface2 hover:text-down"
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ---------- impostazioni del conto ----------

function ImpostazioniPannello({
  conto,
  aperto,
  setAperto,
  numOperazioni,
  ricarica,
  mostra,
  onEliminato,
}: {
  conto: Conto;
  aperto: boolean;
  setAperto: (v: boolean) => void;
  numOperazioni: number;
  ricarica: () => Promise<void>;
  mostra: (t: string, tipo?: "ok" | "errore") => void;
  onEliminato: () => void;
}) {
  const iniziali = useCallback(
    () => ({
      nome: conto.nome,
      valuta: conto.valuta,
      // senza separatore delle migliaia: "1000" e non "1.000", che in un campo non-importo varrebbe 1
      ...Object.fromEntries(
        CAMPI.map((c) => [c.chiave, conto[c.chiave].toLocaleString("it-IT", { maximumFractionDigits: 6, useGrouping: false })])
      ),
    }),
    [conto]
  );
  const [bozza, setBozza] = useState<Record<string, string>>(iniziali);
  const [errori, setErrori] = useState<Record<string, string>>({});
  const [salvo, setSalvo] = useState(false);
  const [confermaElimina, setConfermaElimina] = useState(false);
  const nomeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setBozza(iniziali());
    setErrori({});
    setConfermaElimina(false);
  }, [iniziali, aperto]);

  useEffect(() => {
    if (aperto && conto.nome.startsWith("Conto ")) nomeRef.current?.select();
  }, [aperto, conto.nome]);

  const modificato = JSON.stringify(bozza) !== JSON.stringify(iniziali());

  function valida() {
    const err: Record<string, string> = {};
    const valori: Partial<Conto> = {};
    const nome = bozza.nome.trim();
    if (!nome) err.nome = "Serve un nome.";
    else valori.nome = nome.slice(0, 40);
    valori.valuta = bozza.valuta;
    for (const c of CAMPI) {
      const n = leggiNumero(bozza[c.chiave] ?? "", c.importo);
      if (n === null || n <= 0) err[c.chiave] = "Deve essere maggiore di 0.";
      else if (c.intero && !Number.isInteger(n)) err[c.chiave] = "Numero intero.";
      else if (c.max && n > c.max) err[c.chiave] = `Massimo ${c.max}.`;
      else (valori as any)[c.chiave] = n;
    }
    setErrori(err);
    return Object.keys(err).length ? null : valori;
  }

  async function salva() {
    if (!supabase) return;
    const valori = valida();
    if (!valori) return;
    setSalvo(true);
    const { error } = await supabase.from("conti").update(valori).eq("id", conto.id);
    setSalvo(false);
    if (error) return mostra("Impostazioni non salvate: riprova.", "errore");
    await ricarica();
    setAperto(false);
    mostra("Impostazioni salvate");
  }

  async function elimina() {
    if (!supabase) return;
    const { error } = await supabase.from("conti").delete().eq("id", conto.id);
    if (error) return mostra("Conto non eliminato: riprova.", "errore");
    mostra(`"${conto.nome}" eliminato`);
    onEliminato();
  }

  return (
    <div className="card">
      <button onClick={() => setAperto(!aperto)} className="flex w-full items-center justify-between px-5 py-4" aria-expanded={aperto}>
        <span className="card-title">Impostazioni del conto</span>
        <ChevronDown size={16} className={`text-muted transition ${aperto ? "rotate-180" : ""}`} />
      </button>
      {aperto && (
        <div className="border-t border-line px-5 pb-5 pt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="col-span-2 block">
              <span className="text-xs text-muted">Nome del conto</span>
              <input
                ref={nomeRef}
                value={bozza.nome}
                maxLength={40}
                onChange={(e) => setBozza({ ...bozza, nome: e.target.value })}
                className={`input mt-1 ${errori.nome ? "!border-down" : ""}`}
              />
              {errori.nome && <span className="mt-1 block text-[11px] text-down">{errori.nome}</span>}
            </label>
            <label className="block">
              <span className="text-xs text-muted">Valuta</span>
              <select value={bozza.valuta} onChange={(e) => setBozza({ ...bozza, valuta: e.target.value })} className="input mt-1">
                {VALUTE.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            {CAMPI.map((c) => {
              const unita = c.unita(bozza.valuta);
              return (
                <label key={c.chiave} className="block">
                  <span className="text-xs text-muted">{c.etichetta}</span>
                  <div className="relative mt-1">
                    <input
                      inputMode={c.intero ? "numeric" : "decimal"}
                      autoComplete="off"
                      value={bozza[c.chiave] ?? ""}
                      onChange={(e) => setBozza({ ...bozza, [c.chiave]: e.target.value })}
                      className={`input ${unita ? "pr-12" : ""} ${errori[c.chiave] ? "!border-down" : ""}`}
                    />
                    {unita && (
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted">{unita}</span>
                    )}
                  </div>
                  {errori[c.chiave] && <span className="mt-1 block text-[11px] text-down">{errori[c.chiave]}</span>}
                </label>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button onClick={salva} disabled={salvo || !modificato} className="btn-primary">
              {salvo ? "Salvo…" : "Salva"}
            </button>
            {modificato && (
              <button onClick={() => (setBozza(iniziali()), setErrori({}))} className="btn-ghost">
                Annulla modifiche
              </button>
            )}
            <div className="ml-auto">
              {confermaElimina ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">
                    {numOperazioni > 0 ? `Cancella anche ${numOperazioni} operazion${numOperazioni === 1 ? "e" : "i"}.` : "Sicuro?"}
                  </span>
                  <button onClick={() => setConfermaElimina(false)} className="btn-ghost !h-9 !px-3 !text-xs">
                    No
                  </button>
                  <button onClick={elimina} className="btn !h-9 bg-down !px-3 !text-xs text-white">
                    Elimina conto
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfermaElimina(true)} className="text-xs font-medium text-muted transition hover:text-down">
                  Elimina conto
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
