# ADR-0003: Construcción por módulos que se conectan por contratos

**Estado:** Aceptado · **Fecha:** 2026-11-10 · **Decide:** Bernardo («trabajaremos por módulos que luego se conectarán»)

## Contexto

La Etapa 1 (ADR-0002) es la app de terreno. Bernardo pidió trabajarla **por módulos separados que después se conectan**: primero el módulo de **inicio de sesión**, que con Supabase certifica quién es la persona, qué cuenta usa y si está habilitada; después **la operación**; y dentro de cada módulo, **cada pantalla con su propio flujo**.

## Decisión

1. **Un módulo = una unidad que se diseña, construye y prueba sola.** Cada uno tiene su documento en [`docs/modulos/`](../modulos/README.md) con: qué resuelve, sus pantallas, **un flujo por pantalla**, los datos y funciones de base de datos que usa, y su criterio de «terminado».
2. **Los módulos se conectan solo por contratos escritos**, nunca leyendo las tablas internas de otro módulo. El contrato central es el **contexto de acceso** que entrega el módulo Acceso: persona, organización, rol, áreas y si la cuenta está habilitada. Todo otro módulo lo consume y no vuelve a decidir quién es la persona.
3. **Orden de construcción:** 1) Acceso, 2) Administración (asignar rol, organización y áreas, activar o desactivar), 3) Operación (tareas, checklist y evidencia), 4) Reportes y alertas. Notificaciones y auditoría son **transversales**: las usan todos y no pertenecen a ninguno.
4. **En el código** (cuando exista la app): una carpeta por módulo, `src/modulos/<modulo>/` con sus pantallas, hooks de datos y reglas. Lo compartido vive en `src/lib` y en el kit. Un módulo importa de otro **solo** lo que su contrato expone (por ejemplo `useAcceso()`).
5. **En la base de datos:** las migraciones se agrupan por módulo en su nombre (`..._acceso_...`, `..._operacion_...`). La seguridad sigue en RLS: un contrato de interfaz nunca reemplaza una política.

## Supuesto

«Subbase» se interpreta como **Supabase** (su sistema de autenticación, Supabase Auth). Si era otra cosa, se corrige este ADR.

## Consecuencias

- **Más fácil:** avanzar y probar un módulo sin esperar a los demás; revisar pantallas una por una; cambiar un módulo sin romper otro mientras respete su contrato.
- **Más difícil:** hay que mantener los contratos escritos y al día; conectar los módulos exige una prueba de punta a punta al final de cada etapa.
- **A revisar:** si los contratos crecen demasiado, un módulo quizás está mal cortado.

## Acciones

1. [x] Mapa de módulos y contratos: `docs/modulos/README.md`.
2. [x] Módulo Acceso con sus pantallas y flujos: `docs/modulos/01-acceso.md`.
3. [x] Módulo Operación con sus pantallas y flujos: `docs/modulos/03-operacion.md`.
4. [ ] Preparar la función de base de datos `mi_acceso()` del contrato de Acceso (migración pendiente, con revisión).
5. [ ] Documentos de Administración y de Reportes y alertas.
