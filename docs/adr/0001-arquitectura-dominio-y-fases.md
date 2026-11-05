# ADR-0001: Arquitectura base, dominio y plan de implementación por fases

**Estado:** Propuesto · **Fecha:** 2026-11-05 · **Decide:** Bernardo

Los tamaños (S, M, L, XL) son relativos, no fechas. Los precios y límites de planes de terceros son aproximados: **verifícalos en la página oficial** antes de decidir.

## Contexto

DentiHub reemplaza WhatsApp, Word, Excel y Drive para equipos de oficina y de terreno. Cada rol (Administrador, Gestor, Técnico) ve solo lo suyo.

**Estado hoy**
- Demo navegable (`DentiHub-Modelo-Visual.html`), sistema de diseño y `starter-kit/` (React 19, Tailwind v4, shadcn/Radix).
- Supabase «DentiHub» (plan **Free**, región **ca-central-1**): migración base aplicada, RLS activa, auditoría activa, un administrador.
- Roadmap de 8 fases, todas en 0 % (`Roadmap DentiHub.xlsx`).
- Landing page por construir. Dominio `dentimagen.cl`, **administrado por una empresa contratada**.

**Fuerzas**
- Seguridad por rol desde el inicio; los datos de cada área deben quedar aislados.
- Uso en terreno: celular, señal irregular, cámara.
- Colaboración en vivo (planillas y documentos) y modo sin conexión: **lo más riesgoso**.
- Equipo pequeño trabajando con IA: conviene pocas piezas, gestionadas y reemplazables.
- Dentiventario (referencia) no tiene pruebas automáticas ni CI y tiene pantallas gigantes: no repetirlo.

## Decisión (resumen)

1. **Stack:** React + Vite con TanStack (como Dentiventario) + el kit de diseño. **No Next.js.**
2. **Backend único:** Supabase (Auth, Postgres con RLS, Storage, Realtime, funciones). Pasar a **Pro antes de cargar datos reales** y decidir la **región ahora**, mientras la base está vacía.
3. **Dominio:** usar **subdominios** de `dentimagen.cl` pedidos a la empresa, verificando antes quién es el titular. Alternativa: dominio propio para el producto.
4. **Reordenar las fases:** 0 → 1 → 2 → **4** → **6 básica** → 5 → 3 → 7 → 8. La auditoría se construye desde la Fase 1 y la Fase 8 la endurece.
5. **Planillas:** primero **tablas estructuradas** con actualización en vivo por fila; la hoja libre estilo Excel colaborativa solo después de una **prueba técnica**.
6. **Colaboración en vivo:** Yjs sobre un servicio gestionado o Durable Objects. **No** construir un proveedor propio sobre Realtime de Supabase.
7. **Sin conexión:** limitado a tareas, checklists y fotos, con cola de salida e identificadores creados en el cliente desde la Fase 4.
8. **Ámbito de acceso:** áreas (`teams`) más roles, definidos **antes de la Fase 2**.
9. **Calidad:** entornos dev y prod, CI, pruebas de RLS y errores monitoreados desde la Fase 0.

## Opciones consideradas

### Framework

| | A. TanStack + Vite (Dentiventario) | B. Next.js (lo que menciona el roadmap) |
|---|---|---|
| Complejidad | Baja: ya hay kit y patrones | Media: hay que portar el kit |
| Costo | Cloudflare gratis o bajo | Vercel o Cloudflare |
| Familiaridad | Alta (Lovable y Dentiventario) | Baja |
| Encaje | App tras login (SPA) | Mejor si hubiera mucho contenido público con SEO |

**Recomendación: A.** La landing pública es una página estática aparte, así que el SEO no justifica Next.js. Los componentes del kit sirven en ambos si algún día se cambia.

### Colaboración en vivo (Fases 3 y 5)

