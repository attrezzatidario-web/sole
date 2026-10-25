// Supabase Edge Function — runtime Deno.
// Calcola il Volume Profile di un asset (distribuzione del volume scambiato
// per livello di prezzo, su una finestra di giorni) e chiede all'AI
// un'analisi scritta di cosa indicano POC e Value Area.
//
// IMPORTANTE sui dati: il forex/oro spot (XAUUSD compreso) è un mercato OTC,
// senza un volume centralizzato affidabile. Per questo:
//  - per XAUUSD si usa il volume REALE dei futures sull'oro (GC=F, COMEX) come
//    proxy — è la miglior fonte gratuita disponibile, ampiamente usata a questo
//    scopo, ma non è il volume esatto dello spot. Lo si segnala sempre in chiaro.
//  - per le coppie forex pure (EURUSD ecc.) il profilo NON è disponibile:
//    non esiste un volume reale affidabile e gratuito per questi strumenti.
//  - per argento, platino, rame, petrolio, indici: volume reale (futures/indice).
//
// Deploy: supabase functions deploy volume-profile
// Secrets: GEMINI_API_KEY, GEMINI_MODEL (stessi di generate-report)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Asset -> simbolo Yahoo da cui leggere il volume reale. XAUUSD è un caso
// speciale: usa i futures sull'oro solo per questa funzione (per i prezzi
// "live" dell'app, XAUUSD resta su Twelve Data — vedi ingest-prices).
const FONTE_VOLUME: Record<string, string> = {
  XAUUSD: "GC=F",
  XAGUSD: "SI=F",
  "PL1!": "PL=F",
  COPPER: "HG=F",
  USOIL: "CL=F",
  XBRUSD: "BZ=F",
  "BR1!": "BZ=F",
  DXY: "DX-Y.NYB",
  DJI: "^DJI",
  SPX: "^GSPC",
  NDQ: "^NDX",
};

interface CandelaVol {
  t: number;
  h: number;
  l: number;
  c: number;
  volume: number;
}

async function scaricaCandeleConVolume(symbol: string, giorni: number): Promise<CandelaVol[]> {
  const ySym = FONTE_VOLUME[symbol];
  if (!ySym) {
    throw new Error(
      "Volume reale non disponibile per questo asset: è una coppia forex (mercato OTC, nessun volume centralizzato)."
    );
  }
  const range = giorni <= 60 ? "3mo" : giorni <= 150 ? "1y" : "2y";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ySym
  )}?interval=1d&range=${range}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; AnalizzatoreH24/1.0)" },
  });
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const json = await res.json();
  const r = json?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r || !q) throw new Error("Yahoo: nessun dato disponibile.");

  const tutte: CandelaVol[] = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    if (q.high[i] == null || q.low[i] == null || q.close[i] == null) continue;
    tutte.push({ t: r.timestamp[i], h: q.high[i], l: q.low[i], c: q.close[i], volume: q.volume?.[i] ?? 0 });
  }
  const finestra = tutte.slice(-giorni);
  const volumeTotale = finestra.reduce((s, c) => s + c.volume, 0);
  if (volumeTotale <= 0) {
    throw new Error("Il fornitore dati non restituisce volumi utilizzabili per questo simbolo al momento.");
  }
  return finestra;
}

interface Secchio {
  da: number;
  a: number;
  volume: number;
}

function calcolaProfiloVolume(candele: CandelaVol[], numSecchi = 30) {
  const minP = Math.min(...candele.map((c) => c.l));
  const maxP = Math.max(...candele.map((c) => c.h));
  const range = maxP - minP;
  if (range <= 0) return null;
  const larghezza = range / numSecchi;
  const secchi: Secchio[] = Array.from({ length: numSecchi }, (_, i) => ({
    da: minP + i * larghezza,
    a: minP + (i + 1) * larghezza,
    volume: 0,
  }));

  for (const c of candele) {
    const estensione = c.h - c.l;
    if (estensione <= 0) {
      const idx = Math.min(numSecchi - 1, Math.max(0, Math.floor((c.c - minP) / larghezza)));
      secchi[idx].volume += c.volume;
      continue;
    }
    for (const s of secchi) {
      const sovrapposizione = Math.max(0, Math.min(c.h, s.a) - Math.max(c.l, s.da));
      if (sovrapposizione > 0) s.volume += c.volume * (sovrapposizione / estensione);
    }
  }

  const volumeTotale = secchi.reduce((a, s) => a + s.volume, 0);
  const pocIdx = secchi.reduce((best, s, i) => (s.volume > secchi[best].volume ? i : best), 0);

  let bassoIdx = pocIdx;
  let altoIdx = pocIdx;
  let volumeArea = secchi[pocIdx].volume;
  while (volumeArea < volumeTotale * 0.7 && (bassoIdx > 0 || altoIdx < numSecchi - 1)) {
    const volBasso = bassoIdx > 0 ? secchi[bassoIdx - 1].volume : -1;
    const volAlto = altoIdx < numSecchi - 1 ? secchi[altoIdx + 1].volume : -1;
    if (volAlto >= volBasso) {
      altoIdx++;
      volumeArea += secchi[altoIdx].volume;
    } else {
      bassoIdx--;
      volumeArea += secchi[bassoIdx].volume;
    }
  }

  return {
    secchi,
    volumeTotale,
    poc: (secchi[pocIdx].da + secchi[pocIdx].a) / 2,
    vah: secchi[altoIdx].a,
    val: secchi[bassoIdx].da,
  };
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
  return testo as string;
}

