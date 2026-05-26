-- ============================================================
-- NIKKO URZA — Schema de cuentas de clientes
-- Pega esto en Supabase → SQL Editor → Run
-- ============================================================

-- Tabla de perfiles de clientes (extiende auth.users de Supabase)
CREATE TABLE IF NOT EXISTS clientes (
  id            UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nombre        TEXT,
  whatsapp      TEXT,
  pais          TEXT DEFAULT 'CO',
  avatar_url    TEXT,
  cuenta_activa BOOLEAN DEFAULT false,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vincular ventas existentes a cuentas por email
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clientes(id);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS contrato_url TEXT;

-- RLS para clientes — cada cliente solo ve sus propios datos
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cliente_ver_propio" ON clientes
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "cliente_actualizar_propio" ON clientes
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "cliente_insertar" ON clientes
  FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS para ventas — el cliente ve solo sus compras
CREATE POLICY "ventas_por_cliente" ON ventas
  FOR SELECT USING (
    cliente_id = auth.uid()
    OR comprador_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Función automática: cuando se crea un usuario, crear su perfil
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO clientes (id, nombre, cuenta_activa)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', split_part(NEW.email, '@', 1)),
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: ejecutar al crear usuario
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Función: vincular ventas por email cuando el cliente activa cuenta
CREATE OR REPLACE FUNCTION vincular_ventas_por_email(user_id UUID, user_email TEXT)
RETURNS void AS $$
BEGIN
  UPDATE ventas
  SET cliente_id = user_id
  WHERE comprador_email = user_email
    AND cliente_id IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Índices
CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ventas_email_cliente ON ventas(comprador_email);
