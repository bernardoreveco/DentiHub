# Prompt: construir la base de verificación (módulo Acceso)

**Cómo usarlo:** abre una sesión nueva de Claude Code en la carpeta de DentiHub y pega todo el bloque de abajo. Está escrito para que el agente principal reparta el trabajo entre los agentes del equipo (`.claude/agents/`) y te pida confirmación solo donde corresponde.

**Antes de empezar, conviene tener:**
- **El proyecto de Supabase de desarrollo creado.** Sin él, el trabajo avanza igual, pero no se puede probar contra una base real.
- **El proveedor de correo y el dominio de envío de la empresa cliente.** Sin ellos, las invitaciones funcionan solo en desarrollo.

---

```text
Eres el agente principal de DentiHub. Vas a construir la BASE DE VERIFICACIÓN de la app: el
módulo Acceso, que certifica quién es la persona, qué cuenta usa y si está habilitada, y entrega
el «contexto de acceso» al resto de la app.

## 0. Lee primero, en este orden (no adivines nada que esté escrito ahí)
1. CLAUDE.md y AGENTE.md (límites duros, regla de sincronización §8, equipo de agentes §12).
2. docs/adr/0005-base-de-verificacion-acceso.md: decisiones y los 14 hallazgos de la auditoría.
   Cada hallazgo debe quedar resuelto o explicado en tu informe final.
3. docs/modulos/01-acceso.md: las 10 pantallas (A1 a A9, más A2b), un flujo por pantalla, y
   los criterios de «Terminado cuando».
4. docs/modulos/README.md: el contrato «contexto de acceso».
5. Migraciones de la Etapa 1 en starter-kit/supabase/migrations/ (sin aplicar) y su guía de
   pruebas starter-kit/supabase/pruebas/etapa1-pruebas-rls.md.
6. app/: src/datos/fuente.ts (contrato), src/datos/demo.ts, src/modulos/acceso/, src/router.tsx.

## 1. Decisiones ya tomadas (no las reabras)
- Plataforma: Supabase + GitHub + Vercel. SPA con React 19 + Vite + TanStack (ADR-0004).
- Herramienta interna de UNA empresa cliente (se mantiene org_id, una organización).
- Ingreso con correo y clave; todos los técnicos tienen correo propio. Sin registro público.
- Verificación en dos pasos (TOTP) OBLIGATORIA SOLO PARA ADMINISTRADORES y exigida por la BASE:
  auth_role() devuelve NULL a un admin cuya sesión no es aal2.
- Invitaciones con tabla propia: el Administrador invita con correo + rol + áreas; al primer
  ingreso con correo confirmado, vincular_invitacion() asigna todo en una transacción.
- Enlaces de correo canjeados por botón (A9, verifyOtp con token_hash, flujo PKCE).
- Desactivar = admin_set_active + bloqueo en Auth (ban_duration) + cerrar sesiones.
- Correos desde el dominio de la empresa cliente (SMTP propio).
- Celulares mixtos: organizations.idle_timeout_minutes, vacío = apagado.
- Clave mínima de 10 caracteres; token de sesión de 30 minutos; comprobación del acceso al
  volver a la pestaña, cada 5 minutos y en cada onAuthStateChange.

## 2. Trabajo, por agente y en este orden

### 2.1 dh-datos: UNA migración nueva (prepararla, NUNCA ejecutarla)
Archivo: starter-kit/supabase/migrations/20261112120000_acceso_invitaciones_y_mi_acceso.sql,
con el molde starter-kit/supabase/plantilla-migracion.sql (encabezado en español con qué y por
qué, bloque de requisitos que aborta si faltan las migraciones de la Etapa 1, reversa manual
comentada al final). Contenido:
- Tabla invitations: id, org_id, email (guardado en minúsculas y sin espacios), role app_role,
  area_ids uuid[], invited_by, created_at, expires_at (now() + 7 días), sent_at, send_error,
  accepted_at, accepted_user_id, revoked_at, revoked_by. CHECK de estados coherentes.
  Índice único parcial (org_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL.
  RLS: solo Administradores de la misma organización leen. Nadie escribe directo: solo funciones.
  GRANT mínimos. Trigger audit_trigger().
- admin_create_invitation(p_email, p_role, p_area_ids) y admin_revoke_invitation(p_id):
  SECURITY DEFINER, SET search_path = public, exigen admin con aal2, validan que las áreas sean
  de su organización y rechazan un correo que ya es miembro activo. Devuelven el id. Auditan.
- admin_mark_invitation_sent(p_id, p_error): la usa solo la función de servidor (service_role).
- vincular_invitacion(): VOLATILE, SECURITY DEFINER. Toma auth.uid() y el correo de
  auth.users SOLO si email_confirmed_at no es nulo. Busca una invitación pendiente, vigente y no
  revocada para ese correo. Con bloqueo (FOR UPDATE), en UNA transacción, asigna org_id, el rol
  (actualizando la fila única de user_roles) y las áreas, marca accepted_at y audita.
  Idempotente: si ya está vinculada, no hace nada. Nunca mueve a alguien que ya tiene otra
  organización: eso es un error explícito.
- mi_acceso(): STABLE, SECURITY DEFINER. Devuelve UNA fila con user_id, nombre, org_id, rol,
  areas, habilitada, motivo, mfa_requerida y aal (de auth.jwt()). Motivos, en este orden fijo:
  correo_sin_confirmar → desactivada → sin_organizacion → sin_rol → requiere_dos_pasos.
  Solo lee datos de quien llama. Si no hay sesión, no devuelve filas.
- auth_role(): CREATE OR REPLACE para que devuelva NULL si el rol es admin y
  (auth.jwt() ->> 'aal') <> 'aal2'. Confirma que is_admin(), is_manager() y todas las políticas
  pasan por auth_role(); si alguna lee user_roles directo, corrígela en esta misma migración.
- organizations.idle_timeout_minutes integer NULL CHECK (entre 5 y 720).
- Toda función SECURITY DEFINER: REVOKE EXECUTE FROM PUBLIC, anon; GRANT solo a quien la usa.
- Agrega a la guía de pruebas una sección «Acceso» con casos SQL que simulen cada motivo de
  mi_acceso, un admin aal1 contra aal2, una invitación vencida, revocada y doble, el correo sin
  confirmar, un intento de vincular a alguien de otra organización y la desactivación.

### 2.2 dh-datos: dos funciones de servidor de Supabase (Edge Functions, Deno)
En starter-kit/supabase/functions/:
- invitar/: recibe { email, role, area_ids } con el JWT de la persona. Verifica, con un cliente
  creado con ESE JWT, que es admin con aal2 (llamando a mi_acceso). Llama a
  admin_create_invitation. Con la clave de servicio (variable de entorno, nunca en el código)
  ejecuta auth.admin.inviteUserByEmail con redirectTo = <APP_URL>/auth/confirmar. Si la cuenta
  ya existe en Auth, envía en su lugar un enlace de recuperación. Registra el resultado con
  admin_mark_invitation_sent. Responde errores sin filtrar detalles internos. Acepta reenviar.
- bloquear-cuenta/: recibe { user_id, activa }. Verifica admin aal2, llama a admin_set_active
  con el JWT de quien llama (para que la base valide y audite), y después, con la clave de
  servicio, aplica ban_duration (al desactivar) o lo quita (al activar) y cierra las sesiones.
  Si el bloqueo de Auth falla, la cuenta igual queda desactivada en la base: avisa del fallo
  parcial y deja que se reintente.
- Comprueba los encabezados CORS solo para la URL de la app. Usa variables APP_URL,
  SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY y documenta sus nombres en un README de la carpeta.

### 2.3 dh-frontend: la fuente Supabase y las pantallas
- app/src/lib/supabase.ts: cliente con flowType "pkce", persistSession y autoRefreshToken. Que
  NO lance un error al importarse si faltan variables: la app debe seguir funcionando en modo demo.
- app/src/datos/supabase.ts: implementa la parte de acceso de FuenteDatos (ingresar, salir,
  acceso con vincular_invitacion() + mi_acceso(), y Personas o Administración con invitar,
  revocar y activar/desactivar mediante las funciones de servidor). Lo que todavía no exista en
  la base (tareas) debe lanzar ErrorDeRegla con un mensaje claro, nunca devolver datos falsos.
- app/src/datos/fuente.ts: elige la fuente así: VITE_DATA_SOURCE=supabase y variables presentes
  → supabase; cualquier otro caso → demo. El encabezado debe seguir mostrando «Modo demo»
  cuando corresponda.
- Amplía ContextoAcceso con los motivos correo_sin_confirmar y requiere_dos_pasos, más
  mfa_requerida y aal. Ajusta la fuente demo para que siga cumpliendo el contrato.
- Pantallas en app/src/modulos/acceso/, una por archivo y siguiendo EXACTAMENTE los flujos de
  01-acceso.md: Ingreso (A1, correo y clave en modo supabase; selector de cuentas en modo demo),
  Verificacion (A2), ActivarVerificacion (A2b, con QR), ComprobandoAcceso (A3: reintentos con
  espera creciente, nunca A4 por un error de red), SinAcceso (A4, 4 variantes y «Volver a
  comprobar»), RecuperarClave (A5, mensaje fijo), ClaveNueva (A6), ConfirmarEnlace (A9, ruta
  /auth/confirmar; el código se canjea SOLO al pulsar el botón) y el cierre de sesión (A8).
- useAcceso(): llave ["acceso", userId]; se invalida en onAuthStateChange, al volver a la
  pestaña y cada 5 minutos. Un error de red conserva la pantalla actual con un aviso; una
  denegación lleva a A4.
- Cierre por inactividad si idle_timeout_minutes tiene valor. Cerrar sesión borra la caché, el
  almacenamiento propio de la app (prefijo dentihub-) y, si hay fotos sin subir, avisa antes.
- Administración › Personas: botón «Invitar persona» (correo, rol y áreas), lista de
  invitaciones con su estado (pendiente, enviada, error de envío, aceptada, vencida, revocada)
  y las acciones Reenviar y Revocar.
- Textos en español de Chile con tuteo, componentes del kit, solo tokens de color, celular primero.

### 2.4 dh-arquitecto: procedimientos y configuración
En docs/operacion/ escribe:
- arranque.md: crear la organización y el primer Administrador (SQL revisado, para que lo
  ejecute Bernardo), e inscribir su verificación en dos pasos. Exige al menos DOS Administradores
  activos con 2FA antes de salir a producción.
- recuperar-administrador.md: el Administrador perdió su teléfono. Quién puede quitarle los
  factores (otro Administrador o el propietario), cómo se audita y cómo vuelve a A2b.
- configuracion-supabase-auth.md: lista que se marca a mano en el panel:
  - registro público APAGADO;
  - ingreso anónimo APAGADO;
  - proveedores externos APAGADOS;
  - cambio de correo seguro y sin pantalla para cambiarlo;
  - clave mínima de 10 caracteres;
  - bloqueo de claves filtradas (si es Pro);
  - MFA TOTP activado;
  - JWT de 1800 segundos;
  - vencimiento del enlace de correo de 86400 segundos (24 horas; ADR-0005, punto 9);
  - URL del sitio y URLs de redirección EXACTAS: producción y localhost, sin comodines de vistas
    previas de Vercel;
  - SMTP propio con el dominio de la empresa cliente, más SPF, DKIM y DMARC;
  - plantillas de correo en español para invitación y recuperación, que apunten a
    {{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=invite|recovery;
  - límites de intentos;
  - URLs firmadas de Storage de 60 segundos.

### 2.5 dh-revisor y dh-sincronizador
- dh-revisor revisa TODO lo anterior antes de cerrar: RLS y GRANT, funciones SECURITY DEFINER,
  aal2 exigido en la base, que no se filtre si un correo existe, que no haya claves en el código,
  y los textos y el diseño. Corrige lo que encuentre y vuelve a revisar.
- dh-sincronizador aplica la regla de sincronización: BASE-DEL-PRODUCTO.md (flujo 3 y sección
  de datos), roles.ts si cambia algo, la demo si corresponde, CLAUDE.md y el verificador.

## 3. Verificación obligatoria antes de decir «terminado»
- npm --prefix app run typecheck y npm --prefix app run build sin errores.
- node scripts/verificar-sincronizacion.mjs y node scripts/generar-html-diagramas.mjs.
- La app en modo demo sigue funcionando igual (pruébala en el navegador).
- Si Bernardo confirmó y existe el proyecto de desarrollo: aplica la migración SOLO ahí, corre la
  guía de pruebas completa y recorre en el navegador los 8 criterios de «Terminado cuando» de
  01-acceso.md. Si no, deja cada criterio marcado como «no verificado» y explica por qué.

## 4. Límites (no se negocian)
- No ejecutes SQL en ningún Supabase sin la confirmación explícita de Bernardo en ese momento.
  Nunca toques los proyectos de inventario de Dentimagen.
- No crees cuentas, proyectos, claves ni configuraciones de Supabase o Vercel. Prepáralas y pide
  que las haga Bernardo.
- No escribas, pidas ni repitas claves o tokens. Solo los NOMBRES de las variables, en
  .env.example y en los README.
- No hagas commit ni push sin confirmación. No borres archivos sin confirmación.
- Si un flujo de 01-acceso.md resulta imposible o inseguro tal como está, detente, explica el
  problema y propón el cambio. No lo cambies por tu cuenta.

## 5. Informe final (en español, corto)
1. Al INICIO y muy visible: la migración nueva y las funciones de servidor, y que NO se aplicaron.
2. Tabla de los 14 hallazgos del ADR-0005: resuelto / dónde / cómo se probó.
3. ✅ Verificado y ⚠ no verificado, separados.
4. Listas Sincronizado y Pendiente de sincronizar.
5. Lo que debe hacer Bernardo, en orden (configuración del panel, SMTP y DNS, arranque).
6. Mensaje de commit sugerido.
```
