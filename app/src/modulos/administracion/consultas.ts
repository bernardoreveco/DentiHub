// Consultas y escrituras de Administración (TanStack Query). Las reglas las aplica la base:
// invitar, reenviar, revocar y bloquear exigen Administrador con verificación en dos pasos (ADR-0005).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fuente } from "@/datos/fuente";
import type { NuevaInvitacion, ResultadoInvitacion } from "@/datos/tipos";

const avisarError = (e: unknown) =>
  toast.error(e instanceof Error ? e.message : "Algo salió mal. Inténtalo de nuevo.");

export const useInvitaciones = () =>
  useQuery({ queryKey: ["invitaciones"], queryFn: () => fuente.invitaciones() });

function useRefrescar() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["invitaciones"] }),
      qc.invalidateQueries({ queryKey: ["personas"] }),
      qc.invalidateQueries({ queryKey: ["auditoria"] }),
    ]);
}

/** Muestra el resultado del envío: la invitación puede quedar registrada aunque el correo falle. */
const avisarEnvio = (r: ResultadoInvitacion, exito: string) => {
  if (r.aviso) (r.enviado ? toast.info : toast.warning)(r.aviso);
  else toast.success(exito);
};

export function useInvitar() {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: (d: NuevaInvitacion) => fuente.invitar(d),
    onSuccess: async (r) => {
      await refrescar();
      avisarEnvio(r, "Invitación enviada");
    },
    onError: avisarError,
  });
}

export function useReenviar() {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: (id: string) => fuente.reenviarInvitacion(id),
    onSuccess: async (r) => {
      await refrescar();
      avisarEnvio(r, "Invitación reenviada");
    },
    onError: avisarError,
  });
}

export function useRevocar() {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: (id: string) => fuente.revocarInvitacion(id),
    onSuccess: async () => {
      await refrescar();
      toast.success("Invitación revocada");
    },
    onError: avisarError,
  });
}

export function useCambiarEstado() {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: (v: { id: string; activa: boolean }) => fuente.cambiarEstadoPersona(v.id, v.activa),
    onSuccess: async (aviso, v) => {
      await refrescar();
      if (aviso) toast.warning(aviso);
      else toast.success(v.activa ? "Cuenta activada" : "Cuenta desactivada y bloqueada");
    },
    onError: avisarError,
  });
}
