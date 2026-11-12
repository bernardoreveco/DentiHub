// Marco común de las pantallas de Acceso (A1, A2, A2b, A4, A5, A6, A9): logo, título, una línea de
// explicación y el contenido en una tarjeta centrada. Una sola forma de hacerlo (CLAUDE.md, Diseño).
import type { ReactNode } from "react";
import { Logo } from "@/modulos/acceso/Logo";

export function PantallaAcceso({
  titulo,
  descripcion,
  children,
  rol = "main",
}: {
  titulo: string;
  descripcion?: ReactNode;
  children: ReactNode;
  /** "alert" para las pantallas de «sin acceso» (las anuncia el lector de pantalla). */
  rol?: "main" | "alert";
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo grande />
          <div>
            <h1 className="text-xl font-semibold text-foreground">{titulo}</h1>
            {descripcion && <p className="text-sm text-muted-foreground">{descripcion}</p>}
          </div>
        </div>
        <div role={rol === "alert" ? "alert" : undefined} className="space-y-4 rounded-xl border border-border bg-card p-5">
          {children}
        </div>
      </div>
    </div>
  );
}

/** Mensaje de error de un formulario de Acceso, anunciado al lector de pantalla. */
export function ErrorFormulario({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-destructive">
      {children}
    </p>
  );
}
