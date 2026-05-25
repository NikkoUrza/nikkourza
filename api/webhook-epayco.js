// api/webhook-epayco.js
// Recibe la confirmación de pago de ePayco
// URL: https://tu-proyecto.vercel.app/api/webhook-epayco

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);
const SITE_URL = process.env.SITE_URL || 'https://nikkourza.vercel.app';

// Genera un token único de descarga
function generarToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Verifica firma de ePayco
function verificarFirmaEpayco(data) {
  const { x_ref_payco, x_transaction_id, x_amount, x_currency_code, x_signature } = data;
  const pKey = process.env.EPAYCO_P_KEY;
  const cadena = `${pKey}^${x_ref_payco}^${x_transaction_id}^${x_amount}^${x_currency_code}`;
  const firma = crypto.createHash('sha256').update(cadena).digest('hex');
  return firma === x_signature;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const data = req.body;
    console.log('ePayco webhook recibido:', JSON.stringify(data));

    // Verificar firma
    if (!verificarFirmaEpayco(data)) {
      console.error('Firma inválida');
      return res.status(400).json({ error: 'Firma inválida' });
    }

    // Solo procesar transacciones aprobadas (x_cod_transaction_state === '1')
    if (data.x_cod_transaction_state !== '1') {
      console.log('Transacción no aprobada:', data.x_cod_transaction_state);
      return res.status(200).json({ status: 'ignored', state: data.x_cod_transaction_state });
    }

    const referencia = data.x_extra1; // formato: "beat-{beatId}-{licencia}-{ventaId}"
    const email = data.x_customer_email || data.x_extra2;
    const nombre = data.x_customer_name || data.x_extra3 || 'Cliente';
    const monto = parseFloat(data.x_amount);

    if (!referencia || !email) {
      return res.status(400).json({ error: 'Faltan datos de referencia' });
    }

    // Parsear referencia
    const partes = referencia.split('-');
    const tipo = partes[0]; // 'beat' o 'svc'

    if (tipo === 'beat') {
      await procesarVentaBeat({
        referencia,
        email,
        nombre,
        monto,
        metodoPago: 'epayco',
        referenciaExterna: data.x_transaction_id
      });
    } else if (tipo === 'svc') {
      await procesarServicio({
        referencia,
        email,
        nombre,
        monto,
        metodoPago: 'epayco',
        referenciaExterna: data.x_transaction_id
      });
    }

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('Error webhook ePayco:', err);
    res.status(500).json({ error: 'Error interno' });
  }
};

async function procesarVentaBeat({ referencia, email, nombre, monto, metodoPago, referenciaExterna }) {
  // Buscar la venta pendiente
  const { data: venta, error } = await supabase
    .from('ventas')
    .select('*, beats(*)')
    .eq('referencia_pago', referencia)
    .eq('estado', 'pendiente')
    .single();

  let ventaId;
  let beatData;
  let licencia;

  if (!venta) {
    // Crear venta si no existe (pago llegó antes del registro frontend)
    const partes = referencia.split('-');
    beatData = { nombre: partes[1] || 'Beat', id: null };
    licencia = partes[2] || 'basic';

    const token = generarToken();
    const { data: nueva } = await supabase.from('ventas').insert({
      beat_nombre: beatData.nombre,
      licencia,
      monto_usd: monto,
      comprador_email: email,
      comprador_nombre: nombre,
      metodo_pago: metodoPago,
      referencia_pago: referencia,
      estado: 'confirmado',
      token_descarga: token
    }).select().single();
    ventaId = nueva?.id;
    beatData = { nombre: licencia };
  } else {
    licencia = venta.licencia;
    beatData = venta.beats || { nombre: venta.beat_nombre };

    // Actualizar estado a confirmado
    const token = generarToken();
    await supabase.from('ventas').update({
      estado: 'confirmado',
      token_descarga: token,
      referencia_pago: referenciaExterna || referencia,
      updated_at: new Date().toISOString()
    }).eq('id', venta.id);

    ventaId = venta.id;
    venta.token_descarga = token;
  }

  // Obtener token actualizado
  const { data: ventaFinal } = await supabase
    .from('ventas')
    .select('*')
    .eq('id', ventaId)
    .single();

  if (ventaFinal && !ventaFinal.email_enviado) {
    await enviarEmailDescarga({
      email,
      nombre,
      beatNombre: beatData.nombre || ventaFinal.beat_nombre,
      licencia: ventaFinal.licencia,
      monto: ventaFinal.monto_usd,
      token: ventaFinal.token_descarga,
      ventaId: ventaFinal.id
    });

    await supabase.from('ventas').update({ email_enviado: true }).eq('id', ventaFinal.id);
  }
}

