// Supabase Edge Function — runtime Deno.
// Riceve {symbol} (report on-demand) oppure {modalita:"batch_orario"}
// (report automatico per l'asset più "attivo" di ciascuna watchlist,
// pensato per il cron orario — vedi supabase/migrations/0002_cron.sql).
//
// Deploy:   supabase functions deploy generate-report
// Secrets:  supabase secrets set GEMINI_API_KEY=xxxx
//           supabase secrets set GEMINI_MODEL=gemini-3.1-flash-lite   (opzionale)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { calcolaScenario } from "../_shared/scenario.ts";

// Le funzioni vengono chiamate direttamente dal browser: servono gli header CORS.
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

const NOTE_CORRELAZIONI: Record<string, string> = {
  EURUSD: "Se cresce uno scende l'altro e viceversa.",
  AUDUSD: "Cresce con il crescere dell'oro e viceversa.",
  NZDUSD: "Cresce con il crescere dell'oro e viceversa.",
  XAUUSD: "Segue materie prime e metalli; USD si correla negativamente con il petrolio.",
  AUDJPY: "Cresce con il crescere dell'oro e dei metalli e viceversa.",
  NZDJPY: "Cresce con il crescere dell'oro e dei metalli e viceversa.",
  XBRUSD: "Se sale il petrolio scende il dollaro e viceversa.",
  USDCAD: "Cresce al diminuire del prezzo del petrolio e viceversa.",
  GBPUSD: "Cresce al crescere del prezzo del petrolio e viceversa.",
  CADJPY: "Cresce al crescere del prezzo del petrolio e viceversa.",
  GBPJPY: "Cresce al crescere del prezzo del petrolio e viceversa.",
  USDCHF: "Sono 2 asset di rifugio: se sale uno scende l'altro e viceversa.",
};

// Fasce orarie (versione compatta di lib/domain/schedule.ts — tienile
// allineate se modifichi una delle due copie).
const SCHEDULE = [
  { orario: "00:00", titolo: "Notizie asiatiche/oceaniche", nota: "Rilevanti soprattutto per ORO, NZD/USD, AUD/USD, NZD/JPY, AUD/JPY." },
  { orario: "09:00", titolo: "Mattina", nota: "Andamento generale, segna eventuali key level." },
  { orario: "13:00", titolo: "Fine pausa pranzo istituzioni", nota: "Primi movimenti significativi." },
  { orario: "14:00", titolo: "Apertura Wall Street", nota: "Aumento della liquidità." },
  { orario: "14:30", titolo: "Calendario economico principale", nota: "Notizie più importanti della giornata." },
  { orario: "15:30", titolo: "Apertura mercato azionario USA", nota: "Incrocia Indicatori Oro e Indici Anti USD." },
  { orario: "16:00", titolo: "Maturazione correlazioni Azionario-USD", nota: "Bussola per lo scenario USD-Indici-XAU in corso." },
  { orario: "20:00", titolo: "Comunicazioni FED", nota: "Alta volatilità attesa." },
  { orario: "20:30", titolo: "Eventuali conferenze", nota: "Possibili follow-up FED." },
];

// Gli orari della tabella sono in ORARIO ITALIANO, ma il server gira in UTC.
function minutiRoma(now: Date): number {
  const parti = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = Number(parti.find((x) => x.type === "hour")!.value) % 24;
  const m = Number(parti.find((x) => x.type === "minute")!.value);
  return h * 60 + m;
}

function faseCorrente(now: Date) {
  const minutiOra = minutiRoma(now);
  const toMin = (o: string) => { const [h, m] = o.split(":").map(Number); return h * 60 + m; };
  const sorted = [...SCHEDULE].sort((a, b) => toMin(a.orario) - toMin(b.orario));
  let attuale = sorted[sorted.length - 1];
  for (const f of sorted) if (toMin(f.orario) <= minutiOra) attuale = f;
  return attuale;
}


const ASSET_SCENARIO = ["XAUUSD", "DXY", "DJI", "SPX", "NDQ"];

/** Valori del Pitchfork all'istante t (secondi): mediana e linee parallele per i pivot 2 e 3. */
function pitchforkAt(pivots: { t: number; p: number }[], t: number) {
  const [p1, p2, p3] = pivots;
  const m = ((p2.p + p3.p) / 2 - p1.p) / ((p2.t + p3.t) / 2 - p1.t);
  const su = (a: { t: number; p: number }) => a.p + m * (t - a.t);
  const l2 = su(p2);
  const l3 = su(p3);
  return { mediana: su(p1), alta: Math.max(l2, l3), bassa: Math.min(l2, l3) };
}

