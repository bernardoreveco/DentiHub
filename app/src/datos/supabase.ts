// Fuente de datos REAL (Supabase). Esta primera entrega conecta Acceso y Administración (ADR-0005).
// Operación (tareas, checklist y fotos) llega con su propio paso y, mientras tanto, lanza un error
// claro: nunca devuelve datos falsos.
//
// Reglas que se respetan aquí:
//   - Toda decisión de permisos la toma la BASE (RLS y funciones). Esta capa solo traduce.
//   - Un error de red o del servidor es ErrorDeConexion (se reintenta); nunca se confunde con «sin acceso».
//   - Los mensajes no revelan si un correo existe (A1, A5).
//   - Lo que necesita la clave de servicio (invitar, bloquear) pasa por funciones de servidor.
import type { AuthError, SupabaseClient } from "@supabase/supabase-js";
import { FunctionsFetchError, FunctionsHttpError } from "@supabase/supabase-js";
import type { FuenteDatos } from "@/datos/fuente";
import { ErrorDeConexion, ErrorDeRegla } from "@/datos/errores";
import type {
  ContextoAcceso,
  EstadoInvitacion,
  Invitacion,
  MotivoSinAcceso,
  Persona,
  RegistroAuditoria,
  ResultadoInvitacion,
} from "@/datos/tipos";
import { isAppRole, type AppRole } from "@/lib/roles";

const PENDIENTE_OPERACION =
  "Las tareas todavía no están conectadas a la base de datos: llegan en el siguiente paso (módulo Operación).";

const MOTIVOS: readonly MotivoSinAcceso[] = [
  "correo_sin_confirmar",
  "desactivada",
  "sin_organizacion",
  "sin_rol",
  "requiere_dos_pasos",
];

/** ¿Es un problema de conexión o del servidor (se reintenta) y no una respuesta de la base? */
function esConexion(status: number | undefined, error: { code?: string; message?: string } | null) {
  if (status === 0 || (status !== undefined && status >= 500)) return true;
  return !!error && !error.code && /fetch|network|Failed to/i.test(error.message ?? "");
}

function esConexionAuth(error: AuthError) {
  return error.name === "AuthRetryableFetchError" || error.status === 0 || (error.status ?? 0) >= 500;
}

/** Errores de las funciones de servidor: su cuerpo { error } ya viene escrito para la persona. */
async function errorDeFuncion(error: unknown): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    try {
      const cuerpo = (await error.context.json()) as { error?: string };
      if (cuerpo.error) return new ErrorDeRegla(cuerpo.error);
    } catch {
      // cuerpo ilegible: mensaje genérico
    }
    return new ErrorDeRegla("No se pudo completar la acción. Inténtalo de nuevo.");
  }
  if (error instanceof FunctionsFetchError) return new ErrorDeConexion();
  return new ErrorDeConexion("No pudimos hablar con el servidor. Inténtalo de nuevo en unos minutos.");
}

function estadoInvitacion(f: {
  revoked_at: string | null;
  accepted_at: string | null;
  expires_at: string;
  send_error: string | null;
  sent_at: string | null;
}): EstadoInvitacion {
  if (f.revoked_at) return "revocada";
  if (f.accepted_at) return "aceptada";
  if (new Date(f.expires_at) <= new Date()) return "vencida";
  if (f.send_error) return "error_envio";
  return f.sent_at ? "enviada" : "pendiente";
}

const ACCION: Record<string, string> = {
  INSERT: "Creó un registro",
  UPDATE: "Modificó un registro",
  DELETE: "Eliminó un registro",
  INVITE: "Invitó a una persona",
  RESEND_INVITE: "Reenvió una invitación",
  REVOKE_INVITE: "Revocó una invitación",
  ACCEPT_INVITE: "Aceptó su invitación",
  SET_ACTIVE: "Cambió el estado de una cuenta",
  ASSIGN_MEMBER: "Asignó rol y áreas a una persona",
};
const TABLA: Record<string, string> = {
  profiles: "personas",
  user_roles: "roles",
  user_areas: "áreas de personas",
  areas: "áreas",
  organizations: "organización",
  invitations: "invitaciones",
  tasks: "tareas",
  task_evidence: "fotos de evidencia",
  form_templates: "plantillas",
  task_definitions: "tareas programadas",
};
const OPERACION = new Set(["tasks", "task_evidence", "form_templates", "task_definitions"]);

