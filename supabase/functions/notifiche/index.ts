// Supabase Edge Function — runtime Deno.
// Centro delle notifiche: Telegram (opzionale) + notifiche push sul telefono/PC.
//
// Azioni (campo "action" del body):
//   stato       → cosa è configurato e quanti dispositivi sono iscritti
//   iscrivi     → salva la sottoscrizione push di un dispositivo (dal sito)
//   disiscrivi  → la rimuove
//   test        → manda una notifica di prova a tutti i canali
//   invia       → manda {titolo, corpo, url} (solo chiamate interne con la chiave di servizio)
//   controlla   → avvisa delle notizie ad alto impatto nei prossimi 25 minuti (cron ogni 15 min)
//   briefing    → riepilogo del mattino scritto dall'AI (cron alle 08:00 ora italiana)
//
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (push),
//          TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (opzionali), GEMINI_API_KEY, GEMINI_MODEL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { inviaPush } from "../_shared/webpush.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface Messaggio {
  titolo: string;
  corpo: string;
  url?: string;
}

// ---------------------------------------------------------------- canali

async function inviaTelegram(m: Messaggio): Promise<boolean> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `<b>${escapeHtml(m.titolo)}</b>\n${escapeHtml(m.corpo)}`,
        parse_mode: "HTML",
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function inviaTuttiPush(supabase: any, m: Messaggio): Promise<{ inviati: number; rimossi: number }> {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return { inviati: 0, rimossi: 0 };
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

  const { data } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth");
  let inviati = 0;
  let rimossi = 0;
  for (const sub of data ?? []) {
    const status = await inviaPush(sub, m, { subject, publicKey, privateKey }).catch(() => 0);
    if (status >= 200 && status < 300) inviati++;
    else if (status === 404 || status === 410) {
      // dispositivo non più valido (app disinstallata o permesso revocato)
      await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      rimossi++;
    }
  }
  return { inviati, rimossi };
}

async function notificaTutti(supabase: any, m: Messaggio) {
  const [telegram, push] = await Promise.all([inviaTelegram(m), inviaTuttiPush(supabase, m)]);
  return { telegram, push_inviati: push.inviati, push_rimossi: push.rimossi };
}

// ---------------------------------------------------------------- utilità

const fmtOra = (iso: string) =>
  new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

const oraRoma = (now = new Date()) =>
  Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).format(now)
  ) % 24;

const giornoRoma = (d: Date | string) =>
  new Date(d).toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });

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
  return testo as string;
}

// ---------------------------------------------------------------- azioni

interface Preferenze {
  asset_filtro: string[] | null;
  notizie_attive: boolean;
  notizie_importanza_minima: "alta" | "media";
  divergenze_attive: boolean;
  livelli_attivi: boolean;
  riepilogo_attivo: boolean;
  modalita: "istantanea" | "oraria";
  orario_da: number;
  orario_a: number;
}

const PREFERENZE_DEFAULT: Preferenze = {
  asset_filtro: null,
  notizie_attive: true,
  notizie_importanza_minima: "alta",
  divergenze_attive: true,
  livelli_attivi: true,
  riepilogo_attivo: true,
  modalita: "istantanea",
  orario_da: 7,
  orario_a: 22,
};

async function leggiPreferenze(supabase: any): Promise<Preferenze> {
  const { data } = await supabase.from("notifiche_impostazioni").select("*").eq("id", 1).maybeSingle();
  return data ? { ...PREFERENZE_DEFAULT, ...data } : PREFERENZE_DEFAULT;
}

/** True se l'ora attuale (Roma) è dentro [orario_da, orario_a); gestisce anche una fascia che attraversa la mezzanotte. */
function dentroFinestra(pref: Preferenze, now = new Date()): boolean {
  const h = oraRoma(now);
  const { orario_da: a, orario_a: b } = pref;
  if (a === b) return true; // fascia di 24 ore
  return a < b ? h >= a && h < b : h >= a || h < b;
}

type Categoria = "notizia" | "divergenza" | "livello";

/**
 * Punto unico da cui passa ogni notifica (notizie, divergenze, livelli):
 * applica interruttore di categoria, filtro asset, e modalità istantanea
 * (con fascia oraria) oppure oraria (accodata per il riepilogo).
 */
