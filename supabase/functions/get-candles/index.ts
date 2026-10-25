// Supabase Edge Function — runtime Deno.
// Restituisce le candele OHLC di un asset per il grafico a candele del sito
// (chiamata direttamente dal browser, nessuna scrittura sul database).
//
// Body atteso: {"symbol": "XAUUSD", "timeframe": "M30" | "H1" | "H4" | "Daily"}
//
// Deploy: supabase functions deploy get-candles
// Usa lo stesso secret TWELVE_DATA_API_KEY di ingest-prices/compute-indicators.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Stessa mappa di ingest-prices/compute-indicators: asset non coperti da
// Twelve Data → Yahoo Finance. Tienile allineate.
const YAHOO_MAP: Record<string, string> = {
  XAGUSD: "SI=F", "PL1!": "PL=F", COPPER: "HG=F", USOIL: "CL=F", XBRUSD: "BZ=F",
  "BR1!": "BZ=F", DXY: "DX-Y.NYB", DJI: "^DJI", SPX: "^GSPC", NDQ: "^NDX",
};
const FORMATO_COPPIA = new Set([
  "AUDJPY","AUDUSD","CADJPY","EURUSD","GBPJPY","GBPUSD","NZDJPY","NZDUSD",
  "USDCAD","USDCHF","XAUUSD",
]);

type Timeframe = "M30" | "H1" | "H4" | "Daily";
const UA = { "User-Agent": "Mozilla/5.0 (compatible; AnalizzatoreH24/1.0)" };

export interface Candela {
  t: number; // secondi unix
  o: number;
  h: number;
  l: number;
  c: number;
}

async function daYahoo(symbol: string, tf: Timeframe): Promise<Candela[]> {
  const ySym = encodeURIComponent(YAHOO_MAP[symbol]);
  const params =
    tf === "Daily" ? "interval=1d&range=2y" : tf === "M30" ? "interval=30m&range=60d" : "interval=60m&range=2y";
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ySym}?${params}`, { headers: UA });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const r = (await res.json())?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r || !q) throw new Error("Yahoo: nessun dato");
  const out: Candela[] = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    if ([q.open[i], q.high[i], q.low[i], q.close[i]].some((x: any) => x == null)) continue;
    out.push({ t: r.timestamp[i], o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] });
  }
  return tf === "H4" ? aggrega4h(out) : out;
}

// Yahoo non ha H4: si costruisce dalle candele H1 (blocchi di 4 ore UTC).
function aggrega4h(h1: Candela[]): Candela[] {
  const blocchi = new Map<number, Candela>();
  for (const c of h1) {
    const k = Math.floor(c.t / 14400) * 14400;
    const b = blocchi.get(k);
    if (!b) blocchi.set(k, { ...c, t: k });
    else {
      b.h = Math.max(b.h, c.h);
      b.l = Math.min(b.l, c.l);
      b.c = c.c;
    }
  }
  return [...blocchi.values()].sort((a, b) => a.t - b.t);
}

async function daTwelveData(symbol: string, tf: Timeframe, apiKey: string): Promise<Candela[]> {
  const sym = FORMATO_COPPIA.has(symbol) ? `${symbol.slice(0, 3)}/${symbol.slice(3)}` : symbol;
  const interval = tf === "M30" ? "30min" : tf === "H1" ? "1h" : tf === "H4" ? "4h" : "1day";
  const outputsize = tf === "Daily" ? 300 : 300;
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
    sym
  )}&interval=${interval}&outputsize=${outputsize}&apikey=${apiKey}`;
  const data = await (await fetch(url)).json();
  if (!data.values) throw new Error(data.message ?? "Twelve Data: nessun dato");
  return data.values
    .map((v: any) => ({
      t: Math.floor(new Date(v.datetime.replace(" ", "T") + "Z").getTime() / 1000),
      o: parseFloat(v.open),
      h: parseFloat(v.high),
      l: parseFloat(v.low),
      c: parseFloat(v.close),
    }))
    .reverse();
}

async function handler(req: Request): Promise<Response> {
  const twelveDataKey = Deno.env.get("TWELVE_DATA_API_KEY");
  const body = await req.json().catch(() => ({}));
  const symbol = body.symbol as string | undefined;
  const timeframe = body.timeframe as Timeframe | undefined;

  if (!symbol || !timeframe || !["M30", "H1", "H4", "Daily"].includes(timeframe)) {
    return new Response(
      JSON.stringify({ error: "Body atteso: {symbol, timeframe: 'M30'|'H1'|'H4'|'Daily'}." }),
      { status: 400 }
    );
  }

  try {
    const candele = YAHOO_MAP[symbol]
      ? await daYahoo(symbol, timeframe)
      : await daTwelveData(symbol, timeframe, twelveDataKey ?? "");
    return new Response(JSON.stringify({ ok: true, symbol, timeframe, candele }), {
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
