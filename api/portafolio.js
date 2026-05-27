// api/portafolio.js
// GET /api/portafolio — lista los trabajos del portafolio
// POST /api/portafolio — agrega un trabajo (solo admin)
// PUT /api/portafolio — edita un trabajo (solo admin)
// DELETE /api/portafolio — elimina un trabajo (solo admin)

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'nikko-admin-2026';

function esAdmin(req) {
  const auth = req.headers['x-admin-secret'];
  return auth === ADMIN_SECRET;
}

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('portafolio')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json({ ok: true, portafolio: data });
    }

    // Proteger métodos de escritura
    if (!esAdmin(req)) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    if (req.method === 'POST') {
      const item = req.body;
      const { data, error } = await supabase.from('portafolio').insert(item).select().single();
      if (error) throw error;
      return res.status(201).json({ ok: true, item: data });
    }

    if (req.method === 'PUT') {
      const { id, ...updates } = req.body;
      if (!id) return res.status(400).json({ error: 'ID requerido' });
      const { data, error } = await supabase.from('portafolio').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json({ ok: true, item: data });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'ID requerido' });
      const { error } = await supabase.from('portafolio').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Método no permitido' });

  } catch (err) {
    console.error('Error API portafolio:', err);
    return res.status(500).json({ error: 'Error interno', detail: err.message });
  }
};
