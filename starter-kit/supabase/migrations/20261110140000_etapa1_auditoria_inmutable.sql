-- ════════════════════════════════════════════════════════════════════════════
-- DentiHub · Etapa 1 (3 de 3) · auditoría por organización y realmente de solo inserción.
--
-- AVISO: NO EJECUTADA. Se preparó solo como archivo; la aplica Bernardo (o el agente principal con su
--   confirmación). Pruébala primero en un proyecto de DESARROLLO.
-- GUÍA DE PRUEBAS (RLS, permisos y auditoría, con resultados esperados):
--   starter-kit/supabase/pruebas/etapa1-pruebas-rls.md
-- DEPENDE DE: 20261105130000 (endurecimiento), 20261110120000 (organización y áreas) y 20261110130000
--   (tareas y evidencia), en ese orden. Esta migración lo comprueba y se detiene si falta algo.
--
-- QUÉ HACE Y POR QUÉ
--
--   1) audit_log con organización. La base real tiene: id, table_name, record_id uuid, action, old_data,
--      new_data, actor_id, created_at (sin org_id). Se agrega org_id (la columna ya la creó la migración 1;
--      aquí se repite con IF NOT EXISTS) más un índice (org_id, created_at DESC). SIN clave foránea, a
--      propósito: la auditoría nunca debe fallar ni bloquear un borrado (si org_id apuntara a organizations, el
--      registro de DELETE de una organización fallaría porque la fila ya no existe).
--      Backfill de las filas anteriores: se deduce la organización de los datos de la propia fila; lo que no se
--      pueda deducir se asigna a la organización única, solo si hay UNA sola (criterio del supuesto
--      «una organización por ahora»). Es lo único que esta migración modifica de las filas antiguas, ocurre
--      ANTES de activar la inmutabilidad y solo agrega org_id (no quita ni cambia datos).
--      Quedan sin organización (solo las ve service_role) las filas que no se puedan deducir cuando haya más de
--      una organización, y el borrado en cascada de una cuenta cuando su perfil ya no existe al auditar roles.
--
--   2) audit_trigger() ahora guarda org_id (para organizations es su propio id; para user_roles se toma del
--      perfil; para el resto, la columna org_id de la fila) y NO guarda email ni full_name de profiles
--      (ver «DATOS PERSONALES»). Misma firma y mismas columnas que antes; CREATE OR REPLACE.
--      NO INFLAR EL REGISTRO: como el registro no se puede podar, un UPDATE en que la fila solo cambió
--      `updated_at` (por ejemplo, guardar dos veces las mismas respuestas de una tarea) ya NO deja fila de
--      auditoría. Se compara to_jsonb(OLD) - 'updated_at' contra to_jsonb(NEW) - 'updated_at' ANTES de quitar
--      email y full_name, así que un cambio solo de nombre sí queda registrado. En tablas sin updated_at
--      (user_roles, user_areas) un UPDATE que no cambia ningún valor tampoco se registra.
--      Complemento en la migración 2: el tope de tamaño de tasks.answers baja de 100 KB a 32 KB, porque cada
--      guardado de avance con cambios copia la fila completa (old_data y new_data) en un registro inmutable.
--      PENDIENTE (fuera de SQL): limitar la frecuencia de guardados por cuenta (rate limiting en la interfaz,
--      en una Edge Function o en el borde de red). Hoy una cuenta legítima con mala intención todavía puede
--      generar muchas filas de auditoría de hasta 64 KB (old + new) cambiando una respuesta cada vez.
--
--   3) Triggers de auditoría en TODAS las tablas de negocio: organizations, areas, user_areas, form_templates,
--      task_definitions, tasks, task_evidence (cada migración ya creó el suyo; aquí se verifica y se crea el que
--      falte) y se comprueba que profiles y user_roles ya lo tienen.
--
--   4) Solo inserción DE VERDAD:
--        · Trigger BEFORE UPDATE OR DELETE (por fila) que lanza un error en español.
--        · Trigger BEFORE TRUNCATE (por sentencia), porque los triggers de fila NO se disparan con TRUNCATE.
--        · Permisos: authenticated y anon no tienen ningún privilegio de escritura (se revoca y se COMPRUEBA con
--          has_table_privilege; si no se cumple, la migración se detiene). A service_role se le quitan UPDATE,
--          DELETE y TRUNCATE (conserva SELECT e INSERT).
--        · QUÉ ERROR VE CADA ROL (corrección de un comentario inexacto): como anon, authenticated y service_role
--          ya NO tienen el privilegio, Postgres los rechaza ANTES de llegar a los triggers, con el error genérico
--          «permission denied for table audit_log». El mensaje en español de los triggers solo lo ve el
--          PROPIETARIO (rol postgres, por ejemplo en el SQL Editor), que sí conserva los privilegios. Los
--          triggers son la segunda barrera: protegen al propietario de errores, no a la API.
--      BORRADO EN CASCADA: no se rompe. audit_log no tiene ninguna clave foránea (record_id, actor_id y org_id son
--      uuid sueltos), así que borrar una cuenta, una organización o una tarea nunca intenta borrar o poner en
--      NULL filas de audit_log. Por eso mismo no se le agregan claves foráneas nunca: obligarían a elegir entre
--      bloquear el borrado y actualizar el registro (que el trigger prohíbe).
--      LÍMITE HONESTO: el propietario del proyecto (rol postgres) puede desactivar el trigger, hacer DROP o
--      volver a conceder permisos. La inmutabilidad protege contra la API, service_role, errores y código
--      defectuoso; contra el propietario solo sirve enviar copia del registro fuera de la base (pendiente).
--      TRUNCATE de las tablas de negocio: a service_role se le quitó TRUNCATE en las migraciones 1 y 2 (organizations,
--      areas, user_areas, form_templates, task_definitions, tasks, task_evidence). El propietario sigue pudiendo
--      vaciarlas y TRUNCATE no deja rastro en la auditoría (los triggers de fila no se disparan). profiles y
--      user_roles no se tocaron en esta etapa y service_role aún conserva TRUNCATE en ellas (decisión pendiente).
--      PENDIENTE: copia de la auditoría fuera de la base (exportación periódica o replicación a otro almacén).
--
--   5) Lectura: solo administradores de la MISMA organización (activos y con organización).
--
-- DATOS PERSONALES en old_data / new_data (decisión tomada y decisión abierta)
--   · Decidido aquí (minimización, decisión de Bernardo; no cambiarla sin consultarlo): los registros de profiles
--     NO guardan email ni full_name (se identifica a la persona por record_id/actor_id, que se resuelven contra
--     profiles mientras exista). Así el registro, que no se puede corregir ni borrar, no acumula nombres ni
--     correos. CONSECUENCIA: un cambio de nombre queda registrado (quién, cuándo) pero SIN valor anterior ni
--     nuevo, porque old_data y new_data de esa fila quedan idénticos salvo updated_at.
--   · Consecuencia con la eliminación de datos personales (decisión pendiente, no se cambia aquí): las claves
--     foráneas ON DELETE RESTRICT (tareas, evidencia, plantillas, definiciones: created_by, completed_by,
--     uploaded_by, assignee_id) más la auditoría inmutable impiden borrar a una persona que tenga historial. Choca
--     con una eventual solicitud de eliminación de datos personales: hoy la salida es desactivar la cuenta
--     (admin_set_active) y, si hay que anonimizar, un procedimiento excepcional y documentado del propietario.
--   · Sigue habiendo posibles datos personales en: tasks.answers (texto libre de los técnicos), títulos de
--     tareas/plantillas y rutas de fotos. Las FOTOS en sí no están en la auditoría, pero sí en Storage: conviene
--     indicar al equipo que no fotografíen personas.
--   · DECISIÓN PENDIENTE DE BERNARDO (no inventada aquí): plazo de retención del registro y qué hacer ante una
--     solicitud de eliminación de datos personales. Con la inmutabilidad, purgar filas exigirá un procedimiento
--     excepcional y documentado (nueva migración o partición por mes que se elimina completa). Conviene
--     revisarlo con asesoría legal antes de operar con datos reales (la ley chilena de datos personales cambia
--     con la Ley 21.719; confirmar fechas y alcance).
--   · Las filas de profiles que ya existen en audit_log pueden contener email/full_name. Limpiarlas modifica el
--     historial; por eso queda como sentencia COMENTADA más abajo, para que Bernardo decida.
--
-- Idempotente: sí. Los DROP son DROP POLICY/TRIGGER IF EXISTS de objetos de esta misma migración o de la
--   política de lectura de audit_log que se reemplaza; ninguno borra datos. El backfill se omite solo si la
--   inmutabilidad ya está activa (volver a correr el archivo no falla).
-- Se ejecuta en una sola transacción.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0) Comprobaciones previas ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.organizations') IS NULL OR to_regclass('public.areas') IS NULL
     OR to_regclass('public.user_areas') IS NULL OR to_regclass('public.tasks') IS NULL
     OR to_regclass('public.task_evidence') IS NULL OR to_regclass('public.form_templates') IS NULL
     OR to_regclass('public.task_definitions') IS NULL OR to_regprocedure('public.auth_org()') IS NULL THEN
    RAISE EXCEPTION
      'Migración detenida: faltan las migraciones 20261110120000 y/o 20261110130000 de la Etapa 1 (tablas o funciones inexistentes).';
  END IF;
