import { invokeFunction } from "./functions";
import { conBase } from "./percorso";

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function b64uToUint8(s: string): Uint8Array {
  const b64 = (s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function pushSupportato(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function sottoscrizioneCorrente(): Promise<PushSubscription | null> {
  if (!pushSupportato()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Chiede il permesso, si iscrive al servizio push e salva la sottoscrizione nel database. */
export async function attivaNotifiche(): Promise<void> {
  if (!VAPID_PUBLIC_KEY) throw new Error("Chiave notifiche mancante nel sito.");
  const permesso = await Notification.requestPermission();
  if (permesso !== "granted") throw new Error("Permesso negato: abilitalo dalle impostazioni del browser.");
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register(conBase("/sw.js"), { scope: conBase("/") }));
  await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64uToUint8(VAPID_PUBLIC_KEY) as BufferSource,
    }));
  await invokeFunction("notifiche", {
    action: "iscrivi",
    subscription: sub.toJSON(),
    userAgent: navigator.userAgent,
  });
}

export async function disattivaNotifiche(): Promise<void> {
  const sub = await sottoscrizioneCorrente();
  if (!sub) return;
  await invokeFunction("notifiche", { action: "disiscrivi", endpoint: sub.endpoint });
  await sub.unsubscribe();
}
