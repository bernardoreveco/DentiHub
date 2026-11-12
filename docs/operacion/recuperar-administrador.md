# Recuperar a un Administrador que perdió su teléfono

Situación: un Administrador ya no tiene la app autenticadora (perdió o cambió el teléfono). Su clave sigue funcionando, pero la base no le da permisos sin la verificación en dos pasos (`aal2`), así que queda en la pantalla **A2**.

## Quién puede hacerlo

- **Lo normal:** el propietario del proyecto de Supabase (Bernardo o quien designe la empresa cliente), desde el panel.
- **Antes de hacerlo:** confirma la identidad de la persona por un canal distinto del correo. Por ejemplo, en persona o con una llamada a un número que ya conocías. Quien pide «reinicia mi verificación» puede ser alguien que robó la clave.

## Pasos

1. En *Authentication › Users*, busca a la persona por su correo y abre su ficha.
2. En la sección de factores (MFA), **elimina** su factor TOTP.
3. Deja constancia en la auditoría desde el *SQL Editor* (reemplaza el correo):

   ```sql
   INSERT INTO public.audit_log (org_id, table_name, record_id, action, new_data, actor_id)
   SELECT p.org_id, 'profiles', p.id, 'RESET_MFA',
          jsonb_build_object('motivo', 'teléfono perdido', 'verificado_por', 'propietario'), NULL
   FROM public.profiles p JOIN auth.users u ON u.id = p.id
   WHERE lower(u.email) = lower('«correo-del-administrador»');
   ```

4. La persona vuelve a ingresar. Como ya no tiene un factor, la app la lleva a **A2b** para activar la verificación en el teléfono nuevo.

## Si sospechas que la cuenta está comprometida

Antes del paso 4:
- otro Administrador la **desactiva** desde la app, lo que bloquea su ingreso en Auth;
- el propietario le cambia la clave enviándole un enlace de recuperación.

Después se reactiva.

## Prevención

- Siempre hay **al menos 2 Administradores** activos con la verificación en dos pasos ([arranque](arranque.md), paso 4).
- Recomienda una app autenticadora con respaldo en la nube, como Google Authenticator con cuenta o Microsoft Authenticator. Así, cambiar de teléfono no obliga a este procedimiento.
