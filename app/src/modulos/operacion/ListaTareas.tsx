// O1 Mis tareas (Técnico) / Tareas del equipo (Gestor y Administrador).
// Pestañas Hoy · Atrasadas · Próximas · Hechas: lo urgente primero, como en las apps de terreno.
// El Técnico solo recibe sus tareas desde la fuente (en Supabase, la RLS); la pantalla no filtra
// por seguridad, solo por pestaña y responsable.
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ClipboardCheck, Plus } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { FilterPills } from "@/components/FilterPills";
import { PageLoading } from "@/components/Loading";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { esGestion } from "@/lib/permisos";
import { useAcceso } from "@/modulos/acceso/useAcceso";
import { useAreas, usePersonas, usePlantillas, useTareas } from "@/modulos/operacion/consultas";
import { pestanaDe, type Pestana } from "@/modulos/operacion/reglas";
import type { Tarea } from "@/datos/tipos";
import { TarjetaTarea } from "@/modulos/operacion/TarjetaTarea";

const VACIO: Record<Pestana, string> = {
  hoy: "No tienes tareas para hoy.",
  atrasadas: "No hay tareas atrasadas. ¡Bien!",
  proximas: "No hay tareas para los próximos días.",
  hechas: "Todavía no hay tareas completadas.",
};

export function ListaTareas() {
  const { data: acceso } = useAcceso();
  const gestion = esGestion(acceso?.rol);
  const tareas = useTareas();
  const plantillas = usePlantillas();
  const areas = useAreas();
  const personas = usePersonas();
  const [pestana, setPestana] = useState<Pestana>("hoy");
  const [responsable, setResponsable] = useState("todos");

  const porPestana = useMemo(() => {
    const ahora = new Date();
    const base: Record<Pestana, Tarea[]> = { hoy: [], atrasadas: [], proximas: [], hechas: [] };
    const lista = (tareas.data ?? []).filter(
      (t) => responsable === "todos" || (t.responsableId ?? "sin") === responsable,
    );
    for (const t of lista) {
      const p = pestanaDe(t, ahora);
      if (p) base[p].push(t);
    }
    base.hechas.sort((a, b) => (b.completadaEn ?? "").localeCompare(a.completadaEn ?? ""));
    for (const k of ["hoy", "atrasadas", "proximas"] as const)
      base[k].sort((a, b) => (a.venceEn ?? "9").localeCompare(b.venceEn ?? "9"));
    return base;
  }, [tareas.data, responsable]);

  if (tareas.isLoading) return <PageLoading />;
  if (tareas.error) throw tareas.error;

  const visibles = porPestana[pestana];
  const tecnicos = (personas.data ?? []).filter((p) => p.rol === "tecnico");

  return (
    <div className="space-y-5">
      <PageHeader
        title={gestion ? "Tareas del equipo" : "Mis tareas"}
        description={gestion ? "Crea, asigna y revisa el avance de cada tarea" : "Pulsa una tarea para abrir su checklist"}
        actions={
          gestion && (
            <Button asChild>
              <Link to="/tareas/nueva">
                <Plus /> Crear tarea
              </Link>
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterPills
          ariaLabel="Filtrar tareas"
          value={pestana}
          onChange={setPestana}
          items={[
            { value: "hoy", label: `Hoy (${porPestana.hoy.length})` },
            { value: "atrasadas", label: `Atrasadas (${porPestana.atrasadas.length})` },
            { value: "proximas", label: `Próximas (${porPestana.proximas.length})` },
            { value: "hechas", label: `Hechas (${porPestana.hechas.length})` },
          ]}
        />
        {gestion && (
          <Select value={responsable} onValueChange={setResponsable}>
            <SelectTrigger className="w-full sm:w-56" aria-label="Responsable">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas las personas</SelectItem>
              <SelectItem value="sin">Sin asignar</SelectItem>
              {tecnicos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {visibles.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title={VACIO[pestana]} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visibles.map((t) => (
            <TarjetaTarea
              key={t.id}
              tarea={t}
              plantilla={plantillas.data?.find((p) => p.id === t.plantillaId)}
              area={areas.data?.find((a) => a.id === t.areaId)}
              responsable={personas.data?.find((p) => p.id === t.responsableId)}
              mostrarResponsable={gestion}
            />
          ))}
        </div>
      )}
    </div>
  );
}
