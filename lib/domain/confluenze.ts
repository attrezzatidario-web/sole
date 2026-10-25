import { statoSessione, RisultatoScenario } from "./scenario";

export type Esito = "si" | "no" | "nd";
export interface Elemento {
  id: string;
  titolo: string;
  esito: Esito;
  dettaglio: string;
}

interface Input {
  symbol: string;
  priceNow: number | null;
  changePct: number | null;
  segnale: { inputDirezionale: "buy" | "sell" | "nessuna_confluenza"; direzioneAlligator: string } | null;
  correlati: { statoCorrelazione: "confermata" | "divergente" | "non_disponibile" }[];
  keyLevels: { prezzo: number; timeframe: string; tipo: "resistenza" | "supporto" }[];
  news: { titolo: string; orario: string; importanza: string }[];
  scenario: RisultatoScenario | null;
  tecniciM30: {
    rsi: number | null;
    rsiDivergenza: "rialzista" | "ribassista" | "nessuna" | null;
    macdIstogramma: number | null;
  } | null;
  struttura: { trend: "rialzista" | "ribassista" | "laterale" } | null;
  emaCross: { trend: "rialzista" | "ribassista"; incrocio: "golden" | "death" | "nessuno" } | null;
}

const ASSET_SCENARIO = ["XAUUSD", "DXY", "DJI", "SPX", "NDQ"];
const FOREX = ["AUDJPY", "AUDUSD", "CADJPY", "EURUSD", "GBPJPY", "GBPUSD", "NZDJPY", "NZDUSD", "USDCAD", "USDCHF"];

const minutiRoma = (d: Date) => {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  return (Number(p.find((x) => x.type === "hour")!.value) % 24) * 60 + Number(p.find((x) => x.type === "minute")!.value);
};

/**
 * Elenco di elementi che, secondo la metodologia del corso, conviene controllare insieme.
 * È una lista informativa: non produce segnali di acquisto o vendita.
 */
