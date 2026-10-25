import type { VoceLettura } from "@/lib/domain/leggiMessaggio";

/** Cosa l'app ha riconosciuto nel messaggio incollato, e da quale frammento di testo. */
export default function LetturaMessaggio({ voci, problema }: { voci: VoceLettura[]; problema: string }) {
  if (voci.length === 0 && !problema) return null;
  return (
    <div className="rounded-xl bg-surface2 px-3.5 py-3">
      <p className="mb-1.5 text-xs font-medium text-muted">Come ho letto il messaggio</p>
      {voci.length > 0 && (
        <ul className="divide-y divide-line/60 text-sm">
          {voci.map((v, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="text-muted">{v.campo}</span>
              <span className="min-w-0 text-right">
                <span className="num font-semibold">{v.valore}</span>
                {v.da && <span className="ml-2 rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted">«{v.da}»</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {problema && (
        <p className="mt-2 rounded-lg border border-warn/30 bg-warn/10 px-2.5 py-1.5 text-xs text-warn">
          Non è completo: {problema}. Controlla e completa i campi qui sotto.
        </p>
      )}
    </div>
  );
}
