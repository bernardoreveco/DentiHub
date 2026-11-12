-- ════════════════════════════════════════════════════════════════════════════
-- DentiHub · Módulo Acceso · invitaciones, vincular_invitacion(), mi_acceso() y dos pasos (aal2)
-- AVISO: NO EJECUTADA. Se preparó solo como archivo. La aplica Bernardo (o el agente principal con su
--   confirmación), primero en un proyecto de DESARROLLO, y después se corre la sección «Acceso» de
--   starter-kit/supabase/pruebas/etapa1-pruebas-rls.md.
-- ORDEN: va DESPUÉS de las cuatro migraciones de la Etapa 1 (este archivo lo comprueba en el bloque 0).
--
-- QUÉ HACE Y POR QUÉ (ADR-0005, decisiones de Bernardo del 2026-11-12, tras auditar el flujo de Acceso):
--   1) Tabla invitations. El Administrador invita con correo + rol + áreas. Antes, la cuenta nacía sin
--      organización ni rol y había que asignarla a mano desde una lista de «cuentas sin asignar»; nada unía
--      la invitación con la cuenta, así que se podía asignar a la persona equivocada.
--   2) vincular_invitacion(): al primer ingreso con el correo CONFIRMADO asigna organización, rol y áreas
--      en UNA transacción, con bloqueo de fila. Es idempotente (repetirla no cambia nada).
--   3) mi_acceso(): el contrato «contexto de acceso» en una sola lectura, con los motivos en un orden fijo:
--      correo_sin_confirmar → desactivada → sin_organizacion → sin_rol → requiere_dos_pasos.
--   4) auth_role() (misma firma, CREATE OR REPLACE): devuelve NULL si el correo no está confirmado, o si la
--      persona es Administradora y su sesión NO es aal2 (verificación en dos pasos). Como has_role(),
--      is_admin(), is_manager() y todas las políticas pasan por auth_role(), un Administrador con solo la
--      clave no tiene NINGÚN permiso, ni llamando la API directo. Antes la exigencia era solo de pantalla.
--   5) organizations.idle_timeout_minutes: cierre de sesión por inactividad, configurable y apagado (NULL)
--      por defecto, porque hay celulares compartidos y personales (decisión de Bernardo).
--
-- DECISIONES QUE CONVIENE CONOCER
--   · invitations NO lleva el trigger genérico audit_trigger(): guardaría el correo de la persona invitada en
--     la auditoría, y el criterio de la casa es no guardar datos personales ahí (migración 3 quita email y
--     full_name de profiles). En su lugar, cada función escribe su propia fila en audit_log SIN el correo.
--     Nadie escribe en invitations directo por la API: solo estas funciones, así que todo cambio queda auditado.
--   · Una cuenta que YA pertenece a la organización (activa o no) no se invita: se reactiva o se le cambia el
--     rol con admin_assign_member/admin_set_active. Así una invitación nunca mueve a alguien de organización.
--   · Reenviar una invitación la extiende 7 días. Una invitación pendiente vencida se revoca sola al invitar
--     de nuevo al mismo correo (el índice único solo permite una pendiente por correo y organización).
--   · ⚠ EFECTO EN LA BASE REAL: el Administrador que ya existe pierde todo permiso hasta que inscriba la
--     verificación en dos pasos (pantalla A2b) e ingrese con ella. Es lo que se decidió. Si quedara sin
--     acceso, el propietario lo recupera con docs/operacion/recuperar-administrador.md.
--   · El rol se lee de la base en cada consulta: no se copia al token de sesión (ADR-0005, hallazgo de
--     sesión). Un cambio de rol o una desactivación rige en la consulta siguiente.
--
-- Idempotente: sí (IF NOT EXISTS, CREATE OR REPLACE, DROP POLICY IF EXISTS antes de crear). Ningún DROP borra
--   datos. Se ejecuta en una sola transacción (Supabase aplica cada migración así).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0) Comprobaciones previas ──────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.organizations') IS NULL
     OR to_regclass('public.user_areas') IS NULL
     OR to_regprocedure('public.auth_org()') IS NULL
     OR to_regprocedure('public.is_manager()') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger
       WHERE tgrelid = 'public.audit_log'::regclass AND tgname = 'audit_log_block_update_delete'
     ) THEN
    RAISE EXCEPTION
      'Migración detenida: aplica antes las cuatro migraciones de la Etapa 1 (endurecer, organización y áreas, tareas y auditoría inmutable).';
  END IF;
END
$$;

-- ── 1) Cierre por inactividad, por organización ────────────────────────────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS idle_timeout_minutes integer
  CHECK (idle_timeout_minutes IS NULL OR idle_timeout_minutes BETWEEN 5 AND 720);
