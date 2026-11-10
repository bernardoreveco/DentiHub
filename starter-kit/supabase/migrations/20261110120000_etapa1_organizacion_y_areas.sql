-- ════════════════════════════════════════════════════════════════════════════
-- DentiHub · Etapa 1 (1 de 3) · organización, áreas y miembros con rol.
--
-- AVISO: NO EJECUTADA. Se preparó solo como archivo; la aplica Bernardo (o el agente principal con su
--   confirmación). Pruébala primero en un proyecto de DESARROLLO.
-- GUÍA DE PRUEBAS (RLS y permisos, con datos de prueba y resultados esperados):
--   starter-kit/supabase/pruebas/etapa1-pruebas-rls.md
-- ORDEN DE APLICACIÓN (las tres de la Etapa 1 van juntas y en este orden):
--   20261105130000_endurecer_permisos_y_roles.sql   (debe estar aplicada ANTES: esta migración lo comprueba)
--   20261110120000_etapa1_organizacion_y_areas.sql  (este archivo)
--   20261110130000_etapa1_tareas_evidencia_storage.sql
--   20261110140000_etapa1_auditoria_inmutable.sql
--
-- QUÉ HACE Y POR QUÉ (decisión de alcance de la Etapa 1, aprobada por Bernardo: solo la app de terreno):
--
--   1) Multi-tenant desde el primer día: tabla organizations y profiles.org_id. Hoy habrá UNA sola
--      organización (supuesto razonable), pero todas las políticas ya filtran por organización, para no
--      tener que reescribirlas cuando haya una segunda.
--   2) profiles.active: una cuenta desactivada no tiene acceso a nada (fail-closed).
--   3) Funciones auxiliares auth_org(), auth_role(), is_manager(): devuelven null/false si la cuenta está
--      desactivada, no tiene organización o no tiene rol. has_role() se ajusta para que respete lo mismo.
--   4) Áreas (areas) y pertenencia de personas a áreas (user_areas).
--   5) Políticas de profiles y user_roles acotadas por organización.
--   6) Altas y cambios de miembros SOLO por funciones transaccionales SECURITY DEFINER:
--        admin_assign_member(persona, rol, organización, áreas)  y  admin_set_active(persona, activo).
--      Por la API ya no se puede escribir en user_roles ni cambiar org_id / active de un perfil.
--   7) admin_list_unassigned_accounts(): lista las cuentas recién creadas (sin organización) para que un
--      administrador pueda encontrarlas y asignarlas (ver «CUENTAS NUEVAS» más abajo).
--
-- PRINCIPIOS QUE SE MANTIENEN
--   · Los roles viven en user_roles (UNA fila por persona), nunca en profiles.
--   · El rol y la organización NUNCA salen de datos que controla quien se registra (raw_user_meta_data).
--     handle_new_user() NO se toca: sigue creando solo el perfil, sin rol ni organización. Una persona
--     recién registrada queda sin organización y sin rol = «sin acceso» hasta que un administrador la asigne.
--   · El primer administrador se asigna a mano (ver bloque «PRIMER ADMINISTRADOR / ORGANIZACIÓN NUEVA»).
--
-- DATOS EXISTENTES (backfill): si no existe ninguna organización, se crea UNA con el nombre genérico
--   «Organización principal» y se asignan a ella los perfiles que hoy no tienen organización (hoy hay 1
--   perfil, 1 administrador y 1 fila en user_roles). Criterio: con una sola organización, todas las personas
--   que ya existen pertenecen a ella; el nombre se puede cambiar después (UPDATE public.organizations SET
--   name = '…' o, con sesión de administrador, desde la interfaz). Solo se hace cuando NO hay ninguna
--   organización, así que volver a correr el archivo NO le asigna organización a quien se registre después.
--
-- DECISIONES QUE CONVIENE CONOCER
--   · Visibilidad: una persona ve su propio perfil siempre (así la interfaz puede explicar «cuenta
--     desactivada» o «sin organización»); admin y gestor ven los perfiles y roles de su organización
--     (el gestor necesita elegir a quién asignar tareas); el técnico ve solo el suyo.
--   · user_roles queda SIN INSERT/UPDATE/DELETE para authenticated (se revoca lo que había concedido la
--     migración de endurecimiento): el cambio de rol y de organización es una operación de varios pasos y va
--     solo por admin_assign_member(). Con el GRANT por columnas anterior un administrador podía crear un rol a
--     una persona de otra organización o dejarla con rol y sin organización.
--   · «Última persona administradora»: el trigger protect_last_admin (migración de endurecimiento) cuenta
--     administradores de TODA la base, activos o no. Las dos funciones de este archivo aplican además la
--     regla estricta POR ORGANIZACIÓN y contando solo cuentas ACTIVAS (si no, desactivar al otro administrador
--     dejaría a la organización sin nadie que la gestione). El trigger queda como segunda barrera.
--   · profiles_guard_columns (trigger): defensa en profundidad. Aunque algún día se concediera un GRANT
--     demasiado amplio, quien llega por la API (rol anon/authenticated) no puede cambiar org_id, active, id,
--     email ni created_at. Distingue «llega por la API» con current_user: dentro de una función SECURITY
--     DEFINER current_user es el propietario, así que las funciones de este archivo sí pasan.
--   · Las áreas no se borran en la práctica: se desactivan (active = false). DELETE está concedido, pero la
--     clave foránea desde tasks (migración 2) lo impide si hay tareas.
--   · Nueva columna audit_log.org_id: se agrega AQUÍ (nullable, sin clave foránea a propósito: la auditoría
--     nunca debe fallar ni bloquear un borrado) porque admin_assign_member/admin_set_active escriben en la
--     auditoría con organización. La migración 3 la repite con IF NOT EXISTS, hace el backfill y la política.
--   · CUENTAS NUEVAS (hallazgo de revisión): una cuenta recién creada tiene org_id NULL, y la política
--     profiles_select_manager_org exige org_id = auth_org(), así que ningún administrador la veía y no podía
--     asignarla. Se resuelve con admin_list_unassigned_accounts() (SECURITY DEFINER, valida administrador
--     ACTIVO dentro, devuelve solo id, email y created_at de las cuentas activas sin organización). Se prefirió
--     una función a una política de SELECT porque así no se abre la lectura de la tabla y se limita a tres columnas.
--     MEJORA FUTURA (no se hace aquí): una tabla `invitations` con organización, rol y áreas previstos por
--     adelantado, de modo que la persona entre ya asignada. MIENTRAS TANTO, con MÁS de una organización, un
--     administrador de la organización X podría reclamar (admin_assign_member) una cuenta sin organización creada
--     por un administrador de la organización Y, porque todas las cuentas sin organización son visibles para
--     cualquier administrador. Riesgo BAJO con una sola organización (el supuesto de hoy); hay que resolverlo con
--     `invitations` antes de operar con una segunda organización.
--   · ADMINISTRADORES ENTRE SÍ: cualquier administrador puede degradar o desactivar a otro administrador de su
--     organización (las funciones solo protegen a la ÚLTIMA persona administradora activa). No hay «administrador
--     principal». Es una decisión consciente de la Etapa 1; quien ve un abuso queda en la auditoría y el
--     propietario del proyecto siempre se recupera con SQL (ver «PRIMER ADMINISTRADOR»).
--   · DESACTIVAR NO CORTA TODO DE INMEDIATO: la RLS deja de dar acceso a datos en la consulta siguiente, pero la
--     sesión (JWT) sigue válida hasta que venza, y las URL firmadas de Storage ya emitidas siguen funcionando
--     hasta su vencimiento. Mitigación: URL firmadas de vida corta (60 segundos), generadas bajo demanda y nunca
--     guardadas; para cerrar la sesión de verdad, además bloquear la cuenta en Authentication.
--   · service_role: se le quita TRUNCATE sobre organizations, areas y user_areas (conserva el resto). El
--     propietario (rol postgres) sigue pudiendo vaciarlas y TRUNCATE no deja rastro en la auditoría (los triggers
--     de fila no se disparan). La copia de la auditoría fuera de la base queda pendiente (ver migración 3).
--
-- Triggers de auditoría: cada tabla nueva trae el suyo en esta misma migración (regla de la casa); la
--   migración 3 los verifica y completa de forma idempotente.
--
-- Idempotente: sí (IF NOT EXISTS, CREATE OR REPLACE, DROP POLICY/TRIGGER IF EXISTS antes de crear, backfill
--   condicionado). Los únicos DROP del archivo son de políticas de la migración base que se reemplazan
--   (profiles_select_self_or_admin, profiles_update_self, profiles_update_admin,
--   user_roles_select_self_or_admin, user_roles_admin_write) y los DROP ... IF EXISTS de objetos que este
--   mismo archivo crea, solo para poder repetirlo. Ninguno borra datos.
-- Se ejecuta en una sola transacción (Supabase aplica cada migración así).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0) Comprobaciones previas ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_roles'::regclass AND conname = 'user_roles_user_id_key'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'protect_last_admin'
  ) THEN
    RAISE EXCEPTION
      'Migración detenida: falta aplicar antes 20261105130000_endurecer_permisos_y_roles.sql (UNIQUE(user_id) en user_roles y protect_last_admin).';
  END IF;