END
$$;

-- ── 1) org_id en audit_log + índice ────────────────────────────────────────────────────────────
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS org_id uuid;
CREATE INDEX IF NOT EXISTS audit_log_org_created_idx ON public.audit_log (org_id, created_at DESC);

-- ── 2) audit_trigger() con organización y sin datos personales de profiles ─────────────────────
-- Lee la fila como jsonb (no con OLD.id / NEW.id): sirve para toda tabla con columna `id` uuid y evita leer
-- OLD en un INSERT. Para quien no tenga sesión (service_role, cron, SQL Editor) actor_id queda NULL.
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_id uuid;
  v_org uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;

  -- No inflar un registro que no se puede podar: si la fila solo cambió updated_at (o no cambió nada), no hay
  -- nada que auditar. Se compara ANTES de quitar email/full_name, para que un cambio de nombre sí se registre.
  -- (En una AFTER trigger el valor de retorno se ignora; se devuelve NEW por claridad.)
  IF TG_OP = 'UPDATE' AND (v_old - 'updated_at') = (v_new - 'updated_at') THEN
    RETURN NEW;
  END IF;

  v_row := COALESCE(v_new, v_old);
  v_id := (v_row ->> 'id')::uuid;

  IF TG_TABLE_NAME = 'organizations' THEN
    v_org := v_id;
  ELSIF TG_TABLE_NAME = 'user_roles' THEN
    SELECT p.org_id INTO v_org FROM public.profiles p WHERE p.id = (v_row ->> 'user_id')::uuid;
  ELSE
    v_org := NULLIF(v_row ->> 'org_id', '')::uuid;
  END IF;

  -- Minimización de datos personales: el perfil se identifica por su id, no por nombre ni correo.
  IF TG_TABLE_NAME = 'profiles' THEN
    v_old := v_old - 'email' - 'full_name';
    v_new := v_new - 'email' - 'full_name';
  END IF;

  INSERT INTO public.audit_log (org_id, table_name, record_id, action, old_data, new_data, actor_id)
  VALUES (v_org, TG_TABLE_NAME, v_id, TG_OP, v_old, v_new, auth.uid());

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.audit_trigger() FROM PUBLIC, anon, authenticated;

