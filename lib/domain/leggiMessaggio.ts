/**
 * Interprete dei messaggi di segnale (stesse regole del programma Python bot/parser.py: tienili allineati).
 * Qui, a differenza del programma, i campi trovati vengono restituiti anche quando il messaggio
 * non è completo: servono a precompilare il modulo dell'analizzatore.
 */

export interface VoceLettura {
  campo: string;
  valore: string;
  da: string;
}

export interface CampiLetti {
  simbolo: string | null;
  direzione: "buy" | "sell" | null;
  entrata: number | null;
  zona: [number, number] | null;
  stopLoss: number | null;
  takeProfits: number[];
  riportato: boolean; // "Ho venduto a 4224": operazione già aperta dal gruppo
  tipoOrdine: "market" | "limit" | "stop";
}

export interface EsitoLettura {
  ok: boolean;
  motivo: string;
  campi: CampiLetti;
  lettura: VoceLettura[];
}

const ALIAS_BASE: Record<string, string> = { XAUUSD: "XAUUSD", XAU: "XAUUSD", GOLD: "XAUUSD", ORO: "XAUUSD" };
const BUY = ["BUY", "LONG", "COMPRA", "COMPRARE", "COMPRATO", "ACQUISTA", "ACQUISTARE", "ACQUISTATO", "ACQUISTO"];
const SELL = ["SELL", "SHORT", "VENDI", "VENDERE", "VENDUTO", "VENDITA"];
const PASSATO = ["COMPRATO", "ACQUISTATO", "VENDUTO"];
const BLOCCO = [
  "HIT", "RAGGIUNTO", "RAGGIUNTA", "CHIUSO", "CHIUSA", "CLOSED", "CLOSE", "CHIUDI",
  "BREAK EVEN", "BREAKEVEN", "MOVE SL", "SPOSTA", "CANCEL", "CANCELLA", "ANNULLA",
  "UPDATE", "AGGIORNAMENTO", "RISULTATO", "RESULT", "PROFIT SECURED", "TAKEN",
];
const NUM = "(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,5})?|\\d{1,6}(?:[.,]\\d{1,5})?)";
const ORDINE = ["Simbolo", "Direzione", "Tipo di operazione", "Tipo di ordine", "Entrata", "Zona di entrata", "Stop loss"];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function normalizza(testo: string): string {
  let t = testo.normalize("NFKC").toUpperCase();
  t = t.replace(/[^\p{L}\p{N}_\s.,/:@\-+=]/gu, " "); // via emoji e simboli
  t = t.replace(/_/g, " ").replace(/XAU\/USD/g, "XAUUSD");
  return t.replace(/\s+/g, " ").trim();
}

function numero(s: string): number | null {
  s = s.trim();
  if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, "");
  else if (s.includes(",")) {
    const [intero, dec] = [s.split(",")[0], s.split(",").slice(1).join(",")];
    if (dec.length === 3 && intero.length >= 1 && intero.length <= 3) s = intero + dec; // "4,150" migliaia
    else if (dec.length <= 2) s = `${intero}.${dec}`; // "4150,50" decimale
    else return null; // "2660,2670": ambiguo, non si indovina
  }
  const v = Number(s);
  return Number.isFinite(v) && v > 0 ? v : null;
}

const fmtN = (v: number) => String(v);
const voce = (campo: string, valore: string, da = ""): VoceLettura => ({ campo, valore, da: da.trim() });

function ordina(l: VoceLettura[]): VoceLettura[] {
  const chiave = (v: VoceLettura): [number, number] => {
    const i = ORDINE.indexOf(v.campo);
    if (i >= 0) return [i, 0];
    return [ORDINE.length, v.campo.startsWith("Take profit") ? parseInt(v.campo.split(" ").pop() ?? "99", 10) : 99];
  };
  return [...l].sort((a, b) => {
    const [x, y] = [chiave(a), chiave(b)];
    return x[0] - y[0] || x[1] - y[1];
  });
}

