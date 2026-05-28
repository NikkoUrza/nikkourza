// api/presskit.js - v1.0.2
// GET /api/presskit — obtiene los datos del presskit del artista
// PUT /api/presskit — actualiza los datos del presskit (solo admin)

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const supabase = obtenerSupabase();
    
    // Distinguir si es Presskit (id = 1) o Link in Bio (id = 2)
    const esLinkInBio = req.query.tipo === 'linkinbio';
    const targetId = esLinkInBio ? 2 : 1;

    if (req.method === 'GET') {
      let { data, error } = await supabase
        .from('presskit')
        .select('*')
        .eq('id', targetId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      // Si no existe, crear el registro por defecto
      if (!data) {
        if (esLinkInBio) {
          const seed = {
            id: 2,
            foto: 'Images/logo.png', // Imagen de perfil (avatar)
            hero: '', // Lanzamiento único (URL de pista SoundCloud)
            download: 'https://soundcloud.com/nikkourza' // Proveedor de música (URL de perfil SoundCloud)
          };
          const { data: inserted, error: insertError } = await supabase.from('presskit').insert(seed).select().single();
          if (insertError) throw insertError;
          data = inserted;
        } else {
          const seed = {
            id: 1,
            hero: 'Images/HomePortada.png',
            foto: 'Images/PressKit.png',
            quote: 'Soy ese artista que quiere ser dueño de su arte y de su tiempo, que quiere crear con libertad, que no se encasilla en un género porque la música es infinita.',
            bio: 'Nikko Urza es un productor, compositor e intérprete de música urbana caleño, es un apasionado y creativo que cuenta con 10 años de experiencia en producción y composición, ha tenido la oportunidad de trabajar con diversos artistas de la escena en la ciudad de Cali.',
            tags: 'Afrobeat, Rap, Reggae, Trap, Lo-fi, Colombia, Independiente',
            anios: '12+',
            generos: '∞'
          };
          const { data: inserted, error: insertError } = await supabase.from('presskit').insert(seed).select().single();
          if (insertError) throw insertError;
          data = inserted;
        }
      }

      if (esLinkInBio) {
        return res.status(200).json({ ok: true, config: data });
      } else {
        return res.status(200).json({ ok: true, presskit: data });
      }
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
        .eq('id', targetId)
        .select()
        .single();

      if (error) throw error;
      
      if (esLinkInBio) {
        return res.status(200).json({ ok: true, config: data });
      } else {
        return res.status(200).json({ ok: true, presskit: data });
      }
    }

    return res.status(405).json({ error: 'Método no permitido' });

  } catch (err) {
    const url = process.env.SUPABASE_URL || 'NO_URL';
    const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'NO_KEY';
    const keyMasked = rawKey.substring(0, 8) + '...' + rawKey.substring(rawKey.length - 8);
    const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    const hasService = !!process.env.SUPABASE_SERVICE_KEY;
    const hasAnon = !!process.env.SUPABASE_ANON_KEY;

    console.error('Error API presskit:', err);
    return res.status(500).json({ 
      error: 'Error interno: ' + err.message, 
      detail: `URL: ${url} | KEY: ${keyMasked} | HasRoleKey: ${hasServiceRole} | HasServiceKey: ${hasService} | HasAnonKey: ${hasAnon}` 
    });
  }
};