-- ── 3) Backfill de org_id en filas anteriores (ANTES de activar la inmutabilidad) ──────────────
DO $$
DECLARE
  v_only_org uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.audit_log'::regclass
      AND tgname = 'audit_log_block_update_delete' AND NOT tgisinternal
  ) THEN
    RAISE NOTICE 'audit_log ya es de solo inserción: se omite el backfill de org_id.';
    RETURN;
  END IF;

  -- a) Tablas con columna org_id: se toma de los datos de la propia fila.
  UPDATE public.audit_log
  SET org_id = NULLIF(COALESCE(new_data ->> 'org_id', old_data ->> 'org_id'), '')::uuid
  WHERE org_id IS NULL
    AND table_name IN ('profiles', 'areas', 'user_areas', 'form_templates',
                       'task_definitions', 'tasks', 'task_evidence')
    AND COALESCE(new_data ->> 'org_id', old_data ->> 'org_id') IS NOT NULL;

  -- b) La propia organización.
  UPDATE public.audit_log SET org_id = record_id
  WHERE org_id IS NULL AND table_name = 'organizations';

  -- c) El resto (user_roles y filas antiguas sin dato): si hay UNA sola organización, es esa.
  IF (SELECT count(*) FROM public.organizations) = 1 THEN
    SELECT id INTO v_only_org FROM public.organizations;
    UPDATE public.audit_log SET org_id = v_only_org WHERE org_id IS NULL;
  END IF;
