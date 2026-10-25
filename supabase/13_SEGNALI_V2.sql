-- ===== PASSO 13: messaggi completi, lettura e risposte (esegui UNA sola volta) =====
-- Si esegue dopo 12_SEGNALI.sql. Aggiunge: numero del messaggio Telegram (così lo stesso
-- messaggio non si duplica mai), a quale messaggio risponde, cosa ha riconosciuto il programma
-- e da quale parola, zona di entrata, tipo di ordine e tipo di messaggio (testo/immagine/file).

alter table segnali_telegram add column if not exists msg_id bigint;
alter table segnali_telegram add column if not exists risposta_a bigint;
alter table segnali_telegram add column if not exists tipo_messaggio text not null default 'testo';
alter table segnali_telegram add column if not exists lettura jsonb;
alter table segnali_telegram add column if not exists zona_da numeric;
alter table segnali_telegram add column if not exists zona_a numeric;
alter table segnali_telegram add column if not exists tipo_ordine text;

-- un solo record per messaggio di ogni gruppo
create unique index if not exists segnali_telegram_msg_uq on segnali_telegram (gruppo, msg_id);
create index if not exists idx_segnali_telegram_risposta on segnali_telegram (gruppo, risposta_a);

-- il programma deve poter AGGIORNARE un messaggio già caricato (ricaricando lo storico
-- con un'interpretazione migliorata): stesso token segreto dell'inserimento.
create policy "aggiornamento solo dal bot" on segnali_telegram
  for update
  using (
    coalesce((nullif(current_setting('request.headers', true), '')::json) ->> 'x-bot-token', '') = 'u3jZakYjcwwxwhVaMhepmosf3F6-ab68'
  )
  with check (
    coalesce((nullif(current_setting('request.headers', true), '')::json) ->> 'x-bot-token', '') = 'u3jZakYjcwwxwhVaMhepmosf3F6-ab68'
  );
grant update on segnali_telegram to anon;
