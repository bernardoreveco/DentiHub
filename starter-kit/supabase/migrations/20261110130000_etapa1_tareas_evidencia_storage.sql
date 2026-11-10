-- ════════════════════════════════════════════════════════════════════════════
-- DentiHub · Etapa 1 (2 de 3) · plantillas, tareas, evidencia fotográfica y Storage.
--
-- AVISO: NO EJECUTADA. Se preparó solo como archivo; la aplica Bernardo (o el agente principal con su
--   confirmación). Pruébala primero en un proyecto de DESARROLLO.
-- GUÍA DE PRUEBAS (RLS, permisos, Storage y tareas, con resultados esperados):
--   starter-kit/supabase/pruebas/etapa1-pruebas-rls.md
-- DEPENDE DE: 20261105130000_endurecer_permisos_y_roles.sql y 20261110120000_etapa1_organizacion_y_areas.sql
--   (auth_org(), auth_role(), is_manager(), organizations, areas, profiles.org_id/active). Esta migración lo
--   comprueba y se detiene si falta algo.
--
-- QUÉ HACE Y POR QUÉ (Etapa 1: app de terreno; sin carpetas/archivos/chat/planillas, que son Etapa 2):
--
--   Tablas: form_templates (plantillas/checklists VERSIONADAS), task_definitions (tareas recurrentes),
--   tasks (tareas únicas o generadas) y task_evidence (fotos). Más el bucket PRIVADO `evidence`.
--
--   REGLA CRÍTICA, impuesta EN LA BASE y no solo en la interfaz: una tarea no puede quedar `completada` si
--   (a) falta algún paso obligatorio de su plantilla o (b) la plantilla exige foto y no hay suficientes
--   evidencias registradas. Cómo se garantiza, en tres capas independientes:
--     1. authenticated NO tiene UPDATE sobre status / answers / completed_at (GRANT por columnas) ni existe
--        política de UPDATE para el técnico: el avance solo entra por save_task_progress() y el cierre por
--        complete_task() (SECURITY DEFINER, validan quién llama y qué falta).
--     2. Trigger de guarda tasks_guard_columns: aunque algún día se concediera un GRANT demasiado amplio,
--        quien llega por la API (anon/authenticated) no puede tocar esas columnas.
--     3. Trigger tasks_enforce_rules (BEFORE INSERT OR UPDATE): comprueba la regla de completitud para
--        CUALQUIER camino (también service_role o el SQL Editor), y las transiciones de estado válidas. Una
--        tarea cerrada (completada/cancelada) no vuelve a cambiar de estado ni de respuestas. Para cargar
--        datos históricos ya cerrados el propietario tendría que desactivar ese trigger a propósito.
--
--   task_evidence es de solo inserción para todo el mundo desde la API (sin UPDATE ni DELETE): se registra con
--   register_evidence(task, ruta, client_uuid), que exige que quien llama sea el asignado, que la ruta sea
--   {org_id}/{task_id}/{uuid}.ext y que el archivo EXISTA de verdad en Storage (sin esto bastaría inventar una
--   ruta para «tener foto»). client_uuid único = idempotencia: reintentar devuelve la fila ya existente.
--
-- LA «FOTO» ES FALSIFICABLE: QUÉ SE ENDURECIÓ Y QUÉ NO (hallazgo de revisión)
--   Antes solo se exigía que el objeto existiera con metadata->>'size' > 0: bastaba subir 1 byte, un archivo que
--   no es imagen, o el mismo archivo varias veces para «juntar» las fotos que pide la plantilla. Ahora
--   register_evidence() exige además, sobre el objeto de storage.objects:
--     · Tamaño mínimo: evidence_min_bytes() = 10240 bytes (10 KB; una foto real de teléfono pesa cientos de KB).
--       CONSTANTE FÁCIL DE CAMBIAR: vive en UNA función (evidence_min_bytes); para cambiarla, una migración nueva
--       con CREATE OR REPLACE de esa función.
--     · Tipo: metadata->>'mimetype' dentro de evidence_allowed_mime_types(), que es la MISMA lista con que se
--       configura el bucket (una sola fuente).
--     · Sin repetidos: si el objeto tiene metadata->>'eTag', no puede coincidir con el de otra evidencia de la
--       MISMA tarea (la misma foto sí puede estar en tareas distintas: p. ej. dos tareas con la misma toma).
--   LO QUE ESTO NO RESUELVE (límites honestos):
--     · VERIFICAR EL CONTENIDO REAL (los «magic bytes»: que el archivo de verdad empiece como un JPEG, PNG,
--       WebP o HEIC) NO se puede hacer en SQL y queda PENDIENTE: exige una Edge Function (o un proceso con
--       service_role) que lea los primeros bytes del objeto antes de aceptar el registro.
--     · El tamaño se rellena con ceros; el mimetype es el que DECLARA quien sube (Content-Type), no el real; y una
--       re-codificación de la misma imagen cambia el eTag. Todo esto solo sube el costo de falsificar.
--     · Las claves de metadata se verifican SOLO al registrar; un objeto subido y no registrado no cuenta como
--       foto (pero ocupa espacio: ver «Limpieza» en STORAGE).
--   ⚠ NO VERIFICADO contra un Storage real (no hay base disponible): los nombres EXACTOS de las claves que Storage
--     escribe en storage.objects.metadata. Se asumen estos tres: 'size' (número), 'mimetype' (texto, por ejemplo
--     'image/jpeg') y 'eTag' (texto; la T mayúscula y las comillas que puede traer son suposición). También se
--     asume que el eTag es estable para el mismo contenido (en subidas por partes o reanudables puede no serlo) y
--     que el mimetype viene sin «; charset=…». Si alguna clave se llama distinto, la comprobación falla CERRADA
--     (size o mimetype ausentes = rechazo; eTag ausente = no se compara) y nadie podrá registrar fotos. Cómo
--     comprobarlo: subir UNA foto real por la API y mirar SELECT name, metadata FROM storage.objects (ver la
--     guía de pruebas, sección de Storage) ANTES de dar la migración por buena.
--
-- UNA SOLA CONSTANTE PARA EL MÁXIMO DE FOTOS: evidence_max_per_task() = 20. La usan register_evidence (fotos
--   registradas por tarea) y la política de subida a Storage (objetos por tarea). Si algún día se baja de 20,
--   hay que bajar también el tope de min_photos de form_schema_is_valid (hoy 20), o una plantilla podría exigir
--   más fotos de las que se admiten y quedar imposible de completar.
--
-- FORMATO DE form_templates.schema (jsonb; lo valida form_schema_is_valid con un CHECK):
--   {
--     "requires_photo": true,          -- OBLIGATORIO (boolean): la plantilla debe decidir explícitamente
--     "min_photos": 1,                 -- opcional (entero 1..20, por defecto 1)
--     "steps": [                       -- 0 a 100 pasos
--       { "key": "limpieza",           -- obligatorio, único, [A-Za-z0-9_-]{1,64}: es la llave en tasks.answers
--         "label": "Limpieza hecha",   -- obligatorio, texto que ve la persona
--         "type": "check",             -- opcional: check (por defecto; debe quedar en true) | yesno | text | number
--         "required": true }           -- opcional, por defecto TRUE (un paso es obligatorio salvo que diga false)
--     ]
--   }
--
-- QUÉ PASA SI UNA PLANTILLA CAMBIA DE VERSIÓN CON TAREAS ABIERTAS (decisión documentada):
--   · Una versión nunca se edita (trigger form_templates_immutable): corregir = publicar una versión nueva con
--     create_form_template(nombre, schema), que calcula la versión siguiente de forma atómica.
--   · Cada tarea queda ANCLADA a la versión con que se creó (tasks.template_id inmutable). Las tareas abiertas
--     se completan contra SU versión: la persona ya empezó a responder esos pasos y cambiarlos a mitad de camino
--     podría invalidar respuestas o volverlas imposibles de cerrar.
--   · La versión nueva queda activa y las anteriores del mismo nombre pasan a inactivas: no se pueden usar
--     para tareas NUEVAS (sí siguen sirviendo a las abiertas). Quien quiera que una tarea abierta use la versión
--     nueva la cancela (cancel_task) y crea otra.
--   · NO SE REACTIVA UNA VERSIÓN ANTIGUA (hallazgo de revisión): un gestor podía volver a activar la versión 1,
--     más laxa, de una plantilla y crear tareas con ella para saltarse las exigencias nuevas. El trigger
--     form_templates_immutable ahora rechaza pasar de inactiva a activa una versión si existe otra MAYOR con el
--     mismo nombre en la organización. Desactivar sigue permitido (sirve para retirar una plantilla); y
--     reactivar la versión MÁS ALTA también (si la retiraste por error). Quien quiera volver al contenido de
--     una versión antigua publica una versión nueva con ese contenido (create_form_template). create_form_template
--     no se ve afectada: inserta la versión nueva (el trigger es solo de UPDATE) y luego DESACTIVA las anteriores.
--   · Las tareas recurrentes (task_definitions) apuntadas a la versión anterior pasan automáticamente a la nueva:
--     «repite este checklist cada día» significa «el vigente». Las ya generadas no cambian.
--
-- DECISIONES QUE CONVIENE CONOCER
--   · Toda tarea lleva plantilla (template_id NOT NULL). Si se dejara opcional, bastaría crear una tarea sin
--     plantilla para saltarse la exigencia de foto. Para una tarea simple se usa una plantilla sin pasos y con
--     requires_photo = false.
--   · Visibilidad: admin y gestor ven todas las tareas, evidencias y plantillas de su organización; el técnico,
--     SOLO las tareas asignadas a él, su evidencia y las plantillas de esas tareas. Una tarea sin asignar es
--     visible solo para admin/gestor. Las definiciones recurrentes solo las ve admin/gestor.
--   · Crear/editar: solo admin y gestor crean tareas, y pueden editar title, area_id, assignee_id y due_at
--     mientras la tarea esté abierta. El técnico no crea ni actualiza tareas directamente.
--   · Nadie borra tareas ni evidencia por la API (no hay DELETE): se cancela. Borrar a una persona de
--     Authentication fallará mientras tenga tareas o evidencia (claves foráneas RESTRICT): se desactiva con
--     admin_set_active(). Es intencional: preserva el historial.
--   · El asignado debe ser una persona ACTIVA de la misma organización y con rol (las claves foráneas
--     compuestas aseguran la organización; el trigger, el estado y el rol). Si después se desactiva a esa
--     persona, sus tareas siguen ahí hasta que un gestor las reasigne.
--   · Un administrador/gestor puede completar una tarea de otra persona (complete_task lo permite), pero la
--     evidencia solo la registra el asignado; si la plantilla exige foto, esa foto tiene que existir.
--   · register_evidence pasa la tarea de pendiente a en_progreso (empezó el trabajo).
--   · Tope de tasks.answers: 32 KB (antes 100 KB), en el CHECK de la columna y en save_task_progress. Cada
--     guardado con cambios copia la fila completa dos veces (old_data y new_data) en una auditoría que no se
--     puede podar (ver migración 3); 32 KB sigue sobrando para un checklist (100 pasos como máximo, la mayoría
--     sí/no). save_task_progress también revisa el tamaño de las respuestas YA MEZCLADAS, para dar un mensaje
--     claro en vez del error genérico del CHECK. Limitar la frecuencia de guardados por cuenta NO se hace en SQL:
--     queda pendiente (interfaz, Edge Function o borde de red).
--   · Fecha del día en hora de Chile: task_definitions.starts_on usa por defecto la fecha de America/Santiago, no
--     CURRENT_DATE. El servidor trabaja en UTC; desde las 20:00 o 21:00 en Chile (según el horario de verano) hasta la
--     medianoche, CURRENT_DATE ya es «mañana» y una definición creada de noche empezaría un día después de lo
--     que ve la persona. El generador
--     (generate_recurring_tasks) compara siempre contra esa misma fecha de Chile.
--   · service_role: se le quita TRUNCATE sobre form_templates, task_definitions, tasks y task_evidence (conserva
--     SELECT, INSERT, UPDATE y DELETE). El propietario sigue pudiendo vaciarlas y TRUNCATE no deja rastro en la
--     auditoría; la copia de la auditoría fuera de la base queda pendiente (ver migración 3).
--   · Borrar personas: las claves foráneas RESTRICT hacia profiles (assignee_id, created_by, completed_by,
--     uploaded_by) más la auditoría inmutable impiden borrar a una persona con historial. Choca con una eventual
--     solicitud de eliminación de datos personales: decisión PENDIENTE de Bernardo (ver migración 3).
--
-- STORAGE: bucket privado `evidence`, ruta {org_id}/{task_id}/{uuid}.ext (extensión en minúscula: jpg, jpeg,
--   png, webp, heic, heif). Tamaño máximo 10 MB y solo tipos de imagen. Las políticas de storage.objects
--   verifican el task_id de la RUTA contra las tareas que la persona puede ver (RLS de tasks): el técnico solo
--   lee objetos de tareas asignadas a él y solo sube a las suyas y abiertas, y solo mientras la tarea tenga
--   menos de evidence_max_per_task() objetos (registrados o no) bajo su prefijo; admin/gestor leen los de su
--   organización. NO hay política de UPDATE ni DELETE: nadie modifica ni borra desde la API, y por eso la
--   subida debe hacerse con upsert = false y un nombre uuid nuevo. Limpieza: los archivos huérfanos (subidos y
--   nunca registrados) y los de tareas antiguas se eliminan con un proceso administrativo con service_role por
--   la API de Storage (no con DELETE en SQL, que deja el archivo vivo en el almacenamiento); la consulta para
--   detectar huérfanos está en la guía de pruebas (starter-kit/supabase/pruebas/etapa1-pruebas-rls.md). NO se
--   crea el bucket `files` (Etapa 2).
--   CONSECUENCIA DEL TOPE DE OBJETOS: los objetos huérfanos también cuentan. Un técnico cuyas subidas se
--   cortaron varias veces (y que reintentó con nombres nuevos) podría llegar al tope sin tener 20 fotos
--   registradas, y quedaría bloqueado hasta que se limpien los huérfanos. Es el costo de que el tope no se pueda
--   saltar subiendo y no registrando. El tope no es exacto bajo concurrencia (dos subidas simultáneas pueden
--   pasar a la vez); el tope DURO de fotos registradas está en register_evidence, que sí bloquea la tarea.
--   URL FIRMADAS: desactivar una cuenta NO invalida las URL firmadas ya emitidas ni la sesión (JWT) hasta que
--   venzan. Recomendación para la interfaz: emitir URL firmadas de vida corta (60 segundos), bajo demanda cada
--   vez que se muestra una foto, y no guardarlas ni compartirlas. La RLS decide en el momento de FIRMAR, no de
--   usar la URL.
--
-- TAREAS RECURRENTES: generate_recurring_tasks(fecha) está definida pero NO programada. La línea de pg_cron
--   queda COMENTADA al final de la sección correspondiente (habilitar pg_cron es decisión de Bernardo).
--
-- PENDIENTE (migración posterior, no se hace aquí): notificaciones y reglas de alerta.
--
-- Idempotente: sí (IF NOT EXISTS, CREATE OR REPLACE, DROP POLICY/TRIGGER IF EXISTS antes de crear, bucket con
--   ON CONFLICT). No contiene DROP de nada existente: los DROP ... IF EXISTS son solo de objetos que este mismo
--   archivo crea (para poder repetirlo). El bucket se re-configura (privado, límites) si ya existe.
-- Se ejecuta en una sola transacción.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0) Comprobaciones previas ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.auth_org()') IS NULL
     OR to_regprocedure('public.auth_role()') IS NULL
     OR to_regprocedure('public.is_manager()') IS NULL
     OR to_regclass('public.organizations') IS NULL
     OR to_regclass('public.areas') IS NULL THEN
    RAISE EXCEPTION
      'Migración detenida: falta aplicar antes 20261110120000_etapa1_organizacion_y_areas.sql (y la de endurecimiento).';
  END IF;
  IF to_regclass('storage.buckets') IS NULL OR to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'Migración detenida: Supabase Storage no está habilitado en este proyecto (no existe storage.buckets).';
  END IF;
  -- evidence_object_count() cuenta objetos de storage.objects como propietario de la función. Si ese rol no se
  -- salta la RLS, vería 0 filas y el tope de objetos por tarea fallaría ABIERTO en silencio (segunda revisión).
  -- En el Supabase real de DentiHub, `postgres` tiene BYPASSRLS (verificado en solo lectura, 2026-11-10).
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolbypassrls OR rolsuper)
  ) THEN
    RAISE EXCEPTION
      'Migración detenida: el rol que la aplica (%) no se salta la RLS (BYPASSRLS), y el tope de objetos de evidencia no funcionaría. Aplícala como postgres.',
      current_user;
  END IF;
