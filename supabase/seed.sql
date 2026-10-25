-- ============================================================
-- Seed dei dati di dominio estratti dal materiale del corso.
-- Esegui dopo le migration (0001, 0002) con:
--   supabase db execute -f supabase/seed.sql
-- oppure incollando il contenuto nel SQL editor del dashboard.
-- ============================================================

insert into assets (symbol, categoria, label) values
  ('EURUSD', 'forex', 'Euro / Dollaro USA'),
  ('AUDUSD', 'forex', 'Dollaro Australiano / Dollaro USA'),
  ('NZDUSD', 'forex', 'Dollaro Neozelandese / Dollaro USA'),
  ('GBPUSD', 'forex', 'Sterlina / Dollaro USA'),
  ('USDCAD', 'forex', 'Dollaro USA / Dollaro Canadese'),
  ('USDCHF', 'forex', 'Dollaro USA / Franco Svizzero'),
  ('AUDJPY', 'forex', 'Dollaro Australiano / Yen'),
  ('NZDJPY', 'forex', 'Dollaro Neozelandese / Yen'),
  ('CADJPY', 'forex', 'Dollaro Canadese / Yen'),
  ('GBPJPY', 'forex', 'Sterlina / Yen'),
  ('XAUUSD', 'metallo', 'Oro / Dollaro USA'),
  ('XAGUSD', 'metallo', 'Argento / Dollaro USA'),
  ('PL1!', 'metallo', 'Platino (future)'),
  ('COPPER', 'metallo', 'Rame'),
  ('USOIL', 'materia_prima', 'Petrolio WTI'),
  ('XBRUSD', 'materia_prima', 'Petrolio Brent'),
  ('BR1!', 'materia_prima', 'Brent (future)'),
  ('DXY', 'indice', 'Indice Dollaro USA'),
  ('DJI', 'indice', 'Dow Jones'),
  ('SPX', 'indice', 'S&P 500'),
  ('NDQ', 'indice', 'Nasdaq')
on conflict (symbol) do nothing;

insert into correlations (coppia, tipo, nota) values
  ('EURUSD', 'negativa', 'Se cresce uno scende l''altro e viceversa.'),
  ('AUDUSD', 'positiva', 'Cresce con il crescere dell''oro e viceversa.'),
  ('NZDUSD', 'positiva', 'Cresce con il crescere dell''oro e viceversa.'),
  ('XAUUSD', 'negativa', 'XAU segue materie prime e metalli; USD si correla negativamente con il petrolio.'),
  ('AUDJPY', 'positiva', 'Cresce con il crescere dell''oro e dei metalli e viceversa.'),
  ('NZDJPY', 'positiva', 'Cresce con il crescere dell''oro e dei metalli e viceversa.'),
  ('XBRUSD', 'negativa', 'Se sale il petrolio scende il dollaro e viceversa.'),
  ('USDCAD', 'negativa', 'Cresce al diminuire del prezzo del petrolio e viceversa.'),
  ('GBPUSD', 'positiva', 'Cresce al crescere del prezzo del petrolio e viceversa.'),
  ('CADJPY', 'positiva', 'Cresce al crescere del prezzo del petrolio e viceversa.'),
  ('GBPJPY', 'positiva', 'Cresce al crescere del prezzo del petrolio e viceversa.'),
  ('USDCHF', 'negativa', 'Sono 2 asset di rifugio: se sale uno scende l''altro e viceversa.')
on conflict (coppia) do nothing;

insert into watchlists (nome, descrizione, simboli) values
  (
    'Forex',
    'Vista d''insieme del mercato: mostra se una correlazione si sta confermando o invertendo tra valute, indici e commodity.',
    array['AUDJPY','AUDUSD','CADJPY','EURUSD','GBPJPY','GBPUSD','NZDJPY','NZDUSD','USDCAD','USDCHF','XAUUSD']
  ),
  (
    'Indicatori Oro',
    'Andamento dell''oro, da usare da sola o insieme a Indici Anti USD (dalle 15:30) per capire quale delle 3 correlazioni USD/XAU/Indici sta prevalendo.',
    array['NZDUSD','AUDUSD','EURUSD','XAUUSD','DXY','XAGUSD']
  ),
  (
    'Indici Anti USD',
    'Da incrociare con Indicatori Oro per determinare, verso le 16:00, quale delle 3 correlazioni USD-Indici-XAU è in corso.',
    array['DJI','SPX','NDQ']
  ),
  (
    'Petrolio',
    'Il petrolio è quotato in dollari: correlazione negativa con USD, positiva con CAD e GBP, negativa con JPY.',
    array['USOIL','XBRUSD','BR1!','CADJPY','GBPUSD','GBPJPY','USDCAD']
  ),
  (
    'Metalli',
    'Il salire delle materie prime correla negativamente con JPY. Il Platino spesso anticipa l''Oro ma va confermato dall''Argento.',
    array['PL1!','COPPER','XAUUSD','XAGUSD']
  )
on conflict (nome) do nothing;
