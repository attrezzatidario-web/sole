// Supabase Edge Function — runtime Deno.
// Scopo: interrogare Twelve Data una volta per ciclo (batch di simboli),
// salvare gli snapshot di prezzo e calcolare lo stato delle correlazioni
// note (confermata / divergente) tra gli asset delle watchlist.
//
// Deploy:   supabase functions deploy ingest-prices
// Secrets:  supabase secrets set TWELVE_DATA_API_KEY=xxxx
// Invocata via cron da supabase/migrations/0002_cron.sql

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";


// ------------------------------------------------------------------
// ATTENZIONE: i simboli qui sotto sono quelli usati nel corso. Il ticker
// esatto richiesto da Twelve Data (o da un altro provider) può differire
// — verifica ogni simbolo con l'endpoint di ricerca del provider prima di
// andare in produzione (es. indici e future come DJI/SPX/NDQ/PL1!/BR1!
// hanno spesso una notazione diversa da un provider all'altro).
// ------------------------------------------------------------------
const SYMBOL_ALIASES: Record<string, string> = {
  // "simbolo interno del corso": "simbolo da inviare al provider"
  // Esempio, da verificare/adattare al provider scelto:
  // "NDQ": "IXIC",
  // "USOIL": "WTI/USD",
};

const WATCHLISTS: Record<string, string[]> = {
  Forex: ["AUDJPY","AUDUSD","CADJPY","EURUSD","GBPJPY","GBPUSD","NZDJPY","NZDUSD","USDCAD","USDCHF","XAUUSD"],
  "Indicatori Oro": ["NZDUSD","AUDUSD","EURUSD","XAUUSD","DXY","XAGUSD"],
  "Indici Anti USD": ["DJI","SPX","NDQ"],
  Petrolio: ["USOIL","XBRUSD","BR1!","CADJPY","GBPUSD","GBPJPY","USDCAD"],
  Metalli: ["PL1!","COPPER","XAUUSD","XAGUSD"],
};

// Relazioni note dedotte esplicitamente dal corso (+ fatti di mercato
// consolidati per DXY/indici). Usate per marcare confermata/divergente.
type Tipo = "positiva" | "negativa";
const RELAZIONI: [string, string, Tipo][] = [
  ["XAUUSD", "DXY", "negativa"],
  ["XAUUSD", "USOIL", "positiva"],
  ["XAUUSD", "XAGUSD", "positiva"],
  ["XAUUSD", "PL1!", "positiva"],
  ["XAUUSD", "COPPER", "positiva"],
  ["XAUUSD", "AUDUSD", "positiva"],
  ["XAUUSD", "NZDUSD", "positiva"],
  ["XAUUSD", "AUDJPY", "positiva"],
  ["XAUUSD", "NZDJPY", "positiva"],
  // Dedotte dalla posizione del USD: nel gruppo "sinistra" del corso EUR sale con l'oro;
  // se USD è la valuta base (USDCHF, USDCAD) la coppia si muove al contrario dell'oro.
  ["XAUUSD", "EURUSD", "positiva"],
  ["XAUUSD", "GBPUSD", "positiva"],
  ["XAUUSD", "USDCHF", "negativa"],
  ["XAUUSD", "USDCAD", "negativa"],
  ["EURUSD", "DXY", "negativa"],
  ["AUDUSD", "DXY", "negativa"],
  ["NZDUSD", "DXY", "negativa"],
  ["GBPUSD", "DXY", "negativa"],
  ["USDCAD", "DXY", "positiva"],
  ["USDCHF", "DXY", "positiva"],
  ["USOIL", "XBRUSD", "positiva"],
  ["USOIL", "BR1!", "positiva"],
  ["XBRUSD", "BR1!", "positiva"],
  ["USOIL", "USDCAD", "negativa"],
  ["USOIL", "GBPUSD", "positiva"],
  ["USOIL", "CADJPY", "positiva"],
  ["USOIL", "GBPJPY", "positiva"],
  ["XBRUSD", "USDCAD", "negativa"],
  ["XBRUSD", "GBPUSD", "positiva"],
  ["XBRUSD", "CADJPY", "positiva"],
  ["XBRUSD", "GBPJPY", "positiva"],
  ["DJI", "SPX", "positiva"],
  ["DJI", "NDQ", "positiva"],
  ["SPX", "NDQ", "positiva"],
  ["XAGUSD", "PL1!", "positiva"],
  ["XAGUSD", "COPPER", "positiva"],
  ["PL1!", "COPPER", "positiva"],
];

