-- ===== Gestione conto: impostazioni del piano + journal (esegui UNA sola volta) =====

create table if not exists conto_impostazioni (
  id int primary key default 1 check (id = 1),   -- una sola riga
  capitale_iniziale numeric not null default 20000,
  profitto_pct numeric not null default 0.5,
  rischio_pct numeric not null default 1,
  pips_stop numeric not null default 20,
  valore_pip numeric not null default 10,
  periodi int not null default 245,
  aggiornato_il timestamptz not null default now()
);
insert into conto_impostazioni (id) values (1) on conflict (id) do nothing;

create table if not exists conto_journal (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  pnl numeric not null,            -- profitto/perdita con commissioni, in €
  nota text,
  creato_il timestamptz not null default now()
);
create index if not exists idx_conto_journal_data on conto_journal (data);

alter table conto_impostazioni enable row level security;
alter table conto_journal enable row level security;
-- Uso personale (come il Diario): lettura e scrittura con la chiave pubblica.
create policy "crud pubblico conto_impostazioni" on conto_impostazioni for all using (true) with check (true);
create policy "crud pubblico conto_journal" on conto_journal for all using (true) with check (true);
grant select, insert, update, delete on conto_impostazioni, conto_journal to anon, authenticated;