END
$$;

-- ── 1) Organizaciones ──────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS organizations_set_updated_at ON public.organizations;
CREATE TRIGGER organizations_set_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_organizations ON public.organizations;
CREATE TRIGGER audit_organizations
AFTER INSERT OR UPDATE OR DELETE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- ── 2) profiles: organización y estado de la cuenta ────────────────────────────────────────────
-- org_id queda NULLABLE a propósito: una cuenta recién creada aún no tiene organización (= sin acceso).
-- ON DELETE RESTRICT: no se puede borrar una organización que tenga personas.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- (id, org_id) único: permite claves foráneas COMPUESTAS desde otras tablas, que obligan a que la persona
-- referenciada sea de la misma organización que la fila (user_areas aquí; tasks y evidencia en la migración 2).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass AND conname = 'profiles_id_org_key'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_org_key UNIQUE (id, org_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS profiles_org_idx ON public.profiles (org_id);

-- Backfill (ver criterio en el encabezado). Corre antes de crear el trigger de guarda y sin sesión de usuario.
DO $$
DECLARE
  v_org uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations) THEN
    INSERT INTO public.organizations (name) VALUES ('Organización principal') RETURNING id INTO v_org;
    UPDATE public.profiles SET org_id = v_org WHERE org_id IS NULL;
  END IF;
