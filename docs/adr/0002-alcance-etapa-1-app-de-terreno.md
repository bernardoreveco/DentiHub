# ADR-0002: Alcance de la Etapa 1 (app de terreno)

**Estado:** Aceptado · **Fecha:** 2026-11-10 · **Decide:** Bernardo (eligió «Etapa 1 acotada»)

Este ADR **acota el orden de fases del [ADR-0001](0001-arquitectura-dominio-y-fases.md)**: no lo reemplaza. No incluye precios ni horas: las recomendaciones recibidas traen presupuestos que no se consideran aquí.

## Contexto

DentiHub se definió como una suite completa (archivos, planillas, documentos, chat, tareas, reportes y auditoría). Las recomendaciones recibidas el 26-10-2026 (roadmap ajustado, propuesta y alternativa de MVP acotado) observan que:

- Lo que **no existe listo** y da valor es el **flujo de terreno**: tareas recurrentes con checklist, foto de evidencia, alertas y trazabilidad, con permisos por rol.
- Lo más riesgoso y caro (planilla y documentos en vivo, offline completo) conviene decidirlo **con datos de uso real**.
- Los permisos deben imponerse en la base de datos (RLS), el sistema debe ser multi-tenant desde el primer día y cada fase debe tener criterios de aceptación medibles.

## Decisión

Se construye primero la **Etapa 1: app de terreno**. El resto pasa a la **Etapa 2**, que se decide según el uso real.

| Etapa 1 (se construye ahora) | Etapa 2 (después, según uso) |
|---|---|
| Ingreso, invitación, recuperación de clave y baja de cuentas (registro público cerrado) | Archivos y carpetas propios |
| Roles `admin`, `gestor`, `tecnico` y áreas, con RLS en toda tabla | Mensajes (chat por canales) |
| Tareas únicas y recurrentes, plantillas y checklists versionados | Documentos y Wiki |
| Foto de evidencia obligatoria (configurable por plantilla) | Planillas |
| Notificaciones (dentro de la app, correo y push) y alertas por reglas simples | Aprobaciones |
| Reportes simples de cumplimiento (por persona, área y periodo) | Modo sin conexión completo (cola en IndexedDB) |
| Auditoría de solo inserción y visor para el administrador | Búsqueda global |

**Equivalencia con las fases del ADR-0001:** Etapa 1 = Fase 0 + Fase 1 + Fase 4 (tareas y terreno) + Fase 6 básica (reportes y alertas) + el endurecimiento mínimo de la auditoría de la Fase 8. Etapa 2 = Fases 2, 5, 3 y 7.

**Módulos por etapa** (la demo sigue mostrando la visión completa):

- Etapa 1: Inicio, Tareas, Reportes y Administración.
- Etapa 2: Mensajes, Archivos, Documentos, Wiki, Planillas y Aprobaciones.

## Supuestos (avisados, a confirmar)

1. **Archivos, documentos, planillas y chat propios son Etapa 2.** Las recomendaciones proponían resolverlos con Google Workspace y guardar solo enlaces. Aquí **no se adopta esa integración**: queda abierto si, mientras tanto, el equipo usa herramientas externas. Razón: dos sistemas de permisos y datos repartidos contradicen la promesa de que cada rol ve solo lo suyo desde un solo lugar.
2. **Aprobaciones van a la Etapa 2** (no figuran en el alcance recomendado). Es fácil de adelantar si hace falta.
3. **Multi-tenant con `org_id` desde el día 1, con una sola organización por ahora.** Es barato ahora y caro después. Depende de otra decisión abierta: si DentiHub es herramienta interna o producto para otras empresas.
4. **Stack del ADR-0001** (TanStack y Vite, no Next.js ni Vercel), aunque las recomendaciones asumían Next.js.
5. **Offline:** la Etapa 1 deja la base preparada (identificadores creados en el cliente y escrituras idempotentes) y muestra el indicador En línea / Sin conexión; la cola de salida completa es Etapa 2.

## Ajustes adoptados desde las recomendaciones

- **Completar una tarea es una función de base de datos** que exige pasos completos y evidencia; no una regla solo de interfaz.
- **Storage con permisos por tarea y no solo por organización:** un técnico solo accede a la evidencia de sus tareas, también llamando a la API de Storage directamente.
- **Auditoría:** nivel base = solo inserción, con triggers de fila y de `TRUNCATE`. El nivel estricto (hash encadenado) queda como decisión abierta.
- **Límites a fijar antes de producción:** usuarios, GB por organización, tamaño de foto y retención de la auditoría.
- **Prueba rápida opcional** de una herramienta sin programar (p. ej. Glide o Jotform) antes de construir, para confirmar que no alcanza con eso. Si alcanzara, sería la opción más barata.
- **QA formal** con pruebas automáticas de RLS en cada fase, y criterios de aceptación medibles (abajo).
- **Datos personales:** revisar la normativa chilena de protección de datos y definir el alojamiento y la región de Supabase **antes de cargar datos reales**.

## Criterios de aceptación de la Etapa 1

1. Un técnico no lee datos de otra organización ni de tareas ajenas, **ni llamando a la API directamente** (pruebas automáticas).
2. Una tarea recurrente se crea sola cada día; el gestor recibe aviso; el técnico completa el checklist y adjunta la foto; sin foto o sin pasos no se puede cerrar.
3. Al marcar un equipo como defectuoso, la alerta llega en menos de 1 minuto.
4. Borrar o editar una fila genera un registro de auditoría con usuario, hora, valor anterior y nuevo; nadie puede modificar ni borrar el registro desde la app.
5. Una cuenta desactivada pierde el acceso de inmediato.

## Consecuencias

- **Más fácil:** valor temprano en terreno, menos riesgo técnico, una sola fuente de permisos.
- **Más difícil:** la promesa «reemplaza WhatsApp, Word, Excel y Drive» queda diferida a la Etapa 2; hay que decidir qué herramientas usa el equipo mientras tanto.
- **A revisar:** qué dispositivos usan los técnicos (afecta notificaciones push en iPhone), el resultado de la prueba rápida y el uso real para decidir la Etapa 2.

## Preguntas abiertas (decide Bernardo)

1. ¿DentiHub es una herramienta interna o un producto para otras empresas? (Confirma el supuesto 3.)
2. ¿Qué dispositivos usan los técnicos, cuántas personas y cuántas fotos por día se esperan?
3. ¿Quién es el dueño de las cuentas (Supabase, dominio, correo) y quién administra la plataforma?
4. ¿El equipo maneja datos personales o sensibles de clientes?
5. ¿Se hace la prueba rápida sin programar antes de construir?
6. ¿Se usa Lovable para construir o se desarrolla directo en el repositorio?
7. **Auditoría y privacidad:** la auditoría de `profiles` no guarda nombre ni correo, así que un cambio de nombre queda sin valor anterior y nuevo (el criterio 4 se cumple para tareas y roles, no para esos campos). ¿Se acepta, o se guarda un hash o un indicador de cambio? Falta además definir la retención del registro.
8. **Borrado de datos personales:** las cuentas con historial no se pueden borrar (claves foráneas `RESTRICT` y auditoría inmutable); se desactivan. Si llega una solicitud de eliminación de datos, hace falta un procedimiento (anonimizar, no borrar).
9. **Cierre de sesión al desactivar una cuenta:** la base corta el acceso a datos de inmediato, pero el token y las URLs firmadas ya emitidas siguen vivos hasta que venzan. ¿Se agrega bloqueo en Authentication o una función de servidor?