END
$$;

-- ── 1) Tipo de estado ──────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'task_status'
  ) THEN
    CREATE TYPE public.task_status AS ENUM ('pendiente', 'en_progreso', 'completada', 'cancelada');
  END IF;
END
$$;

-- ── 2) Funciones puras (sin acceso a tablas; las usan CHECK, triggers y políticas) ─────────────
-- Las de este bloque necesitan EXECUTE para authenticated (las políticas de Storage y los CHECK las evalúan
-- con el rol de quien llama), pero NO para PUBLIC ni anon: el REVOKE/GRANT está justo después del bloque.

-- Constantes de la evidencia fotográfica. Postgres no tiene constantes, así que cada una es una función
-- IMMUTABLE de una línea: UN solo lugar donde cambiarla (CREATE OR REPLACE en una migración nueva) y que usan
-- register_evidence, la política de subida y el bucket. Ver «LA FOTO ES FALSIFICABLE» en el encabezado.
-- Tamaño mínimo de una foto, en bytes (10 KB). Fácil de cambiar: edita solo el número.
CREATE OR REPLACE FUNCTION public.evidence_min_bytes()
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT 10240; $$;

-- Máximo de fotos por tarea (registradas, y objetos bajo el prefijo de la tarea en Storage). Deben coincidir
-- siempre: por eso es una sola función. Ver el aviso sobre min_photos (tope 20) en el encabezado.
CREATE OR REPLACE FUNCTION public.evidence_max_per_task()
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT 20; $$;

