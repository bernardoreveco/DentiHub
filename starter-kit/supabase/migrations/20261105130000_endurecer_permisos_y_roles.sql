-- ════════════════════════════════════════════════════════════════════════════
-- DentiHub · endurecer permisos de tabla y reglas de roles (revisión de seguridad, 05-11-2026).
--
-- AVISO: NO EJECUTADA. Esta migración se preparó como archivo; la aplica Bernardo (o el agente
--   principal con su confirmación). Pruébala primero en un proyecto de desarrollo.
-- AVISO: la migración base (20260101000000) NO se edita: ya está aplicada en el Supabase real. Todo lo
--   que corrige va aquí, como migración nueva.
--
-- Qué hace (tres cosas, relacionadas porque todas protegen public.profiles / user_roles / audit_log):
--
--   1) Permisos de tabla mínimos. En la base real, anon y authenticated tienen TODOS los privilegios
--      (incluidos TRUNCATE, TRIGGER y REFERENCES) sobre las tres tablas: las tablas nuevas de Supabase
--      nacen con ALL para esos roles (privilegios por defecto del esquema public). Por eso el
--      "GRANT UPDATE (full_name, theme)" de la base no limitaba nada: con UPDATE a nivel de tabla, el de
--      columnas sobra, y la política profiles_update_self dejaba a cualquiera editar su propio email o
--      created_at por la API. Aquí se revoca todo y se entrega solo lo que cada flujo necesita:
--        · anon ........ nada (no hay ninguna pantalla pública que lea estas tablas).
--        · profiles .... authenticated: SELECT y UPDATE solo de (full_name, theme). No hay INSERT ni
--                        DELETE por API: el perfil lo crea handle_new_user() y se borra en cascada.
--        · user_roles .. authenticated: SELECT, DELETE, INSERT solo de (user_id, role) y UPDATE solo de
--                        (role). Las políticas (user_roles_admin_write) dejan escribir solo al
--                        administrador; el GRANT impide además reasignar una fila a otra persona o forjar
--                        id/created_at.
--        · audit_log ... authenticated: solo SELECT (la política limita a administradores). Los INSERT
--                        los hace audit_trigger(), que es SECURITY DEFINER (se comprueba abajo), así que
--                        no necesitan GRANT para authenticated. Nadie escribe ni borra el registro a mano.
--        · service_role no se toca.
--      Además se cambian los privilegios por defecto del esquema public para que las TABLAS FUTURAS
--      creadas por el rol postgres ya no nazcan con ALL para anon/authenticated (ver el aviso en el
--      bloque correspondiente).
--
--   2) Un solo rol por persona. user_roles tenía UNIQUE (user_id, role): una persona podía ser gestor y
--      técnico a la vez, y la interfaz (resolveRole, que elige uno por prioridad) y la RLS (has_role,
--      que responde por cada rol) dejaban de coincidir. Pasa a UNIQUE (user_id), como dice AGENTE.md §6.
--      Antes de crear la restricción se comprueba que no haya personas con varios roles; si las hubiera,
--      la migración se detiene con un mensaje que las lista (no migra datos por su cuenta).
--      Consecuencia: cambiar el rol es un UPDATE de la fila (o ON CONFLICT (user_id) DO UPDATE), no
--      "agregar uno nuevo". El comando del primer administrador de la migración base sigue valiendo.
--
--   3) Protección del último administrador. Trigger BEFORE UPDATE OR DELETE en user_roles que impide
--      quitar el rol admin a la última persona administradora (borrando su fila, cambiándole el rol o
--      reasignando la fila a otro usuario). Reglas:
--        · admin -> admin de la misma persona: se permite (no cambia nada).
--        · Si queda otro administrador: se permite (un admin puede degradarse a sí mismo).
--        · Si NO queda otro y quien actúa es una persona con sesión (auth.uid() no es nulo): se bloquea
--          con un error en español.
--        · Si NO queda otro y NO hay sesión de usuario (SQL Editor, service_role, consola del propietario
--          del proyecto, o el borrado de un usuario desde Authentication): se PERMITE y se emite un
--          WARNING. Decisión: el propietario debe poder limpiar (eliminar un usuario de auth.users,
--          reordenar roles a mano) sin tener que desactivar el trigger; bloquearlo ahí empujaría a hacer
--          ALTER TABLE ... DISABLE TRIGGER, que es peor. La puerta que importa cerrar es la de la
--          interfaz/API, donde una persona con sesión podría dejar el sistema sin administrador por
--          error o malicia. Si un borrado del propietario deja el sistema sin admin, se recupera con el
--          mismo comando manual del primer administrador (ver al final del archivo).
--        · Borrado en cascada desde auth.users: el trigger se ejecuta igual (la cascada borra filas de
--          user_roles). Sin sesión de usuario pasa (con WARNING); si un día una función SECURITY DEFINER
--          borra usuarios en nombre de un admin con sesión, la cascada sí se bloquea si era el último.
--        · Concurrencia: dos administradores que se degradan a la vez podrían dejar cero admins (cada
--          uno vería al otro como vigente). Se serializa con un bloqueo de asesoría de la transacción.
--      La función es SECURITY DEFINER (cuenta administradores sin depender de la RLS de quien llama), con
--      search_path fijo y EXECUTE revocado en esta misma migración.
--
-- Datos existentes: no se modifica ninguna fila. Verificado en solo lectura contra el Supabase real antes de escribirla: 1 fila en
--   user_roles (1 admin) y 0 personas con varios roles.
-- Idempotente: sí (REVOKE/GRANT, ALTER DEFAULT PRIVILEGES, CREATE OR REPLACE, DROP TRIGGER IF EXISTS y
--   la restricción se crea solo si no existe). Única excepción: se detiene si hay personas con varios roles.
-- Única sentencia DROP: la restricción UNIQUE (user_id, role), pedida expresamente (cambio 2); no borra
--   datos. Los DROP TRIGGER IF EXISTS son solo para poder volver a correr el archivo.
-- Se ejecuta en una sola transacción (Supabase aplica cada migración así); si algo falla, no queda a medias.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0) Comprobaciones previas: si no se cumplen, se detiene todo con un mensaje claro ──────────

