// api/presskit.js
// GET /api/presskit — obtiene los datos del presskit del artista
// PUT /api/presskit — actualiza los datos del presskit (solo admin)

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      let { data, error } = await supabase
        .from('presskit')
        .select('*')
        .eq('id', 1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      // Si no existe, crear el registro por defecto
      if (!data) {
        const seed = {
          id: 1,
          hero: 'Images/HomePortada.png',
          foto: 'Images/PressKit.png',
          quote: 'Soy ese artista que quiere ser dueño de su arte y de su tiempo, que quiere crear con libertad, que no se encasilla en un género porque la música es infinita.',
          bio: 'Cantante, productor musical y audiovisual originario de Colombia. Con más de 12 años construyendo un sonido con alma propia, Nikko Urza opera desde la convicción de que la música libre es la única música honesta.',
          tags: 'Afrobeat, Rap, Reggae, Trap, Lo-fi, Colombia, Independiente',
          anios: '12+',
          generos: '∞'
        };
        const { data: inserted } = await supabase.from('presskit').insert(seed).select().single();
        data = inserted;
      }

      return res.status(200).json({ ok: true, presskit: data });
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
        .eq('id', 1)
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ ok: true, presskit: data });
    }

    return res.status(405).json({ error: 'Método no permitido' });

  } catch (err) {
    console.error('Error API presskit:', err);
    return res.status(500).json({ error: 'Error interno', detail: err.message });
  }
};
