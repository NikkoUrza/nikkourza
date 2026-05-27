// api/detect-location.js
// Detecta la ubicación del usuario mediante cabeceras de red provistas por Vercel
// Retorna el código de país de 2 letras (ej: 'CO' para Colombia)

module.exports = async (req, res) => {
  // CORS Headers para habilitar peticiones desde cualquier origen
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const country = req.headers['x-vercel-ip-country'] || 'US';
    return res.status(200).json({ ok: true, country });
  } catch (err) {
    console.error('Error en api/detect-location:', err);
    return res.status(500).json({ ok: false, error: 'Error detectando país', country: 'US' });
  }
};
