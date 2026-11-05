// Encabezado de pantalla: título de 20 px semibold, una línea de descripción atenuada y, a la
// derecha, las acciones de la pantalla. En Dentiventario este bloque se repite a mano en cada ruta;
// aquí queda en un solo lugar.
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
