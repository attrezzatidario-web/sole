# Sole — Analizzatore di Mercato H24

Sito Next.js statico + Supabase (database, Edge Function, cron). Tutto gratis.

- **Sito** → GitHub Pages, si ripubblica da solo a ogni modifica (`.github/workflows/sito.yml`)
- **Funzioni Supabase** → si ripubblicano da sole quando cambia `supabase/functions/` (`.github/workflows/funzioni.yml`)
- **Database** → Supabase (gli script SQL in `supabase/` sono già stati eseguiti, servono solo come archivio)

## Cartelle

```
app/ components/ lib/        sito (pagine, grafici, regole del corso)
public/                      icone, manifest e service worker (app installabile)
supabase/functions/          Edge Function (_shared = codice in comune)
supabase/*.sql, migrations/  storico degli script del database
.env.production              valori PUBBLICI del sito (URL + chiave anon + chiave notifiche)
```

## Segreti

- Nel repo: solo `SUPABASE_ACCESS_TOKEN` (Settings → Secrets → Actions), per pubblicare le funzioni.
- Su Supabase (Edge Functions → Secrets): `TWELVE_DATA_API_KEY`, `GEMINI_API_KEY`, Telegram, VAPID… restano lì.
- La `service_role` non va **mai** nel codice.

## In locale

```
npm ci
npm run dev        # http://localhost:3000
```
