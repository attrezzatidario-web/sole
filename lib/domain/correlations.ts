/**
 * Regole di dominio estratte dal materiale del corso (CORSO_PDF).
 * Questo file NON contiene testo statico da mostrare: sono strutture dati
 * usate dal motore di correlazione (Edge Function `ingest-prices`) e dal
 * frontend per costruire le watchlist e risalire agli asset correlati.
 */

export type AssetCategory = "forex" | "metallo" | "materia_prima" | "indice";

export interface AssetDef {
  symbol: string;
  categoria: AssetCategory;
  label: string;
}

// Elenco di tutti gli asset che compaiono nelle 5 watchlist del corso.
export const ASSETS: AssetDef[] = [
  { symbol: "EURUSD", categoria: "forex", label: "Euro / Dollaro USA" },
  { symbol: "AUDUSD", categoria: "forex", label: "Dollaro Australiano / Dollaro USA" },
  { symbol: "NZDUSD", categoria: "forex", label: "Dollaro Neozelandese / Dollaro USA" },
  { symbol: "GBPUSD", categoria: "forex", label: "Sterlina / Dollaro USA" },
  { symbol: "USDCAD", categoria: "forex", label: "Dollaro USA / Dollaro Canadese" },
  { symbol: "USDCHF", categoria: "forex", label: "Dollaro USA / Franco Svizzero" },
  { symbol: "AUDJPY", categoria: "forex", label: "Dollaro Australiano / Yen" },
  { symbol: "NZDJPY", categoria: "forex", label: "Dollaro Neozelandese / Yen" },
  { symbol: "CADJPY", categoria: "forex", label: "Dollaro Canadese / Yen" },
  { symbol: "GBPJPY", categoria: "forex", label: "Sterlina / Yen" },
  { symbol: "XAUUSD", categoria: "metallo", label: "Oro / Dollaro USA" },
  { symbol: "XAGUSD", categoria: "metallo", label: "Argento / Dollaro USA" },
  { symbol: "PL1!", categoria: "metallo", label: "Platino (future)" },
  { symbol: "COPPER", categoria: "metallo", label: "Rame" },
  { symbol: "USOIL", categoria: "materia_prima", label: "Petrolio WTI" },
  { symbol: "XBRUSD", categoria: "materia_prima", label: "Petrolio Brent" },
  { symbol: "BR1!", categoria: "materia_prima", label: "Brent (future)" },
  { symbol: "DXY", categoria: "indice", label: "Indice Dollaro USA" },
  { symbol: "DJI", categoria: "indice", label: "Dow Jones" },
  { symbol: "SPX", categoria: "indice", label: "S&P 500" },
  { symbol: "NDQ", categoria: "indice", label: "Nasdaq" },
];

// Le 5 watchlist così come organizzate nel corso.
// L'ordine qui NON è quello di visualizzazione: in dashboard vanno sempre
// riordinate per variazione % (vedi components/WatchlistTable).
export const WATCHLISTS: { nome: string; descrizione: string; simboli: string[] }[] = [
  {
    nome: "Forex",
    descrizione:
      "Vista d'insieme del mercato: mostra se una correlazione si sta confermando o invertendo tra valute, indici e commodity.",
    simboli: [
      "AUDJPY",
      "AUDUSD",
      "CADJPY",
      "EURUSD",
      "GBPJPY",
      "GBPUSD",
      "NZDJPY",
      "NZDUSD",
      "USDCAD",
      "USDCHF",
      "XAUUSD",
    ],
  },
  {
    nome: "Indicatori Oro",
    descrizione:
      "Andamento dell'oro, da usare da sola o insieme a 'Indici Anti USD' (dalle 15:30) per capire quale delle 3 correlazioni USD/XAU/Indici sta prevalendo.",
    simboli: ["NZDUSD", "AUDUSD", "EURUSD", "XAUUSD", "DXY", "XAGUSD"],
  },
  {
    nome: "Indici Anti USD",
    descrizione:
      "Da incrociare con 'Indicatori Oro' per determinare, verso le 16:00, quale delle 3 correlazioni USD-Indici-XAU è in corso.",
    simboli: ["DJI", "SPX", "NDQ"],
  },
  {
    nome: "Petrolio",
    descrizione:
      "Il petrolio è quotato in dollari: correlazione negativa con USD, positiva con CAD e GBP (paesi produttori/raffinatori) e con JPY negativamente.",
    simboli: ["USOIL", "XBRUSD", "BR1!", "CADJPY", "GBPUSD", "GBPJPY", "USDCAD"],
  },
  {
    nome: "Metalli",
    descrizione:
      "Il salire delle materie prime correla negativamente con JPY. Il Platino spesso anticipa l'Oro ma va confermato dall'Argento.",
    simboli: ["PL1!", "COPPER", "XAUUSD", "XAGUSD"],
  },
];

// Gruppi di correlazione "macro" della mappa del corso.
export const CORRELATION_GROUPS = {
  sinistra: ["EUR", "AUD", "NZD", "XAU"],
  destra: ["USD", "JPY"],
  centroSinistra: ["PETROLIO", "CAD", "GBP"],
};