async function procesarServicio({ referencia, email, nombre, monto, metodoPago, referenciaExterna }) {
  await supabase.from('servicios_contratados').update({
    estado: 'confirmado',
    metodo_pago: metodoPago,
    referencia_pago: referenciaExterna || referencia
  }).eq('referencia_pago', referencia);

  // Email de confirmación al cliente
  await resend.emails.send({
    from: 'Nikko Urza <noreply@nikkourza.com>',
    to: email,
    subject: '✓ Pago recibido — Tu proyecto está en camino',
    html: emailServicioTemplate({ nombre, monto, referencia })
  });

  // Notificación a Nikko
  await resend.emails.send({
    from: 'Web Nikko Urza <noreply@nikkourza.com>',
    to: 'nikkourza@gmail.com',
    subject: `💰 Nuevo servicio contratado — $${monto} USD`,
    html: `<p>Nuevo servicio pagado por <strong>${nombre}</strong> (${email}).<br>Monto: $${monto} USD<br>Referencia: ${referencia}</p>`
  });
}

async function enviarEmailDescarga({ email, nombre, beatNombre, licencia, monto, token, ventaId }) {
  const linkDescarga = `${SITE_URL}/descarga?token=${token}`;

  await resend.emails.send({
    from: 'Nikko Urza <noreply@nikkourza.com>',
    to: email,
    subject: `✓ Tu beat está listo — ${beatNombre}`,
    html: emailDescargaTemplate({ nombre, beatNombre, licencia, monto, linkDescarga, token })
  });

  // Copia a Nikko
  await resend.emails.send({
    from: 'Web Nikko Urza <noreply@nikkourza.com>',
    to: 'nikkourza@gmail.com',
    subject: `💰 Beat vendido — ${beatNombre} (${licencia}) $${monto} USD`,
    html: `<p>Beat vendido: <strong>${beatNombre}</strong><br>Licencia: ${licencia}<br>Comprador: ${nombre} (${email})<br>Monto: $${monto} USD</p>`
  });
}

