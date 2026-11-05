-- ════════════════════════════════════════════════════════════════════════════
-- PLANTILLA DE MIGRACIÓN · copia este archivo a supabase/migrations/ con el nombre
--   AAAAMMDDHHMMSS_descripcion_en_snake_case.sql      (ej. 20261105120000_tasks_table.sql)
-- y reemplaza todo lo que está entre «…». No la ejecutes tal cual: es un molde.
--
-- Encabezado obligatorio (en español, para quien lea esto en un año):
--   · QUÉ hace y POR QUÉ (y quién lo pidió, con fecha, si viene de una decisión del equipo).
--   · Si toca datos existentes, cómo se comporta con filas que ya existen.
--   · Si es seguro correrla más de una vez (idempotente) o no.
-- ════════════════════════════════════════════════════════════════════════════

-- Ejemplo de tabla nueva con RLS, auditoría y reversa. La tabla `tasks` es solo ilustrativa.

CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  status text NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'en_curso', 'hecha')),
  assigned_to uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 1) Permisos de tabla: solo lo necesario (RLS decide filas; GRANT decide operaciones).
GRANT SELECT, INSERT, UPDATE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;

-- 2) RLS activada en la misma migración que crea la tabla. Sin políticas, nadie accede.
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- 3) Políticas explícitas, una por operación, con nombre «tabla_operacion_quien».
CREATE POLICY "tasks_select_own_or_admin" ON public.tasks
  FOR SELECT TO authenticated
  USING (assigned_to = auth.uid() OR created_by = auth.uid() OR public.is_admin());

CREATE POLICY "tasks_insert_self" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "tasks_update_own_or_admin" ON public.tasks
  FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid() OR created_by = auth.uid() OR public.is_admin())
  WITH CHECK (assigned_to = auth.uid() OR created_by = auth.uid() OR public.is_admin());

-- 4) RLS no restringe COLUMNAS. Si un campo solo debe cambiarlo un rol concreto (estado de una
--    aprobación, ámbito de acceso, monto aprobado…), usa un trigger de guarda (BEFORE UPDATE) que lance
--    una excepción en español, o un GRANT UPDATE (columnas…). La interfaz ocultando un botón NO es
--    seguridad: la regla vive en la base de datos.

-- 5) Fecha de actualización y auditoría (las funciones vienen de la migración base).
CREATE TRIGGER tasks_set_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER audit_tasks
AFTER INSERT OR UPDATE OR DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- 6) Si creas una función SECURITY DEFINER: fija search_path y revoca el acceso anónimo EN ESTA
--    MISMA migración (Dentiventario tuvo que corregirlo después, en migraciones aparte).
--
--    CREATE OR REPLACE FUNCTION public.mi_funcion(...) RETURNS ... LANGUAGE plpgsql
--      SECURITY DEFINER SET search_path = public AS $$ ... $$;
--    REVOKE EXECUTE ON FUNCTION public.mi_funcion(...) FROM PUBLIC, anon;
--    GRANT  EXECUTE ON FUNCTION public.mi_funcion(...) TO authenticated, service_role;

-- 7) Operaciones de varios pasos que deben salir "todo o nada" (aprobar y registrar, mover un
--    archivo y dejar constancia) van en UNA función de base de datos, no en varias llamadas sueltas desde
--    el navegador: un corte a mitad deja los datos descuadrados.

-- ── REVERSA MANUAL (se ejecutaría como migración nueva; escríbela siempre) ──
-- DROP TABLE IF EXISTS public.tasks;
