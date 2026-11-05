// Etiquetas de estado. Fórmula de Dentiventario: borde + fondo suave + texto, con el MISMO color
// para el mismo significado en toda la app (y en todos los temas):
//   neutral → gris, sin acción pendiente          info    → color de marca, destacado o en curso
//   success → verde, correcto o aprobado          warning → ámbar, atención o pendiente
//   danger  → rojo, error, rechazado o bloqueado
// Cada módulo define su propio mapa estado → { label, tone }; este componente solo pinta.
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-primary/40 bg-primary/15 text-primary",
  success: "border-success/40 bg-success/15 text-foreground",
  warning: "border-warning/40 bg-warning/15 text-warning-foreground",
  danger: "border-destructive/40 bg-destructive/15 text-destructive",
};

export function StatusBadge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: StatusTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Badge variant="outline" className={cn("font-normal", TONE_CLASS[tone], className)}>
      {children}
    </Badge>
  );
}

// Punto de estado de 10 px para listas de urgencia (rojo / ámbar / verde).
const DOT_CLASS: Record<"danger" | "warning" | "success", string> = {
  danger: "bg-red-500",
  warning: "bg-amber-400",
  success: "bg-emerald-500",
};

export function StatusDot({ tone }: { tone: "danger" | "warning" | "success" }) {
  return <span aria-hidden="true" className={cn("inline-block size-2.5 rounded-full", DOT_CLASS[tone])} />;
}
