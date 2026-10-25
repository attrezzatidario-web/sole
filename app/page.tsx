"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import BriefingCard from "@/components/BriefingCard";
import FocusTile from "@/components/FocusTile";
import LiveDot from "@/components/LiveDot";
import ScenarioCard from "@/components/ScenarioCard";
import SessionCard from "@/components/SessionCard";
import WatchlistCard from "@/components/WatchlistCard";
import { WATCHLISTS } from "@/lib/domain/correlations";
import { formatOraRoma } from "@/lib/format";
import { usePrices } from "@/lib/usePrices";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

const FOCUS = ["XAUUSD", "DXY", "SPX", "USOIL"];

export default function DashboardPage() {
  const { prices, history, loading, error, refreshing, reload, updatedAt } = usePrices();
  const [filtro, setFiltro] = useState<string>("Tutte");

  const visibili = filtro === "Tutte" ? WATCHLISTS : WATCHLISTS.filter((w) => w.nome === filtro);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mercati</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted">
            {updatedAt ? (
              <>
                <LiveDot />
                Ultimo aggiornamento <span className="num text-fg">{formatOraRoma(updatedAt)}</span>
              </>
            ) : (
              "Monitoraggio H24 delle watchlist del corso"
            )}
          </p>
        </div>
        <button
          onClick={reload}
          disabled={refreshing}
          className="btn-ghost !h-9 !px-3"
          aria-label="Aggiorna dati"
        >
          <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          <span className="hidden sm:inline">Aggiorna</span>
        </button>
      </div>

      {!isSupabaseConfigured && (
        <p className="card border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          Sito non collegato a Supabase: mancano le variabili di configurazione.
        </p>
      )}
      {error && (
        <p className="card border-down/40 bg-down/10 px-4 py-3 text-sm text-down">
          Non riesco a leggere i dati. Controlla la connessione, oppure i permessi del database.
        </p>
      )}

      <BriefingCard />


      <div className="grid gap-4 lg:grid-cols-2">
        <SessionCard />
        <ScenarioCard prices={prices} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {FOCUS.map((s) => (
          <FocusTile
            key={s}
            symbol={s}
            price={prices[s]?.price ?? null}
            changePct={prices[s]?.changePct ?? null}
            points={history[s] ?? []}
            loading={loading}
          />
        ))}
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {["Tutte", ...WATCHLISTS.map((w) => w.nome)].map((n) => (
          <button
            key={n}
            onClick={() => setFiltro(n)}
            className={`h-9 shrink-0 rounded-full px-4 text-sm font-medium transition ${
              filtro === n
                ? "bg-fg text-bg"
                : "border border-line bg-surface text-muted hover:text-fg"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      <div className={`grid gap-4 ${filtro === "Tutte" ? "lg:grid-cols-2" : "max-w-2xl"}`}>
        {visibili.map((wl) => (
          <WatchlistCard
            key={wl.nome}
            title={wl.nome}
            descrizione={wl.descrizione}
            simboli={wl.simboli}
            prices={prices}
            history={history}
            loading={loading}
          />
        ))}
      </div>
    </div>
  );
}