| | Yjs + servicio gestionado (p. ej. Liveblocks) | Yjs + Durable Objects de Cloudflare (p. ej. PartyKit) | Proveedor propio sobre Supabase Realtime |
|---|---|---|---|
| Complejidad | Baja | Media | **Alta** |
| Costo | De pago, crece con usuarios | Bajo a medio | Bajo |
| Riesgo | Dependencia de un tercero | Más piezas que operar | Conflictos, reconexión y persistencia a medida |

**Recomendación:** empezar con el gestionado o con Durable Objects, tras una prueba técnica. Descartar construirlo a mano.

### Planillas (Fase 3)

| | 3A. Tablas estructuradas | 3B. Hoja libre tipo Excel |
|---|---|---|
| Esfuerzo | M | **XL** |
| Riesgo | Bajo | **Alto** |
| Cubre «el técnico actualiza y la oficina lo ve al instante» | Sí | Sí |
| Cubre fórmulas libres y celdas arbitrarias | Parcial | Sí |

**Recomendación:** hacer 3A completa. Abrir 3B solo si 3A no alcanza, y con una prueba técnica previa (ver Fase 3). Verifica las licencias: Handsontable y HyperFormula tienen condiciones comerciales; FortuneSheet es de código abierto.

## Plan por fases

### Fase 0: Cimientos (S a M) — **nueva, no está en el roadmap**
- **Decidir:** subdominios, región y plan de Supabase, entornos dev y prod, estructura del repositorio (`app/`, `landing/`, `starter-kit/`, `supabase/migrations/`).
- **Hacer:** CI en GitHub (tipos, lint, pruebas, búsqueda de claves filtradas), pruebas con Vitest, monitoreo de errores, convención de `.env`, método único para aplicar migraciones, borrador de política de privacidad, plan de respaldo.
- **Listo cuando:** una app mínima está publicada en un subdominio con HTTPS, el CI está en verde y dev y prod están separados.

### Landing page (S) — en paralelo
- Estructura inspirada en AquaPlanner (no se copian textos ni marca): portada, problema, cómo funciona, perfiles por rol, preguntas frecuentes, acción final con «Probar la demo».
- Formulario guardado en Supabase (tabla de solo inserción con RLS y antispam) o servicio de formularios. Política de privacidad y términos.

### Fase 1: Accesos y perfiles (M)
- **Pantallas:** ingreso, recuperar clave, aceptar invitación, cambiar contraseña. El **registro público se cierra**: se entra solo por invitación.
- **Panel de administración:** invitar (desde una función de servidor, la clave de servicio **nunca** en el navegador), asignar rol y áreas, **dar de baja** (desactivar, no borrar), ver auditoría básica.
- **Base de datos:** `teams` y `team_members` (el ámbito que hoy falta), `role_page_permissions`, `profiles.active`, auditoría en toda tabla.
- **Seguridad:** `canAccessPage` en cada ruta; verificación en dos pasos opcional para administradores; política de contraseñas.
- **Listo cuando:** un Técnico invitado entra y **una prueba automática de RLS demuestra** que no ve datos de otra área.

### Fase 2: Archivos y carpetas (M)
- **Datos:** `folders` (árbol con `parent_id`), `files` (metadatos, `deleted_at`), bucket **privado** con políticas por prefijo `team_id/…`, enlaces firmados de corta duración.
- **Permisos:** por área en la carpeta raíz y heredados hacia abajo (no por archivo; es más simple y más seguro).
- **Funciones:** subida con progreso y arrastrar y soltar, límites de tamaño y tipo, compresión de imágenes en el cliente, visor de PDF e imágenes, papelera de 30 días, búsqueda por nombre.
- **Riesgos:** costo de almacenamiento, archivos maliciosos (limitar tipos).
- **Listo cuando:** la oficina sube un manual y el técnico lo abre desde el celular.

### Fase 4: Tareas y terreno (L) — **se adelanta a la 3**
- **Datos:** `task_templates` (checklists versionados), `tasks`, `task_responses`, `evidence` (foto, fecha del servidor), `recurrences`.
- **Recurrencia:** tareas generadas por una tarea programada en la base (`pg_cron`) o una función programada, no desde el navegador.
- **Reglas:** «completar tarea» es **una sola función de base de datos** (valida que haya evidencia obligatoria y registra todo o nada).
- **Cámara y avisos:** captura desde el navegador; avisos dentro de la app, por correo y por notificación push.
- **Preparado para modo sin conexión:** identificadores creados en el cliente y escrituras idempotentes.
- **Listo cuando:** la gestora asigna un checklist recurrente y el técnico lo completa con foto desde el celular, con todo auditado.

