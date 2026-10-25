"use client";

import { Sunrise } from "lucide-react";
import { useEffect, useState } from "react";
import { formatOraRoma } from "@/lib/format";
import { supabase } from "@/lib/supabaseClient";

const giornoRoma = (d: Date | string) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });

/** Riepilogo del mattino scritto dall'AI alle 08:00 (visibile per tutta la giornata). */
export default function BriefingCard() {
  const [b, setB] = useState<{ testo: string; ts: string } | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("briefings")
      .select("testo, ts")
      .order("ts", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data && giornoRoma(data.ts) === giornoRoma(new Date())) setB(data);
      });
  }, []);

  if (!b) return null;
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="card-title flex items-center gap-2">
          <Sunrise size={14} strokeWidth={2.2} /> Riepilogo del mattino
        </h2>
        <span className="num text-xs text-muted">{formatOraRoma(b.ts)}</span>
      </div>
      <div className="space-y-3 text-[15px] leading-relaxed">
        {b.testo.split(/\n{2,}/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </section>
  );
}
