-- ===== PASSO 70: Volume Profile (esegui UNA sola volta) =====

create table if not exists volume_profile_analisi (
  id bigint generated always as identity primary key,
  asset_symbol text not null references assets (symbol),
  finestra_giorni integer not null,
  fonte_volume text not null,
  poc numeric not null,
  vah numeric not null,
  val numeric not null,
  prezzo_attuale numeric not null,
  buckets jsonb not null,
  analisi_ai text,
  ts timestamptz not null default now(),
  unique (asset_symbol, finestra_giorni)
);

alter table volume_profile_analisi enable row level security;
create policy "lettura pubblica volume_profile_analisi" on volume_profile_analisi for select using (true);
grant select on volume_profile_analisi to anon, authenticated;