// Ordine di priorità degli asset rifugio.
export const ASSET_RIFUGIO_PRIORITY = ["USD", "CHF", "XAU"];

export type TipoCorrelazione = "positiva" | "negativa";

export interface CorrelazioneCoppia {
  coppia: string;
  tipo: TipoCorrelazione;
  nota: string;
}

// "Coppie tradabili con senso" — tabella 1:1 dal corso.
export const CORRELAZIONI_COPPIE: CorrelazioneCoppia[] = [
  { coppia: "EURUSD", tipo: "negativa", nota: "Se cresce uno scende l'altro e viceversa." },
  { coppia: "AUDUSD", tipo: "positiva", nota: "Cresce con il crescere dell'oro e viceversa." },
  { coppia: "NZDUSD", tipo: "positiva", nota: "Cresce con il crescere dell'oro e viceversa." },
  {
    coppia: "XAUUSD",
    tipo: "negativa",
    nota: "XAU segue materie prime e metalli; USD si correla negativamente con il petrolio.",
  },
  {
    coppia: "AUDJPY",
    tipo: "positiva",
    nota: "Cresce con il crescere dell'oro e dei metalli e viceversa.",
  },
  {
    coppia: "NZDJPY",
    tipo: "positiva",
    nota: "Cresce con il crescere dell'oro e dei metalli e viceversa.",
  },
  { coppia: "XBRUSD", tipo: "negativa", nota: "Se sale il petrolio scende il dollaro e viceversa." },
  {
    coppia: "USDCAD",
    tipo: "negativa",
    nota: "Cresce al diminuire del prezzo del petrolio e viceversa.",
  },
  { coppia: "GBPUSD", tipo: "positiva", nota: "Cresce al crescere del prezzo del petrolio e viceversa." },
  { coppia: "CADJPY", tipo: "positiva", nota: "Cresce al crescere del prezzo del petrolio e viceversa." },
  { coppia: "GBPJPY", tipo: "positiva", nota: "Cresce al crescere del prezzo del petrolio e viceversa." },
  {
    coppia: "USDCHF",
    tipo: "negativa",
    nota: "Sono 2 asset di rifugio: se sale uno scende l'altro e viceversa.",
  },
];

// Le 3 correlazioni possibili USD - Indici - XAU (in base al risk appetite),
// che di norma maturano verso le 16:00.
export interface ScenarioCorrelazioneUsdIndiciXau {
  id: "A" | "B" | "C";
  probabilita: number; // storica, indicativa
  nome: string;
  descrizione: string;
  rischio: string;
}

export const SCENARI_USD_INDICI_XAU: ScenarioCorrelazioneUsdIndiciXau[] = [
  {
    id: "A",
    probabilita: 0.7,
    nome: "Indici e XAU insieme, negativi su USD",
    descrizione:
      "Gli indici e XAU (e amici) salgono e scendono insieme e hanno una correlazione negativa con USD.",
    rischio: "Rischio alto / rischio basso (a seconda della direzione)",
  },
  {
    id: "B",
    probabilita: 0.15,
    nome: "Indici e USD insieme, negativi su XAU",
    descrizione:
      "Gli indici e USD salgono e scendono insieme e hanno una correlazione negativa con XAU (e amici).",
    rischio: "Rischio alto / rischio basso (a seconda della direzione)",
  },
  {
    id: "C",
    probabilita: 0.15,
    nome: "USD e XAU insieme, negativi sugli indici",
    descrizione:
      "USD e XAU salgono e scendono insieme e hanno una correlazione negativa con l'azionario.",
    rischio: "Rischio troppo alto / rischio troppo basso (scenario estremo)",
  },
];

/**
 * Ritorna, per un dato simbolo, l'elenco delle correlazioni dirette note
 * (dalla tabella "coppie tradabili con senso") più gli asset che condividono
 * una watchlist con lui — utile come base per il report AI di un asset.
 */
export function getCorrelazioniDirette(symbol: string): CorrelazioneCoppia[] {
  return CORRELAZIONI_COPPIE.filter((c) => c.coppia === symbol.toUpperCase());
}

export function getWatchlistDiAppartenenza(symbol: string): string[] {
  return WATCHLISTS.filter((w) => w.simboli.includes(symbol.toUpperCase())).map(
    (w) => w.nome
  );
}

/**
 * Asset "vicini" da mostrare nel report di un asset: unione di
 * - simboli della stessa watchlist
 * - simboli citati nella nota di correlazione diretta (parsing leggero)
 * Deduplica ed esclude l'asset stesso.
 */
export function getAssetCorrelatiPerReport(symbol: string): string[] {
  const upper = symbol.toUpperCase();
  const daWatchlist = WATCHLISTS.filter((w) => w.simboli.includes(upper)).flatMap(
    (w) => w.simboli
  );
  const set = new Set(daWatchlist);
  set.delete(upper);
  return Array.from(set);
}