COMMENT ON COLUMN public.organizations.idle_timeout_minutes IS
  'Minutos sin uso tras los que la app cierra la sesión. NULL = apagado (ADR-0005).';
-- El Administrador lo cambia por la API, como el nombre (política organizations_update_admin).
GRANT UPDATE (idle_timeout_minutes) ON public.organizations TO authenticated;

-- ── 2) Tabla invitations ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  email text NOT NULL
    CHECK (email = lower(btrim(email)) AND length(email) <= 254 AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.app_role NOT NULL,
  area_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  invited_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  sent_at timestamptz,
  send_error text CHECK (send_error IS NULL OR length(send_error) <= 500),
  accepted_at timestamptz,
  accepted_user_id uuid REFERENCES public.profiles (id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles (id) ON DELETE RESTRICT,
  -- Estados coherentes: aceptada y revocada se excluyen; aceptada siempre dice quién la aceptó.
  CONSTRAINT invitations_estado_ck CHECK (
    NOT (accepted_at IS NOT NULL AND revoked_at IS NOT NULL)
    AND ((accepted_at IS NULL) = (accepted_user_id IS NULL))
    AND ((revoked_at IS NULL) = (revoked_by IS NULL))
  )
);

-- Una sola invitación pendiente por correo y organización.
CREATE UNIQUE INDEX IF NOT EXISTS invitations_pendiente_unica
  ON public.invitations (org_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
-- vincular_invitacion() busca por correo.
CREATE INDEX IF NOT EXISTS invitations_email_idx ON public.invitations (email);

REVOKE ALL ON TABLE public.invitations FROM PUBLIC, anon, authenticated;
-- Lectura para la lista del Administrador (la RLS acota). Sin escritura directa: solo por funciones.
GRANT SELECT ON public.invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.invitations TO service_role;

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invitations_select_admin_org" ON public.invitations;
CREATE POLICY "invitations_select_admin_org" ON public.invitations
  FOR SELECT TO authenticated
  USING (org_id = (SELECT public.auth_org()) AND (SELECT public.is_admin()));

-- ── 3) auth_role(): correo confirmado y aal2 para Administradores ──────────────────────────────
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
  JOIN auth.users u ON u.id = ur.user_id
  WHERE ur.user_id = auth.uid()
    AND p.active
    AND p.org_id IS NOT NULL
    AND u.email_confirmed_at IS NOT NULL
    -- Verificación en dos pasos exigida por la base: sin aal2, un Administrador no tiene rol.
    AND (ur.role <> 'admin' OR COALESCE(auth.jwt() ->> 'aal', '') = 'aal2');
$$;
REVOKE EXECUTE ON FUNCTION public.auth_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_role() TO authenticated, service_role;

-- ── 4) Auxiliar interna: escribir en la auditoría sin datos personales ─────────────────────────
CREATE OR REPLACE FUNCTION public.internal_audit_invitation(
  _org uuid, _id uuid, _action text, _old jsonb, _new jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.audit_log (org_id, table_name, record_id, action, old_data, new_data, actor_id)
  VALUES (_org, 'invitations', _id, _action, _old, _new, auth.uid());
$$;
REVOKE EXECUTE ON FUNCTION public.internal_audit_invitation(uuid, uuid, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;

-- ── 5) Administrador: crear, reenviar y revocar invitaciones ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_create_invitation(
  p_email text,
  p_role public.app_role,
  p_area_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_email text := lower(btrim(COALESCE(p_email, '')));
  v_areas uuid[];
  v_id uuid;
BEGIN
  -- is_admin() ya exige cuenta activa, organización, correo confirmado y aal2.
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo una persona administradora, con la verificación en dos pasos, puede invitar.'
      USING ERRCODE = '42501';
  END IF;
  v_org := public.auth_org();

  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 254 THEN
    RAISE EXCEPTION 'Escribe un correo válido.';
  END IF;
  IF p_role IS NULL THEN
    RAISE EXCEPTION 'Elige el rol de la persona.';
  END IF;

  -- Quien ya es de la organización no se invita: se reactiva o se le cambia el rol.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(email) = v_email AND org_id = v_org) THEN
    RAISE EXCEPTION 'Esa persona ya pertenece a la organización. Reactívala o cámbiale el rol.';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT a), '{}'::uuid[]) INTO v_areas
  FROM unnest(COALESCE(p_area_ids, '{}'::uuid[])) AS a WHERE a IS NOT NULL;
  IF (SELECT count(*) FROM public.areas WHERE id = ANY (v_areas) AND org_id = v_org AND active)
     <> COALESCE(cardinality(v_areas), 0) THEN
    RAISE EXCEPTION 'Alguna de las áreas no existe o está inactiva en tu organización.';
  END IF;

  -- Una pendiente vencida se revoca sola; una pendiente vigente se reenvía, no se duplica.
  UPDATE public.invitations
     SET revoked_at = now(), revoked_by = auth.uid()
   WHERE org_id = v_org AND email = v_email
     AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at <= now();
  IF EXISTS (
    SELECT 1 FROM public.invitations
    WHERE org_id = v_org AND email = v_email AND accepted_at IS NULL AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Ya hay una invitación vigente para ese correo. Usa Reenviar.';
  END IF;

  INSERT INTO public.invitations (org_id, email, role, area_ids, invited_by)
  VALUES (v_org, v_email, p_role, v_areas, auth.uid())
  RETURNING id INTO v_id;

  PERFORM public.internal_audit_invitation(
    v_org, v_id, 'INVITE', NULL,
    jsonb_build_object('role', p_role, 'area_ids', to_jsonb(v_areas))
  );
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_resend_invitation(p_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_inv public.invitations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo una persona administradora, con la verificación en dos pasos, puede reenviar.'
      USING ERRCODE = '42501';
  END IF;
  v_org := public.auth_org();

  SELECT * INTO v_inv FROM public.invitations WHERE id = p_id AND org_id = v_org FOR UPDATE;
  IF NOT FOUND OR v_inv.accepted_at IS NOT NULL OR v_inv.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esa invitación ya no está pendiente.';
  END IF;

  UPDATE public.invitations
     SET expires_at = now() + interval '7 days', send_error = NULL
   WHERE id = p_id;
  PERFORM public.internal_audit_invitation(
    v_org, p_id, 'RESEND_INVITE',
    jsonb_build_object('expires_at', v_inv.expires_at),
    jsonb_build_object('expires_at', now() + interval '7 days')
  );
  RETURN p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_invitation(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo una persona administradora, con la verificación en dos pasos, puede revocar.'
      USING ERRCODE = '42501';
  END IF;
  v_org := public.auth_org();

  UPDATE public.invitations
     SET revoked_at = now(), revoked_by = auth.uid()
   WHERE id = p_id AND org_id = v_org AND accepted_at IS NULL AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esa invitación ya no está pendiente.';
  END IF;
  PERFORM public.internal_audit_invitation(v_org, p_id, 'REVOKE_INVITE', NULL, NULL);
END;
$$;

-- Solo la función de servidor «invitar» (clave de servicio) registra si el correo salió o falló.
CREATE OR REPLACE FUNCTION public.admin_mark_invitation_sent(p_id uuid, p_error text DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.invitations
     SET sent_at = CASE WHEN p_error IS NULL THEN now() ELSE sent_at END,
         send_error = CASE WHEN p_error IS NULL THEN NULL ELSE left(p_error, 500) END
   WHERE id = p_id;
$$;

-- ── 6) vincular_invitacion(): la persona invitada queda asignada sola ──────────────────────────
-- Devuelve un código (no lanza error en los casos esperados) para que A3 siga con mi_acceso():
--   vinculada · sin_cambios · correo_sin_confirmar · desactivada · otra_organizacion
CREATE OR REPLACE FUNCTION public.vincular_invitacion()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_profile public.profiles%ROWTYPE;
  v_inv public.invitations%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sin sesión.' USING ERRCODE = '42501';
  END IF;

  SELECT lower(u.email), u.email_confirmed_at INTO v_email, v_confirmed
  FROM auth.users u WHERE u.id = v_uid;
  IF v_confirmed IS NULL THEN
    RETURN 'correo_sin_confirmar';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'sin_cambios';
  END IF;
  IF NOT v_profile.active THEN
    RETURN 'desactivada';
  END IF;

  SELECT * INTO v_inv
  FROM public.invitations
  WHERE email = v_email AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'sin_cambios';
  END IF;

  -- Nunca mueve a alguien de organización.
  IF v_profile.org_id IS NOT NULL AND v_profile.org_id <> v_inv.org_id THEN
    RETURN 'otra_organizacion';
  END IF;

  IF v_profile.org_id IS NULL THEN
    UPDATE public.profiles SET org_id = v_inv.org_id WHERE id = v_uid;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, v_inv.role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  -- Solo áreas que siguen activas en la organización (pudieron desactivarse después de invitar).
  INSERT INTO public.user_areas (user_id, area_id, org_id)
  SELECT v_uid, a.id, v_inv.org_id
  FROM public.areas a
  WHERE a.id = ANY (v_inv.area_ids) AND a.org_id = v_inv.org_id AND a.active
  ON CONFLICT (user_id, area_id) DO NOTHING;

  UPDATE public.invitations
     SET accepted_at = now(), accepted_user_id = v_uid
   WHERE id = v_inv.id;

  PERFORM public.internal_audit_invitation(
    v_inv.org_id, v_inv.id, 'ACCEPT_INVITE', NULL,
    jsonb_build_object('user_id', v_uid, 'role', v_inv.role, 'area_ids', to_jsonb(v_inv.area_ids))
  );
  RETURN 'vinculada';
END;
$$;

-- ── 7) mi_acceso(): el contrato «contexto de acceso» ───────────────────────────────────────────
-- Lee el rol directo de user_roles (y no con auth_role()) para poder explicar el motivo: un Administrador
-- sin aal2 debe saber que le falta la verificación, no ver «sin rol».
CREATE OR REPLACE FUNCTION public.mi_acceso()
RETURNS TABLE (
  user_id uuid,
  nombre text,
  org_id uuid,
  rol public.app_role,
  areas uuid[],
  habilitada boolean,
  motivo text,
  mfa_requerida boolean,
  aal text,
  inactividad_minutos integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_aal text := COALESCE(auth.jwt() ->> 'aal', 'aal1');
  v_confirmed timestamptz;
  v_profile public.profiles%ROWTYPE;
  v_role public.app_role;
  v_areas uuid[];
  v_idle integer;
  v_motivo text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN; -- sin sesión: ninguna fila
  END IF;

  SELECT u.email_confirmed_at INTO v_confirmed FROM auth.users u WHERE u.id = v_uid;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  SELECT ur.role INTO v_role FROM public.user_roles ur WHERE ur.user_id = v_uid;
  SELECT COALESCE(array_agg(ua.area_id ORDER BY ua.area_id), '{}'::uuid[]) INTO v_areas
  FROM public.user_areas ua WHERE ua.user_id = v_uid;
  SELECT o.idle_timeout_minutes INTO v_idle FROM public.organizations o WHERE o.id = v_profile.org_id;

  v_motivo := CASE
    WHEN v_confirmed IS NULL THEN 'correo_sin_confirmar'
    WHEN v_profile.id IS NULL OR NOT v_profile.active THEN 'desactivada'
    WHEN v_profile.org_id IS NULL THEN 'sin_organizacion'
    WHEN v_role IS NULL THEN 'sin_rol'
    WHEN v_role = 'admin' AND v_aal <> 'aal2' THEN 'requiere_dos_pasos'
    ELSE NULL
  END;

  RETURN QUERY SELECT
    v_uid,
    COALESCE(v_profile.full_name, ''),
    v_profile.org_id,
    v_role,
    v_areas,
    v_motivo IS NULL,
    v_motivo,
    COALESCE(v_role = 'admin', false),
    v_aal,
    v_idle;
END;
$$;

-- ── 8) Permisos de ejecución ───────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.admin_create_invitation(text, public.app_role, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_resend_invitation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_invitation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_mark_invitation_sent(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vincular_invitacion() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mi_acceso() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_create_invitation(text, public.app_role, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resend_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_invitation_sent(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.vincular_invitacion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mi_acceso() TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- REVERSA MANUAL (no se ejecuta sola; revisar antes, porque borra las invitaciones):
-- DROP FUNCTION IF EXISTS public.mi_acceso();
-- DROP FUNCTION IF EXISTS public.vincular_invitacion();
-- DROP FUNCTION IF EXISTS public.admin_mark_invitation_sent(uuid, text);
-- DROP FUNCTION IF EXISTS public.admin_revoke_invitation(uuid);
-- DROP FUNCTION IF EXISTS public.admin_resend_invitation(uuid);
-- DROP FUNCTION IF EXISTS public.admin_create_invitation(text, public.app_role, uuid[]);
-- DROP FUNCTION IF EXISTS public.internal_audit_invitation(uuid, uuid, text, jsonb, jsonb);
-- DROP TABLE IF EXISTS public.invitations;
-- ALTER TABLE public.organizations DROP COLUMN IF EXISTS idle_timeout_minutes;
-- -- auth_role() vuelve a la versión de 20261110120000 (sin correo confirmado ni aal2):
-- CREATE OR REPLACE FUNCTION public.auth_role() RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER
--   SET search_path = public AS $$
--   SELECT ur.role FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
--   WHERE ur.user_id = auth.uid() AND p.active AND p.org_id IS NOT NULL; $$;
-- ════════════════════════════════════════════════════════════════════════════
