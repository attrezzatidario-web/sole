/**
 * Conversione dell'ora italiana (quella che si legge su Telegram) in istante universale (UTC),
 * che è l'ora dei dati di mercato. Tiene conto dell'ora legale (UTC+2 da fine marzo a fine ottobre,
 * UTC+1 il resto dell'anno) usando il database dei fusi orari del dispositivo.
 *
 * Non usa mai il fuso del telefono/computer: l'ora scritta è sempre interpretata come ora italiana,
 * anche se si è all'estero.
 */
const FUSO = "Europe/Rome";

const fmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: FUSO,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function parti(ms: number): Record<string, string> {
  const p: Record<string, string> = {};
  for (const x of fmt.formatToParts(new Date(ms))) p[x.type] = x.value;
  return p;
}

/** Scarto in minuti dell'ora italiana rispetto a UTC in quell'istante (120 d'estate, 60 d'inverno). */
export function offsetItalia(ms: number): number {
  const p = parti(ms);
  const comeUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((comeUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

export interface OrarioUtc {
  /** secondi unix (UTC) dell'inizio di quel minuto italiano */
  sec: number;
  /** true se quell'ora italiana esiste due volte (notte del cambio all'ora solare): si usa la prima */
  ambiguo: boolean;
}

/**
 * "2026-10-02" + "14:33" (ora italiana) → istante UTC.
 * Ritorna null se la data/ora non è valida o se quell'ora non esiste (notte del passaggio all'ora legale).
 */
export function italiaAUtc(data: string, ora: string): OrarioUtc | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  const t = /^(\d{1,2}):(\d{2})$/.exec(ora);
  if (!d || !t) return null;
  const [y, mo, g, H, M] = [+d[1], +d[2], +d[3], +t[1], +t[2]];
  if (mo < 1 || mo > 12 || g < 1 || g > 31 || H > 23 || M > 59) return null;

  const locale = Date.UTC(y, mo - 1, g, H, M); // l'ora italiana "scritta come se fosse UTC"
  const ctrl = new Date(locale);
  if (ctrl.getUTCFullYear() !== y || ctrl.getUTCMonth() !== mo - 1 || ctrl.getUTCDate() !== g) return null; // es. 31 febbraio

  // Si provano gli scarti validi il giorno prima e il giorno dopo; un candidato vale solo se,
  // riconvertito in ora italiana, ridà esattamente l'ora scritta.
  const candidati = new Set<number>();
  for (const prova of [locale - 86400000, locale + 86400000]) candidati.add(locale - offsetItalia(prova) * 60000);
  const validi = Array.from(candidati)
    .filter((u) => offsetItalia(u) * 60000 === locale - u)
    .sort((a, b) => a - b);
  if (validi.length === 0) return null;
  return { sec: validi[0] / 1000, ambiguo: validi.length > 1 };
}

/** Data e ora italiane di un istante, nel formato dei campi del modulo. */
export function oraItaliana(ms: number = Date.now()): { data: string; ora: string } {
  const p = parti(ms);
  return { data: `${p.year}-${p.month}-${p.day}`, ora: `${p.hour}:${p.minute}` };
}

/** "UTC+2" o "UTC+1": per mostrare chiaramente quale ora si sta usando. */
export function etichettaFuso(ms: number): string {
  const o = offsetItalia(ms) / 60;
  return `UTC${o >= 0 ? "+" : ""}${o}`;
}