const pct = (a: number, prezzo: number) => Number((((a - prezzo) / prezzo) * 100).toFixed(2));

/** Riduce le analisi tecniche (Fibonacci/Pitchfork) a quello che serve all'AI: solo i livelli più vicini al prezzo. */
function sintetizzaAnalisi(righe: any[], prezzo: number | null) {
  if (!prezzo) return { fibonacci: "non disponibile", pitchfork: "non disponibile", struttura: "non disponibile", emaCross: "non disponibile" };
  const fib = righe
    .filter((r) => r.tipo === "fibonacci")
    .map((r) => ({
      timeframe: r.timeframe,
      direzione_gamba: r.dati.direzione,
      livelli_vicini: r.dati.livelli
        .map((l: any) => ({ rapporto: l.rapporto, prezzo: Number(l.prezzo.toFixed(4)), distanza_pct: pct(l.prezzo, prezzo) }))
        .sort((a: any, b: any) => Math.abs(a.distanza_pct) - Math.abs(b.distanza_pct))
        .slice(0, 3),
      zone_confluenza_vicine: (r.dati.zone ?? []).slice(0, 2).map((z: any) => ({
        prezzo: Number(z.prezzo.toFixed(4)),
        distanza_pct: pct(z.prezzo, prezzo),
        fonti: z.fonti,
      })),
    }));
  const pf = righe.find((r) => r.tipo === "pitchfork");
  const adesso = Math.floor(Date.now() / 1000);
  const pitchfork = pf
    ? (() => {
        const v = pitchforkAt(pf.dati.pivots, adesso);
        return {
          timeframe: pf.timeframe,
          tipo: pf.dati.tipo,
          mediana: { prezzo: Number(v.mediana.toFixed(4)), distanza_pct: pct(v.mediana, prezzo) },
          linea_alta: { prezzo: Number(v.alta.toFixed(4)), distanza_pct: pct(v.alta, prezzo) },
          linea_bassa: { prezzo: Number(v.bassa.toFixed(4)), distanza_pct: pct(v.bassa, prezzo) },
        };
      })()
    : "non disponibile";

  const st = righe.find((r) => r.tipo === "struttura");
  const struttura = st ? { timeframe: st.timeframe, trend: st.dati.trend } : "non disponibile";

  const ec = righe.find((r) => r.tipo === "ema_cross");
  const emaCross = ec
    ? {
        trend: ec.dati.trend,
        incrocio_recente: ec.dati.incrocio !== "nessuno" ? ec.dati.incrocio : null,
        ema50: Number(ec.dati.ema50.toFixed(4)),
        ema200: Number(ec.dati.ema200.toFixed(4)),
      }
    : "non disponibile";

  return { fibonacci: fib.length ? fib : "non disponibile", pitchfork, struttura, emaCross };
}

