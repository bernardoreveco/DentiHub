// Qué páginas ve cada rol en la interfaz (capa 3 de permisos, CLAUDE.md). Mientras no exista la
// tabla role_page_permissions (Etapa 1, por diseñar), los permisos por defecto viven aquí y siguen
// la matriz de docs/BASE-DEL-PRODUCTO.md §2: el Gestor no ve Administración; el Técnico no ve
// Reportes ni Administración. canAccessPage es fail-closed: lo que no está aquí, no se ve.
import { canAccessPage, type AppRole, type PagePermission } from "@/lib/roles";

export const PAGINAS_SOLO_ADMIN = ["/admin"] as const;

export const PERMISOS_POR_DEFECTO: readonly PagePermission[] = [
  { role: "gestor", page_key: "/", allowed: true },
  { role: "gestor", page_key: "/tareas", allowed: true },
  { role: "gestor", page_key: "/reportes", allowed: true },
  { role: "tecnico", page_key: "/", allowed: true },
  { role: "tecnico", page_key: "/tareas", allowed: true },
];

export const puedeVer = (rol: AppRole | null | undefined, pagina: string) =>
  canAccessPage(rol, pagina, PERMISOS_POR_DEFECTO, { adminOnlyPages: PAGINAS_SOLO_ADMIN });

/** Crear, asignar y cancelar tareas (en la base: is_manager()). */
export const esGestion = (rol: AppRole | null | undefined) => rol === "admin" || rol === "gestor";
