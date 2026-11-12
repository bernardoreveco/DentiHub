# Prompt: oleada 0, conectar Operación a Supabase

Es el requisito del [ADR-0006](../adr/0006-priorizacion-de-herramientas.md). Hoy, la app real (`VITE_DATA_SOURCE=supabase`) muestra el aviso «Las tareas todavía no están conectadas». Esta oleada conecta tareas, checklist, fotos, completar y cancelar a la base de la Etapa 1, que ya está escrita.

**Cómo usarlo:** abre una sesión nueva de Claude Code en la carpeta de DentiHub y pega el bloque.

**Conviene tener antes:**
- **El proyecto de Supabase de desarrollo**, con las migraciones de la Etapa 1 y la de Acceso aplicadas. Sin él, el trabajo avanza, pero no se puede probar contra una base real.
- **La oleada de Acceso terminada.** Ya lo está en el código (commit `bb09dcb`).

---

```text
Eres el agente principal de DentiHub. Vas a construir la OLEADA 0 del ADR-0006: conectar el
módulo Operación (tareas, checklist, fotos de evidencia, completar y cancelar) a Supabase, en la
app real de app/. La demo debe seguir funcionando igual.

## 0. Lee primero (no adivines nada que esté escrito ahí)
1. CLAUDE.md y AGENTE.md (límites, regla de sincronización §8 con Miro, equipo de agentes §12).
2. docs/adr/0006-priorizacion-de-herramientas.md (qué es la oleada 0 y qué NO entra).
3. docs/modulos/03-operacion.md: pantallas O1 a O8, un flujo por pantalla.
4. starter-kit/supabase/migrations/20261110130000_etapa1_tareas_evidencia_storage.sql:
   tablas form_templates, tasks y task_evidence; enum task_status; bucket «evidence»; funciones
   save_task_progress, complete_task, cancel_task, register_evidence y create_form_template;
   GRANT por columnas de tasks; políticas de storage.objects.
5. app/src/datos/fuente.ts (contrato), demo.ts (comportamiento esperado), supabase.ts (Acceso ya
   hecho; la parte de Operación lanza PENDIENTE_OPERACION) y app/src/modulos/operacion/.

## 1. Lo que ya está decidido (no lo reabras)
- Las pantallas no cambian: solo se implementa la parte de Operación de crearFuenteSupabase().
- La seguridad la impone la base (RLS y funciones). La app solo traduce los errores.
- save_task_progress MEZCLA (answers || p_answers): se envían solo los pasos que cambiaron,
  igual que el contrato guardarAvance(tareaId, cambios).
- Ruta de la foto en Storage: «{org_id}/{task_id}/{client_uuid}.jpg», todo en minúscula (lo
  exigen evidence_path_org_id y evidence_path_task_id).
- Las URL firmadas para ver fotos duran 60 SEGUNDOS, se piden al mostrarlas y no se guardan.
- Fuera de esta oleada (no lo hagas): prioridad, tareas que se repiten, editor de plantillas,
  alertas, Excel y modo sin conexión. Son la oleada 1 o posteriores.

## 2. Trabajo
### 2.1 dh-frontend: app/src/datos/supabase.ts (parte de Operación)
- plantillas(): lee form_templates activas de la organización y traduce schema → Plantilla
  (steps[].key/label/type/required, con required por defecto true; requires_photo; min_photos,
  con 1 por defecto). Un tipo de paso desconocido no se muestra como respondible (fail-closed).
- tareas(): lee tasks con la RLS (el Técnico recibe solo las suyas). NO traigas la tabla
  entera: las abiertas, más las cerradas o canceladas de los últimos 90 días, ordenadas por
  vencimiento. Traduce las columnas al tipo Tarea.
- tarea(id): una fila o null (sin acceso = null, nunca un error que filtre si existe).
- evidencias(tareaId): lee task_evidence y crea una URL firmada de 60 s por foto
  (createSignedUrls, en una sola llamada). Las pantallas deben volver a pedirla si venció
  (staleTime menor a 60 s en useEvidencias).
- guardarAvance(tareaId, cambios): rpc save_task_progress(p_task_id, p_answers = cambios).
- subirEvidencia(tareaId, foto):
  (a) genera client_uuid con crypto.randomUUID();
  (b) sube a Storage con upsert:false y contentType "image/jpeg";
  (c) llama a register_evidence(p_task_id, p_storage_path, p_client_uuid).
  Si (c) falla por la red, reintenta (c) con el MISMO client_uuid (es idempotente). Si (b) ya
  subió y (c) falla por una regla, informa el mensaje de la base. El objeto huérfano lo cuenta el
  tope de 20: documéntalo como pendiente de limpieza en el servidor. Nunca reintentes (b) con otro
  nombre.
- completar(id): rpc complete_task. cancelar(id, motivo): rpc cancel_task(p_task_id, p_reason).
- crearTarea(d): INSERT en tasks solo con las columnas concedidas (title, area_id, template_id,
  assignee_id, due_at), con .select("id").single(). Es UNA sola escritura; la base valida
  (tasks_enforce_rules).
- Errores: los RAISE EXCEPTION de la base (códigos P0001 y 42501) pasan tal cual, como
  ErrorDeRegla. Red o 5xx pasan como ErrorDeConexion. Cualquier otro error, con un mensaje
  genérico en español de Chile.
- Quita PENDIENTE_OPERACION. Reportes sigue calculando en el navegador sobre tareas(); deja un
  comentario de que la oleada 1 lo pasa a una función agregada en la base.

### 2.2 dh-datos: solo si hace falta, una migración pequeña (prepararla, NUNCA ejecutarla)
- Revisa si la app necesita algo que la base no da (por ejemplo, leer form_templates siendo
  Técnico para ver los pasos de su tarea: la política ya lo permite por la tarea asignada;
  confírmalo). Si falta algo, una migración «20261113120000_operacion_ajustes.sql» con
  encabezado, GRANT mínimos, RLS y reversa. Si no falta nada, dilo y no crees archivos.
- Agrega a la guía de pruebas una sección «Operación desde la API»: subir y registrar una foto,
  repetir register_evidence con el mismo client_uuid (no duplica), una foto en la ruta de otra
  organización (se rechaza), completar sin la foto (se rechaza) y un Técnico leyendo una tarea
  ajena (0 filas).

### 2.3 dh-revisor y dh-sincronizador
- dh-revisor: errores que filtren datos, URL firmadas guardadas en caché más de 60 s, claves en
  el código, textos y diseño.
- dh-sincronizador: BASE-DEL-PRODUCTO.md (estado de Tareas: conectado a la app real),
  03-operacion.md (cualquier detalle de flujo que cambie), CLAUDE.md y el verificador. Si cambian
  conexiones (por ejemplo, el flujo de subida de la foto), entrega al agente principal la lista
  de diagramas de Miro que debe actualizar (AGENTE.md §8).

## 3. Verificación antes de decir «terminado»
- npm --prefix app run typecheck y npm --prefix app run build sin errores.
- node scripts/verificar-sincronizacion.mjs y node scripts/generar-html-diagramas.mjs.
- El modo demo sigue igual: prueba en el navegador el flujo del técnico (pasos, coma decimal,
  foto, completar) y la creación de tareas del gestor.
- Con el proyecto de desarrollo, y SOLO si Bernardo lo confirmó: recorre O1 a O8 con un técnico,
  un gestor y un administrador reales. Prueba que un técnico no ve tareas ajenas ni llamando a la
  API, que sin foto no se completa, y que una foto con mala señal no se duplica.
- Lo que no se pudo probar queda marcado como «no verificado».

## 4. Límites (no se negocian)
- No ejecutes SQL en ningún Supabase sin la confirmación explícita de Bernardo en ese momento;
  nunca toques los proyectos de inventario.
- No escribas, pidas ni repitas claves. No hagas commit, push ni borres archivos sin confirmación.
- Si un flujo de 03-operacion.md resulta imposible o inseguro tal como está, detente y propón.

## 5. Informe final (en español, corto)
1. Al INICIO: si hubo migración nueva, destacada y sin aplicar.
2. ✅ Verificado y ⚠ no verificado, separados.
3. Listas Sincronizado y Pendiente de sincronizar (con Miro).
4. Qué debe hacer Bernardo, en orden.
5. Mensaje de commit sugerido.
```
