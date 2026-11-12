// A4 Sin acceso (cuatro variantes) y la pantalla de «sin conexión» de A3.
// Un error de red NUNCA se muestra como «sin acceso» (ADR-0005): tiene su propia pantalla con Reintentar.
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { MotivoSinAcceso } from "@/datos/tipos";
import { PantallaAcceso } from "@/modulos/acceso/PantallaAcceso";
import { useSesion } from "@/modulos/acceso/useAcceso";

type Variante = Exclude<MotivoSinAcceso, "requiere_dos_pasos">;

const TEXTO: Record<Variante, { titulo: string; detalle: string; comprobar: boolean }> = {
  correo_sin_confirmar: {
    titulo: "Confirma tu correo",
    detalle: "Abre el enlace que te enviamos por correo y pulsa «Continuar». Después vuelve aquí.",
    comprobar: true,
  },
  desactivada: {
    titulo: "Tu cuenta está desactivada",
    detalle: "Un Administrador desactivó tu cuenta. Si crees que es un error, avísale para que la active.",
    comprobar: false,
  },
  sin_organizacion: {
    titulo: "Tu cuenta no tiene una invitación vigente",
    detalle: "Tu cuenta existe, pero no pertenece a la empresa. Pide a un Administrador que te invite.",
    comprobar: true,
  },
  sin_rol: {
    titulo: "Tu cuenta no tiene un rol",
    detalle: "Pide a un Administrador que te asigne un rol para poder entrar.",
    comprobar: true,
  },
};

function BotonSalir() {
  const { salir } = useSesion();
  const navigate = useNavigate();
  return (
    <Button
      variant="outline"
      className="w-full"
      disabled={salir.isPending}
      onClick={() => salir.mutate(undefined, { onSettled: () => void navigate({ to: "/ingreso" }) })}
    >
      Cerrar sesión
    </Button>
  );
}

export function SinAcceso({ motivo }: { motivo: Variante }) {
  const qc = useQueryClient();
  const t = TEXTO[motivo];
  return (
    <PantallaAcceso titulo={t.titulo} descripcion={t.detalle} rol="alert">
      {t.comprobar && (
        <Button className="w-full" onClick={() => void qc.invalidateQueries({ queryKey: ["acceso"] })}>
          Volver a comprobar
        </Button>
      )}
      <BotonSalir />
    </PantallaAcceso>
  );
}

/** A3 sin respuesta: no se sabe si hay acceso, así que no se muestra nada de la app ni se deniega. */
export function SinConexion({ onReintentar }: { onReintentar: () => void }) {
  return (
    <PantallaAcceso
      titulo="No pudimos comprobar tu acceso"
      descripcion="Puede ser la señal o el servidor. Tus datos no se mostrarán hasta comprobarlo."
      rol="alert"
    >
      <Button className="w-full" onClick={onReintentar}>
        Reintentar
      </Button>
      <BotonSalir />
    </PantallaAcceso>
  );
}
