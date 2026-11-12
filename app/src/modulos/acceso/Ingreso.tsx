// A1 Ingreso (docs/modulos/01-acceso.md, ADR-0005).
//   - App real (Supabase): correo y clave. El mensaje de error es fijo y no revela si el correo existe.
//     A1 no decide nada sobre la verificación en dos pasos: eso lo decide A3 con la respuesta de la base.
//   - Modo demo: se elige una cuenta de ejemplo (y las invitaciones vigentes), sin clave.
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "@tanstack/react-router";
import { ChevronRight, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { AppLoading } from "@/components/Loading";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fuente } from "@/datos/fuente";
import { ROLE_LABEL } from "@/lib/roles";
import { Logo } from "@/modulos/acceso/Logo";
import { ErrorFormulario, PantallaAcceso } from "@/modulos/acceso/PantallaAcceso";
import { useAcceso, useSesion } from "@/modulos/acceso/useAcceso";

const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const iniciales = (nombre: string) =>
  nombre
    .split(/[ .@]/)
    .map((x) => x[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

function FormularioIngreso() {
  const navigate = useNavigate();
  const { ingresar } = useSesion();
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    // Validación local, sin llamar al servidor.
    if (!CORREO.test(correo.trim())) return setError("Escribe un correo válido.");
    if (!clave) return setError("Escribe tu clave.");
    setError(null);
    ingresar.mutate(
      { correo, clave },
      {
        onSuccess: () => void navigate({ to: "/" }),
        onError: (err) => setError(err.message),
      },
    );
  };

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="correo">Correo</Label>
        <Input
          id="correo"
          type="email"
          autoComplete="username"
          inputMode="email"
          className="h-11"
          value={correo}
          onChange={(e) => setCorreo(e.currentTarget.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="clave">Clave</Label>
        <Input
          id="clave"
          type="password"
          autoComplete="current-password"
          className="h-11"
          value={clave}
          onChange={(e) => setClave(e.currentTarget.value)}
        />
      </div>
      {error && <ErrorFormulario>{error}</ErrorFormulario>}
      <Button type="submit" className="h-11 w-full" disabled={ingresar.isPending}>
        {ingresar.isPending ? "Ingresando…" : "Ingresar"}
      </Button>
      <p className="text-center text-sm">
        <Link to="/recuperar" className="text-primary underline-offset-4 hover:underline">
          Olvidé mi clave
        </Link>
      </p>
      <p className="text-center text-xs text-muted-foreground">
        El ingreso es solo por invitación de un Administrador.
      </p>
    </form>
  );
}

function CuentasDemo() {
  const navigate = useNavigate();
  const { entrarDemo } = useSesion();
  const cuentas = useQuery({ queryKey: ["cuentas-demo"], queryFn: () => fuente.cuentasDemo() });
  const entrar = (id: string) =>
    entrarDemo.mutate(id, {
      onSuccess: () => void navigate({ to: "/" }),
      onError: (e) => toast.error(e.message),
    });

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">Elige una cuenta de ejemplo</p>
        <StatusBadge tone="warning">Modo demo</StatusBadge>
      </div>
      <p className="text-sm text-muted-foreground">
        Los datos se guardan solo en este navegador. El Administrador debe pasar la verificación en dos
        pasos (en la demo sirve cualquier código de 6 dígitos).
      </p>
      <ul className="divide-y divide-border">
        {(cuentas.data ?? []).map((p) => {
          const invitada = p.id.startsWith("inv:");
          return (
            <li key={p.id}>
              <button
                type="button"
                disabled={entrarDemo.isPending}
                onClick={() => entrar(p.id)}
                className="flex min-h-14 w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-secondary disabled:opacity-50"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-medium text-foreground">
                  {invitada ? <MailCheck className="size-4" aria-hidden="true" /> : iniciales(p.nombre)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{p.nombre}</span>
                  <span className="block text-xs text-muted-foreground">
                    {ROLE_LABEL[p.rol]}
                    {invitada && " · invitación pendiente: entrar la acepta"}
                    {!p.activa && " · cuenta desactivada"}
                  </span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function Ingreso() {
  const { data: acceso, isLoading } = useAcceso();
  if (isLoading) return <AppLoading logo={<Logo grande />} />;
  if (acceso?.habilitada) return <Navigate to="/" />;
  // Con sesión pero sin acceso completo (dos pasos, sin rol…), A3 decide.
  if (acceso) return <Navigate to="/" />;

  return (
    <PantallaAcceso titulo="Ingresa a DentiHub" descripcion="Tareas de terreno con checklist y foto de evidencia">
      {fuente.modo === "demo" ? <CuentasDemo /> : <FormularioIngreso />}
    </PantallaAcceso>
  );
}
