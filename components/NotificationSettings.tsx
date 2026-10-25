"use client";

import { Bell, BellOff, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { ASSETS } from "@/lib/domain/correlations";
import { invokeFunction } from "@/lib/functions";
import { attivaNotifiche, disattivaNotifiche, pushSupportato, sottoscrizioneCorrente } from "@/lib/push";

interface Preferenze {
  asset_filtro: string[] | null;
  notizie_attive: boolean;
  notizie_importanza_minima: "alta" | "media";
  divergenze_attive: boolean;
  livelli_attivi: boolean;
  riepilogo_attivo: boolean;
  modalita: "istantanea" | "oraria";
  orario_da: number;
  orario_a: number;
}

interface Stato {
  push_configurato: boolean;
  telegram_configurato: boolean;
  dispositivi_iscritti: number;
  in_coda: number;
  preferenze: Preferenze;
}

const ORE = Array.from({ length: 24 }, (_, i) => i);

function Interruttore({
  attivo,
  disabilitato,
  onChange,
}: {
  attivo: boolean;
  disabilitato?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={attivo}
      disabled={disabilitato}
      onClick={() => onChange(!attivo)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition disabled:opacity-50 ${
        attivo ? "bg-accent" : "border border-line bg-surface2"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          attivo ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

function Riga({
  titolo,
  sottotitolo,
  children,
}: {
  titolo: string;
  sottotitolo?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{titolo}</p>
        {sottotitolo && <p className="mt-0.5 text-xs leading-relaxed text-muted">{sottotitolo}</p>}
      </div>
      {children}
    </div>
  );
}

export default function NotificationSettings() {
  const [supportato, setSupportato] = useState(true);
  const [attive, setAttive] = useState(false);
  const [ios, setIos] = useState(false);
  const [stato, setStato] = useState<Stato | null>(null);
  const [pref, setPref] = useState<Preferenze | null>(null);
  const [occupato, setOccupato] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<{ ok: boolean; testo: string } | null>(null);

  async function aggiorna() {
    setSupportato(pushSupportato());
    setAttive(Boolean(await sottoscrizioneCorrente()));
    try {
      const s = await invokeFunction<Stato>("notifiche", { action: "stato" });
      setStato(s);
      setPref(s.preferenze);
    } catch {
      setStato(null);
    }
  }

  useEffect(() => {
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent));
    aggiorna();
  }, []);

  async function esegui(nome: string, fn: () => Promise<string | void>) {
    setOccupato(nome);
    setMessaggio(null);
    try {
      const testo = await fn();
      if (testo) setMessaggio({ ok: true, testo });
      await aggiorna();
    } catch (e) {
      setMessaggio({ ok: false, testo: e instanceof Error ? e.message : "Errore sconosciuto" });
    } finally {
      setOccupato(null);
    }
  }

  // Salva subito un cambiamento (aggiornamento ottimistico: l'interfaccia
  // cambia all'istante, e torna indietro solo se il salvataggio fallisce).
  async function salva(parziale: Partial<Preferenze>) {
    if (!pref) return;
    const precedente = pref;
    setPref({ ...pref, ...parziale });
    try {
      await invokeFunction("notifiche", { action: "aggiorna", ...parziale });
    } catch {
      setPref(precedente);
      setMessaggio({ ok: false, testo: "Non sono riuscito a salvare la preferenza." });
    }
  }

  function toggleAsset(symbol: string) {
    if (!pref) return;
    const attuali = pref.asset_filtro ?? [];
    const nuovo = attuali.includes(symbol) ? attuali.filter((s) => s !== symbol) : [...attuali, symbol];
    salva({ asset_filtro: nuovo.length > 0 ? nuovo : null });
  }

  return (
    <section className="card p-5">
      <h2 className="card-title mb-1 flex items-center gap-2">
        <Bell size={14} /> Notifiche
      </h2>
      <p className="mb-4 text-sm leading-relaxed text-muted">
        Notizie in arrivo, nuove divergenze di correlazione, prezzo vicino a un key level (o livello
        attraversato) e riepilogo del mattino alle 08:00.
      </p>

      {!supportato ? (
        <p className="text-sm leading-relaxed text-muted">
          {ios
            ? "Su iPhone le notifiche funzionano solo dopo aver installato l'app: tocca Condividi e poi «Aggiungi alla schermata Home», poi riapri l'app dall'icona (serve iOS 16.4 o successivo)."
            : "Questo browser non supporta le notifiche push."}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {attive ? (
            <button
              className="btn-ghost"
              disabled={occupato !== null}
              onClick={() =>
                esegui("off", async () => {
                  await disattivaNotifiche();
                  return "Notifiche disattivate su questo dispositivo.";
                })
              }
            >
              <BellOff size={16} /> Disattiva su questo dispositivo
            </button>
          ) : (
            <button
              className="btn-primary"
              disabled={occupato !== null}
              onClick={() =>
                esegui("on", async () => {
                  await attivaNotifiche();
                  return "Notifiche attivate su questo dispositivo.";
                })
              }
            >
              <Bell size={16} /> Attiva notifiche
            </button>
          )}
          <button
            className="btn-ghost"
            disabled={occupato !== null || !attive}
            onClick={() =>
              esegui("test", async () => {
                const r = await invokeFunction<{ esito?: string; push_inviati?: number }>("notifiche", {
                  action: "test",
                });
                return (r.push_inviati ?? 0) > 0 ? "Notifica di prova inviata." : "Nessun dispositivo raggiunto.";
              })
            }
          >
            <Send size={16} /> Invia prova
          </button>
        </div>
      )}

      {messaggio && (
        <p
          className={`mt-4 rounded-xl px-3.5 py-2.5 text-sm ${
            messaggio.ok ? "bg-up/10 text-up" : "border border-down/30 bg-down/10 text-down"
          }`}
        >
          {messaggio.testo}
        </p>
      )}

      {stato && (
        <dl className="mt-5 grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-xl bg-surface2 px-3 py-2.5">
            <dt className="text-[11px] text-muted">Server push</dt>
            <dd className={`font-semibold ${stato.push_configurato ? "text-up" : "text-down"}`}>
              {stato.push_configurato ? "Pronto" : "Non configurato"}
            </dd>
          </div>
          <div className="rounded-xl bg-surface2 px-3 py-2.5">
            <dt className="text-[11px] text-muted">Dispositivi</dt>
            <dd className="num font-semibold">{stato.dispositivi_iscritti}</dd>
          </div>
          <div className="rounded-xl bg-surface2 px-3 py-2.5">
            <dt className="text-[11px] text-muted">Telegram</dt>
            <dd className={`font-semibold ${stato.telegram_configurato ? "text-up" : "text-muted"}`}>
              {stato.telegram_configurato ? "Attivo" : "Non attivo"}
            </dd>
          </div>
        </dl>
      )}

      {pref && (
        <div className="mt-2 divide-y divide-line/70 border-t border-line">
          <Riga titolo="Notizie in arrivo" sottotitolo="Notizie economiche imminenti che riguardano gli asset seguiti.">
            <Interruttore attivo={pref.notizie_attive} onChange={(v) => salva({ notizie_attive: v })} />
          </Riga>

          {pref.notizie_attive && (
            <div className="flex items-center justify-between gap-4 pb-3">
              <p className="text-xs text-muted">Soglia minima</p>
              <div className="flex rounded-lg border border-line bg-surface2 p-0.5">
                {(["alta", "media"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => salva({ notizie_importanza_minima: v })}
                    className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                      pref.notizie_importanza_minima === v ? "bg-surface text-fg shadow-sm" : "text-muted"
                    }`}
                  >
                    {v === "alta" ? "Solo alta" : "Alta e media"}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Riga
            titolo="Divergenze di correlazione"
            sottotitolo="Quando un asset non segue più la correlazione attesa."
          >
            <Interruttore attivo={pref.divergenze_attive} onChange={(v) => salva({ divergenze_attive: v })} />
          </Riga>

          <Riga titolo="Key level" sottotitolo="Prezzo vicino a un livello, o livello attraversato.">
            <Interruttore attivo={pref.livelli_attivi} onChange={(v) => salva({ livelli_attivi: v })} />
          </Riga>

          <Riga titolo="Riepilogo del mattino" sottotitolo="Alle 08:00, scritto dall'AI.">
            <Interruttore attivo={pref.riepilogo_attivo} onChange={(v) => salva({ riepilogo_attivo: v })} />
          </Riga>

          <div className="py-4">
            <p className="text-sm font-medium">Solo questi asset</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Vale per notizie, divergenze e key level. Nessuno selezionato = tutti gli asset.
            </p>
            <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto pb-1">
              {ASSETS.map((a) => {
                const selezionato = (pref.asset_filtro ?? []).includes(a.symbol);
                return (
                  <button
                    key={a.symbol}
                    onClick={() => toggleAsset(a.symbol)}
                    className={`h-8 shrink-0 rounded-full px-3 text-xs font-medium transition ${
                      selezionato ? "bg-accent text-white" : "border border-line bg-surface2 text-muted hover:text-fg"
                    }`}
                  >
                    {a.symbol}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="py-4">
            <p className="text-sm font-medium">Modalità</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Istantanea: un avviso a evento. Riepilogo orario: si accumulano e arriva un solo messaggio ogni ora
              in punto — utile per non restare intasati.
            </p>
            <div className="mt-3 flex rounded-lg border border-line bg-surface2 p-0.5">
              {(["istantanea", "oraria"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => salva({ modalita: v })}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    pref.modalita === v ? "bg-surface text-fg shadow-sm" : "text-muted"
                  }`}
                >
                  {v === "istantanea" ? "Istantanea" : `Riepilogo orario${stato && stato.in_coda > 0 ? ` (${stato.in_coda})` : ""}`}
                </button>
              ))}
            </div>
          </div>

          <div className="py-4">
            <p className="text-sm font-medium">Fascia oraria attiva</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Fuori da questa fascia non ricevi notifiche (il riepilogo orario aspetta che la fascia riapra).
            </p>
            <div className="mt-3 flex items-center gap-3">
              <select
                value={pref.orario_da}
                onChange={(e) => salva({ orario_da: Number(e.target.value) })}
                className="input !h-9 !w-auto"
              >
                {ORE.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
              <span className="text-sm text-muted">—</span>
              <select
                value={pref.orario_a}
                onChange={(e) => salva({ orario_a: Number(e.target.value) })}
                className="input !h-9 !w-auto"
              >
                {ORE.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
