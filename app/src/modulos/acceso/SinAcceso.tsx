// A4 Sin acceso: la sesión existe pero la cuenta no está habilitada. Cada motivo dice qué hacer.
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Logo } from "@/modulos/acceso/Logo";
import { useSesion } from "@/modulos/acceso/useAcceso";

const TEXTO = {
  desactivada: {
    titulo: "Tu cuenta está desactivada",
    detalle:
      "Un administrador desactivó tu cuenta. Si crees que es un error, avísale para que la active.",
  },
  sin_organizacion: {
    titulo: "Tu cuenta aún no está asignada",
    detalle:
      "Tu cuenta existe, pero todavía no pertenece a la empresa. Pide a un administrador que te asigne.",
  },
  sin_rol: {
    titulo: "Tu cuenta no tiene un rol",
    detalle: "Pide a un administrador que te asigne un rol para poder entrar.",
  },
  error: {
    titulo: "No pudimos comprobar tu acceso",
    detalle: "Revisa tu conexión e inténtalo de nuevo.",
  },
} as const;

export function SinAcceso({ motivo }: { motivo: keyof typeof TEXTO }) {
  const { salir } = useSesion();
  const navigate = useNavigate();
  const t = TEXTO[motivo];
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div
        role="alert"
        className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6 text-center"
      >
        <div className="flex justify-center">
          <Logo grande />
        </div>
        <h1 className="text-lg font-semibold text-foreground">{t.titulo}</h1>
        <p className="text-sm text-muted-foreground">{t.detalle}</p>
        <Button
          variant="outline"
          className="w-full"
          disabled={salir.isPending}
          onClick={() =>
            salir.mutate(undefined, { onSuccess: () => void navigate({ to: "/ingreso" }) })
          }
        >
          Salir y usar otra cuenta
        </Button>
      </div>
    </div>
  );
}
