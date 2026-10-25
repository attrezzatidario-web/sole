// Supabase Edge Function — runtime Deno.
// Scarica le candele del periodo che segue un segnale (da poco PRIMA del messaggio
// fino ad adesso), per ricostruire com'è andato e disegnare il grafico nell'app.
// Nessuna scrittura sul database: legge solo dati di mercato.
//
// Body: {"symbol":"XAUUSD","da":"2026-10-03T14:21:07+00:00"}
//   facoltativi: "intervallo" ("1min"|"5min"|"15min"|"1h"), e per una finestra esatta
//   (usata per risolvere i casi in cui stop e target stanno nella stessa candela):
//   "a":"...", "esatta":true  → candele solo tra "da" e "a", senza il contesto prima del messaggio.
// Senza "intervallo" si sceglie il più fine che sta nel limite di 5000 candele per richiesta.
// Se il fornitore non concede quella granularità si ripiega su una più larga ("intervallo" nella risposta).
//
// Fonti: forex/oro spot → Twelve Data (1 credito per chiamata). Altri asset → Yahoo Finance.
// Se per l'oro i dati storici spot non fossero disponibili si ripiega sui future (GC=F),
// segnalandolo ("yahoo-futures"): possono differire di qualche dollaro dallo spot.
//
// Deploy: supabase functions deploy segnale-andamento    Secret: TWELVE_DATA_API_KEY (già presente)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const YAHOO_MAP: Record<string, string> = {
  XAGUSD: "SI=F", "PL1!": "PL=F", COPPER: "HG=F", USOIL: "CL=F", XBRUSD: "BZ=F",
  "BR1!": "BZ=F", DXY: "DX-Y.NYB", DJI: "^DJI", SPX: "^GSPC", NDQ: "^NDX",
};
const FORMATO_COPPIA = new Set([
  "AUDJPY","AUDUSD","CADJPY","EURUSD","GBPJPY","GBPUSD","NZDJPY","NZDUSD",
  "USDCAD","USDCHF","XAUUSD",
]);
const FUTURES_DI_RIPIEGO: Record<string, string> = { XAUUSD: "GC=F" };

type Intervallo = "1min" | "5min" | "15min" | "1h";
const PIU_LARGO: Record<Intervallo, Intervallo | null> = { "1min": "5min", "5min": "15min", "15min": "1h", "1h": null };
const UA = { "User-Agent": "Mozilla/5.0 (compatible; AnalizzatoreH24/1.0)" };
const GIORNI_MAX = 21;
// Candele di contesto PRIMA del messaggio: servono agli indicatori (EMA 200 ha bisogno di 200 candele)
// e a ricostruire quando il gruppo può aver aperto una posizione che dice di avere già.
const CANDELE_DI_CONTESTO = 300;
const STEP_SEC: Record<Intervallo, number> = { "1min": 60, "5min": 300, "15min": 900, "1h": 3600 };

interface Candela {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

// Tieni identica la regola in lib/domain/esitoSegnale.ts (frontend).
// 300 candele di contesto + il periodo dopo il messaggio devono stare nelle 5000 candele per richiesta.
export function intervalloConsigliato(durataSec: number): Intervallo {
  const g = durataSec / 86400;
  return g <= 3.2 ? "1min" : g <= 16.2 ? "5min" : "15min";
}

function fmtTwelve(secondi: number): string {
  return new Date(secondi * 1000).toISOString().slice(0, 19).replace("T", " ");
}

async function daTwelveData(symbol: string, da: number, a: number, intervallo: Intervallo, apiKey: string): Promise<Candela[]> {
  const sym = FORMATO_COPPIA.has(symbol) ? `${symbol.slice(0, 3)}/${symbol.slice(3)}` : symbol;
  const url =
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(sym)}&interval=${intervallo}` +
    `&start_date=${encodeURIComponent(fmtTwelve(da))}&end_date=${encodeURIComponent(fmtTwelve(a))}` +
    `&order=ASC&timezone=UTC&outputsize=5000&apikey=${apiKey}`;
  const data = await (await fetch(url)).json();
  if (!data?.values?.length) throw new Error(data?.message ?? "Twelve Data: nessun dato per questo periodo");
  return data.values.map((v: any) => ({
    t: Math.floor(Date.parse(v.datetime.replace(" ", "T") + "Z") / 1000),
    o: parseFloat(v.open), h: parseFloat(v.high), l: parseFloat(v.low), c: parseFloat(v.close),
  }));
}

async function daYahoo(ySym: string, da: number, a: number, intervallo: Intervallo): Promise<Candela[]> {
  const iv = intervallo === "1min" ? "1m" : intervallo === "5min" ? "5m" : intervallo === "15min" ? "15m" : "60m";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySym)}?interval=${iv}&period1=${da}&period2=${a}`;
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const r = (await res.json())?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r?.timestamp || !q) throw new Error("Yahoo: nessun dato per questo periodo");
  const out: Candela[] = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    if ([q.open[i], q.high[i], q.low[i], q.close[i]].some((x: any) => x == null)) continue;
    out.push({ t: r.timestamp[i], o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] });
  }
  if (!out.length) throw new Error("Yahoo: nessuna candela valida per questo periodo");
  return out;
}

const risposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

/** Prova la granularità richiesta e, se il fornitore la rifiuta, quelle più larghe. */
async function conRipiegoGranularita<T>(iniziale: Intervallo, fn: (iv: Intervallo) => Promise<T>): Promise<{ iv: Intervallo; dati: T; avvisi: string[] }> {
  const avvisi: string[] = [];
  let iv: Intervallo | null = iniziale;
  let ultimoErrore: unknown = null;
  while (iv) {
    try {
      return { iv, dati: await fn(iv), avvisi };
    } catch (e) {
      ultimoErrore = e;
      avvisi.push(`${iv}: ${e}`);
      iv = PIU_LARGO[iv];
    }
  }
  throw ultimoErrore;
}

async function handler(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const symbol = String(body.symbol ?? "");
  const daMs = Date.parse(String(body.da ?? ""));
  if (!symbol || (!FORMATO_COPPIA.has(symbol) && !YAHOO_MAP[symbol])) {
    return risposta({ error: "Simbolo mancante o non supportato." }, 400);
  }
  if (Number.isNaN(daMs)) return risposta({ error: "Parametro 'da' mancante o non valido." }, 400);

  const adesso = Math.floor(Date.now() / 1000);
  const segnaleSec = Math.floor(daMs / 1000);
  if (segnaleSec > adesso) return risposta({ error: "Il segnale è nel futuro." }, 400);

  const esatta = body.esatta === true;
  let a = Math.min(adesso, segnaleSec + GIORNI_MAX * 86400);
  if (esatta) {
    const aMs = Date.parse(String(body.a ?? ""));
    if (Number.isNaN(aMs) || Math.floor(aMs / 1000) <= segnaleSec) {
      return risposta({ error: "Con 'esatta' serve un parametro 'a' valido, dopo 'da'." }, 400);
    }
    a = Math.min(adesso, Math.floor(aMs / 1000));
  }
  const intervallo: Intervallo = ["1min", "5min", "15min", "1h"].includes(body.intervallo)
    ? body.intervallo
    : intervalloConsigliato(a - segnaleSec);
  // inizio della finestra per una data granularità (in esatta: nessun contesto prima)
  const daPer = (iv: Intervallo) => (esatta ? segnaleSec : segnaleSec - CANDELE_DI_CONTESTO * STEP_SEC[iv]);

  const apiKey = Deno.env.get("TWELVE_DATA_API_KEY") ?? "";
  try {
    if (YAHOO_MAP[symbol]) {
      const r = await conRipiegoGranularita(intervallo, (iv) => daYahoo(YAHOO_MAP[symbol], daPer(iv), a, iv));
      return risposta({ ok: true, symbol, intervallo: r.iv, fonte: "yahoo", avviso: r.avvisi.join(" | ") || undefined, candele: r.dati });
    }
    try {
      const r = await conRipiegoGranularita(intervallo, (iv) => daTwelveData(symbol, daPer(iv), a, iv, apiKey));
      return risposta({ ok: true, symbol, intervallo: r.iv, fonte: "twelvedata", avviso: r.avvisi.join(" | ") || undefined, candele: r.dati });
    } catch (e) {
      const ripiego = FUTURES_DI_RIPIEGO[symbol];
      if (!ripiego) throw e;
      const r = await conRipiegoGranularita(intervallo, (iv) => daYahoo(ripiego, daPer(iv), a, iv));
      return risposta({ ok: true, symbol, intervallo: r.iv, fonte: "yahoo-futures", avviso: String(e), candele: r.dati });
    }
  } catch (e) {
    return risposta({ error: `Dati di mercato non disponibili per quel periodo: ${e}` }, 502);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const res = await handler(req);
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
});
