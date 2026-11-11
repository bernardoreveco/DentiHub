// Administración · Auditoría: registro de solo lectura (quién, qué, módulo y cuándo). Sin botones
// de editar ni borrar: en la base el registro es de solo inserción.
import { useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { PageLoading } from "@/components/Loading";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { StatusBadge } from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fuente } from "@/datos/fuente";
import { fechaHora } from "@/lib/formato";
import { usePersonas } from "@/modulos/operacion/consultas";

const MODULO = { acceso: "Acceso", administracion: "Administración", operacion: "Operación" } as const;

export function Auditoria() {
  const registros = useQuery({ queryKey: ["auditoria"], queryFn: () => fuente.auditoria() });
  const personas = usePersonas();

  if (registros.isLoading) return <PageLoading />;
  if (registros.error) throw registros.error;
  const filas = registros.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader title="Auditoría" description="Todo lo que se hizo en DentiHub. Solo lectura" />
      <Section title="Registro">
        {filas.length === 0 ? (
          <EmptyState icon={ScrollText} title="Aún no hay registros" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Persona</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Módulo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filas.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">{fechaHora(r.creadaEn)}</TableCell>
                    <TableCell>{personas.data?.find((p) => p.id === r.actorId)?.nombre ?? "Sistema"}</TableCell>
                    <TableCell>{r.accion}</TableCell>
                    <TableCell>
                      <StatusBadge>{MODULO[r.modulo]}</StatusBadge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>
    </div>
  );
}