async function instradaNotifica(
  supabase: any,
  categoria: Categoria,
  asset: string | string[] | null | undefined,
  msg: Messaggio
): Promise<{ esito: string; telegram?: boolean; push_inviati?: number; push_rimossi?: number }> {
  const pref = await leggiPreferenze(supabase);

  const attiva =
    categoria === "notizia" ? pref.notizie_attive : categoria === "divergenza" ? pref.divergenze_attive : pref.livelli_attivi;
  if (!attiva) return { esito: "categoria_disattivata" };

  if (pref.asset_filtro && pref.asset_filtro.length > 0) {
    const lista = Array.isArray(asset) ? asset : asset ? [asset] : [];
    if (!lista.some((a) => pref.asset_filtro!.includes(a))) return { esito: "asset_escluso" };
  }

  if (pref.modalita === "oraria") {
    await supabase.from("notifiche_coda").insert({
      categoria,
      asset: Array.isArray(asset) ? asset[0] ?? null : asset ?? null,
      titolo: msg.titolo,
      corpo: msg.corpo,
      url: msg.url ?? null,
    });
    return { esito: "accodata" };
  }

  if (!dentroFinestra(pref)) return { esito: "silenziata" };

  const invio = await notificaTutti(supabase, msg);
  return { esito: "inviata", ...invio };
}

/** Unisce la coda accumulata in modalità "oraria" in un unico messaggio. */
async function flushCoda(supabase: any) {
  const pref = await leggiPreferenze(supabase);
  if (pref.modalita !== "oraria") return { skip: "modalità istantanea" };
  if (!dentroFinestra(pref)) return { skip: "fuori dalla fascia oraria" };

  const { data: coda } = await supabase
    .from("notifiche_coda")
    .select("id, categoria, titolo")
    .order("creato_at", { ascending: true });
  if (!coda || coda.length === 0) return { ok: true, inviati: 0 };

  const ETICHETTE: Record<string, string> = { notizia: "notizie", divergenza: "divergenze", livello: "livelli" };
  const conteggio: Record<string, number> = {};
  for (const c of coda) conteggio[c.categoria] = (conteggio[c.categoria] ?? 0) + 1;
  const sommario = Object.entries(conteggio)
    .map(([k, v]) => `${v} ${ETICHETTE[k] ?? k}`)
    .join(" · ");

  const MAX_RIGHE = 6;
  const righe = coda.slice(0, MAX_RIGHE).map((c: any) => `• ${c.titolo}`);
  const extra = coda.length > MAX_RIGHE ? `\n+ altri ${coda.length - MAX_RIGHE}` : "";

  const esito = await notificaTutti(supabase, {
    titolo: "Aggiornamento orario",
    corpo: `${sommario}\n${righe.join("\n")}${extra}`,
    url: "/storico/",
  });

  await supabase.from("notifiche_coda").delete().in("id", coda.map((c: any) => c.id));
  return { ok: true, inviati: coda.length, ...esito };
}

const SIMBOLI_CHIAVE = ["XAUUSD", "DXY", "EURUSD", "XAGUSD", "USOIL", "SPX", "DJI", "NDQ"];

async function controllaNotizie(supabase: any) {
  const pref = await leggiPreferenze(supabase);
  if (!pref.notizie_attive) return { eventi_esaminati: 0, skip: "categoria disattivata" };

  const ora = new Date();
  const tra25 = new Date(ora.getTime() + 25 * 60 * 1000);
  let query = supabase
    .from("news_events")
    .select("id, titolo, orario, importanza, asset_impattati")
    .is("notificato_at", null)
    .gte("orario", ora.toISOString())
    .lte("orario", tra25.toISOString());
  query =
    pref.notizie_importanza_minima === "media"
      ? query.in("importanza", ["alta", "media"])
      : query.eq("importanza", "alta");

  const { data: eventi, error } = await query;
  if (error) throw new Error(error.message);

  const esiti: Record<string, number> = {};
  for (const e of eventi ?? []) {
    const assets = e.asset_impattati?.length ? ` · ${e.asset_impattati.slice(0, 4).join(", ")}` : "";
    const r = await instradaNotifica(supabase, "notizia", e.asset_impattati, {
      titolo: `Notizia ${e.importanza === "alta" ? "importante" : "rilevante"} alle ${fmtOra(e.orario)}`,
      corpo: `${e.titolo}${assets}`,
      url: "/calendario/",
    });
    esiti[r.esito] = (esiti[r.esito] ?? 0) + 1;
    await supabase.from("news_events").update({ notificato_at: new Date().toISOString() }).eq("id", e.id);
  }
  return { eventi_esaminati: eventi?.length ?? 0, dettaglio: esiti };
}

