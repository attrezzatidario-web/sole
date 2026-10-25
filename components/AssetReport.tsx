"use client";

import {
  Activity,
  ArrowLeft,
  Layers,
  Newspaper,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Waypoints,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { calcolaConfluenze } from "@/lib/domain/confluenze";
import { calcolaScenario } from "@/lib/domain/scenario";
import { assetCategoria, assetLabel, formatOraRoma, formatPct, formatPrice } from "@/lib/format";
import { invokeFunction } from "@/lib/functions";
import { supabase } from "@/lib/supabaseClient";
import type { Point } from "@/lib/usePrices";
import { trendOf } from "./AssetRow";
import { useAnimatedNumber, useFlashOnChange } from "@/lib/useLivePrice";
import ChangePill from "./ChangePill";
import CandleChart from "./CandleChart";
import PriceChart from "./PriceChart";
import { AnalisiRow, ConfluenzeCard, FibonacciCard, PitchforkCard } from "./TecnicheCards";

export interface CorrelatedRow {
  symbol: string;
  changePct: number | null;
  statoCorrelazione: "confermata" | "divergente" | "non_disponibile";
  nota: string;
}
export interface NewsRow {
  titolo: string;
  orario: string;
  importanza: "alta" | "media" | "bassa";
}
export interface KeyLevelRow {
  prezzo: number;
  timeframe: string;
  tipo: "resistenza" | "supporto";
  note?: string | null;
}
export interface TechnicalSignal {
  ts: string;
  ema200: number;
  jaw: number;
  teeth: number;
  lips: number;
  posizioneAlligator: "sopra" | "sotto" | "in_mezzo";
  direzioneAlligator: "rialzista" | "ribassista" | "laterale";
  prezzoVsEma200: "sopra" | "sotto";
  inputDirezionale: "buy" | "sell" | "nessuna_confluenza";
  rsi: number | null;
  rsiDivergenza: "rialzista" | "ribassista" | "nessuna" | null;
  macdLinea: number | null;
  macdSegnale: number | null;
  macdIstogramma: number | null;
  bollingerSuperiore: number | null;
  bollingerMedia: number | null;
  bollingerInferiore: number | null;
}

function Errore({ testo }: { testo: string }) {
  return (
    <p className="rounded-xl border border-down/30 bg-down/10 px-3.5 py-2.5 text-sm text-down">{testo}</p>
  );
}

function Sezione({
  titolo,
  Icona,
  azione,
  children,
}: {
  titolo: string;
  Icona: typeof Sparkles;
  azione?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="card-title flex items-center gap-2">
          <Icona size={14} strokeWidth={2.2} />
          {titolo}
        </h2>
        {azione}
      </div>
      {children}
    </section>
  );
}

function BottoneAzione({
  onClick,
  loading,
  children,
}: {
  onClick: () => void;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={loading} className="btn-ghost !h-8 !rounded-lg !px-3 !text-xs">
      <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
      {children}
    </button>
  );
}

export default function AssetReport({
  symbol,
  priceNow,
  changePct,
  reportIniziale,
  reportTs,
  correlati,
  news,
  keyLevels,
  segnaleTecnicoIniziale,
  history,
  variazioniScenario,
  analisi,
}: {
  symbol: string;
  priceNow: number | null;
  changePct: number | null;
  reportIniziale: string | null;
  reportTs: string | null;
  correlati: CorrelatedRow[];
  news: NewsRow[];
  keyLevels: KeyLevelRow[];
  segnaleTecnicoIniziale: TechnicalSignal | null;
  history: Point[];
  variazioniScenario: { usd: number | null; xau: number | null; indici: (number | null)[] };
  analisi: AnalisiRow[];
}) {
  const prezzoAnimato = useAnimatedNumber(priceNow);
  const pctAnimata = useAnimatedNumber(changePct);
  const flashPrezzo = useFlashOnChange(priceNow);
  const [vistaGrafico, setVistaGrafico] = useState<"linea" | "candele">("linea");
  const [report, setReport] = useState(reportIniziale);
  const [reportOra, setReportOra] = useState(reportTs);
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const [livelli, setLivelli] = useState<KeyLevelRow[]>(keyLevels);
  const [loadingLivelli, setLoadingLivelli] = useState(false);
  const [erroreLivelli, setErroreLivelli] = useState<string | null>(null);

  const [segnale, setSegnale] = useState(segnaleTecnicoIniziale);
  const [loadingInd, setLoadingInd] = useState(false);
  const [erroreInd, setErroreInd] = useState<string | null>(null);

  const msg = (e: unknown) => (e instanceof Error ? e.message : "errore sconosciuto");

  async function generaOra() {
    setLoading(true);
    setErrore(null);
    try {
      const data = await invokeFunction<{ testo: string }>("generate-report", { symbol });
      setReport(data.testo);
      setReportOra(new Date().toISOString());
    } catch (e) {
      setErrore(`Non sono riuscito a generare l'analisi: ${msg(e)}`);
    } finally {
      setLoading(false);
    }
  }

  async function calcolaIndicatori() {
    setLoadingInd(true);
    setErroreInd(null);
    try {
      const d = await invokeFunction<any>("compute-indicators", { symbol });
      setSegnale({
        ts: new Date().toISOString(),
        ema200: d.ema200,
        jaw: d.jaw,
        teeth: d.teeth,
        lips: d.lips,
        posizioneAlligator: d.posizioneAlligator,
        direzioneAlligator: d.direzioneAlligator,
        prezzoVsEma200: d.prezzoVsEma200,
        inputDirezionale: d.inputDirezionale,
        rsi: d.rsi,
        rsiDivergenza: d.rsiDivergenza,
        macdLinea: d.macdLinea,
        macdSegnale: d.macdSegnale,
        macdIstogramma: d.macdIstogramma,
        bollingerSuperiore: d.bollingerSuperiore,
        bollingerMedia: d.bollingerMedia,
        bollingerInferiore: d.bollingerInferiore,
      });
    } catch (e) {
      setErroreInd(`Non sono riuscito a calcolare Alligator+EMA200: ${msg(e)}`);
    } finally {
      setLoadingInd(false);
    }
  }

  async function calcolaLivelli() {
    setLoadingLivelli(true);
    setErroreLivelli(null);
    try {
      await invokeFunction("compute-key-levels", { symbol });
      if (supabase) {
        const { data } = await supabase
          .from("key_levels")
          .select("prezzo, timeframe, tipo, note")
          .eq("asset_symbol", symbol);
        setLivelli((data ?? []) as KeyLevelRow[]);
      }
    } catch (e) {
      setErroreLivelli(`Non sono riuscito a calcolare i key level: ${msg(e)}`);
    } finally {
      setLoadingLivelli(false);
    }
  }

  const trend = trendOf(changePct);

  const struttura = analisi.find((a) => a.tipo === "struttura" && a.timeframe === "H4")?.dati as
    | { trend: "rialzista" | "ribassista" | "laterale" }
    | undefined;
  const emaCross = analisi.find((a) => a.tipo === "ema_cross" && a.timeframe === "Daily")?.dati as
    | { trend: "rialzista" | "ribassista"; incrocio: "golden" | "death" | "nessuno" }
    | undefined;

  const elementi = calcolaConfluenze({
    symbol,
    priceNow,
    changePct,
    segnale,
    correlati,
    keyLevels: livelli,
    news,
    scenario: calcolaScenario(variazioniScenario),
    tecniciM30: segnale
      ? { rsi: segnale.rsi, rsiDivergenza: segnale.rsiDivergenza, macdIstogramma: segnale.macdIstogramma }
      : null,
    struttura: struttura ?? null,
    emaCross: emaCross ?? null,
  });

  // 8 livelli più vicini al prezzo, dal più alto al più basso, con il prezzo attuale inserito in mezzo.
  const vicini = [...livelli]
    .sort((a, b) =>
      priceNow === null ? 0 : Math.abs(a.prezzo - priceNow) - Math.abs(b.prezzo - priceNow)
    )
    .slice(0, 8)
    .sort((a, b) => b.prezzo - a.prezzo);
  type Riga = { kind: "livello"; k: KeyLevelRow } | { kind: "prezzo" };
  const scala: Riga[] = [];
  let inserito = false;
  for (const k of vicini) {
    if (!inserito && priceNow !== null && k.prezzo < priceNow) {
      scala.push({ kind: "prezzo" });
      inserito = true;
    }
    scala.push({ kind: "livello", k });
  }
  if (!inserito && priceNow !== null && vicini.length > 0) scala.push({ kind: "prezzo" });

  const ordineStato = { divergente: 0, confermata: 1, non_disponibile: 2 } as const;
  const correlatiOrdinati = [...correlati].sort(
    (a, b) => ordineStato[a.statoCorrelazione] - ordineStato[b.statoCorrelazione]
  );

  const verdetto =
    segnale?.inputDirezionale === "buy"
      ? { testo: "Confluenza rialzista", cls: "bg-up/12 text-up", Icona: TrendingUp }
      : segnale?.inputDirezionale === "sell"
      ? { testo: "Confluenza ribassista", cls: "bg-down/12 text-down", Icona: TrendingDown }
      : { testo: "Nessuna confluenza", cls: "bg-surface2 text-muted", Icona: Activity };

  return (
    <div className="space-y-5">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-fg">
        <ArrowLeft size={15} /> Mercati
      </Link>

      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight">{symbol}</h1>
              <span className="rounded-md bg-surface2 px-2 py-0.5 text-[11px] font-medium text-muted">
                {assetCategoria(symbol)}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted">{assetLabel(symbol)}</p>
          </div>
          <div
            className={`rounded-xl px-2 py-1 text-right transition-colors ${
              flashPrezzo === "su" ? "flash-su" : flashPrezzo === "giu" ? "flash-giu" : ""
            }`}
          >
            <p className="num text-3xl font-semibold tracking-tight">{formatPrice(symbol, prezzoAnimato)}</p>
            <div className="mt-1.5 flex justify-end">
              <ChangePill value={pctAnimata} size="lg" />
            </div>
          </div>
        </div>
        <div className="mt-5">
          <div className="mb-3 flex justify-end">
            <div className="flex rounded-lg border border-line bg-surface2 p-0.5">
              {(["linea", "candele"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setVistaGrafico(v)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition ${
                    vistaGrafico === v ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          {vistaGrafico === "linea" ? (
            <PriceChart symbol={symbol} points={history} trend={trend} />
          ) : (
            <CandleChart symbol={symbol} livelli={vicini} />
          )}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Sezione
            titolo="Analisi AI"
            Icona={Sparkles}
            azione={
              <button onClick={generaOra} disabled={loading} className="btn-primary !h-8 !rounded-lg !px-3 !text-xs">
                <Sparkles size={13} className={loading ? "animate-pulse" : ""} />
                {loading ? "Genero…" : "Genera analisi"}
              </button>
            }
          >
            {errore && <div className="mb-3"><Errore testo={errore} /></div>}
            {report ? (
              <>
                <div className="space-y-3 text-[15px] leading-relaxed">
                  {report.split(/\n{2,}/).map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
                {reportOra && (
                  <p className="mt-4 text-xs text-muted">
                    Generata alle <span className="num">{formatOraRoma(reportOra)}</span> · informativa, non è un
                    consiglio di investimento
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted">
                Nessuna analisi ancora per questo asset. Premi «Genera analisi» oppure attendi il prossimo ciclo
                automatico.
              </p>
            )}
          </Sezione>

          <ConfluenzeCard elementi={elementi} />

          <Sezione titolo="Asset correlati" Icona={Waypoints}>
            <ul className="-mx-2 divide-y divide-line/70">
              {correlatiOrdinati.map((c) => (
                <li key={c.symbol} className="flex items-center justify-between gap-3 px-2 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link href={`/asset/${c.symbol}/`} className="text-[15px] font-semibold hover:text-accent">
                        {c.symbol}
                      </Link>
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          c.statoCorrelazione === "confermata"
                            ? "bg-up/12 text-up"
                            : c.statoCorrelazione === "divergente"
                            ? "bg-warn/15 text-warn"
                            : "bg-surface2 text-muted"
                        }`}
                      >
                        {c.statoCorrelazione === "confermata"
                          ? "Confermata"
                          : c.statoCorrelazione === "divergente"
                          ? "Divergenza"
                          : "n/d"}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted">{c.nota}</p>
                  </div>
                  <ChangePill value={c.changePct} size="sm" />
                </li>
              ))}
            </ul>
          </Sezione>

          <FibonacciCard symbol={symbol} priceNow={priceNow} righe={analisi} />
          <PitchforkCard symbol={symbol} priceNow={priceNow} righe={analisi} />
        </div>

        <div className="space-y-5">
          <Sezione
            titolo="Indicatori tecnici · M30"
            Icona={Activity}
            azione={<BottoneAzione onClick={calcolaIndicatori} loading={loadingInd}>Calcola</BottoneAzione>}
          >
            {erroreInd && <div className="mb-3"><Errore testo={erroreInd} /></div>}
            {!segnale ? (
              <p className="text-sm text-muted">Premi «Calcola» per analizzare le candele M30 di questo asset.</p>
            ) : (
              <>
                <div className={`flex items-center gap-2 rounded-xl px-3.5 py-3 ${verdetto.cls}`}>
                  <verdetto.Icona size={18} />
                  <span className="text-[15px] font-semibold">{verdetto.testo}</span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-surface2 px-3.5 py-3">
                    <dt className="text-xs text-muted">Alligator</dt>
                    <dd className="mt-0.5 font-semibold capitalize">{segnale.direzioneAlligator}</dd>
                  </div>
                  <div className="rounded-xl bg-surface2 px-3.5 py-3">
                    <dt className="text-xs text-muted">Prezzo vs Alligator</dt>
                    <dd className="mt-0.5 font-semibold capitalize">{segnale.posizioneAlligator.replace("_", " ")}</dd>
                  </div>
                  <div className="rounded-xl bg-surface2 px-3.5 py-3">
                    <dt className="text-xs text-muted">EMA200</dt>
                    <dd className="num mt-0.5 font-semibold">{formatPrice(symbol, segnale.ema200)}</dd>
                  </div>
                  <div className="rounded-xl bg-surface2 px-3.5 py-3">
                    <dt className="text-xs text-muted">Prezzo vs EMA200</dt>
                    <dd className="mt-0.5 font-semibold capitalize">{segnale.prezzoVsEma200}</dd>
                  </div>
                </dl>

                <p className="card-title mb-2 mt-5">Altri indicatori (M30)</p>
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <div className="rounded-xl bg-surface2 px-3.5 py-3">
                    <dt className="text-xs text-muted">RSI (14)</dt>
                    <dd className="num mt-0.5 font-semibold">{segnale.rsi?.toFixed(0) ?? "—"}</dd>
                    {segnale.rsiDivergenza && segnale.rsiDivergenza !== "nessuna" && (
                      <dd className="mt-0.5 text-[11px] text-anomaly">Divergenza {segnale.rsiDivergenza}</dd>
                    )}
                  </div>
                  <div className="rounded-xl bg-surface2 px-3.5 py-3">
                    <dt className="text-xs text-muted">MACD istogramma</dt>
                    <dd
                      className={`num mt-0.5 font-semibold ${
                        (segnale.macdIstogramma ?? 0) > 0 ? "text-up" : (segnale.macdIstogramma ?? 0) < 0 ? "text-down" : ""
                      }`}
                    >
                      {segnale.macdIstogramma?.toFixed(3) ?? "—"}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-surface2 px-3.5 py-3">
                    <dt className="text-xs text-muted">Bollinger (20,2)</dt>
                    <dd className="mt-0.5 text-[13px] font-semibold">
                      {segnale.bollingerSuperiore !== null && priceNow !== null ? (
                        priceNow > segnale.bollingerSuperiore ? (
                          <span className="text-up">Sopra la banda</span>
                        ) : priceNow < (segnale.bollingerInferiore ?? -Infinity) ? (
                          <span className="text-down">Sotto la banda</span>
                        ) : (
                          "Dentro le bande"
                        )
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                </dl>

                <p className="mt-3 text-[11px] leading-relaxed text-muted">
                  Calcolo senza lo shift in avanti del disegno a schermo: è un input direzionale, non la copia del
                  grafico.
                </p>
              </>
            )}
          </Sezione>

          <Sezione
            titolo="Key level"
            Icona={Layers}
            azione={<BottoneAzione onClick={calcolaLivelli} loading={loadingLivelli}>Calcola</BottoneAzione>}
          >
            {erroreLivelli && <div className="mb-3"><Errore testo={erroreLivelli} /></div>}
            {scala.length === 0 ? (
              <p className="text-sm text-muted">
                Nessun livello. Premi «Calcola» per trovarli dai prezzi storici, o aggiungili a mano dalla pagina
                Livelli.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {scala.map((r, i) =>
                  r.kind === "prezzo" ? (
                    <li
                      key={`p${i}`}
                      className="flex items-center justify-between rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm"
                    >
                      <span className="flex items-center gap-2 font-medium text-accent">
                        <span className="h-2 w-2 rounded-full bg-accent" /> Prezzo attuale
                      </span>
                      <span className="num font-semibold">{formatPrice(symbol, priceNow)}</span>
                    </li>
                  ) : (
                    <li key={i} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${r.k.tipo === "resistenza" ? "bg-down" : "bg-up"}`}
                        />
                        <span className="truncate">
                          {r.k.tipo === "resistenza" ? "Resistenza" : "Supporto"}{" "}
                          <span className="text-muted">
                            {r.k.timeframe}
                            {r.k.note ? ` · ${r.k.note.replace("Auto · ", "")}` : ""}
                          </span>
                        </span>
                      </span>
                      <span className="flex items-baseline gap-2">
                        <span className="num font-medium">{formatPrice(symbol, r.k.prezzo)}</span>
                        {priceNow !== null && (
                          <span className="num w-14 text-right text-xs text-muted">
                            {formatPct(((r.k.prezzo - priceNow) / priceNow) * 100)}
                          </span>
                        )}
                      </span>
                    </li>
                  )
                )}
              </ul>
            )}
          </Sezione>

          <Sezione titolo="Prossime notizie" Icona={Newspaper}>
            {news.length === 0 ? (
              <p className="text-sm text-muted">Nessuna notizia rilevante in arrivo per questo asset.</p>
            ) : (
              <ul className="space-y-3">
                {news.map((n, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        n.importanza === "alta" ? "bg-down" : "bg-warn"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="leading-snug">{n.titolo}</p>
                      <p className="num mt-0.5 text-xs text-muted">
                        {new Date(n.orario).toLocaleString("it-IT", {
                          weekday: "short",
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "Europe/Rome",
                        })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Sezione>
        </div>
      </div>
    </div>
  );
}