function emailDescargaTemplate({ nombre, beatNombre, licencia, monto, linkDescarga, token }) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body{background:#080C0C;color:#F4F4F0;font-family:'Space Mono',monospace,sans-serif;margin:0;padding:0}
  .wrap{max-width:560px;margin:0 auto;padding:2.5rem 2rem}
  .logo{font-size:1.4rem;letter-spacing:6px;color:#F4F4F0;margin-bottom:2rem}
  .logo span{color:#2DD4CC}
  h1{font-size:1.6rem;letter-spacing:3px;color:#F4F4F0;margin-bottom:0.5rem;text-transform:uppercase}
  .sub{font-size:0.75rem;color:rgba(244,244,240,0.5);margin-bottom:2rem;line-height:1.7}
  .card{border:1px solid rgba(45,212,204,0.25);background:rgba(6,30,28,0.6);padding:1.5rem;margin-bottom:1.5rem}
  .card-row{display:flex;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid rgba(45,212,204,0.08);font-size:0.75rem}
  .card-row:last-child{border-bottom:none}
  .label{color:rgba(244,244,240,0.4)}
  .value{color:#F4F4F0;font-weight:700}
  .value.cyan{color:#2DD4CC}
  .btn{display:block;background:#2DD4CC;color:#061E1C;text-decoration:none;padding:1rem 2rem;text-align:center;font-size:0.75rem;letter-spacing:3px;text-transform:uppercase;font-weight:700;margin:1.5rem 0}
  .link-box{border:1px solid rgba(45,212,204,0.2);padding:0.8rem 1rem;background:rgba(45,212,204,0.05);font-size:0.65rem;color:rgba(244,244,240,0.5);word-break:break-all;margin-bottom:1.5rem}
  .footer{font-size:0.6rem;color:rgba(244,244,240,0.25);line-height:1.8;border-top:1px solid rgba(45,212,204,0.1);padding-top:1.2rem;margin-top:2rem}
</style></head>
<body><div class="wrap">
  <div class="logo">NIKKO <span>URZA</span></div>
  <h1>¡Tu beat está listo!</h1>
  <p class="sub">Hola ${nombre}, tu compra fue confirmada. Acá tienes todo lo que necesitas.</p>

  <div class="card">
    <div class="card-row"><span class="label">Beat</span><span class="value">${beatNombre}</span></div>
    <div class="card-row"><span class="label">Licencia</span><span class="value">${licencia.toUpperCase()}</span></div>
    <div class="card-row"><span class="label">Monto</span><span class="value">USD $${monto}</span></div>
    <div class="card-row"><span class="label">Estado</span><span class="value cyan">✓ CONFIRMADO</span></div>
  </div>

  <a href="${linkDescarga}" class="btn">Descargar mi beat →</a>

  <p style="font-size:0.7rem;color:rgba(244,244,240,0.45);margin-bottom:0.5rem">
    ¿Perdiste el link? Guarda esta URL — funciona las veces que necesites:
  </p>
  <div class="link-box">${linkDescarga}</div>

  <p style="font-size:0.68rem;color:rgba(244,244,240,0.4);line-height:1.8">
    Para dudas sobre la licencia o si necesitas los stems escríbele a Nikko directamente:<br>
    📱 <a href="https://wa.me/573046455070" style="color:#2DD4CC">+57 3046455070</a>
  </p>

  <div class="footer">
    © 2026 Nikko Urza — Colombia · Música sin etiquetas<br>
    Token de compra: ${token.substring(0,16)}...
  </div>
</div></body></html>`;
}

function emailServicioTemplate({ nombre, monto, referencia }) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body{background:#080C0C;color:#F4F4F0;font-family:monospace;margin:0;padding:0}
  .wrap{max-width:560px;margin:0 auto;padding:2.5rem 2rem}
  .logo{font-size:1.4rem;letter-spacing:6px;color:#F4F4F0;margin-bottom:2rem}
  .logo span{color:#2DD4CC}
  h1{font-size:1.4rem;letter-spacing:3px;text-transform:uppercase;margin-bottom:0.5rem}
  p{font-size:0.75rem;color:rgba(244,244,240,0.6);line-height:1.8}
  a{color:#2DD4CC}
</style></head>
<body><div class="wrap">
  <div class="logo">NIKKO <span>URZA</span></div>
  <h1>✓ Pago recibido</h1>
  <p>Hola ${nombre}, tu pago de <strong>USD $${monto}</strong> fue confirmado.</p>
  <p>Nikko revisará tu proyecto y se pondrá en contacto en menos de 24 horas con el link de tu carpeta de Drive para subir los archivos.</p>
  <p>¿Tienes algo urgente? Escríbele directo:<br>
  📱 <a href="https://wa.me/573046455070">+57 3046455070</a></p>
  <p style="font-size:0.6rem;color:rgba(244,244,240,0.25);margin-top:2rem">
    Referencia: ${referencia}<br>© 2026 Nikko Urza — Colombia
  </p>
</div></body></html>`;
}
