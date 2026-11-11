# ADR-0004: Plataforma (Supabase, GitHub y Vercel) y MVP de uso

**Estado:** Aceptado
**Fecha:** 2026-11-11
**Decide:** Bernardo

## Contexto

Quedaban abiertas cuatro preguntas (CLAUDE.md, pendiente 5; AGENTE.md §10, puntos 6 y 9; ADR-0002, preguntas abiertas):

- ¿Se usa Lovable?
- ¿Dónde se despliega?
- ¿DentiHub es una herramienta interna o un producto para otras empresas?
- ¿Cuál es el siguiente entregable después de la demo?

## Decisión

1. **Plataforma:** Supabase para la base de datos, la autenticación y los archivos; GitHub para el código (`bernardoreveco/DentiHub`); y Vercel para el despliegue.
2. **Tipo de producto:** es una **herramienta interna de una empresa cliente** (otra empresa, no Dentimagen). No es un producto para vender a varias empresas.
3. **Siguiente entregable: el MVP de uso.** Es una app real que la empresa cliente pueda usar en terreno, con el alcance de la Etapa 1 (ADR-0002), y se diseña tomando ideas de apps existentes ([referencias](../referencias/ideas-de-apps-existentes.md)).
4. **Código propio, sin Lovable** (supuesto razonable). El código vive en `app/` y se ve en local con Node (`npm run dev`). Los prompts de Lovable quedan solo como referencia de textos y pantallas.

## Cómo se arma la app

| Pieza | Elección | Por qué |
|---|---|---|
| Tipo de app | **SPA** (una página que se arma en el navegador) con React 19 + Vite | Supabase hace de servidor: la seguridad está en RLS y en las funciones de la base. Una SPA se despliega en Vercel como archivos estáticos, sin servidor que mantener. |
| Rutas | TanStack Router, con las rutas escritas en código | Es el mismo enrutador del stack de referencia, pero sin generar código ni usar TanStack Start. Si después hace falta servidor, se migra a TanStack Start con su configuración para Vercel. |
| Datos | TanStack Query sobre una **fuente de datos** con dos implementaciones: `demo` (datos de ejemplo guardados en el navegador) y `supabase` (pendiente) | Así el equipo puede usar el MVP desde hoy, antes de que exista el proyecto de Supabase, y las pantallas no cambian cuando se conecte la base. |
| Diseño | Componentes y tokens del `starter-kit`, copiados a `app/src` | Una sola forma de hacer cada cosa (DESIGN_SYSTEM.md). |
| Despliegue | Vercel, con `app/` como carpeta raíz del proyecto y `vercel.json` que envía toda ruta a `index.html` | Configuración mínima. |
| Funciones con la clave de servicio (invitar personas) | **Funciones de servidor de Supabase** (Edge Functions), no Vercel | La clave de servicio queda en el mismo proveedor que la base y nunca llega al navegador. |

## Consecuencias

- **Una sola empresa cliente.** El supuesto multiorganización (`org_id`) del ADR-0002 se mantiene en el esquema porque ya está escrito y no cuesta, pero la app atiende **una sola organización**: no hay registro de empresas ni selector de organización.
- **Los datos son de la empresa cliente.** Hay que acordar con ella quién es dueña de la cuenta de Supabase y de la de Vercel, y en qué región quedan los datos (pendiente).
- **Variables:** las variables `VITE_*` se cargan en el panel de Vercel y en el `.env` local, nunca en Git.
- **Pendiente de construir para usar la base real:**
  - la migración `mi_acceso()`;
  - la fuente `supabase`;
  - los tipos generados;
  - la función de invitación.
- **Se vuelve a evaluar** si la app necesita servidor propio (por ejemplo, para generar PDF), y en ese caso se evalúa TanStack Start en Vercel.

## Pendiente

1. Crear el proyecto de Supabase de desarrollo y el proyecto de Vercel. Lo hace Bernardo o la empresa cliente: el agente no crea cuentas.
2. Decidir quién es dueño de las cuentas: Dentimagen o la empresa cliente.
3. Decidir si se usa un dominio propio o el dominio de Vercel.
