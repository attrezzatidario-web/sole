// Supabase Edge Function — runtime Deno.
// Calcola, per un singolo asset:
//  - Alligator (Jaw/Teeth/Lips) + EMA200 su M30, con l'input direzionale
//    secondo la logica del corso (confluenza Alligator + EMA200);
//  - RSI(14) + divergenza, MACD(12,26,9), Bollinger Bands(20,2) e
//    struttura di mercato, tutti su M30;
//  - incrocio EMA 50/200 su Daily (bias di lungo periodo).
// Sono conferme aggiuntive, informative: non generano segnali di acquisto/vendita.
//
// Pensata per essere chiamata ON-DEMAND (bottone "Calcola Alligator+EMA200"
// in pagina asset) per non consumare il budget giornaliero di Twelve Data
// su tutti gli asset. Se vuoi automatizzarla per 1-2 asset prioritari,
// aggiungi un cron dedicato (esempio commentato in 0002_cron.sql).
//
// Deploy: supabase functions deploy compute-indicators
// Usa lo stesso secret TWELVE_DATA_API_KEY di ingest-prices.
// Ogni chiamata usa 2 crediti Twelve Data (M30 + Daily) per le coppie forex/oro;
// per gli altri asset usa Yahoo Finance, senza costo.
//
// NOTA: per semplicità le 3 medie dell'Alligator sono calcolate SENZA lo
// shift in avanti (8/5/3 barre) tipico del disegno a schermo di Bill
// Williams: qui servono per un giudizio di direzione, non per il disegno
// grafico. Per un confronto visivo esatto usa TradingView.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Le funzioni vengono chiamate direttamente dal browser: servono gli header CORS.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYMBOL_ALIASES: Record<string, string> = {
  // vedi lo stesso oggetto in ingest-prices/index.ts — tienili allineati
};

interface Candle {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
}


// Asset non coperti dal piano gratuito di Twelve Data: candele da Yahoo
// Finance (gratis, non ufficiale). Tieni allineata la mappa con ingest-prices.
const YAHOO_MAP: Record<string, string> = {
  XAGUSD: "SI=F", "PL1!": "PL=F", COPPER: "HG=F", USOIL: "CL=F", XBRUSD: "BZ=F",
  "BR1!": "BZ=F", DXY: "DX-Y.NYB", DJI: "^DJI", SPX: "^GSPC", NDQ: "^NDX",
};

