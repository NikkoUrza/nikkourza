// api/beats.js
// GET /api/beats — lista los beats activos
// POST /api/beats — crea un beat (solo admin)
// PUT /api/beats/:id — actualiza un beat (solo admin)
// DELETE /api/beats/:id — desactiva un beat (solo admin)

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'nikko-admin-2026';

function esAdmin(req) {
  const auth = req.headers['x-admin-secret'];
  return auth === ADMIN_SECRET;
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('beats')
        .select('*')
        .eq('activo', true)
        .order('orden', { ascending: true });

      if (error) throw error;
      return res.status(200).json({ ok: true, beats: data });
    }

    if (!esAdmin(req)) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    if (req.method === 'POST') {
      const beat = req.body;
      const { data, error } = await supabase.from('beats').insert(beat).select().single();
      if (error) throw error;
      return res.status(201).json({ ok: true, beat: data });
    }

    if (req.method === 'PUT') {
      const { id, ...updates } = req.body;
      if (!id) return res.status(400).json({ error: 'ID requerido' });
      const { data, error } = await supabase.from('beats').update(updates).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json({ ok: true, beat: data });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'ID requerido' });
      await supabase.from('beats').update({ activo: false }).eq('id', id);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Método no permitido' });

  } catch (err) {
    console.error('Error API beats:', err);
    return res.status(500).json({ error: 'Error interno', detail: err.message });
  }
};