END
$$;

-- Auditoría: la migración 3 agrega la clave de organización; aquí solo la columna, que ya necesitan las
-- funciones admin_* de más abajo.
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS org_id uuid;

-- ── 3) Funciones auxiliares (todas SECURITY DEFINER para no depender de la RLS de quien llama) ───
-- Devuelven la organización de la persona que llama, o NULL si la cuenta está desactivada / no existe.
CREATE OR REPLACE FUNCTION public.auth_org()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.org_id
  FROM public.profiles p
  WHERE p.id = auth.uid() AND p.active;
$$;

-- Rol de la persona que llama. NULL (= sin acceso) si: no hay sesión, la cuenta está desactivada, no tiene
-- organización o no tiene fila en user_roles. UNIQUE(user_id) garantiza a lo más una fila.
CREATE OR REPLACE FUNCTION public.auth_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.role
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.user_id = auth.uid() AND p.active AND p.org_id IS NOT NULL;
$$;

-- AJUSTE de has_role (misma firma, CREATE OR REPLACE): antes miraba solo user_roles, así que una cuenta
-- desactivada o sin organización conservaba su rol en todas las políticas. Ahora delega en auth_role().
-- is_admin() no se toca: llama a has_role('admin') y hereda el cambio.
CREATE OR REPLACE FUNCTION public.has_role(_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.auth_role() = _role, false);
$$;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.auth_role() IN ('admin', 'gestor'), false);
$$;

-- Uso interno (solo otras funciones SECURITY DEFINER): ¿queda otra persona administradora ACTIVA en esa
-- organización, aparte de _except? Sin EXECUTE para authenticated: la API no la ve.
CREATE OR REPLACE FUNCTION public.internal_other_active_admin_exists(_org uuid, _except uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'admin' AND p.active AND p.org_id = _org AND ur.user_id <> _except
  );
$$;

REVOKE EXECUTE ON FUNCTION public.auth_org() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_manager() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.internal_other_active_admin_exists(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_org() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated, service_role;

-- ── 4) Permisos y políticas de organizations ───────────────────────────────────────────────────
-- Sin INSERT ni DELETE por la API: crear una organización es un acto del propietario del proyecto.
REVOKE ALL ON TABLE public.organizations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.organizations TO authenticated;
GRANT UPDATE (name) ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizations_select_member" ON public.organizations;
CREATE POLICY "organizations_select_member" ON public.organizations
  FOR SELECT TO authenticated
  USING (id = (SELECT public.auth_org()) AND (SELECT public.auth_role()) IS NOT NULL);