export function calcolaConfluenze(i: Input, now: Date = new Date()): Elemento[] {
  const out: Elemento[] = [];

  // 1) Alligator + EMA200
  if (!i.segnale) {
    out.push({ id: "tecnico", titolo: "Alligator ed EMA200 concordano", esito: "nd", dettaglio: "Non ancora calcolati" });
  } else if (i.segnale.inputDirezionale === "nessuna_confluenza") {
    out.push({ id: "tecnico", titolo: "Alligator ed EMA200 concordano", esito: "no", dettaglio: "Nessuna confluenza (M30)" });
  } else {
    out.push({
      id: "tecnico",
      titolo: "Alligator ed EMA200 concordano",
      esito: "si",
      dettaglio: i.segnale.inputDirezionale === "buy" ? "Confluenza rialzista (M30)" : "Confluenza ribassista (M30)",
    });
  }

  // 2) Correlazioni
  const conf = i.correlati.filter((c) => c.statoCorrelazione === "confermata").length;
  const div = i.correlati.filter((c) => c.statoCorrelazione === "divergente").length;
  out.push({
    id: "correlazioni",
    titolo: "Correlazioni confermate",
    esito: conf + div === 0 ? "nd" : conf > div ? "si" : "no",
    dettaglio: conf + div === 0 ? "Nessun dato" : `${conf} confermate · ${div} in divergenza`,
  });

  // 3) Key level vicino (soglia più stretta per il forex)
  if (i.priceNow === null || i.keyLevels.length === 0) {
    out.push({ id: "livello", titolo: "Prezzo vicino a un key level", esito: "nd", dettaglio: "Nessun livello calcolato" });
  } else {
    const soglia = FOREX.includes(i.symbol) ? 0.1 : 0.25;
    const vicino = i.keyLevels
      .map((k) => ({ k, d: ((k.prezzo - i.priceNow!) / i.priceNow!) * 100 }))
      .sort((a, b) => Math.abs(a.d) - Math.abs(b.d))[0];
    const dentro = Math.abs(vicino.d) <= soglia;
    out.push({
      id: "livello",
      titolo: "Prezzo vicino a un key level",
      esito: dentro ? "si" : "no",
      dettaglio: `${vicino.k.tipo === "resistenza" ? "Resistenza" : "Supporto"} ${vicino.k.timeframe} a ${vicino.d > 0 ? "+" : ""}${vicino.d.toFixed(2).replace(".", ",")}%`,
    });
  }

  // 4) Nessuna notizia importante nelle prossime 2 ore
  const tra2h = now.getTime() + 2 * 3600 * 1000;
  const imminente = i.news.find((n) => n.importanza === "alta" && new Date(n.orario).getTime() <= tra2h);
  out.push({
    id: "notizie",
    titolo: "Nessuna notizia importante nelle prossime 2 ore",
    esito: imminente ? "no" : "si",
    dettaglio: imminente
      ? `${imminente.titolo} alle ${new Date(imminente.orario).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })}`
      : "Calendario libero",
  });

  // 5) Fase di alta liquidità (14:00 – 20:30 ora italiana, giorni feriali)
  const min = minutiRoma(now);
  const feriale = statoSessione(now) !== "chiuso" || min < 22 * 60;
  const giorno = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", weekday: "short" }).format(now);
  const weekend = giorno === "Sat" || giorno === "Sun";
  const liquida = !weekend && feriale && min >= 14 * 60 && min <= 20 * 60 + 30;
  out.push({
    id: "liquidita",
    titolo: "Fase di alta liquidità",
    esito: liquida ? "si" : "no",
    dettaglio: liquida ? "Wall Street aperta (14:00–20:30)" : "Fuori dalla fascia 14:00–20:30",
  });

  // 6) RSI: nessuna divergenza rilevata (M30)
  if (!i.tecniciM30 || i.tecniciM30.rsiDivergenza === null) {
    out.push({ id: "rsi", titolo: "Nessuna divergenza RSI", esito: "nd", dettaglio: "Non ancora calcolato" });
  } else if (i.tecniciM30.rsiDivergenza === "nessuna") {
    out.push({
      id: "rsi",
      titolo: "Nessuna divergenza RSI",
      esito: "si",
      dettaglio: `RSI ${i.tecniciM30.rsi?.toFixed(0) ?? "—"} (M30)`,
    });
  } else {
    out.push({
      id: "rsi",
      titolo: "Nessuna divergenza RSI",
      esito: "no",
      dettaglio: `Divergenza ${i.tecniciM30.rsiDivergenza} rilevata (M30)`,
    });
  }

  // 7) MACD conferma lo slancio (segno dell'istogramma coerente con l'Alligator)
  if (!i.tecniciM30 || i.tecniciM30.macdIstogramma === null || !i.segnale || i.segnale.direzioneAlligator === "laterale") {
    out.push({ id: "macd", titolo: "MACD conferma lo slancio", esito: "nd", dettaglio: "Non ancora calcolato" });
  } else {
    const coerente =
      (i.segnale.direzioneAlligator === "rialzista" && i.tecniciM30.macdIstogramma > 0) ||
      (i.segnale.direzioneAlligator === "ribassista" && i.tecniciM30.macdIstogramma < 0);
    out.push({
      id: "macd",
      titolo: "MACD conferma lo slancio",
      esito: coerente ? "si" : "no",
      dettaglio: `Istogramma ${i.tecniciM30.macdIstogramma > 0 ? "positivo" : "negativo"} (M30)`,
    });
  }

  // 8) Struttura di mercato (H4): concorde con l'Alligator (M30)
  if (!i.struttura || i.struttura.trend === "laterale" || !i.segnale || i.segnale.direzioneAlligator === "laterale") {
    out.push({
      id: "struttura",
      titolo: "Struttura di mercato concorde",
      esito: "nd",
      dettaglio: i.struttura?.trend === "laterale" ? "Struttura H4 laterale" : "Non ancora calcolata",
    });
  } else {
    out.push({
      id: "struttura",
      titolo: "Struttura di mercato concorde",
      esito: i.struttura.trend === i.segnale.direzioneAlligator ? "si" : "no",
      dettaglio: `Struttura H4 ${i.struttura.trend}`,
    });
  }

  // 9) Incrocio EMA 50/200 (Daily): bias di lungo periodo concorde con l'Alligator (M30)
  if (!i.emaCross || !i.segnale || i.segnale.direzioneAlligator === "laterale") {
    out.push({ id: "ema_cross", titolo: "Trend di lungo periodo concorde", esito: "nd", dettaglio: "Non ancora calcolato" });
  } else {
    const nota = i.emaCross.incrocio !== "nessuno" ? ` · incrocio ${i.emaCross.incrocio} recente` : "";
    out.push({
      id: "ema_cross",
      titolo: "Trend di lungo periodo concorde",
      esito: i.emaCross.trend === i.segnale.direzioneAlligator ? "si" : "no",
      dettaglio: `EMA 50/200 Daily ${i.emaCross.trend}${nota}`,
    });
  }

  // 6) Scenario più frequente (solo per oro, dollaro e indici)
  if (ASSET_SCENARIO.includes(i.symbol)) {
    const s = i.scenario;
    if (!s || s.stato === "in_attesa" || s.stato === "in_formazione" || s.id === "incerto") {
      out.push({ id: "scenario", titolo: "Scenario più frequente in corso", esito: "nd", dettaglio: s?.titolo ?? "Non ancora definito" });
    } else {
      out.push({
        id: "scenario",
        titolo: "Scenario più frequente in corso",
        esito: s.id === "A" ? "si" : "no",
        dettaglio: s.id === "A" || s.id === "B" || s.id === "C" ? `Scenario ${s.id}` : s.titolo,
      });
    }
  }
  return out;
}
