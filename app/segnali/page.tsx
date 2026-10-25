"use client";

import { ClipboardPaste, Radio } from "lucide-react";
import { useEffect, useState } from "react";
import AnalisiSegnale from "@/components/AnalisiSegnale";
import LetturaMessaggio from "@/components/LetturaMessaggio";
import { PillDirezione } from "@/components/SegnaleUi";
import { ASSETS } from "@/lib/domain/correlations";
import type { DatiSegnale } from "@/lib/domain/esitoSegnale";
import { VoceLettura, leggiMessaggio } from "@/lib/domain/leggiMessaggio";
import { etichettaFuso, italiaAUtc, oraItaliana } from "@/lib/domain/orario";

const SIMBOLI = ASSETS.map((a) => a.symbol);

const num = (s: string): number | null => {
  const v = Number(s.trim().replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : null;
};
const elencoNum = (s: string): { valori: number[]; sbagliati: string[] } => {
  const pezzi = s.split(/[;\s]+/).map((x) => x.replace(/,$/, "")).filter(Boolean);
  const valori: number[] = [];
  const sbagliati: string[] = [];
  for (const p of pezzi) {
    const v = num(p);
    if (v === null) sbagliati.push(p);
    else valori.push(v);
  }
  return { valori, sbagliati };
};

interface Richiesta {
  id: number;
  simbolo: string;
  sig: DatiSegnale;
  riportato: boolean;
  sec: number; // minuto del messaggio (UTC)
}

function Segmenti<T extends string>({
  valore, opzioni, onChange,
}: { valore: T; opzioni: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg border border-line bg-surface2 p-0.5">
      {opzioni.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
            valore === o.id ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const Campo = ({ etichetta, children }: { etichetta: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-medium text-muted">{etichetta}</span>
    {children}
  </label>
);

export default function SegnaliPage() {
  const [testo, setTesto] = useState("");
  const [voci, setVoci] = useState<VoceLettura[]>([]);
  const [problema, setProblema] = useState("");

  const [simbolo, setSimbolo] = useState("XAUUSD");
  const [direzione, setDirezione] = useState<"buy" | "sell">("buy");
  const [modoEntrata, setModoEntrata] = useState<"prezzo" | "zona" | "mercato">("prezzo");
  const [prezzo, setPrezzo] = useState("");
  const [zonaDa, setZonaDa] = useState("");
  const [zonaA, setZonaA] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [riportato, setRiportato] = useState(false);
  const [data, setData] = useState("");
  const [ora, setOra] = useState("");

  const [errore, setErrore] = useState("");
  const [richiesta, setRichiesta] = useState<Richiesta | null>(null);

  // data e ora iniziali = adesso, in ora italiana (si imposta dopo il caricamento, non nella pagina statica)
  useEffect(() => {
    const o = oraItaliana();
    setData(o.data);
    setOra(o.ora);
  }, []);

  function leggi(t: string) {
    setTesto(t);
    if (!t.trim()) {
      setVoci([]);
      setProblema("");
      return;
    }
    const r = leggiMessaggio(t, SIMBOLI);
    setVoci(r.lettura);
    setProblema(r.ok ? "" : r.motivo);
    const c = r.campi;
    if (c.simbolo && SIMBOLI.includes(c.simbolo)) setSimbolo(c.simbolo);
    if (c.direzione) setDirezione(c.direzione);
    if (c.entrata !== null) {
      setModoEntrata("prezzo");
      setPrezzo(String(c.entrata));
    } else if (c.zona) {
      setModoEntrata("zona");
      setZonaDa(String(c.zona[0]));
      setZonaA(String(c.zona[1]));
    } else if (c.direzione) {
      setModoEntrata("mercato");
    }
    if (c.stopLoss !== null) setSl(String(c.stopLoss));
    if (c.takeProfits.length) setTp(c.takeProfits.join(" "));
    setRiportato(c.riportato);
    setErrore("");
  }

  const orario = data && ora ? italiaAUtc(data, ora) : null;
  const orarioInesistente = !!data && !!ora && /^\d{1,2}:\d{2}$/.test(ora) && !orario;

  function analizza() {
    setErrore("");
    if (!orario) {
      setErrore(orarioInesistente ? "Quell'ora non esiste: è la notte del passaggio all'ora legale. Scegli un'altra ora." : "Inserisci data e ora del messaggio.");
      return;
    }
    const slV = num(sl);
    if (slV === null) return setErrore("Inserisci lo stop loss (un numero).");
    const { valori: tps, sbagliati } = elencoNum(tp);
    if (!tps.length) return setErrore("Inserisci almeno un take profit.");
    if (sbagliati.length) return setErrore(`Take profit non valido: ${sbagliati.join(", ")}.`);

    let entrata: number | null = null;
    let zona: [number, number] | null = null;
    if (modoEntrata === "prezzo") {
      entrata = num(prezzo);
      if (entrata === null) return setErrore("Inserisci il prezzo di entrata, oppure scegli «A mercato».");
    } else if (modoEntrata === "zona") {
      const a = num(zonaDa);
      const b = num(zonaA);
      if (a === null || b === null) return setErrore("Inserisci i due prezzi della zona di entrata.");
      zona = [Math.min(a, b), Math.max(a, b)];
    }

    // coerenza dei livelli (stesse regole dell'interprete dei messaggi)
    const rif = entrata ?? (zona ? (zona[0] + zona[1]) / 2 : null);
    const buy = direzione === "buy";
    const nome = buy ? "Buy" : "Sell";
    if (rif !== null) {
      if (slV === rif) return setErrore("Lo stop loss coincide con l'entrata.");
      if (buy ? slV > rif : slV < rif) return setErrore(`In un ${nome} lo stop loss deve stare ${buy ? "sotto" : "sopra"} l'entrata.`);
      if (tps.some((x) => (buy ? x <= rif : x >= rif))) return setErrore(`In un ${nome} i take profit devono stare ${buy ? "sopra" : "sotto"} l'entrata.`);
    } else if (buy ? slV >= Math.min(...tps) : slV <= Math.max(...tps)) {
      return setErrore(`In un ${nome} lo stop loss deve stare ${buy ? "sotto" : "sopra"} i take profit.`);
    }

    // Telegram mostra solo ore e minuti: si parte dal minuto SUCCESSIVO, così nessun prezzo
    // precedente al messaggio viene contato.
    const ts = orario.sec + 59;
    if (ts > Date.now() / 1000) return setErrore("Il messaggio risulta nel futuro: controlla data e ora.");

    setRichiesta({
      id: Date.now(),
      simbolo,
      riportato: riportato && entrata !== null,
      sec: orario.sec,
      sig: { direzione, entrata, zona, stop_loss: slV, take_profits: tps, ts },
    });
  }

  const inputCls = "input";
  const orarioUtc = orario ? new Date(orario.sec * 1000).toISOString().slice(11, 16) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Radio size={22} /> Analizza un segnale
        </h1>
        <p className="mt-1 text-sm text-muted">
          Inserisci un segnale mandato su un gruppo e l&apos;app ricostruisce com&apos;è andato, guardando i prezzi veri
          da quel momento in poi. È solo un&apos;analisi: non parte nessun ordine.
        </p>
      </div>

      <section className="card space-y-4 p-5">
        <Campo etichetta="Incolla qui il messaggio del gruppo (facoltativo: compila i campi da solo)">
          <div className="relative">
            <textarea
              value={testo}
              onChange={(e) => leggi(e.target.value)}
              rows={4}
              placeholder={"Es.\nHo venduto XAU a 4224.45\nTP 4214.45\nSL 4227.45"}
              className="input !h-auto py-2.5 leading-snug"
            />
            <ClipboardPaste size={15} className="pointer-events-none absolute right-3 top-3 text-muted" />
          </div>
        </Campo>
        <LetturaMessaggio voci={voci} problema={problema} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etichetta="Strumento">
            <select value={simbolo} onChange={(e) => setSimbolo(e.target.value)} className={inputCls}>
              {SIMBOLI.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etichetta="Direzione">
            <Segmenti
              valore={direzione}
              onChange={setDirezione}
              opzioni={[
                { id: "buy", label: "Buy" },
                { id: "sell", label: "Sell" },
              ]}
            />
          </Campo>
        </div>

        <div className="space-y-3">
          <Campo etichetta="Entrata">
            <Segmenti
              valore={modoEntrata}
              onChange={setModoEntrata}
              opzioni={[
                { id: "prezzo", label: "Prezzo" },
                { id: "zona", label: "Zona" },
                { id: "mercato", label: "A mercato" },
              ]}
            />
          </Campo>
          {modoEntrata === "prezzo" && (
            <input value={prezzo} onChange={(e) => setPrezzo(e.target.value)} inputMode="decimal" placeholder="Prezzo di entrata" className={inputCls} />
          )}
          {modoEntrata === "zona" && (
            <div className="grid grid-cols-2 gap-3">
              <input value={zonaDa} onChange={(e) => setZonaDa(e.target.value)} inputMode="decimal" placeholder="Da" className={inputCls} />
              <input value={zonaA} onChange={(e) => setZonaA(e.target.value)} inputMode="decimal" placeholder="A" className={inputCls} />
            </div>
          )}
          {modoEntrata === "mercato" && (
            <p className="text-xs text-muted">Si entra al prezzo di mercato del momento del messaggio.</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etichetta="Stop loss">
            <input value={sl} onChange={(e) => setSl(e.target.value)} inputMode="decimal" placeholder="Prezzo" className={inputCls} />
          </Campo>
          <Campo etichetta="Take profit (anche più di uno, separati da spazio)">
            <input value={tp} onChange={(e) => setTp(e.target.value)} placeholder="Es. 4214.45 4205" className={inputCls} />
          </Campo>
        </div>

        {modoEntrata === "prezzo" && (
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input type="checkbox" checked={riportato} onChange={(e) => setRiportato(e.target.checked)} className="mt-0.5 accent-accent" />
            <span>
              Il gruppo racconta un&apos;operazione <span className="font-medium">già aperta</span>{" "}
              <span className="text-muted">(es. «Ho venduto a…»): mostro anche cosa avrebbe ottenuto chi l&apos;ha copiata dopo.</span>
            </span>
          </label>
        )}

        <div className="space-y-2 border-t border-line pt-4">
          <p className="text-xs font-medium text-muted">Quando è stato mandato il messaggio — ora italiana</p>
          <div className="grid grid-cols-2 gap-3">
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
            <input type="time" value={ora} onChange={(e) => setOra(e.target.value)} className={inputCls} />
          </div>
          <p className={`text-xs ${orarioInesistente ? "text-down" : "text-muted"}`}>
            {orario
              ? `È l'ora che vedi su Telegram (${etichettaFuso(orario.sec * 1000)}): corrisponde alle ${orarioUtc} UTC, quella dei prezzi di mercato.${
                  orario.ambiguo ? " Quest'ora esiste due volte nella notte del cambio all'ora solare: ho scelto la prima." : ""
                }`
              : orarioInesistente
              ? "Quell'ora non esiste: è la notte del passaggio all'ora legale."
              : "Inserisci data e ora."}{" "}
            L&apos;analisi parte dal minuto successivo a quello indicato.
          </p>
        </div>

        {errore && <p className="rounded-xl border border-down/30 bg-down/10 px-3.5 py-2.5 text-sm text-down">{errore}</p>}

        <button type="button" onClick={analizza} className="btn-primary !h-11 w-full">
          Analizza
        </button>
      </section>

      {richiesta && (
        <div className="space-y-5">
          <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-2xl font-semibold tracking-tight">{richiesta.simbolo}</span>
              <PillDirezione direzione={richiesta.sig.direzione} />
            </div>
            <p className="num text-sm text-muted">
              {new Date(richiesta.sec * 1000).toLocaleString("it-IT", {
                day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome",
              })}{" "}
              · ora italiana
            </p>
          </section>
          <AnalisiSegnale key={richiesta.id} simbolo={richiesta.simbolo} sig={richiesta.sig} riportato={richiesta.riportato} />
        </div>
      )}
    </div>
  );
}
