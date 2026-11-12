// Encabezado: nombre y rol de la persona, reiniciar la demo y salir (A8 Cerrar sesión).
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { fuente } from "@/datos/fuente";
import type { ContextoAcceso } from "@/datos/tipos";
import { ROLE_LABEL } from "@/lib/roles";
import { useSesion } from "@/modulos/acceso/useAcceso";

export function MenuPersona({ acceso }: { acceso: ContextoAcceso }) {
  const { salir } = useSesion();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const demo = fuente.modo === "demo";

  const reiniciar = async () => {
    if (!window.confirm("¿Volver a los datos de ejemplo? Se borran las tareas y fotos que agregaste."))
      return;
    await fuente.reiniciar();
    await qc.invalidateQueries();
    toast.success("Demo reiniciada");
  };

  return (
    <>
      {demo && (
        <StatusBadge tone="warning" className="hidden sm:inline-flex">
          Modo demo
        </StatusBadge>
      )}
      <div className="min-w-0 text-right leading-tight">
        <p className="truncate text-sm font-medium text-foreground">{acceso.nombre}</p>
        <p className="text-xs text-muted-foreground">
          {acceso.rol ? ROLE_LABEL[acceso.rol] : "Sin rol"}
        </p>
      </div>
      {demo && (
        <Button variant="ghost" size="icon" onClick={reiniciar} aria-label="Reiniciar demo" title="Reiniciar demo">
          <RotateCcw className="size-4" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Salir"
        title="Salir"
        onClick={() => salir.mutate(undefined, { onSettled: () => void navigate({ to: "/ingreso" }) })}
      >
        <LogOut className="size-4" />
      </Button>
    </>
  );
}
