import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

// Todos los avisos duran lo mismo: 10 segundos (el valor por defecto de sonner es ~4, muy poco
// para alcanzar a leer o anotar un dato). Un aviso puntual todavía puede pedir otra duración
// propia con toast("…", { duration }).
const TOAST_DURATION_MS = 10_000;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      duration={TOAST_DURATION_MS}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          // whitespace-pre-line: permite que una descripción muestre datos uno debajo del otro.
          description: "group-[.toast]:text-muted-foreground whitespace-pre-line",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
