// Tarjeta de cifra (Dashboard): título pequeño y atenuado arriba, cifra de 30 px semibold abajo.
// La cifra va en rojo (alerta), ámbar (aviso) o texto normal. Basada en StatCard de Dentiventario.
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { InfoTip } from "@/components/Section";
import { cn } from "@/lib/utils";

export function KpiCard({
  title,
  value,
  tone,
  info,
  hint,
}: {
  title: string;
  value: ReactNode;
  tone?: "alert" | "warn";
  /** Definición corta que se muestra en el globo "?". */
  info?: ReactNode;
  /** Línea pequeña bajo la cifra (por ejemplo, "vs. mes anterior"). */
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {title}
          {info && <InfoTip>{info}</InfoTip>}
        </p>
        <p
          className={cn(
            "mt-1 text-3xl font-semibold tabular-nums",
            tone === "alert"
              ? "text-destructive"
              : tone === "warn"
                ? "text-warning-foreground"
                : "text-foreground",
          )}
        >
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
