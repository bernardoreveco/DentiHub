# ADR-0007: La app real por defecto; la demo solo con un enlace que activa el Administrador

**Estado:** Aceptado
**Fecha:** 2026-11-12
**Decide:** Bernardo

## Contexto

La app `app/` tenía dos fuentes de datos ([ADR-0004](0004-plataforma-y-mvp-de-uso.md)):
- `supabase`, la real;
- `demo`, con datos de ejemplo en el navegador.

Si faltaban las variables de Supabase, la app **caía sola** al modo demo. Por eso `dentihub.brevco.cl` mostraba la demo, y parecía que se trabajaba «sobre el demo». Bernardo pidió:
- que `dentihub.brevco.cl` **sea la app**;
- que la demo funcione **solo cuando él la activa**, separada de la base real y con un permiso que él da.

## Decisión

1. **La app real es la única por defecto.**
   - En producción, si faltan las variables de Supabase, la app muestra «Configuración incompleta» y no entra a la demo.
   - Solo en el computador de desarrollo (`npm run dev`, sin variables) se mantiene la demo automática, para programar.
2. **La demo se entra con un enlace de demo:** `https://dentihub.brevco.cl/demo?t=<código>`.
   - Lo crea un **Administrador** desde Administración › Enlaces de demo, con un nombre (por ejemplo, «Presentación cliente») y una vigencia de 1 a 30 días.
   - La app comprueba el código con la base (`validar_enlace_demo`). Si es válido, abre la demo **en esa pestaña** con datos de ejemplo guardados en el navegador. **Nunca toca datos reales.**
   - El Administrador puede **revocar** el enlace. Ve cuántas veces se usó y cuándo fue la última.
   - La demo lleva siempre el aviso «Modo demo» y un botón **Salir de la demo**. Cerrar la pestaña también sale.
3. **La base guarda solo la huella (SHA-256) del código**, nunca el código. El código se muestra **una sola vez** al crearlo. Tiene 192 bits al azar, así que no se puede adivinar.
4. **El demo HTML** (`DentiHub-Modelo-Visual.html`) queda como documento de visión, sin trabajo nuevo.

## Opciones consideradas

| Opción | A favor | En contra |
|---|---|---|
| **A. Enlace de demo con permiso, en el mismo dominio** (elegida) | Bernardo la activa y la revoca; queda registro de uso; no hay otro despliegue que mantener | Una tabla y tres funciones más |
| B. Otro despliegue (`demo.dentihub.brevco.cl`) siempre en modo demo | Separación total | Queda abierta a cualquiera con la dirección; no se puede revocar; un despliegue más |
| C. Demo como «rol» dentro de la base real | Una sola app | Mezcla datos ficticios con los reales: riesgo de confusión y de auditoría |

## Consecuencias

- **Más claro:** lo que se publica es el producto; la demo es una herramienta de presentación controlada.
- **Seguridad:** `validar_enlace_demo` es la **única función que puede llamar alguien sin sesión** (`anon`). Solo responde si el código es válido, y no entrega datos. Queda en los avisos de Supabase como función expuesta, y es intencional.
- **Requiere:** la migración `20261112130000_enlaces_demo.sql`, la pantalla `/demo` y la sección en Administración.
- **El modo demo de la app se mantiene sin funciones nuevas:** solo lo necesario para que no se rompa (ADR-0006 sigue con la app real).
