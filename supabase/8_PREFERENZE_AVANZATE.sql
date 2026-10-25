-- ===== PASSO 56: preferenze notifiche avanzate (esegui UNA sola volta) =====
-- Sostituisce la preferenza "solo XAUUSD" con un pannello completo:
-- filtro per asset (vale per notizie, divergenze e livelli), soglia di
-- importanza delle notizie, interruttori per categoria, modalità istantanea
-- oppure riepilogo orario, e la fascia oraria in cui ricevere notifiche.

-- Porta avanti la preferenza già impostata, poi rimuove la vecchia colonna.
alter table notifiche_impostazioni add column if not exists asset_filtro text[];
update notifiche_impostazioni set asset_filtro = array['XAUUSD'] where solo_xauusd = true and asset_filtro is null;
alter table notifiche_impostazioni drop column if exists solo_xauusd;

alter table notifiche_impostazioni add column if not exists notizie_attive boolean not null default true;
alter table notifiche_impostazioni add column if not exists notizie_importanza_minima text not null default 'alta';
alter table notifiche_impostazioni add constraint notizie_importanza_minima_valida
  check (notizie_importanza_minima in ('alta', 'media'));

alter table notifiche_impostazioni add column if not exists divergenze_attive boolean not null default true;
alter table notifiche_impostazioni add column if not exists livelli_attivi boolean not null default true;
alter table notifiche_impostazioni add column if not exists riepilogo_attivo boolean not null default true;

alter table notifiche_impostazioni add column if not exists modalita text not null default 'istantanea';
alter table notifiche_impostazioni add constraint modalita_valida check (modalita in ('istantanea', 'oraria'));

alter table notifiche_impostazioni add column if not exists orario_da smallint not null default 7;
alter table notifiche_impostazioni add column if not exists orario_a smallint not null default 22;
alter table notifiche_impostazioni add constraint orario_da_valido check (orario_da between 0 and 23);
alter table notifiche_impostazioni add constraint orario_a_valido check (orario_a between 0 and 23);

-- Coda per la modalità "riepilogo orario": le notifiche si accumulano qui
-- invece di partire subito, e vengono unite in un unico messaggio ogni ora.
create table if not exists notifiche_coda (
  id bigint generated always as identity primary key,
  categoria text not null check (categoria in ('notizia', 'divergenza', 'livello')),
  asset text,
  titolo text not null,
  corpo text not null,
  url text,
  creato_at timestamptz not null default now()
);
alter table notifiche_coda enable row level security;
-- Nessuna policy pubblica: solo la funzione "notifiche" (Service Role) vi accede.

-- Timer che invia il riepilogo orario accumulato, ogni ora in punto.
select cron.schedule(
  'notifiche-riepilogo-orario',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://wmohjmvqxbcwbmyzxffh.supabase.co/functions/v1/notifiche',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indtb2hqbXZxeGJjd2JteXp4ZmZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1OTI2MTgsImV4cCI6MjEwNjE2ODYxOH0.rZMN4bxf9hSJ6NmSL5dLxjoLUuAftTMrMYJvh3YLMk0'
    ),
    body := '{"action": "flush_coda"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
