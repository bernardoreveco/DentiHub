// Ruta /demo?t=<código> (ADR-0007). Comprueba el enlace con la base; si es válido, abre la demo en
// esta pestaña (datos de ejemplo en el navegador, sin tocar la base real). Como en A9, el código se
// comprueba al pulsar el botón y no al cargar la página: así un antivirus que abre el enlace no
// cuenta un uso.
import { useMutation } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { entrarADemo, validarEnlaceDemo } from "@/datos/modo";
import { ErrorFormulario, PantallaAcceso } from "@/modulos/acceso/PantallaAcceso";

export function ActivarDemo() {
  const codigo = new URLSearchParams(useRouterState({ select: (s) => s.location.searchStr })).get("t") ?? "";
  const validar = useMutation({
    mutationFn: () => validarEnlaceDemo(codigo),
    onSuccess: (ok) => {
      if (ok) entrarADemo();
    },
  });
  const invalido = validar.isSuccess && !validar.data;

  return (
    <PantallaAcceso
      titulo="Demo de DentiHub"
      descripcion="Vas a entrar a una demostración con datos de ejemplo. Nada de lo que hagas llega a la base real."
    >
      {invalido && <ErrorFormulario>El enlace de demo no es válido, venció o fue revocado.</ErrorFormulario>}
      {validar.error && <ErrorFormulario>{validar.error.message}</ErrorFormulario>}
      <Button className="h-11 w-full" disabled={validar.isPending || !codigo} onClick={() => validar.mutate()}>
        {validar.isPending ? "Comprobando…" : "Entrar a la demo"}
      </Button>
      <Button asChild variant="ghost" className="w-full">
        <Link to="/ingreso">Ir a la app</Link>
      </Button>
    </PantallaAcceso>
  );
}

/** Producción sin variables de Supabase: no se entra a nada (antes caía sola a la demo). */
export function SinConfiguracion() {
  return (
    <PantallaAcceso
      titulo="Configuración incompleta"
      descripcion="Esta instalación de DentiHub no está conectada a su base de datos. Avisa a quien administra la plataforma."
      rol="alert"
    >
      <p className="text-sm text-muted-foreground">
        Faltan las variables VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en el despliegue.
      </p>
    </PantallaAcceso>
  );
}