// Sotto questa soglia (%) una variazione è considerata "rumore" e non
// viene usata per giudicare una correlazione (evita falsi "divergente"
// su movimenti trascurabili).
const SOGLIA_RUMORE = 0.02;

function statoCorrelazione(
  changeA: number,
  changeB: number,
  tipo: Tipo
): "confermata" | "divergente" | null {
  if (Math.abs(changeA) < SOGLIA_RUMORE || Math.abs(changeB) < SOGLIA_RUMORE) {
    return null;
  }
  const stessaDirezione = Math.sign(changeA) === Math.sign(changeB);
  const atteso = tipo === "positiva" ? stessaDirezione : !stessaDirezione;
  return atteso ? "confermata" : "divergente";
}

// Simboli che Twelve Data vuole nel formato "EUR/USD" (coppie forex e metalli).
const FORMATO_COPPIA = new Set([
  "AUDJPY","AUDUSD","CADJPY","EURUSD","GBPJPY","GBPUSD","NZDJPY","NZDUSD",
  "USDCAD","USDCHF","XAUUSD",
]);

function toProviderSymbol(s: string): string {
  if (SYMBOL_ALIASES[s]) return SYMBOL_ALIASES[s];
  if (FORMATO_COPPIA.has(s)) return `${s.slice(0, 3)}/${s.slice(3)}`;
  return s;
}

interface QuoteResult {
  symbol: string;
  price: number;
  changePct: number | null;
}


// Asset che il piano gratuito di Twelve Data NON copre (indici, petrolio,
// metalli diversi dall'oro, DXY): vengono letti da Yahoo Finance (gratis,
// senza chiave, ma NON ufficiale: può cambiare o bloccare le richieste).
// Se un ticker non funziona, correggilo qui.
const YAHOO_MAP: Record<string, string> = {
  XAGUSD: "SI=F",      // Argento
  "PL1!": "PL=F",      // Platino
  COPPER: "HG=F",      // Rame
  USOIL: "CL=F",       // Petrolio WTI
  XBRUSD: "BZ=F",      // Petrolio Brent
  "BR1!": "BZ=F",      // Brent future
  DXY: "DX-Y.NYB",     // Indice dollaro
  DJI: "^DJI",         // Dow Jones
  SPX: "^GSPC",        // S&P 500
  NDQ: "^NDX",         // Nasdaq 100
};

async function fetchYahoo(symbol: string): Promise<QuoteResult> {
  const ySym = YAHOO_MAP[symbol];
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ySym
  )}?interval=1d&range=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; AnalizzatoreH24/1.0)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice);
  if (!meta || Number.isNaN(price)) throw new Error("risposta senza prezzo");
  const prev = Number(meta.chartPreviousClose ?? meta.previousClose);
  const changePct = prev && !Number.isNaN(prev) ? ((price - prev) / prev) * 100 : null;
  return { symbol, price, changePct };
}