DROP POLICY IF EXISTS "organizations_update_admin" ON public.organizations;
CREATE POLICY "organizations_update_admin" ON public.organizations
  FOR UPDATE TO authenticated
  USING (id = (SELECT public.auth_org()) AND (SELECT public.is_admin()))
  WITH CHECK (id = (SELECT public.auth_org()) AND (SELECT public.is_admin()));

-- ── 5) profiles: trigger de guarda + políticas acotadas por organización ───────────────────────
-- Defensa en profundidad sobre el GRANT UPDATE (full_name, theme) de la migración de endurecimiento.
-- Función SECURITY INVOKER a propósito: así current_user es el rol de la sesión (anon/authenticated si llega
-- por la API; el propietario si viene de una función SECURITY DEFINER o del SQL Editor).
CREATE OR REPLACE FUNCTION public.profiles_guard_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.org_id IS DISTINCT FROM OLD.org_id
       OR NEW.active IS DISTINCT FROM OLD.active
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION
        'Solo puedes cambiar tu nombre y tu tema. La organización, el rol y el estado de la cuenta los gestiona una persona administradora.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.profiles_guard_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_guard_columns ON public.profiles;
CREATE TRIGGER profiles_guard_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_columns();

-- Se reemplazan las tres políticas de la migración base (sabían de «admin» pero no de organización).
DROP POLICY IF EXISTS "profiles_select_self_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;

-- Leer: el propio perfil siempre (aunque la cuenta esté desactivada o sin organización, para poder explicarlo);
-- admin y gestor, los de su organización.
DROP POLICY IF EXISTS "profiles_select_self" ON public.profiles;
CREATE POLICY "profiles_select_self" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "profiles_select_manager_org" ON public.profiles;
CREATE POLICY "profiles_select_manager_org" ON public.profiles
  FOR SELECT TO authenticated
  USING (org_id = (SELECT public.auth_org()) AND (SELECT public.is_manager()));

-- Editar: cada persona su fila (y solo full_name/theme por GRANT de columnas + trigger de guarda); un
-- administrador, las de su organización (mismas dos columnas). Nadie puede mover org_id ni active por aquí.
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) AND (SELECT public.auth_org()) IS NOT NULL)
  WITH CHECK (id = (SELECT auth.uid()) AND org_id = (SELECT public.auth_org()));

DROP POLICY IF EXISTS "profiles_update_admin_org" ON public.profiles;
CREATE POLICY "profiles_update_admin_org" ON public.profiles
  FOR UPDATE TO authenticated
  USING (org_id = (SELECT public.auth_org()) AND (SELECT public.is_admin()))
  WITH CHECK (org_id = (SELECT public.auth_org()) AND (SELECT public.is_admin()));

-- Los GRANT de profiles (SELECT + UPDATE (full_name, theme)) vienen de la migración de endurecimiento y no
-- cambian: org_id y active NO tienen UPDATE para authenticated.

-- ── 6) user_roles: solo lectura por la API; las escrituras van por admin_assign_member() ────────
DROP POLICY IF EXISTS "user_roles_select_self_or_admin" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_admin_write" ON public.user_roles;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_roles FROM authenticated;
REVOKE INSERT (user_id, role), UPDATE (role) ON TABLE public.user_roles FROM authenticated;
-- (SELECT sigue concedido desde la migración de endurecimiento; service_role no se toca.)

DROP POLICY IF EXISTS "user_roles_select_self" ON public.user_roles;
CREATE POLICY "user_roles_select_self" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT public.auth_org()) IS NOT NULL);

DROP POLICY IF EXISTS "user_roles_select_manager_org" ON public.user_roles;
CREATE POLICY "user_roles_select_manager_org" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_manager())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = user_roles.user_id AND p.org_id = (SELECT public.auth_org())
    )
  );

-- ── 7) Áreas ───────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT public.auth_org() REFERENCES public.organizations (id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT areas_id_org_key UNIQUE (id, org_id)
);
-- Único por organización + nombre, sin distinguir mayúsculas ni espacios de los bordes.
CREATE UNIQUE INDEX IF NOT EXISTS areas_org_name_uidx ON public.areas (org_id, lower(btrim(name)));

