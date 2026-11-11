// Marca provisoria de DentiHub (sin logo definitivo): cuadro con el color de marca y la inicial.
import { cn } from "@/lib/utils";

export function Logo({ grande = false }: { grande?: boolean }) {
  return (
    <span
      aria-label="DentiHub"
      className={cn(
        "inline-flex items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground",
        grande ? "size-14 text-2xl" : "size-9 text-base",
      )}
    >
      D
    </span>
  );
}
