"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export interface PriceInfo {
  symbol: string;
  price: number;
  changePct: number | null;
  ts: string;
}
export interface Point {
  t: number;
  p: number;
}
export type History = Record<string, Point[]>;

/** Storico dei prezzi delle ultime ore (per i mini-grafici). */
export async function loadHistory(symbols?: string[], hours = 24): Promise<History> {
  if (!supabase) return {};
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const out: History = {};
  // Supabase restituisce al massimo 1000 righe per richiesta: si legge a pagine.
  for (let page = 0; page < 4; page++) {
    let q = supabase
      .from("price_snapshots")
      .select("asset_symbol, ts, price")
      .gte("ts", since)
      .order("ts", { ascending: false })
      .range(page * 1000, page * 1000 + 999);
    if (symbols) q = q.in("asset_symbol", symbols);
    const { data, error } = await q;
    if (error || !data) break;
    for (const r of data) {
      (out[r.asset_symbol] ||= []).push({ t: new Date(r.ts).getTime(), p: Number(r.price) });
    }
    if (data.length < 1000) break;
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.t - b.t);
  return out;
}

export function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  const res: T[] = [];
  for (let i = 0; i < max; i++) res.push(arr[Math.floor(i * step)]);
  res.push(arr[arr.length - 1]);
  return res;
}

export function usePrices() {
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
  const [history, setHistory] = useState<History>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const carica = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setRefreshing(true);
    const [res, hist] = await Promise.all([
      supabase.from("latest_prices").select("symbol, price, change_pct, ts"),
      loadHistory(),
    ]);
    if (res.error || !res.data) {
      setError(true);
    } else {
      setError(false);
      const map: Record<string, PriceInfo> = {};
      for (const r of res.data) {
        map[r.symbol] = {
          symbol: r.symbol,
          price: Number(r.price),
          changePct: r.change_pct === null ? null : Number(r.change_pct),
          ts: r.ts,
        };
      }
      setPrices(map);
      setHistory(hist);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    carica();
    const t = setInterval(carica, 120000);
    return () => clearInterval(t);
  }, [carica]);

  const updatedAt = Object.values(prices).reduce<number>(
    (m, p) => Math.max(m, new Date(p.ts).getTime()),
    0
  );

  return { prices, history, loading, error, refreshing, reload: carica, updatedAt };
}
