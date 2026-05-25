// api/descarga.js
// Valida el token y devuelve el link de Google Drive
// GET /api/descarga?token=xxxx

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token requerido' });

  try {
    // Buscar la venta por token
    const { data: venta, error } = await supabase
      .from('ventas')
      .select('*, beats(*)')
      .eq('token_descarga', token)
      .eq('estado', 'confirmado')
      .single();

    if (error || !venta) {
      return res.status(404).json({ error: 'Token inválido o expirado' });
    }

    // Obtener URL de descarga según licencia
    let driveUrl = null;
    if (venta.beats) {
      const beat = venta.beats;
      driveUrl = venta.licencia === 'premium' ? beat.drive_premium_url
        : venta.licencia === 'exclusiva' ? beat.drive_excl_url
        : beat.drive_basic_url;
    }

    // Incrementar contador de descargas
    await supabase.from('ventas')
      .update({ descargas: (venta.descargas || 0) + 1 })
      .eq('id', venta.id);

    // Devolver datos para la página de descarga
    return res.status(200).json({
      ok: true,
      beat: venta.beat_nombre,
      licencia: venta.licencia,
      driveUrl,
      comprador: venta.comprador_nombre,
      fecha: venta.created_at,
      descargas: (venta.descargas || 0) + 1
    });

  } catch (err) {
    console.error('Error descarga:', err);
    return res.status(500).json({ error: 'Error interno' });
  }
};
