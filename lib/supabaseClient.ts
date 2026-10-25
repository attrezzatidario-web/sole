import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// In assenza di variabili d'ambiente (es. prima configurazione) il client
// resta `null`: le pagine mostrano dati demo invece di andare in errore.
export const supabase =
  url && anonKey ? createClient(url, anonKey) : null;

export const isSupabaseConfigured = Boolean(supabase);
