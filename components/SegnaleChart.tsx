"use client";

import { Maximize2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import MenuIndicatori, { VoceMenu } from "@/components/MenuIndicatori";
import type { CandelaE, DatiSegnale, EsitoSegnale, Intervallo } from "@/lib/domain/esitoSegnale";
import { InizioGiornata, giorniPerGrafico, rimuoviMercatoChiuso } from "@/lib/domain/giorni";
import { rimuoviTrattiPiatti } from "@/lib/domain/indicatoriGrafico";
import { OVERLAY_VUOTO, OpzioniOverlay, OverlayGrafico } from "@/lib/grafico/overlay";
import { LineeGiorni } from "@/lib/grafico/lineeGiorni";
import { ASSE_TEMPO, MARGINI_PREZZO, opzioniInterazione } from "@/lib/grafico/opzioniGrafico";
import { useEspanso } from "@/lib/useEspanso";

const ETICHETTA: Record<Intervallo, string> = { "1min": "1 min", "5min": "5 min", "15min": "15 min", "30min": "30 min", "1h": "1 h" };

/**
 * Grafico a candele del periodo di un segnale, con entrata, stop e target come righe e marcatori su
 * messaggio, entrata e uscita. Ha gli stessi indicatori e le stesse opzioni degli altri grafici
 * (EMA 200, Alligator, Bollinger, linee dei giorni e massimo/minimo del giorno prima).
 * Il weekend (mercato chiuso) non diventa uno spazio vuoto nel mezzo.
 */
export default function SegnaleChart({
  candele,
  sig,
  esito,
  opzioniVista,
  vista,
  onVista,
  giornoPrima,
  giorniAttivi,
  onGiorni,
  inizio,
  onInizio,
}: {
  candele: CandelaE[];
  sig: DatiSegnale;
  esito: EsitoSegnale;
  opzioniVista: Intervallo[];
  vista: Intervallo | null;
  onVista: (v: Intervallo) => void;
  giornoPrima: { alto: number; basso: number } | null;
  giorniAttivi: boolean;
  onGiorni: (v: boolean) => void;
  inizio: InizioGiornata;
  onInizio: (v: InizioGiornata) => void;
}) {
  const { espanso, apri, chiudi } = useEspanso();
  const [overlay, setOverlay] = useState<OpzioniOverlay>(OVERLAY_VUOTO);
  const [note, setNote] = useState<string[]>([]);
  const [pronto, setPronto] = useState(false);

  const contenitore = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const serieRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const overlayRef = useRef<OverlayGrafico | null>(null);
  const lineeGiorniRef = useRef<LineeGiorni | null>(null);
  const lineeRef = useRef<any[]>([]);
  const extraRef = useRef<number[]>([]);
  const livelliBaseRef = useRef<number[]>([]);
  const mostrateRef = useRef<CandelaE[]>([]);
  const statoRef = useRef({ espanso });
  statoRef.current = { espanso };

  // senza il weekend piatto: la libreria distanzia le candele per numero, non per orario
  const mostrate = useMemo(() => rimuoviTrattiPiatti(rimuoviMercatoChiuso(candele)), [candele]);
  mostrateRef.current = mostrate;

  // grafico creato una volta sola; segue il tema chiaro/scuro
  useEffect(() => {
    let vivo = true;
    let mo: MutationObserver | null = null;
    let ro: ResizeObserver | null = null;
    const token = (n: string, fb: string) => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
      return v ? `rgb(${v})` : fb;
    };
    import("lightweight-charts").then(({ createChart, CandlestickSeries, LineSeries, ColorType, CrosshairMode, createSeriesMarkers }) => {
      if (!vivo || !contenitore.current) return;
      const chart = createChart(contenitore.current, {
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
        // la scala include sempre entrata, stop, target (e il giorno prima, se attivo)
        autoscaleInfoProvider: (originale: () => any) => {
          const r = originale();
          if (r !== null && extraRef.current.length) {
            r.priceRange.minValue = Math.min(r.priceRange.minValue, ...extraRef.current);
            r.priceRange.maxValue = Math.max(r.priceRange.maxValue, ...extraRef.current);
          }
          return r;
        },
      });
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
      mo = new MutationObserver(colori);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      ro = new ResizeObserver(() => chart.applyOptions({}));
      ro.observe(contenitore.current);
      const lineeGiorni = new LineeGiorni();
      serie.attachPrimitive(lineeGiorni);
      lineeGiorniRef.current = lineeGiorni;
      chartRef.current = chart;
      serieRef.current = serie;
      markersRef.current = createSeriesMarkers(serie, []);
      overlayRef.current = new OverlayGrafico(serie, (colore, spessore = 1) =>
        chart.addSeries(LineSeries, { color: colore, lineWidth: spessore, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
      );
      setPronto(true);
    });
    return () => {
      vivo = false;
      mo?.disconnect();
      ro?.disconnect();
      chartRef.current?.remove();
      chartRef.current = null;
      serieRef.current = null;
      overlayRef.current = null;
      lineeGiorniRef.current = null;
    };
  }, []);

  // dati, righe di entrata/stop/target e marcatori: qui il grafico si adatta ai dati
  useEffect(() => {
    const serie = serieRef.current;
    if (!pronto || !serie) return;
    serie.setData(mostrate.map((c) => ({ time: c.t, open: c.o, high: c.h, low: c.l, close: c.c })));

    for (const l of lineeRef.current) serie.removePriceLine(l);
    lineeRef.current = [];
    const entrata = esito.entrataPrezzo ?? sig.entrata;
    if (entrata != null) {
      lineeRef.current.push(serie.createPriceLine({ price: entrata, color: "rgb(84 122 245)", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "Entrata" }));
    }
    lineeRef.current.push(serie.createPriceLine({ price: sig.stop_loss, color: "rgb(244 87 87)", lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: "Stop" }));
    sig.take_profits.forEach((tp, i) =>
      lineeRef.current.push(serie.createPriceLine({ price: tp, color: "rgb(34 197 130)", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `TP${i + 1}` }))
    );
    livelliBaseRef.current = [sig.stop_loss, ...sig.take_profits, ...(entrata != null ? [entrata] : [])];

    // marcatori: sulla candela che CONTIENE l'istante
    const trova = (t: number) => {
      let scelta = mostrate[0];
      for (const c of mostrate) {
        if (c.t <= t) scelta = c;
        else break;
      }
      return scelta;
    };
    const buy = sig.direzione === "buy";
    const m: any[] = [];
    if (mostrate.length) {
      const cm = trova(sig.ts);
      m.push({ time: cm.t, position: buy ? "belowBar" : "aboveBar", shape: buy ? "arrowUp" : "arrowDown", color: "#547AF5", text: "Segnale" });
      if (esito.entrataTempo != null && trova(esito.entrataTempo).t !== cm.t) {
        m.push({ time: trova(esito.entrataTempo).t, position: "inBar", shape: "circle", color: "#547AF5", text: "Entrata" });
      }
      if (esito.uscitaTempo != null) {
        const ok = esito.stato === "tp";
        m.push({
          time: trova(esito.uscitaTempo).t,
          position: ok === buy ? "aboveBar" : "belowBar",
          shape: "circle",
          color: ok ? "#22C582" : "#F45757",
          text: ok ? "TP1 ✓" : "Stop ✗",
        });
      }
      m.sort((a, b) => a.time - b.time);
    }
    markersRef.current?.setMarkers(m);
    chartRef.current?.timeScale().fitContent();
  }, [pronto, mostrate, sig, esito]);

  // indicatori e giorno prima: accenderli NON deve far perdere lo zoom
  useEffect(() => {
    const o = overlayRef.current;
    if (!pronto || !o) return;
    setNote(o.aggiorna(mostrate, overlay, { emaDailyDisponibile: false, suggerisciGranularita: true }));
    o.mostraGiornoPrima(giorniAttivi ? giornoPrima : null);
    extraRef.current = [...livelliBaseRef.current, ...(giorniAttivi && giornoPrima ? [giornoPrima.alto, giornoPrima.basso] : [])];
    chartRef.current?.priceScale("right").applyOptions({ autoScale: true });
    const rgb = getComputedStyle(document.documentElement).getPropertyValue("--muted").trim() || "138 147 166";
    lineeGiorniRef.current?.imposta(giorniAttivi ? giorniPerGrafico(mostrate, inizio) : [], rgb);
  }, [pronto, mostrate, sig, esito, overlay, giorniAttivi, giornoPrima, inizio]);

  // La rotella zooma il grafico solo a schermo intero: altrimenti scorre la pagina.
  useEffect(() => {
    chartRef.current?.applyOptions(opzioniInterazione(espanso));
  }, [espanso, pronto]);

  const voci: VoceMenu[] = [
    { id: "ema200", label: "EMA 200" },
    { id: "alligator", label: "Alligator" },
    { id: "bollinger", label: "Bollinger (20,2)" },
  ];

  return (
    <div
      className={espanso ? "fixed inset-0 z-50 flex flex-col bg-bg p-3" : ""}
      style={espanso ? { paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)", paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" } : undefined}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <MenuIndicatori
          voci={voci}
          overlay={overlay}
          onOverlay={setOverlay}
          giorniAttivi={giorniAttivi}
          onGiorni={onGiorni}
          inizio={inizio}
          onInizio={onInizio}
        />
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-line bg-surface2 p-0.5">
            {opzioniVista.map((x) => (
              <button
                key={x}
                onClick={() => onVista(x)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  vista === x ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"
                }`}
              >
                {ETICHETTA[x]}
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
      <div className={`relative w-full ${espanso ? "min-h-0 flex-1" : "h-72 sm:h-96"}`}>
        <div ref={contenitore} className="h-full w-full" />
      </div>
      {note.length > 0 && <p className="mt-2 text-xs text-muted">{note.join(" · ")}</p>}
    </div>
  );
}
