// Pastillas de filtro (en Dentiventario, MetricsSubNav): fila de botones redondos para elegir una
// categoría o vista. Activa: borde y fondo suaves del color de marca. Inactiva: texto atenuado.
import { cn } from "@/lib/utils";

export type FilterPillItem<T extends string> = { value: T; label: string };

export function FilterPills<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: FilterPillItem<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm transition-colors",
              active
                ? "border-primary/40 bg-primary/10 font-medium text-primary"
                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
