# Sistema de diseño de DentiHub

DentiHub comparte el sistema de diseño de **Dentiventario** (Dentimagen). Este documento fija los valores exactos y cómo usarlos. Los componentes ya limpios están en [`starter-kit/`](starter-kit/).

**Estilo:** enterprise, sobrio y clínico. Fondo casi blanco con matiz azul, barra lateral clara, tarjetas blancas, un solo color de acento, tarjetas de cifra (KPI) y tablas con etiquetas de estado. **Sin glassmorphism** (nada de `backdrop-blur`, fondos translúcidos de vidrio ni brillos).

## 0. Fuente de verdad y qué se verificó

Todo sale del código de Dentiventario, no de memoria:

| Dato | Fuente en Dentiventario | Verificación |
|---|---|---|
| Colores, radios, tipografía base | `src/styles.css` | Los 100 % de los tokens están copiados a `starter-kit/src/styles.css` y `starter-kit/src/styles/themes.css`; una comparación automática dio idéntico. |
| Componentes base | `src/components/ui/*` | Copiados sin cambios (ver `starter-kit/README.md`). |
| Alturas, espacios, patrones | Código de los componentes + `design.files/*.md` | Alturas y radios contrastados con el código; los textos de `design.files` se usaron solo como guía. |

⚠ **`design.files/01-tipografia.md` de Dentiventario está desactualizado**: dice que no hay fuente propia, pero `styles.css` y `__root.tsx` ya cargan **Inter**. Y la nota «primario ≈ #2b7bb5» de `02-colores-y-temas.md` no coincide con el valor real (ver §2). Este documento corrige ambas cosas. Los valores hexadecimales de aquí son **aproximados** (conversión desde oklch); el valor oficial es siempre el oklch.

## 1. Tipografía

- **Familia:** Inter (400, 500, 600, 700), con respaldo `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
- **Carga:** desde Google Fonts en el `<head>` de la app (en Dentiventario, `src/routes/__root.tsx`). Si no carga, queda la fuente del sistema.

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
```

- **Ajuste global:** `letter-spacing: -0.01em` en `body` (Inter es ~6 % más ancha que la fuente del sistema; así queda en ~4 %).
- **Cifras:** `tabular-nums` en toda cifra que se compare o alinee (KPI, tablas, totales).

| Uso | Clase Tailwind | Tamaño | Peso |
|---|---|---|---|
| Cifra destacada (KPI) | `text-3xl` | 30 px | semibold (600) |
| Cifra de casilla de métrica | `text-2xl` | 24 px | medium (500) |
| Título de pantalla | `text-xl` | 20 px | semibold |
| Título de diálogo | `text-lg` | 18 px | semibold |
| Título de viñeta (`Section`), título de tarjeta | `text-base` | 16 px | semibold |
| **Texto de lectura** (cuerpo, tablas, formularios, botones) | `text-sm` | 14 px | normal / medium |
| Subtítulo de subviñeta (`SubSection`) | `text-sm` | 14 px | medium |
| Subviñeta anidada, encabezado de tabla | `text-[13px]` | 13 px | medium |
| Texto secundario, botón pequeño, notas | `text-xs` | 12 px | normal |
| Etiqueta de grupo (menú) | `text-xs` + `uppercase tracking-wide` | 12 px | semibold |

Reglas: un título de pantalla (20 px semibold) con una línea de descripción (14 px, `text-muted-foreground`). El texto de ayuda o secundario siempre en `text-muted-foreground`. Las cifras importantes más grandes que su etiqueta, y la etiqueta arriba, pequeña. No mezclar más de 3 tamaños en una misma casilla. `font-bold` casi no se usa.

## 2. Colores

Todos en **oklch**, como variables CSS; se usan **por su nombre** (`bg-primary`, `text-muted-foreground`), nunca con un código fijo. Para agregar un color semántico: variable en `:root` y en `.dark`, y registrarla en `@theme inline`.

### Tema Clásico (claro, por defecto)

