"use client";

import { useEffect, useState } from "react";
import type { InizioGiornata } from "@/lib/domain/giorni";

const CHIAVE = "sole-inizio-giornata";

/** Da che ora comincia la "giornata" nei grafici (23:00 forex/oro, oppure mezzanotte). Si ricorda tra una visita e l'altra. */
export function useInizioGiornata(): [InizioGiornata, (v: InizioGiornata) => void] {
  const [v, setV] = useState<InizioGiornata>("23:00");
  useEffect(() => {
    try {
      const s = localStorage.getItem(CHIAVE);
      if (s === "00:00" || s === "23:00") setV(s);
    } catch {}
  }, []);
  return [
    v,
    (n) => {
      setV(n);
      try {
        localStorage.setItem(CHIAVE, n);
      } catch {}
    },
  ];
}
