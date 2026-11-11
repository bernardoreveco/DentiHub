// Inicio. El Técnico ve «lo de hoy» y un acceso directo a sus tareas. El Gestor y el
// Administrador ven 4 cifras y la lista de atrasadas para actuar (panel del jefe, ver docs/referencias).
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { KpiCard } from "@/components/KpiCard";
import { PageLoading } from "@/components/Loading";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { Button } from "@/components/ui/button";
import { porcentaje } from "@/lib/formato";
import { esGestion } from "@/lib/permisos";
import { useAcceso } from "@/modulos/acceso/useAcceso";
import { useAreas, usePersonas, usePlantillas, useTareas } from "@/modulos/operacion/consultas";
import { estaAtrasada, pestanaDe } from "@/modulos/operacion/reglas";
import { TarjetaTarea } from "@/modulos/operacion/TarjetaTarea";

export function Inicio() {
  const { data: acceso } = useAcceso();
  const tareas = useTareas();
  const plantillas = usePlantillas();
  const areas = useAreas();
  const personas = usePersonas();

  if (tareas.isLoading) return <PageLoading />;
  if (tareas.error) throw tareas.error;

  const gestion = esGestion(acceso?.rol);
  const lista = tareas.data ?? [];
  const ahora = new Date();
  const hoy = lista.filter((t) => pestanaDe(t, ahora) === "hoy");
  const atrasadas = lista.filter((t) => estaAtrasada(t, ahora));
  const haceSiete = new Date(ahora.getTime() - 7 * 86400000);
  const semana = lista.filter((t) => t.completadaEn && new Date(t.completadaEn) >= haceSiete);
  const aTiempo = semana.filter((t) => !t.venceEn || (t.completadaEn ?? "") <= t.venceEn);
  const primerNombre = acceso?.nombre.split(" ")[0] ?? "";

  const tarjeta = (t: (typeof lista)[number]) => (
    <TarjetaTarea
      key={t.id}
      tarea={t}
      plantilla={plantillas.data?.find((p) => p.id === t.plantillaId)}
      area={areas.data?.find((a) => a.id === t.areaId)}
      responsable={personas.data?.find((p) => p.id === t.responsableId)}
      mostrarResponsable={gestion}
    />
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Hola, ${primerNombre}`}
        description={
          gestion
            ? "Así va el trabajo del equipo"
            : hoy.length === 0 && atrasadas.length === 0
              ? "No tienes tareas pendientes para hoy"
              : `Tienes ${hoy.length + atrasadas.length} ${hoy.length + atrasadas.length === 1 ? "tarea pendiente" : "tareas pendientes"}`
        }
        actions={
          <Button asChild variant={gestion ? "outline" : "default"}>
            <Link to="/tareas">
              <ClipboardList /> {gestion ? "Ver tareas" : "Ir a mis tareas"}
            </Link>
          </Button>
        }
      />

      {gestion && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard title="Para hoy" value={hoy.length} info="Tareas abiertas que vencen hoy o no tienen vencimiento." />
          <KpiCard title="Atrasadas" value={atrasadas.length} {...(atrasadas.length ? { tone: "alert" as const } : {})} info="Tareas abiertas cuyo vencimiento ya pasó." />
          <KpiCard title="Completadas" value={semana.length} hint="Últimos 7 días" />
          <KpiCard
            title="A tiempo"
            value={porcentaje(aTiempo.length, semana.length)}
            hint="De las completadas en 7 días"
            info="Porcentaje de tareas completadas antes de su vencimiento."
          />
        </div>
      )}

      {atrasadas.length > 0 && (
        <Section title="Atrasadas" info="Ordenadas de la más antigua a la más nueva.">
          <div className="grid gap-3 lg:grid-cols-2">
            {[...atrasadas].sort((a, b) => (a.venceEn ?? "").localeCompare(b.venceEn ?? "")).map(tarjeta)}
          </div>
        </Section>
      )}

      <Section title="Para hoy">
        {hoy.length === 0 ? (
          <EmptyState icon={AlertTriangle} title="Nada pendiente para hoy" />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">{hoy.map(tarjeta)}</div>
        )}
      </Section>
    </div>
  );
}
