// api/webhook-paypal.js
// Recibe IPN (Instant Payment Notification) de PayPal
// URL: https://tu-proyecto.vercel.app/api/webhook-paypal

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const crypto = require('crypto');
const fetch = require('node-fetch');
const crearCuentaCliente = require('./crear-cuenta');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);
const SITE_URL = process.env.SITE_URL || 'https://nikkourza.vercel.app';
const PAYPAL_EMAIL = 'nikkourza@gmail.com'; // tu email de PayPal

function generarToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Paso 1: Verificar IPN con PayPal
    const ipnBody = req.body;
    const verifyBody = 'cmd=_notify-validate&' + new URLSearchParams(ipnBody).toString();

    const paypalUrl = process.env.PAYPAL_SANDBOX === 'true'
      ? 'https://ipnpb.sandbox.paypal.com/cgi-bin/webscr'
      : 'https://ipnpb.paypal.com/cgi-bin/webscr';

    const verifyRes = await fetch(paypalUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: verifyBody
    });
    const verifyText = await verifyRes.text();

    if (verifyText !== 'VERIFIED') {
      console.error('PayPal IPN no verificado:', verifyText);
      return res.status(400).json({ error: 'IPN no verificado' });
    }

    // Paso 2: Validar datos del pago
    const {
      payment_status,
      receiver_email,
      mc_gross,
      mc_currency,
      payer_email,
      first_name,
      last_name,
      item_name,
      item_number, // usamos como referencia
      txn_id
    } = ipnBody;

    // Solo pagos completados al email correcto
    if (payment_status !== 'Completed') {
      return res.status(200).json({ status: 'ignored', payment_status });
    }
    if (receiver_email.toLowerCase() !== PAYPAL_EMAIL.toLowerCase()) {
      console.error('Email receptor incorrecto:', receiver_email);
      return res.status(400).json({ error: 'Receptor incorrecto' });
    }

    const email = payer_email;
    const nombre = `${first_name || ''} ${last_name || ''}`.trim() || 'Cliente';
    const monto = parseFloat(mc_gross);
    const referencia = item_number || txn_id;

    console.log('PayPal IPN verificado:', { email, nombre, monto, item_name, referencia });

    // Paso 3: Procesar según tipo
    if (referencia && referencia.startsWith('beat-')) {
      await procesarVentaBeatPayPal({
        referencia, email, nombre, monto,
        itemNombre: item_name,
        txnId: txn_id
      });
    } else {
      await procesarServicioPayPal({
        referencia, email, nombre, monto,
        itemNombre: item_name,
        txnId: txn_id
      });
    }

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('Error webhook PayPal:', err);
    res.status(500).json({ error: 'Error interno' });
  }
};

async function procesarVentaBeatPayPal({ referencia, email, nombre, monto, itemNombre, txnId }) {
  // Buscar venta existente o crear nueva
  let { data: venta } = await supabase
    .from('ventas')
    .select('*')
    .eq('referencia_pago', referencia)
    .single();

  const token = generarToken();

  if (!venta) {
    // Inferir licencia del item_name: "Noche Libre 808 — Lic. Basic"
    const licencia = itemNombre?.toLowerCase().includes('premium') ? 'premium'
      : itemNombre?.toLowerCase().includes('excl') ? 'exclusiva' : 'basic';

    const { data: nueva } = await supabase.from('ventas').insert({
      beat_nombre: itemNombre || 'Beat',
      licencia,
      monto_usd: monto,
      comprador_email: email,
      comprador_nombre: nombre,
      metodo_pago: 'paypal',
      referencia_pago: txnId,
      estado: 'confirmado',
      token_descarga: token
    }).select().single();
    venta = nueva;
  } else {
    await supabase.from('ventas').update({
      estado: 'confirmado',
      token_descarga: token,
      metodo_pago: 'paypal',
      referencia_pago: txnId,
      updated_at: new Date().toISOString()
    }).eq('id', venta.id);
    venta.token_descarga = token;
  }

  if (venta && !venta.email_enviado) {
    const linkDescarga = `${SITE_URL}/descarga?token=${token}`;

    const resCuenta = await crearCuentaCliente({
      email,
      nombre,
      ventaId: venta.id,
      beatNombre: venta.beat_nombre,
      licencia: venta.licencia,
      token
    });

    if (resCuenta.ok) {
      await supabase.from('ventas').update({ email_enviado: true }).eq('id', venta.id);
    } else {
      console.error('Error al procesar cuenta/email para la venta PayPal:', resCuenta.error);
      // Fallback: si falla crear la cuenta, enviar al menos el email normal de descarga
      await enviarEmailDescarga({
        email, nombre,
        beatNombre: venta.beat_nombre,
        licencia: venta.licencia,
        monto: venta.monto_usd,
        token,
        linkDescarga
      });
      await supabase.from('ventas').update({ email_enviado: true }).eq('id', venta.id);
    }
  }
}

