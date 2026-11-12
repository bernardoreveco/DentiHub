# Guía de pruebas de RLS y permisos · Etapa 1

Se corre en un proyecto de **DESARROLLO** de Supabase, nunca en producción ni en los proyectos de inventario de Dentimagen. Está escrita contra las versiones **finales** de estas migraciones (que **no se han ejecutado** en ninguna base; esta guía tampoco):

1. `20261105130000_endurecer_permisos_y_roles.sql`
2. `20261110120000_etapa1_organizacion_y_areas.sql`
3. `20261110130000_etapa1_tareas_evidencia_storage.sql`
4. `20261110140000_etapa1_auditoria_inmutable.sql`

Los resultados esperados salen de leer el código, no de haberlo corrido. Cuando algo depende de un supuesto sin verificar, está marcado **(NO VERIFICADO)**. Si un resultado real difiere de lo esperado, anota la diferencia: puede ser un error de esta guía o de la migración.

Reglas de la guía: sin claves, sin contraseñas, sin datos reales. Correos ficticios `@example.test`. Las claves y contraseñas de la prueba por API van solo en variables de entorno de tu terminal (sección 3.10).

---

## 0. Antes de empezar

- **Dónde correr el SQL.** Lo más cómodo es `psql` con la cadena de conexión de desarrollo en una variable de entorno (por ejemplo `psql "$DEV_DB_URL"`): muestra los `NOTICE` y `WARNING`, que esta guía usa para informar los resultados. El SQL Editor de Supabase puede no mostrarlos **(NO VERIFICADO)**: si no los ves, usa `psql`.
- **Un bloque a la vez.** Cada prueba va entre `BEGIN;` y `ROLLBACK;`, así no deja datos. Un bloque que falla deja la transacción abortada: ejecuta `ROLLBACK;` antes de seguir.
- **Mensajes en inglés.** Los mensajes de Postgres (`permission denied…`, `new row violates row-level security policy…`) salen en inglés si el servidor está en inglés. Las pruebas comparan el **código SQLSTATE** y un **fragmento** del mensaje.
- **Orden.** Aplica primero las cuatro migraciones, luego la sección 1 (arnés), luego la 2 (datos de prueba) y después las pruebas.
- **El propietario no es un usuario de la app.** En el SQL Editor y en `psql` con la cadena de conexión corres como `postgres`: la RLS no te limita y `auth.uid()` es `NULL`. Por eso las funciones de administración fallan ahí con «Solo una persona administradora…» y hay que simular el JWT (sección 1).

---

## 1. Arnés de pruebas

### 1.1 Cómo simular a una persona

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"<UID-DE-LA-PERSONA>","role":"authenticated"}', true);
-- ... sentencias de la prueba ...
ROLLBACK;
```

- `SET LOCAL ROLE authenticated` hace que Postgres aplique privilegios y RLS como lo haría la API.
- `auth.uid()` lee el `sub` de `request.jwt.claims` **(NO VERIFICADO en la versión de Auth del proyecto)**. Comprueba una vez: con un UID puesto, `SELECT auth.uid();` debe devolverlo.
- Para cambiar de persona dentro del mismo bloque, vuelve a llamar a `set_config`. Para volver a ser propietario: `RESET ROLE;`. Para simular `service_role` o `anon`: `SET LOCAL ROLE service_role;` / `SET LOCAL ROLE anon;`.
- Para llamar a una función `SECURITY DEFINER` «como persona» sin cambiar de rol (sin pasar por privilegios), basta con `set_config` siendo propietario.

### 1.2 Arnés para sentencias que deben fallar (y para comprobar resultados)

Crea este esquema auxiliar **solo en desarrollo**. No lo expone la API (PostgREST solo publica los esquemas configurados) y se borra en la sección 4.

```sql
CREATE SCHEMA IF NOT EXISTS pruebas;
GRANT USAGE ON SCHEMA pruebas TO anon, authenticated, service_role;

