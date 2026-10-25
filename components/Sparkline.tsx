import { useId } from "react";

export default function Sparkline({
  values,
  trend,
  className = "",
}: {
  values: number[];
  trend: "up" | "down" | "flat";
  className?: string;
}) {
  const id = useId();
  if (values.length < 2) return <div className={className} />;

  const w = 100;
  const h = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * w,
    h - 3 - ((v - min) / range) * (h - 6),
  ]);
  const linea = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ");
  const area = `${linea} L${w} ${h} L0 ${h} Z`;
  const colore = trend === "up" ? "text-up" : trend === "down" ? "text-down" : "text-muted";

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={`${colore} ${className}`}
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path
        d={linea}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        pathLength={1}
        style={{
          strokeDasharray: 1,
          strokeDashoffset: 1,
          animation: "sole-draw 0.9s ease-out forwards",
        }}
      />
    </svg>
  );
}
