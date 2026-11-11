# Módulo 1: Acceso

**Qué resuelve:** certificar **quién es la persona**, **qué cuenta usa** y **si está habilitada**, usando Supabase Auth y la base de datos. **Entrega** el contexto de acceso a los demás módulos ([contrato](README.md#contrato-central-el-contexto-de-acceso)).

**Reglas que no se negocian**
- No hay registro abierto: se entra solo por invitación.
- El rol y la organización nunca salen de datos que escribe la propia persona; los asigna un administrador.
- Fail-closed: si algo no se puede comprobar, la persona queda sin acceso.
- Los mensajes de error no revelan si un correo existe.
- Las claves nunca pasan por el chat, el código ni Git.

**Pantallas:** A1 Ingreso · A2 Verificación en dos pasos · A3 Comprobando acceso · A4 Sin acceso · A5 Recuperar clave · A6 Definir clave nueva · A7 Aceptar invitación · A8 Cerrar sesión.

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
    i4{¿Los campos están completos<br/>y el correo tiene formato válido?}:::dec
    i5[Supabase Auth valida<br/>las credenciales]:::paso
    i6{¿Credenciales correctas?}:::dec
    i7{¿La cuenta tiene verificación<br/>en dos pasos?}:::dec
    e1[Marca el campo con error<br/>sin llamar al servidor]:::no
    e2[Mensaje: correo o clave incorrectos.<br/>No dice cuál de los dos.<br/>Tras varios intentos, espera]:::no
    a2([A2 Verificación en dos pasos]):::ini
    a3([A3 Comprobando acceso]):::ini
    a5([A5 Recuperar clave]):::ini

    i1 --> i2
    i2 -- Sí --> a3
    i2 -- No --> i3 --> i4
    i4 -- No --> e1 --> i3
    i4 -- Sí --> i5 --> i6
    i6 -- No --> e2 --> i3
    e2 -. Olvidé mi clave .-> a5
    i6 -- Sí --> i7
    i7 -- Sí --> a2
    i7 -- No --> a3
```

## A2. Verificación en dos pasos

Código de 6 dígitos de una app autenticadora (Supabase MFA). En la demo es simulada. **Por decidir:** obligatoria para Administradores (recomendado) u opcional para todos.

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    v1([Llega desde A1]):::ini
    v2[Escribe el código de 6 dígitos]:::paso
    v3{¿El código es correcto<br/>y vigente?}:::dec
    v4[La sesión sube a nivel verificado]:::paso
    e1[Mensaje: código incorrecto.<br/>Tras varios intentos, espera]:::no
    a3([A3 Comprobando acceso]):::ini
    a8([A8 Cerrar sesión]):::ini

    v1 --> v2 --> v3
    v3 -- No --> e1 --> v2
    v3 -- Sí --> v4 --> a3
    v2 -. Cancelar .-> a8
```

## A3. Comprobando acceso

Pantalla de carga breve. Llama a `mi_acceso()` y decide adónde va la persona. Es el **único** lugar donde se arma el contexto de acceso.

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    c1([Sesión iniciada]):::ini
    c2[Llama a mi_acceso]:::paso
    c3{¿Respondió?}:::dec
    c4{¿Cuenta activa?}:::dec
    c5{¿Tiene organización?}:::dec
    c6{¿Tiene rol válido?}:::dec
    c7[Guarda el contexto de acceso:<br/>persona, organización, rol y áreas]:::paso
    c8([Entra a Inicio con el menú de su rol]):::ini
    e1[Sin conexión o error:<br/>Reintentar. No entra<br/>con datos viejos]:::no
    s1([A4 Sin acceso: desactivada]):::no
    s2([A4 Sin acceso: sin organización]):::no
    s3([A4 Sin acceso: sin rol]):::no

    c1 --> c2 --> c3
    c3 -- No --> e1 --> c2
    c3 -- Sí --> c4
    c4 -- No --> s1
    c4 -- Sí --> c5
    c5 -- No --> s2
    c5 -- Sí --> c6
    c6 -- No --> s3
    c6 -- Sí --> c7 --> c8
```

**Mientras la persona usa la app:** el contexto se vuelve a pedir al volver a la pestaña y cada pocos minutos. Si el Administrador la desactiva, en la siguiente comprobación pasa a A4; aunque la interfaz tarde, la base de datos ya le niega los datos (RLS).

## A4. Sin acceso

Tres variantes con el mismo diseño: título, explicación corta, qué hacer y botón **Cerrar sesión**.

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    s0([Llega desde A3]):::ini
    s1{¿Cuál es el motivo?}:::dec
    d1[Tu cuenta está desactivada.<br/>Habla con el Administrador]:::no
    d2[Tu cuenta está creada.<br/>Falta que el Administrador<br/>te asigne a tu organización]:::paso
    d3[Tu cuenta no tiene un rol asignado.<br/>Habla con el Administrador]:::no
    r1[Pulsa Volver a comprobar]:::paso
    a3([A3 Comprobando acceso]):::ini
    a8([A8 Cerrar sesión]):::ini

    s0 --> s1
    s1 -- desactivada --> d1
    s1 -- sin organización --> d2
    s1 -- sin rol --> d3
    d2 --> r1 --> a3
    d3 --> r1
    d1 --> a8
    d2 -.-> a8
    d3 -.-> a8
```

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
    r4[Supabase envía el enlace<br/>si la cuenta existe]:::paso
    r5[Mensaje siempre igual:<br/>si el correo está registrado,<br/>te llegará un enlace]:::paso
    r6([La persona abre el correo<br/>y pulsa el enlace]):::ini
    a6([A6 Definir clave nueva]):::ini
    e1[Marca el campo con error]:::no

    r1 --> r2 --> r3
    r3 -- No --> e1 --> r2
    r3 -- Sí --> r4 --> r5 --> r6 --> a6
```

## A6. Definir clave nueva

Se llega desde el enlace de recuperación (A5) o de invitación (A7).

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    n1([Abre el enlace del correo]):::ini
    n2{¿El enlace es válido<br/>y no ha vencido?}:::dec
    n3[Escribe la clave nueva dos veces]:::paso
    n4{¿Cumple la política de claves<br/>y ambas coinciden?}:::dec
    n5[Supabase guarda la clave]:::paso
    a3([A3 Comprobando acceso]):::ini
    e1[El enlace venció o ya se usó.<br/>Pide uno nuevo]:::no
    e2[Indica qué falta: largo mínimo,<br/>o que no coinciden]:::no
    a5([A5 Recuperar clave]):::ini

    n1 --> n2
    n2 -- No --> e1 --> a5
    n2 -- Sí --> n3 --> n4
    n4 -- No --> e2 --> n3
    n4 -- Sí --> n5 --> a3
```

## A7. Aceptar invitación

La invitación la envía el Administrador desde el módulo Administración, mediante una **función de servidor** (la clave de servicio nunca va en el navegador).

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    v1([El Administrador invita por correo]):::ini
    v2[Supabase envía el correo<br/>con el enlace]:::paso
    v3{¿La persona abre el enlace<br/>antes de que venza?}:::dec
    v4[Se crea el perfil, sin rol<br/>ni organización]:::paso
    a6([A6 Definir clave nueva]):::ini
    e1[El enlace venció:<br/>el Administrador la reenvía]:::no

    v1 --> v2 --> v3
    v3 -- No --> e1 --> v2
    v3 -- Sí --> v4 --> a6
```

Después de A6 la persona pasa por A3. Si el Administrador todavía no le asignó organización y rol, ve A4 «sin organización» hasta que lo haga.

## A8. Cerrar sesión

```mermaid
flowchart LR
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900

    o1([Pulsa Cerrar sesión]):::ini
    o2[Supabase cierra la sesión]:::paso
    o3[La app borra el contexto de acceso<br/>y todos los datos en caché]:::paso
    o4([A1 Ingreso]):::ini

    o1 --> o2 --> o3 --> o4
```

## Datos y funciones que usa

- **Supabase Auth:** ingreso con clave, verificación en dos pasos, recuperar y cambiar clave, invitación (desde una función de servidor).
- **Base de datos:** `profiles` (`active`, `org_id`), `user_roles` (un rol por persona), `user_areas`. Migraciones de la Etapa 1, escritas y **sin aplicar**.
- **Por preparar:** la función `mi_acceso()` del contrato, la función de servidor que invita, y la configuración de Supabase: registro público desactivado, política de claves, URLs de redirección y plantillas de correo en español.

## Terminado cuando

1. Una persona invitada define su clave, entra y ve el menú de su rol.
2. Una cuenta desactivada, sin organización o sin rol ve la variante correcta de A4 y no lee ningún dato, **ni llamando a la API directamente**.
3. Recuperar clave nunca revela si un correo existe.
4. Cerrar sesión borra la caché: otra persona en el mismo teléfono no ve nada del anterior.
5. Con verificación en dos pasos activa, no se entra sin el código.

## Decisiones abiertas

- Verificación en dos pasos: ¿obligatoria para Administradores?
- Política de claves (largo mínimo; Supabase Pro agrega bloqueo de claves filtradas).
- Cada cuánto se vuelve a comprobar el acceso mientras la app está abierta.