-- La sentencia DEBE fallar con ese SQLSTATE y (si se indica) ese fragmento de mensaje.
-- Corre con los privilegios del rol actual (SECURITY INVOKER), así que sirve bajo SET LOCAL ROLE.
CREATE OR REPLACE FUNCTION pruebas.debe_fallar(p_sql text, p_sqlstate text, p_texto text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> p_sqlstate OR position(p_texto IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'FALLO_DE_PRUEBA: falló distinto de lo esperado. Esperado [%] "%"; obtenido [%] %',
        p_sqlstate, p_texto, SQLSTATE, SQLERRM;
    END IF;
    RAISE NOTICE 'OK falla como se esperaba [%] %', SQLSTATE, SQLERRM;
    RETURN;
  END;
  RAISE EXCEPTION 'FALLO_DE_PRUEBA: la sentencia debía fallar y se ejecutó: %', p_sql;
END;
$$;

-- La sentencia DML debe afectar exactamente N filas (0 filas = «sin error pero sin efecto», típico de la RLS).
CREATE OR REPLACE FUNCTION pruebas.debe_afectar(p_sql text, p_filas bigint)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> p_filas THEN
    RAISE EXCEPTION 'FALLO_DE_PRUEBA: se esperaban % fila(s) y fueron %: %', p_filas, n, p_sql;
  END IF;
  RAISE NOTICE 'OK % fila(s)', n;
END;
$$;

-- La consulta escalar debe devolver exactamente este texto (NULL se escribe NULL).
CREATE OR REPLACE FUNCTION pruebas.debe_ser(p_sql text, p_esperado text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  EXECUTE p_sql INTO v;
  IF v IS DISTINCT FROM p_esperado THEN
    RAISE EXCEPTION 'FALLO_DE_PRUEBA: esperado "%", obtenido "%": %', p_esperado, v, p_sql;
  END IF;
  RAISE NOTICE 'OK = %', v;
END;
$$;
```

Uso (siempre con comillas de dólar `$q$…$q$` para el texto de la sentencia):

```sql
SELECT pruebas.debe_fallar($q$ UPDATE public.tasks SET status = 'completada' $q$, '42501', 'permission denied');
SELECT pruebas.debe_afectar($q$ UPDATE public.tasks SET title = 'x' WHERE id = '…' $q$, 0);
SELECT pruebas.debe_ser($q$ SELECT count(*)::text FROM public.tasks $q$, '2');
```

Un resultado distinto de lo esperado lanza `FALLO_DE_PRUEBA` y aborta el bloque.

Códigos SQLSTATE que aparecen: `42501` permiso o RLS · `23514` CHECK o regla de completitud · `23505` duplicado · `23503` clave foránea · `P0001` error propio de una función.

---

## 2. Datos de prueba

Todos los UUID son fijos y en minúscula (las rutas de Storage exigen minúscula). Correos ficticios.

| Qué | Nombre | UUID | Detalle |
|---|---|---|---|
| Organización | ORG_A | `a1a1a1a1-0000-4000-8000-000000000001` | |
| Organización | ORG_B | `b1b1b1b1-0000-4000-8000-000000000001` | |
| Persona | ADMIN_A | `c0000000-0000-4000-8000-000000000001` | `admin_a@example.test`, admin, org A |
| Persona | GESTOR_A | `c0000000-0000-4000-8000-000000000002` | `gestor_a@example.test`, gestor, org A |
| Persona | TEC_A1 | `c0000000-0000-4000-8000-000000000003` | `tec_a1@example.test`, técnico, org A, área A1 |
| Persona | TEC_A2 | `c0000000-0000-4000-8000-000000000004` | `tec_a2@example.test`, técnico, org A, área A2 |
| Persona | SIN_ORG | `c0000000-0000-4000-8000-000000000005` | `sin_org@example.test`, sin organización ni rol |
| Persona | SIN_ROL | `c0000000-0000-4000-8000-000000000006` | `sin_rol@example.test`, org A, activa, sin rol |
| Persona | DESACT | `c0000000-0000-4000-8000-000000000007` | `desact@example.test`, técnico, org A, **desactivada** |
| Persona | ADMIN_B | `c0000000-0000-4000-8000-000000000011` | `admin_b@example.test`, admin, org B |
| Persona | TEC_B1 | `c0000000-0000-4000-8000-000000000013` | `tec_b1@example.test`, técnico, org B, área B1 |
| Persona (solo prueba de cascada) | TMP | `c0000000-0000-4000-8000-000000000020` | `tmp@example.test` (se crea dentro de la prueba) |
| Área | AREA_A1 / AREA_A2 / AREA_B1 | `d0000000-0000-4000-8000-000000000001` / `…002` / `…011` | A1 tiene tareas; A2 solo tiene a TEC_A2 |
| Plantilla | TPL_FOTO | `e0000000-0000-4000-8000-000000000001` | exige foto y el paso `limpieza` («Limpieza hecha») |
| Plantilla | TPL_SIN_FOTO | `e0000000-0000-4000-8000-000000000002` | sin foto, paso `limpieza` obligatorio |
| Plantilla | TPL_RETIRADA | `e0000000-0000-4000-8000-000000000003` | **inactiva** |
| Plantilla | TPL_B | `e0000000-0000-4000-8000-000000000011` | org B |
| Tarea | T_FOTO | `f0000000-0000-4000-8000-000000000001` | TEC_A1 · TPL_FOTO · área A1 |
| Tarea | T_SIN_FOTO | `f0000000-0000-4000-8000-000000000002` | TEC_A1 · TPL_SIN_FOTO · área A1 |
| Tarea | T_AJENA | `f0000000-0000-4000-8000-000000000003` | TEC_A2 · TPL_SIN_FOTO · área A1 |
| Tarea | T_SIN_ASIGNAR | `f0000000-0000-4000-8000-000000000004` | sin asignar · TPL_SIN_FOTO |
| Tarea | T_DESACT | `f0000000-0000-4000-8000-000000000005` | DESACT · TPL_SIN_FOTO |
| Tarea | T_B | `f0000000-0000-4000-8000-000000000011` | TEC_B1 · TPL_B · org B |
| Definiciones recurrentes | D01 a D10 | `90000000-0000-4000-8000-0000000000NN` (NN = 01 a 10) | ver abajo |
| Objetos de Storage simulados | OBJ_nn | `0b000000-0000-4000-8000-0000000000nn` | nombre de archivo |

Rutas de Storage: `{org}/{tarea}/{objeto}.jpg`. Ejemplo para T_FOTO y OBJ_01:
`a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000001.jpg`

### 2.1 Carga (como propietario)

Pasa **siempre** `org_id` y `created_by` explícitos en los `INSERT` como propietario: `areas`, `form_templates`, `tasks` y `task_definitions` tienen `org_id DEFAULT auth_org()` y `created_by DEFAULT auth.uid()`, que valen `NULL` sin sesión y harían fallar el `INSERT`.

Las cuentas se insertan en `auth.users` **sin contraseña** (no pueden iniciar sesión; sirven para las pruebas en SQL). El `INSERT` en `auth.users` **(NO VERIFICADO)** asume que esas columnas bastan en la versión de Auth del proyecto; si falla por una columna obligatoria, agrégala según el error. El trigger `on_auth_user_created` crea el perfil.

```sql
BEGIN;

INSERT INTO public.organizations (id, name) VALUES
  ('a1a1a1a1-0000-4000-8000-000000000001', 'Org A de prueba'),
  ('b1b1b1b1-0000-4000-8000-000000000001', 'Org B de prueba');

-- email_confirmed_at: desde la migración de Acceso (20261112120000), sin correo confirmado no hay rol.
INSERT INTO auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
SELECT v.id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       v.email, now(), now(), now()
FROM (VALUES
  ('c0000000-0000-4000-8000-000000000001', 'admin_a@example.test'),
  ('c0000000-0000-4000-8000-000000000002', 'gestor_a@example.test'),
  ('c0000000-0000-4000-8000-000000000003', 'tec_a1@example.test'),
  ('c0000000-0000-4000-8000-000000000004', 'tec_a2@example.test'),
  ('c0000000-0000-4000-8000-000000000005', 'sin_org@example.test'),
  ('c0000000-0000-4000-8000-000000000006', 'sin_rol@example.test'),
  ('c0000000-0000-4000-8000-000000000007', 'desact@example.test'),
  ('c0000000-0000-4000-8000-000000000011', 'admin_b@example.test'),
  ('c0000000-0000-4000-8000-000000000013', 'tec_b1@example.test')
) AS v(id, email);

-- Organización de cada perfil (SIN_ORG queda sin organización a propósito).
UPDATE public.profiles SET org_id = 'a1a1a1a1-0000-4000-8000-000000000001'
 WHERE id IN ('c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002',
              'c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000004',
              'c0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000007');
UPDATE public.profiles SET org_id = 'b1b1b1b1-0000-4000-8000-000000000001'
 WHERE id IN ('c0000000-0000-4000-8000-000000000011', 'c0000000-0000-4000-8000-000000000013');

-- Roles (SIN_ORG y SIN_ROL no tienen).
INSERT INTO public.user_roles (user_id, role) VALUES
  ('c0000000-0000-4000-8000-000000000001', 'admin'),
  ('c0000000-0000-4000-8000-000000000002', 'gestor'),
  ('c0000000-0000-4000-8000-000000000003', 'tecnico'),
  ('c0000000-0000-4000-8000-000000000004', 'tecnico'),
  ('c0000000-0000-4000-8000-000000000007', 'tecnico'),
  ('c0000000-0000-4000-8000-000000000011', 'admin'),
  ('c0000000-0000-4000-8000-000000000013', 'tecnico');

INSERT INTO public.areas (id, org_id, name) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001', 'Area A1'),
  ('d0000000-0000-4000-8000-000000000002', 'a1a1a1a1-0000-4000-8000-000000000001', 'Area A2'),
  ('d0000000-0000-4000-8000-000000000011', 'b1b1b1b1-0000-4000-8000-000000000001', 'Area B1');

INSERT INTO public.user_areas (user_id, area_id, org_id) VALUES
  ('c0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000002', 'a1a1a1a1-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000013', 'd0000000-0000-4000-8000-000000000011', 'b1b1b1b1-0000-4000-8000-000000000001');

INSERT INTO public.form_templates (id, org_id, name, version, schema, created_by) VALUES
  ('e0000000-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001', 'Checklist con foto', 1,
   '{"requires_photo": true, "min_photos": 1, "steps": [{"key": "limpieza", "label": "Limpieza hecha", "type": "check"}]}',
   'c0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000002', 'a1a1a1a1-0000-4000-8000-000000000001', 'Checklist sin foto', 1,
   '{"requires_photo": false, "steps": [{"key": "limpieza", "label": "Limpieza hecha"}]}',
   'c0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000003', 'a1a1a1a1-0000-4000-8000-000000000001', 'Plantilla retirada', 1,
   '{"requires_photo": false, "steps": []}',
   'c0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000011', 'b1b1b1b1-0000-4000-8000-000000000001', 'Checklist B', 1,
   '{"requires_photo": false, "steps": []}',
   'c0000000-0000-4000-8000-000000000011');

INSERT INTO public.tasks (id, org_id, area_id, template_id, title, assignee_id, created_by) VALUES
  ('f0000000-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'e0000000-0000-4000-8000-000000000001', 'Tarea con foto',   'c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000002', 'a1a1a1a1-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'e0000000-0000-4000-8000-000000000002', 'Tarea sin foto',   'c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000003', 'a1a1a1a1-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'e0000000-0000-4000-8000-000000000002', 'Tarea ajena',      'c0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000004', 'a1a1a1a1-0000-4000-8000-000000000001', NULL,
   'e0000000-0000-4000-8000-000000000002', 'Tarea sin asignar', NULL,                                   'c0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000005', 'a1a1a1a1-0000-4000-8000-000000000001', NULL,
   'e0000000-0000-4000-8000-000000000002', 'Tarea de cuenta desactivada', 'c0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000011', 'b1b1b1b1-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000011',
   'e0000000-0000-4000-8000-000000000011', 'Tarea de B',       'c0000000-0000-4000-8000-000000000013', 'c0000000-0000-4000-8000-000000000011');

-- Definiciones recurrentes (todas de org A, creadas por ADMIN_A). La fecha de prueba es el lunes 09-11-2026.
--   D01 diaria · D02 semanal lunes · D03 mensual día 9 (sin asignado) · D04 semanal martes
--   D05 terminada (ends_on 31-10-2026) · D06 inactiva · D07 plantilla retirada · D08 asignada a DESACT
--   D09 diaria sin asignado ni área · D10 empieza el 01-12-2026
INSERT INTO public.task_definitions
  (id, org_id, area_id, template_id, title, assignee_id, frequency, weekday, day_of_month, starts_on, ends_on, active, created_by) VALUES
  ('90000000-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'Def diaria',                   'c0000000-0000-4000-8000-000000000003', 'diaria',  NULL, NULL, '2026-01-01', NULL,         true,  'c0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000002', 'a1a1a1a1-0000-4000-8000-000000000001', NULL,                                   'e0000000-0000-4000-8000-000000000002', 'Def semanal lunes',           'c0000000-0000-4000-8000-000000000004', 'semanal', 1,    NULL, '2026-01-01', NULL,         true,  'c0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000003', 'a1a1a1a1-0000-4000-8000-000000000001', NULL,                                   'e0000000-0000-4000-8000-000000000002', 'Def mensual dia 9',           NULL,                                   'mensual', NULL, 9,    '2026-01-01', NULL,         true,  'c0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000004', 'a1a1a1a1-0000-4000-8000-000000000001', NULL,                                   'e0000000-0000-4000-8000-000000000002', 'Def semanal martes',          'c0000000-0000-4000-8000-000000000003', 'semanal', 2,    NULL, '2026-01-01', NULL,         true,  'c0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000005', 'a1a1a1a1-0000-4000-8000-000000000001', NULL,                                   'e0000000-0000-4000-8000-000000000002', 'Def terminada',               'c0000000-0000-4000-8000-000000000003', 'diaria',  NULL, NULL, '2026-01-01', '2026-10-31', true,  'c0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000006', 'a1a1a1a1-0000-4000-8000-000000000001', NULL,                                   'e0000000-0000-4000-8000-000000000002', 'Def inactiva',                'c0000000-0000-4000-8000-000000000003', 'diaria',  NULL, NULL, '2026-01-01', NULL,         false, 'c0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000007', 'a1a1a1a1-0000-4000-8000-000000000001', NULL,                                   'e0000000-0000-4000-8000-000000000003', 'Def con plantilla retirada',  'c0000000-0000-4000-8000-000000000003', 'diaria',  NULL, NULL, '2026-01-01', NULL,         true,  'c0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000008', 'a1a1a1a1-0000-4000-8000-000000000001', NULL,                                   'e0000000-0000-4000-8000-000000000002', 'Def con persona desactivada', 'c0000000-0000-4000-8000-000000000007', 'diaria',  NULL, NULL, '2026-01-01', NULL,         true,  'c0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000009', 'a1a1a1a1-0000-4000-8000-000000000001', NULL,                                   'e0000000-0000-4000-8000-000000000002', 'Def sin asignado',            NULL,                                   'diaria',  NULL, NULL, '2026-01-01', NULL,         true,  'c0000000-0000-4000-8000-000000000001'),
  ('90000000-0000-4000-8000-000000000010', 'a1a1a1a1-0000-4000-8000-000000000001', NULL,                                   'e0000000-0000-4000-8000-000000000002', 'Def futura',                  'c0000000-0000-4000-8000-000000000003', 'diaria',  NULL, NULL, '2026-12-01', NULL,         true,  'c0000000-0000-4000-8000-000000000001');

-- Se desactivan DESPUÉS de crear lo que depende de ellos (el trigger no deja asignar a una cuenta inactiva
-- ni usar una plantilla inactiva en filas nuevas).
UPDATE public.profiles SET active = false WHERE id = 'c0000000-0000-4000-8000-000000000007';
UPDATE public.form_templates SET active = false WHERE id = 'e0000000-0000-4000-8000-000000000003';

COMMIT;
```

Comprobación rápida de la carga (como propietario). Esperado: `9 | 2 | 7 | 6 | 4 | 10` (perfiles, organizaciones, roles, tareas, plantillas, definiciones).

```sql
SELECT (SELECT count(*) FROM public.profiles WHERE email LIKE '%@example.test') AS perfiles,
       (SELECT count(*) FROM public.organizations WHERE name LIKE 'Org % de prueba') AS orgs,
       (SELECT count(*) FROM public.user_roles WHERE user_id::text LIKE 'c0000000-%') AS roles,
       (SELECT count(*) FROM public.tasks WHERE org_id IN ('a1a1a1a1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001')) AS tareas,
       (SELECT count(*) FROM public.form_templates WHERE id::text LIKE 'e0000000-%') AS plantillas,
       (SELECT count(*) FROM public.task_definitions WHERE id::text LIKE '90000000-%') AS definiciones;
```

Si alguna cifra no coincide, la carga quedó incompleta o el proyecto ya tenía datos con esos UUID: no sigas hasta aclararlo.

---

## 3. Pruebas

### 3.0 Verificación estática (como propietario, sin simular a nadie)

**E-01 · Toda tabla de `public` tiene RLS.** Esperado: **0 filas**.

```sql
SELECT c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
```

**E-02 · `anon` no tiene ningún privilegio sobre las tablas de `public`.** Esperado: **0 filas**.

```sql
SELECT c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR has_any_column_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES'));
```

**E-03 · Privilegios de `authenticated` a nivel de tabla.** Esperado exacto (una fila por tabla):

```sql
SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privilegios
FROM information_schema.role_table_grants
WHERE grantee = 'authenticated' AND table_schema = 'public'
GROUP BY table_name ORDER BY 1;
```

| table_name | privilegios |
|---|---|
| areas | DELETE, SELECT |
| audit_log | SELECT |
| form_templates | SELECT |
| organizations | SELECT |
| profiles | SELECT |
| task_definitions | SELECT |
| task_evidence | SELECT |
| tasks | SELECT |
| user_areas | SELECT |
| user_roles | SELECT |

Si el proyecto de desarrollo tiene otras tablas, aparecerán además; no son de esta etapa.

**E-04 · Privilegios por columna de `authenticated` (INSERT y UPDATE).** Ninguna tabla tiene INSERT o UPDATE a nivel de tabla, así que la lista es exactamente la de las columnas concedidas.

```sql
SELECT table_name, privilege_type, string_agg(column_name, ', ' ORDER BY column_name) AS columnas
FROM information_schema.column_privileges
WHERE grantee = 'authenticated' AND table_schema = 'public' AND privilege_type IN ('INSERT', 'UPDATE')
GROUP BY table_name, privilege_type ORDER BY 1, 2;
```

Esperado:

| table_name | privilege_type | columnas |
|---|---|---|
| areas | INSERT | active, name |
| areas | UPDATE | active, name |
| form_templates | UPDATE | active |
| organizations | UPDATE | name |
| profiles | UPDATE | full_name, theme |
| task_definitions | INSERT | active, area_id, assignee_id, day_of_month, due_offset_hours, ends_on, frequency, starts_on, template_id, title, weekday |
| task_definitions | UPDATE | (las mismas once) |
| tasks | INSERT | area_id, assignee_id, due_at, template_id, title |
| tasks | UPDATE | area_id, assignee_id, due_at, title |

**E-05 · `service_role` sin TRUNCATE en las tablas nuevas de negocio ni en `audit_log`.** Esperado: solo `profiles` y `user_roles` (no se tocaron en esta etapa; sigue siendo una decisión pendiente).

```sql
SELECT table_name FROM information_schema.role_table_grants
WHERE grantee = 'service_role' AND table_schema = 'public' AND privilege_type = 'TRUNCATE'
ORDER BY 1;
```

Y `audit_log` sin `UPDATE`/`DELETE` para `service_role`. Esperado: solo `INSERT` y `SELECT` (y `REFERENCES`/`TRIGGER` si Supabase los dio por defecto):

```sql
SELECT string_agg(privilege_type, ', ' ORDER BY privilege_type)
FROM information_schema.role_table_grants
WHERE grantee = 'service_role' AND table_schema = 'public' AND table_name = 'audit_log';
```

**E-06 · Privilegios por defecto de las tablas futuras** (referenciada por la migración de endurecimiento).

```sql
SELECT defaclrole::regrole AS creador, defaclnamespace::regnamespace AS esquema, defaclobjtype AS tipo, defaclacl
FROM pg_default_acl ORDER BY 1, 2, 3;
```

Esperado: para `postgres`, esquema `public`, tipo `r` (tablas), la ACL **no** nombra `anon=` ni `authenticated=` (puede nombrar `service_role`). Pueden aparecer filas de `supabase_admin` que sí las nombren: la migración de endurecimiento declara que no puede cambiarlas.

**E-07 · Ninguna función de `public` es ejecutable por `anon`.** Esperado: **0 filas** (si hubiera, que no sean de DentiHub: p. ej. una extensión instalada en `public`).

```sql
SELECT p.oid::regprocedure
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f' AND has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY 1;
```

**E-08 · Funciones ejecutables por `authenticated`.** Esperado **exactamente** estas 21 (las de trigger e internas no deben aparecer; `generate_recurring_tasks` es solo de `service_role`):

```sql
SELECT p.oid::regprocedure
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f' AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
ORDER BY p.oid::regprocedure::text;
```

`admin_assign_member(uuid,app_role,uuid,uuid[])`, `admin_list_unassigned_accounts()`, `admin_set_active(uuid,boolean)`, `auth_org()`, `auth_role()`, `cancel_task(uuid,text)`, `complete_task(uuid)`, `create_form_template(text,jsonb)`, `evidence_allowed_mime_types()`, `evidence_max_per_task()`, `evidence_min_bytes()`, `evidence_object_count(uuid,uuid)`, `evidence_path_org_id(text)`, `evidence_path_task_id(text)`, `form_schema_is_valid(jsonb)`, `has_role(app_role)`, `is_admin()`, `is_manager()`, `register_evidence(uuid,text,uuid)`, `save_task_progress(uuid,jsonb)`, `step_is_answered(jsonb,jsonb)`.

**E-09 · Toda función `SECURITY DEFINER` fija `search_path`.** Esperado: **0 filas**.

```sql
SELECT p.oid::regprocedure
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
  AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) AS c WHERE c LIKE 'search_path=%');
```

**E-10 · Triggers de auditoría.** Esperado: **9 filas** (areas, form_templates, organizations, profiles, task_definitions, task_evidence, tasks, user_areas, user_roles).

```sql
SELECT c.relname
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
WHERE t.tgfoid = 'public.audit_trigger()'::regprocedure AND NOT t.tgisinternal
ORDER BY 1;
```

**E-11 · Dónde guarda `register_evidence` sus supuestos de Storage (NO VERIFICADO).** El rol que aplica las migraciones debe saltarse la RLS de `storage.objects` (`register_evidence` y `evidence_object_count` leen esa tabla como propietario). Esperado: `postgres` con `rolbypassrls = true`. Si es `false`, **detente**: el tope de objetos por tarea (3.9) quedaría sin efecto.

```sql
SELECT rolname, rolbypassrls, rolsuper FROM pg_roles WHERE rolname IN ('postgres', 'service_role');
```

---

### 3.1 Funciones auxiliares por persona

**F-01 · `auth_org()`, `auth_role()`, `is_manager()`, `is_admin()`** para cada persona (y sin sesión). Una cuenta desactivada, sin organización o sin rol es «sin acceso» (fail-closed).

```sql
BEGIN;
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
SELECT pruebas.debe_ser($q$SELECT format('%s|%s|%s|%s', COALESCE(public.auth_org()::text,'-'), COALESCE(public.auth_role()::text,'-'), public.is_manager(), public.is_admin())$q$,
  'a1a1a1a1-0000-4000-8000-000000000001|admin|true|true');                      -- ADMIN_A

SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SELECT pruebas.debe_ser($q$SELECT format('%s|%s|%s|%s', COALESCE(public.auth_org()::text,'-'), COALESCE(public.auth_role()::text,'-'), public.is_manager(), public.is_admin())$q$,
  'a1a1a1a1-0000-4000-8000-000000000001|gestor|true|false');                    -- GESTOR_A

SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SELECT pruebas.debe_ser($q$SELECT format('%s|%s|%s|%s', COALESCE(public.auth_org()::text,'-'), COALESCE(public.auth_role()::text,'-'), public.is_manager(), public.is_admin())$q$,
  'a1a1a1a1-0000-4000-8000-000000000001|tecnico|false|false');                  -- TEC_A1

SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
SELECT pruebas.debe_ser($q$SELECT format('%s|%s|%s|%s', COALESCE(public.auth_org()::text,'-'), COALESCE(public.auth_role()::text,'-'), public.is_manager(), public.is_admin())$q$,
  '-|-|false|false');                                                           -- SIN_ORG

SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
SELECT pruebas.debe_ser($q$SELECT format('%s|%s|%s|%s', COALESCE(public.auth_org()::text,'-'), COALESCE(public.auth_role()::text,'-'), public.is_manager(), public.is_admin())$q$,
  'a1a1a1a1-0000-4000-8000-000000000001|-|false|false');                        -- SIN_ROL: tiene organización pero no rol

SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
SELECT pruebas.debe_ser($q$SELECT format('%s|%s|%s|%s', COALESCE(public.auth_org()::text,'-'), COALESCE(public.auth_role()::text,'-'), public.is_manager(), public.is_admin())$q$,
  '-|-|false|false');                                                           -- DESACT: con rol, pero inactiva

SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal2"}', true);
SELECT pruebas.debe_ser($q$SELECT format('%s|%s|%s|%s', COALESCE(public.auth_org()::text,'-'), COALESCE(public.auth_role()::text,'-'), public.is_manager(), public.is_admin())$q$,
  'b1b1b1b1-0000-4000-8000-000000000001|admin|true|true');                      -- ADMIN_B

SELECT set_config('request.jwt.claims', '', true);                              -- sin sesión
SELECT pruebas.debe_ser($q$SELECT format('%s|%s|%s|%s', COALESCE(public.auth_org()::text,'-'), COALESCE(public.auth_role()::text,'-'), public.is_manager(), public.is_admin())$q$,
  '-|-|false|false');
ROLLBACK;
```

**F-02 · `anon` no puede llamar a funciones de la app.** Esperado: `42501`, `permission denied for function`.

```sql
BEGIN;
SET LOCAL ROLE anon;
SELECT pruebas.debe_fallar($q$SELECT public.auth_org()$q$, '42501', 'permission denied for function');
SELECT pruebas.debe_fallar($q$SELECT public.complete_task('f0000000-0000-4000-8000-000000000001')$q$, '42501', 'permission denied for function');
SELECT pruebas.debe_fallar($q$SELECT public.admin_list_unassigned_accounts()$q$, '42501', 'permission denied for function');
SELECT pruebas.debe_fallar($q$SELECT public.evidence_min_bytes()$q$, '42501', 'permission denied for function');
SELECT pruebas.debe_fallar($q$SELECT public.form_schema_is_valid('{}'::jsonb)$q$, '42501', 'permission denied for function');
SELECT pruebas.debe_fallar($q$SELECT * FROM public.tasks$q$, '42501', 'permission denied for table');
ROLLBACK;
```

---

### 3.2 Visibilidad: qué ve cada persona

**V-01 · Conteos por persona.** Una sola sonda por persona (misma consulta, distinto UID). Cuenta lo que cada una ve en cada tabla; la auditoría se prueba aparte (3.11).

Sonda:

```sql
SELECT format('tasks=%s areas=%s orgs=%s roles=%s user_areas=%s templates=%s evidence=%s profiles=%s',
  (SELECT count(*) FROM public.tasks), (SELECT count(*) FROM public.areas),
  (SELECT count(*) FROM public.organizations), (SELECT count(*) FROM public.user_roles),
  (SELECT count(*) FROM public.user_areas), (SELECT count(*) FROM public.form_templates),
  (SELECT count(*) FROM public.task_evidence), (SELECT count(*) FROM public.profiles))
```

Esperado (con los datos de la sección 2 recién cargados):

| Persona | Esperado |
|---|---|
| ADMIN_A y GESTOR_A | `tasks=5 areas=2 orgs=1 roles=5 user_areas=2 templates=3 evidence=0 profiles=6` |
| TEC_A1 | `tasks=2 areas=2 orgs=1 roles=1 user_areas=1 templates=2 evidence=0 profiles=1` |
| TEC_A2 | `tasks=1 areas=2 orgs=1 roles=1 user_areas=1 templates=1 evidence=0 profiles=1` |
| ADMIN_B | `tasks=1 areas=1 orgs=1 roles=2 user_areas=1 templates=1 evidence=0 profiles=2` |
| TEC_B1 | `tasks=1 areas=1 orgs=1 roles=1 user_areas=1 templates=1 evidence=0 profiles=1` |
| SIN_ORG | `tasks=0 areas=0 orgs=0 roles=0 user_areas=0 templates=0 evidence=0 profiles=1` |
| SIN_ROL | `tasks=0 areas=0 orgs=0 roles=0 user_areas=0 templates=0 evidence=0 profiles=1` |
| DESACT | `tasks=0 areas=0 orgs=0 roles=0 user_areas=0 templates=0 evidence=0 profiles=1` |

Notas de lectura:
- `profiles=6` para el administrador y el gestor de A: no incluye a SIN_ORG (su `org_id` es `NULL`, así que la política de gestión no la alcanza; para eso existe `admin_list_unassigned_accounts()`).
- SIN_ORG, SIN_ROL y DESACT **no leen nada salvo su propio perfil** (`profiles=1`): la política `profiles_select_self` es la única que no exige organización ni rol, a propósito, para que la interfaz pueda explicarles «cuenta desactivada» o «sin organización».
- TEC_A1 y TEC_A2 ven las 2 áreas de su organización (los nombres de área no son sensibles) pero solo sus tareas.

Bloque completo para dos de ellas; las demás son iguales cambiando el UID y el esperado:

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
SELECT pruebas.debe_ser($q$SELECT format('tasks=%s areas=%s orgs=%s roles=%s user_areas=%s templates=%s evidence=%s profiles=%s',
  (SELECT count(*) FROM public.tasks), (SELECT count(*) FROM public.areas), (SELECT count(*) FROM public.organizations),
  (SELECT count(*) FROM public.user_roles), (SELECT count(*) FROM public.user_areas), (SELECT count(*) FROM public.form_templates),
  (SELECT count(*) FROM public.task_evidence), (SELECT count(*) FROM public.profiles))$q$,
  'tasks=2 areas=2 orgs=1 roles=1 user_areas=1 templates=2 evidence=0 profiles=1');

SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000007","role":"authenticated"}', true);   -- DESACT
SELECT pruebas.debe_ser($q$SELECT format('tasks=%s areas=%s orgs=%s roles=%s user_areas=%s templates=%s evidence=%s profiles=%s',
  (SELECT count(*) FROM public.tasks), (SELECT count(*) FROM public.areas), (SELECT count(*) FROM public.organizations),
  (SELECT count(*) FROM public.user_roles), (SELECT count(*) FROM public.user_areas), (SELECT count(*) FROM public.form_templates),
  (SELECT count(*) FROM public.task_evidence), (SELECT count(*) FROM public.profiles))$q$,
  'tasks=0 areas=0 orgs=0 roles=0 user_areas=0 templates=0 evidence=0 profiles=1');
ROLLBACK;
```

**V-02 · El técnico no ve tareas ajenas, de otra organización ni sin asignar** (por id). Esperado: `0` en cada una.

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.tasks WHERE id = 'f0000000-0000-4000-8000-000000000003'$q$, '0');  -- T_AJENA (de TEC_A2)
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.tasks WHERE id = 'f0000000-0000-4000-8000-000000000004'$q$, '0');  -- T_SIN_ASIGNAR
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.tasks WHERE id = 'f0000000-0000-4000-8000-000000000011'$q$, '0');  -- T_B (otra organización)
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.tasks WHERE id = 'f0000000-0000-4000-8000-000000000001'$q$, '1');  -- T_FOTO (propia)
-- Perfiles ajenos y de otra organización: no se ven.
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.profiles WHERE id <> 'c0000000-0000-4000-8000-000000000003'$q$, '0');
ROLLBACK;
```

**V-03 · Técnico de otra organización (TEC_B1) y administrador de otra organización (ADMIN_B).** Esperado: ninguno ve nada de la organización A.

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000013","role":"authenticated"}', true);   -- TEC_B1
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.tasks WHERE org_id = 'a1a1a1a1-0000-4000-8000-000000000001'$q$, '0');
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.areas WHERE org_id = 'a1a1a1a1-0000-4000-8000-000000000001'$q$, '0');
SELECT pruebas.debe_fallar($q$SELECT public.complete_task('f0000000-0000-4000-8000-000000000001')$q$, '42501', 'no está asignada a ti');
SELECT pruebas.debe_fallar($q$SELECT public.save_task_progress('f0000000-0000-4000-8000-000000000001', '{}'::jsonb)$q$, '42501', 'no está asignada a ti');

SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal2"}', true);   -- ADMIN_B
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.tasks WHERE org_id = 'a1a1a1a1-0000-4000-8000-000000000001'$q$, '0');
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.profiles WHERE org_id = 'a1a1a1a1-0000-4000-8000-000000000001'$q$, '0');
SELECT pruebas.debe_fallar($q$SELECT public.cancel_task('f0000000-0000-4000-8000-000000000001')$q$, '42501', 'La tarea no existe');
SELECT pruebas.debe_afectar($q$UPDATE public.tasks SET title = 'x' WHERE id = 'f0000000-0000-4000-8000-000000000001'$q$, 0);
ROLLBACK;
```

