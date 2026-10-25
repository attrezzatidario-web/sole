-- ===== PASSO 42: NUOVE TABELLE + PULIZIA AUTOMATICA (esegui UNA sola volta) =====

-- ---------- Nuove tabelle ----------

-- Fibonacci e Pitchfork calcolati dalle candele (una riga per asset/strumento/timeframe)
create table if not exists analisi_tecniche (
  id bigint generated always as identity primary key,
  asset_symbol text not null references assets (symbol),
  tipo text not null check (tipo in ('fibonacci', 'pitchfork')),
  timeframe text not null,
  dati jsonb not null,
  ts timestamptz not null default now(),
  unique (asset_symbol, tipo, timeframe)
);

-- Riepilogo del mattino
create table if not exists briefings (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  testo text not null,
  dati_json jsonb
);

-- Anti-spam degli alert sui key level (max 1 avviso ogni 3 ore per asset)
create table if not exists key_level_alerts (
  id bigint generated always as identity primary key,
  asset_symbol text not null,
  tipo text not null,
  ts timestamptz not null default now()
);
create index if not exists idx_key_level_alerts on key_level_alerts (asset_symbol, tipo, ts desc);

-- Dispositivi iscritti alle notifiche push (letti solo dalle funzioni, mai dal sito)
create table if not exists push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table analisi_tecniche enable row level security;
alter table briefings enable row level security;
alter table key_level_alerts enable row level security;
alter table push_subscriptions enable row level security;

create policy "lettura pubblica analisi_tecniche" on analisi_tecniche for select using (true);
create policy "lettura pubblica briefings" on briefings for select using (true);

grant select on analisi_tecniche, briefings to anon, authenticated;

-- ---------- Pulizia automatica: il database resta piccolo e gratis ----------
-- Si tiene sempre l'ultimo dato di ogni asset/coppia, anche se vecchio.

create or replace function pulizia_dati() returns void
language plpgsql
as $$
begin
  delete from price_snapshots p
   where p.ts < now() - interval '90 days'
     and exists (select 1 from price_snapshots n where n.asset_symbol = p.asset_symbol and n.ts > p.ts);

  delete from correlation_checks c
   where c.ts < now() - interval '30 days'
     and exists (select 1 from correlation_checks n
                  where n.asset_symbol = c.asset_symbol and n.correlato_symbol = c.correlato_symbol and n.ts > c.ts);

  delete from technical_signals t
   where t.ts < now() - interval '30 days'
     and exists (select 1 from technical_signals n
                  where n.asset_symbol = t.asset_symbol and n.timeframe = t.timeframe and n.ts > t.ts);

  delete from analysis_reports where timestamp < now() - interval '90 days';
  delete from briefings where ts < now() - interval '180 days';
  delete from news_events where orario < now() - interval '30 days';
  delete from key_level_alerts where ts < now() - interval '14 days';

  -- registro interno dei timer: si tengono solo gli ultimi 3 giorni
  begin
    delete from cron.job_run_details where end_time < now() - interval '3 days';
  exception when others then
    null;
  end;
end;
$$;

-- Ogni notte alle 03:15 (UTC)
select cron.schedule('pulizia-dati-notturna', '15 3 * * *', $$select pulizia_dati();$$);

-- Prima pulizia subito (non toglie nulla di recente)
select pulizia_dati();
