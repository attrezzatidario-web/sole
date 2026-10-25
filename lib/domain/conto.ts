// Gestione del conto: piano di compounding + journal, con le stesse regole del file "Gestione_conto.xlsx".
//
// Piano (colonne A-F del foglio), periodo n ≥ 1:
//   capitale(n)   = capitale(n-1) × (1 + profitto%)
//   rischio(n)    = capitale(n) × rischio%
//   lotto(n)      = rischio(n) / (pips stop × valore pip di 1 lotto)
//   profitto(n)   = capitale(n-1) × profitto%                    (obiettivo del periodo)
//   pips(n)       = profitto(n) / (lotto(n-1) × valore pip)       (col lotto con cui si opera nel periodo)
//
// Journal (colonne H-M): ogni riga parte dal capitale della precedente e aggiunge il P/L con commissioni.

export interface ImpostazioniConto {
  capitale_iniziale: number;
  profitto_pct: number; // es. 0.5 = 0,5% per periodo
  rischio_pct: number; // es. 1 = 1% del capitale per operazione
  pips_stop: number;
  valore_pip: number; // € per pip con 1 lotto (10 = come nel foglio)
  periodi: number;
}

export const IMPOSTAZIONI_PREDEFINITE: ImpostazioniConto = {
  capitale_iniziale: 20000,
  profitto_pct: 0.5,
  rischio_pct: 1,
  pips_stop: 20,
  valore_pip: 10,
  periodi: 245,
};

export interface PeriodoPiano {
  periodo: number;
  capitale: number;
  rischio: number;
  profitto: number | null;
  lotto: number;
  pips: number | null;
}

export interface VoceJournal {
  id: string;
  data: string; // YYYY-MM-DD
  pnl: number; // profitto/perdita con commissioni, in €
  nota: string | null;
}

export interface RigaJournal extends VoceJournal {
  numero: number; // 1 = prima operazione registrata
  capitaleIniziale: number;
  capitaleFinale: number;
  pct: number; // variazione % sul capitale di partenza della riga
}

const lottoPer = (capitale: number, s: ImpostazioniConto) =>
  (capitale * s.rischio_pct) / 100 / (s.pips_stop * s.valore_pip);

export function calcolaPiano(s: ImpostazioniConto): PeriodoPiano[] {
  const p = s.profitto_pct / 100;
  const righe: PeriodoPiano[] = [];
  let precedente: PeriodoPiano | null = null;
  for (let n = 0; n <= s.periodi; n++) {
    const capitale = precedente ? precedente.capitale * (1 + p) : s.capitale_iniziale;
    const profitto = precedente ? precedente.capitale * p : null;
    const riga: PeriodoPiano = {
      periodo: n,
      capitale,
      rischio: (capitale * s.rischio_pct) / 100,
      lotto: lottoPer(capitale, s),
      profitto,
      pips: precedente && profitto !== null ? profitto / (precedente.lotto * s.valore_pip) : null,
    };
    righe.push(riga);
    precedente = riga;
  }
  return righe;
}

/** Journal in ordine cronologico, con il capitale che passa da una riga alla successiva. */
export function calcolaJournal(voci: VoceJournal[], capitaleIniziale: number): RigaJournal[] {
  const ordinate = [...voci].sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
  let capitale = capitaleIniziale;
  return ordinate.map((v, i) => {
    const riga: RigaJournal = {
      ...v,
      numero: i + 1,
      capitaleIniziale: capitale,
      capitaleFinale: capitale + v.pnl,
      pct: capitale ? v.pnl / capitale : 0,
    };
    capitale = riga.capitaleFinale;
    return riga;
  });
}

export interface Riepilogo {
  capitaleAttuale: number;
  profittoEuro: number;
  profittoPct: number;
  periodoAttuale: number; // operazioni registrate
  capitalePiano: number | null; // dove dovresti essere secondo il piano
  scartoPiano: number | null; // reale − piano
  prossima: { rischio: number; lotto: number; obiettivo: number; pips: number };
}

export function riepilogo(s: ImpostazioniConto, piano: PeriodoPiano[], journal: RigaJournal[]): Riepilogo {
  const capitaleAttuale = journal.length ? journal[journal.length - 1].capitaleFinale : s.capitale_iniziale;
  const profittoEuro = capitaleAttuale - s.capitale_iniziale;
  const n = journal.length;
  const capitalePiano = piano[n]?.capitale ?? null;
  const lotto = lottoPer(capitaleAttuale, s);
  const obiettivo = (capitaleAttuale * s.profitto_pct) / 100;
  return {
    capitaleAttuale,
    profittoEuro,
    profittoPct: s.capitale_iniziale ? profittoEuro / s.capitale_iniziale : 0,
    periodoAttuale: n,
    capitalePiano,
    scartoPiano: capitalePiano !== null ? capitaleAttuale - capitalePiano : null,
    prossima: {
      rischio: (capitaleAttuale * s.rischio_pct) / 100,
      lotto,
      obiettivo,
      pips: lotto > 0 ? obiettivo / (lotto * s.valore_pip) : 0,
    },
  };
}

export const euro = (v: number | null | undefined, segno = false) =>
  v === null || v === undefined || Number.isNaN(v)
    ? "—"
    : `${segno && v > 0 ? "+" : ""}${v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export const percento = (frazione: number, segno = true) =>
  `${segno && frazione > 0 ? "+" : ""}${(frazione * 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

export const lotti = (v: number) => v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
