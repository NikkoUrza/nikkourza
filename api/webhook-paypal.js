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
const PAYPAL_EMAIL = 'nikkourzamusic@gmail.com'; // tu email de PayPal

function generarToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Validar configuración crítica de Supabase en producción
  if (!process.env.SUPABASE_SERVICE_KEY) {
    console.error('CRITICAL CONFIG ERROR: SUPABASE_SERVICE_KEY variable is missing in Vercel environment variables. Webhook confirmations will fail due to RLS policies.');
    return res.status(500).json({ error: 'Configuración del servidor incompleta (falta SUPABASE_SERVICE_KEY)' });
  }

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
    } else if (referencia && referencia.startsWith('cart-')) {
      await procesarVentaCarritoPayPal({
        referencia, email, nombre, monto,
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

    const cleanNombre = itemNombre ? itemNombre.split(' — ')[0] : 'Beat';
    let beatId = null;
    let beatNombre = cleanNombre;
    try {
      const { data: b } = await supabase.from('beats').select('*').eq('nombre', cleanNombre).limit(1).maybeSingle();
      if (b) {
        beatId = b.id;
        beatNombre = b.nombre;
      }
    } catch (e) {
      console.error('Error buscando beat por nombre en PayPal webhook:', e);
    }

    const { data: nueva } = await supabase.from('ventas').insert({
      beat_id: beatId,
      beat_nombre: beatNombre,
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
    from: 'Nikko Urza <info@nikkourza.com>',
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
    from: 'Web Nikko Urza <info@nikkourza.com>',
    to: 'nikkourzamusic@gmail.com',
    subject: `💰 Nuevo servicio PayPal — $${monto} USD`,
    html: `<p>Servicio: <strong>${itemNombre}</strong><br>Cliente: ${nombre} (${email})<br>Monto: $${monto} USD</p>`
  });
}

async function enviarEmailDescarga({ email, nombre, beatNombre, licencia, monto, token, linkDescarga }) {
  await resend.emails.send({
    from: 'Nikko Urza <info@nikkourza.com>',
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
    from: 'Web Nikko Urza <info@nikkourza.com>',
    to: 'nikkourzamusic@gmail.com',
    subject: `💰 Beat vendido PayPal — ${beatNombre} $${monto} USD`,
    html: `<p>Beat: <strong>${beatNombre}</strong> (${licencia})<br>Cliente: ${nombre} (${email})<br>Monto: $${monto} USD</p>`
  });
}

async function procesarVentaCarritoPayPal({ referencia, email, nombre, monto, txnId }) {
  console.log(`Procesando venta carrito PayPal para la referencia: ${referencia}, txnId: ${txnId}`);

  // 1. Buscar todas las ventas pendientes de este carrito en Supabase
  const { data: ventas, error } = await supabase
    .from('ventas')
    .select('*, beats(*)')
    .eq('referencia_pago', referencia)
    .eq('estado', 'pendiente');

  if (error) {
    console.error('Error recuperando ventas del carrito en PayPal webhook:', error);
    throw error;
  }

  if (!ventas || ventas.length === 0) {
    console.log('No se encontraron ventas pendientes para el carrito en PayPal:', referencia);
    return;
  }

  const ventasProcesadas = [];

  // 2. Confirmar cada una de las ventas y generar sus tokens de descarga individuales
  for (const venta of ventas) {
    const token = generarToken();
    const { data: ventaConfirmada, error: updateError } = await supabase
      .from('ventas')
      .update({
        estado: 'confirmado',
        token_descarga: token,
        metodo_pago: 'paypal',
        referencia_pago: txnId, // Guardar el ID de transacción real de PayPal
        updated_at: new Date().toISOString()
      })
      .eq('id', venta.id)
      .select('*, beats(*)')
      .single();

    if (updateError) {
      console.error(`Error confirmando venta ${venta.id} del carrito en PayPal:`, updateError);
      continue;
    }

    ventasProcesadas.push(ventaConfirmada);
  }

  if (ventasProcesadas.length === 0) {
    console.error('No se pudo procesar ninguna venta del carrito en PayPal');
    return;
  }

  // 3. Crear cuenta de cliente (omitir correo individual y retornar link de activación)
  const primerItem = ventasProcesadas[0];
  const resCuenta = await crearCuentaCliente({
    email,
    nombre,
    ventaId: primerItem.id,
    beatNombre: primerItem.beats?.nombre || primerItem.beat_nombre,
    licencia: primerItem.licencia,
    token: primerItem.token_descarga,
    omitirEmail: true
  });

  const linkActivacion = resCuenta.ok ? resCuenta.linkActivacion : null;
  const esCuentaNueva = resCuenta.ok ? resCuenta.esCuentaNueva : false;

  // 4. Enviar un único correo consolidado con todos los beats y descargas
  await enviarEmailCarritoDescargaPayPal({
    email,
    nombre,
    ventas: ventasProcesadas,
    montoTotal: monto,
    referencia: txnId,
    linkActivacion,
    esCuentaNueva
  });

  // 5. Marcar todos los registros procesados en Supabase como enviados
  const ids = ventasProcesadas.map(v => v.id);
  await supabase.from('ventas').update({ email_enviado: true }).in('id', ids);
}

async function enviarEmailCarritoDescargaPayPal({ email, nombre, ventas, montoTotal, referencia, linkActivacion, esCuentaNueva }) {
  const linkBase = `${SITE_URL}/descarga`;
  
  const itemsHTML = ventas.map(v => {
    const beatNombre = v.beats?.nombre || v.beat_nombre;
    const linkDescarga = `${linkBase}?token=${v.token_descarga}`;
    return `
      <div style="border-bottom:1px solid rgba(45,212,204,0.12);padding:1.1rem 0;margin-bottom:0.4rem">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.7rem">
          <div>
            <strong style="color:#F4F4F0;font-size:0.85rem">${beatNombre.toUpperCase()}</strong>
            <span style="display:block;font-size:0.58rem;color:rgba(244,244,240,0.4);margin-top:2px;letter-spacing:1px">LICENCIA ${v.licencia.toUpperCase()}</span>
          </div>
          <span style="color:#2DD4CC;font-size:0.8rem;font-weight:700">$${v.monto_usd} USD</span>
        </div>
        <a href="${linkDescarga}" style="display:inline-block;background:#2DD4CC;color:#061E1C;text-decoration:none;padding:0.5rem 1rem;font-size:0.6rem;letter-spacing:2px;text-transform:uppercase;font-weight:700">↓ Descargar Beat</a>
      </div>
    `;
  }).join('');

  await resend.emails.send({
    from: 'Nikko Urza <info@nikkourza.com>',
    to: email,
    subject: `✓ ¡Tus beats están listos! — ${ventas.length} Beats Adquiridos (PayPal)`,
    html: emailCarritoTemplatePayPal({ nombre, itemsHTML, montoTotal, referencia, linkActivacion, esCuentaNueva })
  });

  // Copia de notificación para Nikko
  const listaNombres = ventas.map(v => `${v.beats?.nombre || v.beat_nombre} (${v.licencia})`).join(', ');
  await resend.emails.send({
    from: 'Web Nikko Urza <info@nikkourza.com>',
    to: 'nikkourzamusic@gmail.com',
    subject: `💰 Nueva venta de Carrito PayPal — $${montoTotal} USD`,
    html: `<p>Venta de Carrito por <strong>${nombre}</strong> (${email}).<br>Beats: <strong>${listaNombres}</strong><br>Monto Total: $${montoTotal} USD<br>Referencia: ${referencia}</p>`
  });
}

function emailCarritoTemplatePayPal({ nombre, itemsHTML, montoTotal, referencia, linkActivacion, esCuentaNueva }) {
  let accountBoxHTML = '';
  
  if (esCuentaNueva && linkActivacion) {
    accountBoxHTML = `
      <div style="border:1px solid rgba(45,212,204,0.3);background:rgba(45,212,204,0.05);padding:1.3rem;margin:1.8rem 0 1.2rem 0">
        <p style="font-size:0.7rem;letter-spacing:2px;text-transform:uppercase;color:#2DD4CC;margin-top:0;margin-bottom:0.5rem;font-weight:700">🔐 Activa tu cuenta Nikko Urza</p>
        <p style="font-size:0.68rem;color:rgba(244,244,240,0.55);line-height:1.8;margin:0 0 1.2rem 0">
          Te creamos una cuenta para que puedas acceder a todas tus licencias y contratos en cualquier momento sin depender del email.<br><br>
          El link expira en 24 horas. Haz clic para elegir tu contraseña y activar tu cuenta:
        </p>
        <a href="${linkActivacion}" style="display:block;text-align:center;background:transparent;border:2px solid #2DD4CC;color:#2DD4CC;text-decoration:none;padding:0.85rem 2rem;font-size:0.65rem;letter-spacing:3px;text-transform:uppercase;font-weight:700">Activar mi cuenta →</a>
      </div>
    `;
  } else {
    accountBoxHTML = `
      <div style="border:1px solid rgba(45,212,204,0.22);background:rgba(6,30,28,0.3);padding:1.3rem;margin:1.8rem 0 1.2rem 0">
        <p style="font-size:0.7rem;letter-spacing:2px;text-transform:uppercase;color:#2DD4CC;margin-top:0;margin-bottom:0.5rem;font-weight:700">🔐 Panel de Cliente Activo</p>
        <p style="font-size:0.68rem;color:rgba(244,244,240,0.55);line-height:1.8;margin:0 0 1.2rem 0">
          Tus nuevos beats ya están vinculados a tu cuenta. Ingresa a tu panel para descargar tus archivos de audio y contratos en cualquier momento.
        </p>
        <a href="${SITE_URL}/login.html" style="display:block;text-align:center;background:transparent;border:2px solid #2DD4CC;color:#2DD4CC;text-decoration:none;padding:0.85rem 2rem;font-size:0.65rem;letter-spacing:3px;text-transform:uppercase;font-weight:700">Ir a mi Cuenta →</a>
      </div>
    `;
  }

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
  .footer{font-size:0.6rem;color:rgba(244,244,240,0.25);line-height:1.8;border-top:1px solid rgba(45,212,204,0.1);padding-top:1.2rem;margin-top:2rem}
  a{color:#2DD4CC}
</style></head>
<body><div class="wrap">
  <div class="logo">NIKKO <span>URZA</span></div>
  <h1>¡Tus beats están listos!</h1>
  <p class="sub">Hola ${nombre}, tu compra fue confirmada con éxito. Aquí tienes los accesos para tus descargas.</p>

  <div class="card" style="padding-top:0.5rem;padding-bottom:0.5rem">
    ${itemsHTML}
  </div>

  <p style="font-size:0.68rem;color:rgba(244,244,240,0.4);line-height:1.8;margin-top:1rem">
    Puedes guardar este correo electrónico para acceder a las descargas cuando lo necesites.
  </p>

  ${accountBoxHTML}

  <p style="font-size:0.68rem;color:rgba(244,244,240,0.4);line-height:1.8;margin-top:1.5rem">
    ¿Dudas sobre tus licencias? Escríbele a Nikko:<br>
    📱 <a href="https://wa.me/573046455070" style="color:#2DD4CC">+57 3046455070</a>
  </p>

  <div class="footer">
    © 2026 Nikko Urza — Colombia · Música sin etiquetas<br>
    Transacción PayPal: ${referencia}
  </div>
</div></body></html>`;
}
