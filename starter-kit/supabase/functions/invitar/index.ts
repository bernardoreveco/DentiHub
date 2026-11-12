// Función de servidor «invitar» (ADR-0005, pantalla A7).
// El Administrador invita (o reenvía) desde Administración › Personas. Pasos:
//   1) Con el JWT de quien llama, la BASE valida y registra la invitación (admin_create_invitation o
//      admin_resend_invitation). Esas funciones exigen Administrador activo con aal2 y lo auditan.
//      Así la regla vive en la base y esta función no puede saltársela.
//   2) Con la clave de servicio (solo aquí, nunca en el navegador) se pide a Supabase Auth el correo.
//      Si la cuenta ya existe en Auth (p. ej. una invitación anterior revocada), se envía un enlace de
//      recuperación: al usarlo, vincular_invitacion() aplica la invitación nueva.
//   3) Se registra si el correo salió o falló (admin_mark_invitation_sent), para que el Administrador
//      vea «error de envío» y pueda reenviar.
// Cuerpo: { "accion": "crear", "email": "...", "role": "tecnico", "area_ids": ["..."] }
//      o  { "accion": "reenviar", "id": "<uuid de la invitación>" }
import { createClient } from "jsr:@supabase/supabase-js@2";
import { APP_URL, encabezados, mensajeDeBase, responder, variable } from "../_compartido/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: encabezados(req.headers.get("Origin")) });
  if (req.method !== "POST") return responder(req, { error: "Método no permitido." }, 405);

  const jwt = req.headers.get("Authorization");
  if (!jwt) return responder(req, { error: "Tu sesión no es válida. Vuelve a ingresar." }, 401);

  let cuerpo: { accion?: string; email?: string; role?: string; area_ids?: string[]; id?: string };
  try {
    cuerpo = await req.json();
  } catch {
    return responder(req, { error: "Solicitud inválida." }, 400);
  }

  const url = variable("SUPABASE_URL");
  // Cliente «como la persona»: todas las reglas y la auditoría las aplica la base con su identidad.
  const comoPersona = createClient(url, variable("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: jwt } },
    auth: { persistSession: false },
  });
  // Cliente de servicio: SOLO para Auth admin, leer el correo de la invitación y marcar el envío.
  const servicio = createClient(url, variable("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  // 1) Registrar o reenviar en la base (valida admin + aal2).
  let id: string;
  if (cuerpo.accion === "crear") {
    const { data, error } = await comoPersona.rpc("admin_create_invitation", {
      p_email: cuerpo.email ?? "",
      p_role: cuerpo.role,
      p_area_ids: cuerpo.area_ids ?? [],
    });
    if (error) return responder(req, { error: mensajeDeBase(error) }, 400);
    id = data as string;
  } else if (cuerpo.accion === "reenviar" && cuerpo.id) {
    const { error } = await comoPersona.rpc("admin_resend_invitation", { p_id: cuerpo.id });
    if (error) return responder(req, { error: mensajeDeBase(error) }, 400);
    id = cuerpo.id;
  } else {
    return responder(req, { error: "Acción desconocida." }, 400);
  }

  const { data: inv, error: errInv } = await servicio
    .from("invitations")
    .select("email")
    .eq("id", id)
    .single();
  if (errInv || !inv) return responder(req, { error: "No se encontró la invitación." }, 500);

  // 2) Enviar el correo. El enlace lleva a A9 (/auth/confirmar), que canjea el código con un botón.
  const redirectTo = `${APP_URL}/auth/confirmar`;
  let fallo: string | null = null;
  const invitacion = await servicio.auth.admin.inviteUserByEmail(inv.email, { redirectTo });
  if (invitacion.error) {
    const yaExiste =
      invitacion.error.status === 422 || /already been registered|email_exists/i.test(invitacion.error.message);
    if (yaExiste) {
      const rec = await servicio.auth.resetPasswordForEmail(inv.email, { redirectTo });
      if (rec.error) fallo = rec.error.message;
    } else {
      fallo = invitacion.error.message;
    }
  }

  // 3) Registrar el resultado del envío (el detalle técnico queda en la tabla, no se muestra).
  await servicio.rpc("admin_mark_invitation_sent", { p_id: id, p_error: fallo });

  if (fallo) {
    return responder(req, {
      id,
      enviado: false,
      aviso: "La invitación quedó registrada, pero el correo no salió. Pulsa Reenviar en unos minutos.",
    });
  }
  return responder(req, { id, enviado: true });
});