async function costruisciPayload(supabase: any, symbol: string) {
  const watchlistDiAppartenenza = Object.entries(WATCHLISTS).find(([, s]) =>
    s.includes(symbol)
  )?.[0];
  const correlatiSimboli = Array.from(
    new Set(Object.values(WATCHLISTS).filter((s) => s.includes(symbol)).flat())
  ).filter((s) => s !== symbol);

  const [prezzo, correlati, statiCorrelazione, news, keyLevels, segnaleTecnico, prezziScenario, analisi] = await Promise.all([
    supabase.from("latest_prices").select("price, change_pct").eq("symbol", symbol).maybeSingle(),
    supabase.from("latest_prices").select("symbol, price, change_pct").in("symbol", correlatiSimboli),
    supabase.from("latest_correlation_checks").select("correlato_symbol, stato").eq("asset_symbol", symbol),
    supabase
      .from("news_events")
      .select("titolo, orario, importanza")
      .contains("asset_impattati", [symbol])
      .in("importanza", ["alta", "media"])
      .gte("orario", new Date().toISOString())
      .order("orario", { ascending: true })
      .limit(5),
    supabase.from("key_levels").select("prezzo, timeframe, tipo, note").eq("asset_symbol", symbol),
    supabase
      .from("latest_technical_signals")
      .select("direzione_alligator, posizione_alligator, prezzo_vs_ema200, input_direzionale, rsi, rsi_divergenza, macd_istogramma, bollinger_superiore, bollinger_media, bollinger_inferiore, ts")
      .eq("asset_symbol", symbol)
      .eq("timeframe", "M30")
      .maybeSingle(),
    supabase.from("latest_prices").select("symbol, change_pct").in("symbol", ["DXY", "XAUUSD", "DJI", "SPX", "NDQ"]),
    supabase.from("analisi_tecniche").select("tipo, timeframe, dati").eq("asset_symbol", symbol),
  ]);

  const pc = (sym: string) => prezziScenario.data?.find((p: any) => p.symbol === sym)?.change_pct ?? null;
  const scenario = calcolaScenario({
    usd: pc("DXY"),
    xau: pc("XAUUSD"),
    indici: [pc("DJI"), pc("SPX"), pc("NDQ")],
  });
  const tecniche = sintetizzaAnalisi(analisi.data ?? [], prezzo.data?.price ?? null);

  return {
    asset: symbol,
    watchlist: watchlistDiAppartenenza ?? null,
    nota_correlazione_diretta: NOTE_CORRELAZIONI[symbol] ?? null,
    prezzo_attuale: prezzo.data?.price ?? null,
    variazione_pct: prezzo.data?.change_pct ?? null,
    fase_oraria: faseCorrente(new Date()),
    scenario_usd_indici_xau: ASSET_SCENARIO.includes(symbol)
      ? {
          scenario: scenario.id,
          fase: scenario.stato,
          descrizione: scenario.titolo,
          probabilita_storica: scenario.probabilita,
          variazioni_pct: { dxy: scenario.usd, oro: scenario.xau, indici_media: scenario.indici },
        }
      : "non pertinente per questo asset",
    fibonacci: tecniche.fibonacci,
    pitchfork: tecniche.pitchfork,
    alligator_ema200_m30: segnaleTecnico.data
      ? {
          direzione_alligator: segnaleTecnico.data.direzione_alligator,
          posizione_prezzo_su_alligator: segnaleTecnico.data.posizione_alligator,
          prezzo_vs_ema200: segnaleTecnico.data.prezzo_vs_ema200,
          input_direzionale: segnaleTecnico.data.input_direzionale,
          calcolato_il: segnaleTecnico.data.ts,
        }
      : "non ancora calcolato per questo asset",
    indicatori_aggiuntivi_m30: segnaleTecnico.data
      ? {
          rsi_14: segnaleTecnico.data.rsi,
          rsi_divergenza: segnaleTecnico.data.rsi_divergenza,
          macd_istogramma: segnaleTecnico.data.macd_istogramma,
          bollinger:
            prezzo.data?.price && segnaleTecnico.data.bollinger_superiore
              ? prezzo.data.price > segnaleTecnico.data.bollinger_superiore
                ? "prezzo sopra la banda superiore"
                : prezzo.data.price < segnaleTecnico.data.bollinger_inferiore
                ? "prezzo sotto la banda inferiore"
                : "prezzo dentro le bande"
              : "non disponibile",
        }
      : "non ancora calcolato per questo asset",
    struttura_mercato_h4: tecniche.struttura,
    trend_lungo_periodo_ema_daily: tecniche.emaCross,
    asset_correlati: (correlati.data ?? []).map((c: any) => ({
      symbol: c.symbol,
      variazione_pct: c.change_pct,
      stato_correlazione:
        statiCorrelazione.data?.find((s: any) => s.correlato_symbol === c.symbol)?.stato ??
        "non_disponibile",
      nota: NOTE_CORRELAZIONI[c.symbol] ?? null,
    })),
    // Orari convertiti in ORA ITALIANA (nel database sono in UTC).
    prossime_notizie: (news.data ?? []).map((n: any) => ({
      titolo: n.titolo,
      importanza: n.importanza,
      orario_italiano: new Intl.DateTimeFormat("it-IT", {
        timeZone: "Europe/Rome",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(n.orario)),
    })),
    // I 6 livelli più vicini al prezzo; distanza_pct negativa = livello sotto il prezzo.
    key_level_vicini: (keyLevels.data ?? [])
      .map((k: any) => ({
        tipo: k.tipo,
        timeframe: k.timeframe,
        prezzo: k.prezzo,
        origine: k.note ?? "manuale",
        distanza_pct: prezzo.data?.price
          ? Number((((k.prezzo - prezzo.data.price) / prezzo.data.price) * 100).toFixed(2))
          : null,
      }))
      .sort((a: any, b: any) => Math.abs(a.distanza_pct ?? 1e9) - Math.abs(b.distanza_pct ?? 1e9))
      .slice(0, 6),
  };
}

function costruisciPrompt(payload: any): string {
  return `Sei un assistente che riassume dati di mercato già calcolati per un trader
che segue una metodologia basata su correlazioni tra asset, orari operativi
e key level. Scrivi in ITALIANO un'analisi discorsiva e concisa (massimo
150-200 parole) dell'asset ${payload.asset}, usando SOLO i dati JSON forniti
qui sotto — non inventare prezzi, notizie o livelli non presenti nel JSON.

Regole tassative:
- Non dare MAI indicazioni di acquisto/vendita né linguaggio da segnale di
  trading ("compra", "vendi", "entra long/short"). Sei uno strumento
  informativo, non un consulente finanziario.
- Se un dato manca (es. variazione_pct null), dillo esplicitamente invece
  di inventarlo.
- Se ci sono asset con stato_correlazione = "divergente", segnalali come
  anomalia da tenere d'occhio.
- Cita la fase oraria attuale e cosa comporta di solito.
- Se ci sono notizie imminenti rilevanti, menzionale con il relativo orario
  (campo orario_italiano, già in ora italiana: non convertirlo).
- Se ci sono key level vicini (campo key_level_vicini), indicane il timeframe e la distanza
  percentuale dal prezzo attuale (negativa = livello sotto il prezzo).
- Se scenario_usd_indici_xau è presente e la fase è "maturo" o "chiuso", indica quale dei 3 scenari
  (A, B, C) è in corso e cosa implica; se la fase è "in_attesa" o "in_formazione" dì che non è ancora definito.
- Cita Fibonacci o Pitchfork SOLO se un livello o una zona di confluenza è entro 0,5% dal prezzo
  (campo distanza_pct); altrimenti ignorali. Le zone di confluenza sono quelle più significative.
- Se il campo alligator_ema200_m30 contiene dati (non la stringa "non ancora
  calcolato"), menziona se c'è confluenza rialzista/ribassista o nessuna
  confluenza, sempre in tono informativo.
- Se indicatori_aggiuntivi_m30 contiene dati, cita RSI solo se c'è una
  divergenza (rsi_divergenza diverso da "nessuna"); cita il MACD solo se il
  suo istogramma concorda o contraddice chiaramente l'Alligator; cita le
  Bollinger solo se il prezzo è sopra o sotto le bande (non se è "dentro").
- Se struttura_mercato_h4 contiene dati, cita il trend H4 solo se è diverso
  da "laterale" e solo se concorda o contraddice l'Alligator M30.
- Se trend_lungo_periodo_ema_daily contiene dati, cita il trend di lungo
  periodo (EMA 50/200 Daily) e se c'è stato un incrocio recente
  (incrocio_recente diverso da null).

Dati:
${JSON.stringify(payload, null, 2)}`;
}

async function chiamaGemini(prompt: string, apiKey: string, model: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const testo = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!testo) throw new Error("Risposta Gemini senza testo utilizzabile.");
  return testo as string;
}