-- Tipos MIME permitidos: la misma lista en el bucket y en register_evidence.
CREATE OR REPLACE FUNCTION public.evidence_allowed_mime_types()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']::text[]; $$;

-- ¿El jsonb tiene la forma documentada en el encabezado? Devuelve false (nunca error) si no.
CREATE OR REPLACE FUNCTION public.form_schema_is_valid(_schema jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_steps jsonb;
  v_step jsonb;
  v_keys text[] := '{}';
  v_key text;
BEGIN
  IF _schema IS NULL OR jsonb_typeof(_schema) <> 'object' THEN RETURN false; END IF;
  IF octet_length(_schema::text) > 100000 THEN RETURN false; END IF;
  IF jsonb_typeof(_schema -> 'requires_photo') IS DISTINCT FROM 'boolean' THEN RETURN false; END IF;

  IF (_schema -> 'min_photos') IS NOT NULL THEN
    IF jsonb_typeof(_schema -> 'min_photos') <> 'number' THEN RETURN false; END IF;
    IF (_schema ->> 'min_photos')::numeric <> trunc((_schema ->> 'min_photos')::numeric)
       OR (_schema ->> 'min_photos')::numeric NOT BETWEEN 1 AND 20 THEN
      RETURN false;
    END IF;
  END IF;

  v_steps := _schema -> 'steps';
  IF jsonb_typeof(v_steps) IS DISTINCT FROM 'array' OR jsonb_array_length(v_steps) > 100 THEN
    RETURN false;
  END IF;

  FOR v_step IN SELECT * FROM jsonb_array_elements(v_steps) LOOP
    IF jsonb_typeof(v_step) <> 'object' THEN RETURN false; END IF;
    IF jsonb_typeof(v_step -> 'key') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    v_key := v_step ->> 'key';
    IF v_key !~ '^[A-Za-z0-9_-]{1,64}$' OR v_key = ANY (v_keys) THEN RETURN false; END IF;
    v_keys := v_keys || v_key;
    IF jsonb_typeof(v_step -> 'label') IS DISTINCT FROM 'string'
       OR btrim(v_step ->> 'label') = '' OR length(v_step ->> 'label') > 300 THEN
      RETURN false;
    END IF;
    IF (v_step -> 'required') IS NOT NULL AND jsonb_typeof(v_step -> 'required') <> 'boolean' THEN
      RETURN false;
    END IF;
    IF (v_step -> 'type') IS NOT NULL
       AND (jsonb_typeof(v_step -> 'type') <> 'string'
            OR (v_step ->> 'type') NOT IN ('check', 'yesno', 'text', 'number')) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

-- ¿La respuesta cuenta como «respondida» para ese paso? check: debe ser true; yesno: sí o no (cualquiera de
-- los dos es una respuesta); text: no vacío; number: un número. Tipo desconocido = no respondida (fail-closed).
CREATE OR REPLACE FUNCTION public.step_is_answered(_step jsonb, _answer jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF _answer IS NULL OR jsonb_typeof(_answer) = 'null' THEN RETURN false; END IF;
  CASE COALESCE(_step ->> 'type', 'check')
    WHEN 'check' THEN RETURN _answer = 'true'::jsonb;
    WHEN 'yesno' THEN RETURN jsonb_typeof(_answer) = 'boolean';
    WHEN 'text' THEN RETURN jsonb_typeof(_answer) = 'string' AND btrim(_answer #>> '{}') <> '';
    WHEN 'number' THEN RETURN jsonb_typeof(_answer) = 'number';
    ELSE RETURN false;
  END CASE;
  RETURN false;
END;
$$;

-- Partes de la ruta de Storage {org_id}/{task_id}/{uuid}.ext. Devuelven NULL si la ruta no tiene
-- exactamente esa forma (uuid en minúscula y extensión permitida): así una ruta rara nunca da error en una
-- política, simplemente no coincide con nada.
CREATE OR REPLACE FUNCTION public.evidence_path_org_id(_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|heic|heif)$'
    THEN split_part(_name, '/', 1)::uuid
  END;
$$;

CREATE OR REPLACE FUNCTION public.evidence_path_task_id(_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|heic|heif)$'
    THEN split_part(_name, '/', 2)::uuid
  END;
$$;

-- Sin EXECUTE para PUBLIC ni anon (hallazgo de revisión: estas funciones no tenían REVOKE). Se mantiene EXECUTE
-- para authenticated y service_role porque las políticas de Storage y los CHECK las llaman con el rol de quien
-- consulta; son funciones puras que no leen tablas, así que no filtran datos.
REVOKE EXECUTE ON FUNCTION public.evidence_min_bytes() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.evidence_max_per_task() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.evidence_allowed_mime_types() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.form_schema_is_valid(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.step_is_answered(jsonb, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.evidence_path_org_id(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.evidence_path_task_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evidence_min_bytes() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.evidence_max_per_task() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.evidence_allowed_mime_types() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.form_schema_is_valid(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.step_is_answered(jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.evidence_path_org_id(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.evidence_path_task_id(text) TO authenticated, service_role;

-- ── 3) form_templates (versionadas) ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.form_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT public.auth_org() REFERENCES public.organizations (id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  schema jsonb NOT NULL CHECK (public.form_schema_is_valid(schema)),
  -- active = «disponible para tareas NUEVAS». Las versiones anteriores quedan inactivas pero siguen sirviendo
  -- a las tareas abiertas que ya las usan.
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT form_templates_org_name_version_key UNIQUE (org_id, name, version),
  CONSTRAINT form_templates_id_org_key UNIQUE (id, org_id)
);

-- ── 4) task_definitions (tareas recurrentes) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT public.auth_org() REFERENCES public.organizations (id) ON DELETE RESTRICT,
  area_id uuid,
  template_id uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  assignee_id uuid,
  frequency text NOT NULL CHECK (frequency IN ('diaria', 'semanal', 'mensual')),
  weekday smallint CHECK (weekday BETWEEN 1 AND 7),            -- 1 = lunes … 7 = domingo (ISO); solo semanal
  day_of_month smallint CHECK (day_of_month BETWEEN 1 AND 28), -- solo mensual (hasta 28: existe en todos los meses)
  due_offset_hours integer NOT NULL DEFAULT 12 CHECK (due_offset_hours BETWEEN 1 AND 720),
  -- Fecha de HOY EN CHILE, no CURRENT_DATE (que sigue la zona horaria de la sesión, UTC en Supabase): de noche
  -- en Chile ya sería «mañana». Misma zona que usa generate_recurring_tasks (ver «Fecha del día» en el encabezado).
  starts_on date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/Santiago'))::date,
  ends_on date,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Un CHECK con NULL «pasa»: por eso cada rama exige explícitamente que el dato exista.
  CONSTRAINT task_definitions_weekday_chk CHECK (
    frequency <> 'semanal' OR (weekday IS NOT NULL)),
  CONSTRAINT task_definitions_day_chk CHECK (
    frequency <> 'mensual' OR (day_of_month IS NOT NULL)),
  CONSTRAINT task_definitions_dates_chk CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT task_definitions_id_org_key UNIQUE (id, org_id),
  CONSTRAINT task_definitions_area_fk FOREIGN KEY (area_id, org_id)
    REFERENCES public.areas (id, org_id),
  CONSTRAINT task_definitions_template_fk FOREIGN KEY (template_id, org_id)
    REFERENCES public.form_templates (id, org_id),
  CONSTRAINT task_definitions_assignee_fk FOREIGN KEY (assignee_id, org_id)
    REFERENCES public.profiles (id, org_id)
);
CREATE INDEX IF NOT EXISTS task_definitions_org_active_idx ON public.task_definitions (org_id, active);
CREATE INDEX IF NOT EXISTS task_definitions_template_idx ON public.task_definitions (template_id);
-- Índices de las claves foráneas compuestas/simples que faltaban (área y asignado se consultan al reasignar o
-- desactivar, y Postgres los usa al validar el borrado de la fila referenciada).
CREATE INDEX IF NOT EXISTS task_definitions_area_idx ON public.task_definitions (area_id);
CREATE INDEX IF NOT EXISTS task_definitions_assignee_idx ON public.task_definitions (assignee_id);

-- ── 5) tasks ───────────────────────────────────────────────────────────────────────────────────
-- Las claves foráneas COMPUESTAS (x, org_id) garantizan en la base que área, plantilla, definición y asignado
-- son de la misma organización que la tarea. Con una columna NULL (área o asignado sin definir) la clave no se
-- evalúa, que es lo correcto: «sin área» y «sin asignar» son estados válidos.
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT public.auth_org() REFERENCES public.organizations (id) ON DELETE RESTRICT,
  definition_id uuid,
  area_id uuid,
  template_id uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  assignee_id uuid,
  status public.task_status NOT NULL DEFAULT 'pendiente',
  due_at timestamptz,
  scheduled_for date,                       -- fecha para la que la generó una definición recurrente
  -- Tope de 32 KB (32768 bytes; antes 100 KB): cada guardado copia la fila en la auditoría inmutable. Debe
  -- coincidir con el tope de save_task_progress.
  answers jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(answers) = 'object' AND octet_length(answers::text) <= 32768),
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid REFERENCES public.profiles (id) ON DELETE RESTRICT,
  cancelled_at timestamptz,
  cancel_reason text CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 500),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_id_org_key UNIQUE (id, org_id),
  CONSTRAINT tasks_completed_coherent_chk CHECK (
    (status = 'completada') = (completed_at IS NOT NULL)
    AND (completed_at IS NULL) = (completed_by IS NULL)),
  CONSTRAINT tasks_cancelled_coherent_chk CHECK ((status = 'cancelada') = (cancelled_at IS NOT NULL)),
  CONSTRAINT tasks_definition_fk FOREIGN KEY (definition_id, org_id)
    REFERENCES public.task_definitions (id, org_id),
  CONSTRAINT tasks_area_fk FOREIGN KEY (area_id, org_id)
    REFERENCES public.areas (id, org_id),
  CONSTRAINT tasks_template_fk FOREIGN KEY (template_id, org_id)
    REFERENCES public.form_templates (id, org_id),
  CONSTRAINT tasks_assignee_fk FOREIGN KEY (assignee_id, org_id)
    REFERENCES public.profiles (id, org_id)
);
-- Lista del técnico («mis tareas por estado»), lista del gestor (por estado y vencimiento) e índices de las FK.
CREATE INDEX IF NOT EXISTS tasks_assignee_status_idx ON public.tasks (assignee_id, status);
CREATE INDEX IF NOT EXISTS tasks_org_status_due_idx ON public.tasks (org_id, status, due_at);
CREATE INDEX IF NOT EXISTS tasks_template_idx ON public.tasks (template_id);
CREATE INDEX IF NOT EXISTS tasks_area_idx ON public.tasks (area_id);
-- Claves foráneas hacia profiles que no tenían índice (borrar o desactivar a una persona busca por estas columnas).
CREATE INDEX IF NOT EXISTS tasks_created_by_idx ON public.tasks (created_by);
CREATE INDEX IF NOT EXISTS tasks_completed_by_idx ON public.tasks (completed_by);
-- Idempotencia del generador: una definición genera como máximo UNA tarea por fecha (los NULL no chocan, así
-- que las tareas únicas no se ven afectadas).
CREATE UNIQUE INDEX IF NOT EXISTS tasks_definition_date_uidx ON public.tasks (definition_id, scheduled_for);

-- ── 6) task_evidence (solo inserción, vía register_evidence) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  task_id uuid NOT NULL,
  storage_path text NOT NULL UNIQUE,
  client_uuid uuid NOT NULL UNIQUE,         -- idempotencia: lo genera el teléfono antes de subir
  uploaded_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_evidence_task_fk FOREIGN KEY (task_id, org_id)
    REFERENCES public.tasks (id, org_id),
  -- Coherencia ruta/fila a nivel de tabla, por si alguna vez se inserta por otro camino. Ojo: un CHECK cuyo
  -- resultado es NULL «pasa»; las funciones devuelven NULL con una ruta mal formada, por eso el COALESCE.
  CONSTRAINT task_evidence_path_chk CHECK (
    COALESCE(public.evidence_path_task_id(storage_path) = task_id, false)
    AND COALESCE(public.evidence_path_org_id(storage_path) = org_id, false))
);
CREATE INDEX IF NOT EXISTS task_evidence_task_idx ON public.task_evidence (task_id);
CREATE INDEX IF NOT EXISTS task_evidence_uploaded_by_idx ON public.task_evidence (uploaded_by);

