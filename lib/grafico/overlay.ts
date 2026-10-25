import {
  CandelaGrafico,
  serieAlligator,
  serieBollinger,
  serieEma200,
  serieEmaDoppia,
} from "@/lib/domain/indicatoriGrafico";
import type { GiornoPrima } from "@/lib/domain/giorni";

export interface OpzioniOverlay {
  ema200: boolean;
  alligator: boolean;
  bollinger: boolean;
  emaDaily: boolean;
  livelli: boolean;
}
export const OVERLAY_VUOTO: OpzioniOverlay = { ema200: false, alligator: false, bollinger: false, emaDaily: false, livelli: false };

export interface LivelloGrafico {
  prezzo: number;
  tipo: "resistenza" | "supporto";
  timeframe: string;
}

const COLORE = {
  ema200: "#C98A3E",
  jaw: "#5B8DEF",
  teeth: "#E8604C",
  lips: "#4CAF50",
  bollinger: "#8A93A6",
  e50: "#9B6BD6",
  e200d: "#D64BA0",
};
const ROSSO = "rgb(244 87 87)";
const VERDE = "rgb(34 197 130)";

/**
 * Gestisce, sopra a un grafico a candele di lightweight-charts, gli indicatori (EMA 200, Alligator,
 * Bollinger, EMA 50/200 daily), i key level e il massimo/minimo del giorno prima.
 * Non conosce React: lo usano sia il grafico dei timeframe sia quello dell'analisi di un segnale.
 */
export class OverlayGrafico {
  private l: Record<"ema200" | "jaw" | "teeth" | "lips" | "bsup" | "bmed" | "binf" | "e50" | "e200d", any>;
  private lineeLivelli: any[] = [];
  private lineeGiorno: any[] = [];

  constructor(private serie: any, nuovaLinea: (colore: string, spessore?: 1 | 2) => any) {
    this.l = {
      ema200: nuovaLinea(COLORE.ema200, 2),
      jaw: nuovaLinea(COLORE.jaw),
      teeth: nuovaLinea(COLORE.teeth),
      lips: nuovaLinea(COLORE.lips),
      bsup: nuovaLinea(COLORE.bollinger),
      bmed: nuovaLinea(COLORE.bollinger),
      binf: nuovaLinea(COLORE.bollinger),
      e50: nuovaLinea(COLORE.e50, 2),
      e200d: nuovaLinea(COLORE.e200d, 2),
    };
    for (const s of Object.values(this.l)) s.applyOptions({ visible: false });
  }

  private mostra(nomi: (keyof OverlayGrafico["l"])[], attivo: boolean, dati: any[][]) {
    nomi.forEach((n, i) => {
      this.l[n].applyOptions({ visible: attivo });
      this.l[n].setData(attivo ? dati[i] : []);
    });
  }

  /**
   * Applica le scelte. Ritorna le note per gli indicatori che non si possono calcolare
   * (per esempio l'EMA 200 con meno di 200 candele).
   */
  aggiorna(
    candele: CandelaGrafico[],
    o: OpzioniOverlay,
    extra: { emaDailyDisponibile: boolean; livelli?: LivelloGrafico[]; suggerisciGranularita?: boolean }
  ): string[] {
    const note: string[] = [];
    const n = candele.length;
    const servono = (attivo: boolean, minimo: number, nome: string) => {
      if (attivo && n < minimo) note.push(`${nome}: servono almeno ${minimo} candele, qui ce ne sono ${n}${extra.suggerisciGranularita ? " (prova una granularità più fine)" : ""}`);
    };
    servono(o.ema200, 200, "EMA 200");
    servono(o.alligator, 13, "Alligator");
    servono(o.bollinger, 20, "Bollinger");
    servono(o.emaDaily && extra.emaDailyDisponibile, 200, "EMA 50/200");

    this.mostra(["ema200"], o.ema200, [o.ema200 ? serieEma200(candele) : []]);
    const a = o.alligator ? serieAlligator(candele) : { jaw: [], teeth: [], lips: [] };
    this.mostra(["jaw", "teeth", "lips"], o.alligator, [a.jaw, a.teeth, a.lips]);
    const b = o.bollinger ? serieBollinger(candele) : { superiore: [], media: [], inferiore: [] };
    this.mostra(["bsup", "bmed", "binf"], o.bollinger, [b.superiore, b.media, b.inferiore]);
    const d = o.emaDaily && extra.emaDailyDisponibile ? serieEmaDoppia(candele, 50, 200) : { e1: [], e2: [] };
    this.mostra(["e50", "e200d"], o.emaDaily && extra.emaDailyDisponibile, [d.e1, d.e2]);

    for (const x of this.lineeLivelli) this.serie.removePriceLine(x);
    this.lineeLivelli = [];
    if (o.livelli && extra.livelli) {
      for (const lv of extra.livelli) {
        this.lineeLivelli.push(
          this.serie.createPriceLine({
            price: lv.prezzo,
            color: lv.tipo === "resistenza" ? ROSSO : VERDE,
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: `${lv.tipo === "resistenza" ? "R" : "S"} ${lv.timeframe}`,
          })
        );
      }
    }
    return note;
  }

  /** Massimo e minimo del giorno prima: sempre UNA sola coppia di righe (le vecchie vengono tolte). */
  mostraGiornoPrima(g: Pick<GiornoPrima, "alto" | "basso"> | null) {
    for (const x of this.lineeGiorno) this.serie.removePriceLine(x);
    this.lineeGiorno = [];
    if (!g) return;
    this.lineeGiorno.push(
      this.serie.createPriceLine({ price: g.alto, color: ROSSO, lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: "Max giorno prima" }),
      this.serie.createPriceLine({ price: g.basso, color: VERDE, lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: "Min giorno prima" })
    );
  }

  get righeGiornoPrima(): number {
    return this.lineeGiorno.length;
  }
}
