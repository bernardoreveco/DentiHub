# ADR-0006: Priorización de las herramientas tomadas de apps existentes

**Estado:** Aceptado (Bernardo, 2026-11-12)
**Fecha:** 2026-11-12
**Decide:** Bernardo

## Contexto

El [listado de trabajo](../referencias/listado-de-trabajo-herramientas.md) reúne 46 herramientas que se vieron en MaintainX, Fracttal, Connecteam, GoCanvas, Xenia, Mitti (ex SafetyCulture) y Lark.

Lo que condiciona el orden:
- **Alcance:** la Etapa 1 es la app de terreno ([ADR-0002](0002-alcance-etapa-1-app-de-terreno.md)).
- **Lo que existe:**
  - Acceso y Administración ya están conectados a Supabase ([ADR-0005](0005-base-de-verificacion-acceso.md)).
  - **Operación (tareas, checklist y fotos) funciona solo en modo demo.** Su base de datos está escrita pero sin aplicar, y la fuente `supabase` de tareas no existe.
- **Quién lo usa:** una empresa cliente, con técnicos en celular y señal irregular.
- **Riesgo:** el modo sin conexión es lo más difícil (ADR-0002) y conviene aislarlo.

Sin un orden fijo, la tentación es sumar funciones vistosas (chat, QR, PDF) antes de que el ciclo básico funcione con datos reales.

## Decisión

**Opción A: cerrar primero el ciclo básico con datos reales, y después sumar por oleadas medidas por su impacto en terreno.**

| Oleada | Qué entra | Por qué en ese orden |
|---|---|---|
| **0. Requisito** | Conectar **Operación** a Supabase: tareas, checklist, fotos (Storage con URL de 60 s), completar y cancelar | Sin esto, nada de lo demás sirve en la app real |
| **1. Cierre de la Etapa 1** | **T4** tareas que se repiten · **C1** editor de plantillas · **T3** prioridad · **T5 y R7** recordatorios, avisos de atraso y alertas simples · **R3** programadas contra realizadas · **R4** exportar a Excel · **T9** crear tareas desde el celular | Completa lo que promete el ADR-0002. Casi todo usa tablas y funciones que ya están escritas |
| **2. Calidad en terreno** | **C7** acción correctiva automática · **C11** informe PDF · **C8** firma · **C9** sello de hora y GPS · **C10** puntaje | Dan valor sobre las tareas que ya existen, sin nuevos módulos |
| **3. Equipos** | **A1 y A2** ficha y jerarquía de activos · **A3** código QR · **A4** portal de solicitudes · **A5** reporte de incidentes | Abre un módulo nuevo (Activos): requiere ADR y migraciones propias |
| **4. Sin conexión** | **X3** cola de fotos y respuestas con sincronización | Es lo más riesgoso: va solo, con su propio ADR, cuando el resto esté estable |
| **5. Comunicación** (estilo Lark) | **K2** comunicados con lectura · **K1** chat por área · **K3** documentos · **K6** aprobaciones · **K7** directorio · **T6** comentarios | Es la visión completa de la demo. Se decide con el uso real |
| **Luego** | T8, C12, C13, A6, A7, R5, K4, K5, X5 | Solo si la empresa cliente lo pide |

**Regla de entrada:** una herramienta pasa a una oleada solo si:
1. tiene un flujo por pantalla en `docs/modulos/`;
2. tiene su migración (si cambia datos) preparada y probada en desarrollo;
3. aparece en la demo.

## Opciones consideradas

### Opción A: ciclo básico primero, luego oleadas (elegida)

| Dimensión | Evaluación |
|---|---|
| Complejidad | Baja al inicio; sube por oleada |
| Costo | Bajo: la oleada 1 reutiliza tablas y funciones ya escritas |
| Escalabilidad | Buena: cada oleada es un módulo o una mejora aislada |
| Riesgo | Bajo: lo difícil (sin conexión) va aislado |

**A favor:** el equipo usa algo real pronto; cada oleada se prueba con uso real; respeta el ADR-0002.
**En contra:** funciones atractivas, como el QR y el PDF, llegan más tarde.

### Opción B: sumar las «victorias rápidas» de la Etapa 2 dentro de la Etapa 1 (QR, PDF y acción correctiva)

| Dimensión | Evaluación |
|---|---|
| Complejidad | Media: el QR necesita el módulo Activos |
| Costo | Medio |
| Riesgo | Medio: retrasa el uso real de lo básico |

**A favor:** la demo con el cliente impresiona más.
**En contra:** el QR arrastra un módulo entero (Activos); el PDF necesita servidor o una librería pesada; se mezclan dos alcances.

### Opción C: priorizar la comunicación (chat y comunicados) para reemplazar WhatsApp cuanto antes

| Dimensión | Evaluación |
|---|---|
| Complejidad | Alta: tiempo real, notificaciones y moderación |
| Costo | Alto |
| Riesgo | Alto: compite con WhatsApp, que el equipo ya usa |

**A favor:** es la promesa original de DentiHub.
**En contra:** contradice el ADR-0002, y si el chat es peor que WhatsApp no se usa.

## Análisis

- **A frente a B:** B gana en impresión, pero el QR no es una pantalla: es un módulo (activos, jerarquía, solicitudes). Hacerlo bien cuesta lo mismo que la oleada 3 completa. La acción correctiva (C7) es la única de B que se podría adelantar con poco costo; queda primera en la oleada 2.
- **A frente a C:** la comunicación vale cuando hay trabajo real que comentar. Antes, compite con WhatsApp sin ventaja.

## Consecuencias

- **Más fácil:** medir el uso real desde la oleada 1 y decidir las siguientes con datos.
- **Más difícil:** la conversación con el cliente debe dejar claro que el QR, el PDF y el chat vienen después.
- **Datos:** la oleada 1 agrega una migración (columna de prioridad en `tasks`; notificaciones y alertas). Las tablas `notifications`, `alert_rules` y `alerts` siguen «por diseñar» en la base del producto.
- **Por revisar:** después de cada oleada, el orden de las siguientes, según el uso.

## Tareas

1. [x] Bernardo aprobó este orden (2026-11-12).
2. [x] Oleada 0: prompt de construcción listo en [`docs/prompts/02-operacion-supabase.md`](../prompts/02-operacion-supabase.md) (2026-11-12).
3. [ ] Oleada 1: documentos de los módulos 02 Administración y 04 Reportes y alertas, con sus flujos por pantalla.
4. [ ] Migración de la oleada 1 (prioridad, notificaciones y alertas), preparada y sin aplicar.
5. [ ] Antes de la oleada 3: ADR del módulo Activos. Antes de la oleada 4: ADR del modo sin conexión.
