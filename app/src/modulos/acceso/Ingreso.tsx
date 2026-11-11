// A1 Ingreso (docs/modulos/01-acceso.md). En el modo demo se entra eligiendo una cuenta de
// ejemplo, sin clave: así el equipo prueba los tres roles sin crear cuentas. Con Supabase será
// correo y clave (y 2FA para administradores, decisión pendiente).
import { useQuery } from "@tanstack/react-query";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { AppLoading } from "@/components/Loading";
import { StatusBadge } from "@/components/StatusBadge";
import { fuente } from "@/datos/fuente";
import { ROLE_LABEL } from "@/lib/roles";
import { Logo } from "@/modulos/acceso/Logo";
import { useAcceso, useSesion } from "@/modulos/acceso/useAcceso";

const iniciales = (nombre: string) =>
  nombre
    .split(" ")
    .map((x) => x[0] ?? "")
    .join("")
    .slice(0, 2);

export function Ingreso() {
  const navigate = useNavigate();
  const { data: acceso, isLoading } = useAcceso();
  const { entrarDemo } = useSesion();
  const cuentas = useQuery({ queryKey: ["cuentas-demo"], queryFn: () => fuente.cuentasDemo() });

  if (isLoading) return <AppLoading logo={<Logo grande />} />;
  if (acceso?.habilitada) return <Navigate to="/" />;

  const entrar = (id: string) =>
    entrarDemo.mutate(id, {
      onSuccess: () => void navigate({ to: "/" }),
      onError: (e) => toast.error(e.message),
    });

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo grande />
          <div>
            <h1 className="text-xl font-semibold text-foreground">Ingresa a DentiHub</h1>
            <p className="text-sm text-muted-foreground">
              Tareas de terreno con checklist y foto de evidencia
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">Elige una cuenta de ejemplo</p>
            <StatusBadge tone="warning">Modo demo</StatusBadge>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Los datos se guardan solo en este navegador. Nada llega a una base de datos real.
          </p>
          <ul className="divide-y divide-border">
            {(cuentas.data ?? []).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={entrarDemo.isPending}
                  onClick={() => entrar(p.id)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-secondary disabled:opacity-50"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-medium text-foreground">
                    {iniciales(p.nombre)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {p.nombre}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {ROLE_LABEL[p.rol]}
                      {!p.activa && " · cuenta desactivada"}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
