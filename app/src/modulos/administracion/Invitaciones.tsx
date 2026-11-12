// Lista de invitaciones con su estado y las acciones Reenviar y Revocar (ADR-0005).
import { MailPlus } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Section } from "@/components/Section";
import { StatusBadge, type StatusTone } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Area, EstadoInvitacion } from "@/datos/tipos";
import { fecha } from "@/lib/formato";
import { ROLE_LABEL } from "@/lib/roles";
import { useInvitaciones, useReenviar, useRevocar } from "@/modulos/administracion/consultas";

const ESTADO: Record<EstadoInvitacion, { label: string; tone: StatusTone }> = {
  pendiente: { label: "Pendiente de envío", tone: "warning" },
  enviada: { label: "Enviada", tone: "info" },
  error_envio: { label: "Error de envío", tone: "danger" },
  aceptada: { label: "Aceptada", tone: "success" },
  vencida: { label: "Vencida", tone: "neutral" },
  revocada: { label: "Revocada", tone: "neutral" },
};

export function Invitaciones({ areas }: { areas: Area[] }) {
  const lista = useInvitaciones();
  const reenviar = useReenviar();
  const revocar = useRevocar();
  const filas = lista.data ?? [];

  return (
    <Section title="Invitaciones" info="Vencen a los 7 días. Reenviar extiende el plazo y manda un correo nuevo.">
      {lista.error ? (
        <p className="text-sm text-destructive">{lista.error.message}</p>
      ) : filas.length === 0 ? (
        <EmptyState icon={MailPlus} title="Aún no hay invitaciones" />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Correo</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Áreas</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Vence</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((i) => {
                const e = ESTADO[i.estado];
                const abierta = i.estado === "pendiente" || i.estado === "enviada" || i.estado === "error_envio" || i.estado === "vencida";
                return (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.correo}</TableCell>
                    <TableCell>{ROLE_LABEL[i.rol]}</TableCell>
                    <TableCell>
                      {i.areaIds.length
                        ? i.areaIds.map((id) => areas.find((a) => a.id === id)?.nombre ?? "—").join(", ")
                        : "Sin área"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={e.tone}>{e.label}</StatusBadge>
                    </TableCell>
                    <TableCell className="tabular-nums">{fecha(i.venceEn)}</TableCell>
                    <TableCell>
                      {abierta && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={reenviar.isPending}
                            onClick={() => reenviar.mutate(i.id)}
                          >
                            Reenviar
                          </Button>
                          {i.estado !== "vencida" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              disabled={revocar.isPending}
                              onClick={() => revocar.mutate(i.id)}
                            >
                              Revocar
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}
