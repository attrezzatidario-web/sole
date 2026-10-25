/**
 * Ricostruisce com'è andato un segnale guardando le candele DOPO l'orario del messaggio.
 *
 * Regole (semplificate e dichiarate, così si sa cosa si sta guardando):
 *  - L'entrata avviene al prezzo scritto nel segnale, alla prima candela che lo tocca.
 *    Se il segnale era "a mercato" (senza prezzo) l'entrata è l'apertura della prima candela.
 *  - Esito principale = ciò che succede PRIMA tra stop loss e primo take profit (la regola del bot).
 *  - Se nella stessa candela sono raggiungibili sia lo stop sia il target, non si può sapere
 *    quale sia venuto prima: si assume lo stop (ipotesi prudente) e si segnala come "ambigua".
 *  - Nessuno spread, nessuno slippage, nessuna commissione: è una simulazione idealizzata.
 */

export interface DatiSegnale {
  direzione: "buy" | "sell";
  entrata: number | null;
  /** zona di entrata (es. "2650-2655"): si entra al primo contatto con la zona */
  zona?: [number, number] | null;
  /**
   * Come si entra:
   *  "toccato" (predefinito) al prezzo scritto, appena il mercato lo tocca dopo il messaggio;
   *  "aperto"  la posizione è già aperta al prezzo scritto fin dall'istante del messaggio
   *            (il gruppo racconta "Ho venduto a 4224": l'operazione esiste già);
   *  "mercato" si entra al prezzo di mercato dell'istante del messaggio, con gli stessi stop e target
   *            (cosa avrebbe ottenuto chi legge il messaggio e copia l'operazione).
   */
  modo?: "toccato" | "aperto" | "mercato";
  stop_loss: number;
  take_profits: number[]; // in ordine: TP1, TP2, ...
  ts: number; // secondi unix del messaggio
}

export interface CandelaE {
  t: number; // secondi unix, apertura candela
  o: number;
  h: number;
  l: number;
  c: number;
}

/**
 * non_attivato  l'entrata non è mai stata toccata
 * tp / sl       il primo target / lo stop sono stati toccati per primi
 * aperta        nessuno dei due ancora
 * non_copiabile al momento del messaggio il prezzo era GIÀ oltre il target o lo stop: chi leggeva
 *               il messaggio non poteva più entrare (solo per l'esito "copiata al prezzo del messaggio")
 */
export type StatoEsito = "non_attivato" | "tp" | "sl" | "aperta" | "non_copiabile";

export interface TpToccato {
  indice: number; // 1 = TP1
  prezzo: number;
  tempo: number | null; // null = mai toccato nel periodo
}

export interface EsitoSegnale {
  stato: StatoEsito;
  entrataPrezzo: number | null;
  entrataTempo: number | null;
  uscitaPrezzo: number | null;
  uscitaTempo: number | null;
  durataSec: number | null;
  r: number | null; // risultato in multipli del rischio (a chiusura)
  rFlottante: number | null; // se ancora aperta
  ambigua: boolean;
  tpToccati: TpToccato[];
  slTempo: number | null;
  mfe: number | null; // massima escursione favorevole (prezzo)
  mae: number | null; // massima escursione sfavorevole (prezzo)
  mfeR: number | null;
  maeR: number | null;
  ultimoPrezzo: number | null;
  ultimoTempo: number | null;
  rischio: number | null; // distanza entrata-stop
  candeleUsate: number;
  /** la posizione risulta già aperta PRIMA del messaggio (solo per "Ho venduto a…") */
  entrataPrimaDelMessaggio: boolean;
  /** quando è avvenuta l'uscita rispetto al messaggio: clamorosamente prima, nello stesso minuto, o dopo */
  uscitaRispetto: "prima" | "stesso_minuto" | "dopo" | null;
  /** se al momento del messaggio il prezzo era già oltre il primo target o lo stop */
  oltreAlMessaggio: "tp" | "sl" | null;
  prezzoAlMessaggio: number | null;
}

