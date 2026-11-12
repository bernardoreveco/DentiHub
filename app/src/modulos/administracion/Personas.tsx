// Administración · Personas: cuentas con rol, áreas y estado; invitar; activar y desactivar.
// Desactivar corta los datos de inmediato (base) y bloquea el ingreso (Auth), ADR-0005.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ScrollText, UserPlus } from "lucide-react";
import { PageLoading } from "@/components/Loading";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROLE_LABEL } from "@/lib/roles";
import { useAcceso } from "@/modulos/acceso/useAcceso";
import { useCambiarEstado } from "@/modulos/administracion/consultas";
import { DialogoInvitar } from "@/modulos/administracion/DialogoInvitar";
import { Invitaciones } from "@/modulos/administracion/Invitaciones";
import { useAreas, usePersonas } from "@/modulos/operacion/consultas";

export function Personas() {
  const { data: acceso } = useAcceso();
  const personas = usePersonas();
  const areas = useAreas();
  const cambiar = useCambiarEstado();
  const [invitando, setInvitando] = useState(false);

  if (personas.isLoading) return <PageLoading />;
  if (personas.error) throw personas.error;

  const desactivar = (id: string, nombre: string, activa: boolean) => {
    if (
      !activa &&
      !window.confirm(`¿Desactivar a ${nombre}? Dejará de ver datos de inmediato y no podrá volver a ingresar.`)
    )
      return;
    cambiar.mutate({ id, activa });
  };

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
            <Button onClick={() => setInvitando(true)}>
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
                    <StatusBadge tone={p.activa ? "success" : "neutral"}>
                      {p.activa ? "Activa" : "Desactivada"}
                    </StatusBadge>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={cambiar.isPending || p.id === acceso?.userId}
                      onClick={() => desactivar(p.id, p.nombre, !p.activa)}
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
      <Invitaciones areas={areas.data ?? []} />
      <DialogoInvitar abierto={invitando} onCambio={setInvitando} areas={areas.data ?? []} />
    </div>
  );
}
