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

-- Row Level Security — solo el backend (service role) puede escribir
ALTER TABLE beats ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicios_contratados ENABLE ROW LEVEL SECURITY;
ALTER TABLE suscriptores ENABLE ROW LEVEL SECURITY;

-- Lectura pública de beats (para mostrarlos en la web)
CREATE POLICY "beats_publicos" ON beats FOR SELECT USING (activo = true);

-- Lectura de ventas por token (para página de descarga)
CREATE POLICY "ventas_por_token" ON ventas FOR SELECT USING (true);

-- Inserción pública (el cliente crea la venta al pagar)
CREATE POLICY "insertar_ventas" ON ventas FOR INSERT WITH CHECK (true);
CREATE POLICY "insertar_servicios" ON servicios_contratados FOR INSERT WITH CHECK (true);
CREATE POLICY "insertar_suscriptores" ON suscriptores FOR INSERT WITH CHECK (true);

-- Datos de ejemplo para los 4 beats (actualiza los URLs de Drive después)
INSERT INTO beats (nombre, genero, tempo, key, precio_basic, precio_premium, precio_excl, orden) VALUES
  ('Noche Libre 808', 'Lo-fi / Trap', 140, 'Am', 35, 75, 350, 1),
  ('Abismo Teal',     'Afrobeat',     98, 'Gm', 45, 90, 500, 2),
  ('Sin Permiso',     'Rap / Boom Bap', 88, 'Dm', 30, 65, 300, 3),
  ('Océano Profundo', 'Reggaeton',    95, 'Fm', 40, 85, 450, 4)
ON CONFLICT DO NOTHING;
