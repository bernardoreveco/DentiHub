# Listado de trabajo: herramientas tomadas de apps existentes

Este listado sale de leer las páginas públicas de cada app el **12-11-2026**. Se toma **cómo funciona** cada herramienta; no se copian marcas, textos, diseño ni código. Complementa [ideas-de-apps-existentes.md](ideas-de-apps-existentes.md).

## Fuentes y qué se pudo verificar

| App | Estado de la lectura |
|---|---|
| **MaintainX** (getmaintainx.com) | ✅ Leída: órdenes de trabajo, checklists, mantención preventiva, activos, inventario y reportes |
| **Fracttal** (fracttal.com/es) | ✅ Leída, en español: OT, activos, solicitudes, almacenes, KPI y app móvil |
| **Connecteam** (connecteam.com) | ✅ Leída: tareas, formularios, encuestas, base de conocimiento y permisos. Chat, comunicados y capacitación solo en resumen |
| **GoCanvas** (gocanvas.com) | ✅ Leída: formularios, despacho, firmas, PDF y GPS |
| **Xenia** (xenia.team) | ✅ Leída: checklists, acciones correctivas, aprobaciones, OT, QR y puntaje |
| **SafetyCulture** | ⚠ **Ahora se llama «Mitti (by SafetyCulture)»** (mitti.com). Solo se leyeron los títulos y las descripciones: sus páginas no se cargan sin JavaScript |
| **Lumiform** | ❌ El dominio lumiform.com hoy es de una empresa de letreros. Se descarta como fuente |
| **Lark** | ⚠ Sus páginas no se cargan sin JavaScript. Se usa lo que Bernardo ya conoce de usarla |

## Inventario por herramienta

`✅` = ya está en el MVP · `E1` = falta para cerrar la Etapa 1 · `E2` = Etapa 2 · `Luego` = solo si se pide.

### Tareas y órdenes de trabajo (módulo Operación)

| # | Herramienta | Qué hace | Vista en | DentiHub |
|---|---|---|---|---|
| T1 | Lista de tareas con estados | Abiertas, en curso, atrasadas y hechas, con filtros | Connecteam, MaintainX | ✅ |
| T2 | Asignar a una o varias personas | Responsable, o equipo | Connecteam, MaintainX | ✅ (una persona). Varias: E2 |
| T3 | Prioridad | Baja, media o alta, con color | MaintainX, Xenia, Connecteam | **E1** (requiere una columna nueva en la base) |
| T4 | Tareas que se repiten | Diaria, semanal o mensual, creadas solas | Connecteam, MaintainX, Fracttal, Xenia | **E1** (la base ya existe; falta la pantalla) |
| T5 | Recordatorios y aviso de atraso | Notificación antes del vencimiento y cuando se atrasa | Connecteam, MaintainX | **E1** |
| T6 | Comentarios en la tarea, con `@` | Conversación dentro de la tarea | MaintainX, Connecteam | E2 |
| T7 | Vista calendario y Kanban | Ver las tareas por fecha o por estado | Fracttal, Xenia | E2 |
| T8 | Tiempo dedicado | Horas registradas por tarea | MaintainX, Fracttal, Xenia | Luego |
| T9 | Crear tareas desde el celular | El Gestor en terreno crea y asigna | Connecteam | **E1** (la pantalla existe; falta revisarla en celular) |
| T10 | Aprobación antes de cerrar | El jefe revisa y aprueba la tarea completada | Xenia, MaintainX, Connecteam | E2 |

### Checklist y evidencia (módulo Operación)

| # | Herramienta | Qué hace | Vista en | DentiHub |
|---|---|---|---|---|
| C1 | Plantillas reutilizables | Pasos y exigencia de foto en una plantilla | Todas | ✅ (falta el editor de plantillas: **E1**) |
| C2 | Tipos de respuesta | Marcar, sí/no, texto y número | Xenia (14 tipos), GoCanvas | ✅ (4 tipos). Fecha, selección y firma: E2 |
| C3 | Pasos obligatorios y aviso de lo que falta | No deja cerrar sin lo obligatorio | Xenia, GoCanvas | ✅ |
| C4 | Foto obligatoria comprimida | Cámara, compresión y una foto distinta por tarea | MaintainX, Xenia, Fracttal | ✅ |
| C5 | Anotar sobre la foto | Flechas o marcas en la imagen | MaintainX, Xenia | E2 |
| C6 | Lógica condicional | Muestra u oculta preguntas según la respuesta | MaintainX, GoCanvas, Connecteam, Xenia | E2 |
| C7 | **Acción correctiva automática** | Un paso fallido crea una tarea con responsable y plazo | MaintainX, Xenia, GoCanvas, Mitti | E2 (alta prioridad) |
| C8 | Firma | Firma del técnico o del cliente al cerrar | GoCanvas, MaintainX, Xenia | E2 |
| C9 | Sello de hora y ubicación (GPS) | Prueba de dónde y cuándo se hizo | GoCanvas, Xenia, Connecteam | E2 |
| C10 | Puntaje de la inspección | Porcentaje de pasos aprobados | Xenia, Mitti | E2 |
| C11 | Informe PDF de la tarea | Pasos, fotos, firma y hora, listo para enviar | GoCanvas, Xenia, Mitti, Fracttal | E2 |
| C12 | Tablas y cálculos en el formulario | Varias mediciones y totales automáticos | Mitti, GoCanvas | Luego |
| C13 | Crear plantillas con IA | Desde un PDF o un texto | Xenia, Connecteam, Mitti | Luego |

