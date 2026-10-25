import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import AppShell from "@/components/AppShell";
import PwaRegister from "@/components/PwaRegister";
import SplashScreen from "@/components/SplashScreen";
import ThemeProvider from "@/components/ThemeProvider";
import { conBase } from "@/lib/percorso";

export const metadata: Metadata = {
  title: "Sole — Analizzatore di Mercato H24",
  description:
    "Monitoraggio H24 di correlazioni, watchlist, notizie e key level con analisi generata da AI.",
  applicationName: "Sole",
  manifest: conBase("/manifest.webmanifest"),
  robots: { index: false, follow: false },
  icons: {
    icon: [
      { url: conBase("/icons/favicon-32.png"), sizes: "32x32", type: "image/png" },
      { url: conBase("/icons/icon-192.png"), sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: conBase("/icons/apple-touch-icon.png"), sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "Sole", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Niente zoom della pagina (pizzico / doppio tocco): l'app si comporta come un'app nativa.
  // I grafici hanno il loro zoom interno, che resta.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

// Imposta il tema PRIMA del primo disegno della pagina (niente lampo bianco).
const TEMA_INIT = `(function(){try{var m=localStorage.getItem("h24-theme")||"system";var d=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=d?"dark":"light";document.documentElement.dataset.theme=r;document.documentElement.style.colorScheme=r;}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0A0C11" />
        <script dangerouslySetInnerHTML={{ __html: TEMA_INIT }} />
      </head>
      <body>
        <ThemeProvider>
          <SplashScreen />
          <AppShell>{children}</AppShell>
          <PwaRegister />
        </ThemeProvider>
      </body>
    </html>
  );
}