| Token | oklch | ≈ Hex | Uso |
|---|---|---|---|
| `background` | `0.985 0.005 230` | `#F7FBFD` | Fondo de la app |
| `foreground` | `0.24 0.03 245` | `#13212D` | Texto principal |
| `card`, `popover` | `1 0 0` | `#FFFFFF` | Tarjetas, ventanas, menús |
| `primary` | `0.53 0.13 232` | `#0077A9` | Botón principal, acento, foco |
| `primary-foreground` | `0.99 0.005 230` | `#F9FCFE` | Texto sobre `primary` |
| `secondary` | `0.95 0.012 230` | `#E7F0F5` | Fondos suaves, hover del menú, página activa |
| `secondary-foreground` | `0.3 0.03 245` | `#21303C` | Texto sobre `secondary` |
| `muted` | `0.955 0.008 230` | `#EBF1F4` | Fondos atenuados |
| `muted-foreground` | `0.52 0.025 245` | `#5D6B77` | Texto secundario y etiquetas |
| `accent` | `0.93 0.03 210` | `#D2EEF3` | Hover de botones y filas |
| `accent-foreground` | `0.28 0.04 245` | `#172B3B` | Texto sobre `accent` |
| `border`, `input` | `0.9 0.012 235` | `#D7DFE5` | Bordes de tarjetas y campos |
| `ring` | `0.53 0.13 232` | `#0077A9` | Anillo de foco (teclado) |
| `sidebar` | `0.99 0.004 230` | `#F9FCFE` | Fondo de barra lateral (el layout actual usa `bg-card`) |

Los tokens `card-foreground`, `popover-foreground`, `sidebar-foreground` valen igual que `foreground`; `sidebar-primary`/`sidebar-ring` igual que `primary`; `sidebar-accent` igual que `secondary`; `sidebar-border` igual que `border`.

### Colores de estado (iguales en todos los temas, a propósito)

| Token | oklch | ≈ Hex | Significa | Fondo / borde / texto |
|---|---|---|---|---|
| `destructive` | `0.55 0.2 25` | `#CC272E` | Error, rechazado, peligro | `bg-destructive/15` · `border-destructive/40` · `text-destructive` |
| `warning` | `0.75 0.14 75` | `#E1A035` | Atención, pendiente, por revisar | `bg-warning/15` · `border-warning/40` · `text-warning-foreground` |
| `warning-foreground` | `0.25 0.04 60` | `#301D0D` | Texto sobre ámbar | — |
| `success` | `0.6 0.13 155` | `#2C965D` | Correcto, aprobado, recibido | `bg-success/15` · `border-success/40` · `text-foreground` |
| (neutro) | `muted` | — | Pendiente sin urgencia, información | `bg-muted` · `border-border` · `text-muted-foreground` |
| (destacado) | `primary` | — | En curso, seleccionado | `bg-primary/15` · `border-primary/40` · `text-primary` |

**Regla:** el color de marca cambia con el tema; el de estado **no**. Rojo, ámbar y verde significan lo mismo siempre. Punto de estado de 10 px (`size-2.5`): rojo `red-500`, ámbar `amber-400`, verde `emerald-500`.

### Temas de color (`starter-kit/src/styles/themes.css`, opcional)

Cada persona puede elegir el suyo con `data-theme` en `<html>` (Clásico no lleva atributo). Solo cambian fondo, texto, primario, secundario, borde y anillo.

| Tema (`data-theme`) | `primary` oklch |
|---|---|
| Clásico (sin atributo) | `0.53 0.13 232` |
| Rosa Coral (`rosa`) | `0.668 0.176 3` |
| Azul Marino (`azul-marino`) | `0.353 0.093 259` |
| Celeste Clínico (`celeste`) | `0.678 0.111 217` |
| Morado Aurora (`morado`) | `0.554 0.15 296` |
| Diente Feliz (`diente-feliz`) | `0.757 0.148 36` |

### Modo oscuro (`.dark`)

⚠ **Está definido pero nunca se activó en Dentiventario**: ningún código agrega la clase `dark`, así que sus valores no se han visto en pantalla. El kit incluye `applyColorMode()` (nuevo) para activarlo; revisa cada pantalla antes de ofrecerlo.