### Equipos, solicitudes e inventario

| # | Herramienta | Qué hace | Vista en | DentiHub |
|---|---|---|---|---|
| A1 | Ficha del equipo (activo) | Historial, fotos, modelo y número de serie | MaintainX, Fracttal, Xenia | E2 |
| A2 | Jerarquía de activos | Sede › área › equipo | MaintainX, Fracttal | E2 |
| A3 | **Código QR en el equipo** | Al escanearlo abre su ficha o el formulario de solicitud | MaintainX, Fracttal, Xenia | E2 (alta prioridad) |
| A4 | **Portal de solicitudes** | Cualquier persona reporta una falla, incluso sin cuenta, y se convierte en tarea | Fracttal («portal de invitados»), MaintainX, Xenia | E2 |
| A5 | Reporte de incidentes | Reportar un problema con foto o voz y que llegue a quien corresponde | Mitti, GoCanvas | E2 |
| A6 | Mantención por lectura | Una medición fuera de rango crea una tarea | MaintainX, Fracttal | Luego |
| A7 | Repuestos y almacén | Stock, salida desde la tarea y alerta de stock bajo | MaintainX, Fracttal | Luego (posible integración con Dentiventario) |

### Reportes y alertas (módulo 4)

| # | Herramienta | Qué hace | Vista en | DentiHub |
|---|---|---|---|---|
| R1 | Panel con cifras | Para hoy, atrasadas, completadas y a tiempo | Xenia, Fracttal, MaintainX | ✅ |
| R2 | Cumplimiento por persona y por área | Tabla por periodo | Fracttal, Xenia | ✅ |
| R3 | Programadas contra realizadas | Lo planificado contra lo hecho | Fracttal | **E1** |
| R4 | Exportar a Excel o PDF | Bajar los datos de un reporte | MaintainX, Connecteam, Xenia | **E1** (Excel); PDF: E2 |
| R5 | Comparar sedes | Ranking entre sedes | Xenia, Mitti | Luego (hoy hay una sola organización) |
| R6 | Reportes programados por correo | El resumen semanal llega solo | MaintainX | E2 |
| R7 | Alertas por desviación | Aviso si sube el atraso o baja el cumplimiento | Fracttal, Mitti | **E1** (alertas simples) |

### Comunicación y conocimiento (Etapa 2, estilo Lark)

| # | Herramienta | Qué hace | Vista en | DentiHub |
|---|---|---|---|---|
| K1 | Chat por área | Mensajes del equipo en un solo lugar | Connecteam, Lark | E2 |
| K2 | **Comunicados con confirmación de lectura** | Saber quién leyó cada aviso | Connecteam, Mitti («Heads Up») | E2 (alta prioridad) |
| K3 | Base de conocimiento y documentos | Procedimientos y manuales, también sin conexión | Connecteam, Mitti, Lark | E2 |
| K4 | Encuestas | Opción múltiple, sí/no y escala, anónimas | Connecteam | Luego |
| K5 | Capacitación corta | Cursos breves para el puesto | Connecteam, Mitti | Luego |
| K6 | Aprobaciones | Solicitud, aprobación en varios niveles y aviso | Lark, Xenia | E2 |
| K7 | Directorio | Quién es quién, por área | Connecteam, Lark | E2 |

### Transversal

| # | Herramienta | Qué hace | Vista en | DentiHub |
|---|---|---|---|---|
| X1 | Roles y permisos por área | Cada rol ve solo lo suyo | Fracttal, GoCanvas, Xenia | ✅ (RLS) |
| X2 | Registro de auditoría | Quién hizo qué y cuándo | GoCanvas, Fracttal | ✅ |
| X3 | **Modo sin conexión** | Trabajar sin señal y sincronizar después | MaintainX, Fracttal, GoCanvas, Xenia | E2 (alta prioridad) |
| X4 | Avisos por WhatsApp | Notificar al técnico donde ya está | Fracttal | E2 (con n8n, sujeto a ADR) |
| X5 | API e integraciones | Conectar con ERP, BI o Sheets | Todas | Luego |
| X6 | Verificación en dos pasos e invitación | Acceso seguro | Mitti (SSO), Lark | ✅ (ADR-0005) |

## Orden propuesto para cerrar la Etapa 1

> El orden completo, por oleadas, está en el [ADR-0006](../adr/0006-priorizacion-de-herramientas.md) (aceptado). Requisito previo: conectar Operación a Supabase.

1. **T4** Tareas que se repiten (pantalla).
2. **C1** Editor de plantillas.
3. **T3** Prioridad (migración más pantalla).
4. **T5 y R7** Recordatorios, avisos de atraso y alertas simples.
5. **R3 y R4** Programadas contra realizadas, y exportar a Excel.
6. **T9** Revisar en celular la pantalla de crear tarea.

**Primeros de la Etapa 2**, por impacto en terreno: **C7** acción correctiva, **A3** QR en el equipo, **X3** modo sin conexión, **K2** comunicados con lectura y **C11** informe PDF.

## Terminología que conviene usar (de Fracttal, en español)

«Orden de trabajo (OT)», «solicitud», «activo», «plan de mantención», «inspección», «repuesto» y «almacén». En Chile se dice «mantención» y «costos» (no «mantenimiento» ni «costes»).