export function crearFuenteSupabase(sb: SupabaseClient): FuenteDatos {
  async function invocar(nombre: string, cuerpo: Record<string, unknown>) {
    const { data, error } = await sb.functions.invoke(nombre, { body: cuerpo });
    if (error) throw await errorDeFuncion(error);
    return data as { enviado?: boolean; aviso?: string; bloqueo_auth?: boolean };
  }

  return {
    modo: "supabase",

    // ── Acceso ──
    async cuentasDemo() {
      return [];
    },
    async entrarDemo() {
      throw new ErrorDeRegla("En la app real se ingresa con correo y clave.");
    },

    async ingresar(correo, clave) {
      const { error } = await sb.auth.signInWithPassword({ email: correo.trim(), password: clave });
      if (!error) return;
      if (esConexionAuth(error)) throw new ErrorDeConexion();
      // Mensaje fijo: no dice si falló el correo o la clave, ni si hubo demasiados intentos.
      throw new ErrorDeRegla(
        "El correo o la clave no son correctos. Si te equivocas varias veces, espera unos minutos.",
      );
    },

    async salir() {
      await sb.auth.signOut({ scope: "local" });
      // Borra lo que la app guardó en este navegador (prefijo dentihub-), por si el celular es compartido.
      try {
        for (const k of Object.keys(localStorage)) if (k.startsWith("dentihub-")) localStorage.removeItem(k);
      } catch {
        // almacenamiento bloqueado: no hay nada que borrar
      }
    },

    async acceso() {
      const { data: s, error: errSesion } = await sb.auth.getSession();
      if (errSesion) {
        if (esConexionAuth(errSesion)) throw new ErrorDeConexion();
        return null;
      }
      if (!s.session) return null;

      // 1) Aplica la invitación pendiente, si la hay (idempotente). Un fallo que no sea de red no
      //    impide seguir: mi_acceso() dirá el motivo (fail-closed).
      const v = await sb.rpc("vincular_invitacion");
      if (v.error && esConexion(v.status, v.error)) throw new ErrorDeConexion();

      // 2) Lee el contrato.
      const r = await sb.rpc("mi_acceso");
      if (r.error) {
        if (esConexion(r.status, r.error)) throw new ErrorDeConexion();
        if (r.status === 401) return null; // sesión vencida: vuelve a ingresar
        throw new ErrorDeConexion("No pudimos comprobar tu acceso. Inténtalo de nuevo.");
      }
      const fila = (Array.isArray(r.data) ? r.data[0] : null) as
        | {
            user_id: string;
            nombre: string | null;
            org_id: string | null;
            rol: string | null;
            areas: string[] | null;
            habilitada: boolean;
            motivo: string | null;
            mfa_requerida: boolean;
            aal: string | null;
            inactividad_minutos: number | null;
          }
        | null;
      if (!fila) return null;

      // Fail-closed: un rol o un motivo desconocidos cuentan como «sin acceso».
      const rol = fila.rol && isAppRole(fila.rol) ? fila.rol : null;
      const motivo = (MOTIVOS as readonly string[]).includes(fila.motivo ?? "")
        ? (fila.motivo as MotivoSinAcceso)
        : null;
      const habilitada = fila.habilitada === true && rol !== null && motivo === null;
      const ctx: ContextoAcceso = {
        userId: fila.user_id,
        nombre: fila.nombre || (s.session.user.email ?? ""),
        orgId: fila.org_id,
        rol,
        areas: fila.areas ?? [],
        habilitada,
        motivo: habilitada ? null : (motivo ?? "sin_rol"),
        mfaRequerida: fila.mfa_requerida === true,
        aal: fila.aal === "aal2" ? "aal2" : "aal1",
        inactividadMinutos: fila.inactividad_minutos,
      };
      return ctx;
    },

    async tieneDosPasos() {
      const { data, error } = await sb.auth.mfa.listFactors();
      if (error) throw esConexionAuth(error) ? new ErrorDeConexion() : new ErrorDeRegla(error.message);
      return data.totp.length > 0; // totp trae solo factores verificados
    },

    async iniciarDosPasos() {
      const { data: lista, error: errLista } = await sb.auth.mfa.listFactors();
      if (errLista) throw esConexionAuth(errLista) ? new ErrorDeConexion() : new ErrorDeRegla(errLista.message);
      // Un intento abandonado deja un factor sin verificar: se reemplaza (sin factores huérfanos).
      for (const f of lista.all) {
        if (f.status === "unverified") await sb.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await sb.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `DentiHub ${new Date().toISOString().slice(0, 16)}`,
      });
      if (error) throw esConexionAuth(error) ? new ErrorDeConexion() : new ErrorDeRegla("No se pudo iniciar la verificación. Inténtalo de nuevo.");
      return { factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret };
    },

    async verificarDosPasos(codigo, factorId) {
      let id = factorId;
      if (!id) {
        const { data, error } = await sb.auth.mfa.listFactors();
        if (error) throw esConexionAuth(error) ? new ErrorDeConexion() : new ErrorDeRegla(error.message);
        id = data.totp[0]?.id;
      }
      if (!id) throw new ErrorDeRegla("No tienes la verificación activada. Actívala primero.");
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: id, code: codigo.trim() });
      if (error) {
        if (esConexionAuth(error)) throw new ErrorDeConexion();
        throw new ErrorDeRegla(
          "El código no es correcto o ya venció. Revisa la hora de tu teléfono e inténtalo de nuevo.",
        );
      }
    },

    async recuperarClave(correo) {
      const { error } = await sb.auth.resetPasswordForEmail(correo.trim(), {
        redirectTo: `${window.location.origin}/auth/confirmar`,
      });
      // Solo la falta de conexión se informa. Cualquier otra respuesta (correo inexistente, límite de
      // intentos) se calla: la pantalla siempre dice lo mismo.
      if (error && esConexionAuth(error)) throw new ErrorDeConexion();
    },

    async canjearEnlace(tokenHash, tipo) {
      const { error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: tipo });
      if (!error) return;
      if (esConexionAuth(error)) throw new ErrorDeConexion();
      throw new ErrorDeRegla("El enlace venció o ya se usó. Pide uno nuevo.");
    },

    async definirClave(clave) {
      const { error } = await sb.auth.updateUser({ password: clave });
      if (!error) return;
      if (esConexionAuth(error)) throw new ErrorDeConexion();
      if (error.code === "same_password") throw new ErrorDeRegla("Elige una clave distinta de la anterior.");
      if (error.code === "weak_password")
        throw new ErrorDeRegla("Esa clave es débil o apareció en filtraciones conocidas. Elige otra.");
      throw new ErrorDeRegla("No se pudo guardar la clave. Pide un enlace nuevo e inténtalo otra vez.");
    },

    alCambiarSesion(cb) {
      const { data } = sb.auth.onAuthStateChange((evento) => {
        cb(
          evento === "SIGNED_IN"
            ? "ingreso"
            : evento === "SIGNED_OUT"
              ? "salida"
              : evento === "TOKEN_REFRESHED" || evento === "MFA_CHALLENGE_VERIFIED"
                ? "renovacion"
                : "otro",
        );
      });
      return () => data.subscription.unsubscribe();
    },

    // ── Administración ──
    async personas() {
      const [p, r, a] = await Promise.all([
        sb.from("profiles").select("id, full_name, email, active, org_id").not("org_id", "is", null),
        sb.from("user_roles").select("user_id, role"),
        sb.from("user_areas").select("user_id, area_id"),
      ]);
      for (const x of [p, r, a]) {
        if (x.error) throw esConexion(x.status, x.error) ? new ErrorDeConexion() : new ErrorDeRegla("No se pudieron leer las personas.");
      }
      const roles = new Map<string, AppRole>();
      for (const f of (r.data ?? []) as { user_id: string; role: string }[])
        if (isAppRole(f.role)) roles.set(f.user_id, f.role);
      const areas = new Map<string, string[]>();
      for (const f of (a.data ?? []) as { user_id: string; area_id: string }[])
        areas.set(f.user_id, [...(areas.get(f.user_id) ?? []), f.area_id]);
      const out: Persona[] = [];
      for (const f of (p.data ?? []) as { id: string; full_name: string; email: string; active: boolean }[]) {
        const rol = roles.get(f.id);
        if (!rol) continue; // sin rol no es miembro (fail-closed)
        out.push({
          id: f.id,
          nombre: f.full_name || f.email,
          correo: f.email,
          rol,
          areaIds: areas.get(f.id) ?? [],
          activa: f.active,
        });
      }
      return out.sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));
    },

    async areas() {
      const { data, error, status } = await sb.from("areas").select("id, name").eq("active", true).order("name");
      if (error) throw esConexion(status, error) ? new ErrorDeConexion() : new ErrorDeRegla("No se pudieron leer las áreas.");
      return ((data ?? []) as { id: string; name: string }[]).map((f) => ({ id: f.id, nombre: f.name }));
    },

    async invitaciones() {
      const { data, error, status } = await sb
        .from("invitations")
        .select("id, email, role, area_ids, created_at, expires_at, sent_at, send_error, accepted_at, revoked_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw esConexion(status, error) ? new ErrorDeConexion() : new ErrorDeRegla("No se pudieron leer las invitaciones.");
      const out: Invitacion[] = [];
      for (const f of (data ?? []) as {
        id: string;
        email: string;
        role: string;
        area_ids: string[];
        created_at: string;
        expires_at: string;
        sent_at: string | null;
        send_error: string | null;
        accepted_at: string | null;
        revoked_at: string | null;
      }[]) {
        if (!isAppRole(f.role)) continue;
        out.push({
          id: f.id,
          correo: f.email,
          rol: f.role,
          areaIds: f.area_ids,
          estado: estadoInvitacion(f),
          creadaEn: f.created_at,
          venceEn: f.expires_at,
        });
      }
      return out;
    },

    async invitar(datos): Promise<ResultadoInvitacion> {
      const r = await invocar("invitar", {
        accion: "crear",
        email: datos.correo,
        role: datos.rol,
        area_ids: datos.areaIds,
      });
      return r.aviso ? { enviado: r.enviado === true, aviso: r.aviso } : { enviado: r.enviado === true };
    },

    async reenviarInvitacion(id): Promise<ResultadoInvitacion> {
      const r = await invocar("invitar", { accion: "reenviar", id });
      return r.aviso ? { enviado: r.enviado === true, aviso: r.aviso } : { enviado: r.enviado === true };
    },

    async revocarInvitacion(id) {
      const { error, status } = await sb.rpc("admin_revoke_invitation", { p_id: id });
      if (error) throw esConexion(status, error) ? new ErrorDeConexion() : new ErrorDeRegla(error.message);
    },

    async cambiarEstadoPersona(personaId, activa) {
      const r = await invocar("bloquear-cuenta", { user_id: personaId, activa });
      return r.bloqueo_auth === false ? (r.aviso ?? "El bloqueo quedó a medias. Inténtalo de nuevo.") : null;
    },

    async auditoria() {
      const { data, error, status } = await sb
        .from("audit_log")
        .select("id, actor_id, action, table_name, record_id, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw esConexion(status, error) ? new ErrorDeConexion() : new ErrorDeRegla("No se pudo leer la auditoría.");
      return ((data ?? []) as {
        id: string;
        actor_id: string | null;
        action: string;
        table_name: string;
        record_id: string | null;
        created_at: string;
      }[]).map(
        (f): RegistroAuditoria => ({
          id: f.id,
          actorId: f.actor_id,
          accion: `${ACCION[f.action] ?? f.action} · ${TABLA[f.table_name] ?? f.table_name}`,
          modulo: OPERACION.has(f.table_name) ? "operacion" : "administracion",
          detalle: f.record_id ?? "",
          creadaEn: f.created_at,
        }),
      );
    },

    // ── Enlaces de demo (ADR-0007) ──
    async enlacesDemo() {
      const { data, error, status } = await sb
        .from("demo_links")
        .select("id, label, created_at, expires_at, revoked_at, uses, last_used_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw esConexion(status, error) ? new ErrorDeConexion() : new ErrorDeRegla("No se pudieron leer los enlaces de demo.");
      return ((data ?? []) as {
        id: string;
        label: string;
        created_at: string;
        expires_at: string;
        revoked_at: string | null;
        uses: number;
        last_used_at: string | null;
      }[]).map((f) => ({
        id: f.id,
        nombre: f.label,
        creadoEn: f.created_at,
        venceEn: f.expires_at,
        revocadoEn: f.revoked_at,
        usos: f.uses,
        ultimoUso: f.last_used_at,
      }));
    },

    async crearEnlaceDemo(nombre, dias) {
      const { data, error, status } = await sb.rpc("admin_crear_enlace_demo", { p_label: nombre, p_dias: dias });
      if (error) throw esConexion(status, error) ? new ErrorDeConexion() : new ErrorDeRegla(error.message);
      return String(data);
    },

    async revocarEnlaceDemo(id) {
      const { error, status } = await sb.rpc("admin_revocar_enlace_demo", { p_id: id });
      if (error) throw esConexion(status, error) ? new ErrorDeConexion() : new ErrorDeRegla(error.message);
    },

    // ── Operación (siguiente paso) ──
    async plantillas() {
      throw new ErrorDeRegla(PENDIENTE_OPERACION);
    },
    async tareas() {
      throw new ErrorDeRegla(PENDIENTE_OPERACION);
    },
    async tarea() {
      throw new ErrorDeRegla(PENDIENTE_OPERACION);
    },
    async evidencias() {
      throw new ErrorDeRegla(PENDIENTE_OPERACION);
    },
    async guardarAvance() {
      throw new ErrorDeRegla(PENDIENTE_OPERACION);
    },
    async subirEvidencia() {
      throw new ErrorDeRegla(PENDIENTE_OPERACION);
    },
    async completar() {
      throw new ErrorDeRegla(PENDIENTE_OPERACION);
    },
    async cancelar() {
      throw new ErrorDeRegla(PENDIENTE_OPERACION);
    },
    async crearTarea() {
      throw new ErrorDeRegla(PENDIENTE_OPERACION);
    },

    async reiniciar() {
      throw new ErrorDeRegla("Reiniciar solo existe en el modo demo.");
    },
  };
}