-- ── 7) Funciones internas (solo las llaman triggers y otras funciones; sin EXECUTE para la API) ─

-- ¿Qué falta para poder completar la tarea? NULL = nada (se puede completar). Una sola fuente de verdad: la
-- usan complete_task (mensaje claro) y el trigger tasks_enforce_rules (barrera final).
CREATE OR REPLACE FUNCTION public.task_completion_problems(_template_id uuid, _answers jsonb, _task_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schema jsonb;
  v_missing text;
  v_need integer;
  v_have integer;
  v_msg text := '';
BEGIN
  SELECT schema INTO v_schema FROM public.form_templates WHERE id = _template_id;
  IF v_schema IS NULL THEN
    RETURN 'La plantilla de la tarea no existe.';
  END IF;

  -- (a) pasos obligatorios sin responder (un paso es obligatorio salvo que diga required:false)
  SELECT string_agg(COALESCE(t.s ->> 'label', t.s ->> 'key'), ', ' ORDER BY t.ord)
    INTO v_missing
  FROM jsonb_array_elements(v_schema -> 'steps') WITH ORDINALITY AS t(s, ord)
  WHERE COALESCE((t.s ->> 'required')::boolean, true)
    AND NOT public.step_is_answered(t.s, COALESCE(_answers, '{}'::jsonb) -> (t.s ->> 'key'));
  IF v_missing IS NOT NULL THEN
    v_msg := 'Faltan pasos obligatorios por responder: ' || v_missing || '.';
  END IF;

  -- (b) evidencia fotográfica cuando la plantilla la exige
  IF (v_schema ->> 'requires_photo')::boolean THEN
    v_need := COALESCE(((v_schema ->> 'min_photos')::numeric)::integer, 1);
    SELECT count(*) INTO v_have FROM public.task_evidence WHERE task_id = _task_id;
    IF v_have < v_need THEN
      v_msg := btrim(v_msg || ' Falta la foto de evidencia (se exige ' || v_need || ', hay ' || v_have || ').');
    END IF;
  END IF;

  RETURN NULLIF(v_msg, '');
END;
$$;

-- Referencias válidas al crear o cambiar: plantilla activa, asignado activo y con rol, área activa.
-- (La misma organización ya la aseguran las claves foráneas compuestas.)
CREATE OR REPLACE FUNCTION public.internal_assert_task_refs(
  _org uuid, _template uuid, _assignee uuid, _area uuid,
  _check_template boolean, _check_assignee boolean, _check_area boolean
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _check_template AND NOT EXISTS (
    SELECT 1 FROM public.form_templates ft WHERE ft.id = _template AND ft.org_id = _org AND ft.active
  ) THEN
    RAISE EXCEPTION 'La plantilla no está disponible (está inactiva o es de otra organización). Usa su versión vigente.';
  END IF;
  IF _check_assignee AND _assignee IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = _assignee AND p.org_id = _org AND p.active
  ) THEN
    RAISE EXCEPTION 'La persona asignada debe ser un miembro activo de la organización y tener un rol.';
  END IF;
  IF _check_area AND _area IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.areas a WHERE a.id = _area AND a.org_id = _org AND a.active
  ) THEN
    RAISE EXCEPTION 'El área no está disponible (está inactiva o es de otra organización).';
  END IF;
END;
$$;

-- ── 8) Triggers ────────────────────────────────────────────────────────────────────────────────

-- 8.1 form_templates: una versión no se edita (solo se activa/desactiva). Vale para TODOS los caminos.
--     Además, una versión inactiva NO se reactiva si existe otra MAYOR con el mismo nombre (ver «NO SE REACTIVA
--     UNA VERSIÓN ANTIGUA» en el encabezado). SECURITY DEFINER para que la búsqueda de versiones mayores no
--     dependa de la RLS de quien actualiza (si no viera una versión mayor, la regla fallaría ABIERTA).
CREATE OR REPLACE FUNCTION public.form_templates_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.name IS DISTINCT FROM OLD.name OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.schema IS DISTINCT FROM OLD.schema OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Una versión de plantilla no se edita: publica una versión nueva. Solo se puede activar o desactivar.';
  END IF;

  IF NEW.active AND NOT OLD.active AND EXISTS (
    SELECT 1 FROM public.form_templates ft
    WHERE ft.org_id = NEW.org_id AND lower(ft.name) = lower(NEW.name) AND ft.version > NEW.version
  ) THEN
    RAISE EXCEPTION 'No se puede reactivar una versión anterior a la vigente de la plantilla. Publica una versión nueva con ese contenido.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- 8.2 task_definitions: referencias válidas.
CREATE OR REPLACE FUNCTION public.task_definitions_enforce_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ramas separadas a propósito: en un INSERT, OLD no está asignado y leer un campo suyo da error.
  IF TG_OP = 'INSERT' THEN
    PERFORM public.internal_assert_task_refs(
      NEW.org_id, NEW.template_id, NEW.assignee_id, NEW.area_id, true, true, true);
  ELSE
    PERFORM public.internal_assert_task_refs(
      NEW.org_id, NEW.template_id, NEW.assignee_id, NEW.area_id,
      NEW.template_id IS DISTINCT FROM OLD.template_id,
      NEW.assignee_id IS DISTINCT FROM OLD.assignee_id,
      NEW.area_id IS DISTINCT FROM OLD.area_id);
  END IF;
  RETURN NEW;
END;
$$;

