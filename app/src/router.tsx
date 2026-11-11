// Rutas del MVP (TanStack Router, escritas en código: ADR-0004). Una pantalla por archivo en
// src/modulos/<modulo>/. La ruta /ingreso es pública; todas las demás pasan por <ConAcceso>, que
// aplica el contrato de acceso y el permiso de página (fail-closed).
import {
  Link,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  useRouterState,
} from "@tanstack/react-router";
import { BarChart3, ClipboardList, Home, ScrollText, Users } from "lucide-react";
import { AppShell, type NavGroup } from "@/components/AppShell";
import { AccessDenied } from "@/components/EmptyState";
import { AppLoading } from "@/components/Loading";
import { puedeVer } from "@/lib/permisos";
import { Ingreso } from "@/modulos/acceso/Ingreso";
import { Logo } from "@/modulos/acceso/Logo";
import { MenuPersona } from "@/modulos/acceso/MenuPersona";
import { SinAcceso } from "@/modulos/acceso/SinAcceso";
import { useAcceso } from "@/modulos/acceso/useAcceso";
import { Auditoria } from "@/modulos/administracion/Auditoria";
import { Personas } from "@/modulos/administracion/Personas";
import { Inicio } from "@/modulos/inicio/Inicio";
import { DetalleTarea } from "@/modulos/operacion/DetalleTarea";
import { ListaTareas } from "@/modulos/operacion/ListaTareas";
import { NuevaTarea } from "@/modulos/operacion/NuevaTarea";
import { Reportes } from "@/modulos/reportes/Reportes";
import type { ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";

const MENU: NavGroup[] = [
  { label: "Inicio", icon: Home, items: [{ to: "/", label: "Inicio", icon: Home }] },
  { label: "Tareas", icon: ClipboardList, items: [{ to: "/tareas", label: "Tareas", icon: ClipboardList }] },
  { label: "Reportes", icon: BarChart3, items: [{ to: "/reportes", label: "Reportes", icon: BarChart3 }] },
  {
    label: "Administración",
    icon: Users,
    items: [
      { to: "/admin", label: "Personas", icon: Users },
      { to: "/admin/auditoria", label: "Auditoría", icon: ScrollText },
    ],
  },
];

/** Página a la que pertenece una ruta, para el permiso: "/tareas/12" → "/tareas". */
const paginaDe = (ruta: string) => (ruta === "/" ? "/" : `/${ruta.split("/")[1] ?? ""}`);

function ConAcceso({ children }: { children: ReactNode }) {
  const { data: acceso, isLoading, error } = useAcceso();
  const ruta = useRouterState({ select: (s) => s.location.pathname });

  if (isLoading) return <AppLoading message="Comprobando tu acceso…" logo={<Logo grande />} />;
  if (error) return <SinAcceso motivo="error" />;
  if (!acceso) return <Navigate to="/ingreso" />;
  if (!acceso.habilitada || !acceso.rol) return <SinAcceso motivo={acceso.motivo ?? "sin_rol"} />;

  const grupos = MENU.map((g) => ({ ...g, items: g.items.filter((i) => puedeVer(acceso.rol, paginaDe(i.to))) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <AppShell
      groups={grupos}
      activePath={ruta}
      logo={<Logo />}
      header={<MenuPersona acceso={acceso} />}
      renderLink={({ to, className, children: hijos, onClick }) => (
        <Link to={to} className={className} {...(onClick ? { onClick } : {})}>
          {hijos}
        </Link>
      )}
    >
      {puedeVer(acceso.rol, paginaDe(ruta)) ? children : <AccessDenied />}
    </AppShell>
  );
}

const raiz = createRootRoute({ component: Outlet });

const ingreso = createRoute({ getParentRoute: () => raiz, path: "/ingreso", component: Ingreso });

const protegida = createRoute({
  getParentRoute: () => raiz,
  id: "protegida",
  component: () => (
    <ConAcceso>
      <Outlet />
    </ConAcceso>
  ),
});

// Cada ruta se declara aparte (y no con una función auxiliar) para que TanStack Router conozca
// la ruta exacta y los <Link to="…"> queden verificados por TypeScript.
const inicio = createRoute({ getParentRoute: () => protegida, path: "/", component: Inicio });
const tareas = createRoute({ getParentRoute: () => protegida, path: "/tareas", component: ListaTareas });
const nueva = createRoute({ getParentRoute: () => protegida, path: "/tareas/nueva", component: NuevaTarea });
const reportes = createRoute({ getParentRoute: () => protegida, path: "/reportes", component: Reportes });
const admin = createRoute({ getParentRoute: () => protegida, path: "/admin", component: Personas });
const auditoria = createRoute({ getParentRoute: () => protegida, path: "/admin/auditoria", component: Auditoria });

const detalle = createRoute({
  getParentRoute: () => protegida,
  path: "/tareas/$id",
  component: function Detalle() {
    const { id } = detalle.useParams();
    return <DetalleTarea id={id} />;
  },
});

const arbol = raiz.addChildren([
  ingreso,
  protegida.addChildren([inicio, tareas, nueva, detalle, reportes, admin, auditoria]),
]);

export const router = createRouter({
  routeTree: arbol,
  defaultNotFoundComponent: () => <AccessDenied>No encontramos esa página.</AccessDenied>,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
