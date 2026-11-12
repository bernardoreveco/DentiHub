# Base del producto DentiHub

**Fuente única de verdad** de qué módulos tiene DentiHub, quién ve qué y cómo funcionan sus flujos. Se levantó leyendo la demo navegable (`DentiHub-Modelo-Visual.html`); los datos de ejemplo de la demo son ficticios.

> **Regla de sincronización:** cuando una orden de cambio toca la estructura (módulos, roles, permisos, flujos, datos o diseño), **este archivo se actualiza primero** y, en el mismo cambio, todo lo que depende de él. La lista de dependencias está en [`AGENTE.md`](../AGENTE.md), sección 8. El verificador `scripts/verificar-sincronizacion.mjs` revisa lo que se puede comprobar automáticamente.

Las líneas `<!-- sync:… -->` las lee el verificador: **no las borres**; actualízalas junto con el texto.

## 1. Módulos

<!-- sync:modulos inicio,msj,arch,docs,wiki,plan,tareas,aprob,rep,admin -->

| Clave | Módulo | Etapa | Qué hace | Estado en la base de datos real |
|---|---|---|---|---|
| `inicio` | Inicio | **1** | Resumen del día: tareas, cifras, actividad reciente y accesos rápidos | Por construir (Fase 1, pantalla «Lobby») |
| `msj` | Mensajes | 2 | Canales por área (uno cerrado, solo Gestión publica), mensajes directos y menciones con `@` | Por construir (Fase 5) |
| `arch` | Archivos | 2 | Carpetas compartidas con permisos por carpeta, subir y arrastrar, visor, eliminar con auditoría | Por construir (Fase 2) |
| `docs` | Documentos | 2 | Documento colaborativo con comentarios y menciones | Por construir (Fase 5) |
| `wiki` | Wiki | 2 | Páginas por sección (procedimientos, manuales, preguntas frecuentes), con enlace a checklists | Por construir (Fase 5) |
| `plan` | Planillas | 2 | Tabla compartida en vistas de cuadrícula, tablero y calendario, con filtro, fórmula de suma y cursores de otras personas | Por construir (Fase 3) |
| `tareas` | Tareas | **1** | Lista, tablero, calendario y vista de celular con QR; checklists, repetición y **foto de evidencia obligatoria** | Base aplicada en desarrollo (12-11-2026); la app aún no conecta Operación (oleada 0, ADR-0006) |
| `aprob` | Aprobaciones | 2 | Solicitudes con estado; quien tiene rol de gestión aprueba o rechaza | Por construir (Fase 5) |
| `rep` | Reportes | **1** | Etapa 1: cumplimiento por persona, área y periodo, tareas urgentes y alertas simples. Etapa 2: aprobaciones pendientes y reglas avanzadas | Por construir (Fase 6 básica) |
| `admin` | Administración | **1** | Usuarios (invitar, rol, estado), áreas y auditoría de solo lectura | **Parcial:** `profiles`, `user_roles` y `audit_log` ya existen en Supabase (Fases 1 y 8) |

### Construcción por módulos

Por decisión de Bernardo ([ADR-0003](adr/0003-construccion-por-modulos.md)) la Etapa 1 se construye en módulos que se conectan por contratos: **Acceso → Administración → Operación → Reportes y alertas**, con notificaciones y auditoría como piezas transversales. Las pantallas y el flujo de cada una están en [`docs/modulos/`](modulos/README.md). Los módulos de esta tabla son lo que ve la persona en el menú; los módulos de construcción agrupan pantallas (por ejemplo, Operación construye las pantallas de Tareas).

### Alcance por etapa

Por decisión de Bernardo ([ADR-0002](adr/0002-alcance-etapa-1-app-de-terreno.md), 2026-11-10) se construye primero la **Etapa 1: app de terreno** (módulos en negrita: Inicio, Tareas, Reportes y Administración). Los demás módulos son **Etapa 2** y se deciden según el uso real. **La demo sigue mostrando la visión completa** y no se recorta. Por eso la línea `sync:modulos` conserva los 10 módulos: es la lista del producto, no la de la etapa.

