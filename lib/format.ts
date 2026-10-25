import { ASSETS } from "./domain/correlations";

const INFO = new Map(ASSETS.map((a) => [a.symbol, a]));

export function assetLabel(symbol: string): string {
  return INFO.get(symbol)?.label ?? symbol;
}

export function assetCategoria(symbol: string): string {
  const c = INFO.get(symbol)?.categoria;
  return c === "forex"
    ? "Forex"
    : c === "metallo"
    ? "Metallo"
    : c === "materia_prima"
    ? "Materia prima"
    : c === "indice"
    ? "Indice"
    : "";
}

function decimalsFor(symbol: string): number {
  const a = INFO.get(symbol);
  if (!a) return 2;
  if (a.categoria === "forex") return symbol.endsWith("JPY") ? 3 : 5;
  if (symbol === "DXY" || symbol === "XAGUSD") return 3;
  return 2;
}

export function formatPrice(symbol: string, price: number | null | undefined): string {
  if (price === null || price === undefined || Number.isNaN(price)) return "—";
  const d = decimalsFor(symbol);
  return price.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function formatPct(p: number | null | undefined): string {
  if (p === null || p === undefined || Number.isNaN(p)) return "—";
  if (Math.abs(p) < 0.005) return "0,00%";
  return `${p > 0 ? "+" : ""}${p.toFixed(2).replace(".", ",")}%`;
}

export function formatOraRoma(iso: string | number | Date): string {
  return new Date(iso).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Rome",
  });
}
