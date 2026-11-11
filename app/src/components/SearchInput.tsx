import * as React from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Buscador con el mismo diseño en todas las pantallas (lupa a la izquierda). */
export function SearchInput({
  className,
  placeholder = "Buscar…",
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input type="search" className="pl-8" placeholder={placeholder} aria-label={placeholder} {...props} />
    </div>
  );
}
