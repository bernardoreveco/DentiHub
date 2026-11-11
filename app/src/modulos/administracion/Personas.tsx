// Administración · Personas: rol, áreas y estado de cada cuenta; activar y desactivar.
// Invitar personas queda para la fuente Supabase (función de servidor con la clave de servicio,
// ADR-0004); en la demo el botón explica por qué no está.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ScrollText, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { PageLoading } from "@/components/Loading";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fuente } from "@/datos/fuente";
import { ROLE_LABEL } from "@/lib/roles";
import { useAcceso } from "@/modulos/acceso/useAcceso";
import { useAreas, usePersonas } from "@/modulos/operacion/consultas";

export function Personas() {
  const { data: acceso } = useAcceso();
  const personas = usePersonas();
  const areas = useAreas();
  const qc = useQueryClient();
  const cambiar = useMutation({
    mutationFn: (v: { id: string; activa: boolean }) => fuente.cambiarEstadoPersona(v.id, v.activa),
    onSuccess: async (_d, v) => {
      await Promise.all([qc.invalidateQueries({ queryKey: ["personas"] }), qc.invalidateQueries({ queryKey: ["auditoria"] })]);
      toast.success(v.activa ? "Cuenta activada" : "Cuenta desactivada");
    },
    onError: (e) => toast.error(e.message),
  });

  if (personas.isLoading) return <PageLoading />;
  if (personas.error) throw personas.error;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Personas"
        description="Quién usa DentiHub, con qué rol y en qué área"
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/admin/auditoria">
                <ScrollText /> Ver auditoría
              </Link>
            </Button>
            <Button onClick={() => toast.info("Invitar personas estará disponible al conectar la base de datos.")}>
              <UserPlus /> Invitar persona
            </Button>
          </>
        }
      />
      <Section title="Cuentas">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Áreas</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(personas.data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <p className="font-medium">{p.nombre}</p>
                    <p className="text-xs text-muted-foreground">{p.correo}</p>
                  </TableCell>
                  <TableCell>{ROLE_LABEL[p.rol]}</TableCell>
                  <TableCell>
                    {p.areaIds.length
                      ? p.areaIds.map((id) => areas.data?.find((a) => a.id === id)?.nombre ?? "—").join(", ")
                      : "Todas"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge tone={p.activa ? "success" : "neutral"}>{p.activa ? "Activa" : "Desactivada"}</StatusBadge>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={cambiar.isPending || p.id === acceso?.userId}
                      onClick={() => cambiar.mutate({ id: p.id, activa: !p.activa })}
                    >
                      {p.activa ? "Desactivar" : "Activar"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>
    </div>
  );
}
