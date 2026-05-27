// api/portafolio.js
// GET /api/portafolio — lista los trabajos del portafolio
// POST /api/portafolio — agrega un trabajo (solo admin)
// PUT /api/portafolio — edita un trabajo (solo admin)
// DELETE /api/portafolio — elimina un trabajo (solo admin)

const { createClient } = require('@supabase/supabase-js');

let supabase;
function obtenerSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (key && (key.startsWith('sb_') || key.startsWith('sb_secret'))) {
      throw new Error('ERROR_CLAVE_DE_GESTION: Has colocado la "Personal Access Token" de Supabase (que empieza con "sb_secret_") en la variable SUPABASE_SERVICE_KEY de Vercel. Esta clave es para herramientas de línea de comandos y no sirve para interactuar con la base de datos desde código. Por favor ve a Supabase -> Project Settings -> API, desplázate hasta "Project API keys", copia la clave llamada "service_role" muy larga (que inicia con "eyJ...") y colócala en Vercel.');
    }
    
    if (!url || !key) {
      throw new Error('Configuración de base de datos incompleta. Asegúrate de configurar SUPABASE_URL y SUPABASE_SERVICE_KEY en tus variables de entorno en Vercel.');
    }
    supabase = createClient(url, key);
  }
  return supabase;
}

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
    const supabase = obtenerSupabase();

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
