# DentiHub: contexto para Claude

## Qué es
Plataforma web de trabajo colaborativo para equipos de oficina y de terreno. Reemplaza WhatsApp, Word, Excel y Drive: archivos, planillas, tareas con foto de evidencia, documentos, chats por área, aprobaciones, wiki, reportes, auditoría y modo sin conexión. Cada rol (Administrador, Gestor, Técnico) ve solo lo suyo. La organización visual se inspira en suites como Lark; no se copian su marca ni sus textos.

Roadmap de 8 fases: `C:\Users\berna\Downloads\Roadmap DentiHub.xlsx` (todo en 0%).

## Estado actual
- Existe una **demo navegable** en `DentiHub-Modelo-Visual.html`: un solo archivo, con datos de ejemplo, sin base de datos ni autenticación real. Todos los módulos se pueden abrir y usar; nada se guarda al recargar.
- `DentiHub Modelo Visual.html` es una versión antigua, solo como histórico.
- `Prompts-Lovable-Prototipo-DentiHub.md` tiene el prompt maestro y los prompts por módulo para construir el prototipo en Lovable, sin backend.
- **Kit base de diseño y estructura** (extraído de Dentiventario): `DESIGN_SYSTEM.md` (valores exactos y uso) y `starter-kit/` (componentes, estilos, patrón de migraciones). Ver «Diseño» y «Código» más abajo.
- Repositorio en GitHub: `bernardoreveco/DentiHub` (rama `main`). No hay backend ni proyecto de Supabase de DentiHub.

## Decisiones tomadas
- Primero un **prototipo navegable sin base de datos** para socializar con el equipo; el backend solo después de aprobarlo.
- Backend recomendado para producción: **Supabase Pro** (roles con permisos por fila, auditoría, archivos en el mismo proveedor). Pendiente de decidir tras el prototipo.
- La edición simultánea en tiempo real y el modo sin conexión son lo más riesgoso; en el prototipo solo se simulan.
- Diseñar permisos y auditoría desde la fase 1, no al final.
- **Stack de referencia = el de Dentiventario, no Next.js:** React 19 + Vite, TanStack Start/Router y Query, Tailwind v4, shadcn/ui (Radix) y Supabase. Dentiventario se edita con Lovable y se despliega en Cloudflare (no Vercel). Pendiente confirmar si DentiHub usa Lovable y dónde se despliega.

## Cómo trabajar (instrucción del usuario)
Actuar como ingeniero senior, sin adivinar:
- **Depuración:** entender qué hace el código, hallar la causa raíz, explicar el fallo, revisar casos límite y proponer el arreglo más robusto, con código listo para producción.
- **Código desconocido:** reconstruir la arquitectura y el flujo de datos; detectar malas decisiones, lógica duplicada, cuellos de botella y riesgos de escalabilidad; refactorizar **sin cambiar la funcionalidad**.
- Si no hay código que analizar, decirlo en vez de inventar un análisis.
- Actuar con supuestos razonables y avisar después; no hacer muchas preguntas antes de empezar. Ejecutar de corrido y reportar al final, sin desgloses por fase.
- Cada cambio debe poder revertirse fácilmente.
- **Si una entrega incluye una migración SQL, destacarla de forma muy visible al inicio del resumen** (las migraciones no se aplican solas). Cerrar con un resumen corto y un mensaje de commit sugerido.

## Reglas
- Responder en español.
- No crear cuentas, proyectos de Supabase ni subir a Git sin confirmación explícita del usuario.
- No pedir ni escribir contraseñas, tokens o claves (tampoco la clave pública de Supabase, aunque el usuario la pegue en el chat). Las claves van solo en `.env`, que nunca se sube a Git; en el repositorio solo hay `.env.example` con los **nombres**.
- No borrar archivos ni repositorios sin confirmación.

