-- ============================================================
-- Cron H24: chiama le Edge Function a intervalli regolari.
-- ============================================================
-- IMPORTANTE: prima di eseguire questa migration, sostituisci:
--   <PROJECT_REF>          → il ref del tuo progetto Supabase
--   <SERVICE_ROLE_KEY>     → la tua service role key
-- Puoi trovarli in Project Settings > API sul dashboard Supabase.
-- In alternativa, esegui questi comandi manualmente dal SQL editor
-- del dashboard dopo aver sostituito i placeholder.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Ingestion prezzi: ogni 15 minuti (Twelve Data a rotazione + Yahoo per gli altri asset), resta sotto le 800 chiamate/giorno
-- del piano gratuito di Twelve Data (vedi sezione 6 del prompt di sviluppo).
select cron.schedule(
  'ingest-prices-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/ingest-prices',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Sincronizzazione calendario notizie: ogni 6 ore
-- (rispetta il limite di 2 richieste/5 min del feed ForexFactory).
select cron.schedule(
  'sync-calendar-6h',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/sync-calendar',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Report AI di background: una volta all'ora, un asset alla volta a
-- rotazione (implementato nell'Edge Function stessa leggendo `watchlists`),
-- per restare ben dentro le ~1.500 richieste/giorno gratuite di Gemini.
select cron.schedule(
  'generate-report-hourly',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/generate-report',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{"modalita": "batch_orario"}'::jsonb
  );
  $$
);
