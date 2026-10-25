-- ===== Sezione Conto: più conti, ognuno col suo piano e il suo journal =====
-- Si può eseguire anche se avevi già lanciato la versione precedente (un solo conto):
-- le impostazioni e le operazioni già salvate finiscono nel "Conto 1".

create table if not exists conti (
  id uuid primary key default gen_random_uuid(),
  nome text not null default 'Conto',
  valuta text not null default '€',
  capitale_iniziale numeric not null default 20000 check (capitale_iniziale > 0),
  profitto_pct numeric not null default 0.5 check (profitto_pct > 0),
  rischio_pct numeric not null default 1 check (rischio_pct > 0),
  pips_stop numeric not null default 20 check (pips_stop > 0),
  valore_pip numeric not null default 10 check (valore_pip > 0),
  periodi int not null default 245 check (periodi between 1 and 1000),
  ordine int not null default 0,
  creato_il timestamptz not null default now()
);

create table if not exists conto_journal (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  pnl numeric not null,
  nota text,
  creato_il timestamptz not null default now()
);
alter table conto_journal add column if not exists conto_id uuid references conti (id) on delete cascade;

-- Porta i dati della versione precedente nel primo conto
do $$
declare
  primo uuid;
begin
  if not exists (select 1 from conti) then
    if to_regclass('public.conto_impostazioni') is not null then
      insert into conti (nome, capitale_iniziale, profitto_pct, rischio_pct, pips_stop, valore_pip, periodi)
      select 'Conto 1', capitale_iniziale, profitto_pct, rischio_pct, pips_stop, valore_pip, periodi
      from conto_impostazioni where id = 1
      returning id into primo;
    end if;
    if primo is null then
      insert into conti (nome) values ('Conto 1') returning id into primo;
    end if;
  else
    select id into primo from conti order by ordine, creato_il limit 1;
  end if;
  update conto_journal set conto_id = primo where conto_id is null;
end $$;

alter table conto_journal alter column conto_id set not null;
drop index if exists idx_conto_journal_data;
create index if not exists idx_conto_journal_conto on conto_journal (conto_id, data);
drop table if exists conto_impostazioni;

-- Uso personale (come il Diario): lettura e scrittura con la chiave pubblica
alter table conti enable row level security;
alter table conto_journal enable row level security;
drop policy if exists "crud pubblico conti" on conti;
drop policy if exists "crud pubblico conto_journal" on conto_journal;
create policy "crud pubblico conti" on conti for all using (true) with check (true);
create policy "crud pubblico conto_journal" on conto_journal for all using (true) with check (true);
grant select, insert, update, delete on conti, conto_journal to anon, authenticated;