async function fetchQuotes(symbols: string[], apiKey: string): Promise<QuoteResult[]> {
  const remoteSymbols = symbols.map(toProviderSymbol);
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(
    remoteSymbols.join(",")
  )}&apikey=${apiKey}`;

  const res = await fetch(url);
  const data = await res.json();

  // Errore "globale" (es. limite di crediti al minuto superato): la risposta
  // ha status "error" o un codice numerico al primo livello. Senza questo
  // controllo le chiavi dell'errore venivano scambiate per simboli.
  if (data?.status === "error" || typeof data?.code === "number") {
    throw new Error(`Twelve Data: ${data.message ?? JSON.stringify(data)}`);
  }

  // Con 1 solo simbolo la risposta è il quote stesso; con più simboli è
  // un oggetto { SIMBOLO: {...}, ... }.
  const entries: [string, any][] =
    symbols.length === 1 ? [[remoteSymbols[0], data]] : Object.entries(data);

  const remoteToInternal = new Map(remoteSymbols.map((r, i) => [r, symbols[i]]));
  const results: QuoteResult[] = [];

  for (const [remoteSymbol, quote] of entries) {
    const internalSymbol = remoteToInternal.get(remoteSymbol);
    if (!internalSymbol) continue;
    if (!quote || quote.status === "error" || typeof quote.code === "number") {
      console.warn(`Quote non disponibile per ${internalSymbol}: ${quote?.message ?? "?"}`);
      continue;
    }
    const price = parseFloat(quote.close);
    if (Number.isNaN(price)) {
      console.warn(`Prezzo non valido per ${internalSymbol}`);
      continue;
    }
    results.push({
      symbol: internalSymbol,
      price,
      changePct: quote.percent_change != null ? parseFloat(quote.percent_change) : null,
    });
  }
  return results;
}


// ---------------------------------------------------------------- notifiche

/**
 * Manda una notifica tramite la funzione "notifiche", che applica da sola le
 * preferenze dell'utente (categoria attiva, filtro asset, modalità, fascia oraria).
 */
async function notifica(
  categoria: "divergenza" | "livello",
  asset: string | string[],
  titolo: string,
  corpo: string,
  url = "/"
) {
  const base = Deno.env.get("SUPABASE_URL")!;
  const chiave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    await fetch(`${base}/functions/v1/notifiche`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chiave}` },
      body: JSON.stringify({ action: "invia", categoria, asset, titolo, corpo, url }),
    });
  } catch (e) {
    console.warn("Notifica non inviata:", e);
  }
}

// Coppie forex vere: l'oro (XAUUSD) è nel formato "coppia" per Twelve Data ma si comporta come una materia prima.
const èForex = (symbol: string) => FORMATO_COPPIA.has(symbol) && symbol !== "XAUUSD";

function fmtPrezzo(symbol: string, prezzo: number): string {
  const d = èForex(symbol) ? (symbol.endsWith("JPY") ? 3 : 5) : symbol === "DXY" || symbol === "XAGUSD" ? 3 : 2;
  return prezzo.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
}

// Distanza (in %) sotto la quale il prezzo si considera "vicino" a un key level.
const SOGLIA_VICINO_FOREX = 0.1;
const SOGLIA_VICINO_ALTRI = 0.25;
const COOLDOWN_ORE = 3; // al massimo un avviso ogni 3 ore per asset
const MAX_AVVISI_PER_GIRO = 4;

/**
 * Avvisa quando il prezzo si avvicina a un key level o lo attraversa.
 * Si considerano i livelli manuali e quelli automatici Daily/H4 (gli H1 sono troppo frequenti).
 */
