/**
 * Linee verticali tratteggiate che separano un giorno dall'altro, con la data in alto.
 * Sono disegnate DENTRO il grafico (primitiva della serie): restano allineate alle candele
 * a ogni zoom, scorrimento e ridimensionamento, senza calcolare pixel a mano.
 */
export interface GiornoLinea {
  /** istante (secondi UTC) della prima candela del giorno */
  t: number;
  etichetta: string;
}

export class LineeGiorni {
  private giorni: GiornoLinea[] = [];
  private rgb = "138 147 166";
  private richiedi: (() => void) | null = null;
  private chart: any = null;
  private serie: any = null;

  attached(param: any) {
    this.chart = param.chart;
    this.serie = param.series;
    this.richiedi = param.requestUpdate;
  }

  detached() {
    this.chart = null;
    this.serie = null;
    this.richiedi = null;
  }

  imposta(giorni: GiornoLinea[], rgb: string) {
    this.giorni = giorni;
    this.rgb = rgb;
    this.richiedi?.();
  }

  updateAllViews() {}

  paneViews() {
    const self = this;
    return [
      {
        // "normal": con "top" il disegno non compariva
        zOrder: () => "normal" as const,
        renderer: () => ({
          draw(target: any) {
            if (!self.chart || !self.giorni.length) return;
            const scala = self.chart.timeScale();
            const passo: number = scala.options().barSpacing ?? 6;
            target.useBitmapCoordinateSpace((scope: any) => {
              const ctx: CanvasRenderingContext2D = scope.context;
              const rx: number = scope.horizontalPixelRatio;
              const ry: number = scope.verticalPixelRatio;
              ctx.save();
              ctx.strokeStyle = `rgb(${self.rgb} / 0.55)`;
              ctx.fillStyle = `rgb(${self.rgb})`;
              ctx.lineWidth = Math.max(1, Math.round(rx));
              ctx.setLineDash([4 * rx, 4 * rx]);
              ctx.font = `${10 * ry}px sans-serif`;
              ctx.textBaseline = "top";
              for (const g of self.giorni) {
                const x0 = scala.timeToCoordinate(g.t);
                if (x0 === null || x0 === undefined) continue;
                const x = Math.round((x0 - passo / 2) * rx);
                if (x < 0 || x > scope.bitmapSize.width) continue;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, scope.bitmapSize.height);
                ctx.stroke();
                ctx.fillText(g.etichetta, x + 4 * rx, 3 * ry);
              }
              ctx.restore();
            });
          },
        }),
      },
    ];
  }
}