async function procesarServicioPayPal({ referencia, email, nombre, monto, itemNombre, txnId }) {
  await supabase.from('servicios_contratados').insert({
    servicio: itemNombre || 'Servicio',
    monto_usd: monto,
    cliente_nombre: nombre,
    cliente_email: email,
    metodo_pago: 'paypal',
    referencia_pago: txnId,
    estado: 'confirmado'
  }).on('conflict', () => {});

  await resend.emails.send({
    from: 'Nikko Urza <noreply@nikkourza.com>',
    to: email,
    subject: '✓ Pago recibido — Tu proyecto está en camino',
    html: `<div style="background:#080C0C;color:#F4F4F0;font-family:monospace;padding:2rem;max-width:560px;margin:0 auto">
      <div style="font-size:1.4rem;letter-spacing:6px;margin-bottom:1.5rem">NIKKO <span style="color:#2DD4CC">URZA</span></div>
      <h2 style="letter-spacing:2px;text-transform:uppercase;font-size:1.2rem">✓ Pago confirmado</h2>
      <p style="font-size:0.75rem;color:rgba(244,244,244,0.6);line-height:1.8;margin-top:1rem">
        Hola ${nombre}, tu pago de <strong>USD $${monto}</strong> fue confirmado.<br>
        Nikko se pondrá en contacto en menos de 24 horas.<br><br>
        📱 <a href="https://wa.me/573046455070" style="color:#2DD4CC">+57 3046455070</a>
      </p>
    </div>`
  });

  await resend.emails.send({
    from: 'Web Nikko Urza <noreply@nikkourza.com>',
    to: 'nikkourza@gmail.com',
    subject: `💰 Nuevo servicio PayPal — $${monto} USD`,
    html: `<p>Servicio: <strong>${itemNombre}</strong><br>Cliente: ${nombre} (${email})<br>Monto: $${monto} USD</p>`
  });
}

async function enviarEmailDescarga({ email, nombre, beatNombre, licencia, monto, token, linkDescarga }) {
  await resend.emails.send({
    from: 'Nikko Urza <noreply@nikkourza.com>',
    to: email,
    subject: `✓ Tu beat está listo — ${beatNombre}`,
    html: `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body{background:#080C0C;color:#F4F4F0;font-family:monospace;margin:0;padding:0}
  .w{max-width:560px;margin:0 auto;padding:2.5rem 2rem}
  .logo{font-size:1.4rem;letter-spacing:6px;margin-bottom:2rem}
  h1{font-size:1.4rem;letter-spacing:3px;text-transform:uppercase;margin-bottom:0.5rem}
  .card{border:1px solid rgba(45,212,204,0.25);background:rgba(6,30,28,0.6);padding:1.3rem;margin:1.2rem 0}
  .row{display:flex;justify-content:space-between;padding:0.35rem 0;border-bottom:1px solid rgba(45,212,204,0.08);font-size:0.72rem}
  .row:last-child{border-bottom:none}
  .lbl{color:rgba(244,244,240,0.4)}
  .val{font-weight:700}
  .btn{display:block;background:#2DD4CC;color:#061E1C;text-decoration:none;padding:1rem 2rem;text-align:center;font-size:0.72rem;letter-spacing:3px;text-transform:uppercase;font-weight:700;margin:1.3rem 0}
  .lnk{border:1px solid rgba(45,212,204,0.2);padding:0.7rem;background:rgba(45,212,204,0.04);font-size:0.62rem;color:rgba(244,244,240,0.5);word-break:break-all}
  p{font-size:0.72rem;color:rgba(244,244,240,0.5);line-height:1.8}
  a{color:#2DD4CC}
  .ft{font-size:0.58rem;color:rgba(244,244,240,0.2);border-top:1px solid rgba(45,212,204,0.08);padding-top:1rem;margin-top:1.5rem}
</style></head>
<body><div class="w">
  <div class="logo">NIKKO <span style="color:#2DD4CC">URZA</span></div>
  <h1>¡Tu beat está listo!</h1>
  <p>Hola ${nombre}, tu compra fue confirmada con PayPal.</p>
  <div class="card">
    <div class="row"><span class="lbl">Beat</span><span class="val">${beatNombre}</span></div>
    <div class="row"><span class="lbl">Licencia</span><span class="val">${licencia.toUpperCase()}</span></div>
    <div class="row"><span class="lbl">Monto</span><span class="val">USD $${monto}</span></div>
    <div class="row"><span class="lbl">Estado</span><span class="val" style="color:#2DD4CC">✓ CONFIRMADO</span></div>
  </div>
  <a href="${linkDescarga}" class="btn">Descargar mi beat →</a>
  <p>¿Perdiste el link? Guárdalo — funciona siempre:</p>
  <div class="lnk">${linkDescarga}</div>
  <p>Dudas: 📱 <a href="https://wa.me/573046455070">+57 3046455070</a></p>
  <div class="ft">© 2026 Nikko Urza — Colombia · Token: ${token.substring(0,16)}...</div>
</div></body></html>`
  });

  await resend.emails.send({
    from: 'Web Nikko Urza <noreply@nikkourza.com>',
    to: 'nikkourza@gmail.com',
    subject: `💰 Beat vendido PayPal — ${beatNombre} $${monto} USD`,
    html: `<p>Beat: <strong>${beatNombre}</strong> (${licencia})<br>Cliente: ${nombre} (${email})<br>Monto: $${monto} USD</p>`
  });
}
