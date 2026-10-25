"use client";

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import LiveDot from "./LiveDot";
import { SCHEDULE, getFaseCorrente, minutiOraItalia } from "@/lib/domain/schedule";

/** Fase operativa della giornata (orario italiano), come da tabella del corso. */
export default function SessionCard() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  if (!now) return <div className="card h-[168px] animate-pulse" />;

  const { attuale, prossima, minutiAllaProssima } = getFaseCorrente(now);
  const pos = (minutiOraItalia(now) / 1440) * 100;
  const ore = Math.floor(minutiAllaProssima / 60);
  const min = minutiAllaProssima % 60;

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="card-title flex items-center gap-1.5">
            <LiveDot colore="accent" /> Fase di mercato
          </p>
          <h2 className="mt-1.5 text-lg font-semibold leading-snug tracking-tight">{attuale.titolo}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">{attuale.nota}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="card-title flex items-center justify-end gap-1">
            <Clock size={12} /> Prossima
          </p>
          <p className="num mt-1.5 text-lg font-semibold">
            {ore > 0 ? `${ore}h ` : ""}
            {min}m
          </p>
          <p className="max-w-[9rem] truncate text-xs text-muted">{prossima.titolo}</p>
        </div>
      </div>

      <div className="relative mt-5 h-1.5 rounded-full bg-surface2">
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent/40" style={{ width: `${pos}%` }} />
        {SCHEDULE.map((f) => (
          <span
            key={f.orario}
            title={`${f.orario} · ${f.titolo}`}
            className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface ${
              f.orario === attuale.orario ? "bg-accent" : "bg-muted/60"
            }`}
            style={{ left: `${(f.minutiDaMezzanotte / 1440) * 100}%` }}
          />
        ))}
        <span
          className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-fg"
          style={{ left: `${pos}%` }}
        />
      </div>
      <div className="num mt-2 flex justify-between text-[10px] text-muted">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
    </section>
  );
}