-- 8.3 tasks, capa 2: quien llega por la API (anon/authenticated) no toca estado, respuestas ni anclajes.
--     SECURITY INVOKER a propósito (ver profiles_guard_columns en la migración 1).
CREATE OR REPLACE FUNCTION public.tasks_guard_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.org_id IS DISTINCT FROM OLD.org_id
       OR NEW.definition_id IS DISTINCT FROM OLD.definition_id
       OR NEW.template_id IS DISTINCT FROM OLD.template_id
       OR NEW.scheduled_for IS DISTINCT FROM OLD.scheduled_for
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.answers IS DISTINCT FROM OLD.answers
       OR NEW.started_at IS DISTINCT FROM OLD.started_at
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
       OR NEW.completed_by IS DISTINCT FROM OLD.completed_by
       OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
       OR NEW.cancel_reason IS DISTINCT FROM OLD.cancel_reason
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION
        'El estado, las respuestas y el cierre de una tarea solo se cambian con las funciones de tareas (guardar avance, completar o cancelar).'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 8.4 tasks, capa 3: reglas que valen para CUALQUIER camino (incluidos service_role y el SQL Editor).
CREATE OR REPLACE FUNCTION public.tasks_enforce_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_problems text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pendiente' THEN
      RAISE EXCEPTION 'Una tarea nueva debe crearse en estado pendiente.';
    END IF;
    PERFORM public.internal_assert_task_refs(
      NEW.org_id, NEW.template_id, NEW.assignee_id, NEW.area_id, true, true, true);
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.status IN ('completada', 'cancelada') THEN
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.answers IS DISTINCT FROM OLD.answers
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
       OR NEW.completed_by IS DISTINCT FROM OLD.completed_by
       OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at THEN
      RAISE EXCEPTION 'La tarea ya está cerrada (%): no se puede cambiar su estado ni sus respuestas.', OLD.status;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.template_id IS DISTINCT FROM OLD.template_id THEN
    RAISE EXCEPTION 'Una tarea no cambia de plantilla: cancélala y crea otra con la versión que corresponda.';
  END IF;

  PERFORM public.internal_assert_task_refs(
    NEW.org_id, NEW.template_id, NEW.assignee_id, NEW.area_id,
    false,
    NEW.assignee_id IS DISTINCT FROM OLD.assignee_id,
    NEW.area_id IS DISTINCT FROM OLD.area_id);

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT ((OLD.status = 'pendiente' AND NEW.status IN ('en_progreso', 'completada', 'cancelada'))
         OR (OLD.status = 'en_progreso' AND NEW.status IN ('completada', 'cancelada'))) THEN
      RAISE EXCEPTION 'Cambio de estado no permitido: de % a %.', OLD.status, NEW.status;
    END IF;
    IF NEW.status = 'completada' THEN
      v_problems := public.task_completion_problems(NEW.template_id, NEW.answers, NEW.id);
      IF v_problems IS NOT NULL THEN
        RAISE EXCEPTION 'No se puede completar la tarea. %', v_problems USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS form_templates_immutable ON public.form_templates;
CREATE TRIGGER form_templates_immutable
BEFORE UPDATE ON public.form_templates
FOR EACH ROW EXECUTE FUNCTION public.form_templates_immutable();

DROP TRIGGER IF EXISTS task_definitions_enforce_rules ON public.task_definitions;
CREATE TRIGGER task_definitions_enforce_rules
BEFORE INSERT OR UPDATE ON public.task_definitions
FOR EACH ROW EXECUTE FUNCTION public.task_definitions_enforce_rules();

DROP TRIGGER IF EXISTS tasks_guard_columns ON public.tasks;
CREATE TRIGGER tasks_guard_columns
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tasks_guard_columns();

DROP TRIGGER IF EXISTS tasks_enforce_rules ON public.tasks;
CREATE TRIGGER tasks_enforce_rules
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tasks_enforce_rules();

-- updated_at automático (set_updated_at viene de la migración base) y auditoría.
DROP TRIGGER IF EXISTS form_templates_set_updated_at ON public.form_templates;
CREATE TRIGGER form_templates_set_updated_at BEFORE UPDATE ON public.form_templates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS task_definitions_set_updated_at ON public.task_definitions;
CREATE TRIGGER task_definitions_set_updated_at BEFORE UPDATE ON public.task_definitions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS tasks_set_updated_at ON public.tasks;
CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_form_templates ON public.form_templates;
CREATE TRIGGER audit_form_templates AFTER INSERT OR UPDATE OR DELETE ON public.form_templates
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
DROP TRIGGER IF EXISTS audit_task_definitions ON public.task_definitions;
CREATE TRIGGER audit_task_definitions AFTER INSERT OR UPDATE OR DELETE ON public.task_definitions
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
DROP TRIGGER IF EXISTS audit_tasks ON public.tasks;
CREATE TRIGGER audit_tasks AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();
DROP TRIGGER IF EXISTS audit_task_evidence ON public.task_evidence;
CREATE TRIGGER audit_task_evidence AFTER INSERT OR UPDATE OR DELETE ON public.task_evidence
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- Las funciones de trigger y las internas no las necesita ejecutar nadie con sesión.
REVOKE EXECUTE ON FUNCTION public.form_templates_immutable() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.task_definitions_enforce_rules() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tasks_guard_columns() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tasks_enforce_rules() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.task_completion_problems(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.internal_assert_task_refs(uuid, uuid, uuid, uuid, boolean, boolean, boolean)
  FROM PUBLIC, anon, authenticated;

-- ── 9) Permisos de tabla y RLS ─────────────────────────────────────────────────────────────────
REVOKE ALL ON TABLE public.form_templates, public.task_definitions, public.tasks, public.task_evidence
  FROM PUBLIC, anon, authenticated;

-- form_templates: leer y activar/desactivar. Se crean SOLO con create_form_template() (versión atómica).
GRANT SELECT ON public.form_templates TO authenticated;
GRANT UPDATE (active) ON public.form_templates TO authenticated;
-- task_definitions: admin/gestor crean y editan (org_id y created_by salen de los DEFAULT). Sin DELETE: se desactivan.
GRANT SELECT ON public.task_definitions TO authenticated;
GRANT INSERT (area_id, template_id, title, assignee_id, frequency, weekday, day_of_month,
              due_offset_hours, starts_on, ends_on, active),
      UPDATE (area_id, template_id, title, assignee_id, frequency, weekday, day_of_month,
              due_offset_hours, starts_on, ends_on, active)
  ON public.task_definitions TO authenticated;
-- tasks: crear con estas columnas; editar SOLO título, área, asignado y vencimiento. status, answers,
-- started_at, completed_at, etc. NO tienen UPDATE: solo las funciones de tareas los escriben.
GRANT SELECT ON public.tasks TO authenticated;
GRANT INSERT (title, area_id, template_id, assignee_id, due_at) ON public.tasks TO authenticated;
GRANT UPDATE (title, area_id, assignee_id, due_at) ON public.tasks TO authenticated;
-- task_evidence: solo lectura; se registra con register_evidence().
GRANT SELECT ON public.task_evidence TO authenticated;
GRANT ALL ON public.form_templates, public.task_definitions, public.tasks, public.task_evidence TO service_role;
-- TRUNCATE no dispara triggers de fila (no deja rastro en la auditoría) y las tablas de negocio no tienen
-- política que lo acote: se quita a service_role (conserva SELECT, INSERT, UPDATE y DELETE). El propietario
-- (postgres) conserva TRUNCATE. Ver «service_role» en DECISIONES y la migración 3 (copia externa pendiente).
REVOKE TRUNCATE ON TABLE public.form_templates, public.task_definitions, public.tasks, public.task_evidence
  FROM service_role;

ALTER TABLE public.form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_evidence ENABLE ROW LEVEL SECURITY;

-- form_templates
DROP POLICY IF EXISTS "form_templates_select_manager" ON public.form_templates;
CREATE POLICY "form_templates_select_manager" ON public.form_templates
  FOR SELECT TO authenticated
  USING (org_id = (SELECT public.auth_org()) AND (SELECT public.is_manager()));

-- El técnico lee solo las plantillas de las tareas que tiene asignadas (la RLS de tasks ya lo restringe).
DROP POLICY IF EXISTS "form_templates_select_assignee" ON public.form_templates;
CREATE POLICY "form_templates_select_assignee" ON public.form_templates
  FOR SELECT TO authenticated
  USING (
    org_id = (SELECT public.auth_org())
    AND (SELECT public.auth_role()) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.template_id = form_templates.id AND t.assignee_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "form_templates_update_manager" ON public.form_templates;
CREATE POLICY "form_templates_update_manager" ON public.form_templates
  FOR UPDATE TO authenticated
  USING (org_id = (SELECT public.auth_org()) AND (SELECT public.is_manager()))
  WITH CHECK (org_id = (SELECT public.auth_org()) AND (SELECT public.is_manager()));

-- task_definitions: solo admin/gestor.
DROP POLICY IF EXISTS "task_definitions_select_manager" ON public.task_definitions;
CREATE POLICY "task_definitions_select_manager" ON public.task_definitions
  FOR SELECT TO authenticated
  USING (org_id = (SELECT public.auth_org()) AND (SELECT public.is_manager()));

DROP POLICY IF EXISTS "task_definitions_insert_manager" ON public.task_definitions;
CREATE POLICY "task_definitions_insert_manager" ON public.task_definitions
  FOR INSERT TO authenticated
  WITH CHECK (org_id = (SELECT public.auth_org()) AND (SELECT public.is_manager()));

DROP POLICY IF EXISTS "task_definitions_update_manager" ON public.task_definitions;
CREATE POLICY "task_definitions_update_manager" ON public.task_definitions
  FOR UPDATE TO authenticated
  USING (org_id = (SELECT public.auth_org()) AND (SELECT public.is_manager()))
  WITH CHECK (org_id = (SELECT public.auth_org()) AND (SELECT public.is_manager()));

-- tasks: admin/gestor ven todas las de su organización; el técnico, solo las asignadas a él.
DROP POLICY IF EXISTS "tasks_select_manager" ON public.tasks;
CREATE POLICY "tasks_select_manager" ON public.tasks
  FOR SELECT TO authenticated
  USING (org_id = (SELECT public.auth_org()) AND (SELECT public.is_manager()));

DROP POLICY IF EXISTS "tasks_select_assignee" ON public.tasks;
CREATE POLICY "tasks_select_assignee" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    org_id = (SELECT public.auth_org())
    AND (SELECT public.auth_role()) IS NOT NULL
    AND assignee_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "tasks_insert_manager" ON public.tasks;
CREATE POLICY "tasks_insert_manager" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (org_id = (SELECT public.auth_org()) AND (SELECT public.is_manager()));

-- Solo admin/gestor, y solo mientras la tarea siga abierta. El técnico no tiene política de UPDATE.
DROP POLICY IF EXISTS "tasks_update_manager_open" ON public.tasks;
CREATE POLICY "tasks_update_manager_open" ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    org_id = (SELECT public.auth_org()) AND (SELECT public.is_manager())
    AND status IN ('pendiente', 'en_progreso')
  )
  WITH CHECK (
    org_id = (SELECT public.auth_org()) AND (SELECT public.is_manager())
    AND status IN ('pendiente', 'en_progreso')
  );

