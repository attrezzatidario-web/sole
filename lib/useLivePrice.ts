"use client";

import { useEffect, useRef, useState } from "react";

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Anima un numero verso il suo nuovo valore (come i prezzi di un terminale
 * di trading) invece di farlo scattare di colpo. Non anima il primo valore
 * ricevuto (niente "conteggio da zero" al primo caricamento): solo i
 * cambiamenti successivi, quando il prezzo si aggiorna davvero.
 */
export function useAnimatedNumber(valore: number | null, durataMs = 550): number | null {
  const [visualizzato, setVisualizzato] = useState(valore);
  const precedente = useRef(valore);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (valore === null) {
      precedente.current = null;
      setVisualizzato(null);
      return;
    }
    const partenza = precedente.current ?? valore;
    if (partenza === valore) {
      setVisualizzato(valore);
      return;
    }
    const inizio = performance.now();
    function tick(ora: number) {
      const t = Math.min(1, (ora - inizio) / durataMs);
      setVisualizzato(partenza + (valore! - partenza) * easeOutCubic(t));
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        precedente.current = valore;
      }
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valore, durataMs]);

  return visualizzato;
}

/**
 * Segnala per un attimo (via classe CSS) se un valore è appena salito o
 * sceso, per il lampo di colore sullo sfondo — come nei terminali veri.
 */
export function useFlashOnChange(valore: number | null, durataMs = 700): "su" | "giu" | null {
  const [flash, setFlash] = useState<"su" | "giu" | null>(null);
  const precedente = useRef(valore);

  useEffect(() => {
    if (valore !== null && precedente.current !== null && valore !== precedente.current) {
      setFlash(valore > precedente.current ? "su" : "giu");
      const t = setTimeout(() => setFlash(null), durataMs);
      precedente.current = valore;
      return () => clearTimeout(t);
    }
    precedente.current = valore;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valore]);

  return flash;
}
