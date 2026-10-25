// Supabase Edge Function — runtime Deno.
// Calcola in automatico, per un asset, gli strumenti del corso basati sui prezzi storici:
//  1. KEY LEVEL: prezzi che hanno fatto più volte da resistenza e da supporto
//     (contano i tocchi, ombre incluse). Daily, H4 e H1.
//  2. FIBONACCI (Daily e H4): ritracciamenti delle ultime 3 gamme di mercato; le zone dove
//     si sovrappongono più livelli (o un key level) sono segnate come "confluenza"
//     (è il "scalare massimi/minimi" del corso).
//  3. PITCHFORK (H1): forcone da 3 pivot (2 massimi e 1 minimo = ribassista,
//     1 massimo e 2 minimi = rialzista) con mediana e linee parallele.
//
// Metodo: trova i massimi/minimi locali (swing) di ogni timeframe, li
// raggruppa quando sono vicini (tolleranza = frazione dell'ATR) e tiene i
// gruppi con almeno 3 tocchi. Non usa notizie né opinioni trovate in rete:
// solo i prezzi storici, quindi il risultato è ripetibile e verificabile.
//
// Modi d'uso:
//   {"symbol": "XAUUSD"}          → calcola un asset (bottone nel sito)
//   {"modalita": "rotazione"}     → cron orario: un asset per ora (ogni asset ~1 volta al giorno)
//
// Deploy: nome funzione compute-key-levels. Usa TWELVE_DATA_API_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WATCHLISTS: Record<string, string[]> = {
  Forex: ["AUDJPY","AUDUSD","CADJPY","EURUSD","GBPJPY","GBPUSD","NZDJPY","NZDUSD","USDCAD","USDCHF","XAUUSD"],
  "Indicatori Oro": ["NZDUSD","AUDUSD","EURUSD","XAUUSD","DXY","XAGUSD"],
  "Indici Anti USD": ["DJI","SPX","NDQ"],
  Petrolio: ["USOIL","XBRUSD","BR1!","CADJPY","GBPUSD","GBPJPY","USDCAD"],
  Metalli: ["PL1!","COPPER","XAUUSD","XAGUSD"],
};

// Stessa mappa di ingest-prices: asset non coperti da Twelve Data → Yahoo Finance.
const YAHOO_MAP: Record<string, string> = {
  XAGUSD: "SI=F", "PL1!": "PL=F", COPPER: "HG=F", USOIL: "CL=F", XBRUSD: "BZ=F",
  "BR1!": "BZ=F", DXY: "DX-Y.NYB", DJI: "^DJI", SPX: "^GSPC", NDQ: "^NDX",
};
const FORMATO_COPPIA = new Set([
  "AUDJPY","AUDUSD","CADJPY","EURUSD","GBPJPY","GBPUSD","NZDJPY","NZDUSD",
  "USDCAD","USDCHF","XAUUSD",
]);

interface Candle {
  t: number; // secondi unix
  high: number;
  low: number;
  close: number;
}

type Timeframe = "Daily" | "H4" | "H1";
const TIMEFRAMES: Timeframe[] = ["Daily", "H4", "H1"];

const UA = { "User-Agent": "Mozilla/5.0 (compatible; AnalizzatoreH24/1.0)" };

// ---------------- download candele ----------------