function costruisciPrompt(payload: any): string {
  return `Sei un assistente che spiega il Volume Profile di un asset a un trader che lo sta
guardando per la prima volta su questo strumento. Scrivi in ITALIANO, massimo 180 parole,
in tono informativo (MAI consigli di acquisto/vendita).

Spiega, usando SOLO i dati JSON forniti:
1. Dove si trova il prezzo attuale rispetto al POC (punto di maggior volume scambiato) e
   alla Value Area (VAH/VAL, la zona che contiene il 70% del volume).
2. Se il prezzo è DENTRO la Value Area (zona di "equilibrio", probabile range) o FUORI
   (zona meno scambiata, prezzo spesso più "veloce" in quella direzione).
3. Segnala eventuali zone a volume molto basso vicine al prezzo attuale (vuoti di volume,
   dove il prezzo tende a muoversi più rapidamente).
4. Ricorda in una riga, se fonte_volume.tipo è "proxy_futures", che il volume è quello dei
   futures collegati e non quello esatto dello spot.

Dati:
${JSON.stringify(payload, null, 2)}`;
}

async function handler(req: Request): Promise<Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const body = await req.json().catch(() => ({}));
  const symbol = body.symbol as string | undefined;
  const giorni = Number.isInteger(body.giorni) ? Math.min(180, Math.max(5, body.giorni)) : 30;

  if (!symbol) return new Response(JSON.stringify({ error: "Parametro 'symbol' mancante." }), { status: 400 });

  try {
    const candele = await scaricaCandeleConVolume(symbol, giorni);
    const profilo = calcolaProfiloVolume(candele);
    if (!profilo) {
      return new Response(JSON.stringify({ error: "Dati insufficienti per calcolare il profilo." }), { status: 502 });
    }

    const prezzoAttuale = candele[candele.length - 1].c;
    const payload = {
      asset: symbol,
      fonte_volume: {
        simbolo: FONTE_VOLUME[symbol],
        tipo: symbol === "XAUUSD" ? "proxy_futures" : "diretta",
      },
      finestra_giorni: giorni,
      prezzo_attuale: prezzoAttuale,
      poc: Number(profilo.poc.toFixed(4)),
      value_area_alta: Number(profilo.vah.toFixed(4)),
      value_area_bassa: Number(profilo.val.toFixed(4)),
      prezzo_dentro_value_area: prezzoAttuale >= profilo.val && prezzoAttuale <= profilo.vah,
      zone_a_basso_volume_vicine: profilo.secchi
        .map((s, i) => ({ ...s, i }))
        .filter((s) => s.volume < profilo.volumeTotale / profilo.secchi.length / 3)
        .filter((s) => Math.abs((s.da + s.a) / 2 - prezzoAttuale) / prezzoAttuale < 0.05)
        .slice(0, 5)
        .map((s) => Number(((s.da + s.a) / 2).toFixed(4))),
    };

    const analisi = await chiamaGemini(costruisciPrompt(payload)).catch(
      (e) => `(Analisi AI non disponibile: ${e})`
    );

    const risultato = {
      asset_symbol: symbol,
      finestra_giorni: giorni,
      fonte_volume: FONTE_VOLUME[symbol],
      poc: profilo.poc,
      vah: profilo.vah,
      val: profilo.val,
      prezzo_attuale: prezzoAttuale,
      buckets: profilo.secchi,
      analisi_ai: analisi,
      ts: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("volume_profile_analisi")
      .upsert(risultato, { onConflict: "asset_symbol,finestra_giorni" });
    if (error) console.error("Errore salvataggio volume profile:", error);

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