-- audit_trigger() y handle_new_user() deben ser SECURITY DEFINER: al quitar los privilegios de tabla a
-- authenticated, si corrieran con los permisos de quien llama, la auditoría y el alta de perfiles fallarían.
DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('audit_trigger', 'handle_new_user')
      AND p.prosecdef
  ) <> 2 THEN
    RAISE EXCEPTION
      'Migración detenida: audit_trigger() y handle_new_user() deben existir y ser SECURITY DEFINER. '
      'Sin eso, al quitar permisos de tabla se rompería la auditoría o el alta de perfiles. Revisa la migración base.';
  END IF;
END
$$;

-- Nadie puede tener más de un rol: si hubiera, hay que decidir a mano con cuál se queda cada persona.
DO $$
DECLARE
  duplicados text;
BEGIN
  SELECT string_agg(d.user_id::text || ' (' || d.n || ' roles)', ', ')
    INTO duplicados
  FROM (
    SELECT user_id, count(*) AS n
    FROM public.user_roles
    GROUP BY user_id
    HAVING count(*) > 1
  ) d;

  IF duplicados IS NOT NULL THEN
    RAISE EXCEPTION
      'Migración detenida: hay personas con más de un rol en user_roles: %. '
      'Deja una sola fila por persona (decide a mano cuál) y vuelve a correr la migración.', duplicados;
  END IF;
END
$$;

-- ── 1) Permisos de tabla mínimos ───────────────────────────────────────────────────────────────

-- Primero se quita TODO (también los permisos por columna) y luego se concede lo estrictamente necesario.
REVOKE ALL ON TABLE public.profiles, public.user_roles, public.audit_log
  FROM PUBLIC, anon, authenticated;

-- profiles: leer (la RLS limita a la fila propia o a administradores) y editar solo nombre y tema.
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, theme) ON public.profiles TO authenticated;

-- user_roles: lo que necesita la política user_roles_admin_write (FOR ALL) y user_roles_select_self_or_admin.
-- El rol de una persona se cambia con UPDATE (role); no se puede reasignar la fila a otro user_id.
GRANT SELECT, DELETE ON public.user_roles TO authenticated;
GRANT INSERT (user_id, role), UPDATE (role) ON public.user_roles TO authenticated;

-- audit_log: solo lectura (la política audit_log_admin_select limita a administradores).
GRANT SELECT ON public.audit_log TO authenticated;

-- service_role conserva los permisos que ya tenía (no se toca).

-- Privilegios por defecto: las TABLAS FUTURAS que cree el rol postgres en public ya no nacerán con ALL
-- para anon y authenticated.
-- AVISO (qué puede afectar): solo vale para tablas nuevas creadas por el rol postgres en el esquema
--   public (el SQL Editor y las migraciones normales). Toda tabla nueva necesitará sus GRANT explícitos,
--   como ya exige la plantilla; una tabla creada desde el Table Editor o por una herramienta sin GRANT
--   quedará inaccesible por la API (falla cerrado) hasta que se concedan. No cambia tablas existentes, no
--   toca service_role ni otros esquemas, y no cubre tablas creadas por supabase_admin (a ese rol no se
--   puede cambiar desde aquí). Funciones y secuencias quedan como están (las funciones SECURITY DEFINER
--   siguen exigiendo su REVOKE explícito, ver plantilla). Verifica con la consulta de pg_default_acl
--   indicada en la guía de pruebas.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

