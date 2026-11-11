// Tarjeta de tarea para listas (O1). Grande y tocable, con lo que el técnico necesita sin abrirla:
// título, área, vencimiento, avance del checklist y si exige foto (idea de las apps de terreno).
import { Link } from "@tanstack/react-router";
import { Camera, ChevronRight } from "lucide-react";
import type { Area, Persona, Plantilla, Tarea } from "@/datos/tipos";
import { vencimiento } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { EstadoTarea } from "@/modulos/operacion/estados";
import { avance, estaAtrasada } from "@/modulos/operacion/reglas";

export function TarjetaTarea({
  tarea,
  plantilla,
  area,
  responsable,
  mostrarResponsable,
}: {
  tarea: Tarea;
  plantilla: Plantilla | undefined;
  area: Area | undefined;
  responsable: Persona | undefined;
  mostrarResponsable: boolean;
}) {
  const a = plantilla ? avance(plantilla, tarea) : { hechos: 0, total: 0 };
  const atrasada = estaAtrasada(tarea);
  return (
    <Link
      to="/tareas/$id"
      params={{ id: tarea.id }}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-secondary/60"
    >
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <EstadoTarea tarea={tarea} />
          {plantilla?.exigeFoto && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Camera className="size-3.5" aria-hidden="true" /> Exige foto
            </span>
          )}
        </div>
        <p className="font-medium text-foreground">{tarea.titulo}</p>
        <p className="text-sm text-muted-foreground">
          <span className={cn(atrasada && "font-medium text-destructive")}>
            {tarea.estado === "completada" ? "Completada" : vencimiento(tarea.venceEn)}
          </span>
          {area && ` · ${area.nombre}`}
          {mostrarResponsable && ` · ${responsable?.nombre ?? "Sin asignar"}`}
        </p>
        {a.total > 0 && tarea.estado !== "completada" && (
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(a.hechos / a.total) * 100}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {a.hechos} de {a.total}
            </span>
          </div>
        )}
      </div>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
