# NIKKO URZA — Backend & Panel Admin
## Instrucciones de despliegue

---

## PASO 1 — Supabase: crear las tablas

1. Ve a https://supabase.com → tu proyecto
2. Menú izquierdo → **SQL Editor**
3. Copia y pega TODO el contenido de `supabase-schema.sql`
4. Haz clic en **Run**
5. Verás "Success" — las tablas ya están creadas

---

## PASO 2 — Vercel: subir el backend

1. Ve a https://vercel.com → Sign in with GitHub
2. Haz clic en **Add New Project**
3. Importa tu repositorio de GitHub (NikkoUrza/nikkourza)
4. En **Root Directory** deja vacío (o pon la raíz)
5. Haz clic en **Deploy**

### Variables de entorno (Settings → Environment Variables):
Agrégalas una por una exactamente así:

| Name | Value |
|------|-------|
| SUPABASE_URL | https://euaxqqdsxxzuwzauygtz.supabase.co |
| SUPABASE_ANON_KEY | eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (tu anon key completa) |
| RESEND_API_KEY | re_fmmBwfvW_Dn6KRbSkKfERv4m5KuBiihcR |
| EPAYCO_P_KEY | 2b56bcc5d88437e7b1604df412f693ce074a6c29 |
| EPAYCO_PUBLIC_KEY | 0eed8117a045f7001b7747c0434b56f1 |
| ADMIN_SECRET | nikko-admin-2026 |
| SITE_URL | https://nikkourza.vercel.app |

6. Después de agregar las variables, haz clic en **Redeploy**

---

## PASO 3 — ePayco: configurar webhook

1. Dashboard ePayco → **Configuración → Notificaciones**
2. URL de confirmación: `https://nikkourza.vercel.app/api/webhook-epayco`
3. URL de respuesta: `https://nikkourza.vercel.app/descarga`
4. Guardar

---

## PASO 4 — PayPal: configurar IPN

1. Ve a paypal.com → Settings → **Notifications → IPN**
2. Haz clic en "Choose IPN Settings"
3. URL: `https://nikkourza.vercel.app/api/webhook-paypal`
4. Selecciona "Receive IPN messages" → Save

---

## PASO 5 — Resend: verificar dominio (opcional pero recomendado)

1. Ve a resend.com → Domains → Add Domain
2. Agrega `nikkourza.com` (cuando tengas el dominio)
3. Por ahora los emails salen desde `noreply@nikkourza.com` vía Resend

---

## PASO 6 — Actualizar index.html

En tu `index.html`, busca y reemplaza:
```
https://nikkourza.vercel.app
```
por tu URL real de Vercel (te la da Vercel después del despliegue).

---

## PASO 7 — Actualizar la página de descarga

En `descarga.html`, línea con `API_URL`:
```javascript
var API_URL = 'https://nikkourza.vercel.app'; // ← actualiza con tu URL
```

---

## PASO 8 — Panel Admin

El panel admin está en `/admin/index.html`.
- **Contraseña por defecto:** `nikko-admin-2026`
- Cámbiala en la variable `ADMIN_PASS` del archivo
- También cámbiala en `ADMIN_SECRET` en Vercel

### Cómo agregar beats desde el panel:
1. Ve a `/admin/index.html` en tu navegador
2. Ingresa la contraseña
3. Haz clic en "Beats" → "Agregar Beat"
4. Llena: nombre, género, BPM, key, precios
5. Para el link de Drive:
   - Sube el archivo a tu Google Drive
   - Clic derecho → Compartir → Cualquiera con el enlace puede ver
   - Copia el link y pégalo en el campo correspondiente
6. Para la carátula: sube la imagen a Drive igual
7. Guarda — el beat aparece automáticamente en la tienda

---

## Estructura del proyecto

```
nikko-urza/
├── api/
│   ├── webhook-epayco.js   ← recibe pagos de ePayco
│   ├── webhook-paypal.js   ← recibe pagos de PayPal
│   ├── descarga.js         ← valida token y entrega beat
│   ├── beats.js            ← CRUD de beats
│   └── ventas.js           ← estadísticas admin
├── admin/
│   ├── index.html          ← panel de administración
│   ├── manifest.json
│   └── sw.js
├── Images/                 ← carátulas, logotipos y recursos visuales
├── beats/                  ← archivos de soporte de beats
├── index.html              ← tu web principal
├── index.css               ← estilos cyberpunk de la web principal
├── nikko-urza-landing.html ← landing/link in bio
├── landing.css             ← estilos neón del link in bio
├── cuenta.html             ← área de cliente
├── login.html              ← login de cliente
├── descarga.html           ← página de descarga post-pago
├── supabase-schema.sql     ← schema de base de datos
├── package.json
├── vercel.json
└── README.md
```

---

## Flujo completo de venta de beat

```
1. Cliente escucha preview en nikkourza.com
2. Hace clic en licencia (Basic/Premium/Exclusiva)
3. Se abre checkout ePayco o PayPal.me
4. Cliente paga
5. ePayco/PayPal → webhook → Vercel
6. Vercel verifica el pago → guarda en Supabase
7. Vercel → Resend → email al cliente con factura + link de descarga
8. Email a Nikko notificando la venta
9. Cliente hace clic en el link → descarga.html valida el token
10. Cliente descarga el beat desde Google Drive
```

---

## Soporte
WhatsApp: +57 3046455070
