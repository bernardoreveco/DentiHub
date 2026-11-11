// O3 Un paso del checklist. Todos miden al menos 44 px de alto para tocarlos con el pulgar
// (o con guantes). Los cuatro tipos son los de form_schema_is_valid(): check, yesno, text, number.
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Paso, Respuesta } from "@/datos/tipos";
import { cn } from "@/lib/utils";
import { pasoRespondido } from "@/modulos/operacion/reglas";

export function PasoChecklist({
  paso,
  valor,
  bloqueado,
  onCambio,
}: {
  paso: Paso;
  valor: Respuesta | undefined;
  bloqueado: boolean;
  onCambio: (v: Respuesta) => void;
}) {
  const listo = pasoRespondido(paso, valor);
  const etiqueta = (
    <span className="text-sm text-foreground">
      {paso.label}
      {!paso.requerido && <span className="text-muted-foreground"> (opcional)</span>}
    </span>
  );

  if (paso.tipo === "check") {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={valor === true}
        aria-label={paso.label}
        disabled={bloqueado}
        onClick={() => onCambio(valor !== true)}
        className={cn(
          "flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed",
          listo ? "border-success/40 bg-success/10" : "border-border bg-card hover:bg-secondary",
        )}
      >
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-md border",
            listo ? "border-success bg-success text-success-foreground" : "border-input bg-background",
          )}
        >
          {listo && <Check className="size-4" aria-hidden="true" />}
        </span>
        {etiqueta}
      </button>
    );
  }

  if (paso.tipo === "yesno") {
    return (
      <div className="space-y-2 rounded-lg border border-border bg-card p-3">
        {etiqueta}
        <div className="grid grid-cols-2 gap-2">
          {[
            { v: true, t: "Sí" },
            { v: false, t: "No" },
          ].map((o) => (
            <button
              key={o.t}
              type="button"
              aria-pressed={valor === o.v}
              disabled={bloqueado}
              onClick={() => onCambio(o.v)}
              className={cn(
                "h-11 rounded-md border text-sm font-medium transition-colors disabled:cursor-not-allowed",
                valor === o.v
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              {o.t}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const id = `paso-${paso.key}`;
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <label htmlFor={id}>{etiqueta}</label>
      {paso.tipo === "number" ? (
        <Input
          id={id}
          // type="text" y no "number": en Chile se escribe «3,4» y un campo numérico del navegador
          // descarta la coma según el idioma del teléfono (el valor llegaba vacío). Se valida aquí.
          type="text"
          inputMode="decimal"
          className="h-11 tabular-nums"
          disabled={bloqueado}
          defaultValue={typeof valor === "number" ? String(valor).replace(".", ",") : ""}
          // Se guarda al salir del campo, no en cada tecla: menos escrituras con mala señal.
          onBlur={(e) => {
            const t = e.currentTarget.value.replace(",", ".").trim();
            if (t === "") return onCambio(null);
            const n = Number(t);
            if (Number.isFinite(n)) onCambio(n);
            else toast.error("Escribe solo un número, por ejemplo 3,4");
          }}
        />
      ) : (
        <Textarea
          id={id}
          rows={2}
          maxLength={2000}
          disabled={bloqueado}
          defaultValue={typeof valor === "string" ? valor : ""}
          onBlur={(e) => onCambio(e.currentTarget.value.trim() || null)}
        />
      )}
    </div>
  );
}
