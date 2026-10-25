import type { CandelaGrafico } from "./indicatoriGrafico";
import { italiaAUtc, oraItaliana } from "./orario";

/**
 * Giornate per i grafici, sempre in ora italiana:
 *  "23:00"  giornata di trading del forex e dell'oro (la candela giornaliera del broker comincia alle 23:00 italiane)
 *  "00:00"  giornata solare (mezzanotte italiana)
 */
export type InizioGiornata = "23:00" | "00:00";

export interface GruppoGiorno {
  inizio: number; // secondi unix (UTC) dell'inizio della giornata
  candele: CandelaGrafico[];
}

function aggiungiGiorni(data: string, n: number): string {
  const [y, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Istanti (secondi UTC) in cui comincia una giornata, con un giorno di margine prima e dopo l'intervallo. */
export function confini(da: number, a: number, inizio: InizioGiornata): number[] {
  const out: number[] = [];
  let data = aggiungiGiorni(oraItaliana(da * 1000).data, -1);
  const fine = aggiungiGiorni(oraItaliana(a * 1000).data, 1);
  for (let i = 0; i < 800 && data <= fine; i++) {
    const r = italiaAUtc(data, inizio);
    if (r) out.push(r.sec);
    data = aggiungiGiorni(data, 1);
  }
  return out;
}

/** Divide le candele (ordinate) per giornata. */
export function raggruppa(candele: CandelaGrafico[], inizio: InizioGiornata): GruppoGiorno[] {
  if (candele.length === 0) return [];
  const b = confini(candele[0].t, candele[candele.length - 1].t, inizio);
  const gruppi: GruppoGiorno[] = [];
  let j = 0;
  for (const c of candele) {
    while (j + 1 < b.length && b[j + 1] <= c.t) j++;
    let g = gruppi[gruppi.length - 1];
    if (!g || g.inizio !== b[j]) {
      g = { inizio: b[j], candele: [] };
      gruppi.push(g);
    }
    g.candele.push(c);
  }
  return gruppi;
}

/** Una giornata "vera": con movimento. Il weekend (mercato chiuso, prezzo fermo) non lo è. */
export function giornoAttivo(g: GruppoGiorno): boolean {
  if (g.candele.length < 2) return false;
  let hi = -Infinity;
  let lo = Infinity;
  for (const c of g.candele) {
    if (c.h > hi) hi = c.h;
    if (c.l < lo) lo = c.l;
  }
  return hi > lo;
}

/** Istanti delle candele con cui comincia una nuova giornata (la prima del grafico e i giorni a mercato chiuso si saltano). */
export function inizioNuoviGiorni(candele: CandelaGrafico[], inizio: InizioGiornata): number[] {
  return raggruppa(candele, inizio)
    .slice(1)
    .filter(giornoAttivo)
    .map((g) => g.candele[0].t);
}

export interface GiornoPrima {
  alto: number;
  basso: number;
  /** inizio della giornata a cui si riferisce (secondi UTC) */
  inizio: number;
}

/**
 * Massimo e minimo del giorno PRIMA di quello che contiene `riferimento`: una sola coppia di valori,
 * mai quelli dei giorni ancora precedenti. Se il giorno prima era a mercato chiuso (weekend) si prende
 * l'ultimo giorno con movimento.
 */
export function giornoPrima(candele: CandelaGrafico[], riferimento: number, inizio: InizioGiornata): GiornoPrima | null {
  const gruppi = raggruppa(candele, inizio);
  let idx = -1;
  for (let i = 0; i < gruppi.length; i++) if (gruppi[i].inizio <= riferimento) idx = i;
  for (let i = idx - 1; i >= 0; i--) {
    const g = gruppi[i];
    if (!giornoAttivo(g)) continue;
    return {
      alto: Math.max(...g.candele.map((c) => c.h)),
      basso: Math.min(...g.candele.map((c) => c.l)),
      inizio: g.inizio,
    };
  }
  return null;
}

/** Inizio (UTC) della giornata che contiene `istante`. */
export function inizioGiornoDi(istante: number, inizio: InizioGiornata): number {
  const b = confini(istante, istante, inizio).filter((x) => x <= istante);
  return b[b.length - 1];
}

const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const GIORNI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

/** Giorno della settimana (0 = domenica) e minuti dall'inizio della giornata, in ora italiana. */
function giornoEMinuti(sec: number): { dow: number; min: number; data: string } {
  const { data, ora } = oraItaliana(sec * 1000);
  const [y, m, d] = data.split("-").map(Number);
  const [H, M] = ora.split(":").map(Number);
  return { dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay(), min: H * 60 + M, data };
}

/**
 * Toglie le candele a mercato chiuso (forex e oro): dal venerdì alle 23:00 alla domenica alle 22:00,
 * ora italiana. La libreria dei grafici distanzia le candele per NUMERO, non per orario: senza questo
 * filtro il weekend diventa una lunga zona vuota/piatta nel mezzo del grafico.
 */
export function rimuoviMercatoChiuso<T extends { t: number }>(candele: T[]): T[] {
  return candele.filter((c) => {
    const { dow, min } = giornoEMinuti(c.t);
    if (dow === 6) return false; // sabato
    if (dow === 5 && min >= 23 * 60) return false; // venerdì dalle 23:00
    if (dow === 0 && min < 22 * 60) return false; // domenica fino alle 22:00
    return true;
  });
}

/** Linee verticali dei giorni: istante della prima candela di ogni nuova giornata + etichetta ("mar 15 set"). */
export function giorniPerGrafico(
  candele: CandelaGrafico[],
  inizio: InizioGiornata
): { t: number; etichetta: string }[] {
  const out: { t: number; etichetta: string }[] = [];
  for (const g of raggruppa(candele, inizio).slice(1)) {
    if (!giornoAttivo(g)) continue;
    // la giornata di trading che comincia alle 23:00 prende il nome del giorno SUCCESSIVO
    const rif = inizio === "23:00" ? g.inizio + 3 * 3600 : g.inizio + 60;
    const { dow, data } = giornoEMinuti(rif);
    if (dow === 0 || dow === 6) continue; // i pochi minuti di apertura della domenica sera fanno parte del lunedì
    const [, m, d] = data.split("-").map(Number);
    out.push({ t: g.candele[0].t, etichetta: `${GIORNI[dow]} ${d} ${MESI[m - 1]}` });
  }
  return out;
}