export function leggiMessaggio(testo: string, simboliNoti: string[] = []): EsitoLettura {
  const campi: CampiLetti = {
    simbolo: null, direzione: null, entrata: null, zona: null, stopLoss: null,
    takeProfits: [], riportato: false, tipoOrdine: "market",
  };
  const lettura: VoceLettura[] = [];
  let motivo = "";
  const errore = (m: string) => {
    if (!motivo) motivo = m;
  };
  const fine = (): EsitoLettura => ({ ok: !motivo, motivo, campi, lettura: ordina(lettura) });

  const t = normalizza(testo || "");
  if (!t) {
    errore("messaggio vuoto");
    return fine();
  }

  for (const w of BLOCCO) {
    if (new RegExp(`\\b${esc(w)}\\b`).test(t)) {
      errore(`sembra un aggiornamento o un risultato (${w}), non un nuovo segnale`);
      break;
    }
  }

  // ---- simbolo
  const alias: Record<string, string> = { ...ALIAS_BASE };
  for (const s of simboliNoti) if (/^[A-Z0-9]+$/.test(s)) alias[s] = s;
  const trovati = new Map<string, string>();
  for (const [a, canon] of Object.entries(alias)) {
    const m = new RegExp(`(?<![A-Z0-9])${esc(a)}(?![A-Z0-9])`).exec(t);
    if (m && !trovati.has(canon)) trovati.set(canon, m[0]);
  }
  if (trovati.size === 0) errore("nessun simbolo riconosciuto");
  else if (trovati.size > 1) errore(`più simboli nello stesso messaggio (${Array.from(trovati.keys()).sort().join(", ")})`);
  else {
    const [s, da] = Array.from(trovati.entries())[0];
    campi.simbolo = s;
    lettura.push(voce("Simbolo", s, da));
  }

  // ---- direzione
  const dirs = new Map<"buy" | "sell", string>();
  for (const w of BUY) if (new RegExp(`\\b${w}\\b`).test(t) && !dirs.has("buy")) dirs.set("buy", w);
  for (const w of SELL) if (new RegExp(`\\b${w}\\b`).test(t) && !dirs.has("sell")) dirs.set("sell", w);
  if (dirs.size === 0) errore("nessuna direzione (buy/sell) trovata");
  else if (dirs.size > 1) errore("direzioni contrastanti nello stesso messaggio");
  else {
    const [dir, parola] = Array.from(dirs.entries())[0];
    campi.direzione = dir;
    lettura.push(voce("Direzione", dir.toUpperCase(), parola));
    if (PASSATO.includes(parola)) {
      campi.riportato = true;
      lettura.push(voce("Tipo di operazione", "già aperta dal gruppo", parola));
    }
  }

  const mk = /\b(?:BUY|SELL|LONG|SHORT)\s+(LIMIT|STOP)\b/.exec(t);
  if (mk) {
    campi.tipoOrdine = mk[1].toLowerCase() as "limit" | "stop";
    lettura.push(voce("Tipo di ordine", mk[1], mk[0]));
  }

  // ---- stop loss e take profit
  const slValori: number[] = [];
  let slDa = "";
  for (const m of t.matchAll(new RegExp(`\\b(?:SL|S/L|STOP ?LOSS|STOPLOSS)\\b\\s*[:=@]?\\s*${NUM}`, "g"))) {
    const v = numero(m[1]);
    if (v) {
      slValori.push(v);
      slDa = slDa || m[0];
    }
  }
  if (new Set(slValori).size > 1) errore("più stop loss diversi nel messaggio");
  if (slValori.length) {
    campi.stopLoss = slValori[0];
    lettura.push(voce("Stop loss", fmtN(slValori[0]), slDa));
  } else errore("manca lo stop loss");

  const tpPat = new RegExp(`\\b(?:TP|T/P|TAKE ?PROFIT|TARGET|TGT)(?:\\s?[1-9](?=[\\s:=@]+\\d))?\\s*[:=@]?\\s*${NUM}`, "g");
  for (const m of t.matchAll(tpPat)) {
    const v = numero(m[1]);
    if (v && !campi.takeProfits.includes(v)) {
      campi.takeProfits.push(v);
      lettura.push(voce(`Take profit ${campi.takeProfits.length}`, fmtN(v), m[0]));
    }
  }
  if (!campi.takeProfits.length) errore("manca il take profit");

  // ---- entrata
  const dirAlt = [...BUY, ...SELL].join("|");
  const symAlt = Object.keys(alias).sort((a, b) => b.length - a.length).map(esc).join("|");
  const sep = "(?:[@:=]|AT\\b|A\\b)?\\s*";
  const zona = `${NUM}(?:\\s*[-/]\\s*${NUM})?`;
  const candidati = [
    `(?:\\b(?:ENTRY(?: ZONE)?|ENTER|ENTRA|ENTRATA|PRICE|PREZZO|ZONA|AREA|AT)\\b|@)\\s*[:=]?\\s*${zona}`,
    `\\b(?:${dirAlt})\\b\\s+(?:(?:LIMIT|STOP|NOW|MARKET)\\s+)?(?:(?:${symAlt})\\s+)?(?:(?:LIMIT|STOP|NOW|MARKET)\\s+)?${sep}${zona}`,
    `\\b(?:${symAlt})\\b\\s+(?:${dirAlt})\\b\\s+(?:(?:LIMIT|STOP|NOW|MARKET)\\s+)?${sep}${zona}`,
  ];
  for (const pat of candidati) {
    const m = new RegExp(pat).exec(t);
    if (!m) continue;
    const a = numero(m[1]);
    const b = m[2] ? numero(m[2]) : null;
    if (a === null || (m[2] && b === null)) {
      errore("prezzo di entrata non leggibile");
    } else if (b !== null && a !== b) {
      campi.zona = [Math.min(a, b), Math.max(a, b)];
      lettura.push(voce("Zona di entrata", `${fmtN(campi.zona[0])} – ${fmtN(campi.zona[1])}`, m[0]));
    } else {
      campi.entrata = a;
      lettura.push(voce("Entrata", fmtN(a), m[0]));
    }
    break;
  }
  if (campi.entrata === null && campi.zona === null && !motivo.includes("entrata non leggibile")) {
    const ora = /\b(?:NOW|MARKET|ADESSO|ORA|SUBITO)\b/.exec(t);
    lettura.push(voce("Entrata", "a mercato", ora ? ora[0] : "(nessun prezzo indicato)"));
  }
  if ((campi.tipoOrdine === "limit" || campi.tipoOrdine === "stop") && campi.entrata === null && campi.zona === null) {
    errore(`ordine ${campi.tipoOrdine} senza prezzo di entrata`);
  }

  // ---- coerenza dei livelli
  const rif = campi.entrata ?? (campi.zona ? (campi.zona[0] + campi.zona[1]) / 2 : null);
  const sl = campi.stopLoss;
  const tps = campi.takeProfits;
  const dir = campi.direzione;
  if (sl !== null && dir) {
    if (rif !== null && sl === rif) errore("stop loss uguale al prezzo di entrata");
    if (dir === "buy") {
      if (rif !== null && sl >= rif) errore("incoerente: in un BUY lo stop loss deve stare sotto l'entrata");
      if (tps.length && rif === null && sl >= Math.min(...tps)) errore("incoerente: in un BUY lo stop loss deve stare sotto i take profit");
    } else {
      if (rif !== null && sl <= rif) errore("incoerente: in un SELL lo stop loss deve stare sopra l'entrata");
      if (tps.length && rif === null && sl <= Math.max(...tps)) errore("incoerente: in un SELL lo stop loss deve stare sopra i take profit");
    }
  }
  if (dir && rif !== null) {
    for (const tp of tps) {
      if ((dir === "buy" && tp <= rif) || (dir === "sell" && tp >= rif)) {
        errore("incoerente: un take profit è dalla parte sbagliata rispetto all'entrata");
        break;
      }
    }
  }
  return fine();
}