DROP TRIGGER IF EXISTS areas_set_updated_at ON public.areas;
CREATE TRIGGER areas_set_updated_at
BEFORE UPDATE ON public.areas
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_areas ON public.areas;
CREATE TRIGGER audit_areas
AFTER INSERT OR UPDATE OR DELETE ON public.areas
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- user_areas: tiene `id` propio porque audit_trigger() lo exige. La clave foránea compuesta obliga a que la
-- persona y el área sean de la MISMA organización (org_id viaja en la fila).
CREATE TABLE IF NOT EXISTS public.user_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  area_id uuid NOT NULL,
  org_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_areas_user_area_key UNIQUE (user_id, area_id),
  CONSTRAINT user_areas_user_fk FOREIGN KEY (user_id, org_id)
    REFERENCES public.profiles (id, org_id) ON DELETE CASCADE,
  CONSTRAINT user_areas_area_fk FOREIGN KEY (area_id, org_id)
    REFERENCES public.areas (id, org_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS user_areas_area_idx ON public.user_areas (area_id);

DROP TRIGGER IF EXISTS audit_user_areas ON public.user_areas;
CREATE TRIGGER audit_user_areas
AFTER INSERT OR UPDATE OR DELETE ON public.user_areas
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- Permisos. areas: INSERT/UPDATE por columnas (org_id sale del DEFAULT auth_org(), no del cliente).
-- user_areas: SOLO lectura; se escribe con admin_assign_member().
REVOKE ALL ON TABLE public.areas, public.user_areas FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.areas TO authenticated;
GRANT INSERT (name, active), UPDATE (name, active) ON public.areas TO authenticated;
GRANT SELECT ON public.user_areas TO authenticated;
GRANT ALL ON public.areas, public.user_areas TO service_role;
-- TRUNCATE no dispara triggers de fila (no deja rastro en la auditoría) y no tiene política que lo acote: se
-- quita a service_role en las tablas de negocio de esta migración (organizations se concedió más arriba). Sigue
-- teniendo SELECT, INSERT, UPDATE y DELETE. El propietario (postgres) conserva TRUNCATE. profiles y user_roles
-- no se tocan aquí.
REVOKE TRUNCATE ON TABLE public.organizations, public.areas, public.user_areas FROM service_role;

ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_areas ENABLE ROW LEVEL SECURITY;

-- Áreas: toda persona con acceso (cuenta activa y rol) lee las de su organización: los nombres de área no son
-- sensibles y el técnico las necesita para mostrar sus tareas. Solo un administrador las crea y edita.
DROP POLICY IF EXISTS "areas_select_member" ON public.areas;
CREATE POLICY "areas_select_member" ON public.areas
  FOR SELECT TO authenticated
  USING (org_id = (SELECT public.auth_org()) AND (SELECT public.auth_role()) IS NOT NULL);

DROP POLICY IF EXISTS "areas_insert_admin" ON public.areas;
CREATE POLICY "areas_insert_admin" ON public.areas
  FOR INSERT TO authenticated
  WITH CHECK (org_id = (SELECT public.auth_org()) AND (SELECT public.is_admin()));

DROP POLICY IF EXISTS "areas_update_admin" ON public.areas;
CREATE POLICY "areas_update_admin" ON public.areas
  FOR UPDATE TO authenticated
  USING (org_id = (SELECT public.auth_org()) AND (SELECT public.is_admin()))
  WITH CHECK (org_id = (SELECT public.auth_org()) AND (SELECT public.is_admin()));

DROP POLICY IF EXISTS "areas_delete_admin" ON public.areas;
CREATE POLICY "areas_delete_admin" ON public.areas
  FOR DELETE TO authenticated
  USING (org_id = (SELECT public.auth_org()) AND (SELECT public.is_admin()));

-- user_areas: cada persona ve las suyas; admin y gestor, las de su organización.
DROP POLICY IF EXISTS "user_areas_select_self" ON public.user_areas;
CREATE POLICY "user_areas_select_self" ON public.user_areas
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND org_id = (SELECT public.auth_org())
    AND (SELECT public.auth_role()) IS NOT NULL
  );

DROP POLICY IF EXISTS "user_areas_select_manager_org" ON public.user_areas;
CREATE POLICY "user_areas_select_manager_org" ON public.user_areas
  FOR SELECT TO authenticated
  USING (org_id = (SELECT public.auth_org()) AND (SELECT public.is_manager()));

