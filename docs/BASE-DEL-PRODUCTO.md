# Base del producto DentiHub

**Fuente única de verdad** de qué módulos tiene DentiHub, quién ve qué y cómo funcionan sus flujos. Se levantó leyendo la demo navegable (`DentiHub-Modelo-Visual.html`); los datos de ejemplo de la demo son ficticios.

> **Regla de sincronización:** cuando una orden de cambio toca la estructura (módulos, roles, permisos, flujos, datos o diseño), **este archivo se actualiza primero** y, en el mismo cambio, todo lo que depende de él. La lista de dependencias está en [`AGENTE.md`](../AGENTE.md), sección 8. El verificador `scripts/verificar-sincronizacion.mjs` revisa lo que se puede comprobar automáticamente.

Las líneas `<!-- sync:… -->` las lee el verificador: **no las borres**; actualízalas junto con el texto.

## 1. Módulos

<!-- sync:modulos inicio,msj,arch,docs,wiki,plan,tareas,aprob,rep,admin -->

| Clave | Módulo | Qué hace | Estado en la base de datos real |
|---|---|---|---|
| `inicio` | Inicio | Resumen del día: tareas, cifras, actividad reciente y accesos rápidos | Por construir (Fase 1, pantalla «Lobby») |
| `msj` | Mensajes | Canales por área (uno cerrado, solo Gestión publica), mensajes directos y menciones con `@` | Por construir (Fase 5) |
| `arch` | Archivos | Carpetas compartidas con permisos por carpeta, subir y arrastrar, visor, eliminar con auditoría | Por construir (Fase 2) |
| `docs` | Documentos | Documento colaborativo con comentarios y menciones | Por construir (Fase 5) |
| `wiki` | Wiki | Páginas por sección (procedimientos, manuales, preguntas frecuentes), con enlace a checklists | Por construir (Fase 5) |
| `plan` | Planillas | Tabla compartida en vistas de cuadrícula, tablero y calendario, con filtro, fórmula de suma y cursores de otras personas | Por construir (Fase 3) |
| `tareas` | Tareas | Lista, tablero, calendario y vista de celular con QR; checklists, repetición y **foto de evidencia obligatoria** | Por construir (Fase 4) |
| `aprob` | Aprobaciones | Solicitudes con estado; quien tiene rol de gestión aprueba o rechaza | Por construir (Fase 5) |
| `rep` | Reportes | Cumplimiento, tareas urgentes, aprobaciones pendientes y reglas de alerta | Por construir (Fase 6) |
| `admin` | Administración | Usuarios (invitar, rol, estado) y auditoría de solo lectura | **Parcial:** `profiles`, `user_roles` y `audit_log` ya existen en Supabase (Fases 1 y 8) |

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

1. **Completar una tarea.** Exige todos los pasos del checklist marcados **y** la foto de evidencia. Sin foto, no se puede cerrar y se explica por qué. Al completarla se registra en la auditoría y se notifica. Sin conexión, la foto queda «pendiente de sincronizar» y se sube sola al volver la señal.
2. **Aprobación.** Cualquier persona crea una solicitud (estado Pendiente) → un Gestor o Administrador la aprueba o la rechaza → se notifica a quien la pidió y queda en la auditoría.
3. **Alta de personas.** El Administrador invita por correo con rol y área (estado Invitado). Puede activar o desactivar cuentas y cambiar roles; todo queda auditado. No hay registro abierto.
4. **Alertas automáticas.** Reglas que se activan y desactivan: máquina marcada defectuosa → avisar al canal de urgencias; tarea cerrada sin foto → avisar al Gestor; aprobación pendiente 2 días → recordar al Administrador.
5. **Auditoría.** Toda escritura (crear, editar, eliminar, aprobar, invitar) queda con usuario, acción, módulo y hora. El registro es de solo lectura.
6. **Modo sin conexión.** Indicador visible; lo que se sube sin señal se guarda en el teléfono y se sincroniza al volver.
7. **Mensajes.** Canales abiertos por área, un canal cerrado administrado por Gerencia, mensajes directos y menciones con `@`.

## 4. Datos

Qué tablas existen y cuáles se planean (nombres provisorios):

| Estado | Tablas |
|---|---|
| **Existen** en Supabase | `profiles`, `user_roles`, `audit_log` |
| **Planeadas** | `teams` y `team_members` (áreas; el ámbito aún no está decidido), `role_page_permissions`, `folders`, `files`, tablas de planillas, `task_templates`, `tasks`, `task_responses`, `evidence`, `recurrences`, `approval_requests`, `channels`, `channel_members`, `messages`, `documents`, `wiki_pages`, `alert_rules`, `alerts` |

## 5. Pendientes que cambian esta base

- Definir el ámbito de acceso (equipo, área o proyecto).
- Unificar el nombre del rol «Operativo» (aparece en un ejemplo del roadmap) con Técnico.
- Si DentiHub es herramienta interna o producto para otras empresas.
