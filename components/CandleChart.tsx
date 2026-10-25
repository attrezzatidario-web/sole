"use client";

import { Maximize2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import MenuIndicatori, { VoceMenu } from "@/components/MenuIndicatori";
import { giornoPrima, giorniPerGrafico, rimuoviMercatoChiuso } from "@/lib/domain/giorni";
import { CandelaGrafico, rimuoviTrattiPiatti } from "@/lib/domain/indicatoriGrafico";
import { invokeFunction } from "@/lib/functions";
import { LivelloGrafico, OVERLAY_VUOTO, OpzioniOverlay, OverlayGrafico } from "@/lib/grafico/overlay";
import { LineeGiorni } from "@/lib/grafico/lineeGiorni";
import { ASSE_TEMPO, MARGINI_PREZZO, opzioniInterazione } from "@/lib/grafico/opzioniGrafico";
import { useEspanso } from "@/lib/useEspanso";
import { useInizioGiornata } from "@/lib/useInizioGiornata";

export type { LivelloGrafico } from "@/lib/grafico/overlay";

type Timeframe = "M30" | "H1" | "H4" | "Daily";
const TIMEFRAME: { id: Timeframe; label: string }[] = [
  { id: "M30", label: "M30" },
  { id: "H1", label: "H1" },
  { id: "H4", label: "H4" },
  { id: "Daily", label: "D1" },
];

// Cache in memoria (per la sessione): evita di richiamare la funzione se si torna sullo stesso timeframe.
const cache = new Map<string, CandelaGrafico[]>();

export default function CandleChart({
  symbol,
  livelli,
  mostraLivelliDiDefault = false,
}: {
  symbol: string;
  livelli?: LivelloGrafico[];
  mostraLivelliDiDefault?: boolean;
}) {
  const [tf, setTf] = useState<Timeframe>("H1");
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<OpzioniOverlay>({ ...OVERLAY_VUOTO, livelli: mostraLivelliDiDefault });
  const [giorniAttivi, setGiorniAttivi] = useState(false);
  const [inizio, setInizio] = useInizioGiornata();
  const [note, setNote] = useState<string[]>([]);
  const [pronto, setPronto] = useState(0); // cambia quando il grafico o i dati sono pronti
  const { espanso, apri, chiudi } = useEspanso();

  const contenitoreRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const serieRef = useRef<any>(null);
  const overlayRef = useRef<OverlayGrafico | null>(null);
  const lineeGiorniRef = useRef<LineeGiorni | null>(null);
  const candeleRef = useRef<CandelaGrafico[]>([]);
  const extraRef = useRef<number[]>([]); // prezzi che devono restare dentro la scala (key level, giorno prima)
  const statoRef = useRef({ espanso });
  statoRef.current = { espanso };

  // Crea il grafico una sola volta; segue il tema chiaro/scuro.
  useEffect(() => {
    let vivo = true;
    let ro: ResizeObserver | null = null;
    let mo: MutationObserver | null = null;

    const token = (nome: string, fallback: string) => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
      return v ? `rgb(${v})` : fallback;
    };

    import("lightweight-charts").then(({ createChart, CandlestickSeries, LineSeries, ColorType, CrosshairMode }) => {
      if (!vivo || !contenitoreRef.current) return;
      const chart = createChart(contenitoreRef.current, {
        layout: { background: { type: ColorType.Solid, color: "transparent" }, fontSize: 11, fontFamily: "inherit" },
        grid: { vertLines: { visible: false }, horzLines: { style: 1 } },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderVisible: false, scaleMargins: MARGINI_PREZZO },
        timeScale: ASSE_TEMPO,
        ...opzioniInterazione(statoRef.current.espanso),
        autoSize: true,
      });
      const serie = chart.addSeries(CandlestickSeries, {
        borderVisible: false,
        // la scala include anche i livelli richiesti (key level, massimo/minimo del giorno prima)
        autoscaleInfoProvider: (originale: () => any) => {
          const r = originale();
          if (r !== null && extraRef.current.length) {
            r.priceRange.minValue = Math.min(r.priceRange.minValue, ...extraRef.current);
            r.priceRange.maxValue = Math.max(r.priceRange.maxValue, ...extraRef.current);
          }
          return r;
        },
      });
      const lineeGiorni = new LineeGiorni();
      serie.attachPrimitive(lineeGiorni);
      lineeGiorniRef.current = lineeGiorni;
      chartRef.current = chart;
      serieRef.current = serie;
      overlayRef.current = new OverlayGrafico(serie, (colore, spessore = 1) =>
        chart.addSeries(LineSeries, { color: colore, lineWidth: spessore, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
      );

      const colori = () => {
        chart.applyOptions({
          layout: { textColor: token("--muted", "#8a93a6") },
          grid: { horzLines: { color: token("--line", "#26314533") } },
        });
        serie.applyOptions({
          upColor: token("--up", "#22c582"),
          downColor: token("--down", "#f45757"),
          wickUpColor: token("--up", "#22c582"),
          wickDownColor: token("--down", "#f45757"),
        });
      };
      colori();
      ro = new ResizeObserver(() => chart.applyOptions({}));
      ro.observe(contenitoreRef.current);
      mo = new MutationObserver(colori);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      setPronto((n) => n + 1);
    });

    return () => {
      vivo = false;
      ro?.disconnect();
      mo?.disconnect();
      chartRef.current?.remove();
      chartRef.current = null;
      serieRef.current = null;
      overlayRef.current = null;
      lineeGiorniRef.current = null;
    };
  }, []);

  // Carica (o ricarica) le candele quando cambiano asset o timeframe.
  useEffect(() => {
    if (!pronto) return;
    let vivo = true;
    (async () => {
      const chiave = `${symbol}|${tf}`;
      setErrore(null);
      let candele = cache.get(chiave);
      if (!candele) {
        setLoading(true);
        try {
          const r = await invokeFunction<{ candele: CandelaGrafico[] }>("get-candles", { symbol, timeframe: tf });
          // il weekend (mercato chiuso) non diventa uno spazio vuoto nel mezzo
          candele = rimuoviTrattiPiatti(tf === "Daily" ? r.candele : rimuoviMercatoChiuso(r.candele));
          cache.set(chiave, candele);
        } catch (e) {
          if (vivo) setErrore(`Non sono riuscito a caricare le candele: ${e instanceof Error ? e.message : "errore"}`);
          setLoading(false);
          return;
        }
        setLoading(false);
      }
      if (!vivo || !serieRef.current) return;
      candeleRef.current = candele;
      serieRef.current.setData(candele.map((c) => ({ time: c.t, open: c.o, high: c.h, low: c.l, close: c.c })));
      chartRef.current?.timeScale().fitContent();
      setPronto((n) => n + 1);
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, tf, pronto === 0]);

  // Applica indicatori, key level, giorno prima e linee dei giorni a ogni scelta (e a ogni nuovo dato).
  useEffect(() => {
    const o = overlayRef.current;
    const candele = candeleRef.current;
    if (!o || !candele.length) return;
    setNote(o.aggiorna(candele, overlay, { emaDailyDisponibile: tf === "Daily", livelli }));
    const gp = giorniAttivi && tf !== "Daily" ? giornoPrima(candele, candele[candele.length - 1].t, inizio) : null;
    o.mostraGiornoPrima(gp);
    extraRef.current = [
      ...(overlay.livelli && livelli ? livelli.map((l) => l.prezzo) : []),
      ...(gp ? [gp.alto, gp.basso] : []),
    ];
    chartRef.current?.priceScale("right").applyOptions({ autoScale: true });
    const rgb = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "138 147 166";
    lineeGiorniRef.current?.imposta(giorniAttivi && tf !== "Daily" ? giorniPerGrafico(candele, inizio) : [], rgb);
  }, [overlay, giorniAttivi, inizio, livelli, tf, pronto]);

  // La rotella zooma il grafico solo a schermo intero: altrimenti scorre la pagina (e il grafico non si rimpicciolisce).
  useEffect(() => {
    chartRef.current?.applyOptions(opzioniInterazione(espanso));
  }, [espanso, pronto]);

  const voci: VoceMenu[] = [
    { id: "ema200", label: "EMA 200" },
    { id: "alligator", label: "Alligator" },
    { id: "bollinger", label: "Bollinger (20,2)" },
    ...(tf === "Daily" ? [{ id: "emaDaily" as const, label: "EMA 50 / 200" }] : []),
    ...(livelli && livelli.length > 0 ? [{ id: "livelli" as const, label: "Key level" }] : []),
  ];

  return (
    <div
      className={espanso ? "fixed inset-0 z-50 flex flex-col bg-bg p-3" : ""}
      style={
        espanso
          ? { paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)", paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }
          : undefined
      }
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <MenuIndicatori
          voci={voci}
          overlay={overlay}
          onOverlay={setOverlay}
          giorniAttivi={giorniAttivi}
          onGiorni={setGiorniAttivi}
          mostraGiorni={tf !== "Daily"}
          inizio={inizio}
          onInizio={setInizio}
          linkVolume={`/volume-profile/?symbol=${symbol}`}
        />
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-line bg-surface2 p-0.5">
            {TIMEFRAME.map((x) => (
              <button
                key={x.id}
                onClick={() => setTf(x.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  tf === x.id ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"
                }`}
              >
                {x.label}
              </button>
            ))}
          </div>
          <button
            onClick={espanso ? chiudi : apri}
            aria-label={espanso ? "Chiudi schermo intero" : "Schermo intero"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface2 text-muted transition hover:text-fg"
          >
            {espanso ? <X size={15} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {errore ? (
        <p className="flex h-52 items-center justify-center rounded-xl bg-surface2 px-4 text-center text-sm text-down sm:h-64">{errore}</p>
      ) : (
        <div className={`relative w-full ${espanso ? "min-h-0 flex-1" : "h-52 sm:h-64"}`}>
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-surface/60 text-xs text-muted backdrop-blur-[1px]">
              Carico le candele…
            </div>
          )}
          <div ref={contenitoreRef} className="h-full w-full" />
        </div>
      )}
      {note.length > 0 && <p className="mt-2 text-xs text-muted">{note.join(" · ")}</p>}
    </div>
  );
}
