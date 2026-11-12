# ADR-0005: Base de verificación (módulo Acceso) resistente

**Estado:** Aceptado. Las decisiones 1 a 4 son de Bernardo (2026-11-12); el resto son supuestos razonables, marcados como tales.
**Fecha:** 2026-11-12
**Decide:** Bernardo

## Contexto

El módulo Acceso ([01-acceso.md](../modulos/01-acceso.md)) certifica tres cosas: quién es la persona, qué cuenta usa y si está habilitada. Entrega el «contexto de acceso» al resto de la app (ADR-0003).

El primer flujo era correcto en lo básico: no hay registro abierto, el sistema niega el acceso por defecto (fail-closed) y los mensajes no revelan si un correo existe. Al auditarlo contra fallas reales de Supabase Auth y del trabajo en terreno aparecieron **14 puntos débiles**. Todos quedan corregidos en el flujo nuevo, y el [prompt de construcción](../prompts/01-base-de-verificacion.md) exige informar cada uno al terminar.

## Auditoría: qué fallaba y cómo se corrige

| # | Punto débil | Qué pasaría | Corrección adoptada |
|---|---|---|---|
| 1 | La invitación creaba la cuenta **sin organización ni rol**, y el Administrador la asignaba a mano después | La persona quedaba esperando en «sin organización». Además, el Administrador podía asignar a la cuenta equivocada, porque nada unía la invitación con la cuenta | Se crea una tabla **`invitations`** con correo, rol, áreas, quién invita y vencimiento. En A3, **`vincular_invitacion()`** asigna organización, rol y áreas **en una sola transacción** y con bloqueo. Solo actúa si el correo está confirmado, y repetirla no cambia nada. Sin una invitación vigente, la persona no tiene acceso |
| 2 | La verificación en dos pasos solo se pedía en la pantalla | Un Administrador con la clave robada podía llamar la API directamente y saltársela | **La base la exige.** `auth_role()` devuelve nulo para un Administrador cuya sesión no es `aal2`, y sin rol no hay ningún permiso. Además, A1 ya no decide nada sobre esto: lo decide A3 con la respuesta de la base |
| 3 | No había una pantalla para inscribir la verificación | El primer Administrador no podía activarla | Pantalla nueva **A2b Activar verificación**, con código QR. Un intento abandonado se reemplaza en el siguiente, sin dejar factores huérfanos |
| 4 | Los antivirus de correo corporativo **abren los enlaces** antes que la persona | El enlace de un solo uso se gasta y la persona ve «vencido» sin haberlo tocado | Pantalla nueva **A9 Confirmar enlace**: el enlace se canjea **solo al pulsar «Continuar»** (`verifyOtp` con `token_hash`) |
| 5 | Los enlaces llevaban el token en la URL | El token podía quedar en el historial del navegador o en registros | Flujo **PKCE** y plantillas de correo con `token_hash` hacia `/auth/confirmar` |
| 6 | Las URL de redirección no tenían límites | Un comodín para las vistas previas de Vercel abre la puerta a redirigir a sitios ajenos | Solo se aceptan la URL de producción y `localhost`, escritas exactas. Las vistas previas usan el proyecto de **desarrollo** |
| 7 | Desactivar una cuenta no cortaba su sesión | La base ya negaba los datos (RLS), pero la persona podía renovar su sesión y las URL firmadas seguían sirviendo | La función de servidor **`bloquear-cuenta`** primero desactiva en la base (corte inmediato y auditado) y después bloquea la cuenta en Supabase Auth y cierra sus sesiones. Las URL firmadas duran 60 s. Si el bloqueo en Auth falla, la cuenta igual queda desactivada y se avisa para reintentar |
| 8 | Los correos salían por el servidor de correo gratuito de Supabase | Ese servidor envía pocos correos por hora: las invitaciones a un equipo completo no llegarían | **SMTP propio con el dominio de la empresa cliente**, con SPF, DKIM y DMARC configurados. Es requisito para producción |
| 9 | Los enlaces vencían en 1 hora | El técnico que lee el correo más tarde no puede entrar | El enlace dura **24 h**. La invitación en la tabla vence en **7 días**, y reenviarla genera un enlace nuevo. Si la cuenta ya existe en Auth, se envía un enlace de recuperación |
| 10 | No se distinguía entre un error de red y una denegación | Con mala señal, la persona veía «sin acceso» o, peor, la app entraba con datos viejos | A3 **reintenta**, con esperas cada vez más largas. Un error de red nunca lleva a A4, y la app nunca entra sin una respuesta fresca de la base |
| 11 | El caché del contexto de acceso usaba una llave fija | Al cambiar de cuenta en el mismo teléfono podía verse por un instante el rol anterior | La llave pasa a ser `["acceso", user_id]` y todo el caché se borra en cada `onAuthStateChange`. El acceso se vuelve a comprobar al volver a la pestaña y cada 5 minutos |
| 12 | Un correo sin confirmar no tenía un caso propio | Se mezclaba con «sin organización» | `mi_acceso()` devuelve los motivos en un orden fijo: `correo_sin_confirmar` → `desactivada` → `sin_organizacion` → `sin_rol` → `requiere_dos_pasos` |
| 13 | No estaba definido qué pasa con un celular compartido | Otra persona podía quedar con la sesión abierta | **Cierre automático por inactividad**, configurado en `organizations.idle_timeout_minutes` y apagado por defecto. Cerrar sesión borra la sesión, el caché y los datos de la app que tienen el prefijo `dentihub-`; si quedan fotos sin subir, avisa antes |
| 14 | No había un plan para crear el primer Administrador ni para uno que pierde su teléfono | La empresa podía quedar bloqueada | **Procedimientos escritos** en `docs/operacion/`: arranque, recuperar un Administrador y configuración del panel. Antes de salir a producción se exigen **al menos 2 Administradores** con verificación en dos pasos. La demo también deja de ofrecer «Continuar con Google», que es una entrada sin invitación |