---

### 3.3 Escrituras directas sobre `tasks` y UPDATE de `status`

**W-01 · El técnico no puede crear ni editar tareas.**

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
-- INSERT: tiene el privilegio de columnas, pero no hay política de INSERT para él.
SELECT pruebas.debe_fallar($q$INSERT INTO public.tasks (title, template_id, assignee_id)
  VALUES ('x', 'e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000003')$q$, '42501', 'row-level security');
-- UPDATE de título: SIN error y SIN efecto (0 filas), porque no hay política de UPDATE para el técnico.
SELECT pruebas.debe_afectar($q$UPDATE public.tasks SET title = 'hack' WHERE id = 'f0000000-0000-4000-8000-000000000001'$q$, 0);
SELECT pruebas.debe_afectar($q$UPDATE public.tasks SET title = 'hack' WHERE id = 'f0000000-0000-4000-8000-000000000003'$q$, 0);  -- ajena
ROLLBACK;
```

**W-02 · UPDATE directo de `status`, `answers`, `completed_*` (por la API).** Esperado: **`42501`, «permission denied»** para técnico, gestor y administrador. **No** sale el mensaje del trigger de guarda: el privilegio por columna se revisa antes de ejecutar triggers. El texto exacto depende de la versión de Postgres (`permission denied for table tasks` en versiones antiguas; `permission denied for column "status" of relation "tasks"` en las recientes): la prueba compara solo `permission denied`.

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
SELECT pruebas.debe_fallar($q$UPDATE public.tasks SET status = 'completada' WHERE id = 'f0000000-0000-4000-8000-000000000002'$q$, '42501', 'permission denied');
SELECT pruebas.debe_fallar($q$UPDATE public.tasks SET answers = '{"limpieza": true}' WHERE id = 'f0000000-0000-4000-8000-000000000002'$q$, '42501', 'permission denied');
SELECT pruebas.debe_fallar($q$UPDATE public.tasks SET completed_at = now() WHERE id = 'f0000000-0000-4000-8000-000000000002'$q$, '42501', 'permission denied');
SELECT pruebas.debe_fallar($q$UPDATE public.tasks SET completed_by = 'c0000000-0000-4000-8000-000000000003' WHERE id = 'f0000000-0000-4000-8000-000000000002'$q$, '42501', 'permission denied');

SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);   -- GESTOR_A
SELECT pruebas.debe_fallar($q$UPDATE public.tasks SET status = 'completada' WHERE id = 'f0000000-0000-4000-8000-000000000002'$q$, '42501', 'permission denied');
SELECT pruebas.debe_fallar($q$UPDATE public.tasks SET status = 'cancelada' WHERE id = 'f0000000-0000-4000-8000-000000000002'$q$, '42501', 'permission denied');
SELECT pruebas.debe_fallar($q$INSERT INTO public.tasks (title, template_id, status)
  VALUES ('x', 'e0000000-0000-4000-8000-000000000002', 'completada')$q$, '42501', 'permission denied');

SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);   -- ADMIN_A
SELECT pruebas.debe_fallar($q$UPDATE public.tasks SET status = 'completada' WHERE id = 'f0000000-0000-4000-8000-000000000002'$q$, '42501', 'permission denied');
ROLLBACK;
```

**W-03 · Segunda capa (trigger `tasks_guard_columns`), simulando un GRANT demasiado amplio.** Se concede `UPDATE (status)` **solo dentro de la transacción** (se deshace con `ROLLBACK`). Esperado: el gestor pasa la RLS y la regla de transición (de `pendiente` a `en_progreso` es válida), y el trigger de guarda lo frena con su mensaje en español. Se usa `en_progreso` y no `completada` porque `tasks_enforce_rules` corre **antes** (orden alfabético de triggers) y para `completada` fallaría antes por la regla de completitud.

```sql
BEGIN;
GRANT UPDATE (status) ON public.tasks TO authenticated;     -- solo en esta transacción
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);   -- GESTOR_A
SELECT pruebas.debe_fallar($q$UPDATE public.tasks SET status = 'en_progreso' WHERE id = 'f0000000-0000-4000-8000-000000000002'$q$,
  '42501', 'solo se cambian con las funciones de tareas');
ROLLBACK;
```

**W-04 · El gestor sí edita título, asignado y vencimiento de tareas abiertas de su organización, y crea tareas.**

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);   -- GESTOR_A
SELECT pruebas.debe_afectar($q$UPDATE public.tasks SET title = 'Editada por gestor' WHERE id = 'f0000000-0000-4000-8000-000000000001'$q$, 1);
SELECT pruebas.debe_afectar($q$UPDATE public.tasks SET assignee_id = 'c0000000-0000-4000-8000-000000000004' WHERE id = 'f0000000-0000-4000-8000-000000000001'$q$, 1);
SELECT pruebas.debe_afectar($q$UPDATE public.tasks SET title = 'x' WHERE id = 'f0000000-0000-4000-8000-000000000011'$q$, 0);   -- T_B: otra organización
-- Crear: org_id y created_by salen de los DEFAULT (auth_org() y auth.uid()) con sesión simulada.
SELECT pruebas.debe_afectar($q$INSERT INTO public.tasks (title, template_id, assignee_id)
  VALUES ('Tarea creada por gestor', 'e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000004')$q$, 1);
SELECT pruebas.debe_ser($q$SELECT status::text || '|' || (org_id = 'a1a1a1a1-0000-4000-8000-000000000001')::text || '|' || (created_by = 'c0000000-0000-4000-8000-000000000002')::text
  FROM public.tasks WHERE title = 'Tarea creada por gestor'$q$, 'pendiente|true|true');
ROLLBACK;
```

**W-05 · Referencias inválidas al crear una tarea.** Esperado: `P0001` (las valida un trigger `BEFORE`, antes que las claves foráneas).

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);   -- GESTOR_A
-- asignada a una persona de otra organización
SELECT pruebas.debe_fallar($q$INSERT INTO public.tasks (title, template_id, assignee_id)
  VALUES ('x', 'e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000013')$q$, 'P0001', 'miembro activo de la organización');
-- asignada a una cuenta desactivada
SELECT pruebas.debe_fallar($q$INSERT INTO public.tasks (title, template_id, assignee_id)
  VALUES ('x', 'e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000007')$q$, 'P0001', 'miembro activo de la organización');
-- asignada a una persona con organización pero sin rol
SELECT pruebas.debe_fallar($q$INSERT INTO public.tasks (title, template_id, assignee_id)
  VALUES ('x', 'e0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000006')$q$, 'P0001', 'miembro activo de la organización');
-- plantilla de otra organización
SELECT pruebas.debe_fallar($q$INSERT INTO public.tasks (title, template_id)
  VALUES ('x', 'e0000000-0000-4000-8000-000000000011')$q$, 'P0001', 'La plantilla no está disponible');
-- plantilla inactiva
SELECT pruebas.debe_fallar($q$INSERT INTO public.tasks (title, template_id)
  VALUES ('x', 'e0000000-0000-4000-8000-000000000003')$q$, 'P0001', 'La plantilla no está disponible');
-- área de otra organización
SELECT pruebas.debe_fallar($q$INSERT INTO public.tasks (title, template_id, area_id)
  VALUES ('x', 'e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000011')$q$, 'P0001', 'El área no está disponible');
ROLLBACK;
```

---

### 3.4 Completar sin foto y sin pasos

**C-01 · Flujo del técnico sobre T_FOTO (exige paso `limpieza` y 1 foto).**

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1

-- Sin pasos y sin foto: faltan las dos cosas.
SELECT pruebas.debe_fallar($q$SELECT public.complete_task('f0000000-0000-4000-8000-000000000001')$q$, '23514', 'Faltan pasos obligatorios por responder: Limpieza hecha.');
SELECT pruebas.debe_fallar($q$SELECT public.complete_task('f0000000-0000-4000-8000-000000000001')$q$, '23514', 'Falta la foto de evidencia (se exige 1, hay 0)');

-- Guardar el paso: la tarea pasa a en_progreso.
SELECT pruebas.debe_ser($q$SELECT (public.save_task_progress('f0000000-0000-4000-8000-000000000001', '{"limpieza": true}'::jsonb)).status::text$q$, 'en_progreso');

-- Con el paso pero sin foto: sigue fallando, ahora solo por la foto.
SELECT pruebas.debe_fallar($q$SELECT public.complete_task('f0000000-0000-4000-8000-000000000001')$q$, '23514', 'Falta la foto de evidencia (se exige 1, hay 0)');
ROLLBACK;
```

**C-02 · Tarea sin foto (T_SIN_FOTO): sin pasos falla, con pasos cierra.**

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
SELECT pruebas.debe_fallar($q$SELECT public.complete_task('f0000000-0000-4000-8000-000000000002')$q$, '23514', 'Faltan pasos obligatorios por responder: Limpieza hecha.');
-- Un «no» en un paso de tipo check NO cuenta como respondido.
SELECT public.save_task_progress('f0000000-0000-4000-8000-000000000002', '{"limpieza": false}'::jsonb);
SELECT pruebas.debe_fallar($q$SELECT public.complete_task('f0000000-0000-4000-8000-000000000002')$q$, '23514', 'Faltan pasos obligatorios por responder');
SELECT public.save_task_progress('f0000000-0000-4000-8000-000000000002', '{"limpieza": true}'::jsonb);
SELECT pruebas.debe_ser($q$SELECT (public.complete_task('f0000000-0000-4000-8000-000000000002')).status::text$q$, 'completada');
SELECT pruebas.debe_ser($q$SELECT (completed_by = 'c0000000-0000-4000-8000-000000000003')::text FROM public.tasks WHERE id = 'f0000000-0000-4000-8000-000000000002'$q$, 'true');
-- Cerrada: no se guarda más, no se completa otra vez.
SELECT pruebas.debe_fallar($q$SELECT public.save_task_progress('f0000000-0000-4000-8000-000000000002', '{"limpieza": true}'::jsonb)$q$, 'P0001', 'La tarea ya está cerrada (completada)');
SELECT pruebas.debe_fallar($q$SELECT public.complete_task('f0000000-0000-4000-8000-000000000002')$q$, 'P0001', 'La tarea ya está cerrada');
ROLLBACK;
```

**C-03 · Validación de las respuestas.**

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
SELECT pruebas.debe_fallar($q$SELECT public.save_task_progress('f0000000-0000-4000-8000-000000000002', '{"foo": true}'::jsonb)$q$, 'P0001', 'pasos que la plantilla no tiene: foo');
SELECT pruebas.debe_fallar($q$SELECT public.save_task_progress('f0000000-0000-4000-8000-000000000002', '{"limpieza": {"a": 1}}'::jsonb)$q$, 'P0001', 'Cada respuesta debe ser un texto');
SELECT pruebas.debe_fallar($q$SELECT public.save_task_progress('f0000000-0000-4000-8000-000000000002', '[1,2]'::jsonb)$q$, 'P0001', 'hasta 32 KB');
-- Tope de 32 KB (antes 100 KB): una respuesta de 40.000 caracteres se rechaza por tamaño.
SELECT pruebas.debe_fallar($q$SELECT public.save_task_progress('f0000000-0000-4000-8000-000000000002', jsonb_build_object('limpieza', repeat('x', 40000)))$q$, 'P0001', 'hasta 32 KB');
-- Un texto de 2.001 caracteres (bajo 32 KB) se rechaza por la regla de 2.000 por respuesta.
SELECT pruebas.debe_fallar($q$SELECT public.save_task_progress('f0000000-0000-4000-8000-000000000002', jsonb_build_object('limpieza', repeat('x', 2001)))$q$, 'P0001', 'hasta 2000 caracteres');
ROLLBACK;
```

(El tope sobre las respuestas ya mezcladas, `Las respuestas guardadas de la tarea no pueden pasar de 32 KB en total`, exige una plantilla con muchos pasos de texto; si quieres probarlo, publica una con 20 pasos `text` y responde 17 de 2.000 caracteres seguidos.)

**C-04 · Barrera final.** El trigger impide cerrar sin foto o sin pasos aunque se salte la API (propietario y `service_role`). Esperado: `23514`, «No se puede completar la tarea».

```sql
BEGIN;
-- Como propietario: ni con respuestas completas se cierra sin foto.
SELECT pruebas.debe_fallar($q$UPDATE public.tasks SET status = 'completada', completed_at = now(),
    completed_by = 'c0000000-0000-4000-8000-000000000003', answers = '{"limpieza": true}'
  WHERE id = 'f0000000-0000-4000-8000-000000000001'$q$, '23514', 'Falta la foto de evidencia');
-- Como propietario: ni sin pasos en una plantilla sin foto.
SELECT pruebas.debe_fallar($q$UPDATE public.tasks SET status = 'completada', completed_at = now(),
    completed_by = 'c0000000-0000-4000-8000-000000000003'
  WHERE id = 'f0000000-0000-4000-8000-000000000002'$q$, '23514', 'Faltan pasos obligatorios');
-- Una tarea nueva no puede nacer cerrada.
SELECT pruebas.debe_fallar($q$INSERT INTO public.tasks (org_id, template_id, title, assignee_id, created_by, status, completed_at, completed_by)
  VALUES ('a1a1a1a1-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'x',
          'c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'completada', now(),
          'c0000000-0000-4000-8000-000000000003')$q$, 'P0001', 'Una tarea nueva debe crearse en estado pendiente');
-- Como service_role: mismo resultado.
SET LOCAL ROLE service_role;
SELECT pruebas.debe_fallar($q$UPDATE public.tasks SET status = 'completada', completed_at = now(),
    completed_by = 'c0000000-0000-4000-8000-000000000003'
  WHERE id = 'f0000000-0000-4000-8000-000000000002'$q$, '23514', 'No se puede completar la tarea');
ROLLBACK;
```

**C-05 · Una tarea cerrada no se reabre ni siquiera como propietario.**

```sql
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- función SECURITY DEFINER «como TEC_A1»
SELECT public.save_task_progress('f0000000-0000-4000-8000-000000000002', '{"limpieza": true}'::jsonb);
SELECT public.complete_task('f0000000-0000-4000-8000-000000000002');
SELECT set_config('request.jwt.claims', '', true);
SELECT pruebas.debe_fallar($q$UPDATE public.tasks SET status = 'pendiente', completed_at = NULL, completed_by = NULL
  WHERE id = 'f0000000-0000-4000-8000-000000000002'$q$, 'P0001', 'La tarea ya está cerrada (completada)');
SELECT pruebas.debe_fallar($q$UPDATE public.tasks SET answers = '{}' WHERE id = 'f0000000-0000-4000-8000-000000000002'$q$, 'P0001', 'La tarea ya está cerrada');
ROLLBACK;
```

**C-06 · Cancelar.** Solo administrador o gestor; el técnico no.

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
SELECT pruebas.debe_fallar($q$SELECT public.cancel_task('f0000000-0000-4000-8000-000000000001')$q$, '42501', 'Solo administradores y gestores pueden cancelar tareas');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);   -- GESTOR_A
SELECT pruebas.debe_ser($q$SELECT (public.cancel_task('f0000000-0000-4000-8000-000000000001', 'Prueba')).status::text$q$, 'cancelada');
SELECT pruebas.debe_fallar($q$SELECT public.cancel_task('f0000000-0000-4000-8000-000000000001')$q$, 'P0001', 'La tarea ya está cerrada (cancelada)');
-- Una tarea cancelada tampoco se edita por la vía directa (la política exige estado abierto): 0 filas.
SELECT pruebas.debe_afectar($q$UPDATE public.tasks SET title = 'x' WHERE id = 'f0000000-0000-4000-8000-000000000001'$q$, 0);
ROLLBACK;
```

**C-07 · Persona ajena o sin acceso intentando operar.** Esperado: error genérico, sin revelar si la tarea existe.

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
SELECT pruebas.debe_fallar($q$SELECT public.save_task_progress('f0000000-0000-4000-8000-000000000003', '{}'::jsonb)$q$, '42501', 'La tarea no existe o no está asignada a ti');  -- T_AJENA
SELECT pruebas.debe_fallar($q$SELECT public.complete_task('f0000000-0000-4000-8000-000000000003')$q$, '42501', 'La tarea no existe o no está asignada a ti');
SELECT pruebas.debe_fallar($q$SELECT public.complete_task('f0000000-0000-4000-8000-000000000011')$q$, '42501', 'La tarea no existe o no está asignada a ti');  -- T_B
SELECT pruebas.debe_fallar($q$SELECT public.complete_task('f0000000-0000-4000-8000-0000000000ff')$q$, '42501', 'La tarea no existe o no está asignada a ti');  -- no existe: mismo mensaje

-- Sin organización, sin rol o desactivada: «No tienes acceso a esta operación».
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000005","role":"authenticated"}', true);   -- SIN_ORG
SELECT pruebas.debe_fallar($q$SELECT public.complete_task('f0000000-0000-4000-8000-000000000001')$q$, '42501', 'No tienes acceso a esta operación');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000006","role":"authenticated"}', true);   -- SIN_ROL
SELECT pruebas.debe_fallar($q$SELECT public.complete_task('f0000000-0000-4000-8000-000000000001')$q$, '42501', 'No tienes acceso a esta operación');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000007","role":"authenticated"}', true);   -- DESACT
SELECT pruebas.debe_fallar($q$SELECT public.complete_task('f0000000-0000-4000-8000-000000000005')$q$, '42501', 'No tienes acceso a esta operación');
SELECT pruebas.debe_fallar($q$SELECT public.save_task_progress('f0000000-0000-4000-8000-000000000005', '{}'::jsonb)$q$, '42501', 'No tienes acceso a esta operación');
SELECT pruebas.debe_fallar($q$SELECT public.register_evidence('f0000000-0000-4000-8000-000000000005',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000005/0b000000-0000-4000-8000-000000000001.jpg',
  'c1000000-0000-4000-8000-000000000001')$q$, '42501', 'No tienes acceso a esta operación');
