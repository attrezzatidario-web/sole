"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";

const Ctx = createContext<{ mode: ThemeMode; setMode: (m: ThemeMode) => void }>({
  mode: "system",
  setMode: () => {},
});

export const useTheme = () => useContext(Ctx);

const COLORI_BARRA = { light: "#F4F6F9", dark: "#0A0C11" };

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    try {
      const salvato = localStorage.getItem("h24-theme") as ThemeMode | null;
      if (salvato === "light" || salvato === "dark" || salvato === "system") setModeState(salvato);
    } catch {}
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const applica = () => {
      const scuro = mode === "dark" || (mode === "system" && mq.matches);
      const r = scuro ? "dark" : "light";
      document.documentElement.dataset.theme = r;
      document.documentElement.style.colorScheme = r;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", COLORI_BARRA[r]);
    };
    applica();
    mq.addEventListener("change", applica);
    return () => mq.removeEventListener("change", applica);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    try {
      localStorage.setItem("h24-theme", m);
    } catch {}
  }, []);

  return <Ctx.Provider value={{ mode, setMode }}>{children}</Ctx.Provider>;
}
