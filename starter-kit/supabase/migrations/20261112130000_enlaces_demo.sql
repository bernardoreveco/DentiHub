-- ════════════════════════════════════════════════════════════════════════════
-- DentiHub · Enlaces de demo (ADR-0007, pedido de Bernardo el 2026-11-12)
-- QUÉ HACE Y POR QUÉ: dentihub.brevco.cl es siempre la app real; la demo (datos de ejemplo en el
--   navegador, sin tocar la base) solo se abre con un enlace que crea y revoca un Administrador.
--   1) Tabla demo_links: nombre, vigencia, uso. Guarda la HUELLA SHA-256 del código, nunca el código.
--   2) admin_crear_enlace_demo(nombre, días): Administrador con aal2; devuelve el código UNA vez.
--   3) admin_revocar_enlace_demo(id).
--   4) validar_enlace_demo(código): la ÚNICA función ejecutable por anon (sin sesión). Solo dice
--      si el código es válido (y cuenta el uso); no entrega ningún dato. El código tiene 192 bits al
--      azar, así que probar códigos no sirve.
-- Sin trigger genérico de auditoría a propósito: auditaría la huella. Cada función audita sin ella.
-- Idempotente: sí. Se ejecuta en una transacción. Reversa al final.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regprocedure('public.mi_acceso()') IS NULL THEN
    RAISE EXCEPTION 'Migración detenida: aplica antes 20261112120000_acceso_invitaciones_y_mi_acceso.sql.';
  END IF;
  IF to_regprocedure('extensions.digest(bytea, text)') IS NULL
     OR to_regprocedure('extensions.gen_random_bytes(integer)') IS NULL THEN
    RAISE EXCEPTION 'Migración detenida: falta la extensión pgcrypto en el esquema extensions.';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.demo_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE RESTRICT,
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 100),
  token_hash bytea NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  uses integer NOT NULL DEFAULT 0,
  last_used_at timestamptz
);

REVOKE ALL ON TABLE public.demo_links FROM PUBLIC, anon, authenticated;
-- El Administrador lee la lista, pero nunca la huella.
GRANT SELECT (id, org_id, label, created_by, created_at, expires_at, revoked_at, uses, last_used_at)
  ON public.demo_links TO authenticated;
GRANT ALL ON public.demo_links TO service_role;
ALTER TABLE public.demo_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "demo_links_select_admin_org" ON public.demo_links;
CREATE POLICY "demo_links_select_admin_org" ON public.demo_links
  FOR SELECT TO authenticated
  USING (org_id = (SELECT public.auth_org()) AND (SELECT public.is_admin()));

CREATE OR REPLACE FUNCTION public.admin_crear_enlace_demo(p_label text, p_dias integer DEFAULT 7)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_token text;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo una persona administradora, con la verificación en dos pasos, puede crear enlaces de demo.'
      USING ERRCODE = '42501';
  END IF;
  IF p_label IS NULL OR length(btrim(p_label)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Escribe un nombre para el enlace (hasta 100 caracteres).';
  END IF;
  IF p_dias IS NULL OR p_dias NOT BETWEEN 1 AND 30 THEN
    RAISE EXCEPTION 'La vigencia debe ser de 1 a 30 días.';
  END IF;
  v_org := public.auth_org();
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  INSERT INTO public.demo_links (org_id, label, token_hash, created_by, expires_at)
  VALUES (v_org, btrim(p_label), extensions.digest(v_token, 'sha256'), auth.uid(),
          now() + make_interval(days => p_dias))
  RETURNING id INTO v_id;
  INSERT INTO public.audit_log (org_id, table_name, record_id, action, new_data, actor_id)
  VALUES (v_org, 'demo_links', v_id, 'CREATE_DEMO_LINK',
          jsonb_build_object('label', btrim(p_label), 'dias', p_dias), auth.uid());
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revocar_enlace_demo(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo una persona administradora, con la verificación en dos pasos, puede revocar enlaces de demo.'
      USING ERRCODE = '42501';
  END IF;
  v_org := public.auth_org();
  UPDATE public.demo_links SET revoked_at = now()
  WHERE id = p_id AND org_id = v_org AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese enlace no existe o ya estaba revocado.';
  END IF;
  INSERT INTO public.audit_log (org_id, table_name, record_id, action, actor_id)
  VALUES (v_org, 'demo_links', p_id, 'REVOKE_DEMO_LINK', auth.uid());
END;
$$;

-- Sin sesión: solo responde verdadero o falso. Un código con forma inválida ni siquiera se busca.
CREATE OR REPLACE FUNCTION public.validar_enlace_demo(p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{48}$' THEN
    RETURN false;
  END IF;
  UPDATE public.demo_links
     SET uses = uses + 1, last_used_at = now()
   WHERE token_hash = extensions.digest(p_token, 'sha256')
     AND revoked_at IS NULL AND expires_at > now()
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_crear_enlace_demo(text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_revocar_enlace_demo(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.validar_enlace_demo(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_crear_enlace_demo(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revocar_enlace_demo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validar_enlace_demo(text) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- REVERSA MANUAL:
-- DROP FUNCTION IF EXISTS public.validar_enlace_demo(text);
-- DROP FUNCTION IF EXISTS public.admin_revocar_enlace_demo(uuid);
-- DROP FUNCTION IF EXISTS public.admin_crear_enlace_demo(text, integer);
-- DROP TABLE IF EXISTS public.demo_links;
-- ════════════════════════════════════════════════════════════════════════════