async function riepilogoMattino(supabase: any, forza: boolean) {
  const pref = await leggiPreferenze(supabase);
  if (!pref.riepilogo_attivo) return { skip: "riepilogo disattivato" };
  if (!forza && oraRoma() !== 8) return { skip: "non sono le 08:00 in Italia" };

  const { data: ultimo } = await supabase
    .from("briefings")
    .select("ts")
    .order("ts", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!forza && ultimo && giornoRoma(ultimo.ts) === giornoRoma(new Date())) {
    return { skip: "riepilogo di oggi già inviato" };
  }

  const tra16h = new Date(Date.now() + 16 * 3600 * 1000).toISOString();
  const [prezzi, notizie, livelli, tecnico] = await Promise.all([
    supabase.from("latest_prices").select("symbol, price, change_pct").in("symbol", SIMBOLI_CHIAVE),
    supabase
      .from("news_events")
      .select("titolo, orario, importanza, asset_impattati")
      .in("importanza", ["alta", "media"])
      .gte("orario", new Date().toISOString())
      .lte("orario", tra16h)
      .order("orario", { ascending: true })
      .limit(12),
    supabase.from("key_levels").select("prezzo, timeframe, tipo, note").eq("asset_symbol", "XAUUSD"),
    supabase
      .from("latest_technical_signals")
      .select("direzione_alligator, prezzo_vs_ema200, input_direzionale")
      .eq("asset_symbol", "XAUUSD")
      .eq("timeframe", "M30")
      .maybeSingle(),
  ]);

  const prezzoOro = prezzi.data?.find((p: any) => p.symbol === "XAUUSD")?.price;
  const dati = {
    data: new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" }),
    mercati: (prezzi.data ?? []).map((p: any) => ({ simbolo: p.symbol, prezzo: p.price, variazione_pct: p.change_pct })),
    notizie_di_oggi: (notizie.data ?? []).map((n: any) => ({
      titolo: n.titolo,
      importanza: n.importanza,
      orario_italiano: fmtOra(n.orario),
      asset: n.asset_impattati?.slice(0, 4) ?? [],
    })),
    livelli_oro_vicini: (livelli.data ?? [])
      .map((k: any) => ({
        tipo: k.tipo,
        timeframe: k.timeframe,
        prezzo: k.prezzo,
        distanza_pct: prezzoOro ? Number((((k.prezzo - prezzoOro) / prezzoOro) * 100).toFixed(2)) : null,
      }))
      .sort((a: any, b: any) => Math.abs(a.distanza_pct ?? 1e9) - Math.abs(b.distanza_pct ?? 1e9))
      .slice(0, 5),
    segnale_tecnico_oro_m30: tecnico.data ?? "non disponibile",
  };

  const prompt = `Sei un assistente che prepara il RIEPILOGO DEL MATTINO per un trader che segue una metodologia
basata su correlazioni tra asset, orari operativi e key level. Scrivi in ITALIANO, massimo 140 parole,
in 3 blocchetti brevi separati da una riga vuota: (1) come si presentano i mercati, (2) notizie di oggi
da tenere d'occhio con l'orario, (3) livelli dell'oro da monitorare.
Regole: usa SOLO i dati JSON; nessun consiglio di acquisto/vendita né linguaggio da segnale; gli orari
sono già in ora italiana; se un dato manca dillo. Niente titoli né elenchi puntati, solo testo.

Dati:
${JSON.stringify(dati, null, 2)}`;

  const testo = await chiamaGemini(prompt);
  await supabase.from("briefings").insert({ testo, dati_json: dati });

  const sintesi = testo.replace(/\s+/g, " ").slice(0, 160) + (testo.length > 160 ? "…" : "");
  const esito = await notificaTutti(supabase, { titolo: "Riepilogo del mattino", corpo: sintesi, url: "/" });
  return { ok: true, ...esito };
}

// ---------------------------------------------------------------- handler