## Decisiones

**De Bernardo (2026-11-12):**
1. Verificación en dos pasos (app autenticadora) **solo para Administradores**, exigida por la base de datos.
2. Se ingresa con **correo propio**: todos los técnicos tienen uno. El ingreso por teléfono con código SMS queda documentado como alternativa, sin construir.
3. Los correos salen desde el **dominio de la empresa cliente**.
4. Los celulares son **mixtos o no se sabe**: el cierre por inactividad es configurable y viene apagado.

**Supuestos razonables (se pueden cambiar):**
- **Clave:** mínimo 10 caracteres, sin reglas de símbolos. Con Supabase Pro se agrega el bloqueo de claves filtradas.
- **Sesión:** el token dura 30 minutos (1800 s), con rotación del token que la renueva. El rol se lee de la base en cada consulta, nunca del token, así que un cambio de rol rige de inmediato.
- **Intentos:** se usan los límites de Supabase Auth. El CAPTCHA (Turnstile) queda como mejora futura.
- **Auditoría:** invitar, revocar, vincular y activar o desactivar quedan en `audit_log`. Los ingresos quedan en el registro de Supabase Auth.
- **Cambio de correo:** la app no ofrece cambiar el propio correo, y el cambio de correo seguro de Supabase queda activado.

## Consecuencias

- **Una migración nueva**, que se prepara y no se aplica. Incluye:
  - la tabla `invitations`;
  - las funciones `admin_create_invitation`, `admin_revoke_invitation`, `admin_mark_invitation_sent`, `vincular_invitacion` y `mi_acceso`;
  - `auth_role()` con la exigencia de `aal2`;
  - la columna `organizations.idle_timeout_minutes`.
- **Dos funciones de servidor:** `invitar` y `bloquear-cuenta`.
- **La fuente `supabase`, en su parte de acceso,** dentro de `app/src/datos/`.
- **Pantallas nuevas en el módulo Acceso:** A2b y A9.
- **Configurar Supabase Auth pasa a ser una lista que se marca a mano.** El detalle está en el prompt, §2.4.
- **La demo HTML solo cambia sus textos y quita Google.** La seguridad real existe solo en `app/` conectada a Supabase.

## Pendiente

1. Que la empresa cliente elija el proveedor de SMTP y configure su DNS. Bloquea la salida a producción, no el desarrollo.
2. Elegir el plan de Supabase: Free o Pro.
3. Nombrar a los al menos 2 Administradores iniciales.
