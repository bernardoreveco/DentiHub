# Qué quedó fuera del kit y por qué

Dejado fuera **a propósito**. Si algo de esta lista se necesita después, se extrae aparte y con calma.

## Negocio del inventario

| Fuera | Por qué |
|---|---|
| Insumos, catálogo, lotes, stock, movimientos, pedidos, traspasos entre sucursales, Caja Chica, facturas, notas de crédito, costos, métricas y auditoría de uso (`lib/inventory.ts`, `adoption.ts`, `metrics.ts`, `costs.ts`, `transfers.ts`, `petty-cash.ts`, `routes/_authenticated/*`) | Es la lógica de negocio de otra aplicación; DentiHub tiene otra función. |
| Las 96 migraciones de `supabase/migrations/` y los scripts de `supabase/manual/` | Crean tablas del inventario. Solo se conservó el **patrón** (ver `supabase/README.md`). |
| Funciones de Supabase (`catalog-match`, `inventory-count-ocr`, etc.) | Específicas del inventario. |

## Sucursales y roles del inventario

| Fuera | Por qué |
|---|---|
| `branch-context.tsx`, `can_access_branch`, `my_branch_id`, selector de sucursal, «Sucursal de Prueba» y «Sucursal de Testeo» (modo sandbox) | El ámbito de DentiHub (equipo, área, proyecto) **aún no está definido**; no se inventa. Además, el aislamiento de la sucursal de testeo tiene un problema abierto en Dentiventario, que no debe heredarse. |
| Roles `adquisicion`, `encargada`, `asistente`, `control` y el permiso `allBranchesAccess` | Son del inventario. DentiHub usa Administrador, Gestor y Técnico (según su `CLAUDE.md`). |
| Permisos «de datos» como `ver-precios` | Dato del inventario. |

## Específico de Lovable y de la app original

| Fuera | Por qué |
|---|---|
| `@lovable.dev/*`, plugin MCP (`src/routes/[.mcp]`, `lib/mcp`), `mcp.ts`, consentimiento OAuth de Lovable, `lovable-error-reporting.ts`, `AGENTS.md` | Acoplados a la plataforma Lovable; DentiHub puede o no usarla. |
| `integrations/supabase/client.ts`, `client.server.ts`, `auth-middleware.ts` y `types.ts` | Archivos **autogenerados** por Lovable («do not edit»), con almacenamiento propio de la vista previa. El kit trae un cliente mínimo propio. |
| `server.ts` / `start.ts` (manejo de errores de servidor y CSRF) | Específicos de TanStack Start. Si DentiHub usa ese framework, conviene copiarlos desde Dentiventario. |
| Tutorial guiado (`driver.js`, `TourOffer`, `TutorialButton`, `lib/tours`) y su CSS | Textos y pasos del inventario. Estilo de referencia en `DESIGN_SYSTEM.md` si se quiere un tutorial. |
| Centro de notificaciones, avisos con adjuntos, presencia, comprobación de versión | Funciones del inventario con tablas propias. Distintas de lo que DentiHub necesite (chats, aprobaciones). |
| Hoja imprimible (`.print-sheet`), importación/exportación Excel y CSV (`xlsx`), compresión de imágenes | Útiles, pero atados a pantallas del inventario; se extraen cuando DentiHub los pida. |

## Componentes de interfaz no incluidos

Las demás piezas de shadcn de `components/ui` (acordeón, alerta, calendario, casilla, comando, menú desplegable, popover, grupo de opciones, separador, interruptor, etc.) **no se copiaron**: no son parte de la identidad visual y se agregan a demanda con `npx shadcn@latest add <nombre>`, que toma `components.json` y los tokens del kit. Tampoco `ui/sidebar.tsx` (744 líneas): **ningún archivo de Dentiventario lo importa**; el menú real es el rail de 72 px de `AppShell`, que sí está en el kit. El selector de fechas estándar (decisión `docs/adr/0003`) no se revisó.

## Deuda técnica que no se hereda

La revisión de arquitectura de Dentiventario (`docs/revision-arquitectura-2026-10-23.md`) lista problemas que DentiHub **no debe copiar**:

- Pantallas de 2.000 a 3.500 líneas (`pedidos.tsx`, `catalogo.tsx`, `stock.tsx`): partir por funcionalidad desde el inicio.
- Escrituras de negocio en varios pasos desde el navegador, sin transacción: usar una función de base de datos que haga todo o nada.
- Métricas calculadas en el navegador sobre tablas completas: agregar en la base y paginar.
- Sin pruebas automáticas ni CI.
- Tipos de base desactualizados y casts `as unknown as`: regenerar los tipos tras cada migración.
- Sondeos frecuentes (cada 5 s): preferir Realtime o intervalos largos.

## No revisado a fondo

Pantallas de acceso (`auth.tsx`, `invitacion.tsx`, `restablecer.tsx`), `password-policy.ts` y `invitations.functions.ts` (alta de usuarios por invitación, 615 líneas con la clave de servicio). Son candidatas a un segundo kit; **no se incluyeron porque no se leyeron con el detalle necesario** para garantizar que no arrastran lógica del inventario.
