# Arranque: la primera organización y el primer Administrador

Se hace **una sola vez por proyecto** de Supabase. Es el único momento en que un rol se asigna fuera de la app (CLAUDE.md: «El primer administrador se asigna a mano»). Lo ejecuta Bernardo en el *SQL Editor* del panel, que corre como propietario.

## Antes de empezar

1. Están aplicadas, en orden, las migraciones de la Etapa 1 y `20261112120000_acceso_invitaciones_y_mi_acceso.sql`.
2. Está marcada la [configuración de Supabase Auth](configuracion-supabase-auth.md), con el SMTP incluido.
3. Están desplegadas las funciones `invitar` y `bloquear-cuenta`.

## Pasos

### 1. Crear la cuenta del primer Administrador

En *Authentication › Users › Invite user*, escribe el correo de la persona. Le llega el correo de invitación.

La persona abre el enlace, pulsa **Continuar** (A9) y crea su clave (A6). Todavía **no** tiene acceso: verá «Tu cuenta no tiene una invitación vigente».

### 2. Crear la organización y asignarla (SQL revisado)

Reemplaza los dos valores entre `«»` y ejecuta el bloque completo:

```sql
-- Arranque de DentiHub: organización y primer Administrador. Se ejecuta UNA vez.
DO $$
DECLARE
  v_email text := lower(btrim('«correo-del-administrador»'));
  v_user uuid;
  v_org uuid;
BEGIN
  SELECT id INTO v_user FROM auth.users WHERE lower(email) = v_email AND email_confirmed_at IS NOT NULL;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'No existe una cuenta CONFIRMADA con ese correo. Haz primero el paso 1.';
  END IF;

  -- Una sola organización (ADR-0004). Si ya existe, se reutiliza.
  SELECT id INTO v_org FROM public.organizations ORDER BY created_at LIMIT 1;
  IF v_org IS NULL THEN
    INSERT INTO public.organizations (name) VALUES ('«Nombre de la empresa cliente»') RETURNING id INTO v_org;
  END IF;

  UPDATE public.profiles SET org_id = v_org, active = true WHERE id = v_user AND org_id IS NULL;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user, 'admin')
  ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

  INSERT INTO public.audit_log (org_id, table_name, record_id, action, new_data, actor_id)
  VALUES (v_org, 'profiles', v_user, 'BOOTSTRAP_ADMIN', jsonb_build_object('role', 'admin'), NULL);
END
$$;
```

### 3. Activar la verificación en dos pasos

La persona ingresa a la app con su correo y su clave. Como es Administradora, la app la lleva a **A2b Activar verificación**:
1. escanea el QR con una app autenticadora;
2. escribe el código;
3. entra a Inicio.

Hasta completar este paso, la base no le da ningún permiso.

### 4. Segundo Administrador (obligatorio antes de producción)

Desde la app, el primer Administrador va a **Administración › Personas › Invitar persona** y elige el rol **Administrador**. La segunda persona acepta la invitación y activa su verificación en dos pasos.

Así, si alguien pierde su teléfono, hay otra persona que puede ayudarle ([recuperar un Administrador](recuperar-administrador.md)).

### 5. Comprobar

```sql
-- Debe devolver al menos 2 filas, todas con organización, activas y con el factor verificado.
SELECT p.id, p.active, p.org_id IS NOT NULL AS con_org,
       EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = p.id AND f.status = 'verified') AS dos_pasos
FROM public.profiles p JOIN public.user_roles r ON r.user_id = p.id
WHERE r.role = 'admin';
```

Desde aquí, **todas** las demás personas entran por invitación desde la app, y nadie más asigna roles por SQL.
