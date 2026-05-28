-- ============================================================
-- NIKKO URZA — Supabase Schema
-- Pega esto en Supabase → SQL Editor → Run
-- ============================================================

-- TABLA: beats (los que administras desde el panel)
CREATE TABLE IF NOT EXISTS beats (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre       TEXT NOT NULL,
  genero       TEXT,
  tempo        INTEGER,
  key          TEXT,
  type_beat    TEXT,
  precio_basic INTEGER NOT NULL DEFAULT 35,
  precio_premium INTEGER NOT NULL DEFAULT 75,
  precio_excl  INTEGER NOT NULL DEFAULT 350,
  caratula_url TEXT,
  preview_url  TEXT,
  drive_basic_url   TEXT,
  drive_premium_url TEXT,
  drive_excl_url    TEXT,
  activo       BOOLEAN DEFAULT true,
  orden        INTEGER DEFAULT 0,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TABLA: ventas (cada compra confirmada)
CREATE TABLE IF NOT EXISTS ventas (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  beat_id         UUID REFERENCES beats(id),
  beat_nombre     TEXT,
  licencia        TEXT NOT NULL, -- 'basic' | 'premium' | 'exclusiva'
  monto_usd       NUMERIC(10,2),
  monto_cop       BIGINT,
  comprador_nombre TEXT,
  comprador_email TEXT NOT NULL,
  metodo_pago     TEXT, -- 'epayco' | 'paypal'
  referencia_pago TEXT,
  estado          TEXT DEFAULT 'pendiente', -- 'pendiente' | 'confirmado' | 'fallido'
  token_descarga  TEXT UNIQUE,
  descargas       INTEGER DEFAULT 0,
  email_enviado   BOOLEAN DEFAULT false,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TABLA: servicios_contratados
CREATE TABLE IF NOT EXISTS servicios_contratados (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  servicio        TEXT NOT NULL,
  monto_usd       NUMERIC(10,2),
  cliente_nombre  TEXT,
  cliente_email   TEXT NOT NULL,
  cliente_whatsapp TEXT,
  mensaje         TEXT,
  dudas           TEXT,
  metodo_pago     TEXT,
  referencia_pago TEXT,
  estado          TEXT DEFAULT 'pendiente',
  drive_link      TEXT,
  notas_internas  TEXT,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TABLA: suscriptores newsletter
CREATE TABLE IF NOT EXISTS suscriptores (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email      TEXT UNIQUE NOT NULL,
  activo     BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices útiles
CREATE INDEX IF NOT EXISTS idx_ventas_email ON ventas(comprador_email);
CREATE INDEX IF NOT EXISTS idx_ventas_token ON ventas(token_descarga);
CREATE INDEX IF NOT EXISTS idx_ventas_estado ON ventas(estado);
CREATE INDEX IF NOT EXISTS idx_beats_activo ON beats(activo, orden);

-- Función para vincular ventas anteriores al registrarse un nuevo usuario
CREATE OR REPLACE FUNCTION vincular_ventas_por_email(user_id UUID, user_email TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE ventas
  SET cliente_id = user_id
  WHERE comprador_email = user_email AND cliente_id IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Row Level Security — solo el backend (service role) puede escribir
ALTER TABLE beats ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicios_contratados ENABLE ROW LEVEL SECURITY;
ALTER TABLE suscriptores ENABLE ROW LEVEL SECURITY;

-- Lectura pública de beats (para mostrarlos en la web)
DROP POLICY IF EXISTS "beats_publicos" ON beats;
CREATE POLICY "beats_publicos" ON beats FOR SELECT USING (activo = true);

DROP POLICY IF EXISTS "beats_admin_all" ON beats;
CREATE POLICY "beats_admin_all" ON beats FOR ALL USING (true) WITH CHECK (true);

-- Lectura de ventas por token (para página de descarga)
DROP POLICY IF EXISTS "ventas_por_token" ON ventas;
CREATE POLICY "ventas_por_token" ON ventas FOR SELECT USING (true);

-- Inserción pública (el cliente crea la venta al pagar)
DROP POLICY IF EXISTS "insertar_ventas" ON ventas;
CREATE POLICY "insertar_ventas" ON ventas FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "insertar_servicios" ON servicios_contratados;
CREATE POLICY "insertar_servicios" ON servicios_contratados FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "insertar_suscriptores" ON suscriptores;
CREATE POLICY "insertar_suscriptores" ON suscriptores FOR INSERT WITH CHECK (true);

-- Datos de ejemplo para los 4 beats (actualiza los URLs de Drive después)
INSERT INTO beats (nombre, genero, tempo, key, precio_basic, precio_premium, precio_excl, orden) VALUES
  ('Noche Libre 808', 'Lo-fi / Trap', 140, 'Am', 35, 75, 350, 1),
  ('Abismo Teal',     'Afrobeat',     98, 'Gm', 45, 90, 500, 2),
  ('Sin Permiso',     'Rap / Boom Bap', 88, 'Dm', 30, 65, 300, 3),
  ('Océano Profundo', 'Reggaeton',    95, 'Fm', 40, 85, 450, 4)
ON CONFLICT DO NOTHING;

-- TABLA: portafolio
CREATE TABLE IF NOT EXISTS portafolio (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo        TEXT NOT NULL,
  tipo          TEXT NOT NULL, -- 'mezcla' | 'master' | 'beat' etc.
  artista       TEXT,
  genero        TEXT,
  anio          INTEGER,
  spotify_url   TEXT,
  apple_url     TEXT,
  youtube_url   TEXT,
  soundcloud_url TEXT,
  deezer_url    TEXT,
  tidal_url     TEXT,
  drive_url     TEXT,
  caratula_url  TEXT,
  descripcion   TEXT,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Asegurar que la columna descripcion exista en bases de datos ya creadas
ALTER TABLE portafolio ADD COLUMN IF NOT EXISTS descripcion TEXT;

-- TABLA: presskit (almacena biografía y multimedia de forma global)
CREATE TABLE IF NOT EXISTS presskit (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  hero          TEXT,
  foto          TEXT,
  quote         TEXT,
  bio           TEXT,
  tags          TEXT,
  anios         TEXT,
  generos       TEXT,
  video1        TEXT,
  video2        TEXT,
  download      TEXT,
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE portafolio ENABLE ROW LEVEL SECURITY;
ALTER TABLE presskit ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura pública
DROP POLICY IF EXISTS "portafolio_publico" ON portafolio;
CREATE POLICY "portafolio_publico" ON portafolio FOR SELECT USING (true);

DROP POLICY IF EXISTS "portafolio_admin_all" ON portafolio;
CREATE POLICY "portafolio_admin_all" ON portafolio FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "presskit_publico" ON presskit;
CREATE POLICY "presskit_publico" ON presskit FOR SELECT USING (true);

DROP POLICY IF EXISTS "presskit_admin_all" ON presskit;
CREATE POLICY "presskit_admin_all" ON presskit FOR ALL USING (true) WITH CHECK (true);

-- Semilla de Portafolio
INSERT INTO portafolio (titulo, tipo, artista, genero, anio, caratula_url) VALUES
  ('Proyecto Alfa', 'mezcla', 'Artista X', 'Afrobeat', 2026, ''),
  ('Sin Permiso', 'master', 'Artista Y', 'Trap', 2025, ''),
  ('EP Océano', 'mezcla', 'Artista Z', 'Reggae', 2025, ''),
  ('Álbum Libre', 'master', 'Varios', 'Multi-género', 2024, '')
ON CONFLICT DO NOTHING;

-- Semilla de Presskit (registro único con id=1)
INSERT INTO presskit (id, hero, foto, quote, bio, tags, anios, generos) VALUES
  (1, 
   'Images/HomePortada.png', 
   'Images/PressKit.png', 
   'Soy ese artista que quiere ser dueño de su arte y de su tiempo, que quiere crear con libertad, que no se encasilla en un género porque la música es infinita.', 
   'Nikko Urza es un productor, compositor e intérprete de música urbana caleño, es un apasionado y creativo que cuenta con 10 años de experiencia en producción y composición, ha tenido la oportunidad de trabajar con diversos artistas de la escena en la ciudad de Cali.', 
   'Afrobeat, Rap, Reggae, Trap, Lo-fi, Colombia, Independiente', 
   '12+', 
   '∞')
ON CONFLICT DO NOTHING;
