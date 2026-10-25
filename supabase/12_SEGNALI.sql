-- ===== PASSO 12: segnali Telegram nell'app (esegui UNA sola volta) =====
-- Tabella dei segnali letti dal programma sul tuo Mac/VPS.
-- Tutti possono LEGGERE (come il resto dell'app), ma SCRIVERE si può solo
-- inviando il token segreto del bot: nessuno può inserire segnali falsi.

create table if not exists segnali_telegram (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  gruppo text not null,
  testo text not null,
  esito text not null check (esito in ('scartato', 'simulata', 'aperta', 'saltata', 'errore', 'bloccato')),
  motivo text,
  asset_symbol text,
  direzione text check (direzione in ('buy', 'sell')),
  entrata numeric,
  stop_loss numeric,
  take_profit numeric,
  take_profits jsonb
);
create index if not exists idx_segnali_telegram_ts on segnali_telegram (ts desc);

alter table segnali_telegram enable row level security;

create policy "lettura pubblica segnali_telegram" on segnali_telegram
  for select using (true);

create policy "inserimento solo dal bot" on segnali_telegram
  for insert
  with check (
    coalesce((nullif(current_setting('request.headers', true), '')::json) ->> 'x-bot-token', '') = 'u3jZakYjcwwxwhVaMhepmosf3F6-ab68'
  );

grant select on segnali_telegram to anon, authenticated;
grant insert on segnali_telegram to anon;

-- Pulizia automatica: si tengono 90 giorni di segnali.
select cron.schedule(
  'pulizia-segnali-telegram',
  '30 3 * * *',
  $$delete from segnali_telegram where ts < now() - interval '90 days'$$
);
