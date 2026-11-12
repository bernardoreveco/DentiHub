// A5 Recuperar clave. El mensaje es SIEMPRE el mismo, exista o no el correo, y también ante el límite
// de intentos (ADR-0005). Solo la falta de conexión se informa distinto.
import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fuente } from "@/datos/fuente";
import { ErrorFormulario, PantallaAcceso } from "@/modulos/acceso/PantallaAcceso";

const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function RecuperarClave() {
  const [correo, setCorreo] = useState("");
  const [errorLocal, setErrorLocal] = useState<string | null>(null);
  const enviar = useMutation({ mutationFn: (c: string) => fuente.recuperarClave(c) });

  const alEnviar = (e: FormEvent) => {
    e.preventDefault();
    if (!CORREO.test(correo.trim())) return setErrorLocal("Escribe un correo válido.");
    setErrorLocal(null);
    enviar.mutate(correo);
  };

  if (enviar.isSuccess) {
    return (
      <PantallaAcceso
        titulo="Revisa tu correo"
        descripcion="Si el correo está registrado, te llegará un enlace en unos minutos. Revisa también la carpeta de spam."
      >
        <Button asChild variant="outline" className="w-full">
          <Link to="/ingreso">Volver a ingresar</Link>
        </Button>
      </PantallaAcceso>
    );
  }

  return (
    <PantallaAcceso titulo="Recupera tu clave" descripcion="Te enviaremos un enlace para crear una clave nueva">
      <form onSubmit={alEnviar} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="correo">Correo</Label>
          <Input
            id="correo"
            type="email"
            inputMode="email"
            autoComplete="username"
            className="h-11"
            value={correo}
            onChange={(e) => setCorreo(e.currentTarget.value)}
          />
        </div>
        {(errorLocal ?? enviar.error?.message) && <ErrorFormulario>{errorLocal ?? enviar.error?.message}</ErrorFormulario>}
        <Button type="submit" className="h-11 w-full" disabled={enviar.isPending}>
          {enviar.isPending ? "Enviando…" : "Enviar enlace"}
        </Button>
        <Button asChild variant="ghost" className="w-full">
          <Link to="/ingreso">Volver</Link>
        </Button>
      </form>
    </PantallaAcceso>
  );
}
