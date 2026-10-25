"use client";

import { useEffect, useState } from "react";

const DURATA_VISIBILE_MS = 2500; // quanto resta visibile prima di iniziare a sparire
const DURATA_DISSOLVENZA_MS = 500; // durata della dissolvenza in uscita
const CHIAVE_SESSIONE = "sole-splash-mostrato";

/**
 * Animazione di apertura: compare una sola volta per sessione (si rivede
 * aprendo l'app da capo, non spostandosi tra le pagine), e sparisce da sola.
 * Rispetta "riduci animazioni" del sistema operativo saltando del tutto.
 */
export default function SplashScreen() {
  const [stato, setStato] = useState<"nascosto" | "visibile" | "dissolvenza">("nascosto");

  useEffect(() => {
    const riduciAnimazioni = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let giaMostrato = false;
    try {
      giaMostrato = sessionStorage.getItem(CHIAVE_SESSIONE) === "1";
    } catch {}

    if (riduciAnimazioni || giaMostrato) return;

    setStato("visibile");
    try {
      sessionStorage.setItem(CHIAVE_SESSIONE, "1");
    } catch {}

    const t1 = setTimeout(() => setStato("dissolvenza"), DURATA_VISIBILE_MS);
    const t2 = setTimeout(() => setStato("nascosto"), DURATA_VISIBILE_MS + DURATA_DISSOLVENZA_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (stato === "nascosto") return null;

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-bg transition-opacity"
      style={{
        opacity: stato === "dissolvenza" ? 0 : 1,
        transitionDuration: `${DURATA_DISSOLVENZA_MS}ms`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 70% 60% at 50% 42%, rgb(var(--accent) / 0.14), transparent 70%)",
        }}
      />

      {/* griglia di sfondo */}
      <div
        className="absolute inset-0 opacity-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgb(var(--line) / 0.35) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--line) / 0.35) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 60% 55% at 50% 45%, black 15%, transparent 72%)",
          WebkitMaskImage: "radial-gradient(ellipse 60% 55% at 50% 45%, black 15%, transparent 72%)",
          animation: "sole-splash-fade 1.6s ease-out 0.1s forwards",
        }}
      />

      {/* anelli pulsanti */}
      <div className="absolute h-[340px] w-[340px]">
        {[0, 1.07, 2.14].map((ritardo) => (
          <div
            key={ritardo}
            className="absolute inset-0 rounded-full opacity-0"
            style={{
              border: "1.5px solid rgb(var(--accent) / 0.5)",
              animation: `sole-splash-pulsa 3.2s ease-out ${ritardo}s infinite`,
            }}
          />
        ))}
      </div>

      {/* marchio */}
      <div className="relative z-[1] flex flex-col items-center gap-[22px]">
        <div
          className="flex h-[88px] w-[88px] scale-[0.6] items-center justify-center rounded-[26px] opacity-0"
          style={{
            background: "rgb(var(--accent))",
            boxShadow: "0 18px 60px -12px rgb(var(--accent) / 0.55)",
            animation: "sole-splash-comparsa 0.85s cubic-bezier(.2,.9,.25,1.2) 0.15s forwards",
          }}
        >
          <div
            className="h-[38px] w-[38px] scale-0 rounded-full bg-white"
            style={{ animation: "sole-splash-punto 0.6s cubic-bezier(.2,.9,.3,1.3) 0.55s forwards" }}
          />
        </div>

        <div
          className="translate-y-[10px] text-[34px] font-semibold tracking-tight opacity-0"
          style={{ color: "rgb(var(--fg))", animation: "sole-splash-salita 0.7s ease-out 0.75s forwards" }}
        >
          Sole<span style={{ color: "rgb(var(--muted))", fontWeight: 550, marginLeft: 2 }}> H24</span>
        </div>

        <div
          className="h-0.5 w-0 rounded-full"
          style={{ background: "rgb(var(--accent))", animation: "sole-splash-linea 0.6s ease-out 1.15s forwards" }}
        />

        <div
          className="text-[13px] opacity-0"
          style={{ color: "rgb(var(--muted))", animation: "sole-splash-fade 0.8s ease-out 1.35s forwards" }}
        >
          Analizzatore di mercato, sempre acceso
        </div>
      </div>

      <style>{`
        @keyframes sole-splash-fade { to { opacity: 1; } }
        @keyframes sole-splash-salita { to { opacity: 1; transform: translateY(0); } }
        @keyframes sole-splash-pulsa {
          0% { transform: scale(0.42); opacity: 0; }
          12% { opacity: 0.55; }
          100% { transform: scale(1); opacity: 0; }
        }
        @keyframes sole-splash-comparsa { to { opacity: 1; transform: scale(1); } }
        @keyframes sole-splash-punto { to { transform: scale(1); } }
        @keyframes sole-splash-linea { to { width: 56px; } }
      `}</style>
    </div>
  );
}
