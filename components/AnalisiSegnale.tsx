"use client";

import { Hourglass, MinusCircle, RefreshCw, ShieldAlert, Sparkles, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { quando } from "@/components/SegnaleUi";
import SegnaleChart from "@/components/SegnaleChart";
import {
  CandelaE,
  DatiSegnale,
  EsitoSegnale,
  Intervallo,
  STEP_SEC,
  aggrega,
  calcolaEsitoSegnale,
  candelaDaRaffinare,
  formatDurata,
  normalizzaCandele,
  scartoAlMessaggio,
  sostituisciCandela,
} from "@/lib/domain/esitoSegnale";
import { riassuntoPerAi } from "@/lib/domain/contestoSegnale";
import { GiornoPrima, giornoPrima as calcolaGiornoPrima, inizioGiornoDi } from "@/lib/domain/giorni";
import { formatPct, formatPrice } from "@/lib/format";
import { invokeFunction } from "@/lib/functions";
import { useInizioGiornata } from "@/lib/useInizioGiornata";

interface Risposta {
  candele: CandelaE[];
  fonte: "twelvedata" | "yahoo" | "yahoo-futures";
  intervallo: Intervallo;
  avviso?: string;
}

const ORDINE: Intervallo[] = ["1min", "5min", "15min", "30min", "1h"];
const ETICHETTA: Record<Intervallo, string> = { "1min": "1 min", "5min": "5 min", "15min": "15 min", "30min": "30 min", "1h": "1 h" };

// Le candele non cambiano: una volta scaricate si riusano nella stessa visita.
const cache = new Map<string, Risposta>();

/** Rapporto rischio/rendimento previsto al primo target (null se l'entrata è a mercato e quindi non nota). */
function rrPrevisto(sig: DatiSegnale): number | null {
  const e = sig.entrata ?? (sig.zona ? (sig.zona[0] + sig.zona[1]) / 2 : null);
  if (e == null) return null;
  const rischio = Math.abs(e - sig.stop_loss);
  return rischio === 0 ? null : Math.abs(sig.take_profits[0] - e) / rischio;
}

function Riga({ k, v, sotto }: { k: string; v: string; sotto?: string }) {
  return (
    <div className="rounded-xl bg-surface2 px-3 py-2.5">
      <dt className="text-[10px] uppercase tracking-wide text-muted">{k}</dt>
      <dd className="num mt-0.5 text-sm font-semibold">{v}</dd>
      {sotto && <p className="num text-[11px] text-muted">{sotto}</p>}
    </div>
  );
}

function Banner({ esito, ts }: { esito: EsitoSegnale; ts: number }) {
  const r = (x: number | null) => (x == null ? "" : `${x > 0 ? "+" : ""}${x.toFixed(2)}R`);
  const prima = esito.uscitaRispetto === "prima" && esito.uscitaTempo != null;
  const stessoMinuto = esito.uscitaRispetto === "stesso_minuto";

  // L'operazione risulta conclusa PRIMA che il messaggio fosse scritto: è il dato più importante da dire.
  if ((esito.stato === "tp" || esito.stato === "sl") && prima) {
    const vinta = esito.stato === "tp";
    const quandoFinita = new Date(esito.uscitaTempo! * 1000).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
    return (
      <div className="rounded-2xl border border-warn/40 bg-warn/10 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 text-warn">
            <Hourglass size={22} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Era già finita quando è stato scritto il messaggio</p>
              <p className="mt-0.5 text-xs opacity-90">
                {vinta ? "Il primo target" : "Lo stop"} risulta toccato alle {quandoFinita} ora italiana,{" "}
                <span className="num">{formatDurata(ts - esito.uscitaTempo!)}</span> prima del messaggio.
              </p>
            </div>
          </div>
          <p className={`num shrink-0 text-xl font-semibold ${vinta ? "text-up" : "text-down"}`}>{r(esito.r)}</p>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          {esito.entrataPrimaDelMessaggio ? "Ricostruzione prudente: il prezzo ha toccato l'entrata dichiarata l'ultima volta " + formatDurata(ts - (esito.entrataTempo ?? ts)) + " prima del messaggio. " : ""}
          Chi leggeva il messaggio non poteva più entrare. Il risultato è quello che il gruppo avrebbe avuto, non quello di chi segue.
        </p>
      </div>
    );
  }

  if (esito.stato === "tp")
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-up/12 px-4 py-4 text-up">
        <div className="flex items-center gap-3">
          <Target size={22} />
          <div>
            <p className="font-semibold">Primo target raggiunto</p>
            <p className="text-xs opacity-80">
              {stessoMinuto ? "nello stesso minuto del messaggio" : `dopo ${formatDurata(esito.durataSec)} dall'entrata`}
            </p>
          </div>
        </div>
        <p className="num text-2xl font-semibold">{r(esito.r)}</p>
      </div>
    );
  if (esito.stato === "sl") {
    const tp1 = esito.tpToccati[0]?.tempo;
    return (
      <div className="rounded-2xl bg-down/12 px-4 py-4 text-down">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ShieldAlert size={22} />
            <div>
              <p className="font-semibold">Stop loss colpito</p>
              <p className="text-xs opacity-80">
                {stessoMinuto ? "nello stesso minuto del messaggio" : `dopo ${formatDurata(esito.durataSec)} dall'entrata`}
              </p>
            </div>
          </div>
          <p className="num text-2xl font-semibold">{r(esito.r)}</p>
        </div>
        {tp1 != null && esito.uscitaTempo != null && (
          <p className="mt-2 text-xs opacity-80">
            Dopo lo stop il prezzo ha comunque raggiunto il primo target ({formatDurata(tp1 - esito.uscitaTempo)} più tardi).
          </p>
        )}
      </div>
    );
  }
  if (esito.stato === "aperta")
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-warn/12 px-4 py-4 text-warn">
        <div className="flex items-center gap-3">
          <Hourglass size={22} />
          <div>
            <p className="font-semibold">Ancora aperto</p>
            <p className="text-xs opacity-80">né lo stop né il primo target sono stati toccati</p>
          </div>
        </div>
        <p className="num text-2xl font-semibold">{r(esito.rFlottante)}</p>
      </div>
    );
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-surface2 px-4 py-4 text-muted">
      <MinusCircle size={22} />
      <div>
        <p className="font-semibold text-fg">Entrata mai raggiunta</p>
        <p className="text-xs">Il prezzo non è mai tornato al livello di entrata: quel segnale non si sarebbe attivato.</p>
      </div>
    </div>
  );
}

