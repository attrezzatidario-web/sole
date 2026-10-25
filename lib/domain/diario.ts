export interface Operazione {
  id: string;
  asset_symbol: string;
  direzione: "long" | "short";
  prezzo_entrata: number;
  prezzo_uscita: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  nota: string | null;
  aperta_il: string;
  chiusa_il: string | null;
}

export interface Esito {
  pnlPct: number;
  r: number | null;
  esito: "vinta" | "persa" | "pareggio";
}

/** P&L% e R-multiple di un'operazione chiusa. Null se è ancora aperta. */
export function calcolaEsito(op: Pick<Operazione, "direzione" | "prezzo_entrata" | "prezzo_uscita" | "stop_loss">): Esito | null {
  if (op.prezzo_uscita == null) return null;
  const segno = op.direzione === "long" ? 1 : -1;
  const pnlPct = ((op.prezzo_uscita - op.prezzo_entrata) / op.prezzo_entrata) * 100 * segno;

  let r: number | null = null;
  if (op.stop_loss != null) {
    const rischioPerUnita = Math.abs(op.prezzo_entrata - op.stop_loss);
    if (rischioPerUnita > 0) {
      const guadagnoPerUnita = (op.prezzo_uscita - op.prezzo_entrata) * segno;
      r = guadagnoPerUnita / rischioPerUnita;
    }
  }
  const esito = pnlPct > 0.0001 ? "vinta" : pnlPct < -0.0001 ? "persa" : "pareggio";
  return { pnlPct, r, esito };
}

export interface Statistiche {
  totali: number;
  aperte: number;
  chiuse: number;
  percentualeVinte: number | null;
  rMedio: number | null;
}

export function calcolaStatistiche(operazioni: Operazione[]): Statistiche {
  const chiuse = operazioni.filter((o) => o.prezzo_uscita != null);
  const esiti = chiuse.map((o) => calcolaEsito(o)!).filter((e): e is Esito => e !== null);
  const vinte = esiti.filter((e) => e.esito === "vinta").length;
  const conR = esiti.filter((e) => e.r !== null);
  return {
    totali: operazioni.length,
    aperte: operazioni.length - chiuse.length,
    chiuse: chiuse.length,
    percentualeVinte: esiti.length > 0 ? (vinte / esiti.length) * 100 : null,
    rMedio: conR.length > 0 ? conR.reduce((s, e) => s + (e.r ?? 0), 0) / conR.length : null,
  };
}
