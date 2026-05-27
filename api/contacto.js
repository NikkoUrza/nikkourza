// api/contacto.js
const { Resend } = require('resend');

let resend;
function obtenerResend() {
  if (!resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error('Falta la variable de entorno RESEND_API_KEY en Vercel.');
    }
    resend = new Resend(key);
  }
  return resend;
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const resend = obtenerResend();
    const { nombre, email, whatsapp, asunto, mensaje, cn_hp } = req.body;

    // Honeypot anti-bots
    if (cn_hp) {
      console.log('Bot detectado y rechazado de forma silenciosa');
      return res.status(200).json({ ok: true, message: 'Mensaje recibido (honeypot)' });
    }

    if (!nombre || !email || !mensaje) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: nombre, email y mensaje.' });
    }

    const asuntoLimpio = asunto || 'Contacto General';

    // 1. Enviar notificación a Nikko
    await resend.emails.send({
      from: 'Web Nikko Urza <info@nikkourza.com>',
      to: 'nikkourzamusic@gmail.com',
      reply_to: email,
      subject: `✉ Nuevo contacto web — ${asuntoLimpio}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;background-color:#080c0c;color:#f4f4f0;border:1px solid #1bb8b0;border-radius:8px">
          <h2 style="color:#2dd4cc;border-bottom:1px solid rgba(45,212,204,0.2);padding-bottom:10px;margin-top:0">Nuevo Mensaje de Contacto</h2>
          <p style="margin:10px 0"><strong>Nombre:</strong> ${nombre}</p>
          <p style="margin:10px 0"><strong>Email:</strong> <a href="mailto:${email}" style="color:#2dd4cc;text-decoration:none">${email}</a></p>
          <p style="margin:10px 0"><strong>WhatsApp:</strong> ${whatsapp || '—'}</p>
          <p style="margin:10px 0"><strong>Asunto:</strong> ${asuntoLimpio}</p>
          <div style="margin-top:20px;padding:15px;background-color:rgba(6,30,28,0.5);border-left:4px solid #2dd4cc;border-radius:4px">
            <p style="margin:0;white-space:pre-wrap;line-height:1.6">${mensaje}</p>
          </div>
          <p style="margin-top:25px;font-size:0.8em;color:rgba(244,244,240,0.4);border-top:1px solid rgba(244,244,240,0.1);padding-top:15px">
            * Puedes responder directamente a este correo para contestar al cliente.
          </p>
        </div>
      `
    });

    // 2. Enviar confirmación al cliente
    await resend.emails.send({
      from: 'Nikko Urza <info@nikkourza.com>',
      to: email,
      subject: '✓ Hemos recibido tu mensaje — Nikko Urza',
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;background-color:#080c0c;color:#f4f4f0;border:1px solid #1bb8b0;border-radius:8px">
          <h2 style="color:#2dd4cc;border-bottom:1px solid rgba(45,212,204,0.2);padding-bottom:10px;margin-top:0">¡Hola, ${nombre}!</h2>
          <p style="line-height:1.6">Gracias por escribirme. He recibido tu mensaje con respecto a "<strong>${asuntoLimpio}</strong>" de forma exitosa.</p>
          <p style="line-height:1.6">Revisaré los detalles y me pondré en contacto contigo en un plazo máximo de **24 horas** para que conversemos sobre tu proyecto o duda.</p>
          <div style="margin:20px 0;padding:15px;background-color:rgba(6,30,28,0.3);border-radius:4px;font-size:0.9em">
            <strong>Tu copia del mensaje enviado:</strong>
            <p style="margin:10px 0 0;font-style:italic;color:rgba(244,244,240,0.7)">"${mensaje}"</p>
          </div>
          <p style="line-height:1.6">Si es un asunto urgente o deseas hablar al instante, puedes escribirme directamente a mi número de WhatsApp presionando el enlace a continuación:</p>
          <p style="text-align:center;margin:25px 0">
            <a href="https://wa.me/573046455070" style="display:inline-block;background-color:#2dd4cc;color:#061e1c;text-decoration:none;font-weight:bold;padding:12px 30px;border-radius:4px;letter-spacing:1px;text-transform:uppercase">Escribir por WhatsApp</a>
          </p>
          <p style="line-height:1.6">¡Hablamos pronto!</p>
          <p style="margin-top:25px;font-size:0.85em;color:rgba(244,244,240,0.5);border-top:1px solid rgba(244,244,240,0.1);padding-top:15px">
            <strong>Nikko Urza</strong><br>
            Producción Musical, Mezcla & Masterización profesional<br>
            <a href="https://www.nikkourza.com" style="color:#2dd4cc;text-decoration:none">www.nikkourza.com</a>
          </p>
        </div>
      `
    });

    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('Error API contacto:', err);
    return res.status(500).json({ error: 'Error interno del servidor', detail: err.message });
  }
};
