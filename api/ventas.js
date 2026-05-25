// api/ventas.js
// GET /api/ventas — lista ventas (solo admin)

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'nikko-admin-2026';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = req.headers['x-admin-secret'];
  if (auth !== ADMIN_SECRET) return res.status(401).json({ error: 'No autorizado' });

  try {
    const { page = 1, limit = 20, estado } = req.query;
    const from = (page - 1) * limit;

    let query = supabase
      .from('ventas')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    if (estado) query = query.eq('estado', estado);

    const { data: ventas, count, error } = await query;
    if (error) throw error;

    // Resumen financiero
    const { data: resumen } = await supabase
      .from('ventas')
      .select('monto_usd, estado')
      .eq('estado', 'confirmado');

    const totalUSD = resumen?.reduce((s, v) => s + (v.monto_usd || 0), 0) || 0;

    // Servicios
    const { data: servicios } = await supabase
      .from('servicios_contratados')
      .select('monto_usd, estado')
      .eq('estado', 'confirmado');

    const totalServicios = servicios?.reduce((s, v) => s + (v.monto_usd || 0), 0) || 0;

    return res.status(200).json({
      ok: true,
      ventas,
      total: count,
      resumen: {
        totalBeatsUSD: totalUSD.toFixed(2),
        totalServiciosUSD: totalServicios.toFixed(2),
        totalGeneralUSD: (totalUSD + totalServicios).toFixed(2),
        cantidadVentas: resumen?.length || 0
      }
    });

  } catch (err) {
    console.error('Error API ventas:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
};