ROLLBACK;
```

---

### 3.5 Foto falsificada (`register_evidence`)

`register_evidence` exige un objeto **real** en `storage.objects` (bucket `evidence`, misma ruta) con `metadata` que cumpla: tamaño >= `evidence_min_bytes()` (10240), `mimetype` dentro de `evidence_allowed_mime_types()` y `eTag` no repetido entre las evidencias de la misma tarea. Aquí los objetos se **simulan** con `INSERT` en `storage.objects` (como propietario, dentro de una transacción que se deshace). **(NO VERIFICADO)** que `postgres` pueda insertar en `storage.objects` en tu proyecto y que no se necesiten otras columnas; si falla, usa la prueba por API (3.10), que sube archivos de verdad.

Claves de `metadata` que se asumen: `size`, `mimetype`, `eTag` (ver 3.10, paso A-02, para comprobarlas con un archivo real).

**P-01 · Matriz de fotos falsificadas.**

```sql
BEGIN;
-- Objetos simulados (propietario). Rutas bajo T_FOTO salvo el 09, que está bajo T_SIN_FOTO.
INSERT INTO storage.objects (bucket_id, name, metadata) VALUES
 ('evidence', 'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000001.jpg', '{"size": 50000, "mimetype": "image/jpeg", "eTag": "etag-1"}'),  -- válido
 ('evidence', 'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000002.jpg', '{"size": 1, "mimetype": "image/jpeg", "eTag": "etag-2"}'),      -- 1 byte
 ('evidence', 'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000003.jpg', '{"size": 50000, "mimetype": "text/html", "eTag": "etag-3"}'),    -- no es imagen
 ('evidence', 'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000004.jpg', '{"size": 60000, "mimetype": "image/jpeg", "eTag": "etag-1"}'),  -- mismo eTag que el 01
 ('evidence', 'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000005.jpg', '{"mimetype": "image/jpeg"}'),                                  -- sin size
 ('evidence', 'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000006.jpg', '{"size": 50000}'),                                           -- sin mimetype
 ('evidence', 'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000007.jpg', '{"size": 10240, "mimetype": "image/png", "eTag": "etag-7"}'),   -- justo el mínimo
 ('evidence', 'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000008.jpg', '{"size": 10239, "mimetype": "image/jpeg", "eTag": "etag-8"}'),  -- un byte bajo el mínimo
 ('evidence', 'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000002/0b000000-0000-4000-8000-000000000009.jpg', '{"size": 50000, "mimetype": "image/jpeg", "eTag": "etag-1"}');  -- mismo eTag, OTRA tarea

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1

