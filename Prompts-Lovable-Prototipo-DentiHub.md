# Prompts para Lovable: prototipo navegable de DentiHub

Objetivo: un prototipo **solo visual y navegable** para mostrar al equipo. Sin base de datos, sin autenticación real, sin Supabase. Todo con datos de ejemplo.

## Cómo usar este documento
1. Pega el **Prompt maestro** como primer mensaje en Lovable.
2. Cuando termine y revises el resultado, pega los **Prompts por módulo** de a uno, en orden. Lovable funciona mejor con pasos pequeños que con un solo prompt gigante.
3. Después de cada paso, navega el resultado y corrige antes de pasar al siguiente.
4. **No conectes Supabase** ni ningún servicio en esta etapa. Si Lovable lo sugiere, ignóralo.

---

## Prompt maestro (pegar primero)

```text
Crea un prototipo navegable (solo frontend, sin backend) de una plataforma web de trabajo colaborativo llamada "DentiHub". Es para presentarla a un equipo, no para producción.

CONTEXTO
DentiHub reemplaza a WhatsApp, Word y Excel en equipos de oficina y de terreno (por ejemplo técnicos de mantenimiento). Reúne en un solo lugar: archivos, planillas, tareas con evidencia fotográfica, documentos, chats por área, reportes y trazabilidad. Cada persona ve solo lo que corresponde a su rol.

REGLAS DEL PROTOTIPO
- Todo el contenido en español (Chile).
- Usa únicamente datos de ejemplo escritos en el código. NO conectes Supabase, Firebase ni ninguna base de datos. NO implementes autenticación real.
- Las acciones (crear, subir, enviar) pueden simularse con estado local y mensajes de confirmación; no necesitan persistir al recargar.
- Muestra una barra fina superior que diga "Prototipo de demostración - datos de ejemplo".
- Es una demo completa para socializar con el equipo: cada pantalla del menú es clicable y cada botón, formulario, selector y opción debe hacer algo visible (abrir un detalle, cambiar de vista, mostrar una confirmación o un mensaje de error de validación). No dejes botones muertos ni pantallas vacías con solo un título.
- Las acciones deben actualizar el estado local y reflejarse en otras pantallas: por ejemplo, completar una tarea actualiza el Inicio y los Reportes, y toda acción relevante aparece en la Auditoría con usuario y hora.
- Incluye un botón "Sugerir un cambio" siempre visible, que permita escribir una sugerencia indicando la pantalla actual (Cambiar, Agregar o Quitar) y copiar un resumen de todas las sugerencias para compartirlo.
- Funciones de ayuda: buscador global que encuentra tareas, archivos, personas y páginas de la wiki; campana de notificaciones; menú de usuario con "Cerrar sesión" que lleva al login simulado; interruptor "En línea / Sin conexión".
- Incluye un selector de rol visible (Administrador / Gestor / Técnico) para demostrar cómo cambia lo que ve cada rol. El Técnico no debe ver Finanzas ni Administración.

ESTRUCTURA Y ESTILO
- Barra lateral izquierda con los módulos: Inicio, Mensajes, Archivos, Planillas, Tareas, Aprobaciones, Documentos, Wiki, Reportes y, solo para Administrador, Administración y Auditoría.
- Principio de datos: las mismas tareas y planillas se pueden ver en varias vistas (lista, kanban, calendario), sin duplicar información.
- Buscador global arriba y menú de usuario con avatar.
- Inspiración de organización: suites de trabajo colaborativo como Lark (todo-en-uno, chat siempre accesible, documentos enlazados). No copies su logo, colores exactos, nombre ni textos. DentiHub debe tener identidad propia.
- Diseño limpio, profesional y moderno, con modo claro, tipografía legible y buen contraste.
- Responsive: debe verse bien en celular, porque el Técnico lo usará en terreno.
- Usa React, Tailwind y componentes shadcn/ui.

Empieza SOLO con: pantalla de Login (simulada), el layout general con barra lateral, la pantalla de Inicio ("Lobby") con perfil, resumen de tareas del día y accesos rápidos, y el selector de rol. Los demás módulos deben aparecer en el menú pero mostrar una pantalla vacía con el título del módulo. Los construiremos en los siguientes pasos.
```

---

## Prompts por módulo (uno por uno)

### Paso 1. Fase 1: Accesos y perfiles
```text
Completa el módulo de acceso y administración:
- Login con correo y contraseña, botón "Continuar con Google" (simulado), enlace "Olvidé mi clave" y una pantalla de recuperación de clave. No hay registro abierto: debe decir "El registro es solo por invitación del administrador".
- Pantalla de verificación en dos pasos (código de 6 dígitos, simulada).
- Panel de Administración (solo Administrador): tabla de usuarios con nombre, correo, rol, área y estado; botón "Invitar usuario" con un formulario; edición de rol y área; desactivar usuario.
- Perfil de usuario con foto, datos básicos y cierre de sesión.
Usa 8 usuarios de ejemplo con los tres roles.
```

### Paso 2. Fase 2: Archivos y carpetas
```text
Construye el módulo Archivos como un explorador tipo Drive:
- Carpetas anidadas (por ejemplo: Clientes > Cliente A > Manuales), migas de pan, vista de lista y de cuadrícula.
- Crear carpeta, subir archivo (simulado con drag-and-drop), renombrar, mover y eliminar con confirmación.
- Visor integrado: al abrir un PDF o una imagen de ejemplo, se ve dentro de la app sin salir.
- Etiqueta de permisos por carpeta (quién puede ver).
Carga 15 archivos y carpetas de ejemplo.
```

