// Roles y permisos de página de DentiHub.
//
// Patrón tomado de Dentiventario (src/lib/session.ts y src/lib/permissions.ts), con tres
// diferencias deliberadas:
//   1. Los roles son los de DentiHub (Administrador, Gestor, Técnico), no los del inventario.
//   2. Un rol desconocido o ausente NUNCA se convierte en un rol por defecto: devuelve null y la
//      pantalla debe mostrar "sin acceso" (Dentiventario hacía un cast sin validar).
//   3. No hay roles con acceso fijo "por código" aparte de admin: todo rol no-admin se rige por la
//      tabla de permisos y, si no hay fila, se deniega (fail-closed).
//
// Esto SOLO decide qué se muestra en la interfaz. La seguridad real está en las políticas RLS de
// Supabase (ver supabase/README.md): aunque alguien navegue a una URL o llame la API directo, la
// base de datos debe negar lo que el rol no puede hacer.

export type AppRole = "admin" | "gestor" | "tecnico";

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  tecnico: "Técnico",
};

/**
 * Orden de prioridad cuando una cuenta termina con más de una fila en user_roles. Postgres no
 * garantiza orden en una consulta sin ORDER BY, así que tomar roles[0] podía darle a la misma
 * persona un rol distinto de una carga a otra. Con esta prioridad el resultado es siempre el mismo.
 */
export const ROLE_PRIORITY: readonly AppRole[] = ["admin", "gestor", "tecnico"];

export function isAppRole(value: string): value is AppRole {
  return (ROLE_PRIORITY as readonly string[]).includes(value);
}

export function resolveRole(roles: { role: string }[] | null | undefined): AppRole | null {
  const present = new Set((roles ?? []).map((r) => r.role));
  for (const candidate of ROLE_PRIORITY) {
    if (present.has(candidate)) return candidate;
  }
  return null;
}

/** Fila de la tabla role_page_permissions (la crea y la protege una migración propia). */
export type PagePermission = {
  role: AppRole;
  page_key: string;
  allowed: boolean;
};

export type AccessOptions = {
  /** Páginas que solo ve el administrador (p. ej. "/admin" y "/auditoria"); no son configurables. */
  adminOnlyPages?: readonly string[];
};

/**
 * ¿Puede este rol abrir esta página?
 * - Sin rol: no. Administrador: sí, salvo que se defina lo contrario por código.
 * - Páginas solo de administrador: no para los demás roles.
 * - Resto: solo si hay una fila `allowed = true` para ese rol y página. Mientras los permisos
 *   aún cargan (`permissions` indefinido) se deniega: es mejor mostrar "cargando" que abrir de más.
 */
export function canAccessPage(
  role: AppRole | null | undefined,
  pageKey: string,
  permissions: readonly PagePermission[] | undefined,
  options: AccessOptions = {},
): boolean {
  if (!role) return false;
  if (role === "admin") return true;
  if (options.adminOnlyPages?.includes(pageKey)) return false;
  const row = permissions?.find((p) => p.role === role && p.page_key === pageKey);
  return row?.allowed === true;
}
