# Módulo 1: Acceso

**Qué resuelve:** certificar **quién es la persona**, **qué cuenta usa** y **si está habilitada**, con Supabase Auth y la base de datos. **Entrega** el contexto de acceso a los demás módulos ([contrato](README.md#contrato-central-el-contexto-de-acceso)).

Las decisiones y la auditoría que dieron forma a este flujo están en el [ADR-0005](../adr/0005-base-de-verificacion-acceso.md) (2026-11-12). Se construye con el [prompt de la base de verificación](../prompts/01-base-de-verificacion.md).

**Reglas que no se negocian**
- **Sin registro abierto:** se entra solo por invitación, y la invitación ya trae la organización, el rol y las áreas.
- **El rol y la organización nunca salen de datos que escribe la propia persona.** Se leen de la base en cada consulta y nunca desde el token de sesión.
- **Fail-closed:** si algo no se puede comprobar, la persona queda sin acceso. Un error de red no es una denegación: se reintenta.
- **Verificación en dos pasos obligatoria para Administradores, exigida por la base de datos.** Sin ella, un Administrador no tiene ningún permiso.
- **Los mensajes no revelan si un correo existe**, tampoco cuando Supabase responde «demasiados intentos».
- **Los enlaces de los correos no se gastan al abrirse.** Se canjean al pulsar «Continuar» en A9, así los antivirus de correo no los consumen.
- **Las claves nunca pasan por el chat, el código ni Git.**

**Pantallas:**
- A1 Ingreso
- A2 Verificación en dos pasos
- A2b Activar verificación
- A3 Comprobando acceso
- A4 Sin acceso
- A5 Recuperar clave
- A6 Definir clave nueva
- A7 Aceptar invitación
- A8 Cerrar sesión
- A9 Confirmar enlace

Leyenda de los flujos: verde = inicio o fin, amarillo = paso, celeste = decisión, rojo = sin acceso o error.

## A1. Ingreso

Correo y clave. Supabase Auth valida las credenciales (`signInWithPassword`).

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    i1([Abre DentiHub]):::ini
    i2{¿Ya hay una sesión válida?}:::dec
    i3[Escribe correo y clave<br/>y pulsa Ingresar]:::paso
    i4{¿Campos completos y<br/>correo con formato válido?}:::dec
    i5[Supabase Auth valida<br/>las credenciales]:::paso
    i6{¿Respuesta?}:::dec
    e1[Marca el campo con error<br/>sin llamar al servidor]:::no
    e2[Mensaje fijo: correo o clave incorrectos.<br/>Tras varios intentos, espera]:::no
    e3[Sin conexión: mensaje claro<br/>y botón Reintentar]:::no
    a3([A3 Comprobando acceso]):::ini
    a5([A5 Recuperar clave]):::ini

    i1 --> i2
    i2 -- Sí --> a3
    i2 -- No --> i3 --> i4
    i4 -- No --> e1 --> i3
    i4 -- Sí --> i5 --> i6
    i6 -- Credenciales malas o<br/>demasiados intentos --> e2 --> i3
    i6 -- Error de red --> e3 --> i3
    e2 -. Olvidé mi clave .-> a5
    i6 -- Correctas --> a3
```

A1 no decide nada sobre la verificación en dos pasos. Eso lo decide **A3**, con lo que responde la base, para que no exista un camino que la salte.

## A2. Verificación en dos pasos

Código de 6 dígitos de una app autenticadora (Supabase MFA, factor TOTP). Sube la sesión al nivel `aal2`. Se llega desde A3 cuando la base responde `requiere_dos_pasos` y la persona **ya tiene** un factor activo.

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    v1([Llega desde A3]):::ini
    v2[Escribe el código de 6 dígitos]:::paso
    v3{¿Código correcto y vigente?}:::dec
    v4[La sesión sube a nivel aal2]:::paso
    e1[Mensaje: código incorrecto.<br/>Tras varios intentos, espera]:::no
    e2[¿Perdiste el teléfono?<br/>Pide a otro Administrador o al<br/>propietario que reinicie tu verificación]:::no
    a3([A3 Comprobando acceso]):::ini
    a8([A8 Cerrar sesión]):::ini

    v1 --> v2 --> v3
    v3 -- No --> e1 --> v2
    v3 -- Sí --> v4 --> a3
    v2 -. Perdí el teléfono .-> e2 --> a8
    v2 -. Cancelar .-> a8
```

## A2b. Activar verificación

Primer ingreso de un Administrador, o después de que se reinició su verificación. Se llega desde A3 con `requiere_dos_pasos` y **sin** un factor activo.

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    b1([Llega desde A3]):::ini
    b2[Explica por qué se pide<br/>y qué app instalar]:::paso
    b3[Supabase crea el factor<br/>y muestra el código QR]:::paso
    b4[Escanea el QR con la app<br/>y escribe el primer código]:::paso
    b5{¿Código correcto?}:::dec
    b6[Factor verificado.<br/>La sesión sube a aal2]:::paso
    e1[Código incorrecto: revisa<br/>la hora del teléfono e intenta de nuevo]:::no
    a3([A3 Comprobando acceso]):::ini
    a8([A8 Cerrar sesión]):::ini

    b1 --> b2 --> b3 --> b4 --> b5
    b5 -- No --> e1 --> b4
    b5 -- Sí --> b6 --> a3
    b2 -. Ahora no .-> a8
```

Si se abandona a medias, el factor queda sin verificar y se reemplaza en el siguiente intento. No quedan factores huérfanos.

## A3. Comprobando acceso

Pantalla de carga breve y el **único** lugar donde se arma el contexto de acceso. Hace dos llamadas:
1. `vincular_invitacion()`: aplica la invitación pendiente, si existe. Es idempotente.
2. `mi_acceso()`: lee el contrato.

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    c1([Sesión iniciada]):::ini
    c2[vincular_invitacion:<br/>si hay invitación pendiente para<br/>su correo confirmado, asigna<br/>organización, rol y áreas]:::paso
    c3[mi_acceso]:::paso
    c4{¿Respondió?}:::dec
    c5{¿Motivo?}:::dec
    c6{¿Tiene factor activo?}:::dec
    c7[Guarda el contexto:<br/>persona, organización, rol y áreas]:::paso
    c8([Entra a Inicio con el menú de su rol]):::ini
    e1[Error de red o del servidor:<br/>reintenta solo 3 veces con espera<br/>creciente; luego botón Reintentar.<br/>No entra con datos viejos]:::no
    a2([A2 Verificación en dos pasos]):::ini
    a2b([A2b Activar verificación]):::ini
    a4([A4 Sin acceso, con su motivo]):::no

    c1 --> c2 --> c3 --> c4
    c4 -- No --> e1 --> c2
    c4 -- Sí --> c5
    c5 -- habilitada --> c7 --> c8
    c5 -- requiere_dos_pasos --> c6
    c6 -- Sí --> a2
    c6 -- No --> a2b
    c5 -- correo_sin_confirmar,<br/>desactivada, sin_organizacion<br/>o sin_rol --> a4
```

**Mientras la persona usa la app:** el contexto se vuelve a pedir al volver a la pestaña, cada 5 minutos y ante cada evento de sesión de Supabase (renovación, cierre en otra pestaña). Si el Administrador la desactiva:
- la base deja de entregarle datos **en la siguiente consulta** (RLS);
- Auth bloquea la renovación de la sesión;
- la app la lleva a A4 en la siguiente comprobación.

Si la organización tiene configurado un **cierre por inactividad** (`idle_timeout_minutes`), pasado ese tiempo sin uso se va a A8.

## A4. Sin acceso

Cuatro variantes con el mismo diseño: título, explicación corta, qué hacer y botón **Cerrar sesión**.

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    s0([Llega desde A3]):::ini
    s1{¿Cuál es el motivo?}:::dec
    d0[Confirma tu correo con el<br/>enlace que te enviamos]:::paso
    d1[Tu cuenta está desactivada.<br/>Habla con el Administrador]:::no
    d2[Tu cuenta existe, pero no tiene<br/>una invitación vigente.<br/>Pide al Administrador que te invite]:::paso
    d3[Tu cuenta no tiene un rol asignado.<br/>Habla con el Administrador]:::no
    r1[Pulsa Volver a comprobar]:::paso
    a3([A3 Comprobando acceso]):::ini
    a8([A8 Cerrar sesión]):::ini

    s0 --> s1
    s1 -- correo_sin_confirmar --> d0 --> r1
    s1 -- desactivada --> d1 --> a8
    s1 -- sin_organizacion --> d2 --> r1
    s1 -- sin_rol --> d3 --> r1
    r1 --> a3
    d0 -.-> a8
    d2 -.-> a8
    d3 -.-> a8
```

Con las invitaciones, «sin organización» deja de ser el camino normal. Solo aparece si se creó una cuenta por fuera de una invitación, o si la invitación se revocó antes de usarse.

## A5. Recuperar clave

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    r1([Pulsa Olvidé mi clave]):::ini
    r2[Escribe su correo y pulsa Enviar]:::paso
    r3{¿Formato de correo válido?}:::dec
    r4[Supabase envía el enlace<br/>si la cuenta existe y está activa]:::paso
    r5[Mensaje siempre igual, aunque<br/>falle o haya demasiados intentos:<br/>si el correo está registrado,<br/>te llegará un enlace en unos minutos]:::paso
    r6([Abre el correo y pulsa el enlace]):::ini
    a9([A9 Confirmar enlace]):::ini
    e1[Marca el campo con error]:::no

    r1 --> r2 --> r3
    r3 -- No --> e1 --> r2
    r3 -- Sí --> r4 --> r5 --> r6 --> a9
```

Una cuenta bloqueada en Auth no recibe el enlace, y la pantalla muestra el mismo mensaje fijo.

## A6. Definir clave nueva

Se llega desde A9, con un enlace de recuperación (A5) o de invitación (A7) ya canjeado.

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    n1([Llega desde A9 con la sesión<br/>del enlace ya canjeado]):::ini
    n3[Escribe la clave nueva dos veces]:::paso
    n4{¿Tiene al menos 10 caracteres<br/>y ambas coinciden?}:::dec
    n5[Supabase guarda la clave]:::paso
    n6{¿Supabase la acepta?}:::dec
    a3([A3 Comprobando acceso]):::ini
    e2[Indica qué falta: largo mínimo,<br/>o que no coinciden]:::no
    e3[Clave rechazada por débil o filtrada:<br/>elige otra]:::no

    n1 --> n3 --> n4
    n4 -- No --> e2 --> n3
    n4 -- Sí --> n5 --> n6
    n6 -- No --> e3 --> n3
    n6 -- Sí --> a3
```

## A7. Aceptar invitación

El Administrador invita desde Administración con **correo, rol y áreas**. Una **función de servidor** registra la invitación en la base y pide a Supabase que envíe el correo. La clave de servicio nunca va en el navegador.

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    v1([El Administrador, con sesión aal2,<br/>invita: correo, rol y áreas]):::ini
    v2[Función de servidor: crea la invitación<br/>pendiente y pide a Supabase<br/>el correo de invitación]:::paso
    v3{¿Se envió el correo?}:::dec
    v4[La persona abre el correo<br/>y pulsa el enlace]:::paso
    a9([A9 Confirmar enlace]):::ini
    a6([A6 Definir clave nueva]):::ini
    a3([A3: vincular_invitacion asigna<br/>organización, rol y áreas]):::ini
    e1[La invitación queda pendiente de envío;<br/>el Administrador ve el error y pulsa Reenviar]:::no
    e2[Venció o fue revocada:<br/>el Administrador la reenvía]:::no

    v1 --> v2 --> v3
    v3 -- No --> e1
    v3 -- Sí --> v4 --> a9
    a9 -- Enlace vigente --> a6 --> a3
    a9 -- Vencido o revocado --> e2
```

Reglas de la invitación:
- **Vigencia:** 7 días.
- **Una pendiente por correo** en la organización.
- **El Administrador puede** reenviarla y revocarla.
- **La vinculación exige el correo confirmado**, que se confirma al canjear el enlace.
- **Una invitación revocada no vincula**, aunque la cuenta ya exista en Auth.

## A8. Cerrar sesión

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    o1([Pulsa Cerrar sesión, vence la<br/>inactividad o la cuenta se desactivó]):::ini
    o2{¿Hay fotos sin subir?}:::dec
    o3[Aviso: se perderán N fotos.<br/>Subir ahora o Cerrar igual]:::no
    o4[Supabase cierra la sesión]:::paso
    o5[La app borra el contexto, la caché,<br/>su almacenamiento local y la cola de fotos]:::paso
    o6([A1 Ingreso]):::ini

    o1 --> o2
    o2 -- Sí, y fue la persona --> o3
    o3 -- Cerrar igual --> o4
    o2 -- No, o fue automático --> o4 --> o5 --> o6
```

En un cierre automático (por inactividad o por desactivación) no hay a quién preguntar. Las fotos pendientes se descartan, y eso queda registrado.

## A9. Confirmar enlace

Página intermedia para **todos** los enlaces de correo (invitación y recuperación). El enlace trae un `token_hash` que **no se canjea al abrir la página**: se canjea al pulsar el botón. Así, los antivirus y vistas previas de correo que abren enlaces no lo gastan.

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    k1([Abre el enlace del correo]):::ini
    k2{¿El enlace trae token_hash<br/>y un tipo permitido?}:::dec
    k3[Muestra: Continuar para<br/>activar tu cuenta / cambiar tu clave]:::paso
    k4[Pulsa Continuar:<br/>verifyOtp con token_hash]:::paso
    k5{¿Vigente y sin usar?}:::dec
    a6([A6 Definir clave nueva]):::ini
    e1[Enlace incompleto o alterado]:::no
    e2[El enlace venció o ya se usó.<br/>Pide uno nuevo]:::no
    a5([A5 Recuperar clave]):::ini

    k1 --> k2
    k2 -- No --> e1 --> a5
    k2 -- Sí --> k3 --> k4 --> k5
    k5 -- No --> e2 --> a5
    k5 -- Sí --> a6
```

Los tipos permitidos son `invite` y `recovery`. Cualquier otro valor se trata como enlace alterado.

## Datos y funciones que usa

- **Supabase Auth:**
  - ingreso con clave;
  - MFA con factor TOTP (inscribir, desafiar y verificar);
  - recuperar y cambiar clave;
  - invitación y bloqueo (`ban_duration`), ambos solo desde funciones de servidor.
- **Base de datos (migraciones de la Etapa 1, escritas y sin aplicar):**
  - `profiles` (`active`, `org_id`);
  - `user_roles` (un rol por persona);
  - `user_areas`;
  - `auth_org()` y `auth_role()`.
- **Por preparar (ADR-0005):**
  - Tabla `invitations` y su política RLS.
  - Funciones `admin_create_invitation`, `admin_revoke_invitation`, `vincular_invitacion()` y `mi_acceso()`.
  - `auth_role()` con la exigencia de `aal2` para Administradores.
  - Columna `organizations.idle_timeout_minutes`.
  - Funciones de servidor `invitar` y `bloquear-cuenta`.
  - Configuración de Auth: SMTP, plantillas en español con `{{ .TokenHash }}`, URLs exactas, sin registro público ni ingreso anónimo, y la persona no cambia su propio correo.

## Terminado cuando

1. Una persona invitada pulsa el enlace (aunque un antivirus lo haya abierto antes), define su clave, entra y ve el menú de su rol sin que nadie le asigne nada a mano.
2. Una cuenta desactivada, sin organización, sin rol o con el correo sin confirmar ve la variante correcta de A4 y no lee ningún dato, **ni llamando a la API directamente**.
3. Un Administrador con solo la clave (sesión `aal1`) no puede leer ni escribir nada de administración ni de operación, **ni por la API**.
4. Recuperar la clave nunca revela si un correo existe, tampoco ante el límite de intentos.
5. Desactivar una cuenta corta los datos en la siguiente consulta e impide renovar la sesión. Reactivarla devuelve el acceso.
6. Cerrar sesión borra la caché y el almacenamiento local: otra persona en el mismo teléfono no ve nada de la anterior. Si había fotos sin subir, se avisó antes.
7. Un error de red en A3 nunca saca a la persona a A4 ni la deja entrar con un contexto viejo.
8. Existen y se probaron los procedimientos de arranque (primera organización y primer Administrador) y de recuperación de un Administrador que perdió su teléfono.

## Decisiones abiertas

- **Plan de Supabase:** Pro agrega bloqueo de claves filtradas y límite de sesiones por inactividad en el servidor.
- **Proveedor de envío de correo** (Resend o SendGrid) y quién configura el DNS en la empresa cliente.
- **Ingreso por teléfono:** solo si se suma personal sin correo. Hoy no se construye.
