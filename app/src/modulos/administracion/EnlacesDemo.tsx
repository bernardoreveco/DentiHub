// Administración › Enlaces de demo (ADR-0007). El Administrador crea un enlace con nombre y vigencia;
// el código se muestra UNA sola vez para copiarlo. La lista muestra uso, vencimiento y permite revocar.
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Section } from "@/components/Section";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fuente } from "@/datos/fuente";
import { modoApp } from "@/datos/modo";
import type { EnlaceDemo } from "@/datos/tipos";
import { fechaHora } from "@/lib/formato";

function estado(e: EnlaceDemo) {
  if (e.revocadoEn) return <StatusBadge>Revocado</StatusBadge>;
  if (new Date(e.venceEn) <= new Date()) return <StatusBadge>Vencido</StatusBadge>;
  return <StatusBadge tone="success">Activo</StatusBadge>;
}

export function EnlacesDemo() {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState("");
  const [dias, setDias] = useState("7");
  const [nuevo, setNuevo] = useState<string | null>(null);
  const lista = useQuery({ queryKey: ["enlaces-demo"], queryFn: () => fuente.enlacesDemo(), enabled: modoApp === "supabase" });

  const crear = useMutation({
    mutationFn: () => fuente.crearEnlaceDemo(nombre.trim(), Number(dias)),
    onSuccess: async (codigo) => {
      setNuevo(`${window.location.origin}/demo?t=${codigo}`);
      setNombre("");
      await qc.invalidateQueries({ queryKey: ["enlaces-demo"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const revocar = useMutation({
    mutationFn: (id: string) => fuente.revocarEnlaceDemo(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["enlaces-demo"] });
      toast.success("Enlace revocado");
    },
    onError: (e) => toast.error(e.message),
  });

  if (modoApp !== "supabase") {
    return <EmptyState icon={Link2} title="Los enlaces de demo se crean en la app real" />;
  }

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    crear.mutate();
  };
  const copiar = async () => {
    if (!nuevo) return;
    try {
      await navigator.clipboard.writeText(nuevo);
      toast.success("Enlace copiado");
    } catch {
      toast.error("No se pudo copiar. Selecciona el enlace y cópialo a mano.");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Enlaces de demo"
        description="Quien abre un enlace activo entra a una demo con datos de ejemplo, sin tocar la base real"
      />
      <Section title="Crear enlace">
        <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-[1fr_140px_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="demo-nombre">Nombre</Label>
            <Input id="demo-nombre" maxLength={100} placeholder="Ej. Presentación cliente" value={nombre} onChange={(e) => setNombre(e.currentTarget.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="demo-dias">Vigencia (días)</Label>
            <Input id="demo-dias" type="number" min={1} max={30} className="tabular-nums" value={dias} onChange={(e) => setDias(e.currentTarget.value)} />
          </div>
          <Button type="submit" disabled={!nombre.trim() || crear.isPending}>
            {crear.isPending ? "Creando…" : "Crear enlace"}
          </Button>
        </form>
        {nuevo && (
          <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-3">
            <p className="text-sm text-foreground">Copia el enlace ahora: no se volverá a mostrar.</p>
            <div className="flex gap-2">
              <Input readOnly value={nuevo} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="outline" onClick={copiar}>
                <Copy /> Copiar
              </Button>
            </div>
          </div>
        )}
      </Section>
      <Section title="Enlaces">
        {lista.error ? (
          <p className="text-sm text-destructive">{lista.error.message}</p>
        ) : (lista.data ?? []).length === 0 ? (
          <EmptyState icon={Link2} title="Aún no hay enlaces de demo" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead>Usos</TableHead>
                  <TableHead>Último uso</TableHead>
                  <TableHead>Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(lista.data ?? []).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.nombre}</TableCell>
                    <TableCell>{estado(e)}</TableCell>
                    <TableCell className="tabular-nums">{fechaHora(e.venceEn)}</TableCell>
                    <TableCell className="tabular-nums">{e.usos}</TableCell>
                    <TableCell className="tabular-nums">{e.ultimoUso ? fechaHora(e.ultimoUso) : "Nunca"}</TableCell>
                    <TableCell>
                      {!e.revocadoEn && new Date(e.venceEn) > new Date() && (
                        <Button size="sm" variant="ghost" className="text-destructive" disabled={revocar.isPending} onClick={() => revocar.mutate(e.id)}>
                          Revocar
                        </Button>
                      )}
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