-- ── 8) Funciones transaccionales de administración de miembros ─────────────────────────────────

-- admin_assign_member: asigna (o cambia) organización + rol + áreas de una persona, todo o nada.
--   · Solo una persona administradora ACTIVA, y solo hacia SU organización (p_org_id debe ser la suya).
--   · La persona debe no tener organización (alta) o ya ser de la misma organización (cambio de rol/áreas);
--     una persona de otra organización no se puede tocar (y se responde igual que si no existiera).
--   · p_area_ids reemplaza la lista completa de áreas de la persona (vacía = sin áreas).
--   · No se puede quitar el rol admin a la última persona administradora activa de la organización.
--   · Deja una fila explícita en audit_log (acción ASSIGN_MEMBER) además de las filas de los triggers.
CREATE OR REPLACE FUNCTION public.admin_assign_member(
  p_user_id uuid,
  p_role public.app_role,
  p_org_id uuid,
  p_area_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_org uuid;
  v_target public.profiles%ROWTYPE;
  v_old_role public.app_role;
  v_areas uuid[];
  v_old_areas uuid[];
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo una persona administradora con la cuenta activa puede asignar miembros.'
      USING ERRCODE = '42501';
  END IF;
  v_org := public.auth_org();

  IF p_user_id IS NULL OR p_role IS NULL OR p_org_id IS NULL THEN
    RAISE EXCEPTION 'Faltan datos: la persona, el rol y la organización son obligatorios.';
  END IF;
  IF p_org_id <> v_org THEN
    RAISE EXCEPTION 'Solo puedes asignar personas a tu propia organización.' USING ERRCODE = '42501';
  END IF;

  -- Se bloquea la fila para que dos administradores no cambien a la misma persona a la vez.
  SELECT * INTO v_target FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR (v_target.org_id IS NOT NULL AND v_target.org_id <> v_org) THEN
    RAISE EXCEPTION 'No se encontró a la persona, o pertenece a otra organización.' USING ERRCODE = '42501';
  END IF;

  -- Áreas: sin repetidos ni nulos, y todas de la organización de quien administra.
  SELECT COALESCE(array_agg(DISTINCT a), '{}'::uuid[]) INTO v_areas
  FROM unnest(COALESCE(p_area_ids, '{}'::uuid[])) AS a
  WHERE a IS NOT NULL;
  IF (SELECT count(*) FROM public.areas WHERE id = ANY (v_areas) AND org_id = v_org)
     <> COALESCE(cardinality(v_areas), 0) THEN
    RAISE EXCEPTION 'Alguna de las áreas no existe en tu organización.';
  END IF;

  -- Última persona administradora activa: misma llave de bloqueo que protect_last_admin.
  SELECT role INTO v_old_role FROM public.user_roles WHERE user_id = p_user_id;
  PERFORM pg_advisory_xact_lock(hashtextextended('dentihub.user_roles.ultimo_admin', 0));
  IF v_old_role = 'admin' AND p_role <> 'admin'
     AND v_target.active AND v_target.org_id IS NOT NULL
     AND NOT public.internal_other_active_admin_exists(v_org, p_user_id) THEN
    RAISE EXCEPTION
      'No se puede quitar el rol de administrador a la última persona administradora activa de la organización.'
      USING HINT = 'Asigna primero el rol admin a otra persona activa y luego repite el cambio.';
  END IF;

  -- Organización (solo si aún no tenía), rol y áreas, en la misma transacción.
  IF v_target.org_id IS NULL THEN
    UPDATE public.profiles SET org_id = v_org WHERE id = p_user_id;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, p_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  SELECT COALESCE(array_agg(area_id ORDER BY area_id), '{}'::uuid[]) INTO v_old_areas
  FROM public.user_areas WHERE user_id = p_user_id;

  DELETE FROM public.user_areas
  WHERE user_id = p_user_id AND NOT (area_id = ANY (v_areas));

  INSERT INTO public.user_areas (user_id, area_id, org_id)
  SELECT p_user_id, a, v_org FROM unnest(v_areas) AS a
  ON CONFLICT (user_id, area_id) DO NOTHING;

  INSERT INTO public.audit_log (org_id, table_name, record_id, action, old_data, new_data, actor_id)
  VALUES (
    v_org, 'profiles', p_user_id, 'ASSIGN_MEMBER',
    jsonb_build_object('role', v_old_role, 'org_id', v_target.org_id, 'area_ids', to_jsonb(v_old_areas)),
    jsonb_build_object('role', p_role, 'org_id', v_org, 'area_ids', to_jsonb(v_areas)),
    v_actor
  );
END;
$$;

-- admin_set_active: activa o desactiva una cuenta de SU organización.
--   · No se puede desactivar la propia cuenta (pídelo a otra persona administradora).
--   · No se puede desactivar a la última persona administradora activa de la organización.
--   · Las tareas que tenga asignadas la persona desactivada NO se reasignan solas: el gestor las ve y las
--     reasigna (o las cancela).
--   · Desactivar corta el acceso a datos de inmediato (la RLS mira active en cada consulta). La sesión
--     (token) sigue existiendo hasta que venza, y las URL firmadas de Storage ya emitidas siguen sirviendo hasta
--     su vencimiento (por eso conviene emitirlas de 60 segundos, bajo demanda); para cerrar la sesión de verdad,
--     además, bloquéala desde Authentication en el panel de Supabase.
--   · Cualquier administrador puede desactivar a otro administrador (solo se protege a la última persona
--     administradora activa); ver «ADMINISTRADORES ENTRE SÍ» en el encabezado.
CREATE OR REPLACE FUNCTION public.admin_set_active(p_user_id uuid, p_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_org uuid;
  v_target public.profiles%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo una persona administradora con la cuenta activa puede activar o desactivar cuentas.'
      USING ERRCODE = '42501';
  END IF;
  v_org := public.auth_org();

  IF p_user_id IS NULL OR p_active IS NULL THEN
    RAISE EXCEPTION 'Faltan datos: la persona y el estado son obligatorios.';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE id = p_user_id AND org_id = v_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró a la persona en tu organización.' USING ERRCODE = '42501';
  END IF;

  IF v_target.active = p_active THEN
    RETURN; -- sin cambios: no se ensucia la auditoría
  END IF;

  IF NOT p_active THEN
    IF p_user_id = v_actor THEN
      RAISE EXCEPTION 'No puedes desactivar tu propia cuenta. Pídeselo a otra persona administradora.';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('dentihub.user_roles.ultimo_admin', 0));
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = 'admin')
       AND NOT public.internal_other_active_admin_exists(v_org, p_user_id) THEN
      RAISE EXCEPTION
        'No se puede desactivar a la última persona administradora activa de la organización.'
        USING HINT = 'Asigna primero el rol admin a otra persona activa.';
    END IF;
  END IF;

  UPDATE public.profiles SET active = p_active WHERE id = p_user_id;

  INSERT INTO public.audit_log (org_id, table_name, record_id, action, old_data, new_data, actor_id)
  VALUES (
    v_org, 'profiles', p_user_id, 'SET_ACTIVE',
    jsonb_build_object('active', v_target.active),
    jsonb_build_object('active', p_active),
    v_actor
  );
