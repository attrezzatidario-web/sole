/**
 * Orari chiave della giornata (fuso orario Italia) come descritti nel corso.
 * `minutiDaMezzanotte` è calcolato in orario Italia per poter confrontare
 * facilmente con l'ora corrente.
 */
export interface FasciaOraria {
  orario: string; // "HH:MM"
  minutiDaMezzanotte: number;
  titolo: string;
  nota: string;
}

function toMinuti(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const RAW_SCHEDULE: Omit<FasciaOraria, "minutiDaMezzanotte">[] = [
  {
    orario: "09:00",
    titolo: "Mattina",
    nota:
      "Fino alle 13 osserva l'andamento generale dei vari asset e segna eventuali key level importanti.",
  },
  {
    orario: "13:00",
    titolo: "Fine pausa pranzo istituzioni",
    nota:
      "Primi movimenti significativi sui vari asset, possibili input di entrata sui livelli chiave.",
  },
  {
    orario: "14:00",
    titolo: "Apertura Wall Street",
    nota: "Aumento della liquidità sul mercato.",
  },
  {
    orario: "14:30",
    titolo: "Calendario economico principale",
    nota: "Escono le notizie più importanti e significative della giornata.",
  },
  {
    orario: "15:30",
    titolo: "Apertura mercato azionario USA",
    nota: "Da qui puoi incrociare 'Indicatori Oro' e 'Indici Anti USD'.",
  },
  {
    orario: "16:00",
    titolo: "Maturazione correlazioni Azionario–USD",
    nota:
      "Da usare come bussola per capire quale dei 3 scenari di correlazione USD-Indici-XAU è in corso. Possibile pubblicazione di altri fondamentali.",
  },
  {
    orario: "20:00",
    titolo: "Comunicazioni FED",
    nota: "Alta volatilità attesa.",
  },
  {
    orario: "20:30",
    titolo: "Eventuali conferenze",
    nota: "Possibili follow-up alle comunicazioni FED.",
  },
  {
    orario: "00:00",
    titolo: "Notizie asiatiche/oceaniche",
    nota:
      "Dalla mezzanotte alle 4 escono notizie rilevanti soprattutto per ORO, NZD/USD, AUD/USD, NZD/JPY, AUD/JPY.",
  },
];

export const SCHEDULE: FasciaOraria[] = RAW_SCHEDULE.map((s) => ({
  ...s,
  minutiDaMezzanotte: toMinuti(s.orario),
})).sort((a, b) => a.minutiDaMezzanotte - b.minutiDaMezzanotte);

/** Minuti trascorsi da mezzanotte in ORARIO ITALIANO (il server gira in UTC). */
export function minutiOraItalia(now: Date = new Date()): number {
  const parti = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = Number(parti.find((x) => x.type === "hour")!.value) % 24;
  const m = Number(parti.find((x) => x.type === "minute")!.value);
  return h * 60 + m;
}

export interface FaseCorrente {
  attuale: FasciaOraria;
  prossima: FasciaOraria;
  minutiAllaProssima: number;
}

/**
 * Data un'ora Italia (default: adesso), ritorna la fascia attualmente in
 * corso e quella successiva, per il componente FasciaOrariaBar e per il
 * payload che va all'AI in `generate-report`.
 */
export function getFaseCorrente(now: Date = new Date()): FaseCorrente {
  const minutiOra = minutiOraItalia(now);

  let attuale = SCHEDULE[SCHEDULE.length - 1];
  let prossimaIndex = 0;

  for (let i = 0; i < SCHEDULE.length; i++) {
    if (SCHEDULE[i].minutiDaMezzanotte <= minutiOra) {
      attuale = SCHEDULE[i];
      prossimaIndex = (i + 1) % SCHEDULE.length;
    }
  }

  const prossima = SCHEDULE[prossimaIndex];
  let minutiAllaProssima = prossima.minutiDaMezzanotte - minutiOra;
  if (minutiAllaProssima <= 0) minutiAllaProssima += 24 * 60;

  return { attuale, prossima, minutiAllaProssima };
}
