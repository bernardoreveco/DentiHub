// O2 Detalle de la tarea, con O3 (checklist), O4 (foto), O5 (completar) y O8 (cancelar).
// Orden pensado para el celular: estado y avance arriba, pasos al medio, foto y botón al final.
// El botón «Completar tarea» queda bloqueado y dice qué falta (misma regla que complete_task).
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { AccessDenied } from "@/components/EmptyState";
import { PageLoading } from "@/components/Loading";
import { Section } from "@/components/Section";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { Respuesta } from "@/datos/tipos";
import { fechaHora, vencimiento } from "@/lib/formato";
import { esGestion } from "@/lib/permisos";
import { useAcceso } from "@/modulos/acceso/useAcceso";
import {
  useAreas,
  useCancelar,
  useCompletar,
  useEvidencias,
  useGuardarAvance,
  usePersonas,
  usePlantillas,
  useTarea,
} from "@/modulos/operacion/consultas";
import { EstadoTarea } from "@/modulos/operacion/estados";
import { FotoEvidencia } from "@/modulos/operacion/FotoEvidencia";
import { PasoChecklist } from "@/modulos/operacion/PasoChecklist";
import { avance, faltantes, textoFaltantes } from "@/modulos/operacion/reglas";

export function DetalleTarea({ id }: { id: string }) {
  const navigate = useNavigate();
  const { data: acceso } = useAcceso();
  const tarea = useTarea(id);
  const evidencias = useEvidencias(id);
  const plantillas = usePlantillas();
  const personas = usePersonas();
  const areas = useAreas();
  const guardar = useGuardarAvance(id);
  const completar = useCompletar(id);
  const cancelar = useCancelar(id);
  const [motivo, setMotivo] = useState("");
  const [cancelando, setCancelando] = useState(false);

  if (tarea.isLoading || plantillas.isLoading) return <PageLoading />;
  if (tarea.error) throw tarea.error;
  const t = tarea.data;
  const plantilla = plantillas.data?.find((p) => p.id === t?.plantillaId);
  if (!t || !plantilla) return <AccessDenied>No encontramos la tarea o no tienes acceso a ella.</AccessDenied>;

  const cerrada = t.estado === "completada" || t.estado === "cancelada";
  const gestion = esGestion(acceso?.rol);
  // Igual que la base: trabaja la tarea quien la tiene asignada o la gestión.
  const puedeTrabajar = !cerrada && (gestion || t.responsableId === acceso?.userId);
  const fotos = evidencias.data ?? [];
  const falta = faltantes(plantilla, t, fotos);
  const { hechos, total } = avance(plantilla, t);
  const nombre = (pid: string | null) => personas.data?.find((p) => p.id === pid)?.nombre ?? "Sin asignar";

  const responder = (key: string, v: Respuesta) => {
    if (t.respuestas[key] === v) return;
    guardar.mutate({ [key]: v });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-4">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/tareas">
          <ArrowLeft /> Volver a tareas
        </Link>
      </Button>

      <div className="space-y-2">
        <EstadoTarea tarea={t} />
        <h1 className="text-xl font-semibold text-foreground">{t.titulo}</h1>
        <p className="text-sm text-muted-foreground">
          {vencimiento(t.venceEn)} · {areas.data?.find((a) => a.id === t.areaId)?.nombre ?? "Sin área"} ·{" "}
          {nombre(t.responsableId)}
        </p>
        {total > 0 && (
          <div className="flex items-center gap-2 pt-1">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(hechos / total) * 100}%` }} />
            </div>
            <span className="text-sm tabular-nums text-muted-foreground">
              {hechos} de {total} pasos
            </span>
          </div>
        )}
      </div>

      {t.estado === "completada" && (
        <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm text-foreground">
          <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
          Completada por {nombre(t.completadaPor)} el {fechaHora(t.completadaEn)}
        </div>
      )}
      {t.estado === "cancelada" && (
        <div className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
          Cancelada el {fechaHora(t.canceladaEn)}. Motivo: {t.motivoCancelacion}
        </div>
      )}

      <Section title="Checklist" info={`Plantilla «${plantilla.nombre}», versión ${plantilla.version}`}>
        <div className="space-y-2">
          {plantilla.pasos.map((p) => (
            <PasoChecklist
              key={p.key}
              paso={p}
              valor={t.respuestas[p.key]}
              bloqueado={!puedeTrabajar}
              onCambio={(v) => responder(p.key, v)}
            />
          ))}
        </div>
      </Section>

      <Section title="Foto de evidencia">
        <FotoEvidencia
          tareaId={t.id}
          evidencias={fotos}
          exige={plantilla.exigeFoto}
          minimo={plantilla.minFotos}
          bloqueado={!puedeTrabajar}
        />
      </Section>

      {puedeTrabajar && (
        // En celular el botón queda pegado abajo, siempre a mano.
        <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-border bg-background px-4 py-3 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
          {falta.length > 0 && <p className="text-center text-sm text-warning-foreground">{textoFaltantes(falta)}</p>}
          <Button
            className="h-12 w-full text-base"
            disabled={falta.length > 0 || completar.isPending}
            onClick={() => completar.mutate(undefined, { onSuccess: () => void navigate({ to: "/tareas" }) })}
          >
            <CheckCircle2 /> {completar.isPending ? "Completando…" : "Completar tarea"}
          </Button>
          {gestion && (
            <Button variant="ghost" className="w-full text-destructive" onClick={() => setCancelando(true)}>
              Cancelar tarea
            </Button>
          )}
        </div>
      )}

      <Dialog open={cancelando} onOpenChange={setCancelando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar tarea</DialogTitle>
            <DialogDescription>
              La tarea deja de estar pendiente y queda en la auditoría con el motivo.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.currentTarget.value)}
            maxLength={500}
            placeholder="Escribe el motivo"
            aria-label="Motivo de la cancelación"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelando(false)}>
              Volver
            </Button>
            <Button
              variant="destructive"
              disabled={!motivo.trim() || cancelar.isPending}
              onClick={() => cancelar.mutate(motivo, { onSuccess: () => setCancelando(false) })}
            >
              Cancelar tarea
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
