import * as React from "react";

import { cn } from "@/lib/utils";

// Formato estándar de tablas (tamaño B · Estándar), pensado para toda la app:
// - Encabezados: alineación horizontal centrada, vertical media, texto que se ajusta.
// - Datos: alineación horizontal izquierda, vertical media, texto que se ajusta.
// - Cada casilla va separada, con un tinte suave del color del tema elegido.
// - La tabla ocupa solo lo que necesita su contenido: las columnas no se estiran
//   y los datos quedan cerca de su encabezado.
// Este formato se aplica a TODA tabla: las casillas de datos siempre van alineadas a la
// izquierda (se ignoran `text-right`/`text-center` que una pantalla les pase; decisión de
// diseño de Dentimagen, 2026-10-20), salvo las que abarcan varias columnas (`colSpan`, p. ej. el
// mensaje "Sin datos"), que pueden ir centradas. Los encabezados no van a la derecha.
// `containerClassName` deja configurar el div que envuelve la tabla (por
// defecto solo "relative w-full overflow-auto") — necesario cuando ese
// mismo div debe ser el que scrollea con una altura máxima (ej. una tabla
// larga con encabezado fijo): si en vez de esto se envuelve la <Table> en
// OTRO div con su propio overflow/alto máximo, quedan dos contenedores de
// scroll anidados y "sticky" en el encabezado se ancla al de adentro (que
// nunca scrollea solo) en vez del de afuera — el encabezado se ve fijo pero
// en realidad se desplaza junto con las filas (bug real detectado en Dentiventario, 2026-10-13).
// `maxRows`: alto máximo del contenedor en filas visibles (más el encabezado);
// si hay más filas, scrollea con el encabezado fijo. Cada fila mide 3rem: casilla
// h-11 (2.75rem) + border-spacing-1 (0.25rem).
const ROW_REM = 3;

// Alineaciones horizontales que no se admiten en casillas de datos.
const DATA_ALIGN = /(^|\s)(text-right|text-end|text-center|text-start)(?=\s|$)/g;
const HEAD_ALIGN = /(^|\s)(text-right|text-end)(?=\s|$)/g;

function stripAlign(className: string | undefined, pattern: RegExp): string | undefined {
  if (!className) return className;
  return className.replace(pattern, " ").replace(/\s+/g, " ").trim();
}

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement> & { containerClassName?: string; maxRows?: number }
>(({ className, containerClassName, maxRows, ...props }, ref) => (
  <div
    className={cn(
      "relative w-full overflow-auto",
      maxRows !== undefined &&
        "[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-card",
      containerClassName,
    )}
    style={
      maxRows !== undefined ? { maxHeight: `${(maxRows + 1) * ROW_REM + 0.25}rem` } : undefined
    }
  >
    <table
      ref={ref}
      className={cn("w-auto caption-bottom border-separate border-spacing-1 text-sm", className)}
      {...props}
    />
  </div>
));
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => <thead ref={ref} className={cn(className)} {...props} />);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => <tbody ref={ref} className={cn(className)} {...props} />);
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot ref={ref} className={cn("font-medium", className)} {...props} />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "transition-colors hover:[&>td]:bg-primary/10 data-[state=selected]:[&>td]:bg-primary/15",
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-11 whitespace-normal rounded-md bg-primary/15 px-3 py-2 text-center align-middle text-[13px] font-medium text-foreground/80 [&>[role=checkbox]]:translate-y-[2px]",
      stripAlign(className, HEAD_ALIGN),
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "h-11 whitespace-normal rounded-md bg-primary/5 px-3 py-2 text-left align-middle transition-colors [&>[role=checkbox]]:translate-y-[2px]",
      // Las casillas que abarcan varias columnas (mensajes "Sin datos") conservan su alineación.
      (props.colSpan ?? 1) > 1 ? className : stripAlign(className, DATA_ALIGN),
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption ref={ref} className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
));
TableCaption.displayName = "TableCaption";

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
