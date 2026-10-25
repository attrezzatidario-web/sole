"use client";

import { BookOpen, Check, Plus, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { ASSETS } from "@/lib/domain/correlations";
import { calcolaEsito, calcolaStatistiche, Operazione } from "@/lib/domain/diario";
import { formatPrice } from "@/lib/format";
import { isSupabaseConfigured, supabase } from "@/lib/supabaseClient";

export default function DiarioPage() {
  const [operazioni, setOperazioni] = useState<Operazione[] | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [filtro, setFiltro] = useState("Tutti");
  const [chiusuraAperta, setChiusuraAperta] = useState<string | null>(null);
  const [prezzoUscita, setPrezzoUscita] = useState("");

  async function carica() {
    if (!supabase) {
      setOperazioni([]);
      return;
    }
    const { data } = await supabase
      .from("operazioni")
      .select("id, asset_symbol, direzione, prezzo_entrata, prezzo_uscita, stop_loss, take_profit, nota, aperta_il, chiusa_il")
      .order("aperta_il", { ascending: false });
    setOperazioni((data ?? []) as Operazione[]);
  }

  useEffect(() => {
    carica();
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!supabase) return;
    setSalvo(true);
    const form = e.currentTarget;
    const f = new FormData(form);
    await supabase.from("operazioni").insert({
      asset_symbol: f.get("asset_symbol"),
      direzione: f.get("direzione"),
      prezzo_entrata: Number(f.get("prezzo_entrata")),
      stop_loss: f.get("stop_loss") ? Number(f.get("stop_loss")) : null,
      take_profit: f.get("take_profit") ? Number(f.get("take_profit")) : null,
      nota: f.get("nota") || null,
    });
    setSalvo(false);
    form.reset();
    carica();
  }

  async function chiudiOperazione(id: string) {
    if (!supabase || !prezzoUscita) return;
    await supabase
      .from("operazioni")
      .update({ prezzo_uscita: Number(prezzoUscita), chiusa_il: new Date().toISOString() })
      .eq("id", id);
    setChiusuraAperta(null);
    setPrezzoUscita("");
    carica();
  }

  async function elimina(id: string) {
    if (!supabase) return;
    await supabase.from("operazioni").delete().eq("id", id);
    carica();
  }

  const visibili = (operazioni ?? []).filter((o) => filtro === "Tutti" || o.asset_symbol === filtro);
  const aperte = visibili.filter((o) => o.prezzo_uscita == null);
  const chiuse = visibili.filter((o) => o.prezzo_uscita != null);
  const stats = calcolaStatistiche(visibili);
  const simboliPresenti = ["Tutti", ...Array.from(new Set((operazioni ?? []).map((o) => o.asset_symbol)))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Diario di trading</h1>
        <p className="mt-1 text-sm text-muted">
          Le tue operazioni, con risultato ed R calcolati in automatico. Solo tuo: nessun dato lascia il
          database.
        </p>
      </div>

      {!isSupabaseConfigured ? (
        <p className="card border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          Collega Supabase per usare il diario.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="card p-4">
              <p className="text-xs text-muted">Operazioni</p>
              <p className="num mt-1 text-xl font-semibold">{stats.totali}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-muted">Aperte</p>
              <p className="num mt-1 text-xl font-semibold">{stats.aperte}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-muted">% vinte</p>
              <p className="num mt-1 text-xl font-semibold">
                {stats.percentualeVinte !== null ? `${stats.percentualeVinte.toFixed(0)}%` : "—"}
              </p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-muted">R medio</p>
              <p
                className={`num mt-1 text-xl font-semibold ${
                  stats.rMedio !== null ? (stats.rMedio > 0 ? "text-up" : stats.rMedio < 0 ? "text-down" : "") : ""
                }`}
              >
                {stats.rMedio !== null ? `${stats.rMedio > 0 ? "+" : ""}${stats.rMedio.toFixed(2)}R` : "—"}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="card grid gap-3 p-5 sm:grid-cols-6">
            <select name="asset_symbol" required className="input sm:col-span-1" defaultValue="XAUUSD">
              {ASSETS.map((a) => (
                <option key={a.symbol} value={a.symbol}>
                  {a.symbol}
                </option>
              ))}
            </select>
            <select name="direzione" required className="input sm:col-span-1">
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
            <input name="prezzo_entrata" type="number" step="any" inputMode="decimal" placeholder="Prezzo entrata" required className="input sm:col-span-1" />
            <input name="stop_loss" type="number" step="any" inputMode="decimal" placeholder="Stop loss (facolt.)" className="input sm:col-span-1" />
            <input name="take_profit" type="number" step="any" inputMode="decimal" placeholder="Target (facolt.)" className="input sm:col-span-1" />
            <input name="nota" placeholder="Nota (facolt.)" className="input sm:col-span-1" />
            <button type="submit" disabled={salvo} className="btn-primary sm:col-span-6 !h-11">
              <Plus size={16} /> {salvo ? "Salvo…" : "Apri operazione"}
            </button>
          </form>

          {simboliPresenti.length > 1 && (
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              {simboliPresenti.map((s) => (
                <button
                  key={s}
                  onClick={() => setFiltro(s)}
                  className={`h-9 shrink-0 rounded-full px-4 text-sm font-medium transition ${
                    filtro === s ? "bg-fg text-bg" : "border border-line bg-surface text-muted hover:text-fg"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {operazioni === null ? (
            <div className="card h-40 animate-pulse" />
          ) : visibili.length === 0 ? (
            <p className="card p-5 text-sm text-muted">Nessuna operazione ancora. Aprine una dal modulo sopra.</p>
          ) : (
            <div className="space-y-5">
              {aperte.length > 0 && (
                <div>
                  <p className="card-title mb-2">Aperte</p>
                  <div className="card divide-y divide-line/70">
                    {aperte.map((o) => (
                      <div key={o.id} className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">
                              {o.asset_symbol}{" "}
                              <span className={`font-normal ${o.direzione === "long" ? "text-up" : "text-down"}`}>
                                {o.direzione === "long" ? "Long" : "Short"}
                              </span>
                            </p>
                            <p className="num text-xs text-muted">
                              Entrata {formatPrice(o.asset_symbol, o.prezzo_entrata)}
                              {o.stop_loss != null && <> · Stop {formatPrice(o.asset_symbol, o.stop_loss)}</>}
                              {o.take_profit != null && <> · Target {formatPrice(o.asset_symbol, o.take_profit)}</>}
                            </p>
                            {o.nota && <p className="mt-1 text-xs text-muted">{o.nota}</p>}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {chiusuraAperta === o.id ? (
                              <>
                                <input
                                  autoFocus
                                  type="number"
                                  step="any"
                                  inputMode="decimal"
                                  placeholder="Prezzo uscita"
                                  value={prezzoUscita}
                                  onChange={(e) => setPrezzoUscita(e.target.value)}
                                  className="input !h-9 !w-32"
                                />
                                <button
                                  onClick={() => chiudiOperazione(o.id)}
                                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white"
                                  aria-label="Conferma chiusura"
                                >
                                  <Check size={15} />
                                </button>
                                <button
                                  onClick={() => {
                                    setChiusuraAperta(null);
                                    setPrezzoUscita("");
                                  }}
                                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted"
                                  aria-label="Annulla"
                                >
                                  <X size={15} />
                                </button>
                              </>
                            ) : (
                              <button onClick={() => setChiusuraAperta(o.id)} className="btn-ghost !h-9 !px-3 !text-xs">
                                Chiudi
                              </button>
                            )}
                            <button
                              onClick={() => elimina(o.id)}
                              aria-label="Elimina"
                              className="rounded-lg p-2 text-muted transition hover:bg-surface2 hover:text-down"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {chiuse.length > 0 && (
                <div>
                  <p className="card-title mb-2">Chiuse</p>
                  <div className="card divide-y divide-line/70">
                    {chiuse.map((o) => {
                      const esito = calcolaEsito(o)!;
                      return (
                        <div key={o.id} className="flex items-center justify-between gap-3 p-4">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">
                              {o.asset_symbol}{" "}
                              <span className={`font-normal ${o.direzione === "long" ? "text-up" : "text-down"}`}>
                                {o.direzione === "long" ? "Long" : "Short"}
                              </span>
                            </p>
                            <p className="num text-xs text-muted">
                              {formatPrice(o.asset_symbol, o.prezzo_entrata)} → {formatPrice(o.asset_symbol, o.prezzo_uscita!)}
                            </p>
                            {o.nota && <p className="mt-1 text-xs text-muted">{o.nota}</p>}
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <div className="text-right">
                              <p className={`num text-sm font-semibold ${esito.esito === "vinta" ? "text-up" : esito.esito === "persa" ? "text-down" : "text-muted"}`}>
                                {esito.pnlPct > 0 ? "+" : ""}
                                {esito.pnlPct.toFixed(2)}%
                              </p>
                              {esito.r !== null && (
                                <p className="num text-xs text-muted">
                                  {esito.r > 0 ? "+" : ""}
                                  {esito.r.toFixed(2)}R
                                </p>
                              )}
                            </div>
                            <button
                              onClick={() => elimina(o.id)}
                              aria-label="Elimina"
                              className="rounded-lg p-2 text-muted transition hover:bg-surface2 hover:text-down"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