**MVP de uso** ([ADR-0004](adr/0004-plataforma-y-mvp-de-uso.md)): la app real de la Etapa 1 está en `app/` (Inicio, Tareas con checklist y foto, Reportes y Administración). Por ahora funciona en **modo demo**, con datos guardados en el navegador, hasta que exista el proyecto de Supabase. Las ideas tomadas de apps existentes están en [`docs/referencias/`](referencias/ideas-de-apps-existentes.md).

**Orden de construcción** ([ADR-0006](adr/0006-priorizacion-de-herramientas.md), aceptado): 0) conectar Operación a Supabase; 1) cierre de la Etapa 1 (tareas que se repiten, editor de plantillas, prioridad, recordatorios y alertas, reportes con Excel); 2) calidad en terreno (acción correctiva, PDF, firma); 3) Activos (QR y solicitudes); 4) sin conexión; 5) comunicación. Lista completa en [`docs/referencias/listado-de-trabajo-herramientas.md`](referencias/listado-de-trabajo-herramientas.md).

**Demo bajo permiso** ([ADR-0007](adr/0007-demo-bajo-permiso.md)): la app publicada es siempre la real; la demo se entra con un enlace temporal que crea y revoca el Administrador, y nunca toca la base real.

**Transversal (en la demo):** ingreso con correo y clave más verificación en dos pasos (simulada), registro solo por invitación, recuperación de clave, búsqueda global, notificaciones, indicador En línea / Sin conexión, y «Sugerir un cambio» para recoger ideas del equipo.

## 2. Roles y qué ve cada uno

<!-- sync:roles admin,gestor,tecnico -->

| | Administrador | Gestor | Técnico |
|---|---|---|---|
| Módulos visibles | Todos (10) | Todos menos Administración (9) | Todos menos Reportes y Administración (8) |
| Tareas | Todas | Todas | **Solo las suyas** |
| Aprobaciones | Ve todas, aprueba y rechaza | Ve todas, aprueba y rechaza | Solo las suyas; crea solicitudes |
| Archivos | Todo, incluida la carpeta Finanzas | Todo, incluida la carpeta Finanzas | **No ve** la carpeta Finanzas |
| Planillas: columna Costo | Edita | Edita | **Restringida** (permiso por campo) |
| Canal cerrado de urgencias | Publica | Publica | **No publica** |
| Alertas | Gestiona | Gestiona | Las gestiona su Gestor |
| Invitar usuarios y cambiar roles | Sí | No | No |

Regla de código de la demo: «gestión» = todo rol distinto de Técnico; «Administración» solo para el Administrador. En la base de datos real los permisos se imponen con RLS; la interfaz solo oculta lo que no corresponde.

## 3. Flujos

**Etapa de cada flujo (ADR-0002):** Etapa 1 = 1, 3, 4 y 5. Etapa 2 = 2 (aprobaciones), 6 (la cola sin conexión completa; en la Etapa 1 solo el indicador y la base preparada) y 7 (mensajes). En la Etapa 1 las alertas del flujo 4 avisan a Gestores y Administradores; el «canal de urgencias» es Etapa 2. En el flujo 1, **la regla de completar la tarea se impone en la base de datos** (función transaccional), no solo en la interfaz.

