# Ideas de apps existentes para el MVP de uso

Este documento resume apps parecidas a DentiHub y qué tomamos de cada una. Se toman **ideas de funcionamiento**: no se copian marcas, textos ni diseños. Los colores, los textos y los componentes salen siempre de DESIGN_SYSTEM.md.

> ⚠ Escrito a partir de lo que se conoce de estas apps, sin abrir sus sitios el 2026-11-11. Antes de citarlas frente al cliente, revisa sus páginas, porque las funciones cambian.

## Qué mirar de cada app

| App | Tipo | Qué hace bien | Qué tomamos para la Etapa 1 |
|---|---|---|---|
| **SafetyCulture** (antes iAuditor) | Inspecciones con checklist | Plantillas reutilizables, pasos grandes que se tocan con el pulgar, barra de avance y foto adjunta a la inspección | Barra de avance «3 de 5 pasos», pasos de un toque y plantillas por tipo de tarea |
| **MaintainX** | Órdenes de trabajo de mantenimiento | Ficha de la orden con estado, prioridad, vencimiento, responsable y procedimiento paso a paso, con fotos dentro de la orden | La ficha de tarea con prioridad, vencimiento y responsable. La prioridad se ve con un color y una palabra |
| **Fracttal** (chilena) | Mantenimiento de equipos | Todo en español, mantenciones programadas y app para técnicos | Textos en español de Chile y tareas que se repiten (diaria, semanal, mensual) |
| **Connecteam** | App todo en uno para equipos de terreno | Pantalla de inicio con «lo de hoy», tarjetas grandes y pocas opciones por pantalla | El técnico entra y ve **Hoy · Atrasadas · Próximas · Hechas**, sin menús de más |
| **Lumiform / GoCanvas** | Formularios móviles | Campos obligatorios marcados y botón de envío que dice qué falta | El botón «Completar tarea» explica qué falta: «Te falta 1 paso y la foto» |
| **Xenia / Jolt** | Checklists diarios de local o sucursal | Panel del jefe con cumplimiento por persona y por local | El Reporte de cumplimiento por persona y por área, con las tareas atrasadas destacadas |
| **Lark** (ya en uso como referencia) | Suite colaborativa | Organización por espacios, barra lateral de íconos y aprobaciones | Barra lateral de 72 px y orden general (Etapa 2 para mensajes, documentos y aprobaciones) |

## Decisiones de diseño del MVP que salen de esta revisión

1. **El celular es el caso principal.**
   - En celular, el menú es una barra inferior con 3 a 5 íconos.
   - Los botones y los pasos miden al menos 44 px de alto, para poder tocarlos con guantes o con prisa.
2. **Mis tareas** tiene 4 pestañas: Hoy, Atrasadas, Próximas y Hechas. Cada tarjeta muestra:
   - el título;
   - el área;
   - el vencimiento («Vence hoy 18:00» o «Atrasada 2 días»);
   - la prioridad;
   - el avance del checklist;
   - un ícono de cámara si la tarea exige foto.
3. **Detalle de la tarea:**
   - Arriba van el estado y el avance.
   - Al medio van los pasos, que se marcan de un toque.
   - Abajo va la foto de evidencia, que se saca con la cámara del teléfono.
   - Al final está el botón **Completar tarea**, que queda bloqueado y dice qué falta hasta que todo esté listo. Es la misma regla que impone la base de datos (`complete_task`).
4. **La foto se comprime en el teléfono** antes de subirla, a un máximo de 1600 px, para que se suba rápido con mala señal. Se rechaza una foto de menos de 10 KB o una foto repetida, como hace la migración.
5. **Panel del Gestor (Inicio):** 4 cifras.
   - Pendientes hoy.
   - Atrasadas.
   - Completadas en la semana.
   - Porcentaje de cumplimiento.
   - Debajo va la lista de tareas atrasadas, para actuar.
6. **Crear tarea en un solo formulario corto:**
   - Primero se elige la plantilla, que trae los pasos y dice si exige foto.
   - Después se completan el responsable, el área, el vencimiento y la prioridad.
7. **Reportes simples:**
   - cumplimiento por persona y por área en una tabla;
   - tareas completadas a tiempo y atrasadas.
   - Sin gráficos complejos en la Etapa 1.
8. **Administración:**
   - lista de personas con rol, área y estado (activa o desactivada);
   - registro de auditoría de solo lectura.

## Fuera del MVP (ideas buenas para la Etapa 2)

- Escanear un código QR del equipo para abrir sus tareas (MaintainX y Fracttal).
- Firma del técnico al cerrar la tarea (GoCanvas).
- Acciones correctivas que nacen de un paso fallido (SafetyCulture).
- Chat dentro de la tarea (Connecteam).
- Trabajo sin conexión completo, con cola de envío.
