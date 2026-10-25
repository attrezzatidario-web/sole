"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { ThemeMode, useTheme } from "./ThemeProvider";

const OPZIONI: { mode: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { mode: "light", label: "Tema chiaro", Icon: Sun },
  { mode: "system", label: "Tema automatico", Icon: Monitor },
  { mode: "dark", label: "Tema scuro", Icon: Moon },
];

export default function ThemeToggle() {
  const { mode, setMode } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className="flex items-center rounded-xl border border-line bg-surface2 p-0.5"
    >
      {OPZIONI.map(({ mode: m, label, Icon }) => {
        const attivo = mode === m;
        return (
          <button
            key={m}
            role="radio"
            aria-checked={attivo}
            aria-label={label}
            title={label}
            onClick={() => setMode(m)}
            className={`flex h-8 w-8 items-center justify-center rounded-[10px] transition ${
              attivo ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"
            }`}
          >
            <Icon size={16} strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}