## Diseño (resumen; valores exactos en `DESIGN_SYSTEM.md`)
- **Estilo enterprise, limpio:** barra lateral clara de 72 px solo con íconos, tarjetas de cifra (KPI), tablas con etiquetas de estado, tipografía **Inter**. **Sin glassmorphism** (nada de `backdrop-blur` ni fondos de vidrio).
- **Colores solo por token** (`bg-primary`, `text-muted-foreground`…), en oklch, definidos en `starter-kit/src/styles.css`. Nunca un código fijo (`#2b7bb5`, `bg-blue-500`). El color de marca cambia con el tema; **rojo, ámbar y verde significan siempre lo mismo** (error / atención / correcto).
- **Una sola forma de hacer cada cosa:** botones, tablas, etiquetas, viñetas (`Section`), cifras (`KpiCard`) y encabezados (`PageHeader`) salen de los componentes del kit. No crear versiones paralelas con clases propias; si falta una pieza, crearla con los mismos tokens y sumarla al kit.
- Tablas: datos siempre alineados a la izquierda, encabezado centrado. Cifras con `tabular-nums`.
- **Textos de interfaz en español de Chile**, tuteo («pulsa», «elige»), **nunca rioplatense** (ni «vos», ni «elegí»). Títulos cortos sin punto final, botones con verbo, fechas `dd-mm-aaaa`, moneda en pesos chilenos.
- Responsive desde el inicio: el Técnico usa la app en celular, en terreno.

## Código (convenciones tomadas de Dentiventario)
- TypeScript estricto (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Prettier: 100 columnas, comillas dobles, punto y coma, coma final.
- Alias `@/` → `src/`. Componentes en `src/components` (la base de shadcn en `components/ui`), hooks de datos y reglas puras en `src/lib`, una ruta por archivo en `src/routes`.
- Datos: un hook por consulta con TanStack Query (`useX`), llave de caché estable, y `if (error) throw error`. Las escrituras de varios pasos **no** se hacen como varias llamadas del navegador: van en una función de base de datos transaccional.
- Archivos pequeños: una pantalla no pasa de unos cientos de líneas; partir por funcionalidad desde el inicio (Dentiventario tiene pantallas de 2.000 a 3.500 líneas que no hay que repetir).
- Comentarios en español que explican el **por qué** (qué se pidió y por qué se decidió así), no solo el qué.
- Permisos en tres capas: **(1) la base de datos (RLS) es la única que cuenta como seguridad**; (2) permisos de página configurables por el administrador; (3) la interfaz oculta menús y bloquea rutas con `canAccessPage` (`src/lib/roles.ts`), siempre **fail-closed**. Roles: `admin`, `gestor`, `tecnico`. Un rol desconocido es «sin acceso».
- Auditoría desde el inicio: trigger `audit_trigger()` en toda tabla con datos de negocio.

## Base de datos (detalle en `starter-kit/supabase/README.md`)
- Migraciones en `supabase/migrations/AAAAMMDDHHMMSS_descripcion_snake.sql`, con encabezado en español (qué y por qué) y reversa manual comentada al final. Molde: `starter-kit/supabase/plantilla-migracion.sql`.
- Toda tabla nueva: `GRANT` mínimos + RLS activada + políticas en la **misma** migración. Toda función `SECURITY DEFINER`: `SET search_path = public` y `REVOKE EXECUTE … FROM PUBLIC, anon` en la misma migración.
- Un rol nunca se toma de datos que controla quien se registra. El primer administrador se asigna a mano.
- La clave pública de Supabase solo es segura en el navegador si **todas** las tablas tienen RLS. La clave de servicio nunca va en el navegador ni en Git.
- ⚠ El SQL del kit **no se ha ejecutado** contra ninguna base.

## Pendientes
1. Ajustes de la demo (el usuario aún no los especificó).
2. Pegar los prompts en Lovable y revisar el resultado con el equipo.
3. ~~Crear el Git nuevo y subir esta carpeta~~ (hecho: `bernardoreveco/DentiHub`). Queda decidir si `DentiHub-Modelo-Visual.html` y la carpeta duplicada `DentiHub/DentiHub/` se mantienen.
4. **Dentiventario** (inventario `image-inv-wiz`, con un problema de aislamiento en la sucursal de testeo) es **otro proyecto**, que no está en esta carpeta. Solo se leyó para extraer el kit; no se modificó.
5. Decidir: ámbito de acceso de DentiHub (equipo, área o proyecto; en Dentiventario es la sucursal), uso de Lovable, dónde se despliega, cómo se aplican las migraciones, y si las tablas serán más densas que las de Dentiventario (filas de 44 px).
6. Kit pendiente de una segunda pasada: pantallas de acceso e invitación de usuarios (`auth`, `invitations.functions.ts`), que no se revisaron a fondo.
