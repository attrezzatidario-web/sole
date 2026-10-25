// Supabase Edge Function — runtime Deno.
// Scrive, con l'AI, un'analisi in italiano di UN segnale già ricostruito dall'app: cosa è successo,
// in che contesto di mercato è stato dato, quali notizie c'erano in quelle ore (dal calendario
// salvato nel database), e quanto è affidabile il risultato.
//
// L'app passa numeri già calcolati (esito, escursioni, contesto di prezzo): qui NON si ricalcola
// nulla e l'AI può citare solo ciò che riceve. Informativa, mai consigli di acquisto/vendita.
//
// Body: {"symbol":"XAUUSD","ts":1790000000,"segnale":{...},"esito":{...},"copia":{...},"mercato":{...}}
// Deploy: supabase functions deploy analisi-segnale
// Secrets: GEMINI_API_KEY, GEMINI_MODEL (come generate-report), SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (automatici)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FUSO = "Europe/Rome";
const risposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

export interface Notizia {
  titolo: string;
  ora: string; // ora italiana, HH:MM
  minuti_dal_messaggio: number; // negativo = prima del messaggio
  importanza: string;
}

export function formattaNotizie(righe: any[], tsSec: number): Notizia[] {
  return righe.map((r) => {
    const quando = new Date(r.orario);
    return {
      titolo: String(r.titolo),
      ora: quando.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: FUSO }),
      minuti_dal_messaggio: Math.round((quando.getTime() / 1000 - tsSec) / 60),
      importanza: String(r.importanza),
    };
  });
}

export function costruisciPrompt(dati: any, notizie: Notizia[]): string {
  return `Sei un assistente che commenta, in modo sobrio e onesto, UN segnale di trading di un gruppo Telegram che
un trader sta valutando. Scrivi in ITALIANO, massimo 190 parole, in 3 paragrafi brevi, senza elenchi puntati,
in tono informativo. MAI consigli di acquisto o vendita, MAI previsioni.

Usa SOLO i dati JSON qui sotto. Non inventare notizie, prezzi, orari o motivi. Cosa fare:
1. Racconta com'è andato il segnale in parole semplici (esito, tempi, R, escursione contro/a favore).
2. Metti il segnale nel suo contesto: movimento dei prezzi nelle ore prima, volatilità, e le notizie
   in "notizie" SOLO se presenti (citale con l'ora). Se "notizie" è vuoto, dillo in mezza frase senza
   supporre che non ci fossero eventi.
3. Segnala i punti deboli: se "uscita_rispetto_al_messaggio" è "prima" o il prezzo era già oltre il
   target quando il messaggio è stato scritto, di' chiaramente che il messaggio racconta un'operazione
   già conclusa e che chi leggeva non poteva più entrarci ("copia" lo conferma se "non_copiabile").
   Se "gia_aperta_dal_gruppo" è true, distingui l'esito per il gruppo da quello di chi copia.
   Cita anche che è una simulazione senza spread né slippage e con prezzi di una fonte che può differire
   da quelli del broker del gruppo.

Dati:
${JSON.stringify({ ...dati, notizie }, null, 2)}`;
}

async function chiamaGemini(prompt: string): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY non configurata.");
  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.1-flash-lite";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const testo = (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!testo) throw new Error("Risposta Gemini vuota.");
  return String(testo).trim();
}

async function handler(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  const symbol = String(body?.symbol ?? "");
  const ts = Number(body?.ts);
  if (!/^[A-Z0-9!]{3,10}$/.test(symbol) || !Number.isFinite(ts) || !body?.segnale || !body?.esito) {
    return risposta({ error: "Parametri mancanti o non validi (symbol, ts, segnale, esito)." }, 400);
  }
  if (JSON.stringify(body).length > 30000) return risposta({ error: "Richiesta troppo grande." }, 413);

  // notizie importanti per questo strumento da 3 ore prima a 6 ore dopo il messaggio
  let notizie: Notizia[] = [];
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data } = await supabase
      .from("news_events")
      .select("titolo, orario, importanza, asset_impattati")
      .gte("orario", new Date((ts - 3 * 3600) * 1000).toISOString())
      .lte("orario", new Date((ts + 6 * 3600) * 1000).toISOString())
      .in("importanza", ["alta", "media"])
      .contains("asset_impattati", [symbol])
      .order("orario", { ascending: true })
      .limit(8);
    notizie = formattaNotizie(data ?? [], ts);
  } catch (e) {
    console.error("Notizie non lette:", e); // l'analisi si fa lo stesso, senza notizie
  }

  const { segnale, esito, copia, mercato } = body;
  const dati = { strumento: symbol, segnale, esito, copia: copia ?? null, mercato_al_messaggio: mercato ?? null };
  try {
    const analisi = await chiamaGemini(costruisciPrompt(dati, notizie));
    return risposta({ ok: true, analisi, notizie });
  } catch (e) {
    return risposta({ error: `Analisi AI non disponibile: ${e}` }, 502);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const res = await handler(req);
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
});
