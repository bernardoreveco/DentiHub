// Rutas de la app (TanStack Router, escritas en código: ADR-0004). Una pantalla por archivo en
// src/modulos/<modulo>/.
//   Públicas: /ingreso (A1), /recuperar (A5), /auth/confirmar (A9) y /clave-nueva (A6).
//   Todas las demás pasan por <ConAcceso>, que es A3: decide con el contrato de acceso (ADR-0005)
//   adónde va la persona, y aplica el permiso de página (fail-closed).
import { useCallback, useEffect, type ReactNode } from "react";
import {
  Link,
  Navigate,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { BarChart3, ClipboardList, Home, ScrollText, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell, type NavGroup } from "@/components/AppShell";
import { AccessDenied } from "@/components/EmptyState";
import { AppLoading } from "@/components/Loading";
import { puedeVer } from "@/lib/permisos";
import { ClaveNueva } from "@/modulos/acceso/ClaveNueva";
import { ConfirmarEnlace } from "@/modulos/acceso/ConfirmarEnlace";
import { DosPasos } from "@/modulos/acceso/DosPasos";
import { Ingreso } from "@/modulos/acceso/Ingreso";
import { Logo } from "@/modulos/acceso/Logo";
import { MenuPersona } from "@/modulos/acceso/MenuPersona";
import { RecuperarClave } from "@/modulos/acceso/RecuperarClave";
import { SinAcceso, SinConexion } from "@/modulos/acceso/SinAcceso";
import { useAcceso, useEscucharSesion, useSesion } from "@/modulos/acceso/useAcceso";
import { useInactividad } from "@/modulos/acceso/useInactividad";
import { Auditoria } from "@/modulos/administracion/Auditoria";
import { Personas } from "@/modulos/administracion/Personas";
import { Inicio } from "@/modulos/inicio/Inicio";
import { DetalleTarea } from "@/modulos/operacion/DetalleTarea";
import { ListaTareas } from "@/modulos/operacion/ListaTareas";
import { NuevaTarea } from "@/modulos/operacion/NuevaTarea";
import { Reportes } from "@/modulos/reportes/Reportes";

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

/** A3 Comprobando acceso. Es el ÚNICO lugar donde se decide adónde va la persona. */
function ConAcceso({ children }: { children: ReactNode }) {
  const { data: acceso, isLoading, error, refetch } = useAcceso();
  const ruta = useRouterState({ select: (s) => s.location.pathname });
  const { salir } = useSesion();
  const navigate = useNavigate();

  // Cierre por inactividad (apagado salvo que la organización lo configure).
  const alVencer = useCallback(() => {
    salir.mutate(undefined, {
      onSettled: () => {
        toast.info("Cerramos tu sesión por inactividad.");
        void navigate({ to: "/ingreso" });
      },
    });
  }, [salir, navigate]);
  useInactividad(acceso?.habilitada ? acceso.inactividadMinutos : null, alVencer);

  // Si una comprobación periódica falla por la red, se queda la pantalla actual y se avisa.
  // La base igual niega los datos si el acceso cambió (RLS).
  useEffect(() => {
    if (error && acceso) toast.warning("Sin conexión: no pudimos volver a comprobar tu acceso.");
  }, [error, acceso]);

  if (isLoading) return <AppLoading message="Comprobando tu acceso…" logo={<Logo grande />} />;
  if (error && !acceso) return <SinConexion onReintentar={() => void refetch()} />;
  if (!acceso) return <Navigate to="/ingreso" />;
  if (acceso.motivo === "requiere_dos_pasos") return <DosPasos />;
  if (!acceso.habilitada || !acceso.rol) {
    return <SinAcceso motivo={acceso.motivo === null ? "sin_rol" : acceso.motivo} />;
  }

  const rol = acceso.rol;
  const grupos = MENU.map((g) => ({ ...g, items: g.items.filter((i) => puedeVer(rol, paginaDe(i.to))) })).filter(
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
      {puedeVer(rol, paginaDe(ruta)) ? children : <AccessDenied />}
    </AppShell>
  );
}

function Raiz() {
  useEscucharSesion();
  return <Outlet />;
}

/** Error de una pantalla: se muestra el mensaje (ya escrito para la persona) dentro del marco. */
function ErrorDePantalla({ error }: { error: unknown }) {
  return (
    <AccessDenied>
      {error instanceof Error ? error.message : "Algo salió mal. Recarga la página e inténtalo de nuevo."}
    </AccessDenied>
  );
}

const raiz = createRootRoute({ component: Raiz });

const ingreso = createRoute({ getParentRoute: () => raiz, path: "/ingreso", component: Ingreso });
const recuperar = createRoute({ getParentRoute: () => raiz, path: "/recuperar", component: RecuperarClave });
const confirmar = createRoute({ getParentRoute: () => raiz, path: "/auth/confirmar", component: ConfirmarEnlace });
const claveNueva = createRoute({ getParentRoute: () => raiz, path: "/clave-nueva", component: ClaveNueva });

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
  recuperar,
  confirmar,
  claveNueva,
  protegida.addChildren([inicio, tareas, nueva, detalle, reportes, admin, auditoria]),
]);

export const router = createRouter({
  routeTree: arbol,
  defaultNotFoundComponent: () => <AccessDenied>No encontramos esa página.</AccessDenied>,
  defaultErrorComponent: ErrorDePantalla,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