async function candeleYahoo(symbol: string, tf: Timeframe): Promise<Candle[]> {
  const ySym = encodeURIComponent(YAHOO_MAP[symbol]);
  const params = tf === "Daily" ? "interval=1d&range=2y" : "interval=1h&range=60d";
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ySym}?${params}`, {
    headers: UA,
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const r = (await res.json())?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r || !q) throw new Error("Yahoo: nessun dato");
  const out: Candle[] = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    if (q.high[i] == null || q.low[i] == null || q.close[i] == null) continue;
    out.push({ t: r.timestamp[i], high: q.high[i], low: q.low[i], close: q.close[i] });
  }
  return tf === "H4" ? aggrega4h(out) : out;
}

// Yahoo non ha H4: si costruisce dalle candele H1 (blocchi di 4 ore UTC).
function aggrega4h(h1: Candle[]): Candle[] {
  const blocchi = new Map<number, Candle>();
  for (const c of h1) {
    const k = Math.floor(c.t / 14400) * 14400;
    const b = blocchi.get(k);
    if (!b) blocchi.set(k, { t: k, high: c.high, low: c.low, close: c.close });
    else {
      b.high = Math.max(b.high, c.high);
      b.low = Math.min(b.low, c.low);
      b.close = c.close;
    }
  }
  return [...blocchi.values()].sort((a, b) => a.t - b.t);
}

async function candeleTwelve(symbol: string, tf: Timeframe, apiKey: string): Promise<Candle[]> {
  const sym = FORMATO_COPPIA.has(symbol) ? `${symbol.slice(0, 3)}/${symbol.slice(3)}` : symbol;
  const interval = tf === "Daily" ? "1day" : tf === "H4" ? "4h" : "1h";
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
    sym
  )}&interval=${interval}&outputsize=500&apikey=${apiKey}`;
  const data = await (await fetch(url)).json();
  if (!data.values) throw new Error(data.message ?? "Twelve Data: nessun dato");
  return data.values
    .map((v: any) => ({
      t: Math.floor(new Date(v.datetime.replace(" ", "T") + "Z").getTime() / 1000),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
    }))
    .reverse();
}

// ---------------- calcolo livelli ----------------

function atr(c: Candle[], n = 14): number {
  let somma = 0;
  let cnt = 0;
  for (let i = Math.max(1, c.length - n); i < c.length; i++) {
    const tr = Math.max(
      c[i].high - c[i].low,
      Math.abs(c[i].high - c[i - 1].close),
      Math.abs(c[i].low - c[i - 1].close)
    );
    somma += tr;
    cnt++;
  }
  return cnt ? somma / cnt : 0;
}

// Massimi e minimi locali (le ombre contano, come da corso).
function swing(c: Candle[], k = 3): number[] {
  const out: number[] = [];
  for (let i = k; i < c.length - k; i++) {
    let alto = true;
    let basso = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue;
      if (c[j].high > c[i].high) alto = false;
      if (c[j].low < c[i].low) basso = false;
    }
    if (alto) out.push(c[i].high);
    if (basso) out.push(c[i].low);
  }
  return out;
}

function raggruppa(prezzi: number[], tol: number): { prezzo: number; tocchi: number }[] {
  const ord = [...prezzi].sort((a, b) => a - b);
  const gruppi: number[][] = [];
  for (const p of ord) {
    const g = gruppi[gruppi.length - 1];
    const media = g ? g.reduce((a, b) => a + b, 0) / g.length : 0;
    if (g && p - media <= tol) g.push(p);
    else gruppi.push([p]);
  }
  return gruppi.map((g) => ({
    prezzo: g.reduce((a, b) => a + b, 0) / g.length,
    tocchi: g.length,
  }));
}

const MIN_TOCCHI = 3;
const PER_LATO = 3; // max supporti e max resistenze per timeframe

function livelliPerTimeframe(candele: Candle[], prezzoAttuale: number) {
  if (candele.length < 60) return [];
  const tol = atr(candele) * 0.35;
  if (!tol) return [];
  const forti = raggruppa(swing(candele), tol).filter((g) => g.tocchi >= MIN_TOCCHI);

  const sotto = forti
    .filter((g) => g.prezzo < prezzoAttuale)
    .sort((a, b) => b.prezzo - a.prezzo)
    .slice(0, PER_LATO)
    .map((g) => ({ ...g, tipo: "supporto" as const }));
  const sopra = forti
    .filter((g) => g.prezzo >= prezzoAttuale)
    .sort((a, b) => a.prezzo - b.prezzo)
    .slice(0, PER_LATO)
    .map((g) => ({ ...g, tipo: "resistenza" as const }));
  return [...sotto, ...sopra];
}


// ==== INIZIO CALCOLI AVANZATI ====
interface Pivot {
  i: number;
  t: number;
  p: number;
  tipo: "H" | "L";
}

