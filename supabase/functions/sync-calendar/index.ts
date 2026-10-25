// Supabase Edge Function — runtime Deno.
// Scarica il feed settimanale pubblico (non ufficiale) di ForexFactory e
// popola/aggiorna la tabella `news_events`. Il feed limita a 2
// richieste/5 minuti: per questo va chiamato poche volte al giorno
// (vedi il cron in supabase/migrations/0002_cron.sql, ogni 6 ore).
//
// Deploy: supabase functions deploy sync-calendar
// Nessun secret richiesto: il feed è pubblico.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const FEED_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

// Mappa valuta → simboli delle nostre watchlist impattati da quella valuta.
const VALUTA_TO_ASSET: Record<string, string[]> = {
  USD: ["EURUSD","AUDUSD","NZDUSD","GBPUSD","USDCAD","USDCHF","XAUUSD","DXY"],
  EUR: ["EURUSD"],
  GBP: ["GBPUSD","GBPJPY"],
  JPY: ["AUDJPY","NZDJPY","CADJPY","GBPJPY"],
  AUD: ["AUDUSD","AUDJPY"],
  NZD: ["NZDUSD","NZDJPY"],
  CAD: ["USDCAD","CADJPY"],
  CHF: ["USDCHF"],
};

const IMPACT_TO_IMPORTANZA: Record<string, string> = {
  High: "alta",
  Medium: "media",
  Low: "bassa",
  Holiday: "bassa",
};

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let eventi: any[];
  try {
    const res = await fetch(FEED_URL);
    if (!res.ok) throw new Error(`Feed non raggiungibile: HTTP ${res.status}`);
    eventi = await res.json();
  } catch (e) {
    // Il feed non è ufficiale e può cambiare/interrompersi: se succede,
    // valuta l'alternativa citata nel README (Finnhub economic calendar).
    return new Response(JSON.stringify({ error: String(e) }), { status: 502 });
  }

  const righe = eventi
    .filter((e) => e.title && e.date)
    .map((e) => {
      const valuta = (e.country ?? "").toUpperCase();
      return {
        titolo: e.title,
        asset_impattati: VALUTA_TO_ASSET[valuta] ?? null,
        orario: new Date(e.date).toISOString(),
        importanza: IMPACT_TO_IMPORTANZA[e.impact] ?? "bassa",
        valore_atteso: e.forecast ?? null,
        valore_reale: e.actual ?? null,
        fonte_evento_id: `${valuta}-${e.title}-${e.date}`,
      };
    });

  if (righe.length > 0) {
    const { error } = await supabase
      .from("news_events")
      .upsert(righe, { onConflict: "fonte_evento_id" });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
  }

  return new Response(JSON.stringify({ ok: true, eventi: righe.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