END
$$;

-- OPCIONAL, SOLO CON LA CONFIRMACIÓN DE BERNARDO (modifica el historial: quita nombre y correo de las filas
-- antiguas de profiles). Una vez activa la inmutabilidad ya no se puede hacer sin desactivar el trigger a
-- propósito, así que, si se quiere, se corre ANTES de aplicar esta migración (o se deja como está):
-- UPDATE public.audit_log
--    SET old_data = old_data - 'email' - 'full_name',
--        new_data = new_data - 'email' - 'full_name'
--  WHERE table_name = 'profiles';

-- ── 4) Triggers de auditoría en todas las tablas de negocio ────────────────────────────────────
-- Crea el que falte (no toca los que ya existen). profiles y user_roles vienen de la migración base.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles', 'user_roles', 'organizations', 'areas', 'user_areas',
    'form_templates', 'task_definitions', 'tasks', 'task_evidence'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = to_regclass('public.' || t)
        AND tgname = 'audit_' || t
        AND tgfoid = 'public.audit_trigger()'::regprocedure
        AND NOT tgisinternal
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_trigger()',
        'audit_' || t, t);
      RAISE NOTICE 'Se creó el trigger de auditoría que faltaba en %.', t;
    END IF;
  END LOOP;
END
$$;

-- ── 5) Lectura: solo administradores de la misma organización ──────────────────────────────────
-- Las filas con org_id NULL no las ve nadie por la API (solo service_role): fail-closed.
DROP POLICY IF EXISTS "audit_log_admin_select" ON public.audit_log;
DROP POLICY IF EXISTS "audit_log_select_org_admin" ON public.audit_log;
CREATE POLICY "audit_log_select_org_admin" ON public.audit_log
  FOR SELECT TO authenticated
  USING (org_id = (SELECT public.auth_org()) AND (SELECT public.is_admin()));
-- No hay políticas de INSERT, UPDATE ni DELETE: la API no escribe. Solo escribe audit_trigger() y las funciones
-- admin_* (SECURITY DEFINER, con la RLS del propietario).

-- ── 6) Inmutabilidad: error en español en UPDATE, DELETE y TRUNCATE ────────────────────────────
-- OJO sobre quién ve este mensaje: solo el PROPIETARIO (rol postgres; SQL Editor), que conserva los privilegios
-- de escritura sobre la tabla. anon, authenticated y service_role no tienen UPDATE, DELETE ni TRUNCATE (sección 7)
-- y Postgres los rechaza antes de ejecutar estos triggers con el error genérico «permission denied for table
-- audit_log». Estos triggers son una segunda barrera (errores del propietario, código defectuoso), no la primera.
CREATE OR REPLACE FUNCTION public.audit_log_block_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'El registro de auditoría es de solo inserción: no se puede vaciar.'
      USING ERRCODE = '42501';
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'El registro de auditoría es de solo inserción: no se pueden borrar sus filas.'
      USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION 'El registro de auditoría es de solo inserción: no se pueden modificar sus filas.'
    USING ERRCODE = '42501';
  RETURN NULL; -- no se alcanza