| Token | oklch | ≈ Hex |
|---|---|---|
| `background` | `0.129 0.042 264.695` | `#020618` |
| `foreground` | `0.984 0.003 247.858` | `#F8FAFC` |
| `card`, `popover` | `0.208 0.042 265.755` | `#0F172B` |
| `primary` | `0.929 0.013 255.508` (texto encima: `0.208 0.042 265.755`) | `#E2E8F0` |
| `secondary`, `muted`, `accent` | `0.279 0.041 260.031` | `#1D293D` |
| `muted-foreground` | `0.704 0.04 256.788` | `#90A1B9` |
| `destructive` | `0.704 0.191 22.216` | `#FF6467` |
| `success` | `0.66 0.13 155` | `#43A96E` |
| `warning` | `0.78 0.14 75` | `#EBA941` |
| `border` | `oklch(1 0 0 / 10%)` | — |
| `input` | `oklch(1 0 0 / 15%)` | — |
| `ring` | `0.551 0.027 264.364` | — |

En oscuro, `chart-1…7` usan otra paleta (valores de shadcn, sin validar para daltonismo); no se han revisado.

### Colores de gráficos (`chart-1…7`, tema Clásico)

| Token | oklch | ≈ Hex | Regla |
|---|---|---|---|
| `chart-1` | `0.53 0.13 232` | `#0077A9` | Azul de marca |
| `chart-2` | `0.6 0.13 155` | `#2C965D` | Verde |
| `chart-3` | `0.75 0.14 75` | `#E1A035` | Ámbar |
| `chart-4` | `0.55 0.2 25` | `#CC272E` | Rojo |
| `chart-5` | `0.45 0.08 255` | `#355781` | Series adicionales |
| `chart-6` | `0.56 0.18 300` | `#8654CC` | Reserva |
| `chart-7` | `0.62 0.17 350` | `#CD5394` | Reserva |

Un color fijo por categoría (por ejemplo, por rol), nunca reciclado según qué datos haya en el período. Un color nuevo sale primero de `chart-6/7`, no de un código inventado. En Dentiventario `chart-1…4` + `6` + `7` se validaron con el validador de la skill `dataviz` (separación para daltonismo y contraste); `chart-5` no se usa para categorías.

### Transparencias típicas

Fondo de dato de tabla `primary/5`; encabezado de tabla `primary/15`; hover de fila `primary/10`; pastilla activa `primary/10` con borde `primary/40`; casilla de métrica `muted/50`.

## 3. Espaciado, radios, sombras y alturas

Escala de Tailwind (1 unidad = 4 px).

| Uso | Valor |
|---|---|
| Entre bloques de una pantalla | 24 px (`space-y-6`) |
| Dentro de una viñeta (`Section`) | relleno 20 px (`p-5`), 16 px entre bloques (`space-y-4`) |
| Dentro de una subviñeta | relleno 16 px (`p-4`), 12 px entre bloques (`space-y-3`) |
| Tarjeta (`Card`) | encabezado/contenido `p-6` |
| Diálogo | relleno 24 px, 16 px entre bloques (`gap-4`) |
| Entre botones o pastillas | 8 px (`gap-2`) |
| Relleno de botón / campo | `px-4 py-2` / `px-3 py-1` |
| Contenido de página | `max-w-7xl` (1280 px), `px-4 py-6` |

**Radios** (`--radius: 0.5rem`): `rounded-sm` 4 px (detalles) · `rounded-md` 6 px (botones, campos, etiquetas, celdas de tabla; el más usado) · `rounded-lg` 8 px (casillas de datos, diálogos, pestañas) · `rounded-xl` 12 px (tarjetas y viñetas) · `rounded-[10px]` (subviñetas) · `rounded-full` (pastillas de filtro, puntos, avatares).

**Bordes y sombras:** borde estándar 1 px `border` (las viñetas, `border-border/80`). Tarjeta y botón principal `shadow`; campos y botones secundarios `shadow-sm`; diálogos y paneles flotantes `shadow-lg`; las **viñetas (`Section`) no llevan sombra**. Foco con teclado: anillo de 1 px en `ring` (botones y campos), 2 px con desfase en pestañas y ventanas.

**Alturas:** botón/campo/ícono 36 px (`h-9`) · botón pequeño 32 px (`h-8`) · botón grande 40 px (`h-10`) · casilla de tabla 44 px (`h-11`) · pestañas 36 px (`h-9`) · casilla de métrica mínimo 88 px · punto de estado 10 px.

**Íconos:** Lucide, trazo de 2 px. 16 px (`size-4`) en botones y menús, 20 px (`size-5`) en la barra lateral.

