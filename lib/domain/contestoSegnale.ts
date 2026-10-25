import { CandelaE, DatiSegnale, EsitoSegnale, aggrega } from "./esitoSegnale";

const arrotonda = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? null : Number(v.toFixed(d)));
const minuti = (sec: number | null) => (sec == null ? null : Math.round(sec / 60));

/** Il mercato intorno al messaggio, in numeri semplici (l'AI può citare solo ciò che c'è qui). */
export function contestoMercato(candele: CandelaE[], ts: number) {
  const ord = [...candele].sort((a, b) => a.t - b.t);
  const dopo = ord.filter((c) => c.t >= ts);
  if (!dopo.length) return null;
  const p0 = dopo[0].o;
  const prima = ord.filter((c) => c.t < ts);

  // prezzo di chiusura dell'ultima candela fino a X secondi prima del messaggio
  const prezzoDi = (secPrima: number): number | null => {
    const lim = ts - secPrima;
    const c = [...prima].reverse().find((x) => x.t <= lim);
    return c ? c.c : null;
  };
  const delta = (secPrima: number) => {
    const p = prezzoDi(secPrima);
    return p == null ? null : arrotonda(p0 - p);
  };
  const dueOre = prima.filter((c) => c.t >= ts - 7200);
  const cinque = aggrega(dueOre, 300);
  const dopoUnOra = dopo.filter((c) => c.t < ts + 3600);
  return {
    prezzo_al_messaggio: arrotonda(p0),
    variazione_ultimi_30_minuti_punti: delta(1800),
    variazione_ultime_2_ore_punti: delta(7200),
    massimo_ultime_2_ore: dueOre.length ? arrotonda(Math.max(...dueOre.map((c) => c.h))) : null,
    minimo_ultime_2_ore: dueOre.length ? arrotonda(Math.min(...dueOre.map((c) => c.l))) : null,
    ampiezza_media_candela_5_minuti_ultime_2_ore: cinque.length ? arrotonda(cinque.reduce((s, c) => s + (c.h - c.l), 0) / cinque.length) : null,
    massimo_nella_prima_ora_dopo: dopoUnOra.length ? arrotonda(Math.max(...dopoUnOra.map((c) => c.h))) : null,
    minimo_nella_prima_ora_dopo: dopoUnOra.length ? arrotonda(Math.min(...dopoUnOra.map((c) => c.l))) : null,
  };
}

export function riassuntoPerAi(a: {
  sig: DatiSegnale;
  riportato: boolean;
  esito: EsitoSegnale;
  esitoCopia: EsitoSegnale | null;
  candele: CandelaE[];
}) {
  const { sig, riportato, esito, esitoCopia, candele } = a;
  const rif = sig.entrata ?? (sig.zona ? (sig.zona[0] + sig.zona[1]) / 2 : null);
  const rr = rif != null && rif !== sig.stop_loss ? Math.abs(sig.take_profits[0] - rif) / Math.abs(rif - sig.stop_loss) : null;
  const ent = esito.entrataTempo;

  return {
    segnale: {
      direzione: sig.direzione,
      tipo_entrata: sig.entrata != null ? "prezzo" : sig.zona ? "zona" : "mercato",
      entrata: sig.entrata,
      zona: sig.zona ?? null,
      stop_loss: sig.stop_loss,
      take_profit: sig.take_profits,
      gia_aperta_dal_gruppo: riportato,
      ora_messaggio_italia: new Date(sig.ts * 1000).toLocaleString("it-IT", {
        day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome",
      }),
      rischio_rendimento_previsto: arrotonda(rr),
    },
    esito: {
      stato: esito.stato,
      entrata: arrotonda(esito.entrataPrezzo),
      durata_minuti: minuti(esito.durataSec),
      r: arrotonda(esito.r),
      r_flottante: arrotonda(esito.rFlottante),
      rischio_punti: arrotonda(esito.rischio),
      massimo_a_favore_punti: arrotonda(esito.mfe),
      massimo_contro_punti: arrotonda(esito.mae),
      massimo_a_favore_r: arrotonda(esito.mfeR),
      massimo_contro_r: arrotonda(esito.maeR),
      target_raggiunti: esito.tpToccati.map((tp) => ({
        tp: tp.indice,
        prezzo: tp.prezzo,
        minuti_dall_entrata: tp.tempo != null && ent != null ? minuti(tp.tempo - ent) : null,
        dopo_lo_stop: tp.tempo != null && esito.slTempo != null && tp.tempo > esito.slTempo,
      })),
      stop_colpito_dopo_minuti: esito.slTempo != null && ent != null ? minuti(esito.slTempo - ent) : null,
      posizione_aperta_prima_del_messaggio: esito.entrataPrimaDelMessaggio,
      uscita_rispetto_al_messaggio: esito.uscitaRispetto,
      prezzo_oltre_target_o_stop_al_messaggio: esito.oltreAlMessaggio,
      esito_incerto_stessa_candela: esito.ambigua,
    },
    copia: esitoCopia
      ? {
          stato: esitoCopia.stato,
          entrata: arrotonda(esitoCopia.entrataPrezzo),
          r: arrotonda(esitoCopia.r),
          durata_minuti: minuti(esitoCopia.durataSec),
        }
      : null,
    mercato: contestoMercato(candele, sig.ts),
  };
}
