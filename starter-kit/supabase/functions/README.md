# Funciones de servidor de DentiHub (Supabase Edge Functions)

> ⚠ **No desplegadas.** Se despliegan con la confirmación de Bernardo, después de aplicar la migración `20261112120000_acceso_invitaciones_y_mi_acceso.sql`.

| Función | Para qué | Quién la llama |
|---|---|---|
| `invitar` | Registra una invitación (o la reenvía) **en la base** y pide a Supabase Auth el correo. Si la cuenta ya existe en Auth, envía un enlace de recuperación. | La app, desde Administración › Personas (Administrador con verificación en dos pasos) |
| `bloquear-cuenta` | Activa o desactiva una cuenta en la base (efecto inmediato) y la bloquea o desbloquea en Auth | La app, desde Administración › Personas |

Las dos aplican las reglas **en la base**, con el JWT de quien llama. La clave de servicio se usa solo para lo que la base no puede hacer:
- enviar el correo;
- bloquear la cuenta en Auth;
- leer el correo de la invitación;
- marcar si el correo salió.

## Variables de entorno (solo los nombres; los valores se cargan en el panel de Supabase)

| Nombre | Qué es |
|---|---|
| `APP_URL` | URL exacta de la app en producción, por ejemplo `https://dentihub.vercel.app` (es la única página que puede llamarlas, además de `http://localhost:5173`) |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Las entrega Supabase solo dentro de las funciones. **La clave de servicio nunca sale de aquí.** |

## Desplegar (cuando Bernardo lo confirme)

```bash
supabase functions deploy invitar
```

```bash
supabase functions deploy bloquear-cuenta
```

Las dos verifican el JWT. **No** usar `--no-verify-jwt`.
