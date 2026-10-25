-- ============================================================
-- Cron per il sistema di alert (fase 2).
-- Sostituisci <PROJECT_REF> e <SERVICE_ROLE_KEY> come in 0002_cron.sql.
-- ============================================================

-- Controllo notizie ad alto impatto imminenti: ogni 15 minuti.
select cron.schedule(
  'check-alerts-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/check-alerts',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ------------------------------------------------------------
-- ESEMPIO OPZIONALE (disattivato): calcolo Alligator+EMA200 automatico
-- per un asset prioritario ogni 4 ore. `compute-indicators` consuma 1
-- chiamata Twelve Data a invocazione: usala con parsimonia per restare
-- nel budget gratuito insieme a `ingest-prices`. Decommenta e adatta la
-- lista di simboli se vuoi automatizzarla oltre all'uso on-demand.
-- ------------------------------------------------------------
-- select cron.schedule(
--   'compute-indicators-xauusd-4h',
--   '15 */4 * * *',
--   $$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/compute-indicators',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
--       'Content-Type', 'application/json'
--     ),
--     body := '{"symbol": "XAUUSD"}'::jsonb
--   );
--   $$
-- );
