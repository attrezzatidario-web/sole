// Tipi e calcoli per Fibonacci e Pitchfork (salvati da compute-key-levels in analisi_tecniche).

export interface FibDati {
  direzione: "rialzista" | "ribassista";
  da: { t: number; p: number };
  a: { t: number; p: number };
  livelli: { rapporto: number; prezzo: number }[];
  zone: { prezzo: number; fonti: string[]; forza: number }[];
}

export interface PitchforkDati {
  tipo: "rialzista" | "ribassista";
  pivots: { t: number; p: number }[];
}

/** Valori del Pitchfork all'istante t (secondi): mediana e linee parallele passanti per i pivot 2 e 3. */
export function pitchforkAt(pivots: { t: number; p: number }[], t: number) {
  const [p1, p2, p3] = pivots;
  const m = ((p2.p + p3.p) / 2 - p1.p) / ((p2.t + p3.t) / 2 - p1.t);
  const su = (a: { t: number; p: number }) => a.p + m * (t - a.t);
  const l2 = su(p2);
  const l3 = su(p3);
  const mediana = su(p1);
  const alta = Math.max(l2, l3);
  const bassa = Math.min(l2, l3);
  return { mediana, alta, bassa, metaAlta: (mediana + alta) / 2, metaBassa: (mediana + bassa) / 2 };
}