/** ZigZag: pivot alternati (massimo/minimo) con inversione di almeno `soglia`. */
function zigzag(c: Candle[], soglia: number): { confermati: Pivot[]; provvisorio: Pivot | null } {
  const out: Pivot[] = [];
  if (c.length < 2 || !(soglia > 0)) return { confermati: out, provvisorio: null };
  let trend = 0;
  let hi = { i: 0, p: c[0].high };
  let lo = { i: 0, p: c[0].low };
  const H = (x: { i: number; p: number }): Pivot => ({ i: x.i, t: c[x.i].t, p: x.p, tipo: "H" });
  const L = (x: { i: number; p: number }): Pivot => ({ i: x.i, t: c[x.i].t, p: x.p, tipo: "L" });

  for (let i = 1; i < c.length; i++) {
    const k = c[i];
    if (trend === 0) {
      if (k.high > hi.p) hi = { i, p: k.high };
      if (k.low < lo.p) lo = { i, p: k.low };
      if (hi.p - lo.p >= soglia) {
        if (hi.i > lo.i) {
          out.push(L(lo));
          trend = 1;
        } else {
          out.push(H(hi));
          trend = -1;
        }
      }
    } else if (trend === 1) {
      if (k.high > hi.p) hi = { i, p: k.high };
      if (hi.p - k.low >= soglia) {
        out.push(H(hi));
        trend = -1;
        lo = { i, p: k.low };
      }
    } else {
      if (k.low < lo.p) lo = { i, p: k.low };
      if (k.high - lo.p >= soglia) {
        out.push(L(lo));
        trend = 1;
        hi = { i, p: k.high };
      }
    }
  }
  const provvisorio = trend === 1 ? H(hi) : trend === -1 ? L(lo) : null;
  return { confermati: out, provvisorio };
}

const RAPPORTI_FIB = [0.236, 0.382, 0.5, 0.618, 0.786];

interface ZonaFib {
  prezzo: number;
  fonti: string[];
  forza: number;
}

/**
 * Fibonacci sulle ultime 3 gamme. Livelli della gamma più recente + zone di confluenza
 * (livelli di gamme diverse, o di un key level, vicini tra loro).
 */
function calcolaFibonacci(candele: Candle[], keyLevels: number[], prezzoAttuale: number) {
  const a = atr(candele);
  const { confermati, provvisorio } = zigzag(candele, a * 2.5);
  const pivot = provvisorio ? [...confermati, provvisorio] : confermati;
  if (pivot.length < 3) return null;

  const gambe = [];
  for (let n = pivot.length - 1; n >= 1 && gambe.length < 3; n--) {
    gambe.push({ da: pivot[n - 1], a: pivot[n] });
  }
  const recente = gambe[0];
  const rialzista = recente.a.p > recente.da.p;
  const ampiezza = Math.abs(recente.a.p - recente.da.p);

  const livelli = RAPPORTI_FIB.map((r) => ({
    rapporto: r,
    prezzo: rialzista ? recente.a.p - r * ampiezza : recente.a.p + r * ampiezza,
  }));

  // punti candidati per le zone di confluenza
  const punti: { prezzo: number; fonte: string }[] = [];
  gambe.forEach((g, idx) => {
    const amp = Math.abs(g.a.p - g.da.p);
    const su = g.a.p > g.da.p;
    for (const r of RAPPORTI_FIB) {
      punti.push({
        prezzo: su ? g.a.p - r * amp : g.a.p + r * amp,
        fonte: `${idx === 0 ? "gamba attuale" : `gamba -${idx}`} ${(r * 100).toFixed(1).replace(".", ",")}%`,
      });
    }
  });
  for (const k of keyLevels) punti.push({ prezzo: k, fonte: "key level" });

  const tol = a * 0.35;
  const ord = [...punti].sort((x, y) => x.prezzo - y.prezzo);
  const gruppi: { prezzo: number; fonte: string }[][] = [];
  for (const pt of ord) {
    const g = gruppi[gruppi.length - 1];
    const media = g ? g.reduce((s, x) => s + x.prezzo, 0) / g.length : 0;
    if (g && pt.prezzo - media <= tol) g.push(pt);
    else gruppi.push([pt]);
  }
  const zone: ZonaFib[] = gruppi
    .filter((g) => g.length >= 2)
    .map((g) => ({
      prezzo: g.reduce((s, x) => s + x.prezzo, 0) / g.length,
      fonti: g.map((x) => x.fonte),
      forza: g.length,
    }))
    .sort((x, y) => Math.abs(x.prezzo - prezzoAttuale) - Math.abs(y.prezzo - prezzoAttuale))
    .slice(0, 6);

  return {
    direzione: rialzista ? "rialzista" : "ribassista",
    da: { t: recente.da.t, p: recente.da.p },
    a: { t: recente.a.t, p: recente.a.p },
    livelli,
    zone,
  };
}

