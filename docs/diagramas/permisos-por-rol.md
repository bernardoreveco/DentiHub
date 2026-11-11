# Diagramas de flujo: permisos por rol

Fuente: [`docs/BASE-DEL-PRODUCTO.md`](../BASE-DEL-PRODUCTO.md) (sección 2, roles) y las migraciones de la Etapa 1 (`starter-kit/supabase/migrations/`, **escritas, aún no aplicadas**). Si cambia un rol o un permiso, se actualiza primero la base y después este archivo (`AGENTE.md`, sección 8). La versión para ver en el navegador o el teléfono es [`permisos-por-rol.html`](permisos-por-rol.html), generada desde este archivo.

Leyenda: verde = inicio o fin, amarillo = paso, celeste = decisión, rojo = sin acceso.

## 1. Entrar a la app y resolver el rol

Fail-closed: ante cualquier duda, la persona queda **sin acceso**.

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    a1([La persona ingresa con correo y clave]):::ini
    a2[Verificación en dos pasos<br/>simulada en la demo]:::paso
    a3{¿La cuenta está activa?}:::dec
    a4{¿Tiene organización asignada?}:::dec
    a5{¿Tiene un rol válido?<br/>admin, gestor o tecnico}:::dec
    a6[Se carga el menú de su rol]:::paso
    a7([Entra a Inicio]):::ini
    x1[Sin acceso:<br/>cuenta desactivada]:::no
    x2[Sin acceso:<br/>espera que el Administrador<br/>le asigne organización]:::no
    x3[Sin acceso:<br/>rol desconocido o sin rol]:::no

    a1 --> a2 --> a3
    a3 -- No --> x1
    a3 -- Sí --> a4
    a4 -- No --> x2
    a4 -- Sí --> a5
    a5 -- No --> x3
    a5 -- Sí --> a6 --> a7
```

## 2. Qué módulos ve cada rol

Administrador: 10 módulos. Gestor: 9. Técnico: 8. Los marcados con **E1** son de la Etapa 1 (ADR-0002); el resto es Etapa 2.

```mermaid
flowchart LR
    classDef rol fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef mod fill:#FFE86D,stroke:#A28E26,color:#574900

    adm([Administrador]):::rol
    ges([Gestor]):::rol
    tec([Técnico]):::rol

    subgraph todos [Todos los roles]
        m1[Inicio E1]:::mod
        m2[Tareas E1]:::mod
        m3[Mensajes]:::mod
        m4[Archivos]:::mod
        m5[Documentos]:::mod
        m6[Wiki]:::mod
        m7[Planillas]:::mod
        m8[Aprobaciones]:::mod
    end
    subgraph gestion [Gestor y Administrador]
        m9[Reportes E1]:::mod
    end
    subgraph soloadm [Solo Administrador]
        m10[Administración E1<br/>usuarios, áreas y auditoría]:::mod
    end

    adm --> todos
    adm --> gestion
    adm --> soloadm
    ges --> todos
    ges --> gestion
    tec --> todos
```

## 3. Qué cambia dentro de cada módulo según el rol

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    r0([La persona abre un módulo]):::ini
    r1{¿Qué rol tiene?}:::dec

    g1[Administrador y Gestor:<br/>ven todas las tareas y aprobaciones<br/>de su organización, aprueban y rechazan,<br/>ven la carpeta Finanzas, editan la columna Costo,<br/>publican en el canal de urgencias y gestionan alertas]:::paso
    g2[Solo el Administrador:<br/>invita personas, asigna rol, organización y áreas,<br/>activa o desactiva cuentas y lee la auditoría]:::paso

    t1[Técnico: ve solo sus tareas<br/>y solo sus solicitudes]:::paso
    t2[Técnico: crea solicitudes,<br/>pero no aprueba]:::paso
    t3[Técnico: no ve la carpeta Finanzas]:::no
    t4[Técnico: la columna Costo<br/>está restringida]:::no
    t5[Técnico: no publica en el<br/>canal cerrado de urgencias]:::no
    t6[Técnico: sus alertas<br/>las gestiona su Gestor]:::paso

    r0 --> r1
    r1 -- Administrador --> g1
    r1 -- Administrador --> g2
    r1 -- Gestor --> g1
    r1 -- Técnico --> t1
    t1 --> t2 --> t3 --> t4 --> t5 --> t6
```

## 4. Las tres capas que deciden un acceso

Solo la base de datos (RLS) cuenta como seguridad: las otras dos capas ordenan lo que se muestra.

```mermaid
flowchart LR
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    c1([Pide una página o un dato]):::ini
    c2{Capa 3, interfaz:<br/>canAccessPage<br/>¿su rol ve esta página?}:::dec
    c3{Capa 2, permisos de página<br/>que define el Administrador:<br/>¿está habilitada?}:::dec
    c4{Capa 1, base de datos RLS:<br/>¿la fila es de su organización<br/>y le corresponde?}:::dec
    c5([Ve solo lo que le corresponde]):::ini
    x1[Se oculta el menú<br/>y se muestra Sin acceso]:::no
    x2[Sin acceso a la página]:::no
    x3[La base no devuelve la fila,<br/>ni llamando a la API directamente]:::no

    c1 --> c2
    c2 -- No --> x1
    c2 -- Sí --> c3
    c3 -- No --> x2
    c3 -- Sí --> c4
    c4 -- No --> x3
    c4 -- Sí --> c5
```

## 5. El Administrador asigna o cambia un rol

Así funciona la función `admin_assign_member` de la Etapa 1. Una persona tiene **un solo** rol; cambiarlo actualiza su fila.

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    s1([El Administrador elige a la persona,<br/>su rol, organización y áreas]):::ini
    s2{¿Quien lo pide es<br/>administrador activo?}:::dec
    s3{¿La organización es la suya?}:::dec
    s4{¿La persona existe y está<br/>sin organización o en la suya?}:::dec
    s5{¿Las áreas son de esa organización?}:::dec
    s6{¿Le quita el rol de administrador<br/>a la última persona administradora?}:::dec
    s7[Se guardan rol, organización y áreas<br/>en una sola operación]:::paso
    s8[Queda en la auditoría]:::paso
    s9([La persona entra con su nuevo rol]):::ini
    x1[Rechazado]:::no
    x2[Rechazado: el sistema<br/>quedaría sin administrador]:::no

    s1 --> s2
    s2 -- No --> x1
    s2 -- Sí --> s3
    s3 -- No --> x1
    s3 -- Sí --> s4
    s4 -- No --> x1
    s4 -- Sí --> s5
    s5 -- No --> x1
    s5 -- Sí --> s6
    s6 -- Sí --> x2
    s6 -- No --> s7 --> s8 --> s9
```
