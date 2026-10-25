"use client";

import { useEffect, useState } from "react";
import AssetReport, {
  CorrelatedRow,
  KeyLevelRow,
  NewsRow,
  TechnicalSignal,
} from "@/components/AssetReport";
import { getAssetCorrelatiPerReport, getCorrelazioniDirette } from "@/lib/domain/correlations";
import { supabase } from "@/lib/supabaseClient";
import type { AnalisiRow } from "@/components/TecnicheCards";
import { loadHistory, Point } from "@/lib/usePrices";

interface Dati {
  priceNow: number | null;
  changePct: number | null;
  correlati: CorrelatedRow[];
  news: NewsRow[];
  keyLevels: KeyLevelRow[];
  reportIniziale: string | null;
  segnaleTecnico: TechnicalSignal | null;
  reportTs: string | null;
  history: Point[];
  variazioniScenario: { usd: number | null; xau: number | null; indici: (number | null)[] };
  analisi: AnalisiRow[];
}

async function caricaDati(symbol: string): Promise<Dati> {
  const vuoto: Dati = {
    priceNow: null,
    changePct: null,
    correlati: [],
    news: [],
    keyLevels: [],
    reportIniziale: null,
    segnaleTecnico: null,
    reportTs: null,
    history: [],
    variazioniScenario: { usd: null, xau: null, indici: [] },
    analisi: [],
  };
  if (!supabase) return vuoto;

  const correlatiSimboli = getAssetCorrelatiPerReport(symbol);

  const [prezzoRes, correlatiRes, statiRes, newsRes, keyLevelsRes, reportRes, tecnicoRes, storico, scenarioRes, analisiRes] =
    await Promise.all([
      supabase.from("latest_prices").select("price, change_pct").eq("symbol", symbol).maybeSingle(),
      supabase.from("latest_prices").select("symbol, change_pct").in("symbol", correlatiSimboli),
      supabase
        .from("latest_correlation_checks")
        .select("correlato_symbol, stato")
        .eq("asset_symbol", symbol),
      supabase
        .from("news_events")
        .select("titolo, orario, importanza")
        .contains("asset_impattati", [symbol])
        .in("importanza", ["alta", "media"])
        .gte("orario", new Date().toISOString())
        .order("orario", { ascending: true })
        .limit(5),
      supabase
        .from("key_levels")
        .select("prezzo, timeframe, tipo, note")
        .eq("asset_symbol", symbol)
        .order("prezzo", { ascending: false }),
      supabase
        .from("analysis_reports")
        .select("testo_generato_ai, timestamp")
        .eq("asset_symbol", symbol)
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("latest_technical_signals")
        .select(
          "ts, ema200, jaw, teeth, lips, posizione_alligator, direzione_alligator, prezzo_vs_ema200, input_direzionale, rsi, rsi_divergenza, macd_linea, macd_segnale, macd_istogramma, bollinger_superiore, bollinger_media, bollinger_inferiore"
        )
        .eq("asset_symbol", symbol)
        .eq("timeframe", "M30")
        .maybeSingle(),
      loadHistory([symbol], 24),
      supabase.from("latest_prices").select("symbol, change_pct").in("symbol", ["DXY", "XAUUSD", "DJI", "SPX", "NDQ"]),
      supabase.from("analisi_tecniche").select("tipo, timeframe, dati, ts").eq("asset_symbol", symbol),
    ]);
  const pc = (s: string) => {
    const v = scenarioRes.data?.find((r) => r.symbol === s)?.change_pct;
    return v === undefined || v === null ? null : Number(v);
  };

  const correlati: CorrelatedRow[] = correlatiSimboli.map((s) => {
    const row = correlatiRes.data?.find((r) => r.symbol === s);
    const notaCorrelato = getCorrelazioniDirette(s)[0]?.nota;
    const stato = statiRes.data?.find((r) => r.correlato_symbol === s)?.stato as
      | "confermata"
      | "divergente"
      | undefined;
    return {
      symbol: s,
      changePct: row?.change_pct ?? null,
      statoCorrelazione: stato ?? "non_disponibile",
      nota: notaCorrelato ?? "Stessa watchlist.",
    };
  });

  const t = tecnicoRes.data;
  return {
    priceNow: prezzoRes.data?.price ?? null,
    changePct: prezzoRes.data?.change_pct ?? null,
    correlati,
    news: (newsRes.data ?? []) as NewsRow[],
    keyLevels: (keyLevelsRes.data ?? []) as KeyLevelRow[],
    reportIniziale: reportRes.data?.testo_generato_ai ?? null,
    reportTs: reportRes.data?.timestamp ?? null,
    history: storico[symbol] ?? [],
    variazioniScenario: { usd: pc("DXY"), xau: pc("XAUUSD"), indici: [pc("DJI"), pc("SPX"), pc("NDQ")] },
    analisi: (analisiRes.data ?? []) as AnalisiRow[],
    segnaleTecnico: t
      ? ({
          ts: t.ts,
          ema200: t.ema200,
          jaw: t.jaw,
          teeth: t.teeth,
          lips: t.lips,
          posizioneAlligator: t.posizione_alligator,
          direzioneAlligator: t.direzione_alligator,
          prezzoVsEma200: t.prezzo_vs_ema200,
          inputDirezionale: t.input_direzionale,
          rsi: t.rsi,
          rsiDivergenza: t.rsi_divergenza,
          macdLinea: t.macd_linea,
          macdSegnale: t.macd_segnale,
          macdIstogramma: t.macd_istogramma,
          bollingerSuperiore: t.bollinger_superiore,
          bollingerMedia: t.bollinger_media,
          bollingerInferiore: t.bollinger_inferiore,
        } as TechnicalSignal)
      : null,
  };
}

export default function AssetView({ symbol }: { symbol: string }) {
  const [dati, setDati] = useState<Dati | null>(null);

  useEffect(() => {
    let attivo = true;
    caricaDati(symbol).then((d) => {
      if (attivo) setDati(d);
    });
    return () => {
      attivo = false;
    };
  }, [symbol]);

  if (!dati)
    return (
      <div className="space-y-5">
        <div className="card h-72 animate-pulse" />
        <div className="card h-48 animate-pulse" />
      </div>
    );

  return (
    <AssetReport
      symbol={symbol}
      priceNow={dati.priceNow}
      changePct={dati.changePct}
      reportIniziale={dati.reportIniziale}
      reportTs={dati.reportTs}
      history={dati.history}
      variazioniScenario={dati.variazioniScenario}
      analisi={dati.analisi}
      correlati={dati.correlati}
      news={dati.news}
      keyLevels={dati.keyLevels}
      segnaleTecnicoIniziale={dati.segnaleTecnico}
    />
  );
}
