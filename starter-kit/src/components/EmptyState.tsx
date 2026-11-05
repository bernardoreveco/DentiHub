// Estados vacíos y de acceso denegado.
// NOTA: estos dos componentes son NUEVOS, no vienen de Dentiventario (allí cada pantalla escribe su
// propio recuadro). Siguen los mismos tokens: borde, fondo `card`/`muted`, texto atenuado.
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** Para listas o tablas sin datos. Título corto, una frase de explicación y, si aplica, la acción para empezar. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
      {Icon && <Icon className="size-8 text-muted-foreground" aria-hidden="true" />}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Para una página que el rol actual no puede ver (la base de datos igual debe negar los datos). */
export function AccessDenied({
  children = "No tienes acceso a esta página. Pide a un administrador que te habilite el permiso.",
}: {
  children?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground"
    >
      {children}
    </div>
  );
}
