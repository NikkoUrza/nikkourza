// api/crear-cuenta.js
// Llamado por el webhook después de confirmar el pago
// Crea la cuenta del cliente si no existe y vincula la compra

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

// Cliente con SERVICE ROLE para operaciones admin (crear usuarios)
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // ← agrega esta variable en Vercel
);

const resend = new Resend(process.env.RESEND_API_KEY);
const SITE_URL = process.env.SITE_URL || 'https://nikkourza.com';

module.exports = async function crearCuentaCliente({ email, nombre, ventaId, beatNombre, licencia, token, omitirEmail = false }) {
  try {
    // 1. Verificar si ya tiene cuenta
    const { data: usuariosExistentes } = await supabaseAdmin.auth.admin.listUsers();
    const usuarioExistente = usuariosExistentes?.users?.find(u => u.email === email);

    let userId = usuarioExistente?.id;
    let esCuentaNueva = false;

    if (!usuarioExistente) {
      // 2. Crear cuenta automáticamente
      const { data: nuevoUsuario, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: false, // necesita confirmar via link
        user_metadata: { nombre }
      });

      if (error) {
        console.error('Error creando usuario:', error);
        return { ok: false, error: error.message };
      }

      userId = nuevoUsuario.user.id;
      esCuentaNueva = true;
    }

    // 3. Vincular la venta al cliente
    if (ventaId && userId) {
      await supabaseAdmin
        .from('ventas')
        .update({ cliente_id: userId })
        .eq('id', ventaId);
    }

    // 4. Vincular ventas anteriores con el mismo email
    await supabaseAdmin.rpc('vincular_ventas_por_email', {
      user_id: userId,
      user_email: email
    });

    let linkActivacion = null;

    // 5. Si es cuenta nueva, generar link de activación
    if (esCuentaNueva) {
      const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: {
          redirectTo: `${SITE_URL}/cuenta.html?activar=1`
        }
      });

      linkActivacion = linkData?.properties?.action_link;
    }

    // Si omitirEmail es true, saltamos el envío de correos individuales y retornamos los datos
    if (omitirEmail) {
      return { ok: true, userId, esCuentaNueva, linkActivacion };
    }

    // 6. Si es cuenta nueva, enviar email con beat + activación de cuenta
    if (esCuentaNueva) {
      await resend.emails.send({
        from: 'Nikko Urza <noreply@nikkourza.com>',
        to: email,
        subject: `✓ Tu beat está listo — ${beatNombre} · Activa tu cuenta`,
        html: emailBeatConCuenta({ nombre, beatNombre, licencia, token, linkActivacion, linkDescarga: `${SITE_URL}/descarga.html?token=${token}` })
      });
    } else {
      // 6. Email con beat para cliente con cuenta existente
      await resend.emails.send({
        from: 'Nikko Urza <noreply@nikkourza.com>',
        to: email,
        subject: `✓ Tu beat está listo — ${beatNombre}`,
        html: emailBeatCompradorExistente({ nombre, beatNombre, licencia, token, linkDescarga: `${SITE_URL}/descarga.html?token=${token}` })
      });
    }

    return { ok: true, userId, esCuentaNueva, linkActivacion };

  } catch (err) {
    console.error('Error en crearCuentaCliente:', err);
    return { ok: false, error: err.message };
  }
};