### Fase 6 básica: Reportes y alertas (M) — **se adelanta**
- Cifras calculadas **en la base** (vistas o funciones), no en el navegador; tarjetas de cifra y gráficos con los colores `chart-1…7`.
- Reglas de alerta simples (disparador, tabla `alerts`, notificación). La parte avanzada de la Fase 6 espera al chat.
- **Listo cuando:** hay un panel de cumplimiento por área y una alerta de «equipo defectuoso».

### Fase 5: Chat, documentos, aprobaciones y wiki (L a XL)
1. **Chat primero:** `channels`, `channel_members`, `messages` con Realtime de Supabase, canales cerrados por área gestionados por el administrador, menciones con `@`, adjuntos que reutilizan la Fase 2.
2. **Aprobaciones y Wiki** (están en tu `CLAUDE.md` y en los prompts, **pero no en el roadmap**): `approval_requests` con pasos y estados; wiki en árbol **sin edición simultánea al inicio** (bloqueo «alguien más está editando»).
3. **Documentos colaborativos:** TipTap con Yjs, cursores y comentarios, tras la prueba técnica de colaboración.
- **Listo cuando:** se redacta un informe entre varias personas mientras se discute en el canal del área.

### Fase 3: Planillas vivas (XL, con prueba técnica)
- **3A (primero):** tablas con columnas tipadas, vistas de lista, tablero y calendario, actualización en vivo por fila, importar y exportar Excel y CSV, columnas calculadas simples.
- **3B (solo si hace falta):** prueba técnica de 1 a 2 semanas con éxito definido: 5 personas editando 1.000 filas a la vez, sin pérdida de datos y con conflictos resueltos. Si no se cumple, se mantiene 3A.
- **Riesgo:** alto. Es la parte más difícil del producto.

### Fase 7: Modo sin conexión (L)
- PWA instalable (manifiesto y service worker), caché del esqueleto de la app, **cola de salida en IndexedDB** para completar tareas, subir evidencias y comentar, con reintentos e idempotencia.
- **Conflictos:** gana el servidor, salvo en campos que solo se agregan (fotos, comentarios).
- **No hay edición sin conexión** de documentos ni planillas colaborativos.
- Indicador visible de sincronización; probar en dispositivos reales (iOS tiene límites propios para PWA y notificaciones).
- **Listo cuando:** una foto tomada sin señal se sube sola al recuperarla.

### Fase 8: Auditoría y cierre (M, y continua)
- El registro existe desde la Fase 1. Aquí se **endurece**: bloquear actualizar y borrar sobre `audit_log` (disparador y permisos), visor para el administrador con filtros, exportación, retención y partición por mes, alertas por acciones críticas (cambios de rol).
- **Tarea 8.2 del roadmap:** pruebas de punta a punta de cada módulo (p. ej. Playwright), prueba de carga, revisión de seguridad (panel de avisos, pruebas de RLS), **restauración de respaldo probada**, documentación y capacitación.

## Lo que falta en el roadmap

Aprobaciones y Wiki (están en tus documentos, no en el Excel) · búsqueda global · notificaciones (correo y push) · administración de áreas · baja de usuarios · respaldo y restauración · entornos dev y prod · pruebas automáticas y CI · monitoreo · privacidad y legal · ayuda y primeros pasos · exportación de los datos de la empresa · límites y cuotas · accesibilidad.

## Dominio `dentimagen.cl` administrado por un tercero

**Riesgos:** cada cambio de DNS depende de la empresa; un error en el correo corporativo (SPF, MX) afecta a todos; y si el **titular** del dominio en NIC Chile fuera la empresa y no Dentimagen, esta no controlaría su propio dominio.

