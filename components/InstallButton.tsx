"use client";

import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";

export default function InstallButton() {
  const [evento, setEvento] = useState<any>(null);
  const [installata, setInstallata] = useState(false);
  const [ios, setIos] = useState(false);
  const [aperto, setAperto] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true;
    setInstallata(standalone);
    const ua = navigator.userAgent;
    setIos(/iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document));

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvento(e);
    };
    const onInstalled = () => {
      setInstallata(true);
      setEvento(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installata || (!evento && !ios)) return null;

  async function installa() {
    if (evento) {
      evento.prompt();
      await evento.userChoice;
      setEvento(null);
    } else {
      setAperto(true);
    }
  }

  return (
    <>
      <button
        onClick={installa}
        className="flex h-9 items-center gap-2 rounded-xl bg-accent px-3 text-sm font-medium text-white transition hover:opacity-90"
      >
        <Download size={16} />
        <span className="hidden sm:inline">Installa app</span>
      </button>

      {aperto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={() => setAperto(false)}
        >
          <div
            className="card w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Installa su iPhone</h2>
              <button
                onClick={() => setAperto(false)}
                aria-label="Chiudi"
                className="rounded-lg p-1 text-muted hover:text-fg"
              >
                <X size={18} />
              </button>
            </div>
            <ol className="space-y-3 text-sm text-muted">
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface2 text-xs font-semibold text-fg">
                  1
                </span>
                <span>
                  In Safari tocca il pulsante <Share size={14} className="mx-0.5 inline text-accent" />{" "}
                  <b className="text-fg">Condividi</b>.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface2 text-xs font-semibold text-fg">
                  2
                </span>
                <span>
                  Scegli <b className="text-fg">Aggiungi alla schermata Home</b>.
                </span>
              </li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