-- task_evidence: visible si puedes ver la tarea. Sin políticas de INSERT/UPDATE/DELETE: nadie escribe por la API.
DROP POLICY IF EXISTS "task_evidence_select_manager" ON public.task_evidence;
CREATE POLICY "task_evidence_select_manager" ON public.task_evidence
  FOR SELECT TO authenticated
  USING (org_id = (SELECT public.auth_org()) AND (SELECT public.is_manager()));

DROP POLICY IF EXISTS "task_evidence_select_assignee" ON public.task_evidence;
CREATE POLICY "task_evidence_select_assignee" ON public.task_evidence
  FOR SELECT TO authenticated
  USING (
    org_id = (SELECT public.auth_org())
    AND (SELECT public.auth_role()) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_evidence.task_id AND t.assignee_id = (SELECT auth.uid())
    )
  );

-- ── 10) Funciones de la interfaz (SECURITY DEFINER; cada una valida a quien llama DENTRO) ───────

-- create_form_template: publica una versión nueva de una plantilla, todo o nada.
CREATE OR REPLACE FUNCTION public.create_form_template(p_name text, p_schema jsonb)
RETURNS public.form_templates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := public.auth_org();
  v_name text := btrim(COALESCE(p_name, ''));
  v_next integer;
  v_row public.form_templates;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_manager() THEN
    RAISE EXCEPTION 'Solo administradores y gestores pueden crear plantillas.' USING ERRCODE = '42501';
  END IF;
  IF v_name = '' OR length(v_name) > 200 THEN
    RAISE EXCEPTION 'El nombre de la plantilla es obligatorio (máximo 200 caracteres).';
  END IF;
  IF NOT public.form_schema_is_valid(p_schema) THEN
    RAISE EXCEPTION 'La estructura de la plantilla no es válida: debe indicar requires_photo (verdadero o falso) y una lista de pasos con llave única y etiqueta.';
  END IF;

  -- Serializa las publicaciones de la misma plantilla para que dos personas no obtengan el mismo número.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('dentihub.form_templates.' || v_org::text || '.' || lower(v_name), 0));

  SELECT COALESCE(max(version), 0) + 1 INTO v_next
  FROM public.form_templates WHERE org_id = v_org AND lower(name) = lower(v_name);

  INSERT INTO public.form_templates (org_id, name, version, schema, created_by)
  VALUES (v_org, v_name, v_next, p_schema, auth.uid())
  RETURNING * INTO v_row;

  -- Las versiones anteriores dejan de estar disponibles para tareas nuevas...
  UPDATE public.form_templates SET active = false
  WHERE org_id = v_org AND lower(name) = lower(v_name) AND id <> v_row.id AND active;

  -- ...y las tareas recurrentes pasan a la versión vigente. Las tareas ya creadas no se tocan.
  UPDATE public.task_definitions SET template_id = v_row.id
  WHERE org_id = v_org AND template_id IN (
    SELECT id FROM public.form_templates
    WHERE org_id = v_org AND lower(name) = lower(v_name) AND id <> v_row.id
  );

  RETURN v_row;
END;
$$;

-- save_task_progress: guarda respuestas (se MEZCLAN con las existentes: enviar solo lo que cambió) y pasa la
-- tarea de pendiente a en_progreso. Quien llama debe ser el asignado o un admin/gestor de la organización.
CREATE OR REPLACE FUNCTION public.save_task_progress(p_task_id uuid, p_answers jsonb)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid := public.auth_org();
  v_task public.tasks;
  v_schema jsonb;
  v_unknown text;
BEGIN
  IF v_uid IS NULL OR v_org IS NULL OR public.auth_role() IS NULL THEN
    RAISE EXCEPTION 'No tienes acceso a esta operación.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id AND org_id = v_org FOR UPDATE;
  IF NOT FOUND OR NOT (public.is_manager() OR v_task.assignee_id = v_uid) THEN
    RAISE EXCEPTION 'La tarea no existe o no está asignada a ti.' USING ERRCODE = '42501';
  END IF;
  IF v_task.status NOT IN ('pendiente', 'en_progreso') THEN
    RAISE EXCEPTION 'La tarea ya está cerrada (%): no se pueden guardar más respuestas.', v_task.status;
  END IF;

  -- Tope de 32 KB (antes 100 KB; ver «Tope de tasks.answers» en el encabezado), tanto de lo que se envía como del
  -- resultado ya mezclado con lo guardado: el CHECK de la columna daría un error genérico.
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' OR octet_length(p_answers::text) > 32768 THEN
    RAISE EXCEPTION 'Las respuestas deben ser un objeto (paso: valor) de hasta 32 KB.';
  END IF;
  IF octet_length((v_task.answers || p_answers)::text) > 32768 THEN
    RAISE EXCEPTION 'Las respuestas guardadas de la tarea no pueden pasar de 32 KB en total.';
  END IF;

  SELECT schema INTO v_schema FROM public.form_templates WHERE id = v_task.template_id;

  -- Solo llaves que existan en la plantilla de ESTA tarea (su versión anclada).
  SELECT string_agg(k, ', ') INTO v_unknown
  FROM jsonb_object_keys(p_answers) AS k
  WHERE NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_schema -> 'steps') AS s WHERE s ->> 'key' = k
  );
  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'Hay respuestas a pasos que la plantilla no tiene: %.', v_unknown;
  END IF;

  -- Valores simples (texto de hasta 2000 caracteres, número, sí/no o vacío).
  IF EXISTS (
    SELECT 1 FROM jsonb_each(p_answers) AS e
    WHERE jsonb_typeof(e.value) NOT IN ('string', 'number', 'boolean', 'null')
       OR (jsonb_typeof(e.value) = 'string' AND length(e.value #>> '{}') > 2000)
  ) THEN
    RAISE EXCEPTION 'Cada respuesta debe ser un texto (hasta 2000 caracteres), un número o sí/no.';
  END IF;

  UPDATE public.tasks
  SET answers = answers || p_answers,
      status = CASE WHEN status = 'pendiente' THEN 'en_progreso'::public.task_status ELSE status END,
      started_at = COALESCE(started_at, now())
  WHERE id = p_task_id
  RETURNING * INTO v_task;
  RETURN v_task;
END;
$$;

-- complete_task: cierra la tarea SOLO si están respondidos los pasos obligatorios y hay foto cuando la
-- plantilla la exige. Es el camino de la interfaz; el trigger tasks_enforce_rules es la barrera final.
CREATE OR REPLACE FUNCTION public.complete_task(p_task_id uuid)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid := public.auth_org();
  v_task public.tasks;
  v_problems text;
BEGIN
  IF v_uid IS NULL OR v_org IS NULL OR public.auth_role() IS NULL THEN
    RAISE EXCEPTION 'No tienes acceso a esta operación.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id AND org_id = v_org FOR UPDATE;
  IF NOT FOUND OR NOT (public.is_manager() OR v_task.assignee_id = v_uid) THEN
    -- Mismo mensaje para «no existe» y «es de otra persona»: no se revela qué tareas hay.
    RAISE EXCEPTION 'La tarea no existe o no está asignada a ti.' USING ERRCODE = '42501';
  END IF;
  IF v_task.status NOT IN ('pendiente', 'en_progreso') THEN
    RAISE EXCEPTION 'La tarea ya está cerrada (%).', v_task.status;
  END IF;
  IF v_task.assignee_id IS NULL THEN
    RAISE EXCEPTION 'Asigna la tarea a alguien antes de completarla.';
  END IF;

  v_problems := public.task_completion_problems(v_task.template_id, v_task.answers, v_task.id);
  IF v_problems IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede completar la tarea. %', v_problems USING ERRCODE = '23514';
  END IF;

  UPDATE public.tasks
  SET status = 'completada', completed_at = now(), completed_by = v_uid,
      started_at = COALESCE(started_at, now())
  WHERE id = p_task_id
  RETURNING * INTO v_task;
  RETURN v_task;
END;
$$;

-- cancel_task: solo admin/gestor, solo tareas abiertas. No hay «reabrir» en la Etapa 1 (se crea otra).
CREATE OR REPLACE FUNCTION public.cancel_task(p_task_id uuid, p_reason text DEFAULT NULL)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := public.auth_org();
  v_task public.tasks;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL OR NOT public.is_manager() THEN
    RAISE EXCEPTION 'Solo administradores y gestores pueden cancelar tareas.' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NOT NULL AND length(v_reason) > 500 THEN
    RAISE EXCEPTION 'El motivo no puede pasar de 500 caracteres.';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id AND org_id = v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La tarea no existe.' USING ERRCODE = '42501';
  END IF;
  IF v_task.status NOT IN ('pendiente', 'en_progreso') THEN
    RAISE EXCEPTION 'La tarea ya está cerrada (%): no se puede cancelar.', v_task.status;
  END IF;

  UPDATE public.tasks
  SET status = 'cancelada', cancelled_at = now(), cancel_reason = v_reason
  WHERE id = p_task_id
  RETURNING * INTO v_task;
  RETURN v_task;
END;
$$;

-- register_evidence: registra una foto ya subida a Storage. Idempotente por client_uuid.
-- Flujo del teléfono: 1) genera client_uuid y el nombre {org}/{tarea}/{uuid}.ext; 2) sube el archivo
-- (upsert = false); 3) llama a esta función. Si se corta entre 2 y 3, reintentar el paso 3 es seguro.
CREATE OR REPLACE FUNCTION public.register_evidence(p_task_id uuid, p_storage_path text, p_client_uuid uuid)
RETURNS public.task_evidence
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid := public.auth_org();
  v_task public.tasks;
  v_ev public.task_evidence;
  v_count integer;
  v_meta jsonb;
  v_size bigint;
  v_mime text;
  v_etag text;
