// api/servicios.js
// GET /api/servicios — lista servicios contratados (solo admin)

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'nikko-admin-2026';

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const auth = req.headers['x-admin-secret'];
    if (auth !== ADMIN_SECRET) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const { data: servicios, error } = await supabase
      .from('servicios_contratados')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.status(200).json({ ok: true, servicios });

  } catch (err) {
    console.error('Error API servicios:', err);
    return res.status(500).json({ error: 'Error interno', detail: err.message });
  }
};
