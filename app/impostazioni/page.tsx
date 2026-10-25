"use client";

import { Monitor, Moon, Sun, Sunrise } from "lucide-react";
import { useState } from "react";
import NotificationSettings from "@/components/NotificationSettings";
import { ThemeMode, useTheme } from "@/components/ThemeProvider";
import { invokeFunction } from "@/lib/functions";

const TEMI: { mode: ThemeMode; nome: string; Icon: typeof Sun }[] = [
  { mode: "light", nome: "Chiaro", Icon: Sun },
  { mode: "system", nome: "Automatico", Icon: Monitor },
  { mode: "dark", nome: "Scuro", Icon: Moon },
];

export default function ImpostazioniPage() {
  const { mode, setMode } = useTheme();
  const [generando, setGenerando] = useState(false);
  const [messaggio, setMessaggio] = useState<string | null>(null);

  async function generaRiepilogo() {
    setGenerando(true);
    setMessaggio(null);
    try {
      await invokeFunction("notifiche", { action: "briefing", forza: true });
      setMessaggio("Riepilogo generato: lo trovi in cima alla pagina Mercati.");
    } catch (e) {
      setMessaggio(e instanceof Error ? e.message : "Errore sconosciuto");
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Impostazioni</h1>
        <p className="mt-1 text-sm text-muted">Notifiche, aspetto e installazione dell'app.</p>
      </div>

      <NotificationSettings />

      <section className="card p-5">
        <h2 className="card-title mb-4 flex items-center gap-2">
          <Sunrise size={14} /> Riepilogo del mattino
        </h2>
        <p className="text-sm leading-relaxed text-muted">
          Ogni giorno alle 08:00 (ora italiana) l'AI scrive un riepilogo con mercati, notizie del giorno e livelli
          dell'oro. Puoi generarne uno adesso per provarlo.
        </p>
        <button className="btn-ghost mt-4" disabled={generando} onClick={generaRiepilogo}>
          <Sunrise size={16} /> {generando ? "Genero…" : "Genera riepilogo adesso"}
        </button>
        {messaggio && <p className="mt-3 text-sm text-muted">{messaggio}</p>}
      </section>

      <section className="card p-5">
        <h2 className="card-title mb-4">Aspetto</h2>
        <div className="grid grid-cols-3 gap-2.5">
          {TEMI.map(({ mode: m, nome, Icon }) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm font-medium transition ${
                mode === m ? "border-accent bg-accent/10 text-fg" : "border-line bg-surface2 text-muted hover:text-fg"
              }`}
            >
              <Icon size={20} />
              {nome}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
