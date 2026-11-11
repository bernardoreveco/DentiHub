// Pantallas de carga (antes se veía una pantalla en blanco mientras cargaba):
// - AppLoading: pantalla completa, para el arranque de la app y los cambios de ruta.
// - PageLoading: bloque para el área de contenido (con el menú ya visible), con marcadores que
//   imitan un título y tarjetas.
// Extraído de AppLoading.tsx de Dentiventario; el logo ahora llega por propiedad.
import type { ReactNode } from "react";

export function AppLoading({
  message = "Cargando…",
  logo,
}: {
  message?: string;
  /** Logo opcional, por ejemplo <img src="…" alt="DentiHub" className="h-16 w-auto" />. */
  logo?: ReactNode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-4"
    >
      {logo && <div className="animate-pulse">{logo}</div>}
      <div
        className="size-7 animate-spin rounded-full border-2 border-primary/20 border-t-primary"
        aria-hidden="true"
      />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function PageLoading() {
  return (
    <div role="status" aria-live="polite" aria-label="Cargando" className="space-y-6">
      <div className="space-y-2">
        <div className="h-6 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded-md bg-muted/70" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-muted/50" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-border bg-muted/40" />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
