/**
 * Chiama una Edge Function di Supabase direttamente dal browser, con la
 * chiave anon (pubblica). Le funzioni usano da sole la chiave completa lato
 * server: nel sito non c'è mai nessun segreto.
 */
export async function invokeFunction<T = any>(name: string, body: unknown): Promise<T> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase non configurato");

  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error ?? `HTTP ${res.status}`);
  return data as T;
}
