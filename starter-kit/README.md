# starter-kit de DentiHub

Componentes y patrones base, ya limpios y **sin nada del negocio del inventario** (productos, lotes, movimientos, traspasos, sucursales), extraídos de Dentiventario para que DentiHub parta con el mismo sistema de diseño. Valores y reglas de uso: [`../DESIGN_SYSTEM.md`](../DESIGN_SYSTEM.md). Lo que se dejó fuera y por qué: [`FUERA-DEL-KIT.md`](FUERA-DEL-KIT.md).

## Stack real de referencia (distinto de lo que se supuso)

El pedido original suponía Next.js y Vercel. **Dentiventario no usa ninguno de los dos**:

| Pieza | Dentiventario |
|---|---|
| Framework | React 19 + Vite, **TanStack Start / TanStack Router** (rutas por archivo), TanStack Query |
| Estilos | **Tailwind CSS v4** (tokens en CSS con `@theme`), shadcn/ui (estilo `new-york`) sobre Radix, íconos Lucide |
| Datos y auth | Supabase (Postgres con RLS, Auth, Storage), cliente `@supabase/supabase-js` |
| Edición y despliegue | **Lovable** (sincroniza la rama `main` de GitHub); el build sale con Nitro y un `wrangler.json` de **Cloudflare**. No hay configuración de Vercel. |
| Gestor de paquetes | Bun (`bun.lock`) |

Los componentes del kit son React + Tailwind + Radix **sin dependencia del enrutador**, así que sirven igual en Next.js o en TanStack. Si usas Next.js (App Router), agrega `"use client"` al inicio de los que usan estado o Radix y no lo traen (`AppShell`, `tabs`, `Section`, `FilterPills`, entre otros). El prompt de Lovable de DentiHub ya pide React + Tailwind + shadcn/ui, que es este mismo stack.

## Cómo usarlo

1. Copia `src/` a tu proyecto nuevo (respeta las rutas: el alias `@/` apunta a `src/`; ver `tsconfig.json`).
2. Copia `components.json` (para agregar más piezas de shadcn con `npx shadcn@latest add <nombre>`) y `.prettierrc`.
3. En tu hoja de estilos principal queda solo `src/styles.css`. Si quieres temas por persona, importa también `src/styles/themes.css`.
4. Carga la fuente Inter en el `<head>` (código en `DESIGN_SYSTEM.md`, §1).
5. Monta `<Toaster richColors position="top-right" />` una vez, en la raíz de la app.
6. Copia `.env.example` a `.env` y completa los valores **solo ahí** (`.env` está en `.gitignore`; nunca va a Git).
7. Para la base de datos, mira [`supabase/README.md`](supabase/README.md) (migración base y plantilla). **Nada de SQL se ha ejecutado.**

### Dependencias (versiones tomadas de Dentiventario)

```bash
bun add react@^19.2.0 react-dom@^19.2.0 tailwindcss@^4.2.1 tw-animate-css@^1.3.4 \
  class-variance-authority@^0.7.1 clsx@^2.1.1 tailwind-merge@^3.5.0 lucide-react@^0.575.0 sonner@^2.0.7 \
  @radix-ui/react-dialog@^1.1.15 @radix-ui/react-label@^2.1.8 @radix-ui/react-select@^2.2.6 \
  @radix-ui/react-slot@^1.2.4 @radix-ui/react-tabs@^1.1.13 @radix-ui/react-tooltip@^1.2.8 \
  @supabase/supabase-js@^2.112.3
```

Con Vite también `@tailwindcss/vite@^4.2.1`. Recomendadas para formularios y datos: `react-hook-form`, `zod`, `@hookform/resolvers`, `@tanstack/react-query`.

## Qué hay y de dónde viene

| Archivo | Origen |
|---|---|
| `src/styles.css`, `src/styles/themes.css` | **Copia textual** de los tokens de `src/styles.css` de Dentiventario (sin el CSS de impresión ni del tutorial). Verificado: los tokens coinciden uno a uno. |
| `src/components/ui/{button,badge,card,input,label,textarea,table,dialog,tabs,skeleton,tooltip,select,sheet}.tsx`, `src/lib/utils.ts`, `src/hooks/use-mobile.tsx` | **Copia textual** (no tenían lógica de negocio). Solo se reescribieron 3 comentarios de `table.tsx` y `select.tsx` que nombraban pantallas del inventario. |
| `src/components/ui/sonner.tsx` | **Adaptado**: se quitó el registro de avisos en el Centro de Notificaciones del inventario. |
| `src/components/{Section,Loading,SearchInput,FilterPills,AppShell}.tsx` | **Adaptados** de `audit-cells.tsx`, `AppLoading.tsx`, `SearchInput.tsx`, `MetricsSubNav.tsx` y `AppShell.tsx`, sin el contenido del inventario (el logo, el menú y la navegación entran por propiedades). |
| `src/components/{StatusBadge,KpiCard,PageHeader}.tsx` | **Generalizados** desde patrones que en Dentiventario se repiten a mano en cada pantalla (mismas clases y colores). |
| `src/components/EmptyState.tsx` (`EmptyState`, `AccessDenied`) | **Nuevo**: no existía como componente. |
| `src/lib/roles.ts` | **Adaptado** de `session.ts` y `permissions.ts`, con los roles de DentiHub (Administrador, Gestor, Técnico) y con rol desconocido = sin acceso. |
| `src/lib/theme.ts` | **Adaptado** (sin consultas a la base). `applyColorMode` es **nueva**. |
| `src/lib/supabase.ts` | **Nuevo**: cliente mínimo. El del inventario es un archivo autogenerado por Lovable, con almacenamiento específico de su vista previa. |
| `supabase/` | Migración base y plantilla **nuevas**, basadas en el patrón de las migraciones de Dentiventario. |

## Verificado y no verificado

- ✅ `tsc` con los mismos ajustes estrictos del inventario (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) pasa sin errores.
- ✅ Ninguna referencia a productos, lotes, stock, movimientos, traspasos, sucursales ni pedidos en el kit.
- ⚠ **No verificado en pantalla:** no se ejecutó una app que use el kit, así que los componentes nuevos o adaptados (`AppShell`, `StatusBadge`, `KpiCard`, `EmptyState`) no se han visto renderizados.
- ⚠ **El SQL no se ha ejecutado** contra ninguna base de Supabase.
