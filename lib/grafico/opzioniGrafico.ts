/**
 * Opzioni comuni a tutti i grafici a candele.
 *
 * Perché esistono: la libreria dei grafici cattura la rotella del mouse / il trascinamento a due dita.
 * Scorrendo la pagina con il cursore sopra al grafico, il grafico si rimpiccioliva da solo e le candele
 * restavano schiacciate al centro con enormi spazi vuoti ai lati. Qui:
 *  - i bordi sono bloccati (non si può andare oltre la prima/ultima candela);
 *  - la rotella zooma solo a schermo intero (fuori, scorre la pagina).
 */
export const ASSE_TEMPO = {
  fixLeftEdge: true,
  fixRightEdge: true,
  borderVisible: false,
  timeVisible: true,
  secondsVisible: false,
} as const;

/** Margini verticali della scala dei prezzi: le candele riempiono il grafico senza vuoti sopra e sotto. */
export const MARGINI_PREZZO = { top: 0.08, bottom: 0.08 } as const;

export function opzioniInterazione(schermoIntero: boolean) {
  return {
    handleScroll: {
      mouseWheel: schermoIntero,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
    handleScale: {
      mouseWheel: schermoIntero,
      pinch: true,
      axisPressedMouseMove: true,
      axisDoubleClickReset: true,
    },
  };
}
