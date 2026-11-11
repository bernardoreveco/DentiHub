// Reportes simples de la Etapa 1: cumplimiento por persona y por área en un periodo.
// Sin gráficos complejos (ADR-0002). Tablas: datos a la izquierda, encabezado centrado, cifras tabulares.
// NOTA: en la demo se calcula en el navegador; con Supabase se agrega en la base (una vista o
// función), no trayendo todas las tareas (deuda que no se hereda de Dentiventario).
import { useMemo, useState } from "react";
import { FilterPills } from "@/components/FilterPills";
import { PageLoading } from "@/components/Loading";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Tarea } from "@/datos/tipos";
import { porcentaje } from "@/lib/formato";
import { useAreas, usePersonas, useTareas } from "@/modulos/operacion/consultas";
import { estaAtrasada } from "@/modulos/operacion/reglas";

type Periodo = "7" | "30" | "90";

type Fila = { clave: string; nombre: string; asignadas: number; completadas: number; aTiempo: number; atrasadas: number };

function agrupar(tareas: Tarea[], clave: (t: Tarea) => string | null, nombre: (k: string) => string): Fila[] {
  const mapa = new Map<string, Fila>();
  const ahora = new Date();
  for (const t of tareas) {
    const k = clave(t) ?? "sin";
    const f = mapa.get(k) ?? { clave: k, nombre: nombre(k), asignadas: 0, completadas: 0, aTiempo: 0, atrasadas: 0 };
    f.asignadas++;
    if (t.estado === "completada") {
      f.completadas++;
      if (!t.venceEn || (t.completadaEn ?? "") <= t.venceEn) f.aTiempo++;
    }
    if (estaAtrasada(t, ahora)) f.atrasadas++;
    mapa.set(k, f);
  }
  return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

function TablaCumplimiento({ filas, columna }: { filas: Fila[]; columna: string }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{columna}</TableHead>
            <TableHead>Asignadas</TableHead>
            <TableHead>Completadas</TableHead>
            <TableHead>A tiempo</TableHead>
            <TableHead>Atrasadas</TableHead>
            <TableHead>Cumplimiento</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((f) => (
            <TableRow key={f.clave}>
              <TableCell className="font-medium">{f.nombre}</TableCell>
              <TableCell className="tabular-nums">{f.asignadas}</TableCell>
              <TableCell className="tabular-nums">{f.completadas}</TableCell>
              <TableCell className="tabular-nums">{f.aTiempo}</TableCell>
              <TableCell className={f.atrasadas ? "tabular-nums font-medium text-destructive" : "tabular-nums"}>
                {f.atrasadas}
              </TableCell>
              <TableCell className="tabular-nums">{porcentaje(f.completadas, f.asignadas)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function Reportes() {
  const tareas = useTareas();
  const personas = usePersonas();
  const areas = useAreas();
  const [periodo, setPeriodo] = useState<Periodo>("30");

  const enPeriodo = useMemo(() => {
    const desde = Date.now() - Number(periodo) * 86400000;
    // Una tarea entra al periodo por su vencimiento (o su creación si no tiene); las canceladas no cuentan.
    return (tareas.data ?? []).filter(
      (t) => t.estado !== "cancelada" && new Date(t.venceEn ?? t.creadaEn).getTime() >= desde,
    );
  }, [tareas.data, periodo]);

  if (tareas.isLoading) return <PageLoading />;
  if (tareas.error) throw tareas.error;

  const nombrePersona = (k: string) => personas.data?.find((p) => p.id === k)?.nombre ?? "Sin asignar";
  const nombreArea = (k: string) => areas.data?.find((a) => a.id === k)?.nombre ?? "Sin área";

  return (
    <div className="space-y-5">
      <PageHeader title="Reportes" description="Cumplimiento de las tareas por persona y por área" />
      <FilterPills
        ariaLabel="Periodo"
        value={periodo}
        onChange={setPeriodo}
        items={[
          { value: "7", label: "7 días" },
          { value: "30", label: "30 días" },
          { value: "90", label: "90 días" },
        ]}
      />
      <Section title="Por persona" info="Cumplimiento = completadas sobre asignadas en el periodo.">
        <TablaCumplimiento filas={agrupar(enPeriodo, (t) => t.responsableId, nombrePersona)} columna="Persona" />
      </Section>
      <Section title="Por área">
        <TablaCumplimiento filas={agrupar(enPeriodo, (t) => t.areaId, nombreArea)} columna="Área" />
      </Section>
    </div>
  );
}