const VUOTO: EsitoSegnale = {
  stato: "non_attivato",
  entrataPrezzo: null,
  entrataTempo: null,
  uscitaPrezzo: null,
  uscitaTempo: null,
  durataSec: null,
  r: null,
  rFlottante: null,
  ambigua: false,
  tpToccati: [],
  slTempo: null,
  mfe: null,
  mae: null,
  mfeR: null,
  maeR: null,
  ultimoPrezzo: null,
  ultimoTempo: null,
  rischio: null,
  candeleUsate: 0,
  entrataPrimaDelMessaggio: false,
  uscitaRispetto: null,
  oltreAlMessaggio: null,
  prezzoAlMessaggio: null,
};

export function calcolaEsitoSegnale(sig: DatiSegnale, tutte: CandelaE[]): EsitoSegnale {
  const buy = sig.direzione === "buy";
  const tps = sig.take_profits;
  const ordinate = [...tutte].sort((a, b) => a.t - b.t);
  // Dopo il messaggio: da qui si guarda il mercato. Prima del messaggio: serve solo a ricostruire
  // quando il gruppo può aver aperto una posizione che dice di avere già ("Ho venduto a…").
  const pre = ordinate.filter((c) => c.t < sig.ts);
  const candele = ordinate.filter((c) => c.t >= sig.ts);
  const tpBase = tps.map((p, i) => ({ indice: i + 1, prezzo: p, tempo: null as number | null }));
  if (candele.length === 0 || tps.length === 0) return { ...VUOTO, tpToccati: tpBase };

  const p0 = candele[0].o; // prezzo di mercato al momento del messaggio
  const oltreAlMessaggio: "tp" | "sl" | null = buy
    ? p0 >= tps[0] ? "tp" : p0 <= sig.stop_loss ? "sl" : null
    : p0 <= tps[0] ? "tp" : p0 >= sig.stop_loss ? "sl" : null;

  // ---- entrata
  let dal: CandelaE[] = candele;
  let entrata: number;
  if (sig.modo === "mercato") {
    entrata = p0;
    // chi legge il messaggio ora entra a p0: se è già oltre target o stop, non c'è nulla da copiare
    if (oltreAlMessaggio) {
      return {
        ...VUOTO, stato: "non_copiabile", entrataPrezzo: p0, entrataTempo: candele[0].t, tpToccati: tpBase,
        oltreAlMessaggio, prezzoAlMessaggio: p0, ultimoPrezzo: p0, ultimoTempo: candele[0].t, candeleUsate: candele.length,
      };
    }
  } else if (sig.modo === "aperto" && sig.entrata != null) {
    entrata = sig.entrata;
    // Il gruppo racconta una posizione già aperta: l'ipotesi più ragionevole è che sia stata aperta
    // l'ultima volta che il prezzo è passato dall'entrata dichiarata PRIMA del messaggio.
    let k = -1;
    for (let i = pre.length - 1; i >= 0; i--) {
      if (pre[i].l <= entrata && entrata <= pre[i].h) {
        k = i;
        break;
      }
    }
    if (k >= 0) dal = [...pre.slice(k), ...candele];
  } else if (sig.entrata != null) {
    entrata = sig.entrata;
    const fill = candele.findIndex((c) => c.l <= entrata && entrata <= c.h);
    if (fill < 0) {
      const ultima = candele[candele.length - 1];
      return { ...VUOTO, tpToccati: tpBase, ultimoPrezzo: ultima.c, ultimoTempo: ultima.t, candeleUsate: candele.length, prezzoAlMessaggio: p0 };
    }
    dal = candele.slice(fill);
  } else if (sig.zona) {
    // zona: primo contatto. Se la candela apre dentro la zona si entra all'apertura,
    // altrimenti sul bordo della zona da cui arriva il prezzo.
    const [lo, hi] = sig.zona;
    const fill = candele.findIndex((c) => c.l <= hi && c.h >= lo);
    if (fill < 0) {
      const ultima = candele[candele.length - 1];
      return { ...VUOTO, tpToccati: tpBase, ultimoPrezzo: ultima.c, ultimoTempo: ultima.t, candeleUsate: candele.length, prezzoAlMessaggio: p0 };
    }
    const c0 = candele[fill];
    entrata = c0.o >= lo && c0.o <= hi ? c0.o : c0.o > hi ? hi : lo;
    dal = candele.slice(fill);
  } else {
    entrata = p0; // a mercato
  }

  const rischio = Math.abs(entrata - sig.stop_loss);
  if (rischio === 0) return { ...VUOTO, tpToccati: tpBase, candeleUsate: candele.length, prezzoAlMessaggio: p0 };

  const segno = buy ? 1 : -1;
  const raggiunge = (c: CandelaE, livello: number, favorevole: boolean) =>
    favorevole === buy ? c.h >= livello : c.l <= livello; // buy: target sopra / stop sotto

  // ---- primo contatto di stop e di ogni target (nell'intero periodo)
  let slTempo: number | null = null;
  const tocchi = tpBase.map((x) => ({ ...x }));
  for (const c of dal) {
    if (slTempo === null && raggiunge(c, sig.stop_loss, false)) slTempo = c.t;
    for (const tp of tocchi) if (tp.tempo === null && raggiunge(c, tp.prezzo, true)) tp.tempo = c.t;
  }

  // ---- esito principale: prima volta tra stop e TP1
  const tp1 = tocchi[0].tempo;
  let stato: StatoEsito = "aperta";
  let uscitaTempo: number | null = null;
  let uscitaPrezzo: number | null = null;
  let ambigua = false;
  if (slTempo !== null && (tp1 === null || slTempo <= tp1)) {
    stato = "sl";
    uscitaTempo = slTempo;
    uscitaPrezzo = sig.stop_loss;
    ambigua = tp1 !== null && slTempo === tp1; // stessa candela: ordine sconosciuto, si assume lo stop
  } else if (tp1 !== null) {
    stato = "tp";
    uscitaTempo = tp1;
    uscitaPrezzo = tps[0];
  }

  // ---- escursioni massime fino all'uscita (o fino all'ultima candela)
  let mfe = 0;
  let mae = 0;
  for (const c of dal) {
    if (uscitaTempo !== null && c.t > uscitaTempo) break;
    const fav = buy ? c.h - entrata : entrata - c.l;
    const sfav = buy ? entrata - c.l : c.h - entrata;
    if (fav > mfe) mfe = fav;
    if (sfav > mae) mae = sfav;
  }
  // l'escursione non supera mai i livelli di uscita: a TP/SL il trade è chiuso
  if (stato === "tp") mfe = Math.min(mfe, Math.abs(tps[0] - entrata));
  if (stato === "sl") mae = Math.min(mae, rischio);

  const ultima = dal[dal.length - 1];
  const r = stato === "tp" ? Math.abs(tps[0] - entrata) / rischio : stato === "sl" ? -1 : null;
  const rFlottante = stato === "aperta" ? ((ultima.c - entrata) * segno) / rischio : null;
  const uscitaRispetto =
    uscitaTempo === null ? null : uscitaTempo < sig.ts - 60 ? "prima" : uscitaTempo < sig.ts ? "stesso_minuto" : "dopo";

  return {
    stato,
    entrataPrezzo: entrata,
    entrataTempo: dal[0].t,
    uscitaPrezzo,
    uscitaTempo,
    durataSec: uscitaTempo !== null ? uscitaTempo - dal[0].t : null,
    r,
    rFlottante,
    ambigua,
    tpToccati: tocchi,
    slTempo,
    mfe,
    mae,
    mfeR: mfe / rischio,
    maeR: mae / rischio,
    ultimoPrezzo: ultima.c,
    ultimoTempo: ultima.t,
    rischio,
    candeleUsate: dal.length,
    entrataPrimaDelMessaggio: dal[0].t < sig.ts,
    uscitaRispetto,
    oltreAlMessaggio,
    prezzoAlMessaggio: p0,
  };
}

