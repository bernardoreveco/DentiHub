// Función de servidor «bloquear-cuenta» (ADR-0005): activar o desactivar una cuenta POR COMPLETO.
//   1) Con el JWT de quien llama, la base ejecuta admin_set_active: valida Administrador con aal2,
//      protege a la última persona administradora, prohíbe desactivarse a sí misma y lo audita.
//      Desde este momento la RLS ya le niega todos los datos (efecto inmediato).
//   2) Con la clave de servicio se bloquea (o desbloquea) la cuenta en Supabase Auth con ban_duration:
//      una cuenta bloqueada no puede ingresar ni renovar su sesión, así que su sesión termina, a más
//      tardar, cuando vence el token (30 minutos, ADR-0005). Durante ese rato la base ya no le entrega nada.
//   Si el paso 2 falla, la cuenta igual queda desactivada en la base: se avisa del fallo parcial para
//   reintentar (llamar de nuevo es seguro: admin_set_active no repite la auditoría si no hay cambio).
// Cuerpo: { "user_id": "<uuid>", "activa": false }
import { createClient } from "jsr:@supabase/supabase-js@2";
import { encabezados, mensajeDeBase, responder, variable } from "../_compartido/cors.ts";

// ~100 años: Supabase Auth no tiene un bloqueo «indefinido»; «none» lo quita.
const BLOQUEO = "876000h";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: encabezados(req.headers.get("Origin")) });
  if (req.method !== "POST") return responder(req, { error: "Método no permitido." }, 405);

  const jwt = req.headers.get("Authorization");
  if (!jwt) return responder(req, { error: "Tu sesión no es válida. Vuelve a ingresar." }, 401);

  let cuerpo: { user_id?: string; activa?: boolean };
  try {
    cuerpo = await req.json();
  } catch {
    return responder(req, { error: "Solicitud inválida." }, 400);
  }
  if (!cuerpo.user_id || typeof cuerpo.activa !== "boolean") {
    return responder(req, { error: "Faltan datos: la persona y el estado." }, 400);
  }

  const url = variable("SUPABASE_URL");
  const comoPersona = createClient(url, variable("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: jwt } },
    auth: { persistSession: false },
  });
  const servicio = createClient(url, variable("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  // 1) La base decide y audita.
  const { error } = await comoPersona.rpc("admin_set_active", {
    p_user_id: cuerpo.user_id,
    p_active: cuerpo.activa,
  });
  if (error) return responder(req, { error: mensajeDeBase(error) }, 400);

  // 2) Bloqueo en Auth.
  const { error: errAuth } = await servicio.auth.admin.updateUserById(cuerpo.user_id, {
    ban_duration: cuerpo.activa ? "none" : BLOQUEO,
  });
  if (errAuth) {
    return responder(req, {
      ok: true,
      bloqueo_auth: false,
      aviso: cuerpo.activa
        ? "La cuenta quedó activa en DentiHub, pero no se pudo desbloquear el ingreso. Inténtalo de nuevo."
        : "La cuenta ya no ve datos, pero no se pudo bloquear su ingreso. Inténtalo de nuevo.",
    });
  }
  return responder(req, { ok: true, bloqueo_auth: true });
});
