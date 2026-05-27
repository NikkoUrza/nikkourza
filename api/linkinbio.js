// api/linkinbio.js
// GET /api/linkinbio — obtiene los datos de configuración de Link in Bio (id = 2)
// PUT /api/linkinbio — actualiza los datos de configuración (solo admin)

const { createClient } = require('@supabase/supabase-js');

let supabase;
function obtenerSupabase() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    
    if (key && (key.startsWith('sb_') || key.startsWith('sb_secret'))) {
      throw new Error('ERROR_CLAVE_DE_GESTION: Has colocado la "Personal Access Token" de Supabase en la variable SUPABASE_SERVICE_KEY de Vercel.');
    }
    
    if (!url || !key) {
      throw new Error('Configuración de base de datos incompleta.');
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const supabase = obtenerSupabase();

    if (req.method === 'GET') {
      let { data, error } = await supabase
        .from('presskit')
        .select('*')
        .eq('id', 2)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      // Si no existe, crear el registro por defecto para el Link in Bio (id = 2)
      if (!data) {
        const seed = {
          id: 2,
          foto: 'Images/logo.png', // Imagen de perfil (avatar)
          hero: '', // Lanzamiento único (URL de pista SoundCloud)
          download: 'https://soundcloud.com/nikkourza' // Proveedor de música (URL de perfil SoundCloud)
        };
        const { data: inserted, error: insertError } = await supabase.from('presskit').insert(seed).select().single();
        if (insertError) throw insertError;
        data = inserted;
      }

      return res.status(200).json({ ok: true, config: data });
    }

    // Proteger métodos de escritura
    if (!esAdmin(req)) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    if (req.method === 'PUT') {
      const updates = req.body;
      const { data, error } = await supabase
        .from('presskit')
        .update(updates)
        .eq('id', 2)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ ok: true, config: data });
    }

    return res.status(405).json({ error: 'Método no permitido' });

  } catch (err) {
    console.error('Error API linkinbio:', err);
    return res.status(500).json({ error: 'Error interno: ' + err.message });
  }
};