/** Pitchfork (Andrews) dagli ultimi 3 pivot confermati. */
function calcolaPitchfork(candele: Candle[]) {
  const a = atr(candele);
  const { confermati } = zigzag(candele, a * 2);
  if (confermati.length < 3) return null;
  const [p1, p2, p3] = confermati.slice(-3);
  return {
    tipo: p1.tipo === "H" ? "ribassista" : "rialzista", // 2 massimi + 1 minimo = ribassista
    pivots: [p1, p2, p3].map((x) => ({ t: x.t, p: x.p })),
  };
}
/** EMA (media mobile esponenziale) — stessa formula usata in compute-indicators. */
function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return out;
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = seed;
  for (let i = period; i < values.length; i++) out[i] = values[i] * k + out[i - 1] * (1 - k);
  return out;
}

/**
 * Struttura di mercato (Dow Theory): massimi e minimi crescenti = rialzista,
 * decrescenti = ribassista, altrimenti laterale/indefinita. Riusa lo stesso
 * zigzag già calcolato per Fibonacci, sugli stessi dati H4 già scaricati.
 */
function calcolaStruttura(candele: Candle[]) {
  const a = atr(candele);
  const { confermati, provvisorio } = zigzag(candele, a * 2.5);
  const piv = provvisorio ? [...confermati, provvisorio] : confermati;
  if (piv.length < 4) return null;

  const massimi = piv.filter((p) => p.tipo === "H").slice(-2);
  const minimi = piv.filter((p) => p.tipo === "L").slice(-2);
  let trend: "rialzista" | "ribassista" | "laterale" = "laterale";
  if (massimi.length === 2 && minimi.length === 2) {
    const hh = massimi[1].p > massimi[0].p;
    const hl = minimi[1].p > minimi[0].p;
    const lh = massimi[1].p < massimi[0].p;
    const ll = minimi[1].p < minimi[0].p;
    if (hh && hl) trend = "rialzista";
    else if (lh && ll) trend = "ribassista";
  }
  return { trend, pivots: piv.slice(-4).map((p) => ({ t: p.t, p: p.p, tipo: p.tipo })) };
}

/** Incrocio EMA 50/200 su Daily ("golden cross" / "death cross"): bias di lungo periodo. */
function calcolaEmaCross(candeleDaily: Candle[]) {
  if (candeleDaily.length < 200) return null;
  const closes = candeleDaily.map((c) => c.close);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const attuale50 = e50[e50.length - 1];
  const attuale200 = e200[e200.length - 1];
  const prec50 = e50[e50.length - 2];
  const prec200 = e200[e200.length - 2];
  if ([attuale50, attuale200, prec50, prec200].some((v) => Number.isNaN(v))) return null;

  let incrocio: "golden" | "death" | "nessuno" = "nessuno";
  if (prec50 <= prec200 && attuale50 > attuale200) incrocio = "golden";
  else if (prec50 >= prec200 && attuale50 < attuale200) incrocio = "death";

  return {
    trend: attuale50 > attuale200 ? "rialzista" : "ribassista",
    incrocio,
    ema50: attuale50,
    ema200: attuale200,
    prezzo: closes[closes.length - 1],
  };
}
// ==== FINE CALCOLI AVANZATI ====

