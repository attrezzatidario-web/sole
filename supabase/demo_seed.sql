-- ============================================================
-- SEED DEMO (opzionale) — dati finti, SOLO per test locale.
-- Esegui DOPO supabase/seed.sql se vuoi vedere subito la dashboard,
-- la pagina asset e lo storico popolati, prima ancora di configurare
-- Twelve Data / Gemini. Non eseguirlo in un ambiente che consideri
-- "produzione": questi prezzi non sono reali.
--
--   supabase db execute -f supabase/demo_seed.sql
-- ============================================================

insert into price_snapshots (asset_symbol, price, change_pct) values
  ('XAUUSD', 2415.30, -0.18),
  ('DXY', 104.12, -0.23),
  ('EURUSD', 1.0842, 0.32),
  ('AUDUSD', 0.6621, 0.51),
  ('NZDUSD', 0.6033, 0.58),
  ('GBPUSD', 1.2701, 0.04),
  ('USDCAD', 1.3688, -0.28),
  ('USDCHF', 0.8825, -0.36),
  ('AUDJPY', 97.44, 0.41),
  ('NZDJPY', 88.71, 0.48),
  ('CADJPY', 113.02, 0.18),
  ('GBPJPY', 197.85, -0.07),
  ('XAGUSD', 28.41, -1.14),
  ('PL1!', 963.20, 2.33),
  ('COPPER', 4.52, 1.85),
  ('USOIL', 79.63, 3.21),
  ('XBRUSD', 83.10, 2.92),
  ('BR1!', 83.05, 1.02),
  ('DJI', 39120.4, 0.59),
  ('SPX', 5320.1, 0.53),
  ('NDQ', 18790.6, 0.21)
on conflict do nothing;

insert into correlation_checks (asset_symbol, correlato_symbol, stato) values
  ('XAUUSD', 'DXY', 'confermata'),
  ('DXY', 'XAUUSD', 'confermata'),
  ('XAUUSD', 'AUDUSD', 'confermata'),
  ('AUDUSD', 'XAUUSD', 'confermata'),
  ('XAUUSD', 'USOIL', 'divergente'),
  ('USOIL', 'XAUUSD', 'divergente')
on conflict do nothing;

insert into news_events (titolo, asset_impattati, orario, importanza, valore_atteso) values
  ('IPC USA (mensile)', array['EURUSD','XAUUSD','DXY'], now() + interval '90 minutes', 'alta', '3.2%'),
  ('Richieste sussidi disoccupazione', array['EURUSD','XAUUSD'], now() + interval '3 hours', 'media', '215K'),
  ('Comunicazioni FED', array['XAUUSD','DXY','SPX'], now() + interval '7 hours', 'alta', null)
on conflict do nothing;

insert into key_levels (asset_symbol, prezzo, timeframe, tipo, note) values
  ('XAUUSD', 2430.00, 'H4', 'resistenza', 'Massimo test multiplo, demo'),
  ('XAUUSD', 2390.00, 'Daily', 'supporto', 'Livello daily, demo')
on conflict do nothing;

insert into analysis_reports (asset_symbol, testo_generato_ai, dati_json_input) values
  (
    'XAUUSD',
    'Report demo: XAUUSD scambia in leggero calo (-0.18%) con DXY in flessione (-0.23%) — correlazione negativa confermata. Divergenza segnalata contro USOIL, da monitorare. Fase oraria attuale: apertura Wall Street, attenzione all''IPC USA tra circa 90 minuti. Prezzo vicino alla resistenza H4 a 2430.',
    '{"demo": true}'::jsonb
  )
on conflict do nothing;