**Estructura:** barra lateral fija de **72 px** solo con íconos (al pasar el cursor se abre el grupo); en celular, panel deslizante de 256 px. Encabezado superior fijo. Solo el contenido hace scroll. Punto de quiebre principal: `lg` (1024 px). Rejillas: 4 columnas de KPI en `lg` (1–2 en pantallas chicas).

## 4. Componentes (todos en `starter-kit/src/components/`)

Importa siempre desde estos componentes; no escribas botones, tablas ni etiquetas sueltas con clases propias.

### `Button`

| Variante | Cuándo |
|---|---|
| `default` | Acción principal (una por zona) |
| `outline` | Acción secundaria: exportar, filtros |
| `secondary` | Acción de apoyo |
| `ghost` | Acciones dentro de filas o barras |
| `destructive` | Eliminar, rechazar |
| `link` | Enlaces dentro de texto |

Tamaños: `sm` 32 px · `default` 36 px · `lg` 40 px · `icon` 36×36. Deshabilitado al 50 %. Botones con verbo: «Crear tarea», «Exportar CSV».

```tsx
<Button>Guardar</Button>
<Button variant="outline" size="sm"><Download /> Exportar CSV</Button>
<Button variant="ghost" size="icon" aria-label="Más acciones"><MoreHorizontal /></Button>
```

### `Input`, `Textarea`, `Label`, `Select`

36 px de alto, radio 6 px, borde `input`, `shadow-sm`, foco con anillo de 1 px; texto de 16 px en celular y 14 px desde `md`. Etiqueta (`Label`) de 14 px medium sobre el campo. Para formularios, `react-hook-form` + `zod` (la app de referencia usa `@hookform/resolvers`); el mensaje de error va debajo del campo, en `text-sm text-destructive`.

```tsx
<div className="space-y-2">
  <Label htmlFor="titulo">Título</Label>
  <Input id="titulo" placeholder="Ej. Revisar equipo" />
</div>
<SearchInput placeholder="Buscar tareas…" />
```

### `Table` (tabla con etiquetas de estado)

Formato único para toda la app: celdas separadas por 4 px, encabezado de 44 px (`primary/15`, 13 px medium, **centrado**), datos de 44 px (`primary/5`, 14 px, **siempre a la izquierda**), hover de fila `primary/10`. La tabla ocupa solo el ancho que necesita. `maxRows={10}` limita el alto y deja el encabezado fijo. El componente ignora `text-right`/`text-center` en celdas de datos a propósito; solo una celda con `colSpan` («Sin datos») puede ir centrada.

```tsx
<Table maxRows={10}>
  <TableHeader><TableRow><TableHead>Tarea</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Revisar equipo</TableCell>
      <TableCell><StatusBadge tone="warning">Pendiente</StatusBadge></TableCell>
    </TableRow>
  </TableBody>
</Table>
```

> ⚠ Esta tabla es **aireada** (filas de 44 px con separación), no «densa» al estilo Buk. Si DentiHub necesita más filas por pantalla, la decisión de diseño es bajar `h-11` a `h-9` en `table.tsx`; no se hizo para no alejar el kit del sistema original.

### `StatusBadge` y `StatusDot`

Fórmula **borde + fondo suave + texto**; el mismo color para el mismo significado en toda la app.

| `tone` | Aspecto | Significado |
|---|---|---|
| `neutral` | gris | Sin acción pendiente |
| `info` | color de marca | En curso, destacado |
| `success` | verde | Correcto, aprobado |
| `warning` | ámbar | Atención, pendiente |
| `danger` | rojo | Error, rechazado, bloqueado |

Cada módulo define su propio mapa `estado → { label, tone }`:

```tsx
const ESTADO_TAREA = {
  pendiente: { label: "Pendiente", tone: "warning" },
  aprobada: { label: "Aprobada", tone: "success" },
} as const satisfies Record<string, { label: string; tone: StatusTone }>;
```

### `KpiCard` y `Section`

`KpiCard`: título de 14 px atenuado, cifra de 30 px semibold; `tone="alert"` la pone roja, `tone="warn"` ámbar. Rejilla: `grid gap-3 sm:grid-cols-2 lg:grid-cols-4`.

