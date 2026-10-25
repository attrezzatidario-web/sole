-- ===== PASSO 67: Diario di trading (esegui UNA sola volta) =====

create table if not exists operazioni (
  id uuid primary key default gen_random_uuid(),
  asset_symbol text not null references assets (symbol),
  direzione text not null check (direzione in ('long', 'short')),
  prezzo_entrata numeric not null,
  prezzo_uscita numeric,
  stop_loss numeric,
  take_profit numeric,
  nota text,
  aperta_il timestamptz not null default now(),
  chiusa_il timestamptz
);
create index if not exists idx_operazioni_asset on operazioni (asset_symbol, aperta_il desc);

alter table operazioni enable row level security;
-- Uso personale (come key_levels): CRUD aperto con la chiave pubblica.
create policy "crud pubblico operazioni" on operazioni for all using (true) with check (true);
grant select, insert, update, delete on operazioni to anon, authenticated;