async function handler(req: Request): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);
  const body = await req.json().catch(() => ({}));

  try {
    switch (body.action) {
      case "stato": {
        const { count } = await supabase.from("push_subscriptions").select("endpoint", { count: "exact", head: true });
        const { count: inCoda } = await supabase.from("notifiche_coda").select("id", { count: "exact", head: true });
        const preferenze = await leggiPreferenze(supabase);
        return json({
          ok: true,
          push_configurato: Boolean(Deno.env.get("VAPID_PUBLIC_KEY") && Deno.env.get("VAPID_PRIVATE_KEY")),
          telegram_configurato: Boolean(Deno.env.get("TELEGRAM_BOT_TOKEN") && Deno.env.get("TELEGRAM_CHAT_ID")),
          dispositivi_iscritti: count ?? 0,
          in_coda: inCoda ?? 0,
          preferenze,
        });
      }
      case "aggiorna": {
        const campi: Record<string, unknown> = {};
        const boolCampi = ["notizie_attive", "divergenze_attive", "livelli_attivi", "riepilogo_attivo"] as const;
        for (const c of boolCampi) {
          if (body[c] === undefined) continue;
          if (typeof body[c] !== "boolean") return json({ error: `Campo '${c}' deve essere booleano.` }, 400);
          campi[c] = body[c];
        }
        if (body.asset_filtro !== undefined) {
          if (body.asset_filtro !== null && !Array.isArray(body.asset_filtro)) {
            return json({ error: "Campo 'asset_filtro' deve essere un array o null." }, 400);
          }
          campi.asset_filtro = body.asset_filtro;
        }
        if (body.notizie_importanza_minima !== undefined) {
          if (!["alta", "media"].includes(body.notizie_importanza_minima)) {
            return json({ error: "Campo 'notizie_importanza_minima' deve essere 'alta' o 'media'." }, 400);
          }
          campi.notizie_importanza_minima = body.notizie_importanza_minima;
        }
        if (body.modalita !== undefined) {
          if (!["istantanea", "oraria"].includes(body.modalita)) {
            return json({ error: "Campo 'modalita' deve essere 'istantanea' o 'oraria'." }, 400);
          }
          campi.modalita = body.modalita;
        }
        for (const c of ["orario_da", "orario_a"] as const) {
          if (body[c] === undefined) continue;
          if (!Number.isInteger(body[c]) || body[c] < 0 || body[c] > 23) {
            return json({ error: `Campo '${c}' deve essere un intero tra 0 e 23.` }, 400);
          }
          campi[c] = body[c];
        }
        if (Object.keys(campi).length === 0) return json({ error: "Nessun campo da aggiornare." }, 400);

        const { error } = await supabase.from("notifiche_impostazioni").upsert({ id: 1, ...campi });
        if (error) throw new Error(error.message);
        return json({ ok: true, preferenze: await leggiPreferenze(supabase) });
      }
      case "iscrivi": {
        const s = body.subscription;
        if (!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth) return json({ error: "Sottoscrizione non valida." }, 400);
        if (typeof s.endpoint !== "string" || !s.endpoint.startsWith("https://")) return json({ error: "Endpoint non valido." }, 400);
        const { error } = await supabase.from("push_subscriptions").upsert(
          {
            endpoint: s.endpoint,
            p256dh: s.keys.p256dh,
            auth: s.keys.auth,
            user_agent: String(body.userAgent ?? "").slice(0, 200),
          },
          { onConflict: "endpoint" }
        );
        if (error) throw new Error(error.message);
        return json({ ok: true });
      }
      case "disiscrivi": {
        if (!body.endpoint) return json({ error: "Endpoint mancante." }, 400);
        await supabase.from("push_subscriptions").delete().eq("endpoint", body.endpoint);
        return json({ ok: true });
      }
      case "test": {
        const esito = await notificaTutti(supabase, {
          titolo: "Notifica di prova",
          corpo: "Le notifiche di Analizzatore H24 funzionano.",
          url: "/impostazioni/",
        });
        return json({ ok: true, ...esito });
      }
      case "invia": {
        // Solo chiamate interne (ingest-prices): serve la chiave di servizio.
        if (req.headers.get("Authorization") !== `Bearer ${serviceKey}`) return json({ error: "Non autorizzato." }, 401);
        if (!body.titolo || !body.corpo) return json({ error: "titolo e corpo obbligatori." }, 400);
        const categoria: Categoria = ["notizia", "divergenza", "livello"].includes(body.categoria)
          ? body.categoria
          : "notizia";
        const esito = await instradaNotifica(supabase, categoria, body.asset ?? null, {
          titolo: body.titolo,
          corpo: body.corpo,
          url: body.url,
        });
        return json({ ok: true, ...esito });
      }
      case "controlla":
        return json({ ok: true, ...(await controllaNotizie(supabase)) });
      case "briefing":
        return json({ ok: true, ...(await riepilogoMattino(supabase, body.forza === true)) });
      case "flush_coda":
        return json({ ok: true, ...(await flushCoda(supabase)) });
      default:
        return json({ error: "action non riconosciuta." }, 400);
    }
  } catch (e) {
    return json({ error: String(e) }, 502);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const res = await handler(req);
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
});