```tsx
<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
  <KpiCard title="Tareas de hoy" value={12} />
  <KpiCard title="Vencidas" value={3} tone="alert" info="Tareas con fecha pasada y sin cerrar." />
</div>
<Section title="Actividad reciente" actions={<Button variant="outline" size="sm">Exportar</Button>}>
  <SubSection title="Por equipo">…</SubSection>
</Section>
```

### `Dialog`, `Sheet`, `Toaster`, `Tooltip`/`InfoTip`

- **Dialog:** centrado, `max-w-lg` (512 px), relleno 24 px, 16 px entre bloques, cierre con X arriba a la derecha. Encabezado en columna: `DialogTitle` 18 px semibold + `DialogDescription` 14 px atenuada. El fondo es `bg-black/80` (opaco; sin desenfoque).
- **Sheet:** panel deslizante (menú móvil, filtros).
- **Toaster (sonner):** esquina superior derecha, **10 s** de duración. Usa `toast.success("…")`, `toast.error("…")`.
- **InfoTip:** ícono `?` de 16 px que abre un globo de 288 px máx., 12 px. 1 o 2 frases.

### `Tabs`, `FilterPills`

`Tabs`: barra `muted` de 36 px, radio 8 px; pestaña activa con fondo claro y sombra. `FilterPills`: botones redondos para elegir una vista o categoría (activa: `primary/10` con borde `primary/40`).

### Estados de carga y vacíos

- `AppLoading` (pantalla completa) y `PageLoading` (dentro de la página): bloques `animate-pulse` con la forma del contenido. Nunca una pantalla en blanco.
- `Skeleton` para bloques sueltos.
- `EmptyState` (nuevo, no viene de Dentiventario): ícono + título corto + una frase + acción para empezar. `AccessDenied` para una página que el rol no puede ver.

### `AppShell` (sidebar y navegación)

Barra lateral clara de 72 px, encabezado fijo, contenido de 1280 px. Ver el comentario de cabecera de `AppShell.tsx`. Un grupo de una sola página es un enlace directo; un grupo con varias abre un panel al pasar el cursor.

## 5. Patrones de pantalla

```
[Barra lateral 72 px] | [Encabezado: búsqueda · avisos · perfil]
                      | [Contenido, máx. 1280 px, px-4 py-6]
                      |   <PageHeader title description actions />
                      |   Filtros (FilterPills / Select)   ← flex-wrap gap-2
                      |   Section / SubSection / Table / KpiCard   ← space-y-6
```

- **Una sola forma de hacer cada cosa:** todas las tablas, viñetas, botones y etiquetas salen de los mismos componentes.
- **Filtros** arriba de la tabla, en una fila `flex-wrap gap-2`; los filtros activos se respetan en todas las cifras de la página.
- **Botones de acción en filas:** `ghost` u `outline` pequeño (32 px) a la derecha; acciones secundarias en un menú de tres puntos.
- **Imprimir:** una hoja aparte (`.print-sheet`) con tabla de bordes grises y texto de 11 px, sin menú. No viene en el kit (ver `starter-kit/FUERA-DEL-KIT.md`).

## 6. Texto de interfaz

- **Español de Chile**, tuteo («pulsa», «elige»). **Nunca rioplatense** (nada de «vos», «elegí», «hacé»).
- Títulos cortos y **sin punto final**; explicaciones de 1 a 2 frases; botones con verbo.
- Fechas `dd-mm-aaaa` (`Intl.DateTimeFormat("es-CL")`); moneda en pesos chilenos (`Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" })`).
- Los errores dicen qué pasó y qué hacer, sin jerga: «No se pudo cargar tu perfil. Revisa tu conexión e inténtalo de nuevo.»

## 7. Qué no hacer

- No usar colores con código fijo (`#2b7bb5`, `bg-blue-500`); usa los tokens. Las únicas excepciones documentadas son los puntos de estado (`red-500`, `amber-400`, `emerald-500`).
- No cambiar el significado de rojo / ámbar / verde ni su tono por tema.
- No glassmorphism, no `backdrop-blur`, no degradados decorativos.
- No alinear a la derecha ni centrar los datos de una tabla.
- No crear un componente nuevo si uno del kit hace el trabajo; si falta uno, créalo con los mismos tokens y súmalo al kit.
