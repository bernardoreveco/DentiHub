// A6 Definir clave nueva. Se llega desde A9 con el enlace ya canjeado (hay sesión). Mínimo 10
// caracteres, sin exigir símbolos (ADR-0005); Supabase puede rechazarla por débil o filtrada.
import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fuente } from "@/datos/fuente";
import { ErrorFormulario, PantallaAcceso } from "@/modulos/acceso/PantallaAcceso";

export const CLAVE_MINIMA = 10;

export function ClaveNueva() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [clave, setClave] = useState("");
  const [repetir, setRepetir] = useState("");
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const guardar = useMutation({
    mutationFn: (c: string) => fuente.definirClave(c),
    onSuccess: async () => {
      // A3: con la clave lista se comprueba el acceso (y se aplica la invitación, si la hay).
      await qc.invalidateQueries({ queryKey: ["acceso"] });
      void navigate({ to: "/", replace: true });
    },
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (clave.length < CLAVE_MINIMA) return setErrorLocal(`La clave debe tener al menos ${CLAVE_MINIMA} caracteres.`);
    if (clave !== repetir) return setErrorLocal("Las dos claves no coinciden.");
    setErrorLocal(null);
    guardar.mutate(clave);
  };

  return (
    <PantallaAcceso
      titulo="Crea tu clave"
      descripcion={`Al menos ${CLAVE_MINIMA} caracteres. Una frase fácil de recordar sirve`}
    >
      <form onSubmit={enviar} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="clave">Clave nueva</Label>
          <Input
            id="clave"
            type="password"
            autoComplete="new-password"
            className="h-11"
            value={clave}
            onChange={(e) => setClave(e.currentTarget.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="repetir">Repite la clave</Label>
          <Input
            id="repetir"
            type="password"
            autoComplete="new-password"
            className="h-11"
            value={repetir}
            onChange={(e) => setRepetir(e.currentTarget.value)}
          />
        </div>
        {(errorLocal ?? guardar.error?.message) && <ErrorFormulario>{errorLocal ?? guardar.error?.message}</ErrorFormulario>}
        <Button type="submit" className="h-11 w-full" disabled={guardar.isPending}>
          {guardar.isPending ? "Guardando…" : "Guardar clave"}
        </Button>
      </form>
    </PantallaAcceso>
  );
}
