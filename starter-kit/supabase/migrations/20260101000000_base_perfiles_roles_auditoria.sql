-- ════════════════════════════════════════════════════════════════════════════
-- DentiHub · migración base: perfiles, roles, auditoría y funciones de seguridad.
--
-- ⚠ NO EJECUTADA NI PROBADA contra una base real. Revísala completa antes de correrla en un proyecto
--   de Supabase y pruébala primero en un proyecto de desarrollo, no en producción.
-- ⚠ Al copiarla a supabase/migrations/ del proyecto, cambia el prefijo 20260101000000 por la fecha y
--   hora reales (AAAAMMDDHHMMSS) para que el orden con las migraciones siguientes sea correcto.
--
-- Qué crea: tipo app_role, tabla profiles (una fila por cuenta de auth), tabla user_roles, tabla
-- audit_log con su trigger, y las funciones has_role() / is_admin() que usan las políticas RLS.
--
-- Origen: patrón de las primeras migraciones de Dentiventario (sin sucursales, stock ni pedidos),
-- con las correcciones de seguridad que allí hubo que agregar después en migraciones aparte:
--   · Las funciones SECURITY DEFINER fijan search_path y revocan EXECUTE a PUBLIC/anon desde el inicio.
--   · has_role() ya no recibe el id de usuario: solo responde por quien llama (auth.uid()). Con el id
--     como parámetro, cualquier persona con sesión podía averiguar los roles de otras.
--   · La primera cuenta NO se vuelve administrador sola (Dentiventario lo hacía): quien se registre
--     primero no debe quedar con control total. El primer administrador se asigna a mano (ver abajo).
--   · Los permisos de columnas de profiles se limitan con GRANT (solo full_name y theme son editables).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tipos ──────────────────────────────────────────────────────────────────
CREATE TYPE public.app_role AS ENUM ('admin', 'gestor', 'tecnico');

-- ── Utilidad: mantener updated_at ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ── Perfiles: una fila por cuenta ──────────────────────────────────────────
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  theme text NOT NULL DEFAULT 'clasico'
    CHECK (theme IN ('clasico', 'rosa', 'azul-marino', 'celeste', 'morado', 'diente-feliz')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Roles: una persona puede tener más de una fila (se resuelve por prioridad en la app) ──
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- ── Auditoría: registro de quién cambió qué. Nadie lo escribe a mano: solo el trigger. ──
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Las consultas típicas son "qué pasó en esta tabla, últimamente": índice por (tabla, fecha).
CREATE INDEX audit_log_table_created_idx ON public.audit_log (table_name, created_at DESC);

-- ── Funciones de seguridad ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_role(_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role('admin');
$$;

-- Auditoría genérica: la tabla auditada debe tener una columna `id uuid`.
-- Guarda el contenido completo de la fila (old/new): si una tabla tiene datos personales o
-- sensibles, decide antes si conviene auditarla o excluir columnas.
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    rec_id := OLD.id;
  ELSE
    rec_id := NEW.id;
  END IF;

  INSERT INTO public.audit_log (table_name, record_id, action, old_data, new_data, actor_id)
  VALUES (
    TG_TABLE_NAME,
    rec_id,
    TG_OP,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    auth.uid()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_profiles
AFTER INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TRIGGER audit_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- Al crearse una cuenta en auth.users se crea su perfil. El rol NO se toma de raw_user_meta_data
-- (lo controla quien se registra): los roles solo los asigna un administrador.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.email, '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Una función nueva queda ejecutable por cualquiera (incluso sin sesión, rol "anon") mientras no se
-- restrinja. Las de las políticas necesitan EXECUTE para "authenticated"; las de trigger no.
REVOKE EXECUTE ON FUNCTION public.has_role(public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.audit_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

-- ── Permisos sobre tablas (RLS decide qué filas; GRANT decide qué operaciones y columnas) ──
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, theme) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

-- ── RLS: toda tabla nace con RLS activada y sus políticas escritas aquí mismo ──
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_self_or_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "user_roles_select_self_or_admin" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "user_roles_admin_write" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "audit_log_admin_select" ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- ── PRIMER ADMINISTRADOR (a mano, una sola vez) ─────────────────────────────
-- 1) Crea la cuenta desde la pantalla de registro o en Authentication → Users.
-- 2) En el SQL Editor de Supabase (se ejecuta como propietario, así que RLS no estorba), con el id
--    de esa cuenta (Authentication → Users → UID):
--
--    INSERT INTO public.user_roles (user_id, role) VALUES ('<uid-de-la-cuenta>', 'admin');

-- ── REVERSA MANUAL (Supabase no revierte migraciones; esto se ejecutaría como migración nueva) ──
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- DROP TABLE IF EXISTS public.audit_log, public.user_roles, public.profiles;
-- DROP FUNCTION IF EXISTS public.handle_new_user(), public.audit_trigger(), public.is_admin(),
--   public.has_role(public.app_role), public.set_updated_at();
-- DROP TYPE IF EXISTS public.app_role;
