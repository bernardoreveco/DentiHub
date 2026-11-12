// A9 Confirmar enlace (ruta /auth/confirmar). Todos los enlaces de correo (invitación y recuperación)
// llegan aquí con ?token_hash=…&type=invite|recovery. El código NO se canjea al abrir la página: se
// canjea al pulsar «Continuar». Por qué: los antivirus de correo corporativo abren los enlaces antes
// que la persona; si el canje fuera automático, el enlace de un solo uso llegaría gastado (ADR-0005).
import { useMutation } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { fuente } from "@/datos/fuente";
import { ErrorFormulario, PantallaAcceso } from "@/modulos/acceso/PantallaAcceso";

const TIPOS = ["invite", "recovery"] as const;
type Tipo = (typeof TIPOS)[number];

type Enlace = { tokenHash: string; tipo: Tipo } | { codigo: string };

function leerEnlace(busqueda: string): Enlace | null {
  const q = new URLSearchParams(busqueda);
  // Formato por defecto de Supabase (?code=<uuid>): se acepta mientras la plantilla del correo no use token_hash.
  const codigo = q.get("code") ?? "";
  if (/^[0-9a-f-]{20,64}$/i.test(codigo)) return { codigo };
  const tokenHash = q.get("token_hash") ?? "";
  const tipo = q.get("type") ?? "";
  // Solo los dos tipos esperados y un token con forma razonable; lo demás es un enlace alterado.
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(tokenHash) || !(TIPOS as readonly string[]).includes(tipo)) return null;
  return { tokenHash, tipo: tipo as Tipo };
}

export function ConfirmarEnlace() {
  const navigate = useNavigate();
  // Se lee desde el enrutador (y no de window.location) para que la pantalla siga a la dirección actual.
  const enlace = leerEnlace(useRouterState({ select: (s) => s.location.searchStr }));
  const canjear = useMutation({
    mutationFn: (e: Enlace) =>
      "codigo" in e ? fuente.canjearCodigo(e.codigo) : fuente.canjearEnlace(e.tokenHash, e.tipo),
    // El enlace ya se usó: se quita de la barra de direcciones y se pasa a definir la clave (A6).
    onSuccess: () => void navigate({ to: "/clave-nueva", replace: true }),
  });

  if (!enlace) {
    return (
      <PantallaAcceso titulo="Enlace incompleto" descripcion="El enlace está incompleto o fue alterado." rol="alert">
        <Button asChild className="w-full">
          <Link to="/recuperar">Pedir un enlace nuevo</Link>
        </Button>
      </PantallaAcceso>
    );
  }

  const esInvitacion = "tipo" in enlace && enlace.tipo === "invite";
  return (
    <PantallaAcceso
      titulo={esInvitacion ? "Activa tu cuenta" : "Cambia tu clave"}
      descripcion={
        esInvitacion
          ? "Te invitaron a DentiHub. Pulsa Continuar para crear tu clave."
          : "Pulsa Continuar para crear una clave nueva."
      }
    >
      {canjear.error && <ErrorFormulario>{canjear.error.message}</ErrorFormulario>}
      <Button className="h-11 w-full" disabled={canjear.isPending} onClick={() => canjear.mutate(enlace)}>
        {canjear.isPending ? "Comprobando…" : "Continuar"}
      </Button>
      {canjear.error && (
        <Button asChild variant="outline" className="w-full">
          <Link to="/recuperar">Pedir un enlace nuevo</Link>
        </Button>
      )}
    </PantallaAcceso>
  );
}