BEGIN
  IF v_uid IS NULL OR v_org IS NULL OR public.auth_role() IS NULL THEN
    RAISE EXCEPTION 'No tienes acceso a esta operación.' USING ERRCODE = '42501';
  END IF;
  IF p_task_id IS NULL OR p_storage_path IS NULL OR p_client_uuid IS NULL THEN
    RAISE EXCEPTION 'Faltan datos: tarea, ruta del archivo e identificador de subida son obligatorios.';
  END IF;

  -- Bloquea la tarea: serializa con complete_task (no se cierra mientras se registra una foto).
  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id AND org_id = v_org FOR UPDATE;
  IF NOT FOUND OR v_task.assignee_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'La tarea no existe o no está asignada a ti.' USING ERRCODE = '42501';
  END IF;

  -- Idempotencia: el mismo client_uuid, de la misma tarea y la misma persona, devuelve la fila existente
  -- (aunque la tarea ya se haya cerrado entre medio). Si es de otra tarea u otra persona, error genérico.
  SELECT * INTO v_ev FROM public.task_evidence WHERE client_uuid = p_client_uuid;
  IF FOUND THEN
    IF v_ev.task_id = p_task_id AND v_ev.uploaded_by = v_uid THEN
      RETURN v_ev;
    END IF;
    RAISE EXCEPTION 'Ese identificador de subida ya se usó en otra tarea o por otra persona.'
      USING ERRCODE = '23505';
  END IF;

  IF v_task.status NOT IN ('pendiente', 'en_progreso') THEN
    RAISE EXCEPTION 'La tarea ya está cerrada (%): no se puede agregar evidencia.', v_task.status;
  END IF;

  IF public.evidence_path_task_id(p_storage_path) IS DISTINCT FROM p_task_id
     OR public.evidence_path_org_id(p_storage_path) IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'La ruta del archivo debe ser {organización}/{tarea}/{uuid}.jpg (también png, webp, heic o heif, en minúscula).';
  END IF;

  -- La foto tiene que existir de verdad en Storage y parecer una foto. Ver «LA FOTO ES FALSIFICABLE» en el
  -- encabezado: aquí solo se pueden comprobar los metadatos que Storage escribió (tamaño, tipo, eTag); el
  -- contenido real (magic bytes) queda pendiente (Edge Function). ⚠ Los nombres de clave 'size', 'mimetype' y
  -- 'eTag' NO están verificados contra un Storage real. Todo falla CERRADO: si una clave falta, se rechaza.
  SELECT o.metadata INTO v_meta
  FROM storage.objects o
  WHERE o.bucket_id = 'evidence' AND o.name = p_storage_path;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El archivo no existe en el almacenamiento. Súbelo primero y vuelve a registrarlo.';
  END IF;

  -- El cast se hace solo si el texto es un entero corto: un valor raro da «sin tamaño» y no un error de cast.
  v_size := CASE WHEN (v_meta ->> 'size') ~ '^[0-9]{1,15}$' THEN (v_meta ->> 'size')::bigint END;
  IF v_size IS NULL OR v_size < public.evidence_min_bytes() THEN
    RAISE EXCEPTION 'El archivo es demasiado pequeño para ser una foto (mínimo % bytes) o no se pudo leer su tamaño.',
      public.evidence_min_bytes();
  END IF;

  v_mime := lower(btrim(v_meta ->> 'mimetype'));
  IF v_mime IS NULL OR NOT (v_mime = ANY (public.evidence_allowed_mime_types())) THEN
    RAISE EXCEPTION 'El tipo de archivo no está permitido: debe ser una imagen (jpeg, png, webp, heic o heif).';
  END IF;

  -- Misma foto repetida en la MISMA tarea (mismo eTag en otro objeto ya registrado). Sin eTag no se compara.
  -- Se excluye la propia ruta: re-registrar el mismo archivo da el error de «ya registrado» de más abajo.
  v_etag := NULLIF(v_meta ->> 'eTag', '');
  IF v_etag IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.task_evidence e
    JOIN storage.objects o2 ON o2.bucket_id = 'evidence' AND o2.name = e.storage_path
    WHERE e.task_id = p_task_id
      AND e.storage_path <> p_storage_path
      AND o2.metadata ->> 'eTag' = v_etag
  ) THEN
    RAISE EXCEPTION 'Esa misma foto ya está registrada en esta tarea (archivo repetido).'
      USING ERRCODE = '23505';
  END IF;

  SELECT count(*) INTO v_count FROM public.task_evidence WHERE task_id = p_task_id;
  IF v_count >= public.evidence_max_per_task() THEN
    RAISE EXCEPTION 'Una tarea admite hasta % fotos de evidencia.', public.evidence_max_per_task();
  END IF;

  BEGIN
    INSERT INTO public.task_evidence (org_id, task_id, storage_path, client_uuid, uploaded_by)
    VALUES (v_org, p_task_id, p_storage_path, p_client_uuid, v_uid)
    RETURNING * INTO v_ev;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Ese archivo ya está registrado como evidencia.' USING ERRCODE = '23505';
  END;

  IF v_task.status = 'pendiente' THEN
    UPDATE public.tasks SET status = 'en_progreso', started_at = COALESCE(started_at, now())
    WHERE id = p_task_id;
  END IF;
  RETURN v_ev;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_form_template(text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_task_progress(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.complete_task(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_task(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.register_evidence(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_form_template(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_task_progress(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_task(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_task(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_evidence(uuid, text, uuid) TO authenticated;

-- ── 11) Generación de tareas recurrentes ───────────────────────────────────────────────────────
-- Crea las tareas del día para las definiciones activas. Idempotente: el índice único
-- (definition_id, scheduled_for) hace que correrla dos veces el mismo día no duplique nada. Omite (sin fallar)
-- las definiciones cuya plantilla esté inactiva, o cuyo asignado/área ya no sea válido. Una definición SIN
-- asignado genera tareas sin asignar (las ve solo el gestor, que las reparte).
-- La fecha se calcula en hora de Chile (el cron corre en UTC). Todas las comparaciones «del día» (starts_on,
-- ends_on, día de la semana y día del mes) usan esa misma p_date y el mismo default de starts_on en
-- task_definitions, para que «hoy» signifique lo mismo al crear la definición y al generar la tarea.
CREATE OR REPLACE FUNCTION public.generate_recurring_tasks(
  p_date date DEFAULT ((now() AT TIME ZONE 'America/Santiago'))::date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH ins AS (
    INSERT INTO public.tasks
      (org_id, definition_id, area_id, template_id, title, assignee_id, due_at, scheduled_for, created_by)
    SELECT d.org_id, d.id, d.area_id, d.template_id, d.title, d.assignee_id,
           (p_date::timestamp AT TIME ZONE 'America/Santiago') + make_interval(hours => d.due_offset_hours),
           p_date, d.created_by
    FROM public.task_definitions d
    JOIN public.form_templates ft ON ft.id = d.template_id AND ft.active
    WHERE d.active
      AND d.starts_on <= p_date AND (d.ends_on IS NULL OR d.ends_on >= p_date)
      AND (d.frequency = 'diaria'
           OR (d.frequency = 'semanal' AND extract(isodow FROM p_date) = d.weekday)
           OR (d.frequency = 'mensual' AND extract(day FROM p_date) = d.day_of_month))
      AND (d.assignee_id IS NULL OR EXISTS (
            SELECT 1 FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id
            WHERE p.id = d.assignee_id AND p.org_id = d.org_id AND p.active))
      AND (d.area_id IS NULL OR EXISTS (
            SELECT 1 FROM public.areas a WHERE a.id = d.area_id AND a.org_id = d.org_id AND a.active))
    ON CONFLICT (definition_id, scheduled_for) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_recurring_tasks(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_recurring_tasks(date) TO service_role;

-- PROGRAMACIÓN (EJEMPLO COMENTADO; no se activa sola). Requiere habilitar la extensión pg_cron en Supabase
-- (Database → Extensions). pg_cron trabaja en UTC: las 10:00 UTC son las 07:00 en horario de verano de Chile
-- y las 06:00 en invierno; la función calcula la fecha con la hora de Chile, así que da igual a qué hora caiga.
-- Se puede probar a mano antes: SELECT public.generate_recurring_tasks();  (devuelve cuántas tareas creó)
--
-- SELECT cron.schedule('generar-tareas-recurrentes', '0 10 * * *', $$ SELECT public.generate_recurring_tasks(); $$);
-- Para quitarla: SELECT cron.unschedule('generar-tareas-recurrentes');

-- ── 12) Storage: bucket privado `evidence` y sus políticas ─────────────────────────────────────
-- Privado, 10 MB por archivo, solo imágenes. Si ya existía, se re-configura (privado y con estos límites).
-- La lista de tipos sale de evidence_allowed_mime_types(): la misma que exige register_evidence. El tamaño MÍNIMO
-- no se puede imponer aquí (el bucket solo tiene máximo): lo exige register_evidence (evidence_min_bytes()).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidence', 'evidence', false, 10485760,
  public.evidence_allowed_mime_types()
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Leer (y listar): quien puede ver la TAREA de la ruta. La subconsulta a tasks pasa por la RLS de tasks:
-- admin/gestor ven las de su organización; el técnico, solo las asignadas a él. La ruta debe tener exactamente
-- la forma {org_id}/{task_id}/{uuid}.ext y su org_id debe coincidir con el de la tarea.
DROP POLICY IF EXISTS "evidence_select_visible_tasks" ON storage.objects;
CREATE POLICY "evidence_select_visible_tasks" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'evidence'
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = public.evidence_path_task_id(objects.name)
        AND t.org_id = public.evidence_path_org_id(objects.name)
    )
  );

-- Subir: SOLO el asignado, y solo a una tarea abierta (pendiente o en_progreso) de su organización, y solo
-- mientras la tarea tenga menos de evidence_max_per_task() objetos bajo su prefijo {org_id}/{task_id}/ (el mismo
-- valor que usa register_evidence para las fotos registradas).
--   · RECURSIÓN DE RLS (revisado): poner el conteo como subconsulta directa a storage.objects DENTRO de una
--     política de storage.objects hace que Postgres falle con «infinite recursion detected in policy for relation
--     "objects"» (la detección mira la TABLA que se está expandiendo, no el tipo de comando). Por eso el conteo
--     está en evidence_object_count(), una función SECURITY DEFINER que lee storage.objects con los permisos
--     del propietario de la migración y no vuelve a pasar por las políticas.
--     ⚠ SUPUESTO NO VERIFICADO: que ese propietario (rol postgres) se salte la RLS de storage.objects
--     (atributo BYPASSRLS). register_evidence ya depende de lo mismo. Si no fuera así el conteo daría 0 y el tope
--     NO se aplicaría (falla ABIERTO, en silencio): por eso la guía de pruebas incluye la subida número 21 y debe
--     ser rechazada. Verifícalo antes de dar la migración por buena.
--   · Rendimiento: el conteo usa un RANGO por prefijo con COLLATE "C" (no LIKE, que con un patrón variable no usa
--     índice), pensado para el índice (bucket_id, name COLLATE "C") que Supabase Storage trae sobre
--     storage.objects. ⚠ No se verificó su existencia ni que el planificador lo use: la guía de pruebas pide un
--     EXPLAIN. NO se crea aquí un índice sobre storage.objects (la tabla pertenece al servicio de Storage y podría
--     fallar la migración o chocar con sus actualizaciones). Es una consulta por subida, solo del técnico, sobre
--     ≤ 20 objetos por prefijo.
--   · No es exacto bajo concurrencia (dos subidas simultáneas pueden pasar a la vez, y los huérfanos cuentan);
--     el tope duro de fotos registradas está en register_evidence.
CREATE OR REPLACE FUNCTION public.evidence_object_count(_org uuid, _task uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Solo responde para la organización de quien llama (si no, NULL: la política lo trata como «no cumple» y
  -- nadie puede usar la función para contar objetos de otras organizaciones).
  SELECT CASE
    WHEN _org IS NOT NULL AND _task IS NOT NULL AND _org = public.auth_org() THEN (
      SELECT count(*)::integer
      FROM storage.objects o
      WHERE o.bucket_id = 'evidence'
        -- «{org}/{task}/» <= nombre < «{org}/{task}0» (el carácter «0» sigue a «/» en el orden de bytes de COLLATE "C").
        AND o.name COLLATE "C" >= (_org::text || '/' || _task::text || '/')
        AND o.name COLLATE "C" <  (_org::text || '/' || _task::text || '0')
    )
  END;
$$;
REVOKE EXECUTE ON FUNCTION public.evidence_object_count(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evidence_object_count(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "evidence_insert_assigned_open_tasks" ON storage.objects;
CREATE POLICY "evidence_insert_assigned_open_tasks" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'evidence'
    AND (SELECT public.auth_role()) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = public.evidence_path_task_id(objects.name)
        AND t.org_id = public.evidence_path_org_id(objects.name)
        AND t.org_id = (SELECT public.auth_org())
        AND t.assignee_id = (SELECT auth.uid())
        AND t.status IN ('pendiente', 'en_progreso')
    )
    -- NULL (ruta mal formada u otra organización) = no cumple: fail-closed.
    AND public.evidence_object_count(
          public.evidence_path_org_id(objects.name), public.evidence_path_task_id(objects.name)
        ) < public.evidence_max_per_task()
  );

-- A propósito NO hay políticas de UPDATE ni de DELETE sobre `evidence`: la evidencia no se reemplaza ni se borra
-- desde la API (ver «STORAGE» en el encabezado para la limpieza administrativa).

-- ── REVERSA MANUAL (Supabase no revierte migraciones; esto se ejecutaría como migración nueva) ──
-- ⚠ Borra datos de tareas y evidencia: antes, exporta lo que haga falta. Los archivos del bucket se vacían por
--   la API de Storage (no con DELETE en SQL). Orden: primero la migración 3 si usa estas tablas.
-- -- Si estaba programada: SELECT cron.unschedule('generar-tareas-recurrentes');
-- DROP POLICY IF EXISTS "evidence_select_visible_tasks" ON storage.objects;
-- DROP POLICY IF EXISTS "evidence_insert_assigned_open_tasks" ON storage.objects;
-- DROP FUNCTION IF EXISTS public.evidence_object_count(uuid, uuid);
-- -- Vaciar el bucket por la API y luego:  DELETE FROM storage.buckets WHERE id = 'evidence';
-- DROP FUNCTION IF EXISTS public.generate_recurring_tasks(date);
-- DROP FUNCTION IF EXISTS public.register_evidence(uuid, text, uuid);
-- DROP FUNCTION IF EXISTS public.cancel_task(uuid, text);
-- DROP FUNCTION IF EXISTS public.complete_task(uuid);
-- DROP FUNCTION IF EXISTS public.save_task_progress(uuid, jsonb);
-- DROP FUNCTION IF EXISTS public.create_form_template(text, jsonb);
-- DROP TABLE IF EXISTS public.task_evidence, public.tasks, public.task_definitions, public.form_templates;
-- DROP FUNCTION IF EXISTS public.tasks_enforce_rules();
-- DROP FUNCTION IF EXISTS public.tasks_guard_columns();
-- DROP FUNCTION IF EXISTS public.task_definitions_enforce_rules();
-- DROP FUNCTION IF EXISTS public.form_templates_immutable();
-- DROP FUNCTION IF EXISTS public.internal_assert_task_refs(uuid, uuid, uuid, uuid, boolean, boolean, boolean);
-- DROP FUNCTION IF EXISTS public.task_completion_problems(uuid, jsonb, uuid);
-- DROP FUNCTION IF EXISTS public.evidence_path_task_id(text);
-- DROP FUNCTION IF EXISTS public.evidence_path_org_id(text);
-- DROP FUNCTION IF EXISTS public.evidence_allowed_mime_types();
-- DROP FUNCTION IF EXISTS public.evidence_max_per_task();
-- DROP FUNCTION IF EXISTS public.evidence_min_bytes();
-- DROP FUNCTION IF EXISTS public.step_is_answered(jsonb, jsonb);
-- DROP FUNCTION IF EXISTS public.form_schema_is_valid(jsonb);
-- DROP TYPE IF EXISTS public.task_status;