function emailBeatCompradorExistente({ nombre, beatNombre, licencia, token, linkDescarga }) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#080C0C;color:#F4F4F0;font-family:'Space Mono',monospace,sans-serif}
  .w{max-width:560px;margin:0 auto;padding:2.5rem 2rem}
  .logo{font-family:Arial,sans-serif;font-size:1.3rem;letter-spacing:6px;font-weight:900;margin-bottom:2rem}
  .logo span{color:#2DD4CC}
  h1{font-size:1.4rem;letter-spacing:3px;text-transform:uppercase;margin-bottom:0.4rem}
  .sub{font-size:0.72rem;color:rgba(244,244,240,0.5);line-height:1.8;margin-bottom:1.5rem}
  .card{border:1px solid rgba(45,212,204,0.22);background:rgba(6,30,28,0.6);padding:1.3rem;margin-bottom:1.2rem}
  .row{display:flex;justify-content:space-between;padding:0.32rem 0;border-bottom:1px solid rgba(45,212,204,0.07);font-size:0.72rem}
  .row:last-child{border-bottom:none}
  .lbl{color:rgba(244,244,240,0.38)}
  .val{font-weight:700}
  .val.ok{color:#2DD4CC}
  .btn{display:block;text-align:center;padding:0.95rem 2rem;font-family:monospace;font-size:0.68rem;letter-spacing:3px;text-transform:uppercase;font-weight:700;text-decoration:none;margin:0.7rem 0;transition:background 0.2s}
  .btn-dl{background:#2DD4CC;color:#061E1C}
  .btn-acc{background:transparent;border:2px solid #2DD4CC;color:#2DD4CC}
  .divider{height:1px;background:rgba(45,212,204,0.12);margin:1.5rem 0}
  .account-box{border:1px solid rgba(45,212,204,0.3);background:rgba(45,212,204,0.05);padding:1.3rem;margin:1.2rem 0}
  .account-title{font-size:0.7rem;letter-spacing:2px;text-transform:uppercase;color:#2DD4CC;margin-bottom:0.5rem}
  .account-text{font-size:0.68rem;color:rgba(244,244,240,0.55);line-height:1.8}
  .link-box{border:1px solid rgba(45,212,204,0.18);padding:0.7rem 0.9rem;background:rgba(45,212,204,0.04);font-size:0.6rem;color:rgba(244,244,244,0.45);word-break:break-all;margin:0.6rem 0}
  .note{font-size:0.6rem;color:rgba(244,244,240,0.25);line-height:1.7}
  .ft{font-size:0.56rem;color:rgba(244,244,240,0.18);border-top:1px solid rgba(45,212,204,0.08);padding-top:1rem;margin-top:2rem}
  a{color:#2DD4CC}
</style></head>
<body><div class="w">

  <div class="logo">NIKKO <span>URZA</span></div>
  <h1>¡Tu beat está listo!</h1>
  <p class="sub">Hola ${nombre}, tu compra fue confirmada. El beat ha sido agregado a tu cuenta existente.</p>

  <div class="card">
    <div class="row"><span class="lbl">Beat</span><span class="val">${beatNombre}</span></div>
    <div class="row"><span class="lbl">Licencia</span><span class="val">${licencia.toUpperCase()}</span></div>
    <div class="row"><span class="lbl">Estado</span><span class="val ok">✓ CONFIRMADO</span></div>
  </div>

  <a href="${linkDescarga}" class="btn btn-dl">↓ Descargar mi Beat</a>

  <p class="note" style="margin-bottom:0.5rem">Link permanente de descarga (guárdalo):</p>
  <div class="link-box">${linkDescarga}</div>

  <div class="divider"></div>

  <div class="account-box">
    <p class="account-title">🔐 Tu Cuenta está Activa</p>
    <p class="account-text">
      Tu nueva licencia ya está vinculada a tu perfil. Ingresa a tu panel de cliente para descargar todos tus beats y contratos comprados.
    </p>
    <a href="${SITE_URL}/login.html" class="btn btn-acc">Ir a mi Cuenta →</a>
  </div>

  <p style="font-size:0.68rem;color:rgba(244,244,240,0.4);line-height:1.8;margin-top:1rem">
    ¿Dudas sobre la licencia? Escríbele a Nikko:<br>
    📱 <a href="https://wa.me/573046455070">+57 3046455070</a>
  </p>

  <div class="ft">
    © 2026 Nikko Urza — Colombia · Música sin etiquetas<br>
    Token: ${token ? token.substring(0,16) : '—'}...
  </div>

</div></body></html>`;
}

function emailBeatConCuenta({ nombre, beatNombre, licencia, token, linkActivacion, linkDescarga }) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#080C0C;color:#F4F4F0;font-family:'Space Mono',monospace,sans-serif}
  .w{max-width:560px;margin:0 auto;padding:2.5rem 2rem}
  .logo{font-family:Arial,sans-serif;font-size:1.3rem;letter-spacing:6px;font-weight:900;margin-bottom:2rem}
  .logo span{color:#2DD4CC}
  h1{font-size:1.4rem;letter-spacing:3px;text-transform:uppercase;margin-bottom:0.4rem}
  .sub{font-size:0.72rem;color:rgba(244,244,240,0.5);line-height:1.8;margin-bottom:1.5rem}
  .card{border:1px solid rgba(45,212,204,0.22);background:rgba(6,30,28,0.6);padding:1.3rem;margin-bottom:1.2rem}
  .row{display:flex;justify-content:space-between;padding:0.32rem 0;border-bottom:1px solid rgba(45,212,204,0.07);font-size:0.72rem}
  .row:last-child{border-bottom:none}
  .lbl{color:rgba(244,244,240,0.38)}
  .val{font-weight:700}
  .val.ok{color:#2DD4CC}
  .btn{display:block;text-align:center;padding:0.95rem 2rem;font-family:monospace;font-size:0.68rem;letter-spacing:3px;text-transform:uppercase;font-weight:700;text-decoration:none;margin:0.7rem 0;transition:background 0.2s}
  .btn-dl{background:#2DD4CC;color:#061E1C}
  .btn-acc{background:transparent;border:2px solid #2DD4CC;color:#2DD4CC}
  .divider{height:1px;background:rgba(45,212,204,0.12);margin:1.5rem 0}
  .account-box{border:1px solid rgba(45,212,204,0.3);background:rgba(45,212,204,0.05);padding:1.3rem;margin:1.2rem 0}
  .account-title{font-size:0.7rem;letter-spacing:2px;text-transform:uppercase;color:#2DD4CC;margin-bottom:0.5rem}
  .account-text{font-size:0.68rem;color:rgba(244,244,240,0.55);line-height:1.8}
  .link-box{border:1px solid rgba(45,212,204,0.18);padding:0.7rem 0.9rem;background:rgba(45,212,204,0.04);font-size:0.6rem;color:rgba(244,244,244,0.45);word-break:break-all;margin:0.6rem 0}
  .note{font-size:0.6rem;color:rgba(244,244,240,0.25);line-height:1.7}
  .ft{font-size:0.56rem;color:rgba(244,244,240,0.18);border-top:1px solid rgba(45,212,204,0.08);padding-top:1rem;margin-top:2rem}
  a{color:#2DD4CC}
</style></head>
<body><div class="w">

  <div class="logo">NIKKO <span>URZA</span></div>
  <h1>¡Tu beat está listo!</h1>
  <p class="sub">Hola ${nombre}, tu compra fue confirmada. Descarga tu beat y activa tu cuenta para acceder a tus licencias siempre.</p>

  <div class="card">
    <div class="row"><span class="lbl">Beat</span><span class="val">${beatNombre}</span></div>
    <div class="row"><span class="lbl">Licencia</span><span class="val">${licencia.toUpperCase()}</span></div>
    <div class="row"><span class="lbl">Estado</span><span class="val ok">✓ CONFIRMADO</span></div>
  </div>

  <a href="${linkDescarga}" class="btn btn-dl">↓ Descargar mi Beat</a>

  <p class="note" style="margin-bottom:0.5rem">Link permanente de descarga (guárdalo):</p>
  <div class="link-box">${linkDescarga}</div>

  <div class="divider"></div>

  <div class="account-box">
    <p class="account-title">🔐 Activa tu cuenta Nikko Urza</p>
    <p class="account-text">
      Te creamos una cuenta para que puedas acceder a todas tus licencias en cualquier momento, sin depender del email.<br><br>
      El link expira en <strong>24 horas</strong>. Haz clic para elegir tu contraseña y activar tu cuenta.
    </p>
    <a href="${linkActivacion}" class="btn btn-acc">Activar mi cuenta →</a>
    <p class="note">Si no ves el botón, copia este link en tu navegador:</p>
    <div class="link-box">${linkActivacion}</div>
  </div>

  <p style="font-size:0.68rem;color:rgba(244,244,240,0.4);line-height:1.8;margin-top:1rem">
    ¿Dudas sobre la licencia? Escríbele a Nikko:<br>
    📱 <a href="https://wa.me/573046455070">+57 3046455070</a>
  </p>

  <div class="ft">
    © 2026 Nikko Urza — Colombia · Música sin etiquetas<br>
    Token: ${token ? token.substring(0,16) : '—'}...
  </div>

</div></body></html>`;
}