async function generaReportPerSymbol(
  supabase: any,
  symbol: string,
  apiKey: string,
  model: string
): Promise<string> {
  const payload = await costruisciPayload(supabase, symbol);
  const prompt = costruisciPrompt(payload);
  const testo = await chiamaGemini(prompt, apiKey, model);

  await supabase.from("analysis_reports").insert({
    asset_symbol: symbol,
    testo_generato_ai: testo,
    dati_json_input: payload,
  });

  return testo;
}

async function handler(req: Request): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const geminiModel = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.1-flash-lite";

  if (!geminiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY non configurata." }), {
      status: 500,
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const body = await req.json().catch(() => ({}));

  try {
    if (body.symbol) {
      const testo = await generaReportPerSymbol(supabase, body.symbol, geminiKey, geminiModel);
      return new Response(JSON.stringify({ testo }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (body.modalita === "batch_orario") {
      const risultati: Record<string, string> = {};
      for (const [nomeWatchlist, simboli] of Object.entries(WATCHLISTS)) {
        const { data } = await supabase
          .from("latest_prices")
          .select("symbol, change_pct")
          .in("symbol", simboli);
        if (!data || data.length === 0) continue;
        const top = data.reduce((a: any, b: any) =>
          Math.abs(b.change_pct ?? 0) > Math.abs(a.change_pct ?? 0) ? b : a
        );
        risultati[nomeWatchlist] = await generaReportPerSymbol(
          supabase,
          top.symbol,
          geminiKey,
          geminiModel
        );
      }
      return new Response(JSON.stringify({ ok: true, risultati }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Body atteso: {symbol} oppure {modalita:'batch_orario'}." }),
      { status: 400 }
    );
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