-- Rechazos (todos P0001 salvo el duplicado, que es 23505):
SELECT pruebas.debe_fallar($q$SELECT public.register_evidence('f0000000-0000-4000-8000-000000000001',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000002.jpg', 'c1000000-0000-4000-8000-000000000002')$q$,
  'P0001', 'demasiado pequeño');                                  -- 1 byte
SELECT pruebas.debe_fallar($q$SELECT public.register_evidence('f0000000-0000-4000-8000-000000000001',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000008.jpg', 'c1000000-0000-4000-8000-000000000008')$q$,
  'P0001', 'demasiado pequeño');                                  -- 10239 bytes
SELECT pruebas.debe_fallar($q$SELECT public.register_evidence('f0000000-0000-4000-8000-000000000001',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000005.jpg', 'c1000000-0000-4000-8000-000000000005')$q$,
  'P0001', 'demasiado pequeño');                                  -- sin size: falla cerrado
SELECT pruebas.debe_fallar($q$SELECT public.register_evidence('f0000000-0000-4000-8000-000000000001',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000003.jpg', 'c1000000-0000-4000-8000-000000000003')$q$,
  'P0001', 'tipo de archivo no está permitido');                  -- text/html
SELECT pruebas.debe_fallar($q$SELECT public.register_evidence('f0000000-0000-4000-8000-000000000001',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000006.jpg', 'c1000000-0000-4000-8000-000000000006')$q$,
  'P0001', 'tipo de archivo no está permitido');                  -- sin mimetype: falla cerrado
SELECT pruebas.debe_fallar($q$SELECT public.register_evidence('f0000000-0000-4000-8000-000000000001',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000099.jpg', 'c1000000-0000-4000-8000-000000000099')$q$,
  'P0001', 'no existe en el almacenamiento');                     -- el objeto no existe
-- Ruta que no corresponde a la tarea, mayúscula en la extensión, otra organización:
SELECT pruebas.debe_fallar($q$SELECT public.register_evidence('f0000000-0000-4000-8000-000000000001',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000002/0b000000-0000-4000-8000-000000000009.jpg', 'c1000000-0000-4000-8000-000000000010')$q$,
  'P0001', 'La ruta del archivo debe ser');
SELECT pruebas.debe_fallar($q$SELECT public.register_evidence('f0000000-0000-4000-8000-000000000001',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000001.JPG', 'c1000000-0000-4000-8000-000000000011')$q$,
  'P0001', 'La ruta del archivo debe ser');
SELECT pruebas.debe_fallar($q$SELECT public.register_evidence('f0000000-0000-4000-8000-000000000001',
  'b1b1b1b1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000001.jpg', 'c1000000-0000-4000-8000-000000000012')$q$,
  'P0001', 'La ruta del archivo debe ser');

-- Aceptados: el borde exacto (10240) y el válido. La tarea pasa a en_progreso.
SELECT pruebas.debe_ser($q$SELECT (public.register_evidence('f0000000-0000-4000-8000-000000000001',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000007.jpg', 'c1000000-0000-4000-8000-000000000007')).uploaded_by::text$q$,
  'c0000000-0000-4000-8000-000000000003');
SELECT public.register_evidence('f0000000-0000-4000-8000-000000000001',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000001.jpg', 'c1000000-0000-4000-8000-000000000001');
SELECT pruebas.debe_ser($q$SELECT status::text FROM public.tasks WHERE id = 'f0000000-0000-4000-8000-000000000001'$q$, 'en_progreso');

-- Duplicado por eTag en la MISMA tarea (el 04 tiene el eTag del 01):
SELECT pruebas.debe_fallar($q$SELECT public.register_evidence('f0000000-0000-4000-8000-000000000001',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000004.jpg', 'c1000000-0000-4000-8000-000000000004')$q$,
  '23505', 'archivo repetido');
-- El mismo eTag en OTRA tarea de la misma persona sí se acepta:
SELECT public.register_evidence('f0000000-0000-4000-8000-000000000002',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000002/0b000000-0000-4000-8000-000000000009.jpg', 'c1000000-0000-4000-8000-000000000009');

-- Idempotencia: repetir con el mismo client_uuid devuelve la fila y NO agrega otra (siguen 2 en T_FOTO).
SELECT public.register_evidence('f0000000-0000-4000-8000-000000000001',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000001.jpg', 'c1000000-0000-4000-8000-000000000001');
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.task_evidence WHERE task_id = 'f0000000-0000-4000-8000-000000000001'$q$, '2');
-- Ese client_uuid en otra tarea: error.
SELECT pruebas.debe_fallar($q$SELECT public.register_evidence('f0000000-0000-4000-8000-000000000002',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000002/0b000000-0000-4000-8000-000000000009.jpg', 'c1000000-0000-4000-8000-000000000001')$q$,
  '23505', 'ya se usó en otra tarea');
-- El mismo archivo con un client_uuid nuevo: «ya está registrado».
SELECT pruebas.debe_fallar($q$SELECT public.register_evidence('f0000000-0000-4000-8000-000000000001',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000001.jpg', 'c1000000-0000-4000-8000-000000000013')$q$,
  '23505', 'ya está registrado como evidencia');

-- Solo el asignado registra evidencia (ni el gestor ni otro técnico):
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);   -- GESTOR_A
SELECT pruebas.debe_fallar($q$SELECT public.register_evidence('f0000000-0000-4000-8000-000000000001',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000001.jpg', 'c1000000-0000-4000-8000-000000000020')$q$,
  '42501', 'no está asignada a ti');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000004","role":"authenticated"}', true);   -- TEC_A2
SELECT pruebas.debe_fallar($q$SELECT public.register_evidence('f0000000-0000-4000-8000-000000000001',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000001.jpg', 'c1000000-0000-4000-8000-000000000021')$q$,
  '42501', 'no está asignada a ti');
ROLLBACK;
```

**P-02 · Con foto válida y paso respondido, la tarea con foto se cierra; luego ya no admite evidencia.**

```sql
BEGIN;
INSERT INTO storage.objects (bucket_id, name, metadata) VALUES
 ('evidence', 'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000001.jpg', '{"size": 50000, "mimetype": "image/jpeg", "eTag": "etag-1"}'),
 ('evidence', 'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000002.jpg', '{"size": 50000, "mimetype": "image/jpeg", "eTag": "etag-2"}');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
SELECT public.register_evidence('f0000000-0000-4000-8000-000000000001',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000001.jpg', 'c1000000-0000-4000-8000-000000000001');
SELECT public.save_task_progress('f0000000-0000-4000-8000-000000000001', '{"limpieza": true}'::jsonb);
SELECT pruebas.debe_ser($q$SELECT (public.complete_task('f0000000-0000-4000-8000-000000000001')).status::text$q$, 'completada');
SELECT pruebas.debe_fallar($q$SELECT public.register_evidence('f0000000-0000-4000-8000-000000000001',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000002.jpg', 'c1000000-0000-4000-8000-000000000002')$q$,
  'P0001', 'La tarea ya está cerrada (completada)');
ROLLBACK;
```

**P-03 · Tope de 20 fotos registradas por tarea.** Esperado: las 20 primeras se registran; la 21.ª falla con «Una tarea admite hasta 20 fotos de evidencia.»

```sql
BEGIN;
INSERT INTO storage.objects (bucket_id, name, metadata)
SELECT 'evidence',
       'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000002/' || md5('obj' || g)::uuid || '.jpg',
       '{"size": 50000, "mimetype": "image/jpeg"}'::jsonb
FROM generate_series(1, 21) AS g;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
DO $$
BEGIN
  FOR i IN 1..20 LOOP
    PERFORM public.register_evidence('f0000000-0000-4000-8000-000000000002',
      'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000002/' || md5('obj' || i)::uuid || '.jpg',
      md5('cli' || i)::uuid);
  END LOOP;
END
$$;
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.task_evidence WHERE task_id = 'f0000000-0000-4000-8000-000000000002'$q$, '20');
SELECT pruebas.debe_fallar($q$SELECT public.register_evidence('f0000000-0000-4000-8000-000000000002',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000002/' || md5('obj' || 21)::uuid || '.jpg', md5('cli' || 21)::uuid)$q$,
  'P0001', 'hasta 20 fotos');
ROLLBACK;
```

**P-04 · Evidencia: solo lectura por la API.** Esperado: sin privilegio de escritura.

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
SELECT pruebas.debe_fallar($q$INSERT INTO public.task_evidence (org_id, task_id, storage_path, client_uuid, uploaded_by)
  VALUES ('a1a1a1a1-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
   'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000001.jpg',
   'c1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003')$q$, '42501', 'permission denied');
SELECT pruebas.debe_fallar($q$UPDATE public.task_evidence SET storage_path = storage_path$q$, '42501', 'permission denied');
SELECT pruebas.debe_fallar($q$DELETE FROM public.task_evidence$q$, '42501', 'permission denied');
ROLLBACK;
```

---

### 3.6 Funciones de administración de miembros

Recuerda: **desde el SQL Editor (propietario) estas funciones fallan** porque `auth.uid()` es `NULL`. Hay que simular el JWT del administrador.

**M-00 · Sin sesión, falla (propietario sin `set_config`).**

```sql
BEGIN;
SELECT pruebas.debe_fallar($q$SELECT public.admin_assign_member('c0000000-0000-4000-8000-000000000005', 'tecnico', 'a1a1a1a1-0000-4000-8000-000000000001')$q$, '42501', 'Solo una persona administradora');
SELECT pruebas.debe_fallar($q$SELECT public.admin_set_active('c0000000-0000-4000-8000-000000000003', false)$q$, '42501', 'Solo una persona administradora');
SELECT pruebas.debe_fallar($q$SELECT * FROM public.admin_list_unassigned_accounts()$q$, '42501', 'Solo una persona administradora');
ROLLBACK;
```

**M-01 · `admin_list_unassigned_accounts()`.** Esperado: el administrador activo ve `sin_org@example.test` (cuenta activa sin organización); no ve a SIN_ROL (tiene organización) ni a DESACT. Nadie más puede llamarla.

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);   -- ADMIN_A
SELECT pruebas.debe_ser($q$SELECT string_agg(email, ',' ORDER BY email) FROM public.admin_list_unassigned_accounts() WHERE email LIKE '%@example.test'$q$, 'sin_org@example.test');
-- Devuelve exactamente id, email y created_at (una fila con tres columnas):
SELECT id, email, created_at FROM public.admin_list_unassigned_accounts() WHERE email = 'sin_org@example.test';
-- Los demás no pueden:
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);   -- GESTOR_A
SELECT pruebas.debe_fallar($q$SELECT * FROM public.admin_list_unassigned_accounts()$q$, '42501', 'Solo una persona administradora');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
SELECT pruebas.debe_fallar($q$SELECT * FROM public.admin_list_unassigned_accounts()$q$, '42501', 'Solo una persona administradora');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000005","role":"authenticated"}', true);   -- SIN_ORG
SELECT pruebas.debe_fallar($q$SELECT * FROM public.admin_list_unassigned_accounts()$q$, '42501', 'Solo una persona administradora');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000006","role":"authenticated"}', true);   -- SIN_ROL
SELECT pruebas.debe_fallar($q$SELECT * FROM public.admin_list_unassigned_accounts()$q$, '42501', 'Solo una persona administradora');
SELECT set_config('request.jwt.claims', '', true);                                                                         -- sin sesión
SELECT pruebas.debe_fallar($q$SELECT * FROM public.admin_list_unassigned_accounts()$q$, '42501', 'Solo una persona administradora');
ROLLBACK;
```

**M-02 · Un administrador desactivado ya no puede listar, y una cuenta desactivada sin organización no aparece.**

```sql
BEGIN;
UPDATE public.profiles SET active = false WHERE id = 'c0000000-0000-4000-8000-000000000001';   -- propietario: desactiva a ADMIN_A
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
SELECT pruebas.debe_fallar($q$SELECT * FROM public.admin_list_unassigned_accounts()$q$, '42501', 'Solo una persona administradora');
ROLLBACK;

BEGIN;
UPDATE public.profiles SET active = false WHERE id = 'c0000000-0000-4000-8000-000000000005';   -- desactiva a SIN_ORG
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);   -- ADMIN_A
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.admin_list_unassigned_accounts() WHERE email = 'sin_org@example.test'$q$, '0');
ROLLBACK;
```

**M-03 · `admin_assign_member` (alta, cambio y errores).**

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);   -- ADMIN_A

-- Alta de SIN_ORG como técnico, con el área A1.
SELECT public.admin_assign_member('c0000000-0000-4000-8000-000000000005', 'tecnico',
  'a1a1a1a1-0000-4000-8000-000000000001', ARRAY['d0000000-0000-4000-8000-000000000001']::uuid[]);
SELECT pruebas.debe_ser($q$SELECT org_id::text FROM public.profiles WHERE id = 'c0000000-0000-4000-8000-000000000005'$q$, 'a1a1a1a1-0000-4000-8000-000000000001');
SELECT pruebas.debe_ser($q$SELECT role::text FROM public.user_roles WHERE user_id = 'c0000000-0000-4000-8000-000000000005'$q$, 'tecnico');
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.user_areas WHERE user_id = 'c0000000-0000-4000-8000-000000000005'$q$, '1');
-- Deja una fila explícita ASSIGN_MEMBER (con la organización) además de la del trigger del perfil.
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.audit_log WHERE action = 'ASSIGN_MEMBER' AND record_id = 'c0000000-0000-4000-8000-000000000005' AND org_id = 'a1a1a1a1-0000-4000-8000-000000000001'$q$, '1');
-- La persona recién asignada ya tiene acceso como técnico:
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000005","role":"authenticated"}', true);   -- SIN_ORG (ya asignada)
SELECT pruebas.debe_ser($q$SELECT public.auth_role()::text$q$, 'tecnico');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);   -- ADMIN_A

-- Cambio de rol y áreas (reemplaza la lista completa; vacía = sin áreas).
SELECT public.admin_assign_member('c0000000-0000-4000-8000-000000000004', 'gestor', 'a1a1a1a1-0000-4000-8000-000000000001');
SELECT pruebas.debe_ser($q$SELECT role::text FROM public.user_roles WHERE user_id = 'c0000000-0000-4000-8000-000000000004'$q$, 'gestor');
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.user_areas WHERE user_id = 'c0000000-0000-4000-8000-000000000004'$q$, '0');

-- Errores:
SELECT pruebas.debe_fallar($q$SELECT public.admin_assign_member('c0000000-0000-4000-8000-000000000006', 'tecnico', 'b1b1b1b1-0000-4000-8000-000000000001')$q$, '42501', 'tu propia organización');
SELECT pruebas.debe_fallar($q$SELECT public.admin_assign_member('c0000000-0000-4000-8000-000000000013', 'tecnico', 'a1a1a1a1-0000-4000-8000-000000000001')$q$, '42501', 'pertenece a otra organización');   -- TEC_B1
SELECT pruebas.debe_fallar($q$SELECT public.admin_assign_member('c0000000-0000-4000-8000-0000000000ff', 'tecnico', 'a1a1a1a1-0000-4000-8000-000000000001')$q$, '42501', 'No se encontró a la persona');
SELECT pruebas.debe_fallar($q$SELECT public.admin_assign_member('c0000000-0000-4000-8000-000000000006', 'tecnico', 'a1a1a1a1-0000-4000-8000-000000000001', ARRAY['d0000000-0000-4000-8000-000000000011']::uuid[])$q$, 'P0001', 'Alguna de las áreas no existe en tu organización');   -- área de B
SELECT pruebas.debe_fallar($q$SELECT public.admin_assign_member('c0000000-0000-4000-8000-000000000006', NULL, 'a1a1a1a1-0000-4000-8000-000000000001')$q$, 'P0001', 'Faltan datos');
-- Última persona administradora activa de la organización: no se degrada.
SELECT pruebas.debe_fallar($q$SELECT public.admin_assign_member('c0000000-0000-4000-8000-000000000001', 'gestor', 'a1a1a1a1-0000-4000-8000-000000000001')$q$, 'P0001', 'última persona administradora activa');

-- Quien no es administrador no puede (gestor, técnico, sin organización, sin rol, desactivada):
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);   -- GESTOR_A
SELECT pruebas.debe_fallar($q$SELECT public.admin_assign_member('c0000000-0000-4000-8000-000000000006', 'tecnico', 'a1a1a1a1-0000-4000-8000-000000000001')$q$, '42501', 'Solo una persona administradora');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
SELECT pruebas.debe_fallar($q$SELECT public.admin_assign_member('c0000000-0000-4000-8000-000000000003', 'admin', 'a1a1a1a1-0000-4000-8000-000000000001')$q$, '42501', 'Solo una persona administradora');   -- no se auto-asciende
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000006","role":"authenticated"}', true);   -- SIN_ROL (la cuenta sin organización ya se probó en M-01 y M-00)
SELECT pruebas.debe_fallar($q$SELECT public.admin_assign_member('c0000000-0000-4000-8000-000000000006', 'admin', 'a1a1a1a1-0000-4000-8000-000000000001')$q$, '42501', 'Solo una persona administradora');
ROLLBACK;
```

**M-04 · Un administrador de OTRA organización.**

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal2"}', true);   -- ADMIN_B
SELECT pruebas.debe_fallar($q$SELECT public.admin_assign_member('c0000000-0000-4000-8000-000000000003', 'admin', 'b1b1b1b1-0000-4000-8000-000000000001')$q$, '42501', 'pertenece a otra organización');   -- TEC_A1
SELECT pruebas.debe_fallar($q$SELECT public.admin_assign_member('c0000000-0000-4000-8000-000000000003', 'admin', 'a1a1a1a1-0000-4000-8000-000000000001')$q$, '42501', 'tu propia organización');
SELECT pruebas.debe_fallar($q$SELECT public.admin_set_active('c0000000-0000-4000-8000-000000000003', false)$q$, '42501', 'No se encontró a la persona en tu organización');
ROLLBACK;
```

**M-05 · Comportamiento DOCUMENTADO (riesgo BAJO con una sola organización): con más de una organización, cualquier administrador puede reclamar una cuenta sin organización.** Esperado: **funciona** (no falla). Es la limitación que explica la mejora futura `invitations` (migración 1, «CUENTAS NUEVAS»). Si algún día esta prueba empieza a fallar, es porque se implementó `invitations`: actualiza la guía.

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal2"}', true);   -- ADMIN_B
SELECT public.admin_assign_member('c0000000-0000-4000-8000-000000000005', 'tecnico', 'b1b1b1b1-0000-4000-8000-000000000001');   -- SIN_ORG pasa a org B
SELECT pruebas.debe_ser($q$SELECT org_id::text FROM public.profiles WHERE id = 'c0000000-0000-4000-8000-000000000005'$q$, 'b1b1b1b1-0000-4000-8000-000000000001');
ROLLBACK;
```

**M-06 · `admin_set_active`.**

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);   -- ADMIN_A

SELECT public.admin_set_active('c0000000-0000-4000-8000-000000000003', false);                                            -- desactiva a TEC_A1
SELECT public.admin_set_active('c0000000-0000-4000-8000-000000000003', false);                                            -- repetir: sin cambios, sin ensuciar la auditoría
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.audit_log WHERE action = 'SET_ACTIVE' AND record_id = 'c0000000-0000-4000-8000-000000000003'$q$, '1');
SELECT pruebas.debe_ser($q$SELECT active::text FROM public.profiles WHERE id = 'c0000000-0000-4000-8000-000000000003'$q$, 'false');

-- TEC_A1 desactivado: ya no lee nada salvo su perfil, y no opera.
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SELECT pruebas.debe_ser($q$SELECT format('tasks=%s profiles=%s', (SELECT count(*) FROM public.tasks), (SELECT count(*) FROM public.profiles))$q$, 'tasks=0 profiles=1');
SELECT pruebas.debe_fallar($q$SELECT public.complete_task('f0000000-0000-4000-8000-000000000002')$q$, '42501', 'No tienes acceso a esta operación');

-- Se reactiva: vuelve a ver sus 2 tareas.
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
SELECT public.admin_set_active('c0000000-0000-4000-8000-000000000003', true);
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.tasks$q$, '2');

-- Errores:
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
SELECT pruebas.debe_fallar($q$SELECT public.admin_set_active('c0000000-0000-4000-8000-000000000001', false)$q$, 'P0001', 'No puedes desactivar tu propia cuenta');
SELECT pruebas.debe_fallar($q$SELECT public.admin_set_active('c0000000-0000-4000-8000-000000000013', false)$q$, '42501', 'No se encontró a la persona en tu organización');   -- TEC_B1
SELECT pruebas.debe_fallar($q$SELECT public.admin_set_active(NULL, false)$q$, 'P0001', 'Faltan datos');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);   -- GESTOR_A
SELECT pruebas.debe_fallar($q$SELECT public.admin_set_active('c0000000-0000-4000-8000-000000000003', false)$q$, '42501', 'Solo una persona administradora');
ROLLBACK;
```

(La regla «no desactivar a la última persona administradora activa» no se alcanza con otra persona como actora, porque quien actúa es siempre una administradora activa distinta; solo quedaría el caso de desactivarse a sí misma, que ya bloquea «No puedes desactivar tu propia cuenta».)

**M-07 · Un administrador puede degradar o desactivar a OTRO administrador (decisión documentada).** Esperado: funciona.

```sql
BEGIN;
UPDATE public.user_roles SET role = 'admin' WHERE user_id = 'c0000000-0000-4000-8000-000000000002';   -- propietario: GESTOR_A pasa a admin
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);   -- ADMIN_A
SELECT public.admin_assign_member('c0000000-0000-4000-8000-000000000002', 'tecnico', 'a1a1a1a1-0000-4000-8000-000000000001');   -- lo degrada
SELECT pruebas.debe_ser($q$SELECT role::text FROM public.user_roles WHERE user_id = 'c0000000-0000-4000-8000-000000000002'$q$, 'tecnico');
ROLLBACK;
```

**M-08 · El propietario puede quitar al último administrador; con sesión, no.**

Sin sesión (SQL Editor): se permite y emite un `WARNING` («DentiHub: el sistema se queda SIN administradores…»). Se borran todos los administradores de la base de desarrollo; es seguro por el `ROLLBACK`.

```sql
BEGIN;
DELETE FROM public.user_roles WHERE role = 'admin';   -- esperado: DELETE n, con al menos un WARNING
ROLLBACK;
```

Con una sesión simulada (aunque seas propietario): se bloquea con error. El caso de varias filas en una sola sentencia depende de que la función de bloqueo vea las filas ya borradas por la misma sentencia (lo afirma la migración 20261105130000) **(NO VERIFICADO)**.

```sql
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
SELECT pruebas.debe_fallar($q$DELETE FROM public.user_roles WHERE role = 'admin'$q$, 'P0001', 'No se puede quitar el rol de administrador a la última persona administradora');
ROLLBACK;
```

---

### 3.7 Persona sin organización, sin rol o desactivada

Ya cubiertos en F-01 (funciones), V-01 (lecturas) y C-07 (operaciones). Complementos:

**N-01 · Escrituras de estas cuentas.** Esperado: no pueden editar ni su propio nombre si no tienen organización activa (0 filas, sin error); SIN_ROL (organización y cuenta activas) sí puede cambiar su nombre.

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000005","role":"authenticated"}', true);   -- SIN_ORG
SELECT pruebas.debe_afectar($q$UPDATE public.profiles SET full_name = 'Nombre de prueba' WHERE id = 'c0000000-0000-4000-8000-000000000005'$q$, 0);
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000007","role":"authenticated"}', true);   -- DESACT
SELECT pruebas.debe_afectar($q$UPDATE public.profiles SET full_name = 'Nombre de prueba' WHERE id = 'c0000000-0000-4000-8000-000000000007'$q$, 0);
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000006","role":"authenticated"}', true);   -- SIN_ROL
SELECT pruebas.debe_afectar($q$UPDATE public.profiles SET full_name = 'Nombre de prueba' WHERE id = 'c0000000-0000-4000-8000-000000000006'$q$, 1);
-- Ninguna de las tres crea plantillas ni tareas:
SELECT pruebas.debe_fallar($q$SELECT public.create_form_template('X', '{"requires_photo": false, "steps": []}'::jsonb)$q$, '42501', 'Solo administradores y gestores');
SELECT pruebas.debe_fallar($q$INSERT INTO public.tasks (title, template_id) VALUES ('x', 'e0000000-0000-4000-8000-000000000002')$q$, '42501', 'row-level security');
ROLLBACK;
```

**N-02 · Una cuenta desactivada, sin rol o sin organización no puede subir ni leer evidencia** (se prueba en 3.9, pruebas S-01 y S-02).

---

### 3.8 Otras tablas: perfiles, roles, organizaciones, áreas

**T-01 · `profiles`.**

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
SELECT pruebas.debe_afectar($q$UPDATE public.profiles SET full_name = 'Camila de prueba' WHERE id = 'c0000000-0000-4000-8000-000000000003'$q$, 1);
SELECT pruebas.debe_afectar($q$UPDATE public.profiles SET theme = 'rosa' WHERE id = 'c0000000-0000-4000-8000-000000000003'$q$, 1);
SELECT pruebas.debe_fallar($q$UPDATE public.profiles SET theme = 'no-existe' WHERE id = 'c0000000-0000-4000-8000-000000000003'$q$, '23514', 'check constraint');
SELECT pruebas.debe_afectar($q$UPDATE public.profiles SET full_name = 'x' WHERE id = 'c0000000-0000-4000-8000-000000000004'$q$, 0);   -- ajeno: 0 filas
-- email, org_id, active, id, created_at: sin privilegio de columna.
SELECT pruebas.debe_fallar($q$UPDATE public.profiles SET email = 'otro@example.test' WHERE id = 'c0000000-0000-4000-8000-000000000003'$q$, '42501', 'permission denied');
SELECT pruebas.debe_fallar($q$UPDATE public.profiles SET org_id = 'b1b1b1b1-0000-4000-8000-000000000001' WHERE id = 'c0000000-0000-4000-8000-000000000003'$q$, '42501', 'permission denied');
SELECT pruebas.debe_fallar($q$UPDATE public.profiles SET active = false WHERE id = 'c0000000-0000-4000-8000-000000000003'$q$, '42501', 'permission denied');
SELECT pruebas.debe_fallar($q$INSERT INTO public.profiles (id) VALUES ('c0000000-0000-4000-8000-0000000000aa')$q$, '42501', 'permission denied');
SELECT pruebas.debe_fallar($q$DELETE FROM public.profiles WHERE id = 'c0000000-0000-4000-8000-000000000003'$q$, '42501', 'permission denied');

SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);   -- ADMIN_A
SELECT pruebas.debe_afectar($q$UPDATE public.profiles SET full_name = 'Editada por admin' WHERE id = 'c0000000-0000-4000-8000-000000000003'$q$, 1);
SELECT pruebas.debe_afectar($q$UPDATE public.profiles SET full_name = 'x' WHERE id = 'c0000000-0000-4000-8000-000000000013'$q$, 0);   -- otra organización
SELECT pruebas.debe_fallar($q$UPDATE public.profiles SET active = false WHERE id = 'c0000000-0000-4000-8000-000000000003'$q$, '42501', 'permission denied');   -- se hace con admin_set_active
ROLLBACK;
```

**T-02 · Segunda capa de `profiles` (trigger `profiles_guard_columns`), simulando un GRANT demasiado amplio.**

```sql
BEGIN;
GRANT UPDATE (active, org_id) ON public.profiles TO authenticated;   -- solo en esta transacción
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);   -- ADMIN_A
SELECT pruebas.debe_fallar($q$UPDATE public.profiles SET active = false WHERE id = 'c0000000-0000-4000-8000-000000000003'$q$, '42501', 'Solo puedes cambiar tu nombre y tu tema');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
SELECT pruebas.debe_fallar($q$UPDATE public.profiles SET org_id = 'b1b1b1b1-0000-4000-8000-000000000001' WHERE id = 'c0000000-0000-4000-8000-000000000003'$q$, '42501', 'Solo puedes cambiar tu nombre y tu tema');
ROLLBACK;
```

**T-03 · `user_roles` y `user_areas`: solo lectura por la API (incluso para el administrador).**

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);   -- ADMIN_A
SELECT pruebas.debe_fallar($q$INSERT INTO public.user_roles (user_id, role) VALUES ('c0000000-0000-4000-8000-000000000005', 'admin')$q$, '42501', 'permission denied');
SELECT pruebas.debe_fallar($q$UPDATE public.user_roles SET role = 'admin' WHERE user_id = 'c0000000-0000-4000-8000-000000000003'$q$, '42501', 'permission denied');
SELECT pruebas.debe_fallar($q$DELETE FROM public.user_roles WHERE user_id = 'c0000000-0000-4000-8000-000000000003'$q$, '42501', 'permission denied');
SELECT pruebas.debe_fallar($q$INSERT INTO public.user_areas (user_id, area_id, org_id) VALUES ('c0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000002', 'a1a1a1a1-0000-4000-8000-000000000001')$q$, '42501', 'permission denied');
SELECT pruebas.debe_fallar($q$DELETE FROM public.user_areas$q$, '42501', 'permission denied');
ROLLBACK;
```

**T-04 · `organizations`.**

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
SELECT pruebas.debe_afectar($q$UPDATE public.organizations SET name = 'x' WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001'$q$, 0);   -- 0 filas, sin error
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);   -- GESTOR_A
SELECT pruebas.debe_afectar($q$UPDATE public.organizations SET name = 'x' WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001'$q$, 0);
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);   -- ADMIN_A
SELECT pruebas.debe_afectar($q$UPDATE public.organizations SET name = 'Org A renombrada' WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001'$q$, 1);
SELECT pruebas.debe_afectar($q$UPDATE public.organizations SET name = 'x' WHERE id = 'b1b1b1b1-0000-4000-8000-000000000001'$q$, 0);   -- otra organización
SELECT pruebas.debe_fallar($q$INSERT INTO public.organizations (name) VALUES ('Nueva')$q$, '42501', 'permission denied');
SELECT pruebas.debe_fallar($q$DELETE FROM public.organizations WHERE id = 'a1a1a1a1-0000-4000-8000-000000000001'$q$, '42501', 'permission denied');
ROLLBACK;
```

**T-05 · `areas`.**

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);   -- ADMIN_A
SELECT pruebas.debe_afectar($q$INSERT INTO public.areas (name) VALUES ('Area nueva')$q$, 1);                                  -- org_id sale de auth_org()
SELECT pruebas.debe_ser($q$SELECT (org_id = 'a1a1a1a1-0000-4000-8000-000000000001')::text FROM public.areas WHERE name = 'Area nueva'$q$, 'true');
SELECT pruebas.debe_fallar($q$INSERT INTO public.areas (name) VALUES ('  AREA a1 ')$q$, '23505', 'duplicate key');             -- único sin distinguir mayúsculas ni bordes
SELECT pruebas.debe_fallar($q$INSERT INTO public.areas (name, org_id) VALUES ('x', 'b1b1b1b1-0000-4000-8000-000000000001')$q$, '42501', 'permission denied');   -- no se elige la organización
SELECT pruebas.debe_afectar($q$UPDATE public.areas SET name = 'Area A2 renombrada' WHERE id = 'd0000000-0000-4000-8000-000000000002'$q$, 1);
SELECT pruebas.debe_afectar($q$UPDATE public.areas SET name = 'x' WHERE id = 'd0000000-0000-4000-8000-000000000011'$q$, 0);    -- área de B
-- Área con tareas: no se borra. Área sin tareas: se borra y arrastra sus pertenencias (user_areas).
SELECT pruebas.debe_fallar($q$DELETE FROM public.areas WHERE id = 'd0000000-0000-4000-8000-000000000001'$q$, '23503', 'foreign key');
SELECT pruebas.debe_afectar($q$DELETE FROM public.areas WHERE id = 'd0000000-0000-4000-8000-000000000002'$q$, 1);
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.user_areas WHERE area_id = 'd0000000-0000-4000-8000-000000000002'$q$, '0');

SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);   -- GESTOR_A
SELECT pruebas.debe_fallar($q$INSERT INTO public.areas (name) VALUES ('Del gestor')$q$, '42501', 'row-level security');
SELECT pruebas.debe_afectar($q$UPDATE public.areas SET name = 'x' WHERE id = 'd0000000-0000-4000-8000-000000000001'$q$, 0);
SELECT pruebas.debe_afectar($q$DELETE FROM public.areas WHERE id = 'd0000000-0000-4000-8000-000000000001'$q$, 0);
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
SELECT pruebas.debe_fallar($q$INSERT INTO public.areas (name) VALUES ('Del tecnico')$q$, '42501', 'row-level security');
ROLLBACK;
```

---

### 3.9 Storage por SQL (políticas de `storage.objects`)

Estas pruebas simulan lo que haría Storage al subir o listar con el JWT de la persona; no reemplazan la prueba por API (3.10). Los objetos se insertan como propietario dentro de la transacción.

**(NO VERIFICADO)** Que `authenticated` tenga `SELECT` e `INSERT` sobre `storage.objects` en tu proyecto (lo habitual en Supabase) y que los triggers internos de Storage no impidan un `INSERT` directo. Si un `INSERT` falla con un error distinto de lo esperado (por ejemplo, por un trigger de Storage), anótalo y apóyate en las pruebas por API.

Objetos usados (todos `jpg`, bucket `evidence`):
- OBJ_A: tarea T_FOTO (de TEC_A1) · OBJ_B: T_AJENA (de TEC_A2) · OBJ_C: T_SIN_ASIGNAR · OBJ_E: T_DESACT · OBJ_D: T_B (org B).

**S-01 · Qué ve cada persona (leer y listar).**

```sql
BEGIN;
INSERT INTO storage.objects (bucket_id, name, metadata) VALUES
 ('evidence', 'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-00000000000a.jpg', '{"size": 50000, "mimetype": "image/jpeg"}'),   -- OBJ_A (T_FOTO)
 ('evidence', 'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000003/0b000000-0000-4000-8000-00000000000b.jpg', '{"size": 50000, "mimetype": "image/jpeg"}'),   -- OBJ_B (T_AJENA)
 ('evidence', 'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000004/0b000000-0000-4000-8000-00000000000c.jpg', '{"size": 50000, "mimetype": "image/jpeg"}'),   -- OBJ_C (T_SIN_ASIGNAR)
 ('evidence', 'b1b1b1b1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000011/0b000000-0000-4000-8000-00000000000d.jpg', '{"size": 50000, "mimetype": "image/jpeg"}'),   -- OBJ_D (T_B, org B)
 ('evidence', 'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000005/0b000000-0000-4000-8000-00000000000e.jpg', '{"size": 50000, "mimetype": "image/jpeg"}');   -- OBJ_E (T_DESACT)
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1: solo OBJ_A
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM storage.objects WHERE bucket_id = 'evidence'$q$, '1');
SELECT pruebas.debe_ser($q$SELECT right(name, 40) FROM storage.objects WHERE bucket_id = 'evidence'$q$, '0b000000-0000-4000-8000-00000000000a.jpg');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000004","role":"authenticated"}', true);   -- TEC_A2: solo OBJ_B
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM storage.objects WHERE bucket_id = 'evidence'$q$, '1');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);   -- GESTOR_A: A, B, C y E (no D)
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM storage.objects WHERE bucket_id = 'evidence'$q$, '4');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);   -- ADMIN_A
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM storage.objects WHERE bucket_id = 'evidence'$q$, '4');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal2"}', true);   -- ADMIN_B: solo D
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM storage.objects WHERE bucket_id = 'evidence'$q$, '1');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000013","role":"authenticated"}', true);   -- TEC_B1: solo D
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM storage.objects WHERE bucket_id = 'evidence'$q$, '1');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000005","role":"authenticated"}', true);   -- SIN_ORG: nada
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM storage.objects WHERE bucket_id = 'evidence'$q$, '0');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000006","role":"authenticated"}', true);   -- SIN_ROL: nada
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM storage.objects WHERE bucket_id = 'evidence'$q$, '0');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000007","role":"authenticated"}', true);   -- DESACT: nada (ni su propia tarea)
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM storage.objects WHERE bucket_id = 'evidence'$q$, '0');
ROLLBACK;
```

**S-02 · Subir: solo el asignado, a una tarea abierta de su organización, con ruta bien formada.**

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
-- Propia y abierta: permitido.
SELECT pruebas.debe_afectar($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000031.jpg')$q$, 1);
-- Tarea ajena, tarea sin asignar, otra organización: rechazado.
SELECT pruebas.debe_fallar($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000003/0b000000-0000-4000-8000-000000000032.jpg')$q$, '42501', 'row-level security');
SELECT pruebas.debe_fallar($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000004/0b000000-0000-4000-8000-000000000033.jpg')$q$, '42501', 'row-level security');
SELECT pruebas.debe_fallar($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence',
  'b1b1b1b1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000011/0b000000-0000-4000-8000-000000000034.jpg')$q$, '42501', 'row-level security');
-- Org de la ruta distinta de la de la tarea:
SELECT pruebas.debe_fallar($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence',
  'b1b1b1b1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000035.jpg')$q$, '42501', 'row-level security');
-- Rutas mal formadas (extensión en mayúscula, extensión no permitida, sin uuid, con subcarpeta de más):
SELECT pruebas.debe_fallar($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000036.JPG')$q$, '42501', 'row-level security');
SELECT pruebas.debe_fallar($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000037.exe')$q$, '42501', 'row-level security');
SELECT pruebas.debe_fallar($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/foto.jpg')$q$, '42501', 'row-level security');
SELECT pruebas.debe_fallar($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/x/0b000000-0000-4000-8000-000000000038.jpg')$q$, '42501', 'row-level security');

-- Otros roles: ni el gestor ni el administrador suben evidencia (solo el asignado).
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);   -- GESTOR_A
SELECT pruebas.debe_fallar($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000039.jpg')$q$, '42501', 'row-level security');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);   -- ADMIN_A
SELECT pruebas.debe_fallar($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-00000000003a.jpg')$q$, '42501', 'row-level security');
-- Desactivada y sin rol (DESACT con su propia tarea; SIN_ROL):
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000007","role":"authenticated"}', true);   -- DESACT
SELECT pruebas.debe_fallar($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000005/0b000000-0000-4000-8000-00000000003b.jpg')$q$, '42501', 'row-level security');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000006","role":"authenticated"}', true);   -- SIN_ROL
SELECT pruebas.debe_fallar($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-00000000003c.jpg')$q$, '42501', 'row-level security');
ROLLBACK;
```

**S-03 · No se sube a una tarea cerrada ni cancelada.**

```sql
BEGIN;
UPDATE public.tasks SET status = 'cancelada', cancelled_at = now() WHERE id = 'f0000000-0000-4000-8000-000000000002';   -- propietario: cancela T_SIN_FOTO
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
SELECT pruebas.debe_fallar($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000002/0b000000-0000-4000-8000-000000000041.jpg')$q$, '42501', 'row-level security');
ROLLBACK;
```

**S-04 · Límite de objetos por tarea (`evidence_max_per_task()` = 20).** Esperado: con 19 objetos bajo el prefijo se admite el 20.º; el 21.º se rechaza con **«new row violates row-level security policy»** y **no** con «infinite recursion detected in policy» (si sale esa frase, el conteo se está haciendo con una subconsulta directa y hay que revisar la política). Otra tarea no se ve afectada.

```sql
BEGIN;
INSERT INTO storage.objects (bucket_id, name, metadata)
SELECT 'evidence',
       'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000002/' || md5('lim' || g)::uuid || '.jpg',
       '{"size": 50000, "mimetype": "image/jpeg"}'::jsonb
FROM generate_series(1, 19) AS g;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
SELECT pruebas.debe_afectar($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000002/' || md5('lim20')::uuid || '.jpg')$q$, 1);      -- el 20.º entra
SELECT pruebas.debe_fallar($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000002/' || md5('lim21')::uuid || '.jpg')$q$,
  '42501', 'row-level security');                                                                                              -- el 21.º no
SELECT pruebas.debe_afectar($q$INSERT INTO storage.objects (bucket_id, name) VALUES ('evidence',
  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/' || md5('otra')::uuid || '.jpg')$q$, 1);        -- otra tarea: entra
-- La función solo responde para la organización de quien llama (otra organización: NULL):
SELECT pruebas.debe_ser($q$SELECT public.evidence_object_count('a1a1a1a1-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002')::text$q$, '20');
SELECT pruebas.debe_ser($q$SELECT public.evidence_object_count('b1b1b1b1-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000011')$q$, NULL);
ROLLBACK;
```

Si el 21.º **entra**, el supuesto de `BYPASSRLS` (E-11) no se cumple y el tope no se aplica: no des la migración por buena.

**S-05 · Nadie modifica ni borra objetos por la API (sin política de UPDATE ni DELETE).** Esperado: 0 filas. **(NO VERIFICADO)** si tu proyecto concede `UPDATE`/`DELETE` sobre `storage.objects` a `authenticated`; si no, el resultado será `permission denied` (también es un «no»).

```sql
BEGIN;
INSERT INTO storage.objects (bucket_id, name, metadata) VALUES
 ('evidence', 'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-000000000051.jpg', '{"size": 50000, "mimetype": "image/jpeg"}');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
SELECT pruebas.debe_afectar($q$UPDATE storage.objects SET name = name || 'x' WHERE bucket_id = 'evidence'$q$, 0);
SELECT pruebas.debe_afectar($q$DELETE FROM storage.objects WHERE bucket_id = 'evidence'$q$, 0);
ROLLBACK;
```

**S-06 · Plan de ejecución del conteo (rendimiento, NO VERIFICADO).** Como propietario. Esperado: un `Index Scan` o `Bitmap Index Scan` sobre un índice de `storage.objects` que incluya `bucket_id` y `name` (con `COLLATE "C"`). Si sale `Seq Scan` incluso con `enable_seqscan = off`, no existe un índice utilizable: hay una sola consulta por subida, pero con un bucket enorme conviene pedirle a Bernardo decidir si se agrega uno (no se crea desde la migración).

```sql
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'storage' AND tablename = 'objects';

BEGIN;
SET LOCAL enable_seqscan = off;
EXPLAIN SELECT count(*) FROM storage.objects o
WHERE o.bucket_id = 'evidence'
  AND o.name COLLATE "C" >= 'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-000000000001/'
  AND o.name COLLATE "C" <  'a1a1a1a1-0000-4000-8000-000000000001/f0000000-0000-4000-8000-0000000000010';
ROLLBACK;
```

**S-07 · Huérfanos (subidos y nunca registrados).** Consulta de limpieza: no borra nada; lista candidatos para que un proceso administrativo con `service_role` los elimine **por la API de Storage** (no con `DELETE` en SQL, que dejaría el archivo vivo en el almacenamiento).

```sql
SELECT o.name, o.created_at, o.metadata ->> 'size' AS size
FROM storage.objects o
LEFT JOIN public.task_evidence e ON e.storage_path = o.name
WHERE o.bucket_id = 'evidence' AND e.id IS NULL AND o.created_at < now() - interval '1 day'
ORDER BY o.created_at;
```

---

### 3.10 Storage real por la API (con archivos de verdad)

Es la única forma de verificar los supuestos que el SQL no puede: nombres de claves de `metadata`, límites del bucket y el comportamiento de URL firmadas. **No escribas claves ni contraseñas aquí ni en el chat.**

> **Orden:** esta sección deja datos confirmados (cuentas `api_*`, tareas y objetos en Storage) que alteran los conteos esperados de otras pruebas (S-01, V-01, M-01, U-05). **Córrela al final**, y si repites la guía, limpia antes (sección de limpieza).

**Preparación**

1. En el panel de Supabase del proyecto de **desarrollo** (Authentication → Users), crea tres cuentas con correos `@example.test` y una contraseña de prueba que elijas tú: `api_tec1`, `api_tec2` y `api_gestor`. (Las cuentas las crea Bernardo, no el agente.) Copia sus UID.
2. Como propietario, reemplazando los tres marcadores por esos UID, asígnalas a la organización A y crea dos tareas para `api_tec1`:

```sql
UPDATE public.profiles SET org_id = 'a1a1a1a1-0000-4000-8000-000000000001'
 WHERE id IN ('<UID_API_TEC1>', '<UID_API_TEC2>', '<UID_API_GESTOR>');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('<UID_API_TEC1>', 'tecnico'), ('<UID_API_TEC2>', 'tecnico'), ('<UID_API_GESTOR>', 'gestor');
INSERT INTO public.tasks (id, org_id, area_id, template_id, title, assignee_id, created_by) VALUES
  ('f0000000-0000-4000-8000-0000000000a1', 'a1a1a1a1-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'e0000000-0000-4000-8000-000000000001', 'Tarea API con foto', '<UID_API_TEC1>', 'c0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-0000000000a2', 'a1a1a1a1-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001',
   'e0000000-0000-4000-8000-000000000002', 'Tarea API para el tope', '<UID_API_TEC1>', 'c0000000-0000-4000-8000-000000000001');
```

3. En tu terminal (Git Bash o WSL; en PowerShell usa `curl.exe` y `$env:NOMBRE`), define variables de entorno **sin pegar sus valores en ningún archivo**: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (la clave pública del proyecto de desarrollo), `API_TEC1_EMAIL`, `API_TEC1_PASS`, `API_TEC2_EMAIL`, `API_TEC2_PASS`, `API_GESTOR_EMAIL`, `API_GESTOR_PASS`. Una imagen de prueba `foto.jpg` de más de 10 KB que **no muestre personas** (por ejemplo, una captura de pantalla o una textura).

```bash
ORG=a1a1a1a1-0000-4000-8000-000000000001
TASK=f0000000-0000-4000-8000-0000000000a1
TASK2=f0000000-0000-4000-8000-0000000000a2
uuid() { node -e "console.log(require('crypto').randomUUID())"; }
token() {  # uso: token EMAIL PASS  -> imprime el access_token
  curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).access_token))"
}
T1=$(token "$API_TEC1_EMAIL" "$API_TEC1_PASS")
T2=$(token "$API_TEC2_EMAIL" "$API_TEC2_PASS")
TG=$(token "$API_GESTOR_EMAIL" "$API_GESTOR_PASS")
H=(-H "apikey: $SUPABASE_ANON_KEY")
```

**A-01 · Subir una foto válida como el asignado.** Esperado: `HTTP 200` con `{"Key":"evidence/…"}`.

```bash
P1="$ORG/$TASK/$(uuid).jpg"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$SUPABASE_URL/storage/v1/object/evidence/$P1" "${H[@]}" \
  -H "Authorization: Bearer $T1" -H "Content-Type: image/jpeg" -H "x-upsert: false" --data-binary @foto.jpg
```

**A-02 · Comprobar los nombres de las claves de `metadata` (resuelve el supuesto NO VERIFICADO).** Como propietario, con el `P1` de arriba. Esperado: `metadata` con `size` (número, igual al tamaño del archivo), `mimetype` (`image/jpeg`) y `eTag` (texto). **Si alguna se llama distinto, `register_evidence` rechazará todas las fotos: detente y ajusta la migración antes de seguir.**

```sql
SELECT name, metadata FROM storage.objects WHERE bucket_id = 'evidence' AND name = '<P1>';
```

**A-03 · Registrar la foto.** Esperado: `HTTP 200` con una fila (`id`, `storage_path`, `uploaded_by`…). Repetir con el mismo `client_uuid` devuelve **la misma** fila (idempotencia).

```bash
C1=$(uuid)
curl -s -w "\nHTTP %{http_code}\n" -X POST "$SUPABASE_URL/rest/v1/rpc/register_evidence" "${H[@]}" \
  -H "Authorization: Bearer $T1" -H "Content-Type: application/json" \
  -d "{\"p_task_id\":\"$TASK\",\"p_storage_path\":\"$P1\",\"p_client_uuid\":\"$C1\"}"
# repetir la misma llamada: misma fila
```

**A-04 · Archivo de 1 byte.** Storage lo acepta (solo tiene máximo); el registro lo rechaza. Esperado: subida `200`; registro `HTTP 400` con `"code":"P0001"` y «demasiado pequeño».

```bash
printf 'x' > tiny.jpg
P2="$ORG/$TASK/$(uuid).jpg"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$SUPABASE_URL/storage/v1/object/evidence/$P2" "${H[@]}" \
  -H "Authorization: Bearer $T1" -H "Content-Type: image/jpeg" -H "x-upsert: false" --data-binary @tiny.jpg
curl -s -w "\nHTTP %{http_code}\n" -X POST "$SUPABASE_URL/rest/v1/rpc/register_evidence" "${H[@]}" \
  -H "Authorization: Bearer $T1" -H "Content-Type: application/json" \
  -d "{\"p_task_id\":\"$TASK\",\"p_storage_path\":\"$P2\",\"p_client_uuid\":\"$(uuid)\"}"
```

**A-05 · Tipo no permitido y archivo demasiado grande (límites del bucket).** Esperado: `4xx` en la subida (el código y el texto exactos dependen de la versión de Storage). Si en vez de eso Storage aceptara el `text/plain`, el registro lo rechazaría con «tipo de archivo no está permitido».

```bash
echo "no soy una foto" > nota.jpg
curl -s -w "\nHTTP %{http_code}\n" -X POST "$SUPABASE_URL/storage/v1/object/evidence/$ORG/$TASK/$(uuid).jpg" "${H[@]}" \
  -H "Authorization: Bearer $T1" -H "Content-Type: text/plain" -H "x-upsert: false" --data-binary @nota.jpg
head -c 11000000 /dev/zero > grande.jpg      # 11 MB, sobre el límite de 10 MB
curl -s -w "\nHTTP %{http_code}\n" -X POST "$SUPABASE_URL/storage/v1/object/evidence/$ORG/$TASK/$(uuid).jpg" "${H[@]}" \
  -H "Authorization: Bearer $T1" -H "Content-Type: image/jpeg" -H "x-upsert: false" --data-binary @grande.jpg
```

**A-06 · La misma foto subida otra vez bajo otro nombre.** Esperado: la subida pasa; el registro falla con `HTTP 400`, `"code":"23505"`, «archivo repetido» **solo si** el `eTag` es un hash del contenido (supuesto NO VERIFICADO: si el registro pasa, anótalo: el control por `eTag` no sirve y hay que moverlo a una Edge Function).

```bash
P3="$ORG/$TASK/$(uuid).jpg"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST "$SUPABASE_URL/storage/v1/object/evidence/$P3" "${H[@]}" \
  -H "Authorization: Bearer $T1" -H "Content-Type: image/jpeg" -H "x-upsert: false" --data-binary @foto.jpg
curl -s -w "\nHTTP %{http_code}\n" -X POST "$SUPABASE_URL/rest/v1/rpc/register_evidence" "${H[@]}" \
  -H "Authorization: Bearer $T1" -H "Content-Type: application/json" \
  -d "{\"p_task_id\":\"$TASK\",\"p_storage_path\":\"$P3\",\"p_client_uuid\":\"$(uuid)\"}"
```

**A-07 · Otro técnico (`api_tec2`) no puede subir, leer ni listar la evidencia de `api_tec1`.** Esperado: subida `4xx` (RLS); lectura `4xx` («Object not found» o similar, el código exacto varía); listado `[]`.

```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST "$SUPABASE_URL/storage/v1/object/evidence/$ORG/$TASK/$(uuid).jpg" "${H[@]}" \
  -H "Authorization: Bearer $T2" -H "Content-Type: image/jpeg" -H "x-upsert: false" --data-binary @foto.jpg
curl -s -w "\nHTTP %{http_code}\n" "$SUPABASE_URL/storage/v1/object/authenticated/evidence/$P1" "${H[@]}" -H "Authorization: Bearer $T2" -o /dev/null
curl -s -w "\nHTTP %{http_code}\n" -X POST "$SUPABASE_URL/storage/v1/object/list/evidence" "${H[@]}" \
  -H "Authorization: Bearer $T2" -H "Content-Type: application/json" -d "{\"prefix\":\"$ORG/$TASK\",\"limit\":100}"
```

**A-08 · Quien sí puede leer y listar.** `api_tec1` (asignado) y `api_gestor` (de la organización). Esperado: lectura `200`; listado con las fotos de la tarea.

```bash
curl -s -w "\nHTTP %{http_code}\n" "$SUPABASE_URL/storage/v1/object/authenticated/evidence/$P1" "${H[@]}" -H "Authorization: Bearer $T1" -o /dev/null
curl -s -w "\nHTTP %{http_code}\n" -X POST "$SUPABASE_URL/storage/v1/object/list/evidence" "${H[@]}" \
  -H "Authorization: Bearer $TG" -H "Content-Type: application/json" -d "{\"prefix\":\"$ORG/$TASK\",\"limit\":100}"
```

**A-09 · URL firmada de 60 segundos.** Esperado: `api_tec1` la obtiene y funciona; `api_tec2` no la obtiene; pasados 60 segundos, la URL deja de servir. (Desactivar una cuenta **no** invalida una URL ya emitida: por eso van de vida corta.)

```bash
curl -s -X POST "$SUPABASE_URL/storage/v1/object/sign/evidence/$P1" "${H[@]}" -H "Authorization: Bearer $T1" \
  -H "Content-Type: application/json" -d '{"expiresIn":60}'          # devuelve {"signedURL":"..."}
curl -s -w "\nHTTP %{http_code}\n" -X POST "$SUPABASE_URL/storage/v1/object/sign/evidence/$P1" "${H[@]}" -H "Authorization: Bearer $T2" \
  -H "Content-Type: application/json" -d '{"expiresIn":60}'          # esperado: 4xx
# Con la signedURL obtenida: curl -s -o /dev/null -w "%{http_code}\n" "$SUPABASE_URL/storage/v1<signedURL>"  -> 200
# Espera 61 segundos y repite: debe responder 4xx.
```

**A-10 · No se reemplaza ni se borra.** Esperado: reemplazo con `x-upsert: true` → `4xx`; borrado → sin efecto (la respuesta puede ser `200` con lista vacía o `4xx`; lo que importa es que el objeto **sigue** en `storage.objects`).

```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST "$SUPABASE_URL/storage/v1/object/evidence/$P1" "${H[@]}" \
  -H "Authorization: Bearer $T1" -H "Content-Type: image/jpeg" -H "x-upsert: true" --data-binary @foto.jpg
curl -s -w "\nHTTP %{http_code}\n" -X DELETE "$SUPABASE_URL/storage/v1/object/evidence/$P1" "${H[@]}" -H "Authorization: Bearer $T1"
```

```sql
SELECT count(*) FROM storage.objects WHERE bucket_id = 'evidence' AND name = '<P1>';   -- esperado: 1
```

**A-11 · Tope de 20 objetos por tarea.** Sobre la tarea `…a2` (sin objetos). Esperado: las 20 primeras `200`; la 21.ª `4xx` por RLS (no «infinite recursion»).

```bash
for i in $(seq 1 21); do
  printf "%s -> " "$i"
  curl -s -o /dev/null -w "HTTP %{http_code}\n" -X POST "$SUPABASE_URL/storage/v1/object/evidence/$ORG/$TASK2/$(uuid).jpg" "${H[@]}" \
    -H "Authorization: Bearer $T1" -H "Content-Type: image/jpeg" -H "x-upsert: false" --data-binary @foto.jpg
done
```

**A-12 · PostgREST directo: `UPDATE` de `status` y de `title`.** Esperado: `status` → `HTTP 403` con `"code":"42501"` y «permission denied for …» (no el mensaje del trigger de guarda); `title` por el técnico → `HTTP 200` con `[]` (0 filas, sin error); `title` por el gestor → `200` con la fila.

```bash
curl -s -w "\nHTTP %{http_code}\n" -X PATCH "$SUPABASE_URL/rest/v1/tasks?id=eq.$TASK" "${H[@]}" -H "Authorization: Bearer $T1" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" -d '{"status":"completada"}'
curl -s -w "\nHTTP %{http_code}\n" -X PATCH "$SUPABASE_URL/rest/v1/tasks?id=eq.$TASK" "${H[@]}" -H "Authorization: Bearer $T1" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" -d '{"title":"hack"}'
curl -s -w "\nHTTP %{http_code}\n" -X PATCH "$SUPABASE_URL/rest/v1/tasks?id=eq.$TASK" "${H[@]}" -H "Authorization: Bearer $TG" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" -d '{"title":"Editada por gestor"}'
```

**A-13 · Completar por la API.** Esperado: sin pasos → `400`, `"code":"23514"`; con el paso respondido y la foto registrada (A-03) → `200` con `"status":"completada"`. Sin sesión (solo la clave pública) → `401`/`403` con `42501`.

```bash
curl -s -w "\nHTTP %{http_code}\n" -X POST "$SUPABASE_URL/rest/v1/rpc/complete_task" "${H[@]}" -H "Authorization: Bearer $T1" \
  -H "Content-Type: application/json" -d "{\"p_task_id\":\"$TASK\"}"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$SUPABASE_URL/rest/v1/rpc/save_task_progress" "${H[@]}" -H "Authorization: Bearer $T1" \
  -H "Content-Type: application/json" -d "{\"p_task_id\":\"$TASK\",\"p_answers\":{\"limpieza\":true}}"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$SUPABASE_URL/rest/v1/rpc/complete_task" "${H[@]}" -H "Authorization: Bearer $T1" \
  -H "Content-Type: application/json" -d "{\"p_task_id\":\"$TASK\"}"
curl -s -w "\nHTTP %{http_code}\n" -X POST "$SUPABASE_URL/rest/v1/rpc/complete_task" "${H[@]}" \
  -H "Content-Type: application/json" -d "{\"p_task_id\":\"$TASK\"}"
```

**A-14 · Limpieza de esta prueba.** Los objetos subidos se eliminan por la API de Storage con una herramienta administrativa (consola de Supabase → Storage → `evidence`), no con `DELETE` en SQL. Después, la consulta de huérfanos (S-07) debe quedar vacía para lo que subiste.

---

### 3.11 Auditoría

**U-01 · Quién puede leer y qué ve.** Esperado: solo administradores, solo de su organización.

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);   -- ADMIN_A
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.audit_log WHERE org_id IS DISTINCT FROM 'a1a1a1a1-0000-4000-8000-000000000001'$q$, '0');
SELECT pruebas.debe_ser($q$SELECT (count(*) > 0)::text FROM public.audit_log$q$, 'true');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal2"}', true);   -- ADMIN_B
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.audit_log WHERE org_id = 'a1a1a1a1-0000-4000-8000-000000000001'$q$, '0');
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.audit_log WHERE org_id IS DISTINCT FROM 'b1b1b1b1-0000-4000-8000-000000000001'$q$, '0');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);   -- GESTOR_A
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.audit_log$q$, '0');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.audit_log$q$, '0');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000007","role":"authenticated"}', true);   -- DESACT (con rol, pero inactiva)
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.audit_log$q$, '0');
ROLLBACK;
```

**U-02 · Solo inserción para la API.** Esperado: `42501`, **«permission denied for table audit_log»** para `authenticated` (incluido el administrador) y también para `service_role`. **No** sale el mensaje en español de los triggers: Postgres rechaza antes, por privilegios.

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);   -- ADMIN_A
SELECT pruebas.debe_fallar($q$INSERT INTO public.audit_log (table_name, action) VALUES ('x', 'INSERT')$q$, '42501', 'permission denied for table audit_log');
SELECT pruebas.debe_fallar($q$UPDATE public.audit_log SET action = 'x'$q$, '42501', 'permission denied for table audit_log');
SELECT pruebas.debe_fallar($q$DELETE FROM public.audit_log$q$, '42501', 'permission denied for table audit_log');
SELECT pruebas.debe_fallar($q$TRUNCATE public.audit_log$q$, '42501', 'permission denied for table audit_log');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pruebas.debe_fallar($q$UPDATE public.audit_log SET action = 'x'$q$, '42501', 'permission denied for table audit_log');
SELECT pruebas.debe_fallar($q$DELETE FROM public.audit_log$q$, '42501', 'permission denied for table audit_log');
SELECT pruebas.debe_fallar($q$TRUNCATE public.audit_log$q$, '42501', 'permission denied for table audit_log');
ROLLBACK;
```

Privilegios, para dejar constancia:

```sql
SELECT has_table_privilege('authenticated', 'public.audit_log', 'INSERT,UPDATE,DELETE,TRUNCATE') AS authenticated_escribe,  -- false
       has_table_privilege('anon', 'public.audit_log', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')   AS anon_algo,            -- false
       has_table_privilege('service_role', 'public.audit_log', 'UPDATE,DELETE,TRUNCATE')          AS service_role_modifica; -- false
```

**U-03 · El propietario SÍ llega a los triggers: ahí aparece el mensaje en español.** (Segunda barrera.) Esperado: `42501` con los tres mensajes.

```sql
BEGIN;
SELECT pruebas.debe_fallar($q$UPDATE public.audit_log SET action = action WHERE id = (SELECT id FROM public.audit_log LIMIT 1)$q$, '42501', 'no se pueden modificar sus filas');
SELECT pruebas.debe_fallar($q$DELETE FROM public.audit_log WHERE id = (SELECT id FROM public.audit_log LIMIT 1)$q$, '42501', 'no se pueden borrar sus filas');
SELECT pruebas.debe_fallar($q$TRUNCATE public.audit_log$q$, '42501', 'no se puede vaciar');
ROLLBACK;
```

**U-04 · Borrado en cascada de una cuenta: no falla y la auditoría no pierde filas.** Esperado: no hay error; el recuento de `audit_log` **aumenta** (filas `DELETE` de `profiles`, `user_roles` y `user_areas`) y nunca baja. La fila de `user_roles` puede quedar con `org_id` `NULL` según el orden de la cascada.

```sql
BEGIN;
INSERT INTO auth.users (id, instance_id, aud, role, email, created_at, updated_at)
VALUES ('c0000000-0000-4000-8000-000000000020', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tmp@example.test', now(), now());
UPDATE public.profiles SET org_id = 'a1a1a1a1-0000-4000-8000-000000000001' WHERE id = 'c0000000-0000-4000-8000-000000000020';
INSERT INTO public.user_roles (user_id, role) VALUES ('c0000000-0000-4000-8000-000000000020', 'tecnico');
INSERT INTO public.user_areas (user_id, area_id, org_id)
VALUES ('c0000000-0000-4000-8000-000000000020', 'd0000000-0000-4000-8000-000000000001', 'a1a1a1a1-0000-4000-8000-000000000001');
DO $$
DECLARE antes bigint; despues bigint;
BEGIN
  SELECT count(*) INTO antes FROM public.audit_log;
  DELETE FROM auth.users WHERE id = 'c0000000-0000-4000-8000-000000000020';
  SELECT count(*) INTO despues FROM public.audit_log;
  IF despues < antes + 3 THEN
    RAISE EXCEPTION 'FALLO_DE_PRUEBA: la auditoría tenía % filas y quedó con % (se esperaban al menos 3 más)', antes, despues;
  END IF;
  RAISE NOTICE 'OK auditoría: % -> %', antes, despues;
END
$$;
ROLLBACK;
```

**U-05 · No inflar: un UPDATE que solo cambia `updated_at` no deja fila; un cambio real, sí.** Esperado (con T_SIN_FOTO recién cargada): 1 fila de auditoría (su `INSERT`) → 2 tras guardar respuestas → 2 tras guardar **las mismas** respuestas → 2 tras `SET title = title` → 3 tras un cambio real de título.

```sql
BEGIN;
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.audit_log WHERE table_name = 'tasks' AND record_id = 'f0000000-0000-4000-8000-000000000002'$q$, '1');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- función SECURITY DEFINER «como TEC_A1»
SELECT public.save_task_progress('f0000000-0000-4000-8000-000000000002', '{"limpieza": true}'::jsonb);
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.audit_log WHERE table_name = 'tasks' AND record_id = 'f0000000-0000-4000-8000-000000000002'$q$, '2');
SELECT public.save_task_progress('f0000000-0000-4000-8000-000000000002', '{"limpieza": true}'::jsonb);                   -- idéntico
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.audit_log WHERE table_name = 'tasks' AND record_id = 'f0000000-0000-4000-8000-000000000002'$q$, '2');
UPDATE public.tasks SET title = title WHERE id = 'f0000000-0000-4000-8000-000000000002';                                  -- solo cambia updated_at
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.audit_log WHERE table_name = 'tasks' AND record_id = 'f0000000-0000-4000-8000-000000000002'$q$, '2');
UPDATE public.tasks SET title = 'Título cambiado' WHERE id = 'f0000000-0000-4000-8000-000000000002';                       -- cambio real
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.audit_log WHERE table_name = 'tasks' AND record_id = 'f0000000-0000-4000-8000-000000000002'$q$, '3');
ROLLBACK;
```

(Si ya hiciste cambios confirmados sobre esa tarea, usa conteos relativos: el valor inicial puede no ser 1.)

**U-06 · Perfiles: sin email ni nombre en el registro, y un cambio de nombre sí queda registrado (sin valores).** Esperado: ninguna fila de `profiles` creada después de las migraciones trae `email` ni `full_name`; el cambio de nombre suma una fila `UPDATE` cuyo `old_data` y `new_data` son iguales salvo `updated_at`.

```sql
BEGIN;
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.audit_log
  WHERE table_name = 'profiles' AND record_id::text LIKE 'c0000000-%' AND (new_data ? 'email' OR new_data ? 'full_name' OR old_data ? 'email' OR old_data ? 'full_name')$q$, '0');
SELECT count(*) AS antes FROM public.audit_log WHERE table_name = 'profiles' AND action = 'UPDATE' AND record_id = 'c0000000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
UPDATE public.profiles SET full_name = 'Nombre nuevo' WHERE id = 'c0000000-0000-4000-8000-000000000003';
RESET ROLE;
SELECT count(*) AS despues FROM public.audit_log WHERE table_name = 'profiles' AND action = 'UPDATE' AND record_id = 'c0000000-0000-4000-8000-000000000003';   -- antes + 1
SELECT pruebas.debe_ser($q$SELECT ((old_data - 'updated_at') = (new_data - 'updated_at'))::text FROM public.audit_log
  WHERE table_name = 'profiles' AND action = 'UPDATE' AND record_id = 'c0000000-0000-4000-8000-000000000003' ORDER BY created_at DESC LIMIT 1$q$, 'true');
ROLLBACK;
```

(Las filas de `profiles` anteriores a la migración 3, como las del administrador real, pueden seguir teniendo email y nombre en `old_data`/`new_data`: no se limpian a menos que Bernardo lo decida.)

**U-07 · La organización queda en cada fila.** Esperado: `tasks` y `user_areas` traen la organización de la fila; `organizations`, su propio id; `user_roles`, la del perfil.

```sql
SELECT pruebas.debe_ser($q$SELECT org_id::text FROM public.audit_log WHERE table_name = 'tasks' AND action = 'INSERT' AND record_id = 'f0000000-0000-4000-8000-000000000001'$q$, 'a1a1a1a1-0000-4000-8000-000000000001');
SELECT pruebas.debe_ser($q$SELECT org_id::text FROM public.audit_log WHERE table_name = 'organizations' AND action = 'INSERT' AND record_id = 'a1a1a1a1-0000-4000-8000-000000000001'$q$, 'a1a1a1a1-0000-4000-8000-000000000001');
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.audit_log WHERE table_name = 'user_roles' AND action = 'INSERT' AND org_id = 'a1a1a1a1-0000-4000-8000-000000000001'$q$, '5');
```

(`5` = los cinco roles de la organización A cargados en la sección 2.)

**U-08 · TRUNCATE de las tablas de negocio.** Esperado: `service_role` y `authenticated` → `42501` «permission denied». El propietario **sí puede** (y no deja rastro en la auditoría): por eso la copia externa del registro está pendiente. La prueba del propietario se deshace con `ROLLBACK`.

```sql
BEGIN;
SET LOCAL ROLE service_role;
SELECT pruebas.debe_fallar($q$TRUNCATE public.tasks CASCADE$q$, '42501', 'permission denied');
SELECT pruebas.debe_fallar($q$TRUNCATE public.task_evidence$q$, '42501', 'permission denied');
SELECT pruebas.debe_fallar($q$TRUNCATE public.form_templates CASCADE$q$, '42501', 'permission denied');
SELECT pruebas.debe_fallar($q$TRUNCATE public.task_definitions$q$, '42501', 'permission denied');
SELECT pruebas.debe_fallar($q$TRUNCATE public.areas CASCADE$q$, '42501', 'permission denied');
SELECT pruebas.debe_fallar($q$TRUNCATE public.user_areas$q$, '42501', 'permission denied');
SELECT pruebas.debe_fallar($q$TRUNCATE public.organizations CASCADE$q$, '42501', 'permission denied');
RESET ROLE;
-- Como propietario funciona (documentado; se deshace):
TRUNCATE public.task_evidence;
ROLLBACK;
```

---

### 3.12 Tareas recurrentes

Fecha de prueba: **lunes 09-11-2026** (el martes es 10-11-2026). Con solo los datos de la sección 2 en la base de desarrollo.

**R-01 · Generación del lunes.** Esperado: **4** tareas (D01 diaria, D02 semanal lunes, D03 mensual día 9, D09 diaria sin asignado). **No** se generan D04 (martes), D05 (terminada), D06 (inactiva), D07 (plantilla retirada), D08 (cuenta desactivada) ni D10 (futura). Una segunda corrida el mismo día: **0**.

```sql
BEGIN;
SELECT pruebas.debe_ser($q$SELECT public.generate_recurring_tasks('2026-11-09'::date)::text$q$, '4');
SELECT pruebas.debe_ser($q$SELECT string_agg(right(definition_id::text, 2), ',' ORDER BY definition_id) FROM public.tasks WHERE scheduled_for = '2026-11-09'$q$, '01,02,03,09');
SELECT pruebas.debe_ser($q$SELECT public.generate_recurring_tasks('2026-11-09'::date)::text$q$, '0');
-- Atributos de la tarea generada por D01: estado, vencimiento = 12:00 hora de Chile, creador = el de la definición, sin duplicar.
SELECT pruebas.debe_ser($q$SELECT status::text || '|' || to_char(due_at AT TIME ZONE 'America/Santiago', 'YYYY-MM-DD HH24:MI') || '|' || created_by::text
  FROM public.tasks WHERE definition_id = '90000000-0000-4000-8000-000000000001' AND scheduled_for = '2026-11-09'$q$,
  'pendiente|2026-11-09 12:00|c0000000-0000-4000-8000-000000000001');
-- D03 y D09 no tienen asignado: las tareas quedan sin asignar (solo las ve el gestor).
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.tasks WHERE scheduled_for = '2026-11-09' AND assignee_id IS NULL$q$, '2');
ROLLBACK;
```

**R-02 · Generación del martes.** Esperado: **3** (D01, D04, D09).

```sql
BEGIN;
SELECT pruebas.debe_ser($q$SELECT public.generate_recurring_tasks('2026-11-10'::date)::text$q$, '3');
SELECT pruebas.debe_ser($q$SELECT string_agg(right(definition_id::text, 2), ',' ORDER BY definition_id) FROM public.tasks WHERE scheduled_for = '2026-11-10'$q$, '01,04,09');
ROLLBACK;
```

**R-03 · Quién puede ejecutarla.** Solo `service_role` (y el propietario). Esperado: `authenticated` y `anon` → `42501`.

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);   -- ADMIN_A
SELECT pruebas.debe_fallar($q$SELECT public.generate_recurring_tasks('2026-11-09'::date)$q$, '42501', 'permission denied for function');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pruebas.debe_fallar($q$SELECT public.generate_recurring_tasks('2026-11-09'::date)$q$, '42501', 'permission denied for function');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pruebas.debe_ser($q$SELECT public.generate_recurring_tasks('2026-11-09'::date)::text$q$, '4');
ROLLBACK;
```

**R-04 · Fecha en hora de Chile (`starts_on` y valor por defecto del generador).** Esperado: la definición creada sin `starts_on` toma la fecha de **Chile**, no la de UTC. Entre las 20:00/21:00 y la medianoche de Chile `hoy_utc` es el día siguiente y la prueba lo hace visible.

```sql
SELECT (now() AT TIME ZONE 'America/Santiago')::date AS hoy_chile, current_date AS hoy_utc_de_la_sesion;
SELECT column_default FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'task_definitions' AND column_name = 'starts_on';
-- esperado: contiene 'America/Santiago' y no CURRENT_DATE

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);   -- GESTOR_A
SELECT pruebas.debe_afectar($q$INSERT INTO public.task_definitions (template_id, title, frequency, assignee_id)
  VALUES ('e0000000-0000-4000-8000-000000000002', 'Def del gestor', 'diaria', 'c0000000-0000-4000-8000-000000000003')$q$, 1);
SELECT pruebas.debe_ser($q$SELECT (starts_on = (now() AT TIME ZONE 'America/Santiago')::date)::text FROM public.task_definitions WHERE title = 'Def del gestor'$q$, 'true');
ROLLBACK;
```

**R-05 · Reglas de las definiciones y quién las ve.**

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);   -- GESTOR_A
SELECT pruebas.debe_fallar($q$INSERT INTO public.task_definitions (template_id, title, frequency)
  VALUES ('e0000000-0000-4000-8000-000000000002', 'x', 'semanal')$q$, '23514', 'task_definitions_weekday_chk');             -- semanal sin día
SELECT pruebas.debe_fallar($q$INSERT INTO public.task_definitions (template_id, title, frequency)
  VALUES ('e0000000-0000-4000-8000-000000000002', 'x', 'mensual')$q$, '23514', 'task_definitions_day_chk');                  -- mensual sin día
SELECT pruebas.debe_fallar($q$INSERT INTO public.task_definitions (template_id, title, frequency, day_of_month)
  VALUES ('e0000000-0000-4000-8000-000000000002', 'x', 'mensual', 31)$q$, '23514', 'check constraint');                      -- día 31 no existe en todos los meses
SELECT pruebas.debe_fallar($q$INSERT INTO public.task_definitions (template_id, title, frequency, assignee_id)
  VALUES ('e0000000-0000-4000-8000-000000000002', 'x', 'diaria', 'c0000000-0000-4000-8000-000000000013')$q$, 'P0001', 'miembro activo de la organización');   -- asignado de otra organización
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.task_definitions$q$, '10');                                      -- el gestor ve las 10 de su organización
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.task_definitions$q$, '0');                                       -- el técnico no ve definiciones
SELECT pruebas.debe_fallar($q$INSERT INTO public.task_definitions (template_id, title, frequency)
  VALUES ('e0000000-0000-4000-8000-000000000002', 'x', 'diaria')$q$, '42501', 'row-level security');
SELECT pruebas.debe_fallar($q$DELETE FROM public.task_definitions$q$, '42501', 'permission denied');                           -- nadie borra definiciones: se desactivan
ROLLBACK;
```

---

### 3.13 Versionado de plantillas

**L-01 · Publicar versiones y anclaje de las tareas abiertas.**

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);   -- GESTOR_A

-- Versión 1, una tarea abierta anclada a ella y una definición recurrente que la usa.
SELECT pruebas.debe_ser($q$SELECT (public.create_form_template('Limpieza diaria', '{"requires_photo": false, "steps": [{"key": "a", "label": "Paso A"}]}'::jsonb)).version::text$q$, '1');
INSERT INTO public.tasks (title, template_id, assignee_id)
  SELECT 'Tarea anclada a v1', id, 'c0000000-0000-4000-8000-000000000003' FROM public.form_templates WHERE name = 'Limpieza diaria' AND version = 1;
INSERT INTO public.task_definitions (template_id, title, frequency)
  SELECT id, 'Def sobre v1', 'diaria' FROM public.form_templates WHERE name = 'Limpieza diaria' AND version = 1;

-- Versión 2 (otro contenido): la 1 queda inactiva; el nombre se compara sin distinguir mayúsculas.
SELECT pruebas.debe_ser($q$SELECT (public.create_form_template('LIMPIEZA DIARIA', '{"requires_photo": false, "steps": [{"key": "a", "label": "Paso A"}, {"key": "b", "label": "Paso B"}]}'::jsonb)).version::text$q$, '2');
SELECT pruebas.debe_ser($q$SELECT active::text FROM public.form_templates WHERE lower(name) = 'limpieza diaria' AND version = 1$q$, 'false');
SELECT pruebas.debe_ser($q$SELECT active::text FROM public.form_templates WHERE lower(name) = 'limpieza diaria' AND version = 2$q$, 'true');

-- La definición recurrente pasó sola a la versión vigente (v2); la tarea ya creada NO cambió (sigue en v1).
SELECT pruebas.debe_ser($q$SELECT (template_id = (SELECT id FROM public.form_templates WHERE lower(name) = 'limpieza diaria' AND version = 2))::text FROM public.task_definitions WHERE title = 'Def sobre v1'$q$, 'true');
SELECT pruebas.debe_ser($q$SELECT (template_id = (SELECT id FROM public.form_templates WHERE lower(name) = 'limpieza diaria' AND version = 1))::text FROM public.tasks WHERE title = 'Tarea anclada a v1'$q$, 'true');

-- Una tarea NUEVA con la versión inactiva no se puede crear.
SELECT pruebas.debe_fallar($q$INSERT INTO public.tasks (title, template_id) SELECT 'x', id FROM public.form_templates WHERE lower(name) = 'limpieza diaria' AND version = 1$q$, 'P0001', 'La plantilla no está disponible');

-- La tarea abierta se completa contra SU versión (v1: solo el paso «a»), aunque v1 esté inactiva.
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
SELECT pruebas.debe_fallar($q$SELECT public.complete_task((SELECT id FROM public.tasks WHERE title = 'Tarea anclada a v1'))$q$, '23514', 'Faltan pasos obligatorios por responder: Paso A');
SELECT public.save_task_progress((SELECT id FROM public.tasks WHERE title = 'Tarea anclada a v1'), '{"a": true}'::jsonb);
SELECT pruebas.debe_ser($q$SELECT (public.complete_task((SELECT id FROM public.tasks WHERE title = 'Tarea anclada a v1'))).status::text$q$, 'completada');
-- El técnico ve la plantilla de su tarea aunque esté inactiva:
SELECT pruebas.debe_ser($q$SELECT count(*)::text FROM public.form_templates WHERE lower(name) = 'limpieza diaria'$q$, '1');
ROLLBACK;
```

**L-02 · Una versión no se edita ni se reactiva si hay una mayor.**

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);   -- GESTOR_A
SELECT public.create_form_template('Plantilla de prueba', '{"requires_photo": false, "steps": []}'::jsonb);                       -- v1
SELECT public.create_form_template('Plantilla de prueba', '{"requires_photo": true, "min_photos": 2, "steps": []}'::jsonb);      -- v2

-- Editar el contenido: el gestor no tiene privilegio de columna.
SELECT pruebas.debe_fallar($q$UPDATE public.form_templates SET schema = '{"requires_photo": false, "steps": []}' WHERE name = 'Plantilla de prueba' AND version = 2$q$, '42501', 'permission denied');
SELECT pruebas.debe_fallar($q$INSERT INTO public.form_templates (name, version, schema) VALUES ('X', 1, '{"requires_photo": false, "steps": []}')$q$, '42501', 'permission denied');

-- Reactivar la versión antigua (v1) estando la v2: rechazado, también para el propietario.
SELECT pruebas.debe_fallar($q$UPDATE public.form_templates SET active = true WHERE name = 'Plantilla de prueba' AND version = 1$q$, '23514', 'No se puede reactivar una versión anterior a la vigente');
RESET ROLE;
SELECT pruebas.debe_fallar($q$UPDATE public.form_templates SET active = true WHERE name = 'Plantilla de prueba' AND version = 1$q$, '23514', 'No se puede reactivar una versión anterior a la vigente');
SELECT pruebas.debe_fallar($q$UPDATE public.form_templates SET schema = '{"requires_photo": false, "steps": []}' WHERE name = 'Plantilla de prueba' AND version = 2$q$, 'P0001', 'Una versión de plantilla no se edita');
SELECT pruebas.debe_fallar($q$UPDATE public.form_templates SET name = 'Otro' WHERE name = 'Plantilla de prueba' AND version = 2$q$, 'P0001', 'Una versión de plantilla no se edita');

-- Retirar la vigente (v2) y volver a activarla es válido; la v1 sigue sin poder reactivarse.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SELECT pruebas.debe_afectar($q$UPDATE public.form_templates SET active = false WHERE name = 'Plantilla de prueba' AND version = 2$q$, 1);
SELECT pruebas.debe_afectar($q$UPDATE public.form_templates SET active = true WHERE name = 'Plantilla de prueba' AND version = 2$q$, 1);
SELECT pruebas.debe_afectar($q$UPDATE public.form_templates SET active = false WHERE name = 'Plantilla de prueba' AND version = 2$q$, 1);
SELECT pruebas.debe_fallar($q$UPDATE public.form_templates SET active = true WHERE name = 'Plantilla de prueba' AND version = 1$q$, '23514', 'No se puede reactivar una versión anterior a la vigente');
ROLLBACK;
```

**L-03 · Validación de la estructura y permisos de `create_form_template`.**

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);   -- GESTOR_A
SELECT pruebas.debe_fallar($q$SELECT public.create_form_template('X', '{"steps": []}'::jsonb)$q$, 'P0001', 'La estructura de la plantilla no es válida');                                           -- falta requires_photo
SELECT pruebas.debe_fallar($q$SELECT public.create_form_template('X', '{"requires_photo": false, "steps": [{"key": "a b", "label": "x"}]}'::jsonb)$q$, 'P0001', 'La estructura de la plantilla no es válida');   -- llave con espacio
SELECT pruebas.debe_fallar($q$SELECT public.create_form_template('X', '{"requires_photo": false, "steps": [{"key": "a", "label": "x"}, {"key": "a", "label": "y"}]}'::jsonb)$q$, 'P0001', 'La estructura de la plantilla no es válida');   -- llave repetida
SELECT pruebas.debe_fallar($q$SELECT public.create_form_template('X', '{"requires_photo": true, "min_photos": 21, "steps": []}'::jsonb)$q$, 'P0001', 'La estructura de la plantilla no es válida');   -- más de 20 fotos
SELECT pruebas.debe_fallar($q$SELECT public.create_form_template('   ', '{"requires_photo": false, "steps": []}'::jsonb)$q$, 'P0001', 'El nombre de la plantilla es obligatorio');
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);   -- TEC_A1
SELECT pruebas.debe_fallar($q$SELECT public.create_form_template('X', '{"requires_photo": false, "steps": []}'::jsonb)$q$, '42501', 'Solo administradores y gestores');
ROLLBACK;
```

**L-04 · Concurrencia (manual, dos sesiones).** Sesión 1: `BEGIN;` y `SELECT public.create_form_template(...)` con sesión simulada del gestor, **sin** `COMMIT`. Sesión 2: la misma llamada con el mismo nombre: debe **quedar esperando** (bloqueo de asesoría por nombre) hasta que la sesión 1 haga `COMMIT` o `ROLLBACK`. Tras el `COMMIT`, la sesión 2 obtiene la versión siguiente, sin repetir número.

---

## 4. Limpieza

Solo en el proyecto de **DESARROLLO**. Son borrados masivos: no los ejecutes en un proyecto con datos que importen. Si el proyecto de desarrollo es desechable, lo más simple es descartarlo o restaurarlo y no correr nada de esto.

Lo que **no se puede limpiar**: las filas de `audit_log` que dejó la carga (la auditoría es inmutable). Es esperado.

```sql
-- 1) Arnés de pruebas
DROP SCHEMA IF EXISTS pruebas CASCADE;

-- 2) Datos de prueba, en orden de dependencias (el propietario puede borrar; los triggers de auditoría lo registran).
DELETE FROM public.task_evidence WHERE org_id IN ('a1a1a1a1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001');
DELETE FROM public.tasks WHERE org_id IN ('a1a1a1a1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001');
DELETE FROM public.task_definitions WHERE org_id IN ('a1a1a1a1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001');
DELETE FROM public.form_templates WHERE org_id IN ('a1a1a1a1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001');
DELETE FROM public.user_areas WHERE org_id IN ('a1a1a1a1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001');
DELETE FROM public.areas WHERE org_id IN ('a1a1a1a1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001');
-- Las cuentas (cascada a profiles y user_roles; si borras a todos los administradores verás el WARNING de «sin administradores»).
DELETE FROM auth.users WHERE email LIKE '%@example.test';
DELETE FROM public.organizations WHERE id IN ('a1a1a1a1-0000-4000-8000-000000000001', 'b1b1b1b1-0000-4000-8000-000000000001');
```

Los objetos de Storage de la prueba por API (3.10) se eliminan desde el panel o por la API de Storage, no con `DELETE` en SQL. Las tres cuentas de `api_*` se borran desde Authentication (después de borrar sus tareas).

---

## 5. Qué NO cubre esta guía (pendientes y supuestos sin verificar)

- **Contenido real de la foto** (magic bytes): no se verifica; exige una Edge Function. La guía solo prueba tamaño, tipo declarado y `eTag`.
- **Nombres de clave de `storage.objects.metadata`** (`size`, `mimetype`, `eTag`) y comportamiento del `eTag`: se comprueban con A-02 y A-06.
- **Que el rol propietario se salte la RLS de `storage.objects`** (E-11) y que el conteo por rango use un índice (S-06).
- **Que el `INSERT` directo en `auth.users` y en `storage.objects`** funcione en tu versión de Supabase.
- **Que `auth.uid()` lea `request.jwt.claims`** (F-01).
- **Frecuencia de guardados por cuenta** (limitar la tasa): se hace fuera de SQL.
- **Copia de la auditoría fuera de la base** y plazo de retención: decisión pendiente. El propietario puede vaciar tablas de negocio con `TRUNCATE` sin dejar rastro.
- **Eliminación de datos personales:** las claves foráneas `RESTRICT` y la auditoría inmutable impiden borrar a una persona con historial (decisión pendiente).
- **`invitations`**: ya existe (migración de Acceso, ADR-0005) y se prueba en la sección 6. M-05 sigue mostrando la limitación de `admin_list_unassigned_accounts` con más de una organización.
- **Otros proyectos de Supabase de Dentimagen (inventario):** no se tocan.
- **Concurrencia real** (dos sesiones a la vez): solo L-04, a mano.


---

## 6. Acceso (migración 20261112120000, ADR-0005)

Requiere la migración `20261112120000_acceso_invitaciones_y_mi_acceso.sql` aplicada **después** de las cuatro de la Etapa 1, y los datos de la sección 2.

> **Ojo con el arnés:** desde esta migración, un Administrador necesita `"aal":"aal2"` en `request.jwt.claims`. Las secciones anteriores ya lo traen para ADMIN_A y ADMIN_B. Sin eso, `auth_role()` devuelve nulo y las pruebas de administrador fallan. Ese es justamente el caso X-02.

Cada caso se corre dentro de `BEGIN; … ROLLBACK;`.

| Id | Qué prueba | Cómo | Resultado esperado |
|---|---|---|---|
| X-01 | `mi_acceso()` de un técnico habilitado | claims de TEC_A1; `SELECT * FROM public.mi_acceso();` | 1 fila: `habilitada = true`, `motivo` nulo, `rol = tecnico`, `mfa_requerida = false` |
| X-02 | **Administrador sin dos pasos** | claims de ADMIN_A **sin** `aal` (o con `"aal":"aal1"`); `SELECT public.auth_role(), public.is_admin();` y `SELECT * FROM public.mi_acceso();` | `auth_role` nulo, `is_admin = false`; `mi_acceso`: `habilitada = false`, `motivo = requiere_dos_pasos` |
| X-03 | Administrador **con** dos pasos | claims de ADMIN_A con `"aal":"aal2"` | `auth_role = admin`; `mi_acceso` habilitada |
| X-04 | Administrador aal1 contra la API | claims de ADMIN_A sin `aal`, `SET LOCAL ROLE authenticated;` `SELECT count(*) FROM public.tasks;` y `SELECT public.admin_set_active('c0000000-0000-4000-8000-000000000004', false);` | 0 filas; la función falla con 42501 |
| X-05 | Orden de los motivos | claims de DESACT, SIN_ROL y SIN_ORG, uno a la vez | `desactivada`, `sin_rol` y `sin_organizacion` |
| X-06 | Correo sin confirmar | como propietario: `UPDATE auth.users SET email_confirmed_at = NULL WHERE id = TEC_A1;` luego claims de TEC_A1 | `mi_acceso.motivo = correo_sin_confirmar`; `auth_role` nulo; `vincular_invitacion() = 'correo_sin_confirmar'` |
| X-07 | Crear invitación | claims de ADMIN_A (aal2): `SELECT public.admin_create_invitation('nueva@example.test', 'tecnico', ARRAY['d0000000-0000-4000-8000-000000000001']::uuid[]);` | Devuelve un id; fila en `invitations`; fila `INVITE` en `audit_log` **sin** el correo en `new_data` |
| X-08 | Invitación doble | repetir X-07 con el mismo correo | Error «Ya hay una invitación vigente…» |
| X-09 | Invitar a un miembro | `admin_create_invitation('tec_a2@example.test', …)` | Error «Esa persona ya pertenece a la organización…» |
| X-10 | Área de otra organización | `admin_create_invitation('x@example.test', 'tecnico', ARRAY[AREA_B1])` | Error de áreas |
| X-11 | Gestor no invita | claims de GESTOR_A | Error 42501 |
| X-12 | **Vincular** | Tras X-07, como propietario crea la cuenta `nueva@example.test` en `auth.users` con `email_confirmed_at = now()`; con sus claims: `SELECT public.vincular_invitacion();` y `SELECT * FROM public.mi_acceso();` | `vinculada`; perfil con org A, rol técnico, área A1; invitación con `accepted_at`; `mi_acceso` habilitada. Repetir `vincular_invitacion()` devuelve `sin_cambios` |
| X-13 | Invitación vencida | como propietario: `UPDATE invitations SET expires_at = now() - interval '1 minute'` antes de X-12 | `sin_cambios`; `mi_acceso.motivo = sin_organizacion` |
| X-14 | Invitación revocada | `admin_revoke_invitation(id)` antes de X-12 | `sin_cambios`; sin organización |
| X-15 | No mueve de organización | invitación de ORG_A para el correo de TEC_B1; con sus claims, `vincular_invitacion()` | `otra_organizacion`; TEC_B1 sigue en ORG_B |
| X-16 | Cuenta desactivada no se vincula | invitación para `desact@example.test`… | Bloqueada antes, por X-09 (ya es miembro). Con una cuenta sin organización y desactivada: `desactivada` |
| X-17 | Lectura de invitaciones | claims de GESTOR_A y TEC_A1: `SELECT count(*) FROM public.invitations;` | 0 filas para los dos; ADMIN_A (aal2) ve las de ORG_A, nunca las de ORG_B |
| X-18 | Nadie escribe directo | claims de ADMIN_A, `SET LOCAL ROLE authenticated;` `INSERT INTO public.invitations …` y `UPDATE public.invitations SET role = 'admin'` | permission denied |
| X-19 | Marcar envío | `SET LOCAL ROLE authenticated;` `SELECT public.admin_mark_invitation_sent(id, NULL);` | permission denied. Con `SET LOCAL ROLE service_role;` funciona |
| X-20 | Inactividad | ADMIN_A (aal2): `UPDATE public.organizations SET idle_timeout_minutes = 30 WHERE id = ORG_A;` y luego `= 2` | 30 se guarda y aparece en `mi_acceso.inactividad_minutos`; 2 viola el CHECK |
