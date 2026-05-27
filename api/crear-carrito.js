// api/crear-carrito.js
// Recibe un listado de beats en el carrito, sus licencias e información del comprador
// Crea registros de venta individuales con estado 'pendiente' y una referencia_pago común 'cart-...'
// Retorna la referencia de pago unificada y los montos totales para procesar en las pasarelas

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

let supabase;
function obtenerSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error('Configuración de base de datos incompleta. Configura SUPABASE_URL y SUPABASE_SERVICE_KEY en Vercel.');
    }
    supabase = createClient(url, key);
  }
  return supabase;
}

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { items, comprador_email, comprador_nombre } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'El carrito no contiene productos' });
    }

    if (!comprador_email) {
      return res.status(400).json({ error: 'El email del comprador es obligatorio' });
    }

    const db = obtenerSupabase();

    // 1. Generar un identificador único de pago consolidado (carrito)
    const randomHex = crypto.randomBytes(4).toString('hex');
    const referenciaPago = `cart-${Date.now()}-${randomHex}`;

    const ventasPendientes = [];

    // 2. Procesar cada item para obtener su nombre oficial desde la BD y estructurar el registro
    for (const item of items) {
      const { beat_id, licencia, precio_usd } = item;
      
      let beatNombre = 'Beat';
      let beatIdValidado = null;

      // Buscar el beat en la base de datos para obtener su nombre real
      if (beat_id) {
        try {
          const { data: beat } = await db
            .from('beats')
            .select('id, nombre')
            .eq('id', beat_id)
            .maybeSingle();

          if (beat) {
            beatIdValidado = beat.id;
            beatNombre = beat.nombre;
          }
        } catch (e) {
          console.error(`Error buscando beat ${beat_id}:`, e);
        }
      }

      ventasPendientes.push({
        beat_id: beatIdValidado,
        beat_nombre: beatNombre,
        licencia: licencia || 'basic',
        monto_usd: parseFloat(precio_usd) || 0.0,
        comprador_email: comprador_email.trim(),
        comprador_nombre: (comprador_nombre || 'Cliente').trim(),
        referencia_pago: referenciaPago,
        estado: 'pendiente'
      });
    }

    // 3. Insertar todas las ventas pendientes en un solo bloque en Supabase
    const { data: inserts, error: insertError } = await db
      .from('ventas')
      .insert(ventasPendientes)
      .select();

    if (insertError) {
      console.error('Error insertando ventas del carrito:', insertError);
      throw insertError;
    }

    // 4. Calcular totales para la pasarela
    const totalUSD = ventasPendientes.reduce((sum, item) => sum + item.monto_usd, 0);

    return res.status(201).json({
      ok: true,
      referencia_pago: referenciaPago,
      total_usd: totalUSD,
      total_items: items.length,
      ventas: inserts
    });

  } catch (err) {
    console.error('Error en api/crear-carrito:', err);
    return res.status(500).json({ error: 'Error interno: ' + err.message });
  }
};