async function calcolaAsset(supabase: any, symbol: string, twelveKey: string | undefined) {
  const righe: any[] = [];
  const analisi: any[] = [];
  const avvisi: string[] = [];
  const calcolati: Timeframe[] = [];

  for (const tf of TIMEFRAMES) {
    try {
      const candele = YAHOO_MAP[symbol]
        ? await candeleYahoo(symbol, tf)
        : await candeleTwelve(symbol, tf, twelveKey ?? "");
      const prezzoAttuale = candele[candele.length - 1].close;
      const livelli = livelliPerTimeframe(candele, prezzoAttuale);
      calcolati.push(tf);

      if (tf === "Daily" || tf === "H4") {
        const fib = calcolaFibonacci(candele, livelli.map((l) => l.prezzo), prezzoAttuale);
        if (fib) analisi.push({ asset_symbol: symbol, tipo: "fibonacci", timeframe: tf, dati: fib });
      }
      if (tf === "H4") {
        const struttura = calcolaStruttura(candele);
        if (struttura) analisi.push({ asset_symbol: symbol, tipo: "struttura", timeframe: tf, dati: struttura });
      }
      if (tf === "Daily") {
        const emaCross = calcolaEmaCross(candele);
        if (emaCross) analisi.push({ asset_symbol: symbol, tipo: "ema_cross", timeframe: tf, dati: emaCross });
      }
      if (tf === "H1") {
        const pf = calcolaPitchfork(candele);
        if (pf) analisi.push({ asset_symbol: symbol, tipo: "pitchfork", timeframe: tf, dati: pf });
      }

      for (const l of livelli) {
        righe.push({
          asset_symbol: symbol,
          prezzo: Number(l.prezzo.toPrecision(7)),
          timeframe: tf,
          tipo: l.tipo,
          note: `Auto · ${l.tocchi} tocchi`,
          inserito_da_utente: false,
        });
      }
    } catch (e) {
      avvisi.push(`${tf}: ${e}`);
    }
  }

  // Sostituisce solo i livelli automatici dei timeframe calcolati con successo
  // (i livelli inseriti a mano non vengono mai toccati).
  if (calcolati.length > 0) {
    await supabase
      .from("key_levels")
      .delete()
      .eq("asset_symbol", symbol)
      .eq("inserito_da_utente", false)
      .in("timeframe", calcolati);
    if (righe.length > 0) {
      const { error } = await supabase.from("key_levels").insert(righe);
      if (error) avvisi.push(`salvataggio: ${error.message}`);
    }
  }
  if (analisi.length > 0) {
    const { error } = await supabase
      .from("analisi_tecniche")
      .upsert(
        analisi.map((a) => ({ ...a, ts: new Date().toISOString() })),
        { onConflict: "asset_symbol,tipo,timeframe" }
      );
    if (error) avvisi.push(`analisi tecniche: ${error.message}`);
  }
  return {
    symbol,
    livelli: righe.length,
    fibonacci: analisi.filter((a) => a.tipo === "fibonacci").map((a) => a.timeframe),
    pitchfork: analisi.filter((a) => a.tipo === "pitchfork").length > 0,
    struttura: analisi.find((a) => a.tipo === "struttura")?.dati.trend ?? null,
    ema_cross: analisi.find((a) => a.tipo === "ema_cross")?.dati.incrocio ?? null,
    timeframe_calcolati: calcolati,
    avvisi,
  };
}

async function handler(req: Request): Promise<Response> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const twelveKey = Deno.env.get("TWELVE_DATA_API_KEY");
  const body = await req.json().catch(() => ({}));
  const tutti = Array.from(new Set(Object.values(WATCHLISTS).flat()));

  let symbol: string | undefined = body.symbol;
  if (!symbol && body.modalita === "rotazione") {
    symbol = tutti[new Date().getUTCHours()]; // un asset per ora; le ore oltre i 21 asset restano libere
    if (!symbol) {
      return new Response(JSON.stringify({ ok: true, skip: "nessun asset in questa ora" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  }
  if (!symbol || !tutti.includes(symbol)) {
    return new Response(JSON.stringify({ error: "Body atteso: {symbol} oppure {modalita:'rotazione'}." }), {
      status: 400,
    });
  }

  try {
    const risultato = await calcolaAsset(supabase, symbol, twelveKey);
    return new Response(JSON.stringify({ ok: true, ...risultato }), {
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
