"use client";

import { AlertTriangle, BarChart3, RefreshCw, Sparkles } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ASSETS } from "@/lib/domain/correlations";
import { formatPrice } from "@/lib/format";
import { invokeFunction } from "@/lib/functions";
import { supabase } from "@/lib/supabaseClient";

// Solo gli asset per cui esiste un volume reale (o un proxy futures onesto):
// niente valute forex pure, OTC, senza volume centralizzato.
const ASSET_CON_VOLUME = ["XAUUSD", "XAGUSD", "PL1!", "COPPER", "USOIL", "XBRUSD", "BR1!", "DXY", "DJI", "SPX", "NDQ"];

interface Bucket {
  da: number;
  a: number;
  volume: number;
}
interface Profilo {
  asset_symbol: string;
  finestra_giorni: number;
  fonte_volume: string;
  poc: number;
  vah: number;
  val: number;
  prezzo_attuale: number;
  buckets: Bucket[];
  analisi_ai: string | null;
  ts: string;
}

function GraficoProfilo({ p }: { p: Profilo }) {
  const maxVol = Math.max(...p.buckets.map((b) => b.volume));
  const minP = p.buckets[0].da;
  const maxP = p.buckets[p.buckets.length - 1].a;
  const H = 420;
  const yDa = (prezzo: number) => H - ((prezzo - minP) / (maxP - minP)) * H;

  return (
    <div className="relative" style={{ height: H }}>
      <div className="flex h-full">
        <div className="relative flex-1">
          {p.buckets.map((b, i) => {
            const yTop = yDa(b.a);
            const yBot = yDa(b.da);
            const dentro = b.a > p.val && b.da < p.vah;
            return (
              <div
                key={i}
                className={`absolute left-0 rounded-r ${dentro ? "bg-accent/55" : "bg-muted/35"}`}
                style={{
                  top: yTop,
                  height: Math.max(1, yBot - yTop - 1),
                  width: `${Math.max(2, (b.volume / maxVol) * 100)}%`,
                }}
              />
            );
          })}
          {/* POC */}
          <div
            className="absolute left-0 right-0 border-t-2 border-dashed"
            style={{ top: yDa(p.poc), borderColor: "rgb(var(--accent))" }}
          >
            <span className="absolute -top-2.5 right-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
              POC {formatPrice(p.asset_symbol, p.poc)}
            </span>
          </div>
          {/* prezzo attuale */}
          <div
            className="absolute left-0 right-0 border-t border-fg"
            style={{ top: yDa(p.prezzo_attuale) }}
          >
            <span className="absolute -top-2.5 left-1 rounded bg-fg px-1.5 py-0.5 text-[10px] font-semibold text-bg">
              {formatPrice(p.asset_symbol, p.prezzo_attuale)}
            </span>
          </div>
        </div>
      </div>
      <p className="absolute -bottom-6 left-0 text-[11px] text-muted">
        {formatPrice(p.asset_symbol, minP)}
      </p>
      <p className="absolute -bottom-6 right-0 text-[11px] text-muted">
        {formatPrice(p.asset_symbol, maxP)}
      </p>
    </div>
  );
}

function VolumeProfileInner() {
  const params = useSearchParams();
  const [symbol, setSymbol] = useState(params.get("symbol") && ASSET_CON_VOLUME.includes(params.get("symbol")!) ? params.get("symbol")! : "XAUUSD");
  const [giorni, setGiorni] = useState(30);
  const [profilo, setProfilo] = useState<Profilo | null>(null);
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function carica(forzaCalcolo: boolean) {
    setErrore(null);
    if (!forzaCalcolo && supabase) {
      const { data } = await supabase
        .from("volume_profile_analisi")
        .select("*")
        .eq("asset_symbol", symbol)
        .eq("finestra_giorni", giorni)
        .maybeSingle();
      if (data) {
        setProfilo(data as Profilo);
        return;
      }
    }
    setLoading(true);
    try {
      const r = await invokeFunction<Profilo>("volume-profile", { symbol, giorni });
      setProfilo(r);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore sconosciuto");
      setProfilo(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carica(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, giorni]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <BarChart3 size={22} /> Volume Profile
        </h1>
        <p className="mt-1 text-sm text-muted">
          Dove si è scambiato davvero il volume, su una finestra di giorni: POC (prezzo più scambiato) e Value
          Area (zona che contiene il 70% del volume).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="input !h-9 !w-auto">
          {ASSET_CON_VOLUME.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="flex rounded-lg border border-line bg-surface2 p-0.5">
          {[14, 30, 90].map((g) => (
            <button
              key={g}
              onClick={() => setGiorni(g)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                giorni === g ? "bg-surface text-fg shadow-sm" : "text-muted"
              }`}
            >
              {g}gg
            </button>
          ))}
        </div>
        <button onClick={() => carica(true)} disabled={loading} className="btn-ghost !h-9 !px-3 !text-xs">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          {loading ? "Calcolo…" : "Ricalcola ora"}
        </button>
      </div>

      {symbol === "XAUUSD" && (
        <p className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-xs text-warn">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          L&apos;oro spot (XAUUSD) non ha un volume centralizzato reale: questo profilo usa il volume dei
          futures sull&apos;oro (COMEX, GC=F) come proxy — la miglior fonte gratuita disponibile, non il dato
          esatto dello spot.
        </p>
      )}

      {errore && (
        <p className="rounded-xl border border-down/30 bg-down/10 px-3.5 py-2.5 text-sm text-down">{errore}</p>
      )}

      {!profilo && !errore && !loading && (
        <p className="card p-5 text-sm text-muted">Scegli un asset e la finestra di giorni per calcolare il profilo.</p>
      )}

      {profilo && (
        <>
          <div className="card p-5 pb-10">
            <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-xl bg-surface2 px-3 py-2.5">
                <p className="text-[11px] text-muted">POC</p>
                <p className="num font-semibold text-accent">{formatPrice(symbol, profilo.poc)}</p>
              </div>
              <div className="rounded-xl bg-surface2 px-3 py-2.5">
                <p className="text-[11px] text-muted">Value Area</p>
                <p className="num font-semibold">
                  {formatPrice(symbol, profilo.val)}–{formatPrice(symbol, profilo.vah)}
                </p>
              </div>
              <div className="rounded-xl bg-surface2 px-3 py-2.5">
                <p className="text-[11px] text-muted">Prezzo</p>
                <p className="num font-semibold">{formatPrice(symbol, profilo.prezzo_attuale)}</p>
              </div>
            </div>
            <GraficoProfilo p={profilo} />
          </div>

          <section className="card p-5">
            <h2 className="card-title mb-3 flex items-center gap-2">
              <Sparkles size={14} /> Analisi AI
            </h2>
            {profilo.analisi_ai ? (
              <div className="space-y-3 text-[15px] leading-relaxed">
                {profilo.analisi_ai.split(/\n{2,}/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">Analisi non disponibile.</p>
            )}
            <p className="mt-4 text-xs text-muted">
              Informativa, non è un consiglio di investimento · fonte volume: {profilo.fonte_volume}
            </p>
          </section>
        </>
      )}
    </div>
  );
}

export default function VolumeProfilePage() {
  return (
    <Suspense fallback={<div className="card h-96 animate-pulse" />}>
      <VolumeProfileInner />
    </Suspense>
  );
}
