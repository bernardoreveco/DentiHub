# Módulo 3: Operación (tareas, checklist y evidencia)

**Qué resuelve:** el trabajo de terreno de la Etapa 1. El Gestor crea y asigna tareas con su checklist; el Técnico las hace desde el celular, marca los pasos, toma la foto de evidencia y la cierra. **Consume** el contexto de acceso del [módulo Acceso](01-acceso.md) y las personas habilitadas del módulo Administración.

**Reglas que no se negocian**
- El Técnico ve y trabaja **solo sus tareas**; Gestor y Administrador ven todas las de su organización.
- Una tarea **no se cierra** sin todos los pasos obligatorios y sin la foto cuando la plantilla la exige. Lo impone la base de datos (`complete_task`), no solo la pantalla.
- El estado de una tarea solo cambia con las funciones de tareas; nadie lo edita directo.
- Una plantilla no se edita: se publica una versión nueva. Las tareas abiertas siguen con su versión.

**Pantallas:** O1 Mis tareas · O2 Detalle de tarea · O3 Checklist · O4 Foto de evidencia · O5 Completar tarea · O6 Crear o asignar tarea (Gestor) · O7 Plantillas (Gestor) · O8 Cancelar tarea (Gestor).

Leyenda de los flujos: verde = inicio o fin, amarillo = paso, celeste = decisión, rojo = error o bloqueo.

## O1. Mis tareas

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    l1([Abre Tareas]):::ini
    l2{¿Qué rol tiene?}:::dec
    l3[Lista solo sus tareas:<br/>pendientes y en curso arriba,<br/>urgentes marcadas]:::paso
    l4[Lista todas las de su organización<br/>con filtros por persona, área y estado]:::paso
    l5{¿Hay tareas?}:::dec
    l6[Pulsa una tarea]:::paso
    e1[Estado vacío:<br/>no tienes tareas por ahora]:::paso
    o2([O2 Detalle de tarea]):::ini
    o6([O6 Crear tarea]):::ini

    l1 --> l2
    l2 -- Técnico --> l3
    l2 -- Gestor o Administrador --> l4
    l3 --> l5
    l4 --> l5
    l5 -- No --> e1
    l5 -- Sí --> l6 --> o2
    l4 -. Nueva tarea .-> o6
```

## O2. Detalle de tarea

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    d1([Abre una tarea]):::ini
    d2{¿Puede verla?<br/>la base solo la entrega<br/>si es suya o si es Gestor}:::dec
    d3[Muestra título, área, fecha,<br/>estado, pasos y fotos]:::paso
    d4{¿Está cerrada?<br/>completada o cancelada}:::dec
    d5[Solo lectura]:::paso
    d6{¿Es la persona asignada?}:::dec
    e1[No encontrada o sin acceso]:::no
    o3([O3 Checklist]):::ini
    o4([O4 Foto de evidencia]):::ini
    o8([O8 Cancelar, solo Gestor]):::ini

    d1 --> d2
    d2 -- No --> e1
    d2 -- Sí --> d3 --> d4
    d4 -- Sí --> d5
    d4 -- No --> d6
    d6 -- Sí --> o3
    d6 -- Sí --> o4
    d6 -- No, es Gestor --> o8
```

## O3. Checklist

Cada cambio se guarda con `save_task_progress`. La primera respuesta pasa la tarea de **Pendiente** a **En curso**.

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    k1([Marca un paso o escribe una respuesta]):::ini
    k2{¿Hay conexión?}:::dec
    k3[Guarda el avance]:::paso
    k4{¿La base lo aceptó?}:::dec
    k5[Marca el paso como guardado]:::paso
    k6{¿Quedan pasos obligatorios?}:::dec
    e1[Etapa 1: avisa que no hay señal<br/>y no pierde lo escrito en pantalla.<br/>La cola sin conexión es Etapa 2]:::no
    e2[Muestra el motivo:<br/>respuesta muy larga o paso inexistente]:::no
    o5([O5 Completar tarea]):::ini

    k1 --> k2
    k2 -- No --> e1
    k2 -- Sí --> k3 --> k4
    k4 -- No --> e2
    k4 -- Sí --> k5 --> k6
    k6 -- Sí --> k1
    k6 -- No --> o5
```

## O4. Foto de evidencia

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    f1([Pulsa Tomar foto]):::ini
    f2[Abre la cámara del celular]:::paso
    f3[Comprime la imagen en el celular]:::paso
    f4[Sube el archivo a Storage, en la<br/>carpeta de su organización y su tarea]:::paso
    f5{¿Storage lo aceptó?<br/>tipo, tamaño y tope por tarea}:::dec
    f6[Registra la foto con register_evidence]:::paso
    f7{¿La base la aceptó?<br/>tamaño mínimo, tipo de imagen,<br/>no repetida}:::dec
    f8([La foto aparece en la tarea]):::ini
    e1[Muestra el motivo y permite<br/>tomar otra foto]:::no

    f1 --> f2 --> f3 --> f4 --> f5
    f5 -- No --> e1 --> f1
    f5 -- Sí --> f6 --> f7
    f7 -- No --> e1
    f7 -- Sí --> f8
```

