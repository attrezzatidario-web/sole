"use client";

import { BarChart3, BookOpen, CalendarDays, Coins, History, Layers, LayoutGrid, Radio, Settings, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import InstallButton from "./InstallButton";
import LogoMark from "./LogoMark";

const ASSET_PRINCIPALE = "/asset/XAUUSD/";

const NAV = [
  { href: "/", label: "Mercati", Icon: LayoutGrid },
  { href: ASSET_PRINCIPALE, label: "XAUUSD", Icon: Coins },
  { href: "/segnali/", label: "Segnali", Icon: Radio },
  { href: "/storico/", label: "Storico", Icon: History },
  { href: "/calendario/", label: "Notizie", Icon: CalendarDays },
  { href: "/key-levels/", label: "Livelli", Icon: Layers },
  { href: "/diario/", label: "Diario", Icon: BookOpen },
  { href: "/conto/", label: "Conto", Icon: Wallet },
];

// Solo nel menu da desktop, per non affollare la barra in basso sul telefono
// (resta comunque raggiungibile dal menu "Indicatori" di ogni grafico).
const NAV_SOLO_DESKTOP = [{ href: "/volume-profile/", label: "Volume", Icon: BarChart3 }];

function attivo(href: string, pathname: string) {
  if (href === ASSET_PRINCIPALE) return pathname.startsWith("/asset/XAUUSD");
  if (href === "/") return pathname === "/" || (pathname.startsWith("/asset") && !pathname.startsWith("/asset/XAUUSD"));
  return pathname.startsWith(href.replace(/\/$/, ""));
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <LogoMark />
            <span className="text-[15px] font-semibold tracking-tight">
  Sole
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {[...NAV, ...NAV_SOLO_DESKTOP].map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  attivo(href, pathname)
                    ? "bg-surface2 text-fg"
                    : "text-muted hover:text-fg"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <InstallButton />
            <Link
              href="/impostazioni/"
              aria-label="Impostazioni"
              title="Impostazioni e notifiche"
              className={`flex h-9 w-9 items-center justify-center rounded-xl border border-line transition ${
                pathname.startsWith("/impostazioni") ? "bg-surface2 text-fg" : "bg-surface text-muted hover:text-fg"
              }`}
            >
              <Settings size={17} />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-32 pt-6 sm:px-6 md:pb-12">{children}</main>

      <footer className="mx-auto max-w-6xl px-4 pb-32 text-xs leading-relaxed text-muted sm:px-6 md:pb-10">
        Strumento informativo di monitoraggio personale. Nessun contenuto è consulenza
        finanziaria né un segnale di acquisto o vendita.
      </footer>

      {/* Barra in basso (telefono): fluttuante, staccata dai bordi, con capsula sulla sezione attiva */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 px-2 md:hidden"
        style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}
        aria-label="Navigazione principale"
      >
        <div className="mx-auto grid max-w-lg grid-cols-8 rounded-[26px] border border-line/70 bg-surface p-1 shadow-[0_8px_30px_-6px_rgb(15_23_32/0.18)] backdrop-blur-xl">
          {NAV.map(({ href, label, Icon }) => {
            const on = attivo(href, pathname);
            return (
              <Link
                key={href}
                href={href}
                aria-current={on ? "page" : undefined}
                className={`flex min-w-0 flex-col items-center gap-1 rounded-[20px] py-2 transition-colors active:scale-95 ${
                  on ? "bg-accent/15 text-accent" : "text-muted active:bg-surface2"
                }`}
              >
                <Icon size={21} strokeWidth={on ? 2 : 1.6} />
                <span className={`w-full truncate text-center text-[10px] leading-none tracking-tight ${on ? "font-semibold" : "font-medium"}`}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
