# Configuración de Supabase Auth (lista para marcar a mano)

Esta lista es la configuración del panel de Supabase que exige el [ADR-0005](../adr/0005-base-de-verificacion-acceso.md). Se marca **en cada proyecto**: primero en desarrollo y después en producción.

La hace Bernardo, o quien administre la cuenta de la empresa cliente. El agente no entra al panel ni escribe claves.

## Authentication › Sign In / Providers

- [ ] **Registro público: APAGADO.** Opción «Allow new users to sign up». Las cuentas nacen solo por invitación.
- [ ] **Ingreso anónimo: APAGADO.**
- [ ] **Proveedores externos (Google, Microsoft, etc.): APAGADOS.** Solo correo y clave.
- [ ] **Confirmar correo: ENCENDIDO.** Sin correo confirmado no hay rol (`auth_role()`).
- [ ] **Cambio de correo seguro: ENCENDIDO.** Opción «Secure email change». La app no tiene una pantalla para cambiar el propio correo.
- [ ] **Clave mínima: 10 caracteres**, sin exigir símbolos.
- [ ] **Bloqueo de claves filtradas: ENCENDIDO**, si el plan es Pro.

## Authentication › Multi-Factor

- [ ] **TOTP (app autenticadora): habilitado.** Es obligatorio para Administradores, y la base lo exige con `aal2`.

## Authentication › Sessions y JWT

- [ ] **Vencimiento del JWT: 1800 segundos** (30 minutos).
- [ ] **Rotación del token de renovación: ENCENDIDA.**
- [ ] Si el plan es Pro: el límite de sesión por inactividad queda **apagado** en el servidor. La app lo aplica por organización con `idle_timeout_minutes`.

## Authentication › URL Configuration

- [ ] **Site URL:** la URL exacta de producción, por ejemplo `https://dentihub.vercel.app` o el dominio propio.
- [ ] **Redirect URLs:** solo `https://<producción>/auth/confirmar` y `http://localhost:5173/auth/confirmar`.
- [ ] **Sin comodines.** Nada de `https://*.vercel.app`, porque permitiría redirigir a sitios ajenos. Las vistas previas de Vercel usan el proyecto de **desarrollo**.

## Authentication › Email (SMTP)

- [ ] **SMTP propio con el dominio de la empresa cliente**, por ejemplo `no-responder@empresa.cl`, con Resend o SendGrid. El servidor por defecto de Supabase envía muy pocos correos por hora y no sirve para producción.
- [ ] La empresa cliente configura en su DNS: **SPF, DKIM y DMARC**. Sin esto, los correos llegan a spam.
- [ ] **Vencimiento del enlace de correo: 86400 segundos** (24 horas). La invitación en la tabla dura 7 días, y reenviarla manda un enlace nuevo.

## Authentication › Email Templates (en español)

Las plantillas deben apuntar a la pantalla **A9**, que canjea el enlace con un botón y así sobrevive a los antivirus de correo. **No** deben usar `{{ .ConfirmationURL }}`.

**Invitación (Invite user):**

```html
<h2>Te invitaron a DentiHub</h2>
<p>Pulsa el botón para activar tu cuenta y crear tu clave. El enlace vence en 24 horas.</p>
<p><a href="{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=invite">Activar mi cuenta</a></p>
<p>Si no esperabas esta invitación, ignora este correo.</p>
```

**Recuperar clave (Reset password):**

```html
<h2>Crea una clave nueva</h2>
<p>Pulsa el botón para crear una clave nueva en DentiHub. El enlace vence en 24 horas.</p>
<p><a href="{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=recovery">Crear clave nueva</a></p>
<p>Si no lo pediste, ignora este correo: tu clave no cambia.</p>
```

## Authentication › Rate Limits

- [ ] Se mantienen los límites por defecto de correos, ingresos y verificación. No se suben sin una razón. Si aparecen ataques, se agrega CAPTCHA (Cloudflare Turnstile).

## Storage

- [ ] Las URL firmadas de las fotos de evidencia duran **60 segundos** y se generan cuando se van a mostrar. Lo aplica el código de Operación; aquí queda anotado para revisarlo.

## Funciones de servidor

- [ ] Se despliegan `invitar` y `bloquear-cuenta` (ver `starter-kit/supabase/functions/README.md`), con la variable `APP_URL` igual a la Site URL.

## Vercel (la app)

- [ ] En *Settings › Environment Variables* se cargan:
  - `VITE_DATA_SOURCE=supabase`;
  - `VITE_SUPABASE_URL`;
  - `VITE_SUPABASE_PUBLISHABLE_KEY`, que es la clave **pública**. La clave de servicio **nunca** va aquí.
- [ ] La carpeta raíz del proyecto es `app`.
