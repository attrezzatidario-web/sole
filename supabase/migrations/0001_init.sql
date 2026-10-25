-- ============================================================
-- Analizzatore di Mercato H24 — schema iniziale
-- ============================================================
-- Nota RLS: questa app è pensata per un utente singolo (uso personale,
-- nessun costo). Le tabelle sono leggibili pubblicamente con la chiave
-- anon (necessario per la dashboard server-side), mentre le scritture
-- automatiche (prezzi, notizie, report AI) passano SOLO dalle Edge
-- Function con la Service Role Key, che bypassa la RLS.
-- Se in futuro aggiungerai un vero multi-utente, aggiungi una colonna
-- `utente_id` e restringi le policy con `auth.uid() = utente_id`.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Anagrafica asset ----------
create table if not exists assets (
  symbol text primary key,
  categoria text not null check (categoria in ('forex', 'metallo', 'materia_prima', 'indice')),
  label text not null
);

-- ---------- Correlazioni dirette (coppie tradabili con senso) ----------
create table if not exists correlations (
  coppia text primary key,
  tipo text not null check (tipo in ('positiva', 'negativa')),
  nota text not null
);

-- ---------- Watchlist ----------
create table if not exists watchlists (
  nome text primary key,
  descrizione text not null,
  simboli text[] not null
);

-- ---------- Storico prezzi ----------
create table if not exists price_snapshots (
  id bigint generated always as identity primary key,
  asset_symbol text not null references assets (symbol),
  ts timestamptz not null default now(),
  price numeric not null,
  change_pct numeric
);

create index if not exists idx_price_snapshots_symbol_ts
  on price_snapshots (asset_symbol, ts desc);

-- Vista comoda: ultimo prezzo noto per asset.
create or replace view latest_prices as
  select distinct on (asset_symbol)
    asset_symbol as symbol,
    price,
    change_pct,
    ts
  from price_snapshots
  order by asset_symbol, ts desc;

-- ---------- Key level personali ----------
create table if not exists key_levels (
  id uuid primary key default gen_random_uuid(),
  asset_symbol text not null references assets (symbol),
  prezzo numeric not null,
  timeframe text not null check (timeframe in ('Mensile', 'Daily', 'H4', 'H1')),
  tipo text not null check (tipo in ('resistenza', 'supporto')),
  note text,
  inserito_da_utente boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Calendario notizie ----------
create table if not exists news_events (
  id uuid primary key default gen_random_uuid(),
  titolo text not null,
  asset_impattati text[],
  orario timestamptz not null,
  importanza text not null check (importanza in ('alta', 'media', 'bassa')),
  valore_atteso text,
  valore_reale text,
  fonte_evento_id text unique -- id esterno del feed, evita duplicati
);

create index if not exists idx_news_events_orario on news_events (orario);

-- ---------- Report generati dall'AI ----------
create table if not exists analysis_reports (
  id uuid primary key default gen_random_uuid(),
  asset_symbol text not null references assets (symbol),
  timestamp timestamptz not null default now(),
  testo_generato_ai text not null,
  dati_json_input jsonb
);

create index if not exists idx_analysis_reports_symbol_ts
  on analysis_reports (asset_symbol, timestamp desc);

-- ---------- Stato delle correlazioni (confermata / divergente) ----------
create table if not exists correlation_checks (
  id bigint generated always as identity primary key,
  asset_symbol text not null references assets (symbol),
  correlato_symbol text not null references assets (symbol),
  stato text not null check (stato in ('confermata', 'divergente')),
  ts timestamptz not null default now()
);

create index if not exists idx_correlation_checks_lookup
  on correlation_checks (asset_symbol, correlato_symbol, ts desc);

-- Vista comoda: ultimo stato noto per ogni coppia (asset, correlato).
create or replace view latest_correlation_checks as
  select distinct on (asset_symbol, correlato_symbol)
    asset_symbol,
    correlato_symbol,
    stato,
    ts
  from correlation_checks
  order by asset_symbol, correlato_symbol, ts desc;

-- ---------- Alert (fase 2) ----------
create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  utente_id uuid,
  tipo text not null,
  asset_symbol text references assets (symbol),
  condizione jsonb not null,
  attivo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table assets enable row level security;
alter table correlations enable row level security;
alter table watchlists enable row level security;
alter table price_snapshots enable row level security;
alter table correlation_checks enable row level security;
alter table key_levels enable row level security;
alter table news_events enable row level security;
alter table analysis_reports enable row level security;
alter table alerts enable row level security;

-- Lettura pubblica per tutto ciò che serve alla dashboard.
create policy "lettura pubblica assets" on assets for select using (true);
create policy "lettura pubblica correlations" on correlations for select using (true);
create policy "lettura pubblica watchlists" on watchlists for select using (true);
create policy "lettura pubblica price_snapshots" on price_snapshots for select using (true);
create policy "lettura pubblica correlation_checks" on correlation_checks for select using (true);
create policy "lettura pubblica news_events" on news_events for select using (true);
create policy "lettura pubblica analysis_reports" on analysis_reports for select using (true);

-- Key level: uso personale, quindi CRUD aperto con chiave anon.
-- (Restringi con auth.uid() se diventa multi-utente.)
create policy "crud pubblico key_levels" on key_levels for all using (true) with check (true);

-- price_snapshots / news_events / analysis_reports: scrittura solo da
-- Service Role (le Edge Function la usano automaticamente bypassando RLS,
-- quindi qui non serve alcuna policy di insert per anon/authenticated).