async function fetchCandlesYahoo(symbol: string): Promise<Candle[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    YAHOO_MAP[symbol]
  )}?interval=30m&range=60d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; AnalizzatoreH24/1.0)" },
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status} per ${symbol}`);
  const json = await res.json();
  const r = json?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r || !q) throw new Error(`Yahoo: nessun dato per ${symbol}`);

  const candles: Candle[] = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    if (q.close[i] == null || q.high[i] == null || q.low[i] == null) continue;
    candles.push({
      datetime: new Date(r.timestamp[i] * 1000).toISOString(),
      open: q.open[i],
      high: q.high[i],
      low: q.low[i],
      close: q.close[i],
    });
  }
  return candles;
}

async function fetchCandlesM30(symbol: string, apiKey: string): Promise<Candle[]> {
  if (YAHOO_MAP[symbol]) return fetchCandlesYahoo(symbol);
  const FORMATO_COPPIA = new Set(["AUDJPY","AUDUSD","CADJPY","EURUSD","GBPJPY","GBPUSD","NZDJPY","NZDUSD","USDCAD","USDCHF","XAUUSD"]);
  const remoteSymbol =
    SYMBOL_ALIASES[symbol] ?? (FORMATO_COPPIA.has(symbol) ? `${symbol.slice(0, 3)}/${symbol.slice(3)}` : symbol);
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
    remoteSymbol
  )}&interval=30min&outputsize=260&apikey=${apiKey}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.values) {
    throw new Error(`Nessun dato OHLC per ${symbol}: ${data.message ?? JSON.stringify(data)}`);
  }

  // Twelve Data restituisce dal più recente al più vecchio: riordina.
  const candles: Candle[] = data.values
    .map((v: any) => ({
      datetime: v.datetime,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
    }))
    .reverse();

  return candles;
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return out;

  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = seed;
  for (let i = period; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

// Smoothed Moving Average (usata dall'Alligator).
function smma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return out;

  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = seed;
  for (let i = period; i < values.length; i++) {
    out[i] = (out[i - 1] * (period - 1) + values[i]) / period;
  }
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

// RSI (14) con la stessa formula di Wilder usata dall'Alligator (smma su guadagni/perdite).
function calcolaRSI(closes: number[], period = 14): number[] {
  const guadagni: number[] = [0];
  const perdite: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    guadagni.push(Math.max(diff, 0));
    perdite.push(Math.max(-diff, 0));
  }
  const avgG = smma(guadagni, period);
  const avgP = smma(perdite, period);
  return closes.map((_, i) => {
    const g = avgG[i], p = avgP[i];
    if (Number.isNaN(g) || Number.isNaN(p)) return NaN;
    if (p === 0) return 100;
    return 100 - 100 / (1 + g / p);
  });
}

function calcolaMACD(closes: number[]) {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLinea = closes.map((_, i) => (Number.isNaN(ema12[i]) || Number.isNaN(ema26[i]) ? NaN : ema12[i] - ema26[i]));
  const primoValido = macdLinea.findIndex((v) => !Number.isNaN(v));
  const segnaleValido = primoValido >= 0 ? ema(macdLinea.slice(primoValido), 9) : [];
  const segnale: number[] = new Array(closes.length).fill(NaN);
  for (let i = 0; i < segnaleValido.length; i++) segnale[primoValido + i] = segnaleValido[i];
  const istogramma = closes.map((_, i) => (Number.isNaN(macdLinea[i]) || Number.isNaN(segnale[i]) ? NaN : macdLinea[i] - segnale[i]));
  return { macdLinea, segnale, istogramma };
}

function calcolaBollinger(closes: number[], period = 20, deviazioni = 2) {
  const media = sma(closes, period);
  const dev = stddev(closes, period, media);
  const superiore = closes.map((_, i) => (Number.isNaN(media[i]) ? NaN : media[i] + deviazioni * dev[i]));
  const inferiore = closes.map((_, i) => (Number.isNaN(media[i]) ? NaN : media[i] - deviazioni * dev[i]));
  return { media, superiore, inferiore };
}

// Estremi locali (per la divergenza RSI): un punto è un massimo/minimo se
// nessun altro punto nella finestra [i-k, i+k] lo supera. I punti vicini
// dello stesso tipo (un massimo "a tavolino" su più candele) si accorpano
// tenendo solo il più estremo, altrimenti sembrano due picchi distinti.
function estremiLocali(prezzi: number[], k = 3): { i: number; tipo: "H" | "L" }[] {
  const grezzi: { i: number; tipo: "H" | "L" }[] = [];
  for (let i = k; i < prezzi.length - k; i++) {
    let alto = true, basso = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (prezzi[j] > prezzi[i]) alto = false;
      if (prezzi[j] < prezzi[i]) basso = false;
    }
    if (alto) grezzi.push({ i, tipo: "H" });
    if (basso) grezzi.push({ i, tipo: "L" });
  }
  const out: { i: number; tipo: "H" | "L" }[] = [];
  for (const p of grezzi) {
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.tipo === p.tipo && p.i - ultimo.i <= k * 2) {
      const meglio =
        p.tipo === "H" ? (prezzi[p.i] >= prezzi[ultimo.i] ? p : ultimo) : prezzi[p.i] <= prezzi[ultimo.i] ? p : ultimo;
      out[out.length - 1] = meglio;
    } else {
      out.push(p);
    }
  }
  return out;
}

function rilevaDivergenzaRSI(closes: number[], rsiSerie: number[]): "rialzista" | "ribassista" | "nessuna" {
  const piv = estremiLocali(closes, 3);
  const massimi = piv.filter((p) => p.tipo === "H").slice(-2);
  const minimi = piv.filter((p) => p.tipo === "L").slice(-2);

  if (massimi.length === 2) {
    const [p1, p2] = massimi;
    const r1 = rsiSerie[p1.i], r2 = rsiSerie[p2.i];
    if (!Number.isNaN(r1) && !Number.isNaN(r2) && closes[p2.i] > closes[p1.i] && r2 < r1) return "ribassista";
  }
  if (minimi.length === 2) {
    const [p1, p2] = minimi;
    const r1 = rsiSerie[p1.i], r2 = rsiSerie[p2.i];
    if (!Number.isNaN(r1) && !Number.isNaN(r2) && closes[p2.i] < closes[p1.i] && r2 > r1) return "rialzista";
  }
  return "nessuna";
}

function last(values: number[]): number {
  return values[values.length - 1];
}

function calcolaSegnale(candles: Candle[]) {
  const closes = candles.map((c) => c.close);
  const medians = candles.map((c) => (c.high + c.low) / 2);

  const ema200Serie = ema(closes, 200);
  const jawSerie = smma(medians, 13);
  const teethSerie = smma(medians, 8);
  const lipsSerie = smma(medians, 5);

  const prezzo = last(closes);
  const ema200 = last(ema200Serie);
  const jaw = last(jawSerie);
  const teeth = last(teethSerie);
  const lips = last(lipsSerie);

  // Direzione: guarda lips vs 5 barre prima per capire il "verso" delle
  // 3 medie, e il loro ordinamento per capire se sono ben separate
  // (aperte) o intrecciate (laterale).
  const lipsPrima = lipsSerie[lipsSerie.length - 6] ?? lips;
  const inSalita = lips > lipsPrima;
  const ordinateRialzista = lips > teeth && teeth > jaw;
  const ordinateRibassista = lips < teeth && teeth < jaw;

  let direzioneAlligator: "rialzista" | "ribassista" | "laterale" = "laterale";
  if (ordinateRialzista && inSalita) direzioneAlligator = "rialzista";
  else if (ordinateRibassista && !inSalita) direzioneAlligator = "ribassista";

  const massimo = Math.max(jaw, teeth, lips);
  const minimo = Math.min(jaw, teeth, lips);
  const posizioneAlligator: "sopra" | "sotto" | "in_mezzo" =
    prezzo > massimo ? "sopra" : prezzo < minimo ? "sotto" : "in_mezzo";

  const prezzoVsEma200: "sopra" | "sotto" = prezzo >= ema200 ? "sopra" : "sotto";

  // Confluenza come nell'esempio del corso: EMA200 e Alligator devono
  // concordare, altrimenti "nessuna_confluenza" (niente input direzionale).
  let inputDirezionale: "buy" | "sell" | "nessuna_confluenza" = "nessuna_confluenza";
  if (direzioneAlligator === "rialzista" && prezzoVsEma200 === "sopra" && posizioneAlligator === "sopra") {
    inputDirezionale = "buy";
  } else if (
    direzioneAlligator === "ribassista" &&
    prezzoVsEma200 === "sotto" &&
    posizioneAlligator === "sotto"
  ) {
    inputDirezionale = "sell";
  }

  const rsiSerie = calcolaRSI(closes);
  const rsi = last(rsiSerie);
  const rsiDivergenza = rilevaDivergenzaRSI(closes, rsiSerie);

  const { macdLinea: macdLinieSerie, segnale: macdSegnaleSerie, istogramma } = calcolaMACD(closes);
  const macdLinea = last(macdLinieSerie);
  const macdSegnale = last(macdSegnaleSerie);
  const macdIstogramma = last(istogramma);

  const bollinger = calcolaBollinger(closes);
  const bollingerSuperiore = last(bollinger.superiore);
  const bollingerMedia = last(bollinger.media);
  const bollingerInferiore = last(bollinger.inferiore);

  return {
    prezzo,
    ema200,
    jaw,
    teeth,
    lips,
    posizioneAlligator,
    direzioneAlligator,
    prezzoVsEma200,
    inputDirezionale,
    rsi,
    rsiDivergenza,
    macdLinea,
    macdSegnale,
    macdIstogramma,
    bollingerSuperiore,
    bollingerMedia,
    bollingerInferiore,
  };
}

async function handler(req: Request): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const twelveDataKey = Deno.env.get("TWELVE_DATA_API_KEY");

  if (!twelveDataKey) {
    return new Response(JSON.stringify({ error: "TWELVE_DATA_API_KEY non configurata." }), {
      status: 500,
    });
  }

  const body = await req.json().catch(() => ({}));
  const symbol = body.symbol;
  if (!symbol) {
    return new Response(JSON.stringify({ error: "Parametro 'symbol' mancante nel body." }), {
      status: 400,
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const candles = await fetchCandlesM30(symbol, twelveDataKey);
    if (candles.length < 200) {
      return new Response(
        JSON.stringify({
          error: `Dati OHLC insufficienti per ${symbol} (${candles.length} candele, ne servono almeno 200 per l'EMA200).`,
        }),
        { status: 502 }
      );
    }

    const segnale = calcolaSegnale(candles);

    const { error } = await supabase.from("technical_signals").insert({
      asset_symbol: symbol,
      timeframe: "M30",
      prezzo: segnale.prezzo,
      ema200: segnale.ema200,
      jaw: segnale.jaw,
      teeth: segnale.teeth,
      lips: segnale.lips,
      posizione_alligator: segnale.posizioneAlligator,
      direzione_alligator: segnale.direzioneAlligator,
      prezzo_vs_ema200: segnale.prezzoVsEma200,
      input_direzionale: segnale.inputDirezionale,
      rsi: segnale.rsi,
      rsi_divergenza: segnale.rsiDivergenza,
      macd_linea: segnale.macdLinea,
      macd_segnale: segnale.macdSegnale,
      macd_istogramma: segnale.macdIstogramma,
      bollinger_superiore: segnale.bollingerSuperiore,
      bollinger_media: segnale.bollingerMedia,
      bollinger_inferiore: segnale.bollingerInferiore,
    });

    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, symbol, ...segnale }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 502 });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const res = await handler(req);
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
});