Reintentar la misma subida no duplica la foto: cada una lleva un identificador creado en el celular.

## O5. Completar tarea

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    c1([Pulsa Completar]):::ini
    c2[La base revisa con complete_task]:::paso
    c3{¿Todos los pasos obligatorios<br/>respondidos?}:::dec
    c4{¿Tiene la foto que exige<br/>la plantilla?}:::dec
    c5[La tarea queda Completada<br/>con fecha y persona]:::paso
    c6[Queda en la auditoría<br/>y se avisa al Gestor]:::paso
    c7([Vuelve a O1 con la tarea cerrada]):::ini
    e1[Bloqueado: indica qué pasos faltan]:::no
    e2[Bloqueado: falta la foto de evidencia]:::no
    o3([O3 Checklist]):::ini
    o4([O4 Foto de evidencia]):::ini

    c1 --> c2 --> c3
    c3 -- No --> e1 --> o3
    c3 -- Sí --> c4
    c4 -- No --> e2 --> o4
    c4 -- Sí --> c5 --> c6 --> c7
```

## O6. Crear o asignar tarea (Gestor)

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    t1([Pulsa Nueva tarea]):::ini
    t2[Elige plantilla vigente, título,<br/>área, persona y fecha]:::paso
    t3{¿Es recurrente?}:::dec
    t4[Define la frecuencia.<br/>La base crea cada tarea sola]:::paso
    t5[Guarda la tarea en Pendiente]:::paso
    t6{¿La base la aceptó?<br/>persona activa de su organización,<br/>plantilla y área vigentes}:::dec
    t7[Se avisa al Técnico asignado]:::paso
    t8([La tarea aparece en O1]):::ini
    e1[Muestra el motivo<br/>y deja corregir]:::no

    t1 --> t2 --> t3
    t3 -- Sí --> t4 --> t6
    t3 -- No --> t5 --> t6
    t6 -- No --> e1 --> t2
    t6 -- Sí --> t7 --> t8
```

## O7. Plantillas (Gestor)

```mermaid
flowchart TD
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    p1([Abre Plantillas]):::ini
    p2{¿Nueva o cambio de una existente?}:::dec
    p3[Define pasos, cuáles son<br/>obligatorios y si exige foto]:::paso
    p4[Publica con create_form_template]:::paso
    p5{¿Estructura válida?}:::dec
    p6[Queda vigente. La versión anterior<br/>pasa a inactiva y no se puede reactivar]:::paso
    p7([Las tareas nuevas y las recurrentes<br/>usan la versión vigente; las abiertas<br/>siguen con la suya]):::ini
    e1[Muestra qué está mal]:::no

    p1 --> p2
    p2 -- Nueva --> p3
    p2 -- Cambio --> p3
    p3 --> p4 --> p5
    p5 -- No --> e1 --> p3
    p5 -- Sí --> p6 --> p7
```

## O8. Cancelar tarea (Gestor)

```mermaid
flowchart LR
    classDef ini fill:#B3E65F,stroke:#6E9A24,color:#2F440B
    classDef paso fill:#FFE86D,stroke:#A28E26,color:#574900
    classDef dec fill:#9CE6FF,stroke:#2C97BB,color:#1C4657
    classDef no fill:#FFC6C6,stroke:#BD0A0A,color:#7A0606

    x1([Pulsa Cancelar tarea]):::ini
    x2[Escribe el motivo]:::paso
    x3{¿La tarea está abierta?}:::dec
    x4[Queda Cancelada con el motivo<br/>y en la auditoría]:::paso
    x5([Se avisa al Técnico]):::ini
    e1[Ya está cerrada:<br/>no se puede cancelar]:::no

    x1 --> x2 --> x3
    x3 -- No --> e1
    x3 -- Sí --> x4 --> x5
```

## Datos y funciones que usa

Migraciones de la Etapa 1, escritas y **sin aplicar**: `form_templates`, `task_definitions`, `tasks`, `task_evidence`, bucket privado `evidence`; funciones `create_form_template`, `save_task_progress`, `register_evidence`, `complete_task`, `cancel_task`, `generate_recurring_tasks`. Los avisos al Técnico y al Gestor dependen del módulo transversal de notificaciones, **por diseñar**.

## Terminado cuando

1. El Gestor asigna un checklist recurrente y la tarea aparece sola cada día.
2. El Técnico la completa con foto desde el celular; sin foto o sin pasos, no se cierra, **ni llamando a la API directamente**.
3. Un Técnico no ve ni abre tareas o fotos de otra persona.
4. Todo cambio de estado queda en la auditoría.

## Decisiones abiertas

- Cuántas fotos exige cada plantilla por defecto (hoy: lo define cada plantilla).
- Si el Gestor puede completar una tarea en nombre del Técnico (las migraciones lo permiten; la foto solo la sube el asignado).
- Reabrir una tarea cerrada (hoy no existe).
