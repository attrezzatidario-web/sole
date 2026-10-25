/** Sottocartella in cui è pubblicato il sito (es. "/sole" su GitHub Pages, "" in locale). */
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Percorso di un file statico in public/ (i <Link> di Next aggiungono BASE da soli). */
export const conBase = (percorso: string) => `${BASE}${percorso}`;
