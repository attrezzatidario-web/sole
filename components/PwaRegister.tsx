"use client";

import { useEffect } from "react";
import { conBase } from "@/lib/percorso";

/** Registra il service worker (solo su https) per rendere il sito installabile. */
export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && window.location.protocol === "https:") {
      navigator.serviceWorker.register(conBase("/sw.js"), { scope: conBase("/") }).catch(() => {});
    }
  }, []);
  return null;
}
