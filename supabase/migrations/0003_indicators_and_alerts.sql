-- ============================================================
-- Fase 2: Alligator + EMA200 e sistema di alert
-- ============================================================

-- ---------- Segnali tecnici (Alligator + EMA200, M30) ----------
create table if not exists technical_signals (
  id bigint generated always as identity primary key,
  asset_symbol text not null references assets (symbol),
  timeframe text not null default 'M30',
  ts timestamptz not null default now(),
  prezzo numeric not null,
  ema200 numeric not null,
  jaw numeric not null,   -- mascella (SMMA 13)
  teeth numeric not null, -- denti (SMMA 8)
  lips numeric not null,  -- labbra (SMMA 5)
  posizione_alligator text not null check (posizione_alligator in ('sopra', 'sotto', 'in_mezzo')),
  direzione_alligator text not null check (direzione_alligator in ('rialzista', 'ribassista', 'laterale')),
  prezzo_vs_ema200 text not null check (prezzo_vs_ema200 in ('sopra', 'sotto')),
  input_direzionale text not null check (input_direzionale in ('buy', 'sell', 'nessuna_confluenza'))
);

create index if not exists idx_technical_signals_lookup
  on technical_signals (asset_symbol, timeframe, ts desc);

create or replace view latest_technical_signals as
  select distinct on (asset_symbol, timeframe)
    asset_symbol, timeframe, ts, prezzo, ema200, jaw, teeth, lips,
    posizione_alligator, direzione_alligator, prezzo_vs_ema200, input_direzionale
  from technical_signals
  order by asset_symbol, timeframe, ts desc;

alter table technical_signals enable row level security;
create policy "lettura pubblica technical_signals" on technical_signals for select using (true);

-- ---------- Alert notizie: evita di notificare due volte lo stesso evento ----------
alter table news_events add column if not exists notificato_at timestamptz;