export function formatDurata(sec: number | null): string {
  if (sec === null) return "—";
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  return `${Math.floor(h / 24)} g ${h % 24} h`;
}

export type Intervallo = "1min" | "5min" | "15min" | "30min" | "1h";
export const STEP_SEC: Record<Intervallo, number> = { "1min": 60, "5min": 300, "15min": 900, "30min": 1800, "1h": 3600 };

/**
 * Granularità più fine che sta nel limite di 5000 candele per richiesta.
 * (Tieni identica la regola in supabase/functions/segnale-andamento.)
 */
export function intervalloConsigliato(durataSecondi: number): "1min" | "5min" | "15min" {
  const g = durataSecondi / 86400;
  return g <= 3.2 ? "1min" : g <= 16.2 ? "5min" : "15min";
}

/** Quante candele di contesto si scaricano PRIMA del messaggio (servono a indicatori come l'EMA 200 e alla ricostruzione). */
export const CANDELE_DI_CONTESTO = 300;

/** Raggruppa candele fini in candele più grandi (es. da 1 minuto a 15 minuti). Le candele devono essere ordinate. */
export function aggrega(candele: CandelaE[], stepSec: number): CandelaE[] {
  const out: CandelaE[] = [];
  let cur: CandelaE | null = null;
  for (const c of candele) {
    const b = Math.floor(c.t / stepSec) * stepSec;
    if (!cur || cur.t !== b) {
      cur = { t: b, o: c.o, h: c.h, l: c.l, c: c.c };
      out.push(cur);
    } else {
      cur.h = Math.max(cur.h, c.h);
      cur.l = Math.min(cur.l, c.l);
      cur.c = c.c;
    }
  }
  return out;
}

