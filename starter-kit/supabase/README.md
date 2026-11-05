# Supabase: migraciones, permisos y seguridad

> ⚠ **El SQL de esta carpeta NO se ha ejecutado ni probado contra una base real.** No existe aún un proyecto de Supabase de DentiHub (decisión pendiente según el `CLAUDE.md`). Pruébalo primero en un proyecto de desarrollo.

## Archivos

| Archivo | Qué es |
|---|---|
| `migrations/20260101000000_base_perfiles_roles_auditoria.sql` | Tipo `app_role` (admin, gestor, tecnico), `profiles`, `user_roles`, `audit_log`, funciones `has_role()` / `is_admin()`, triggers, permisos y políticas RLS. |
| `plantilla-migracion.sql` | Molde comentado para toda migración nueva (tabla con RLS, auditoría, reversa). No es una migración: no va dentro de `migrations/`. |

## Cómo se escribe una migración (patrón de Dentiventario)

1. **Nombre:** `AAAAMMDDHHMMSS_descripcion_en_snake_case.sql` en `supabase/migrations/`. Una migración, un propósito.
2. **Encabezado en español** que cuenta **qué** hace y **por qué** (y quién lo pidió, con fecha). Dentiventario lo hace así y es lo que permite entender una migración un año después.
3. **Toda tabla nueva** trae en la misma migración: `GRANT` mínimos, `ENABLE ROW LEVEL SECURITY` y sus políticas, una por operación, nombradas `tabla_operacion_quien`.
4. **Funciones `SECURITY DEFINER`:** siempre `SET search_path = public` y `REVOKE EXECUTE … FROM PUBLIC, anon` en la **misma** migración. Dentiventario tuvo que corregir esto después, en migraciones aparte (`20260824180000_fix_security_findings.sql`, `20260908030000_lock_down_is_control.sql`, `20260929000000_fix_accounting_sku_security.sql`).
5. **Protección de columnas:** RLS no distingue columnas. Lo que solo un rol puede cambiar (estado de una aprobación, ámbito, montos aprobados) se protege con un **trigger de guarda** `BEFORE UPDATE` que lanza una excepción en español, como `prevent_unauthorized_order_approval`. Ocultar un botón en la interfaz no es seguridad.
6. **Idempotencia cuando es barato:** `ADD COLUMN IF NOT EXISTS`, `DROP TRIGGER IF EXISTS` antes de `CREATE TRIGGER`, `CREATE OR REPLACE FUNCTION`, `ON CONFLICT DO NOTHING` en datos semilla. Indica en el encabezado si se puede correr más de una vez.
7. **Reversa:** Supabase no revierte migraciones. Deja **siempre** al final un bloque `-- REVERSA MANUAL` comentado; si hace falta deshacer, se ejecuta como migración nueva.
8. **Varios pasos que deben salir «todo o nada»** (recibir, aprobar, mover): una función de base de datos transaccional, no varias llamadas del navegador.
9. **Scripts de datos de una sola vez** (regularizar, reparar) no van entre las migraciones: en Dentiventario viven en `supabase/manual/` con fecha, y la revisión de arquitectura señala que mezclarlos con lo definitivo es un riesgo. Mantén esa carpeta aparte y rotulada.
10. **Después de cada migración:** regenerar los tipos (`supabase gen types typescript`) y quitar los casts temporales.

## Cómo se aplican (no confirmado)

El código de Dentiventario no permite confirmar un único método. Hay rastros de dos: correrlas **a mano en el SQL Editor** (hay migraciones que dicen «se corre a mano en el SQL editor de Lovable» y un resumen de sesión con migraciones «pendientes de aplicar en la base real: no se aplican solas») y `supabase db push` (aparece en `IMPLEMENTACION-SKU-CONTABLES.md`). **Decide uno para DentiHub y anótalo aquí.** Con la regla de que las migraciones no se aplican solas, cualquier migración nueva debe destacarse al inicio del resumen de cada entrega.

## Permisos por rol (cómo lo resuelve Dentiventario, en tres capas)

| Capa | Qué decide | Dónde vive |
|---|---|---|
| 1. Base de datos | Qué filas y operaciones permite cada rol. **Es la única capa que cuenta como seguridad.** | Políticas RLS + funciones `is_admin()` / `has_role()` + triggers de guarda |
| 2. Permisos de página configurables | Qué páginas ve cada rol, editable por el administrador | Tabla `role_page_permissions (role, page_key, allowed)`: lectura para toda persona con sesión, escritura solo `is_admin()` |
| 3. Interfaz | Mostrar u ocultar menús y bloquear la ruta | `canAccessPage()` en `src/lib/roles.ts`: **fail-closed** (mientras carga o sin fila, deniega) |

El kit trae la capa 1 (roles y auditoría) y la 3 (`roles.ts`). **La capa 2 (tabla `role_page_permissions`) no está en la migración base**: se agrega cuando DentiHub defina qué páginas son configurables. Estructura probada en Dentiventario (`20260824200000_role_page_permissions.sql`):

```sql
CREATE TABLE public.role_page_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  page_key text NOT NULL,
  allowed boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id),
  UNIQUE (role, page_key)
);
```

### Permisos por sucursal (o por equipo / área)

En Dentiventario el ámbito es la **sucursal**: `profiles.branch_id`, `my_branch_id()` y `can_access_branch(_branch_id) = is_staff() OR _branch_id = my_branch_id()`, usada en las políticas de cada tabla con `branch_id` (y, para tablas hijas, vía `EXISTS` sobre la tabla padre). Es un buen patrón y es el que DentiHub debería copiar **cuando defina su propio ámbito** (por ejemplo, equipo o proyecto), cambiando solo los nombres. Aquí no se incluyó porque el ámbito de DentiHub no está decidido.

Dos lecciones de Dentiventario para ese día: (1) una persona no debe poder cambiarse a sí misma de ámbito, y allí hubo que agregar un trigger de guarda por un hallazgo crítico; (2) la sucursal de pruebas necesitó aislamiento propio y todavía tiene un problema abierto: si se agrega un modo de prueba, diseñar su aislamiento desde el inicio.

## Reglas de seguridad que siguen valiendo

- La clave pública (`publishable`/`anon`) puede ir en el navegador **solo si todas las tablas tienen RLS**.
- La clave de servicio (`service role`) se salta RLS: solo en el servidor, nunca en el navegador ni en Git.
- Claves, URLs y tokens van únicamente en `.env`. Nunca en el código, en estos documentos ni en mensajes de commit.
- Un rol nunca se toma de datos que controla quien se registra (`raw_user_meta_data`).