**Pasos**
1. **Verificar el titular** del dominio en nic.cl. Debe ser Dentimagen, con contacto administrativo propio.
2. **Pedir un respaldo** de la zona DNS actual a la empresa.
3. **Usar subdominios**, sin tocar el dominio raíz ni el correo. Propuesta: landing en `dentihub.dentimagen.cl` y app en `app.dentihub.dentimagen.cl`.
4. **Pedir a la empresa** que cree los registros que indique el alojamiento (CNAME y, si hace falta, un TXT de verificación).
5. **Correo desde el dominio** (avisos de DentiHub): el proveedor de correo transaccional pedirá registros SPF, DKIM y DMARC. **Solo puede haber un SPF**: la empresa debe fusionarlo con el existente, sin reemplazarlo.
6. **Configurar Supabase Auth** con la dirección real (Site URL y Redirect URLs) y su correo saliente.
7. **Alternativa:** registrar un dominio propio para el producto (p. ej. `dentihub.cl`), con DNS bajo tu control, si DentiHub se va a ofrecer fuera de Dentimagen. Confirma costo y requisitos en nic.cl.

**Mensaje para la empresa (adaptar)**

> Hola. Estamos preparando una plataforma interna y necesitamos publicar un subdominio de dentimagen.cl. Les pedimos: (1) una copia de la zona DNS actual; (2) crear el registro CNAME `dentihub` apuntando a `[DESTINO QUE ENTREGAREMOS]`, y (3) confirmarnos cuál es el titular del dominio en NIC Chile y quién es el contacto administrativo. No deben modificar los registros MX ni el SPF actual. Más adelante les enviaremos registros para el correo de avisos, que deberán integrarse al SPF vigente sin reemplazarlo. Gracias.

## Consecuencias

- **Más fácil:** un solo stack y kit, seguridad probada desde el inicio, valor temprano en terreno (Fase 4), menos riesgo técnico al final.
- **Más difícil:** hay trabajo previo sin pantallas vistosas (Fase 0); el orden difiere del Excel; hay que esperar a la empresa para cada cambio de DNS.
- **A revisar:** región y plan de Supabase, resultado de la prueba técnica de colaboración, y si DentiHub es producto o herramienta interna.

## Riesgos principales

| Riesgo | Mitigación |
|---|---|
| Colaboración en vivo más difícil de lo previsto | Prueba técnica antes de comprometerse; 3A como respaldo |
| Fuga de datos entre áreas | Pruebas automáticas de RLS en cada fase |
| Costos que crecen (almacenamiento, tiempo real) | Cuotas, compresión de imágenes, revisar precios cada fase |
| Dependencia de la empresa del dominio | Subdominios, respaldo de DNS, verificar titularidad |
| Clave de servicio expuesta | Solo en el servidor; búsqueda de claves en el CI |
| Offline más complejo de lo previsto | Limitarlo a tareas, checklists y fotos |

## Acciones inmediatas

1. [ ] Verificar el titular de `dentimagen.cl` en nic.cl y enviar el mensaje a la empresa.
2. [ ] Decidir región y plan de Supabase (un proyecto nuevo es barato **mientras esté vacío**).
3. [ ] Decidir el ámbito de acceso (áreas) y escribir su migración.
4. [ ] Crear los entornos dev y prod y el CI.
5. [ ] Construir la landing.
6. [ ] Aprobar el orden de fases y actualizar el roadmap.

## Preguntas abiertas (decide Bernardo)

1. ¿DentiHub es una herramienta interna de Dentimagen o un producto que se ofrecerá a otras empresas?
2. ¿Cuántas personas lo usarán al inicio, y cuántos GB de archivos se esperan?
3. ¿Qué dispositivos usan los técnicos (Android o iPhone)? Afecta el modo sin conexión y las notificaciones.
4. ¿Presupuesto mensual aproximado para servicios (Supabase Pro, colaboración en vivo, correo)?
5. ¿Se usa Lovable para construir, o se desarrolla directamente en el repositorio?