/**
 * Se l'esito dipende dall'ordine in cui il prezzo ha toccato i livelli DENTRO una stessa candela,
 * ritorna l'orario di quella candela, da rifare con candele da 1 minuto. Altrimenti null.
 */
export function candelaDaRaffinare(esito: EsitoSegnale, stepSec: number): number | null {
  if (stepSec <= 60) return null;
  if (esito.ambigua && esito.uscitaTempo != null) return esito.uscitaTempo;
  if ((esito.stato === "tp" || esito.stato === "sl") && esito.uscitaTempo != null && esito.uscitaTempo === esito.entrataTempo) {
    return esito.uscitaTempo;
  }
  return null;
}

/** Sostituisce una candela con le sue candele più fini. */
export function sostituisciCandela(base: CandelaE[], inizio: number, stepSec: number, fini: CandelaE[]): CandelaE[] {
  const dentro = fini.filter((f) => f.t >= inizio && f.t < inizio + stepSec);
  if (dentro.length === 0) return base;
  return normalizzaCandele([...base.filter((c) => c.t !== inizio), ...dentro]);
}

/**
 * Quanto il prezzo di mercato (spot) di quel momento differisce dall'entrata scritta nel segnale.
 * Un grande scarto indica che il gruppo usa un broker con prezzi diversi, o che l'entrata era un ordine pendente.
 */
export function scartoAlMessaggio(sig: DatiSegnale, candele: CandelaE[]) {
  const prima = candele.filter((c) => c.t >= sig.ts).sort((a, b) => a.t - b.t)[0];
  if (!prima) return null;
  let riferimento: number;
  let scarto: number;
  if (sig.entrata != null) {
    riferimento = sig.entrata;
    scarto = prima.o - riferimento;
  } else if (sig.zona) {
    const [lo, hi] = sig.zona;
    riferimento = prima.o < lo ? lo : prima.o > hi ? hi : prima.o;
    scarto = prima.o < lo ? prima.o - lo : prima.o > hi ? prima.o - hi : 0;
  } else {
    return null;
  }
  return { prezzoSpot: prima.o, riferimento, scarto, scartoPct: (scarto / riferimento) * 100 };
}

/** Ordina per orario e toglie i doppioni/valori non numerici: il grafico altrimenti si rifiuta di partire. */
export function normalizzaCandele(candele: CandelaE[]): CandelaE[] {
  const valide = candele.filter((c) => [c.t, c.o, c.h, c.l, c.c].every((x) => Number.isFinite(x)));
  valide.sort((a, b) => a.t - b.t);
  return valide.filter((c, i) => i === 0 || c.t !== valide[i - 1].t);
}
