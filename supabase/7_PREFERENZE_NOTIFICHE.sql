-- ===== PASSO 53: preferenza "solo notizie XAUUSD" (esegui UNA sola volta) =====
-- Un'unica riga di impostazioni globali per le notifiche (app a un solo utente).
-- Bloccata alla lettura/scrittura diretta dal sito: passa solo dalla funzione "notifiche".

create table if not exists notifiche_impostazioni (
  id smallint primary key default 1 check (id = 1),
  solo_xauusd boolean not null default false
);

insert into notifiche_impostazioni (id) values (1) on conflict (id) do nothing;

alter table notifiche_impostazioni enable row level security;
-- Nessuna policy pubblica: solo la Service Role (usata dalla funzione) può leggerla/scriverla.
