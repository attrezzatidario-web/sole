"use client";

import { useEffect, useState } from "react";

/**
 * Stato "schermo intero" riusabile da qualunque grafico dell'app: blocca lo
 * scroll della pagina sotto, chiude con Esc, e segue l'orientamento del
 * telefono (verticale o orizzontale) perché non forza nessun orientamento,
 * lascia solo che il contenuto riempia lo schermo in entrambi i casi.
 */
export function useEspanso() {
  const [espanso, setEspanso] = useState(false);

  useEffect(() => {
    if (!espanso) return;
    const precedente = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEspanso(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = precedente;
      window.removeEventListener("keydown", onKey);
    };
  }, [espanso]);

  return { espanso, apri: () => setEspanso(true), chiudi: () => setEspanso(false) };
}