async function avvisiKeyLevel(supabase: any, quotes: QuoteResult[], prezziPrec: Map<string, number>) {
  if (quotes.length === 0) return 0;
  const { data: livelli } = await supabase
    .from("key_levels")
    .select("asset_symbol, prezzo, timeframe, tipo, note, inserito_da_utente")
    .in("asset_symbol", quotes.map((q) => q.symbol));
  const { data: recenti } = await supabase
    .from("key_level_alerts")
    .select("asset_symbol, tipo")
    .gte("ts", new Date(Date.now() - COOLDOWN_ORE * 3600 * 1000).toISOString());
  const gia = new Set((recenti ?? []).map((r: any) => r.asset_symbol as string));

  const nuovi: { asset: string; tipo: "rottura" | "vicino"; titolo: string; corpo: string }[] = [];
  for (const q of quotes) {
    const lv = (livelli ?? []).filter(
      (l: any) => l.asset_symbol === q.symbol && (l.inserito_da_utente || l.timeframe !== "H1")
    );
    if (lv.length === 0 || gia.has(q.symbol)) continue;

    const prec = prezziPrec.get(q.symbol);
    if (prec !== undefined) {
      const rotto = lv.find((l: any) => (prec - l.prezzo) * (q.price - l.prezzo) < 0);
      if (rotto) {
        const su = q.price > rotto.prezzo;
        nuovi.push({
          asset: q.symbol,
          tipo: "rottura",
          titolo: `${q.symbol}: livello ${su ? "superato" : "perso"}`,
          corpo: `${su ? "Sopra" : "Sotto"} ${rotto.tipo} ${rotto.timeframe} a ${fmtPrezzo(q.symbol, rotto.prezzo)} · prezzo ${fmtPrezzo(q.symbol, q.price)}`,
        });
        continue;
      }
    }
    {
      const soglia = èForex(q.symbol) ? SOGLIA_VICINO_FOREX : SOGLIA_VICINO_ALTRI;
      const vicino = lv
        .map((l: any) => ({ l, d: (Math.abs(q.price - l.prezzo) / q.price) * 100 }))
        .filter((x: any) => x.d <= soglia)
        .sort((a: any, b: any) => a.d - b.d)[0];
      if (vicino) {
        nuovi.push({
          asset: q.symbol,
          tipo: "vicino",
          titolo: `${q.symbol} vicino a un livello`,
          corpo: `${vicino.l.tipo === "resistenza" ? "Resistenza" : "Supporto"} ${vicino.l.timeframe} a ${fmtPrezzo(q.symbol, vicino.l.prezzo)} (${vicino.d.toFixed(2).replace(".", ",")}% di distanza)${vicino.l.note ? " · " + vicino.l.note : ""}`,
        });
      }
    }
  }

  for (const n of nuovi.slice(0, MAX_AVVISI_PER_GIRO)) {
    await notifica("livello", n.asset, n.titolo, n.corpo, `/asset/${n.asset}/`);
    await supabase.from("key_level_alerts").insert({ asset_symbol: n.asset, tipo: n.tipo });
  }
  return Math.min(nuovi.length, MAX_AVVISI_PER_GIRO);
}

