// Mapa estado → etiqueta y tono. Mismo significado de color en toda la app: ámbar = atención,
// verde = correcto, rojo = atrasada o bloqueada, gris = sin acción.
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import type { Tarea } from "@/datos/tipos";
import { estaAtrasada } from "@/modulos/operacion/reglas";

const ESTADO: Record<Tarea["estado"], { label: string; tone: StatusTone }> = {
  pendiente: { label: "Pendiente", tone: "warning" },
  en_progreso: { label: "En curso", tone: "info" },
  completada: { label: "Completada", tone: "success" },
  cancelada: { label: "Cancelada", tone: "neutral" },
};

export function EstadoTarea({ tarea }: { tarea: Pick<Tarea, "estado" | "venceEn"> }) {
  if (estaAtrasada(tarea)) return <StatusBadge tone="danger">Atrasada</StatusBadge>;
  const e = ESTADO[tarea.estado];
  return <StatusBadge tone={e.tone}>{e.label}</StatusBadge>;
}