### Paso 3. Fase 3: Planillas vivas
```text
Construye el módulo Planillas con una cuadrícula tipo Excel:
- Edición de celdas, encabezados de columnas, filas añadibles y filtro por columna.
- Fórmulas simples visibles (SUMA, PROMEDIO) calculadas en el prototipo.
- SIMULA colaboración en vivo: muestra cursores de colores con el nombre de 2 o 3 compañeros moviéndose y cambiando celdas cada pocos segundos, y una barra superior con avatares de quienes están conectados.
- Datos de ejemplo: coordinación de mantenimientos con columnas Equipo, Cliente, Técnico, Estado, Fecha.
- Vistas múltiples sobre los mismos datos: Cuadrícula, Kanban (agrupado por Estado) y Calendario (por Fecha), con un selector para cambiar de vista.
- Permisos por campo: si el rol es Técnico, oculta columnas sensibles como "Costo" y muestra un candado en su lugar.
```

### Paso 4. Fase 4: Tareas y terreno
```text
Construye el módulo Tareas pensado para celular:
- Vistas múltiples sobre las mismas tareas, con un selector: Lista, Kanban (Pendiente, En curso, Hecho) y Calendario semanal. Cambiar de vista no cambia los datos.
- Lista de tareas del día con estado, prioridad y responsable; filtros por rol y por estado.
- Código QR por equipo: cada máquina tiene una ficha con un QR de ejemplo. Al "escanearlo" (botón de demostración) se abre directamente el checklist de ese equipo con la foto de evidencia.
- Crear tarea única o recurrente (por ejemplo "2 veces al día", "lunes a viernes").
- Detalle de tarea con checklist paso a paso y un botón obligatorio "Adjuntar foto de evidencia" (simulado, con vista previa de la imagen).
- Constructor de plantillas de formulario o checklist: añadir pasos de tipo casilla, texto, número y foto.
- Notificación simulada: "Hoy tienes 3 tareas pendientes".
```

### Paso 5. Fase 5: Documentos y chat
```text
Construye los módulos Documentos y Mensajes:
- Documentos: editor de texto limpio con títulos, listas, negrita y tablas; simula cursores de otros usuarios; comentarios al margen y menciones con "@" que despliegan una lista de personas.
- Mensajes: panel lateral con canales generales y por equipo (por ejemplo #Mantenimiento, #Urgencias), mensajes directos, menciones con "@" y adjuntos. Los canales cerrados muestran un candado y quién los administra.
```

### Paso 5 bis. Aprobaciones y Wiki (ideas tomadas de suites como Lark)
```text
Añade dos módulos al menú:
- Aprobaciones: lista de solicitudes con solicitante, monto o detalle, fecha y estado (Pendiente, Aprobada, Rechazada). Ejemplos: compra de repuesto, cambio de turno, acceso a una carpeta. El Gestor y el Administrador ven botones "Aprobar" y "Rechazar" que cambian el estado y muestran una confirmación; el Técnico solo ve sus propias solicitudes y un botón "Nueva solicitud".
- Wiki: base de conocimiento con árbol de páginas a la izquierda (Procedimientos, Manuales por equipo, Preguntas frecuentes) y un artículo de ejemplo a la derecha ("Despiche de compresores", con pasos, una nota destacada, autor y fecha de última edición). Desde el artículo hay un enlace "Abrir checklist".
```

### Paso 6. Fase 6: Reportes y alertas
```text
Construye el módulo Reportes:
- Dashboard con gráfico de torta (tareas completadas vs pendientes), barras (cumplimiento por técnico) y tarjetas de indicadores.
- Sección "Alertas automáticas" con reglas editables simples, por ejemplo: "Si una máquina se marca como Defectuosa, avisar al canal #Urgencias".
- Simula una alerta disparada: aparece como notificación y como mensaje en el canal #Urgencias.
```

### Paso 7. Fases 7 y 8: Offline y Auditoría
```text
Construye dos piezas finales:
- Indicador de conexión en la barra superior (En línea / Sin conexión) con un interruptor de demostración. En modo "Sin conexión", las evidencias subidas quedan marcadas como "Pendiente de sincronizar" y pasan a "Sincronizado" al volver a "En línea". Añade una pantalla de ayuda "Instalar en el celular".
- Módulo Auditoría (solo Administrador): tabla de eventos de solo lectura con usuario, acción, módulo, fecha y hora, y filtros. Ejemplo: "Carla M. eliminó la fila 14 de la planilla Inventario".
```

### Paso 8. Pulido para la presentación
```text
Revisa todo el prototipo y mejora la coherencia:
- Mismos estilos, espacios y nombres en todos los módulos.
- Estados vacíos y mensajes de confirmación claros.
- Verifica que el Técnico no vea módulos restringidos y que todo funcione en celular.
- Crea un recorrido guiado opcional de 6 pasos que explique cada módulo al abrir por primera vez.
```

---

## Lo que el prototipo NO demuestra (avisar al equipo)
- La edición simultánea real y el modo sin conexión real son simulaciones visuales. Son las partes de mayor riesgo técnico y se construirán después.
- No hay seguridad real: roles, permisos y cifrado se implementarán con el backend definitivo.
- Los datos no se guardan.

## Cuando el equipo apruebe
Con el prototipo validado se define el modelo de datos, se crea el repositorio y se conecta el backend. Ver ADR-001 (Supabase propuesto, pendiente de decisión).
