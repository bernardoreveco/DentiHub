# DentiHub · MVP de uso (Etapa 1)

App real de la Etapa 1 (ADR-0002 y ADR-0004). Incluye:

- Ingreso.
- Inicio con cifras.
- Tareas con checklist, foto de evidencia obligatoria y completar.
- Crear y cancelar tareas.
- Reportes de cumplimiento.
- Administración de personas y auditoría.

Las ideas de diseño vienen de apps existentes ([referencias](../docs/referencias/ideas-de-apps-existentes.md)).

## Verla en tu computador

Requiere Node 20 o superior. Desde la raíz del repositorio:

```bash
npm --prefix app install
```

```bash
npm --prefix app run dev
```

Abre http://localhost:5173.

Para probarla en el celular, conéctalo a la misma red wifi y abre `http://<IP-del-computador>:5173`. Vite muestra esa dirección como «Network» al arrancar.

## Modo demo

Mientras no exista el proyecto de Supabase, la app usa la **fuente demo**:

- Los datos son de ejemplo y se guardan **solo en ese navegador**.
- Se entra eligiendo una cuenta (Administrador, Gestor o Técnico), sin clave.
- El botón ↺ del encabezado vuelve a los datos de ejemplo.

La fuente demo imita los permisos de la base de datos:

- El Técnico solo ve sus tareas.
- Sin pasos o sin foto no se puede completar una tarea.
- Una cuenta desactivada no entra.
- Toda escritura queda en la auditoría.

**No es seguridad:** la seguridad real es la RLS de Supabase.

## Estructura

| Carpeta | Qué hay |
|---|---|
| `src/datos/` | Contrato `fuente.ts` (lo único que usan las pantallas), tipos, fuente `demo.ts` y datos de ejemplo `semilla.ts` |
| `src/modulos/acceso/` | Ingreso, sin acceso, encabezado de la persona y hook `useAcceso()` (contrato «contexto de acceso») |
| `src/modulos/operacion/` | Lista y detalle de tareas, checklist, foto, crear tarea, reglas puras y consultas de TanStack Query |
| `src/modulos/inicio/`, `reportes/`, `administracion/` | Inicio, reportes y administración |
| `src/components/`, `src/lib/`, `src/styles*` | Copia del `starter-kit` (el verificador exige que estilos, roles, `AppShell` y `StatusBadge` coincidan) |

## Comandos

- `npm run dev`: servidor local.
- `npm run typecheck`: revisa los tipos (TypeScript estricto).
- `npm run build`: revisa los tipos y genera `dist/`.

## Despliegue en Vercel (pendiente: crear el proyecto)

1. En Vercel, importa el repositorio `bernardoreveco/DentiHub` y elige **`app`** como carpeta raíz (Root Directory). `vercel.json` ya define el build y la redirección de rutas a `index.html`.
2. Cuando exista la fuente Supabase, carga `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en *Settings → Environment Variables*. Nunca las subas a Git.

## Pendiente para conectar Supabase

1. Proyecto de desarrollo.
2. Migraciones de la Etapa 1 aplicadas y probadas.
3. Migración `mi_acceso()`.
4. Tipos generados.
5. `src/datos/supabase.ts`, que implementa `FuenteDatos` con las funciones de la base: `save_task_progress`, `register_evidence`, `complete_task`, `cancel_task` y `admin_set_active`.
6. Función de servidor para invitar personas.