END;
$$;

-- admin_list_unassigned_accounts: las cuentas activas que aún no tienen organización (recién creadas), para que
-- una persona administradora las encuentre y las asigne con admin_assign_member().
--   · Solo una persona administradora ACTIVA (y con organización: sin ella no es administrador, fail-closed).
--   · Devuelve únicamente id, email y created_at (no el nombre ni el tema). Las cuentas desactivadas no aparecen.
--   · Tope de 500 filas, de la más nueva a la más antigua, para que la respuesta nunca crezca sin límite.
--   · ADVERTENCIA (ver «CUENTAS NUEVAS» en el encabezado): con más de una organización, cualquier administrador
--     ve y puede reclamar estas cuentas. Pendiente: tabla `invitations`.
-- Se declara con plpgsql (y no con sql) para poder validar a quien llama ANTES de devolver filas. Los nombres de
-- las columnas de salida (id, email, created_at) son variables dentro de la función: por eso toda columna de
-- tabla va calificada con el alias p.
CREATE OR REPLACE FUNCTION public.admin_list_unassigned_accounts()
RETURNS TABLE (id uuid, email text, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo una persona administradora con la cuenta activa puede ver las cuentas sin organización.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.email, p.created_at
  FROM public.profiles p
  WHERE p.org_id IS NULL AND p.active
  ORDER BY p.created_at DESC
  LIMIT 500;
END;
$$;

-- Solo la interfaz (personas con sesión) las llama; la verificación de administrador está DENTRO de cada una.
REVOKE EXECUTE ON FUNCTION public.admin_assign_member(uuid, public.app_role, uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_active(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_unassigned_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_member(uuid, public.app_role, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_unassigned_accounts() TO authenticated;

-- ── PRIMER ADMINISTRADOR / ORGANIZACIÓN NUEVA (a mano, SQL Editor, como propietario) ────────────
-- Con la organización creada por el backfill y el administrador que ya existe, no hace falta nada. Para
-- una organización nueva o para recuperar un sistema sin administradores (ids ficticios):
--   INSERT INTO public.organizations (name) VALUES ('<nombre>') RETURNING id;
--   UPDATE public.profiles SET org_id = '<id-de-la-organización>' WHERE id = '<uid-de-la-cuenta>';
--   INSERT INTO public.user_roles (user_id, role) VALUES ('<uid-de-la-cuenta>', 'admin')
--     ON CONFLICT (user_id) DO UPDATE SET role = 'admin';
-- Sin organización, un administrador NO es administrador (fail-closed): hacen falta los dos pasos.

-- ── REVERSA MANUAL (Supabase no revierte migraciones; esto se ejecutaría como migración nueva) ──
-- Orden: primero las migraciones 2 y 3 de la Etapa 1 (dependen de esta), luego esto.
-- DROP FUNCTION IF EXISTS public.admin_list_unassigned_accounts();
-- DROP FUNCTION IF EXISTS public.admin_set_active(uuid, boolean);
-- DROP FUNCTION IF EXISTS public.admin_assign_member(uuid, public.app_role, uuid, uuid[]);
-- DROP TABLE IF EXISTS public.user_areas, public.areas;
-- -- Políticas nuevas de user_roles / profiles y regreso a las de la migración base:
-- DROP POLICY IF EXISTS "user_roles_select_self" ON public.user_roles;
-- DROP POLICY IF EXISTS "user_roles_select_manager_org" ON public.user_roles;
-- DROP POLICY IF EXISTS "profiles_select_self" ON public.profiles;
-- DROP POLICY IF EXISTS "profiles_select_manager_org" ON public.profiles;
-- DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
-- DROP POLICY IF EXISTS "profiles_update_admin_org" ON public.profiles;
-- CREATE POLICY "profiles_select_self_or_admin" ON public.profiles FOR SELECT TO authenticated
--   USING (id = auth.uid() OR public.is_admin());
-- CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated
--   USING (id = auth.uid()) WITH CHECK (id = auth.uid());
-- CREATE POLICY "profiles_update_admin" ON public.profiles FOR UPDATE TO authenticated
--   USING (public.is_admin()) WITH CHECK (public.is_admin());
-- CREATE POLICY "user_roles_select_self_or_admin" ON public.user_roles FOR SELECT TO authenticated
--   USING (user_id = auth.uid() OR public.is_admin());
-- CREATE POLICY "user_roles_admin_write" ON public.user_roles FOR ALL TO authenticated
--   USING (public.is_admin()) WITH CHECK (public.is_admin());
-- GRANT DELETE ON public.user_roles TO authenticated;
-- GRANT INSERT (user_id, role), UPDATE (role) ON public.user_roles TO authenticated;
-- -- Guarda de profiles y columnas nuevas (BORRA org_id y active: se pierde la asignación de organización):
-- DROP TRIGGER IF EXISTS profiles_guard_columns ON public.profiles;
-- DROP FUNCTION IF EXISTS public.profiles_guard_columns();
-- ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_org_key;
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS org_id, DROP COLUMN IF EXISTS active;
-- -- has_role a su versión original (la de la migración base):
-- CREATE OR REPLACE FUNCTION public.has_role(_role public.app_role) RETURNS boolean
--   LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
--   $f$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = _role); $f$;
-- DROP FUNCTION IF EXISTS public.internal_other_active_admin_exists(uuid, uuid);
-- DROP FUNCTION IF EXISTS public.is_manager();
-- DROP FUNCTION IF EXISTS public.auth_role();
-- DROP FUNCTION IF EXISTS public.auth_org();
-- DROP TABLE IF EXISTS public.organizations;
-- ALTER TABLE public.audit_log DROP COLUMN IF EXISTS org_id;
