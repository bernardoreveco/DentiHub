// A2 Verificación en dos pasos y A2b Activar verificación (ADR-0005). Obligatoria para Administradores
// y exigida por la base: sin ella, auth_role() no le da ningún permiso. A3 llega aquí cuando mi_acceso()
// responde «requiere_dos_pasos»; esta pantalla decide si la persona ya tiene un factor (A2) o no (A2b).
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLoading } from "@/components/Loading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fuente } from "@/datos/fuente";
import { Logo } from "@/modulos/acceso/Logo";
import { ErrorFormulario, PantallaAcceso } from "@/modulos/acceso/PantallaAcceso";
import { SinConexion } from "@/modulos/acceso/SinAcceso";
import { useSesion } from "@/modulos/acceso/useAcceso";

function CampoCodigo({
  onVerificar,
  pendiente,
  error,
}: {
  onVerificar: (codigo: string) => void;
  pendiente: boolean;
  error: string | null;
}) {
  const [codigo, setCodigo] = useState("");
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    onVerificar(codigo);
  };
  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="codigo">Código de 6 dígitos</Label>
        <Input
          id="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className="h-12 text-center text-lg tracking-[0.4em] tabular-nums"
          value={codigo}
          onChange={(e) => setCodigo(e.currentTarget.value.replace(/\D/g, ""))}
        />
      </div>
      {error && <ErrorFormulario>{error}</ErrorFormulario>}
      <Button type="submit" className="h-11 w-full" disabled={codigo.length !== 6 || pendiente}>
        {pendiente ? "Verificando…" : "Verificar"}
      </Button>
    </form>
  );
}

function Verificar({ onListo }: { onListo: () => void }) {
  const { salir } = useSesion();
  const [verPerdido, setVerPerdido] = useState(false);
  const verificar = useMutation({ mutationFn: (c: string) => fuente.verificarDosPasos(c), onSuccess: onListo });
  return (
    <PantallaAcceso
      titulo="Verificación en dos pasos"
      descripcion="Escribe el código que muestra tu app autenticadora"
    >
      <CampoCodigo
        onVerificar={(c) => verificar.mutate(c)}
        pendiente={verificar.isPending}
        error={verificar.error?.message ?? null}
      />
      {verPerdido ? (
        <p className="text-sm text-muted-foreground">
          Pide a otro Administrador, o a quien administra el proyecto, que reinicie tu verificación. Después
          podrás activarla de nuevo en este teléfono.
        </p>
      ) : (
        <Button variant="link" className="w-full" onClick={() => setVerPerdido(true)}>
          Perdí mi teléfono
        </Button>
      )}
      <Button variant="outline" className="w-full" onClick={() => salir.mutate()}>
        Cancelar y salir
      </Button>
    </PantallaAcceso>
  );
}

function Activar({ onListo }: { onListo: () => void }) {
  const { salir } = useSesion();
  const inicio = useQuery({
    queryKey: ["dos-pasos", "activacion"],
    queryFn: () => fuente.iniciarDosPasos(),
    staleTime: Infinity,
    gcTime: 0, // el QR no se guarda en caché más allá de esta pantalla
    retry: false,
  });
  const verificar = useMutation({
    mutationFn: (c: string) => fuente.verificarDosPasos(c, inicio.data?.factorId),
    onSuccess: onListo,
  });

  return (
    <PantallaAcceso
      titulo="Activa la verificación en dos pasos"
      descripcion="Como Administrador, proteges las cuentas y los permisos de todo el equipo"
    >
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Instala una app autenticadora (Google Authenticator, Microsoft Authenticator u otra).</li>
        <li>Escanea este código QR con la app.</li>
        <li>Escribe el código de 6 dígitos que aparece en la app.</li>
      </ol>
      {inicio.isLoading && <p className="text-sm text-muted-foreground">Preparando el código…</p>}
      {inicio.error && <ErrorFormulario>{inicio.error.message}</ErrorFormulario>}
      {inicio.data && (
        <div className="flex flex-col items-center gap-2">
          {/* El QR lo genera Supabase como imagen; el fondo blanco asegura que se pueda escanear en tema oscuro. */}
          <img src={inicio.data.qr} alt="Código QR para la app autenticadora" className="size-44 rounded-md bg-white p-2" />
          <p className="text-center text-xs text-muted-foreground">
            ¿No puedes escanear? Escribe esta clave en la app:{" "}
            <span className="font-mono text-foreground">{inicio.data.secreto}</span>
          </p>
        </div>
      )}
      <CampoCodigo
        onVerificar={(c) => verificar.mutate(c)}
        pendiente={verificar.isPending || !inicio.data}
        error={verificar.error?.message ?? null}
      />
      <Button variant="outline" className="w-full" onClick={() => salir.mutate()}>
        Ahora no, salir
      </Button>
    </PantallaAcceso>
  );
}

export function DosPasos() {
  const qc = useQueryClient();
  const tiene = useQuery({ queryKey: ["dos-pasos", "tiene"], queryFn: () => fuente.tieneDosPasos() });
  // Al verificar, la sesión sube a aal2: se vuelve a pedir el contexto a la base (A3).
  const listo = () => {
    qc.removeQueries({ queryKey: ["dos-pasos"] });
    void qc.invalidateQueries({ queryKey: ["acceso"] });
  };

  if (tiene.isLoading) return <AppLoading logo={<Logo grande />} />;
  if (tiene.error) return <SinConexion onReintentar={() => void tiene.refetch()} />;
  return tiene.data ? <Verificar onListo={listo} /> : <Activar onListo={listo} />;
}
