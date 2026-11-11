// Consultas y escrituras de Operación con TanStack Query: un hook por consulta, llaves estables.
// Después de cada escritura se invalidan las llaves afectadas para que todas las pantallas se pongan al día.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fuente } from "@/datos/fuente";
import type { NuevaTarea, Respuesta } from "@/datos/tipos";

export const usePersonas = () => useQuery({ queryKey: ["personas"], queryFn: () => fuente.personas() });
export const useAreas = () => useQuery({ queryKey: ["areas"], queryFn: () => fuente.areas() });
export const usePlantillas = () => useQuery({ queryKey: ["plantillas"], queryFn: () => fuente.plantillas() });
export const useTareas = () => useQuery({ queryKey: ["tareas"], queryFn: () => fuente.tareas() });
export const useTarea = (id: string) =>
  useQuery({ queryKey: ["tareas", id], queryFn: () => fuente.tarea(id) });
export const useEvidencias = (tareaId: string) =>
  useQuery({ queryKey: ["evidencias", tareaId], queryFn: () => fuente.evidencias(tareaId) });

const avisarError = (e: unknown) =>
  toast.error(e instanceof Error ? e.message : "Algo salió mal. Inténtalo de nuevo.");

function useRefrescar() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["tareas"] }),
      qc.invalidateQueries({ queryKey: ["evidencias"] }),
      qc.invalidateQueries({ queryKey: ["auditoria"] }),
    ]);
}

export function useGuardarAvance(tareaId: string) {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: (r: Record<string, Respuesta>) => fuente.guardarAvance(tareaId, r),
    onSuccess: refrescar,
    onError: avisarError,
  });
}

export function useSubirEvidencia(tareaId: string) {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: (foto: Blob) => fuente.subirEvidencia(tareaId, foto),
    onSuccess: async () => {
      await refrescar();
      toast.success("Foto agregada");
    },
    onError: avisarError,
  });
}

export function useCompletar(tareaId: string) {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: () => fuente.completar(tareaId),
    onSuccess: async () => {
      await refrescar();
      toast.success("Tarea completada");
    },
    onError: avisarError,
  });
}

export function useCancelar(tareaId: string) {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: (motivo: string) => fuente.cancelar(tareaId, motivo),
    onSuccess: async () => {
      await refrescar();
      toast.success("Tarea cancelada");
    },
    onError: avisarError,
  });
}

export function useCrearTarea() {
  const refrescar = useRefrescar();
  return useMutation({
    mutationFn: (d: NuevaTarea) => fuente.crearTarea(d),
    onSuccess: async () => {
      await refrescar();
      toast.success("Tarea creada");
    },
    onError: avisarError,
  });
}
