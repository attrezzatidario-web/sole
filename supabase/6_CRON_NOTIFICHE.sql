-- ===== PASSO 48: TIMER DELLE NOTIFICHE (esegui UNA sola volta) =====
-- 1) sostituisce il vecchio timer "check-alerts" con quello nuovo (notizie importanti, ogni 15 minuti)
-- 2) riepilogo del mattino: parte alle 06:00 e alle 07:00 UTC; la funzione lo invia solo
--    quando in Italia sono le 08:00 (così vale sia con l'ora legale sia con quella solare).

do $$
begin
  perform cron.unschedule('check-alerts-15min');
exception when others then
  null;
end $$;

select cron.schedule(
  'notifiche-notizie-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://wmohjmvqxbcwbmyzxffh.supabase.co/functions/v1/notifiche',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indtb2hqbXZxeGJjd2JteXp4ZmZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1OTI2MTgsImV4cCI6MjEwNjE2ODYxOH0.rZMN4bxf9hSJ6NmSL5dLxjoLUuAftTMrMYJvh3YLMk0'
    ),
    body := '{"action": "controlla"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

select cron.schedule(
  'riepilogo-mattino-06utc',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://wmohjmvqxbcwbmyzxffh.supabase.co/functions/v1/notifiche',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indtb2hqbXZxeGJjd2JteXp4ZmZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1OTI2MTgsImV4cCI6MjEwNjE2ODYxOH0.rZMN4bxf9hSJ6NmSL5dLxjoLUuAftTMrMYJvh3YLMk0'
    ),
    body := '{"action": "briefing"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

select cron.schedule(
  'riepilogo-mattino-07utc',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://wmohjmvqxbcwbmyzxffh.supabase.co/functions/v1/notifiche',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indtb2hqbXZxeGJjd2JteXp4ZmZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1OTI2MTgsImV4cCI6MjEwNjE2ODYxOH0.rZMN4bxf9hSJ6NmSL5dLxjoLUuAftTMrMYJvh3YLMk0'
    ),
    body := '{"action": "briefing"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