// Il piano gratuito di Twelve Data permette 8 crediti/minuto (1 credito per
// simbolo): 21 simboli in una volta vengono rifiutati. Ogni esecuzione
// scarica quindi UN SOLO gruppo (5-6 simboli forex/oro) a rotazione tra 2 gruppi.
// Con il cron ogni 15 minuti: max 6 x 96 = 576 crediti/giorno (limite: 800) e
// ogni coppia si aggiorna circa ogni 30 minuti. Gli asset Yahoo (10) vengono
// scaricati tutti a ogni esecuzione, senza consumare crediti.
const NUM_GRUPPI = 2;

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const twelveDataKey = Deno.env.get("TWELVE_DATA_API_KEY");

  if (!twelveDataKey) {
    return new Response(
      JSON.stringify({ error: "TWELVE_DATA_API_KEY non configurata (Edge Functions > Secrets)." }),
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  // Per il test manuale: {"gruppo": 0} oppure {"gruppo": 1}
  const gruppo = Number.isInteger(body.gruppo)
    ? Math.abs(body.gruppo) % NUM_GRUPPI
    : Math.floor(Date.now() / (15 * 60 * 1000)) % NUM_GRUPPI;

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const tuttiSimboli = Array.from(new Set(Object.values(WATCHLISTS).flat()));
  const simboliTd = tuttiSimboli.filter((x) => !YAHOO_MAP[x]);
  const simboliYahoo = tuttiSimboli.filter((x) => YAHOO_MAP[x]);
  const simboliGruppo = simboliTd.filter((_, i) => i % NUM_GRUPPI === gruppo);

  const quotes: QuoteResult[] = [];
  const errori: string[] = [];

  try {
    quotes.push(...(await fetchQuotes(simboliGruppo, twelveDataKey)));
  } catch (e) {
    errori.push(String(e));
  }

  const yahooRisultati = await Promise.all(
    simboliYahoo.map(async (x) => {
      try {
        return await fetchYahoo(x);
      } catch (e) {
        errori.push(`Yahoo ${x}: ${e}`);
        return null;
      }
    })
  );
  for (const r of yahooRisultati) if (r) quotes.push(r);

  if (errori.length > 0) console.warn("Errori download:", errori);
  if (quotes.length === 0) {
    return new Response(JSON.stringify({ error: "Nessun prezzo scaricato", errori, gruppo }), {
      status: 502,
    });
  }

  // Prezzi noti prima di questo giro (servono a capire se un livello è stato attraversato).
  const { data: prezziPrecRows } = await supabase.from("latest_prices").select("symbol, price");
  const prezziPrec = new Map<string, number>((prezziPrecRows ?? []).map((r: any) => [r.symbol, Number(r.price)]));

  if (quotes.length > 0) {
    const { error: insertError } = await supabase.from("price_snapshots").insert(
      quotes.map((q) => ({
        asset_symbol: q.symbol,
        price: q.price,
        change_pct: q.changePct,
      }))
    );
    if (insertError) console.error("Errore insert price_snapshots:", insertError);
  }

  // Le correlazioni si valutano sull'ultimo dato noto di TUTTI gli asset
  // (non solo quelli scaricati in questo giro).
  const { data: ultimi } = await supabase.from("latest_prices").select("symbol, change_pct");
  const changeMap = new Map(
    (ultimi ?? []).map((r: any) => [r.symbol, Number(r.change_pct ?? 0)])
  );

  // Stato precedente, per avvisare solo sulle transizioni verso "divergente".
  const { data: statoPrecedente } = await supabase
    .from("latest_correlation_checks")
    .select("asset_symbol, correlato_symbol, stato");
  const precedenteMap = new Map(
    (statoPrecedente ?? []).map((r: any) => [`${r.asset_symbol}|${r.correlato_symbol}`, r.stato])
  );

  const checks: { asset_symbol: string; correlato_symbol: string; stato: string }[] = [];
  const nuoveDivergenze: { a: string; b: string }[] = [];
  for (const [a, b, tipo] of RELAZIONI) {
    if (!changeMap.has(a) || !changeMap.has(b)) continue;
    const stato = statoCorrelazione(changeMap.get(a)!, changeMap.get(b)!, tipo);
    if (!stato) continue;
    // Si salva una riga solo quando lo stato cambia: il database resta piccolo
    // e lo Storico mostra il momento in cui la divergenza è nata.
    if (precedenteMap.get(`${a}|${b}`) !== stato) checks.push({ asset_symbol: a, correlato_symbol: b, stato });
    if (precedenteMap.get(`${b}|${a}`) !== stato) checks.push({ asset_symbol: b, correlato_symbol: a, stato });

    if (stato === "divergente") {
      const precedente = precedenteMap.get(`${a}|${b}`);
      if (precedente && precedente !== "divergente") {
        nuoveDivergenze.push({ a, b });
      }
    }
  }

  if (checks.length > 0) {
    const { error: checksError } = await supabase.from("correlation_checks").insert(checks);
    if (checksError) console.error("Errore insert correlation_checks:", checksError);
  }

  for (const { a, b } of nuoveDivergenze) {
    await notifica("divergenza", [a, b], `Divergenza ${a} ↔ ${b}`, "Non seguono più la correlazione attesa.", "/storico/");
  }

  const avvisiLivelli = await avvisiKeyLevel(supabase, quotes, prezziPrec);

  return new Response(
    JSON.stringify({
      ok: true,
      gruppo,
      richiesti: simboliGruppo.length + simboliYahoo.length,
      ricevuti: quotes.length,
      simboli_ricevuti: quotes.map((q) => q.symbol),
      errori,
      checks: checks.length,
      nuove_divergenze: nuoveDivergenze.length,
      avvisi_livelli: avvisiLivelli,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