interface RispostaAi {
  analisi: string;
  notizie: { titolo: string; ora: string; minuti_dal_messaggio: number; importanza: string }[];
}
const cacheAi = new Map<string, RispostaAi>();

/** Analisi scritta dall'AI su QUESTO segnale, con le notizie del calendario nelle ore intorno al messaggio. */
function SchedaAi({ chiave, pronta, payload }: { chiave: string; pronta: boolean; payload: Record<string, unknown> | null }) {
  const [ris, setRis] = useState<RispostaAi | null>(cacheAi.get(chiave) ?? null);
  const [errore, setErrore] = useState<string | null>(null);
  const [caricando, setCaricando] = useState(false);
  const [tentativo, setTentativo] = useState(0);

  useEffect(() => {
    if (!pronta || !payload) return;
    const gia = cacheAi.get(chiave);
    if (gia && tentativo === 0) {
      setRis(gia);
      return;
    }
    let vivo = true;
    setCaricando(true);
    setErrore(null);
    invokeFunction<RispostaAi & { ok: boolean }>("analisi-segnale", payload)
      .then((r) => {
        if (!vivo) return;
        cacheAi.set(chiave, r);
        setRis(r);
      })
      .catch((e) => vivo && setErrore(e instanceof Error ? e.message : "Errore sconosciuto"))
      .finally(() => vivo && setCaricando(false));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronta, chiave, tentativo]);

  const relativo = (m: number) => (m === 0 ? "nel minuto del messaggio" : m < 0 ? `${-m} min prima del messaggio` : `${m} min dopo il messaggio`);

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="card-title flex items-center gap-2">
          <Sparkles size={14} /> Analisi AI
        </h2>
        {ris && !caricando && (
          <button
            type="button"
            onClick={() => setTentativo((n) => n + 1)}
            className="flex items-center gap-1 text-xs text-muted transition hover:text-fg"
            aria-label="Rigenera l'analisi"
          >
            <RefreshCw size={12} /> Rigenera
          </button>
        )}
      </div>

      {!pronta && <p className="text-sm text-muted">Aspetto che l&apos;esito sia definitivo…</p>}
      {pronta && caricando && !ris && (
        <div className="space-y-2.5" aria-label="Scrivo l'analisi">
          {[100, 92, 96, 70].map((w, i) => (
            <div key={i} className="h-3.5 animate-pulse rounded bg-surface2" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}
      {errore && (
        <div className="space-y-2">
          <p className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">{errore}</p>
          <button type="button" onClick={() => setTentativo((n) => n + 1)} className="btn-ghost !h-9 !px-3 !text-xs">
            <RefreshCw size={12} /> Riprova
          </button>
        </div>
      )}
      {ris && (
        <div className="space-y-3">
          <div className="space-y-3 text-[15px] leading-relaxed">
            {ris.analisi.split(/\n{2,}/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <div className="rounded-xl bg-surface2 px-3.5 py-2.5">
            <p className="mb-1 text-xs font-medium text-muted">Notizie importanti nelle ore intorno al messaggio</p>
            {ris.notizie.length === 0 ? (
              <p className="text-xs text-muted">Nessuna registrata nel calendario dell&apos;app per quel periodo (il calendario conserva solo le settimane recenti).</p>
            ) : (
              <ul className="space-y-0.5 text-xs">
                {ris.notizie.map((n, i) => (
                  <li key={i}>
                    <span className="num font-semibold">{n.ora}</span> {n.titolo}{" "}
                    <span className="text-muted">· {relativo(n.minuti_dal_messaggio)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-muted">
            Scritta dall&apos;AI usando solo i dati di questa pagina. Informativa, non è un consiglio di investimento.
          </p>
        </div>
      )}
    </section>
  );
}

/**
 * Scarica i prezzi del periodo che segue il messaggio e ricostruisce com'è andata l'operazione.
 * `sig.ts` è l'istante UTC (secondi) da cui si guarda il mercato.
 */
export default function AnalisiSegnale({ simbolo, sig: sigIniziale, riportato }: { simbolo: string; sig: DatiSegnale; riportato: boolean }) {
  const sym = simbolo;
  // "Ho venduto a 4224": la posizione del gruppo esiste già al momento del messaggio
  const sig: DatiSegnale = useMemo(
    () => ({ ...sigIniziale, modo: riportato && sigIniziale.entrata != null ? "aperto" : "toccato" }),
    [sigIniziale, riportato]
  );
  const [dati, setDati] = useState<Risposta | null>(null);
  const [fini, setFini] = useState<CandelaE[] | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [caricando, setCaricando] = useState(false);
  const [visualizza, setVisualizza] = useState<Intervallo | null>(null);
  const [raffinamentoFallito, setRaffinamentoFallito] = useState(false);
  const [giorniAttivi, setGiorniAttivi] = useState(false);
  const [inizio, setInizio] = useInizioGiornata();
  const [giornoPrima, setGiornoPrima] = useState<GiornoPrima | null>(null);
  const [giornoPrimaStato, setGiornoPrimaStato] = useState<"carico" | "ok" | "errore">("carico");

  // 1) candele del periodo, alla granularità più fine possibile (la sceglie la funzione)
  useEffect(() => {
    const chiave = `${sym}|${sig.ts}`;
    const gia = cache.get(chiave);
    if (gia) {
      setDati(gia);
      setErrore(null);
      return;
    }
    let vivo = true;
    setCaricando(true);
    setErrore(null);
    invokeFunction<Risposta & { ok: boolean }>("segnale-andamento", { symbol: sym, da: new Date(sig.ts * 1000).toISOString() })
      .then((r) => {
        if (!vivo) return;
        const pulita = { ...r, candele: normalizzaCandele(r.candele) };
        cache.set(chiave, pulita);
        setDati(pulita);
      })
      .catch((e) => vivo && setErrore(e instanceof Error ? e.message : "Errore sconosciuto"))
      .finally(() => vivo && setCaricando(false));
    return () => {
      vivo = false;
    };
  }, [sym, sig.ts]);

  // Massimo e minimo del GIORNO PRIMA di quello del messaggio (una sola coppia). Servono candele di quel giorno:
  // si scaricano a parte, a ore, solo quando l'interruttore "Giorni" è acceso.
  useEffect(() => {
    if (!giorniAttivi) return;
    const inizioMsg = inizioGiornoDi(sig.ts, inizio);
    let vivo = true;
    setGiornoPrimaStato("carico");
    invokeFunction<Risposta & { ok: boolean }>("segnale-andamento", {
      symbol: sym,
      da: new Date((inizioMsg - 4 * 86400) * 1000).toISOString(),
      a: new Date((inizioMsg + 2 * 3600) * 1000).toISOString(),
      esatta: true,
      intervallo: "1h",
    })
      .then((r) => {
        if (!vivo) return;
        setGiornoPrima(calcolaGiornoPrima(normalizzaCandele(r.candele), inizioMsg, inizio));
        setGiornoPrimaStato("ok");
      })
      .catch(() => {
        if (!vivo) return;
        setGiornoPrima(null);
        setGiornoPrimaStato("errore");
      });
    return () => {
      vivo = false;
    };
  }, [giorniAttivi, sym, sig.ts, inizio]);

  const stepBase = dati ? STEP_SEC[dati.intervallo] : 60;
  const esitoBase = useMemo(() => (dati ? calcolaEsitoSegnale(sig, dati.candele) : null), [sig, dati]);
  const daRaffinare = esitoBase ? candelaDaRaffinare(esitoBase, stepBase) : null;

  // 2) se l'esito dipende da cosa è successo DENTRO una candela, si rifà quella candela al minuto
  useEffect(() => {
    setFini(null);
    setRaffinamentoFallito(false);
    if (daRaffinare == null) return;
    let vivo = true;
    invokeFunction<Risposta & { ok: boolean }>("segnale-andamento", {
      symbol: sym,
      da: new Date(daRaffinare * 1000).toISOString(),
      a: new Date((daRaffinare + stepBase) * 1000).toISOString(),
      esatta: true,
      intervallo: "1min",
    })
      .then((r) => vivo && setFini(normalizzaCandele(r.candele)))
      .catch(() => vivo && setRaffinamentoFallito(true)); // resta l'esito prudente già segnalato come ambiguo
    return () => {
      vivo = false;
    };
  }, [daRaffinare, sym, stepBase]);

  const candeleEsito = useMemo(
    () => (dati ? (fini && daRaffinare != null ? sostituisciCandela(dati.candele, daRaffinare, stepBase, fini) : dati.candele) : []),
    [dati, fini, daRaffinare, stepBase]
  );
  const raffinato = !!fini && fini.length > 0 && daRaffinare != null;
  const esito = useMemo(() => (dati ? calcolaEsitoSegnale(sig, candeleEsito) : null), [sig, dati, candeleEsito]);
  const scarto = useMemo(() => (dati ? scartoAlMessaggio(sig, dati.candele) : null), [sig, dati]);
  // chi legge il messaggio e copia l'operazione entra al prezzo di mercato di quel momento, con gli stessi stop e target
  const esitoCopia = useMemo(
    () => (riportato && dati ? calcolaEsitoSegnale({ ...sig, modo: "mercato" }, candeleEsito) : null),
    [riportato, sig, dati, candeleEsito]
  );
  const rr = rrPrevisto(sig);
  // l'analisi AI parte solo quando l'esito è definitivo (anche dopo l'eventuale raffinamento al minuto)
  const esitoDefinitivo = !!esito && !!dati && (daRaffinare == null || fini !== null || raffinamentoFallito);
  const payloadAi = useMemo(
    () => (esito && dati ? { symbol: sym, ts: sig.ts, ...riassuntoPerAi({ sig, riportato, esito, esitoCopia, candele: candeleEsito }) } : null),
    [esito, esitoCopia, dati, sym, sig, riportato, candeleEsito]
  );
  const chiaveAi = `${sym}|${sig.ts}|${sig.direzione}|${sig.entrata}|${sig.stop_loss}|${sig.take_profits.join(",")}|${riportato}`;
  // la funzione guarda al massimo 21 giorni dopo il messaggio
  const troncato = Date.now() / 1000 - sig.ts > 21 * 86400;

  // granularità di visualizzazione: il grafico raggruppa le candele fini, senza nuove richieste
  const opzioni = dati ? ORDINE.filter((x) => STEP_SEC[x] >= STEP_SEC[dati.intervallo]) : [];
  const automatica: Intervallo | null = dati
    ? opzioni.find((x) => candeleEsito.length / (STEP_SEC[x] / STEP_SEC[dati.intervallo]) <= 700) ?? opzioni[opzioni.length - 1]
    : null;
  const vis = visualizza ?? automatica;
  const candeleGrafico = useMemo(() => (vis ? aggrega(candeleEsito, STEP_SEC[vis]) : []), [candeleEsito, vis]);

  return (
    <div className="space-y-5">
      {errore && (
        <p className="card border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          Non riesco a scaricare i prezzi di quel periodo: {errore}
        </p>
      )}
      {caricando && !dati && <div className="card h-64 animate-pulse" />}

          {riportato && (
            <p className="rounded-xl bg-surface2 px-3.5 py-2.5 text-xs leading-relaxed text-muted">
              Il gruppo racconta un&apos;operazione <span className="font-medium text-fg">già aperta</span> prima del
              messaggio. Qui sotto trovi com&apos;è andata <span className="font-medium text-fg">per il gruppo</span> e,
              più sotto, cosa avrebbe ottenuto chi l&apos;avesse copiata al prezzo del momento in cui il messaggio è arrivato.
            </p>
          )}

          {esito && <Banner esito={esito} ts={sig.ts} />}

          {dati && esito && (
            <section className="card p-5">
              <h2 className="card-title mb-3">Andamento del prezzo</h2>
              <SegnaleChart
                candele={candeleGrafico}
                sig={sig}
                esito={esito}
                opzioniVista={opzioni}
                vista={vis}
                onVista={setVisualizza}
                giornoPrima={giornoPrima}
                giorniAttivi={giorniAttivi}
                onGiorni={setGiorniAttivi}
                inizio={inizio}
                onInizio={setInizio}
              />
              {giorniAttivi && giornoPrimaStato === "carico" && (
                <p className="mt-2 text-xs text-muted">Carico il massimo e il minimo del giorno prima…</p>
              )}
              {giorniAttivi && giornoPrimaStato === "errore" && (
                <p className="mt-2 text-xs text-warn">Non sono riuscito a scaricare il giorno prima: le linee verticali ci sono, massimo e minimo no.</p>
              )}
              {giorniAttivi && giornoPrimaStato === "ok" && !giornoPrima && (
                <p className="mt-2 text-xs text-muted">Nei dati scaricati non ho trovato un giorno precedente con movimento.</p>
              )}
              {dati.fonte === "yahoo-futures" && (
                <p className="mt-3 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
                  I prezzi dello spot di quel periodo non erano disponibili: il grafico usa i futures sull&apos;oro, che
                  possono differire di qualche dollaro. Controlla gli esiti vicini a stop e target con cautela.
                </p>
              )}
              {esito.ambigua && (
                <p className="mt-3 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
                  Nella stessa candela erano raggiungibili sia lo stop sia il target e non è stato possibile stabilire
                  quale sia venuto prima: per prudenza è conteggiato lo stop.
                </p>
              )}
              {raffinato && (
                <p className="mt-3 rounded-xl bg-surface2 px-3 py-2 text-xs text-muted">
                  Stop e target cadevano nella stessa candela da {ETICHETTA[dati.intervallo]}: l&apos;ordine è stato stabilito
                  riguardando quel momento minuto per minuto.
                </p>
              )}
              {troncato && (
                <p className="mt-3 rounded-xl bg-surface2 px-3 py-2 text-xs text-muted">
                  Il messaggio è di più di 21 giorni fa: l&apos;analisi guarda i primi 21 giorni dopo il messaggio.
                </p>
              )}
              {dati.intervallo !== "1min" && !raffinato && (
                <p className="mt-3 rounded-xl bg-surface2 px-3 py-2 text-xs text-muted">
                  Per un periodo così lungo i prezzi sono a candele da {ETICHETTA[dati.intervallo]}: l&apos;entrata e
                  l&apos;uscita sono precise solo entro quell&apos;intervallo.
                </p>
              )}
            </section>
          )}

          {esito && esito.stato !== "non_attivato" && (
            <section className="card p-5">
              <h2 className="card-title mb-3">Numeri dell&apos;operazione</h2>
              <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <Riga k="Entrata" v={formatPrice(sym, esito.entrataPrezzo!)} sotto={quando(new Date(esito.entrataTempo! * 1000).toISOString())} />
                <Riga
                  k={esito.stato === "aperta" ? (troncato ? "Prezzo a 21 giorni" : "Prezzo ora") : "Uscita"}
                  v={formatPrice(sym, (esito.uscitaPrezzo ?? esito.ultimoPrezzo)!)}
                  sotto={quando(new Date(((esito.uscitaTempo ?? esito.ultimoTempo)!) * 1000).toISOString())}
                />
                <Riga k="Durata" v={esito.stato === "aperta" ? formatDurata((esito.ultimoTempo ?? 0) - esito.entrataTempo!) : formatDurata(esito.durataSec)} />
                <Riga k="Rischio" v={formatPrice(sym, esito.rischio!)} sotto="distanza entrata-stop" />
                <Riga k="R:R previsto" v={rr != null ? rr.toFixed(2) : "—"} sotto="al primo target" />
                <Riga
                  k="Massimo a favore"
                  v={formatPrice(sym, esito.mfe!)}
                  sotto={`${esito.mfeR!.toFixed(2)}R · ${formatPct((esito.mfe! / esito.entrataPrezzo!) * 100)}`}
                />
                <Riga
                  k="Massimo contro"
                  v={formatPrice(sym, esito.mae!)}
                  sotto={`${esito.maeR!.toFixed(2)}R · ${formatPct((esito.mae! / esito.entrataPrezzo!) * 100)}`}
                />
              </dl>
              {scarto && (
                riportato && sig ? (
                  (() => {
                    // buy: il prezzo sopra l'entrata dichiarata = già in guadagno; sell: sotto
                    const inGuadagno = (sig.direzione === "buy" ? 1 : -1) * (scarto.prezzoSpot - scarto.riferimento);
                    return (
                      <p className="mt-3 rounded-xl bg-surface2 px-3 py-2 text-xs text-muted">
                        Il gruppo dice di essere entrato a{" "}
                        <span className="num font-semibold">{formatPrice(sym, scarto.riferimento)}</span>. Al momento del
                        messaggio il prezzo era{" "}
                        <span className="num font-semibold">{formatPrice(sym, scarto.prezzoSpot)}</span>: la posizione era già{" "}
                        <span className={`font-semibold ${inGuadagno >= 0 ? "text-up" : "text-down"}`}>
                          {inGuadagno >= 0 ? "in guadagno" : "in perdita"} di {formatPrice(sym, Math.abs(inGuadagno))}
                        </span>
                        . Chi copia entra a questo prezzo, non a quello dichiarato.
                      </p>
                    );
                  })()
                ) : (
                <p
                  className={`mt-3 rounded-xl px-3 py-2 text-xs ${
                    Math.abs(scarto.scartoPct) > 0.1 ? "border border-warn/30 bg-warn/10 text-warn" : "bg-surface2 text-muted"
                  }`}
                >
                  Al momento del messaggio il prezzo di mercato era{" "}
                  <span className="num font-semibold">{formatPrice(sym, scarto.prezzoSpot)}</span>, il segnale indicava{" "}
                  <span className="num font-semibold">{formatPrice(sym, scarto.riferimento)}</span> (scarto{" "}
                  <span className="num">
                    {scarto.scarto > 0 ? "+" : ""}
                    {formatPrice(sym, scarto.scarto)}
                  </span>
                  ).
                  {Math.abs(scarto.scartoPct) > 0.1
                    ? " Uno scarto grande indica che il gruppo usa un broker con prezzi diversi, oppure un'entrata pendente: l'esito è meno affidabile."
                    : " I prezzi coincidono: i dati sono confrontabili."}
                </p>
                )
              )}
            </section>
          )}

          {esitoCopia && esitoCopia.stato === "non_copiabile" && esitoCopia.entrataPrezzo != null && (
            <section className="card p-5">
              <h2 className="card-title mb-3">Se l&apos;avessi copiata al prezzo del messaggio</h2>
              <p className="text-sm font-semibold text-warn">Non era più possibile copiarla</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Al momento del messaggio il prezzo era{" "}
                <span className="num font-semibold text-fg">{formatPrice(sym, esitoCopia.entrataPrezzo)}</span>, già{" "}
                {esitoCopia.oltreAlMessaggio === "tp" ? "oltre il primo target" : "oltre lo stop"} indicato dal gruppo: entrando
                lì lo stop o il target sarebbero stati dalla parte sbagliata.
              </p>
            </section>
          )}

          {esitoCopia && esitoCopia.stato !== "non_copiabile" && esitoCopia.entrataPrezzo != null && (
            <section className="card p-5">
              <h2 className="card-title mb-3">Se l&apos;avessi copiata al prezzo del messaggio</h2>
              <p
                className={`text-sm font-semibold ${
                  esitoCopia.stato === "tp" ? "text-up" : esitoCopia.stato === "sl" ? "text-down" : "text-warn"
                }`}
              >
                {esitoCopia.stato === "tp" && `Primo target raggiunto dopo ${formatDurata(esitoCopia.durataSec)}`}
                {esitoCopia.stato === "sl" && `Stop loss colpito dopo ${formatDurata(esitoCopia.durataSec)}`}
                {esitoCopia.stato === "aperta" && "Ancora aperta"}
                <span className="num ml-2">
                  {esitoCopia.r != null
                    ? `${esitoCopia.r > 0 ? "+" : ""}${esitoCopia.r.toFixed(2)}R`
                    : esitoCopia.rFlottante != null
                    ? `${esitoCopia.rFlottante > 0 ? "+" : ""}${esitoCopia.rFlottante.toFixed(2)}R`
                    : ""}
                </span>
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Entrata a <span className="num">{formatPrice(sym, esitoCopia.entrataPrezzo)}</span> (prezzo di mercato al
                momento del messaggio), con lo stop e il target indicati dal gruppo. Il rischio diventa{" "}
                <span className="num">{formatPrice(sym, esitoCopia.rischio ?? 0)}</span> invece di{" "}
                <span className="num">{formatPrice(sym, esito?.rischio ?? 0)}</span>.
                {esitoCopia.ambigua ? " Stop e target stavano nella stessa candela: per prudenza è conteggiato lo stop." : ""}
              </p>
            </section>
          )}

          {esito && (
            <section className="card p-5">
              <h2 className="card-title mb-3">Obiettivi</h2>
              <ul className="divide-y divide-line/70 text-sm">
                {esito.tpToccati.map((tp) => (
                  <li key={tp.indice} className="flex items-center justify-between gap-3 py-2.5">
                    <span>
                      <span className="font-medium">TP{tp.indice}</span>{" "}
                      <span className="num text-muted">{formatPrice(sym, tp.prezzo)}</span>
                    </span>
                    {tp.tempo != null && esito.entrataTempo != null ? (
                      <span className="num text-up">
                        raggiunto dopo {formatDurata(tp.tempo - esito.entrataTempo)}
                        {esito.slTempo != null && tp.tempo > esito.slTempo ? " (dopo lo stop)" : ""}
                      </span>
                    ) : (
                      <span className="text-muted">non raggiunto</span>
                    )}
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3 py-2.5">
                  <span>
                    <span className="font-medium">Stop</span>{" "}
                    <span className="num text-muted">{formatPrice(sym, sig.stop_loss)}</span>
                  </span>
                  {esito.slTempo != null && esito.entrataTempo != null ? (
                    <span className="num text-down">colpito dopo {formatDurata(esito.slTempo - esito.entrataTempo)}</span>
                  ) : (
                    <span className="text-muted">non colpito</span>
                  )}
                </li>
              </ul>
            </section>
          )}

          {esito && <SchedaAi chiave={chiaveAi} pronta={esitoDefinitivo} payload={payloadAi} />}

          <p className="text-xs leading-relaxed text-muted">
            Simulazione idealizzata: si entra al prezzo scritto nel segnale appena viene toccato, senza spread né
            slippage né commissioni. L&apos;esito conta ciò che succede prima tra stop e primo target. Candele da{" "}
            {dati?.fonte === "twelvedata" ? "Twelve Data" : dati?.fonte === "yahoo-futures" ? "Yahoo Finance (futures)" : "Yahoo Finance"}
            {dati ? `, granularità ${dati.intervallo.replace("min", " min")}` : ""}. Informativa, non è un consiglio di
            investimento.
          </p>
    </div>
  );
}
