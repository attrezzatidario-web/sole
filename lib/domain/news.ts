/**
 * Metadata di riferimento sulle notizie fondamentali citate nel corso.
 * Gli eventi live vengono importati nella tabella `news_events` dalla
 * Edge Function `sync-calendar` (feed pubblico ForexFactory); questo file
 * serve solo a mostrare la spiegazione nel calendario e nel report AI.
 */
export interface TipoNotizia {
  chiave: string;
  nome: string;
  spiegazione: string;
  usoOperativo: string;
}

export const TIPI_NOTIZIA: TipoNotizia[] = [
  {
    chiave: "TASSO_INTERESSE",
    nome: "Tasso di interesse",
    spiegazione:
      "Valore fissato dalle banche centrali per definire la politica monetaria di un paese.",
    usoOperativo:
      "Tassi più alti favoriscono investimenti esteri e aumentano il valore della valuta, e viceversa.",
  },
  {
    chiave: "TASSO_DISOCCUPAZIONE",
    nome: "Tasso di disoccupazione",
    spiegazione:
      "Percentuale di forza lavoro disoccupata che cerca attivamente lavoro dal mese precedente.",
    usoOperativo:
      "Indicatore lento: unendo i dati mensili nel tempo può anticipare future decisioni sui tassi.",
  },
  {
    chiave: "SUSSIDI_DISOCCUPAZIONE",
    nome: "Richieste sussidi disoccupazione (settimanali)",
    spiegazione: "Persone che nella settimana precedente hanno richiesto sussidi di disoccupazione.",
    usoOperativo: "Più sensibile e frequente del tasso di disoccupazione standard.",
  },
  {
    chiave: "NFP",
    nome: "Non-Farm Payrolls",
    spiegazione:
      "Rilasciato il primo venerdì del mese (14:30). Numero di posti di lavoro creati/persi, esclusi agricoltura, governo, no-profit, lavoro domestico.",
    usoOperativo:
      "Impatta fortemente tutti gli asset; un aumento dell'occupazione può anticipare un aumento dei tassi.",
  },
  {
    chiave: "ADP",
    nome: "ADP (mini NFP)",
    spiegazione: "Simile all'NFP ma di importanza minore.",
    usoOperativo: "Crea volatilità e buone reazioni per entrare a mercato.",
  },
  {
    chiave: "IPC",
    nome: "IPC — Indice dei prezzi al consumo",
    spiegazione: "Misura il costo di beni e servizi al consumatore finale.",
    usoOperativo: "Quantifica l'inflazione e il potere d'acquisto.",
  },
  {
    chiave: "FIDUCIA_CONSUMATORI",
    nome: "Indice di fiducia dei consumatori",
    spiegazione: "Percezione dei consumatori sulla propria futura situazione finanziaria.",
    usoOperativo: "Accessorio: si usa per confermare altri dati usciti in precedenza (pubblicato alle 16:00).",
  },
  {
    chiave: "IP_INDEX",
    nome: "Industrial Production Index",
    spiegazione: "Report mensile FED sull'andamento delle industrie principali (manifatturiera, mineraria, energetica).",
    usoOperativo: "Fotografa la salute del settore industriale USA.",
  },
  {
    chiave: "PIL",
    nome: "PIL",
    spiegazione: "Misura il valore monetario totale di tutti i beni e servizi di uno stato.",
    usoOperativo: "Effetto più marcato dalle 15:30, per l'impatto su aziende e azionario americano.",
  },
  {
    chiave: "VENDITE_DETTAGLIO",
    nome: "Vendite al dettaglio",
    spiegazione: "Indagine sulle vendite dei negozi al dettaglio, vicina ai consumatori.",
    usoOperativo: "Accessorio, di supporto agli altri indicatori.",
  },
];
