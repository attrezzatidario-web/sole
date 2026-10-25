// Calcoli tecnici lato client, sugli stessi dati OHLC già caricati nel
// grafico a candele — stesse formule, collaudate, usate lato server in
// compute-indicators/compute-key-levels. Tienile allineate.

export interface CandelaGrafico {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return out;
  out[period - 1] = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) out[i] = values[i] * k + out[i - 1] * (1 - k);
  return out;
}

export function smma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return out;
  out[period - 1] = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) out[i] = (out[i - 1] * (period - 1) + values[i]) / period;
  return out;
}

function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += values[j];
    out[i] = s / period;
  }
  return out;
}

function stddev(values: number[], period: number, medie: number[]): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += (values[j] - medie[i]) ** 2;
    out[i] = Math.sqrt(s / period);
  }
  return out;
}

/** Serie {time, value} pronta per una LineSeries di lightweight-charts (salta i NaN iniziali). */
function perLinea(tempi: number[], valori: number[]) {
  const out: { time: number; value: number }[] = [];
  for (let i = 0; i < valori.length; i++) if (!Number.isNaN(valori[i])) out.push({ time: tempi[i], value: valori[i] });
  return out;
}

export function serieEma200(candele: CandelaGrafico[]) {
  return perLinea(candele.map((c) => c.t), ema(candele.map((c) => c.c), 200));
}

export function serieAlligator(candele: CandelaGrafico[]) {
  const mediani = candele.map((c) => (c.h + c.l) / 2);
  const tempi = candele.map((c) => c.t);
  return {
    jaw: perLinea(tempi, smma(mediani, 13)),
    teeth: perLinea(tempi, smma(mediani, 8)),
    lips: perLinea(tempi, smma(mediani, 5)),
  };
}

export function serieBollinger(candele: CandelaGrafico[], period = 20, deviazioni = 2) {
  const closes = candele.map((c) => c.c);
  const tempi = candele.map((c) => c.t);
  const media = sma(closes, period);
  const dev = stddev(closes, period, media);
  const superiore = closes.map((_, i) => (Number.isNaN(media[i]) ? NaN : media[i] + deviazioni * dev[i]));
  const inferiore = closes.map((_, i) => (Number.isNaN(media[i]) ? NaN : media[i] - deviazioni * dev[i]));
  return { superiore: perLinea(tempi, superiore), media: perLinea(tempi, media), inferiore: perLinea(tempi, inferiore) };
}

export function serieEmaDoppia(candele: CandelaGrafico[], p1: number, p2: number) {
  const tempi = candele.map((c) => c.t);
  const closes = candele.map((c) => c.c);
  return { e1: perLinea(tempi, ema(closes, p1)), e2: perLinea(tempi, ema(closes, p2)) };
}

// ---------------- Giorni (separatori + massimo/minimo del giorno prima) ----------------

export interface GruppoGiorno {
  giorno: string; // AAAA-MM-GG (UTC)
  primaCandela: number; // timestamp della prima candela del giorno
  candele: CandelaGrafico[];
}

export function raggruppaPerGiorno(candele: CandelaGrafico[]): GruppoGiorno[] {
  const gruppi: GruppoGiorno[] = [];
  let corrente: GruppoGiorno | null = null;
  for (const c of candele) {
    const giorno = new Date(c.t * 1000).toISOString().slice(0, 10);
    if (!corrente || corrente.giorno !== giorno) {
      corrente = { giorno, primaCandela: c.t, candele: [] };
      gruppi.push(corrente);
    }
    corrente.candele.push(c);
  }
  return gruppi;
}

/** Il penultimo giorno presente nei dati: il "giorno prima" rispetto all'ultimo (anche se parziale). */
export function trovaAltoBassoGiornoPrecedente(candele: CandelaGrafico[]): { alto: number; basso: number } | null {
  const gruppi = raggruppaPerGiorno(candele);
  if (gruppi.length < 2) return null;
  const prec = gruppi[gruppi.length - 2];
  return {
    alto: Math.max(...prec.candele.map((c) => c.h)),
    basso: Math.min(...prec.candele.map((c) => c.l)),
  };
}


/**
 * Toglie le candele "morte" a mercato chiuso (weekend, festivi): identiche alla precedente, oppure
 * senza escursione (massimo = minimo) subito dopo un'altra senza escursione. Così i tratti piatti,
 * anche se "tremano" di un soffio, non diventano uno spazio vuoto nel mezzo del grafico.
 */
export function rimuoviTrattiPiatti<T extends { o: number; h: number; l: number; c: number }>(candele: T[]): T[] {
  const out: T[] = [];
  for (const c of candele) {
    const prec = out[out.length - 1];
    const identica = prec && prec.o === c.o && prec.h === c.h && prec.l === c.l && prec.c === c.c;
    const duePiatte = prec && prec.h === prec.l && c.h === c.l;
    if (!identica && !duePiatte) out.push(c);
  }
  return out;
}
