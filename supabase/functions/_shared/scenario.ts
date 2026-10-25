// Scenario USD – Indici – XAU (corso): le 3 correlazioni possibili in base alla propensione al rischio.
//  A (~70%)  Indici e XAU insieme, contrari al USD
//  B (~15%)  Indici e USD insieme, contrari a XAU
//  C (~15%)  USD e XAU insieme, contrari agli indici
// Si forma dopo l'apertura USA (15:30) e "matura" verso le 16:00 (orario italiano).
// Copia identica in lib/domain/scenario.ts: tienile allineate.

export type StatoScenario = "in_attesa" | "in_formazione" | "maturo" | "chiuso";
export type IdScenario = "A" | "B" | "C" | "concorde" | "incerto";

export interface RisultatoScenario {
  id: IdScenario;
  stato: StatoScenario;
  usd: number | null;
  xau: number | null;
  indici: number | null;
  titolo: string;
  descrizione: string;
  probabilita: number | null;
}

const SOGLIA_RUMORE = 0.05; // sotto lo 0,05% un movimento non è significativo

export function statoSessione(now: Date = new Date()): StatoScenario {
  const parti = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const giorno = parti.find((p) => p.type === "weekday")!.value;
  const h = Number(parti.find((p) => p.type === "hour")!.value) % 24;
  const m = Number(parti.find((p) => p.type === "minute")!.value);
  if (giorno === "Sat" || giorno === "Sun") return "chiuso";
  const minuti = h * 60 + m;
  if (minuti < 15 * 60 + 30) return "in_attesa";
  if (minuti < 16 * 60) return "in_formazione";
  if (minuti < 22 * 60) return "maturo";
  return "chiuso";
}

export function calcolaScenario(
  input: { usd: number | null; xau: number | null; indici: (number | null)[] },
  now: Date = new Date()
): RisultatoScenario {
  const validi = input.indici.filter((x): x is number => x !== null && !Number.isNaN(x));
  const indici = validi.length ? validi.reduce((a, b) => a + b, 0) / validi.length : null;
  const stato = statoSessione(now);
  const base = { stato, usd: input.usd, xau: input.xau, indici, probabilita: null as number | null };

  if (stato === "in_attesa") {
    return {
      ...base,
      id: "incerto",
      titolo: "In attesa dell'apertura USA",
      descrizione: "Lo scenario si forma dopo le 15:30 e matura verso le 16:00 (ora italiana).",
    };
  }
  if (input.usd === null || input.xau === null || indici === null) {
    return { ...base, id: "incerto", titolo: "Dati non disponibili", descrizione: "Mancano i prezzi di DXY, oro o indici." };
  }
  if ([input.usd, input.xau, indici].some((v) => Math.abs(v) < SOGLIA_RUMORE)) {
    return {
      ...base,
      id: "incerto",
      titolo: "Scenario non ancora definito",
      descrizione: "Almeno uno dei tre movimenti è troppo piccolo per stabilire la correlazione.",
    };
  }

  const su = Math.sign(input.usd);
  const sx = Math.sign(input.xau);
  const si = Math.sign(indici);

  if (sx === si && su !== sx) {
    return {
      ...base,
      id: "A",
      probabilita: 0.7,
      titolo: "Indici e oro insieme, dollaro contrario",
      descrizione: "Lo scenario più frequente: indici e XAU si muovono insieme, il dollaro nel verso opposto.",
    };
  }
  if (su === si && sx !== su) {
    return {
      ...base,
      id: "B",
      probabilita: 0.15,
      titolo: "Indici e dollaro insieme, oro contrario",
      descrizione: "Indici e USD si muovono insieme, XAU (e amici) nel verso opposto.",
    };
  }
  if (su === sx && si !== su) {
    return {
      ...base,
      id: "C",
      probabilita: 0.15,
      titolo: "Dollaro e oro insieme, indici contrari",
      descrizione: "Scenario estremo: USD e XAU si muovono insieme, l'azionario nel verso opposto.",
    };
  }
  return {
    ...base,
    id: "concorde",
    titolo: "Tutti nella stessa direzione",
    descrizione: "Dollaro, oro e indici vanno insieme: non è uno dei 3 scenari tipici del corso.",
  };
}
