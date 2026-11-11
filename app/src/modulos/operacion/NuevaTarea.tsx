// O6 Crear y asignar tarea (Gestor y Administrador). Un solo formulario corto: primero la
// plantilla (trae los pasos y si exige foto), después responsable, área y vencimiento.
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Camera } from "lucide-react";
import { AccessDenied } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { esGestion } from "@/lib/permisos";
import { useAcceso } from "@/modulos/acceso/useAcceso";
import { useAreas, useCrearTarea, usePersonas, usePlantillas } from "@/modulos/operacion/consultas";

/** Hoy a las 18:00 en formato del campo datetime-local (hora local del teléfono). */
function vencimientoPorDefecto() {
  const d = new Date();
  d.setHours(18, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T18:00`;
}

export function NuevaTarea() {
  const navigate = useNavigate();
  const { data: acceso } = useAcceso();
  const plantillas = usePlantillas();
  const personas = usePersonas();
  const areas = useAreas();
  const crear = useCrearTarea();
  const [plantillaId, setPlantillaId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [responsableId, setResponsableId] = useState("sin");
  const [areaId, setAreaId] = useState("sin");
  const [vence, setVence] = useState(vencimientoPorDefecto);

  if (!esGestion(acceso?.rol)) return <AccessDenied>Solo un Gestor o un Administrador puede crear tareas.</AccessDenied>;

  const plantilla = plantillas.data?.find((p) => p.id === plantillaId);
  const activas = (personas.data ?? []).filter((p) => p.activa && p.rol === "tecnico");

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    crear.mutate(
      {
        titulo: titulo.trim() || plantilla?.nombre || "",
        plantillaId,
        responsableId: responsableId === "sin" ? null : responsableId,
        areaId: areaId === "sin" ? null : areaId,
        venceEn: vence ? new Date(vence).toISOString() : null,
      },
      { onSuccess: (id) => void navigate({ to: "/tareas/$id", params: { id } }) },
    );
  };

  return (
    <form onSubmit={enviar} className="mx-auto max-w-2xl space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link to="/tareas">
          <ArrowLeft /> Volver a tareas
        </Link>
      </Button>
      <PageHeader title="Crear tarea" description="Elige la plantilla y a quién se la asignas" />

      <Section title="Qué hay que hacer">
        <div className="space-y-2">
          <Label htmlFor="plantilla">Plantilla</Label>
          <Select value={plantillaId} onValueChange={setPlantillaId}>
            <SelectTrigger id="plantilla" className="h-11">
              <SelectValue placeholder="Elige una plantilla" />
            </SelectTrigger>
            <SelectContent>
              {(plantillas.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {plantilla && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              {plantilla.pasos.length} pasos
              {plantilla.exigeFoto && (
                <>
                  {" · "}
                  <Camera className="size-3.5" aria-hidden="true" /> exige foto
                </>
              )}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="titulo">Título</Label>
          <Input
            id="titulo"
            className="h-11"
            maxLength={200}
            value={titulo}
            onChange={(e) => setTitulo(e.currentTarget.value)}
            placeholder={plantilla ? `${plantilla.nombre} · lugar o equipo` : "Por ejemplo: Revisión de filtros · Sala 2"}
          />
          <p className="text-xs text-muted-foreground">Si lo dejas vacío, se usa el nombre de la plantilla.</p>
        </div>
      </Section>

      <Section title="Quién y cuándo">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="responsable">Responsable</Label>
            <Select value={responsableId} onValueChange={setResponsableId}>
              <SelectTrigger id="responsable" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sin">Sin asignar</SelectItem>
                {activas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="area">Área</Label>
            <Select value={areaId} onValueChange={setAreaId}>
              <SelectTrigger id="area" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sin">Sin área</SelectItem>
                {(areas.data ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="vence">Vence</Label>
            <Input id="vence" type="datetime-local" className="h-11" value={vence} onChange={(e) => setVence(e.currentTarget.value)} />
          </div>
        </div>
      </Section>

      <Button type="submit" className="h-12 w-full text-base" disabled={!plantillaId || crear.isPending}>
        {crear.isPending ? "Creando…" : "Crear tarea"}
      </Button>
    </form>
  );
}
