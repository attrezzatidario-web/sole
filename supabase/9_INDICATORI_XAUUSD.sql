-- ===== PASSO 61: nuovi indicatori — RSI, MACD, Bollinger, struttura, incrocio EMA =====
-- Esegui UNA sola volta.

alter table technical_signals add column if not exists rsi numeric;
alter table technical_signals add column if not exists rsi_divergenza text;
alter table technical_signals add column if not exists macd_linea numeric;
alter table technical_signals add column if not exists macd_segnale numeric;
alter table technical_signals add column if not exists macd_istogramma numeric;
alter table technical_signals add column if not exists bollinger_superiore numeric;
alter table technical_signals add column if not exists bollinger_media numeric;
alter table technical_signals add column if not exists bollinger_inferiore numeric;

-- La vista "latest_technical_signals" seleziona le colonne per nome: va rifatta
-- per includere anche queste nuove.
create or replace view latest_technical_signals as
  select distinct on (asset_symbol, timeframe)
    asset_symbol, timeframe, ts, prezzo, ema200, jaw, teeth, lips,
    posizione_alligator, direzione_alligator, prezzo_vs_ema200, input_direzionale,
    rsi, rsi_divergenza, macd_linea, macd_segnale, macd_istogramma,
    bollinger_superiore, bollinger_media, bollinger_inferiore
  from technical_signals
  order by asset_symbol, timeframe, ts desc;

-- "analisi_tecniche" ospitava solo fibonacci/pitchfork: si aggiungono
-- "struttura" (H4) ed "ema_cross" (Daily).
alter table analisi_tecniche drop constraint if exists analisi_tecniche_tipo_check;
alter table analisi_tecniche add constraint analisi_tecniche_tipo_check
  check (tipo in ('fibonacci', 'pitchfork', 'struttura', 'ema_cross'));
