// O4 Foto de evidencia. El botón abre la cámara trasera del teléfono (capture="environment");
// en el computador abre el selector de archivos. La foto se comprime antes de subirla.
import { useRef, useState } from "react";
import { Camera, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Evidencia } from "@/datos/tipos";
import { fechaHora } from "@/lib/formato";
import { useSubirEvidencia } from "@/modulos/operacion/consultas";
import { comprimirFoto } from "@/modulos/operacion/foto";
import { EVIDENCIA } from "@/modulos/operacion/reglas";

export function FotoEvidencia({
  tareaId,
  evidencias,
  exige,
  minimo,
  bloqueado,
}: {
  tareaId: string;
  evidencias: Evidencia[];
  exige: boolean;
  minimo: number;
  bloqueado: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const subir = useSubirEvidencia(tareaId);
  const [procesando, setProcesando] = useState(false);
  const ocupado = procesando || subir.isPending;
  const lleno = evidencias.length >= EVIDENCIA.maxPorTarea;

  const alElegir = async (archivo: File | undefined) => {
    if (!archivo) return;
    setProcesando(true);
    let foto: Blob;
    try {
      foto = await comprimirFoto(archivo);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo agregar la foto.");
      return;
    } finally {
      setProcesando(false);
      if (input.current) input.current.value = "";
    }
    // Los errores de la subida los avisa useSubirEvidencia (un solo aviso por error).
    subir.mutate(foto);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {exige
          ? minimo === 1
            ? "Esta tarea exige una foto para poder completarla."
            : `Esta tarea exige ${minimo} fotos para poder completarla.`
          : "La foto es opcional en esta tarea."}
      </p>

      {evidencias.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {evidencias.map((ev) => (
            <figure key={ev.id} className="overflow-hidden rounded-lg border border-border bg-muted">
              {ev.url ? (
                <img src={ev.url} alt="Foto de evidencia" className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square items-center justify-center text-muted-foreground">
                  <ImageOff className="size-6" aria-hidden="true" />
                </div>
              )}
              <figcaption className="px-2 py-1 text-xs tabular-nums text-muted-foreground">
                {fechaHora(ev.creadaEn)}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}

      {!bloqueado && (
        <>
          <input
            ref={input}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => void alElegir(e.currentTarget.files?.[0])}
          />
          <Button
            type="button"
            variant={evidencias.length ? "outline" : "default"}
            className="h-11 w-full"
            disabled={ocupado || lleno}
            onClick={() => input.current?.click()}
          >
            <Camera />
            {ocupado ? "Subiendo foto…" : evidencias.length ? "Agregar otra foto" : "Sacar foto"}
          </Button>
          {lleno && (
            <p className="text-xs text-muted-foreground">
              Llegaste al máximo de {EVIDENCIA.maxPorTarea} fotos.
            </p>
          )}
        </>
      )}
    </div>
  );
}