-- ── 2) Un solo rol por persona ─────────────────────────────────────────────────────────────────

-- Se crea la nueva restricción antes de quitar la antigua: nunca hay una ventana sin unicidad.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.user_roles'::regclass
      AND conname = 'user_roles_user_id_key'
  ) THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);
  END IF;
END
$$;

-- Nombre que Postgres le dio automáticamente a UNIQUE (user_id, role) en la migración base. Es la única
-- sentencia DROP del archivo; no borra datos. Con UNIQUE (user_id) la anterior queda redundante.
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

-- ── 3) Protección del último administrador ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.protect_last_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  hay_otro_admin boolean;
BEGIN
  -- Filas que no son de administrador: no es asunto de este trigger.
  IF OLD.role <> 'admin' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  -- Cambio de admin a admin de la misma persona (o de otras columnas): no se pierde ningún admin.
  IF TG_OP = 'UPDATE' AND NEW.role = 'admin' AND NEW.user_id = OLD.user_id THEN
    RETURN NEW;
  END IF;

  -- A partir de aquí la fila deja de ser "admin de esa persona" (se borra, cambia de rol o de dueño).
  -- Se serializa para que dos administradores que se degradan a la vez no se vean mutuamente como vigentes.
  PERFORM pg_advisory_xact_lock(hashtextextended('dentihub.user_roles.ultimo_admin', 0));

  -- Dentro de la misma sentencia (borrado de varias filas) las filas ya eliminadas no se cuentan,
  -- porque esta función es volátil y ve los cambios previos de la propia sentencia.
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE role = 'admin'
      AND user_id <> OLD.user_id
  ) INTO hay_otro_admin;

  IF NOT hay_otro_admin THEN
    IF auth.uid() IS NOT NULL THEN
      -- Persona con sesión (interfaz/API): bloqueo duro.
      RAISE EXCEPTION
        'No se puede quitar el rol de administrador a la última persona administradora: el sistema quedaría sin quien lo gestione.'
        USING HINT = 'Asigna primero el rol admin a otra persona y luego repite el cambio.';
    ELSE
      -- Sin sesión (SQL Editor, service_role, borrado desde Authentication): se permite el trabajo del
      -- propietario, pero se deja constancia.
      RAISE WARNING
        'DentiHub: el sistema se queda SIN administradores. Asigna uno a mano: INSERT INTO public.user_roles (user_id, role) VALUES (''<uid>'', ''admin'') ON CONFLICT (user_id) DO UPDATE SET role = ''admin'';';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_roles_protect_last_admin ON public.user_roles;
CREATE TRIGGER user_roles_protect_last_admin
BEFORE UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_last_admin();

-- Función de trigger: nadie con sesión (ni anónimo) necesita ejecutarla a mano.
REVOKE EXECUTE ON FUNCTION public.protect_last_admin() FROM PUBLIC, anon, authenticated;

-- ── RECUPERACIÓN si el propietario se queda sin administradores (a mano, SQL Editor) ──────────
-- INSERT INTO public.user_roles (user_id, role) VALUES ('<uid-de-la-cuenta>', 'admin')
-- ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

-- ── REVERSA MANUAL (Supabase no revierte migraciones; esto se ejecutaría como migración nueva) ──
-- -- 3) Quitar la protección del último administrador:
-- DROP TRIGGER IF EXISTS user_roles_protect_last_admin ON public.user_roles;
-- DROP FUNCTION IF EXISTS public.protect_last_admin();
--
-- -- 2) Volver a permitir varios roles por persona (restaura la restricción de la migración base):
-- ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
-- ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_key;
--
-- -- 1) Volver a los privilegios por defecto anteriores (REABRE el hueco de seguridad; solo si hace falta
-- --    para diagnosticar). El estado de la migración base era GRANT ALL a anon y authenticated:
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
-- GRANT ALL ON TABLE public.profiles, public.user_roles, public.audit_log TO anon, authenticated;
-- -- Para dejar los permisos como los quería la migración base (sin anon):
-- -- REVOKE ALL ON TABLE public.profiles, public.user_roles, public.audit_log FROM PUBLIC, anon, authenticated;
-- -- GRANT SELECT ON public.profiles TO authenticated;
-- -- GRANT UPDATE (full_name, theme) ON public.profiles TO authenticated;
-- -- GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
-- -- GRANT SELECT ON public.audit_log TO authenticated;
