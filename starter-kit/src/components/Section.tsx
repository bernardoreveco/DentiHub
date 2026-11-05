// Viñetas: la forma única de agrupar contenido en una pantalla (extraído de audit-cells.tsx de
// Dentiventario, sin las piezas de métricas del inventario).
//   Section    → viñeta principal: tarjeta de radio 12 px, sin sombra, relleno de 20 px.
//   SubSection → subviñeta dentro de una viñeta: recuadro de radio 10 px, relleno de 16 px.
//                Con `nested` queda sin borde ni relleno, solo el título (dos bloques lado a lado).
//   InfoTip    → ícono "?" con la definición en un globo (en vez de descripciones largas).
import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Ayuda contextual: 1 o 2 frases, tono directo. Lleva su propio proveedor para usarse en cualquier lugar. */
export function InfoTip({
  children,
  label = "Qué significa",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className="inline-flex shrink-0 cursor-help text-muted-foreground transition-colors hover:text-foreground"
          >
            <HelpCircle className="size-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-72 text-xs font-normal leading-relaxed">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Viñeta principal. */
export function Section({
  title,
  info,
  actions,
  children,
}: {
  title: string;
  info?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="rounded-xl border-border/80 shadow-none">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 p-5 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {title}
          {info && <InfoTip>{info}</InfoTip>}
        </CardTitle>
        {actions}
      </CardHeader>
      <CardContent className="space-y-4 p-5 pt-0">{children}</CardContent>
    </Card>
  );
}

/** Subviñeta dentro de una viñeta principal. */
export function SubSection({
  title,
  info,
  actions,
  nested = false,
  children,
}: {
  title: string;
  info?: ReactNode;
  actions?: ReactNode;
  nested?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-3", !nested && "rounded-[10px] border border-border p-4")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3
          className={cn(
            "flex items-center gap-2 font-medium text-foreground",
            nested ? "text-[13px]" : "text-sm",
          )}
        >
          {title}
          {info && <InfoTip>{info}</InfoTip>}
        </h3>
        {actions}
      </div>
      {children}
    </div>
  );
}
