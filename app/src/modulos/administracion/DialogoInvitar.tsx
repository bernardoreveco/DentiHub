// A7 (lado del Administrador): invitar con correo, rol y áreas. La invitación ya trae todo lo
// necesario: al confirmar su correo, la persona entra asignada sin trabajo manual (ADR-0005).
import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Area } from "@/datos/tipos";
import { ROLE_LABEL, ROLE_PRIORITY, isAppRole, type AppRole } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { useInvitar } from "@/modulos/administracion/consultas";

const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function DialogoInvitar({
  abierto,
  onCambio,
  areas,
}: {
  abierto: boolean;
  onCambio: (v: boolean) => void;
  areas: Area[];
}) {
  const invitar = useInvitar();
  const [correo, setCorreo] = useState("");
  const [rol, setRol] = useState<AppRole>("tecnico");
  const [areaIds, setAreaIds] = useState<string[]>([]);
  const valido = CORREO.test(correo.trim());

  const alternar = (id: string) =>
    setAreaIds((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    invitar.mutate(
      { correo: correo.trim(), rol, areaIds },
      {
        onSuccess: () => {
          setCorreo("");
          setAreaIds([]);
          onCambio(false);
        },
      },
    );
  };

  return (
    <Dialog open={abierto} onOpenChange={onCambio}>
      <DialogContent>
        <form onSubmit={enviar} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Invitar persona</DialogTitle>
            <DialogDescription>
              Le llegará un correo para crear su clave. La invitación vence en 7 días y puedes reenviarla.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="inv-correo">Correo</Label>
            <Input
              id="inv-correo"
              type="email"
              inputMode="email"
              className="h-11"
              value={correo}
              onChange={(e) => setCorreo(e.currentTarget.value)}
              placeholder="nombre@empresa.cl"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-rol">Rol</Label>
            <Select value={rol} onValueChange={(v) => isAppRole(v) && setRol(v)}>
              <SelectTrigger id="inv-rol" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_PRIORITY.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {rol === "admin" && (
              <p className="text-xs text-muted-foreground">
                Deberá activar la verificación en dos pasos en su primer ingreso.
              </p>
            )}
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">Áreas</legend>
            <div className="flex flex-wrap gap-2">
              {areas.map((a) => {
                const activa = areaIds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={activa}
                    onClick={() => alternar(a.id)}
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
                      activa
                        ? "border-primary/40 bg-primary/10 font-medium text-primary"
                        : "border-border text-muted-foreground hover:bg-secondary",
                    )}
                  >
                    {activa && <Check className="size-3.5" aria-hidden="true" />}
                    {a.nombre}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onCambio(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!valido || invitar.isPending}>
              {invitar.isPending ? "Enviando…" : "Enviar invitación"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