END;
$$;
REVOKE EXECUTE ON FUNCTION public.audit_log_block_changes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS audit_log_block_update_delete ON public.audit_log;
CREATE TRIGGER audit_log_block_update_delete
BEFORE UPDATE OR DELETE ON public.audit_log
FOR EACH ROW EXECUTE FUNCTION public.audit_log_block_changes();

-- Los triggers de fila no se disparan con TRUNCATE: hace falta uno de sentencia.
DROP TRIGGER IF EXISTS audit_log_block_truncate ON public.audit_log;
CREATE TRIGGER audit_log_block_truncate
BEFORE TRUNCATE ON public.audit_log
FOR EACH STATEMENT EXECUTE FUNCTION public.audit_log_block_changes();

-- ── 7) Permisos: ninguna escritura para la API ─────────────────────────────────────────────────
REVOKE ALL ON TABLE public.audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.audit_log TO authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.audit_log FROM service_role;

-- Comprobación: si alguien tiene escritura, la migración se detiene (y se deshace todo).
DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.audit_log', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_table_privilege('anon', 'public.audit_log', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
     OR has_any_column_privilege('authenticated', 'public.audit_log', 'INSERT,UPDATE,REFERENCES')
     OR has_any_column_privilege('anon', 'public.audit_log', 'SELECT,INSERT,UPDATE,REFERENCES') THEN
    RAISE EXCEPTION 'Migración detenida: anon o authenticated conservan privilegios de escritura sobre audit_log.';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.audit_log'::regclass) THEN
    RAISE EXCEPTION 'Migración detenida: audit_log no tiene RLS activada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.audit_log'::regclass
                 AND tgname = 'audit_log_block_update_delete' AND NOT tgisinternal)
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.audit_log'::regclass
                    AND tgname = 'audit_log_block_truncate' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Migración detenida: faltan los triggers de inmutabilidad de audit_log.';
  END IF;
END
$$;

-- ── REVERSA MANUAL (Supabase no revierte migraciones; esto se ejecutaría como migración nueva) ──
-- ⚠ Reabre la posibilidad de modificar la auditoría: solo para diagnosticar y con la confirmación de Bernardo.
-- DROP TRIGGER IF EXISTS audit_log_block_truncate ON public.audit_log;
-- DROP TRIGGER IF EXISTS audit_log_block_update_delete ON public.audit_log;
-- DROP FUNCTION IF EXISTS public.audit_log_block_changes();
-- GRANT UPDATE, DELETE, TRUNCATE ON TABLE public.audit_log TO service_role;
-- DROP POLICY IF EXISTS "audit_log_select_org_admin" ON public.audit_log;
-- CREATE POLICY "audit_log_admin_select" ON public.audit_log FOR SELECT TO authenticated
--   USING (public.is_admin());
-- DROP INDEX IF EXISTS public.audit_log_org_created_idx;
-- -- audit_trigger() a la versión de la migración base (sin org_id y guardando la fila completa):
-- CREATE OR REPLACE FUNCTION public.audit_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
--   SET search_path = public AS $f$
-- DECLARE rec_id uuid;
-- BEGIN
--   IF TG_OP = 'DELETE' THEN rec_id := OLD.id; ELSE rec_id := NEW.id; END IF;
--   INSERT INTO public.audit_log (table_name, record_id, action, old_data, new_data, actor_id)
--   VALUES (TG_TABLE_NAME, rec_id, TG_OP,
--           CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
--           CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END, auth.uid());
--   IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
--   RETURN NEW;
-- END; $f$;
-- -- La columna org_id de audit_log NO se borra (la usan las funciones admin_* de la migración 1); para
-- -- quitarla hay que revertir antes esas funciones: ALTER TABLE public.audit_log DROP COLUMN org_id;
-- -- Triggers de auditoría de las tablas nuevas: los quita la reversa de las migraciones 1 y 2 al borrar las tablas.