1. **Completar una tarea.** Exige todos los pasos del checklist marcados **y** la foto de evidencia. Sin foto, no se puede cerrar y se explica por qué. Al completarla se registra en la auditoría y se notifica. Sin conexión, la foto queda «pendiente de sincronizar» y se sube sola al volver la señal.
2. **Aprobación.** Cualquier persona crea una solicitud (estado Pendiente) → un Gestor o Administrador la aprueba o la rechaza → se notifica a quien la pidió y queda en la auditoría.
3. **Alta de personas.** El Administrador invita por correo con rol y área (estado Invitado). La invitación vence en 7 días, se puede reenviar y revocar, y al primer ingreso con el correo confirmado asigna organización, rol y áreas sola (ADR-0005). Puede activar o desactivar cuentas (desactivar también bloquea la sesión en Auth) y cambiar roles; todo queda auditado. No hay registro abierto. La verificación en dos pasos es obligatoria para Administradores y la exige la base de datos.
4. **Alertas automáticas.** Reglas que se activan y desactivan: máquina marcada defectuosa → avisar al canal de urgencias; tarea cerrada sin foto → avisar al Gestor; aprobación pendiente 2 días → recordar al Administrador.
5. **Auditoría.** Toda escritura (crear, editar, eliminar, aprobar, invitar) queda con usuario, acción, módulo y hora. El registro es de solo lectura.
6. **Modo sin conexión.** Indicador visible; lo que se sube sin señal se guarda en el teléfono y se sincroniza al volver.
7. **Mensajes.** Canales abiertos por área, un canal cerrado administrado por Gerencia, mensajes directos y menciones con `@`.

## 4. Datos

Qué tablas existen y cuáles se planean (nombres provisorios):

| Estado | Tablas |
|---|---|
| **Existen** en Supabase | `profiles`, `user_roles`, `audit_log` |
| **Etapa 1: aplicadas en desarrollo** (12-11-2026, más `invitations` y `mi_acceso` del ADR-0005) | `organizations`, `areas`, `user_areas`, `form_templates`, `task_definitions`, `tasks`, `task_evidence`; bucket privado `evidence`; funciones `admin_assign_member`, `admin_set_active`, `admin_list_unassigned_accounts`, `create_form_template`, `save_task_progress`, `complete_task`, `cancel_task`, `register_evidence`, `generate_recurring_tasks` |
| **Etapa 1: por diseñar** | `notifications`, `alert_rules`, `alerts`, `role_page_permissions`; y para Acceso ([ADR-0005](adr/0005-base-de-verificacion-acceso.md), [prompt](prompts/01-base-de-verificacion.md)): `invitations`, `organizations.idle_timeout_minutes`, funciones `mi_acceso`, `vincular_invitacion`, `admin_create_invitation`, `admin_revoke_invitation` y `auth_role` con `aal2` para Administradores |
| **Etapa 2** (planeadas) | `folders`, `files`, tablas de planillas, `approval_requests`, `channels`, `channel_members`, `messages`, `documents`, `wiki_pages` |

**Reglas de datos de la Etapa 1:** el rol de una persona vive en `user_roles` (una fila por persona), nunca en `profiles`; la organización y el rol los asigna un administrador con una función transaccional, jamás salen de datos que controla quien se registra; una persona sin organización o con la cuenta desactivada no tiene acceso; completar una tarea exige pasos y foto **en la base de datos**; el registro de auditoría es de solo inserción.

**Límites y reglas de evidencia (provisorios, constantes fáciles de cambiar en la migración):** una foto debe pesar al menos 10 KB, ser de un tipo de imagen permitido (JPG, PNG, WebP, HEIC o HEIF) y no repetirse (mismo `eTag`) en la misma tarea; máximo 20 objetos por tarea; las respuestas de una tarea no pasan de 32 KB; una versión antigua de una plantilla no se reactiva si existe una mayor; el administrador puede listar las cuentas creadas que aún no tienen organización para asignarlas. Verificar el contenido real de la foto queda para una función de servidor (pendiente).

## 5. Pendientes que cambian esta base

- Confirmar el ámbito de acceso: el ADR-0002 asume **organización con áreas** (`org_id`, una sola organización por ahora).
- Unificar el nombre del rol «Operativo» (aparece en un ejemplo del roadmap) con Técnico.
- ~~Si DentiHub es herramienta interna o producto para otras empresas~~ Resuelto ([ADR-0004](adr/0004-plataforma-y-mvp-de-uso.md)): herramienta interna de una empresa cliente.
