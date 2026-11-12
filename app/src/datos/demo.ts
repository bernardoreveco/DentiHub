// Fuente de datos «demo»: guarda todo en este navegador para poder USAR el MVP antes de tener el
// proyecto de Supabase. Imita a propósito los permisos de la base (RLS y funciones de la Etapa 1)
// para que el comportamiento que vea el equipo sea el mismo que tendrá con la base real:
//   - el Técnico solo ve y trabaja sus tareas; crear, asignar y cancelar es de Gestor y Administrador;
//   - completar exige los pasos obligatorios y la foto (misma regla que complete_task);
//   - una cuenta desactivada no tiene acceso; activar o desactivar es solo del Administrador;
//   - toda escritura deja un registro de auditoría.
// No es seguridad: cualquiera puede editar el almacenamiento de su navegador. La seguridad real
// será la RLS de Supabase.
import type { FuenteDatos } from "@/datos/fuente";
import { ErrorDeRegla } from "@/datos/errores";
import { semilla, type EstadoDemo } from "@/datos/semilla";
import type { ContextoAcceso, EstadoInvitacion, Persona, Respuesta, Tarea } from "@/datos/tipos";
import type { InvitacionDemo } from "@/datos/semilla";
import { EVIDENCIA, RESPUESTAS_BYTES_MAX, faltantes, textoFaltantes } from "@/modulos/operacion/reglas";

const CLAVE = "dentihub-demo-v2";
const CLAVE_FOTO = (id: string) => `dentihub-demo-foto-${id}`;

function leer(): EstadoDemo {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (crudo) {
      const e = JSON.parse(crudo) as EstadoDemo;
      if (e.version === 2) return e;
    }
  } catch {
    // Almacenamiento bloqueado o dañado: se parte de los datos de ejemplo.
  }
  return semilla();
}

function escribir(e: EstadoDemo) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(e));
  } catch {
    throw new ErrorDeRegla("Este navegador no deja guardar más datos. Pulsa «Reiniciar demo» en tu perfil.");
  }
}

const id = () => crypto.randomUUID();
const ahora = () => new Date().toISOString();
const espera = () => new Promise((r) => setTimeout(r, 120)); // simula la red, para ver los estados de carga

// Las escrituras van EN FILA, una después de otra. Por qué: cada escritura lee el estado, espera
// (red simulada, huella de la foto) y lo vuelve a guardar; dos a la vez se pisaban (subir una foto
// mientras se guardaba un paso borraba ese paso). En Supabase esto lo resuelve la transacción.
let cola: Promise<unknown> = Promise.resolve();
function enFila<A extends unknown[], T>(fn: (...a: A) => Promise<T>): (...a: A) => Promise<T> {
  return (...a: A) => {
    const r = cola.then(() => fn(...a));
    cola = r.catch(() => undefined);
    return r;
  };
}

async function huella(blob: Blob): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function aDataUrl(blob: Blob): Promise<string> {
  return new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => mal(new ErrorDeRegla("No se pudo leer la foto."));
    r.readAsDataURL(blob);
  });
}

// Mismo orden de motivos que mi_acceso() (ADR-0005). En la demo el correo siempre está confirmado.
function contexto(e: EstadoDemo): ContextoAcceso | null {
  const p = e.personas.find((x) => x.id === e.sesion);
  if (!p) return null;
  const motivo = !p.activa ? "desactivada" : p.rol === "admin" && !e.aal2 ? "requiere_dos_pasos" : null;
  return {
    userId: p.id,
    nombre: p.nombre,
    orgId: "org-demo",
    rol: p.rol,
    areas: p.areaIds,
    habilitada: motivo === null,
    motivo,
    mfaRequerida: p.rol === "admin",
    aal: e.aal2 ? "aal2" : "aal1",
    inactividadMinutos: null,
  };
}

/** Exige sesión habilitada (fail-closed) y devuelve la persona. Igual que auth_role(): un
 *  Administrador sin la verificación en dos pasos no tiene ningún permiso. */
function actor(e: EstadoDemo): Persona {
  const p = e.personas.find((x) => x.id === e.sesion);
  if (!p || !p.activa) throw new ErrorDeRegla("Tu sesión no tiene acceso. Vuelve a ingresar.");
  if (p.rol === "admin" && !e.aal2) throw new ErrorDeRegla("Falta la verificación en dos pasos.");
  return p;
}

function exigirAdmin(e: EstadoDemo): Persona {
  const p = actor(e);
  if (p.rol !== "admin") throw new ErrorDeRegla("Solo un Administrador puede hacer esto.");
  return p;
}

function estadoDe(i: InvitacionDemo): EstadoInvitacion {
  if (i.revocadaEn) return "revocada";
  if (i.aceptadaEn) return "aceptada";
  if (new Date(i.venceEn) <= new Date()) return "vencida";
  return "enviada";
}

const SIETE_DIAS = 7 * 86400000;
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** QR de mentira para la demo: un recuadro con texto (la app real muestra el QR de Supabase). */
const QR_DEMO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" fill="white" stroke="black"/><text x="90" y="85" font-size="14" text-anchor="middle" font-family="sans-serif">Código QR</text><text x="90" y="105" font-size="12" text-anchor="middle" font-family="sans-serif">(demo)</text></svg>',
  );

const esGestion = (p: Persona) => p.rol === "admin" || p.rol === "gestor";

function puedeVer(p: Persona, t: Tarea) {
  return esGestion(p) || t.responsableId === p.id;
}

function tareaEditable(e: EstadoDemo, tareaId: string): { p: Persona; t: Tarea } {
  const p = actor(e);
  const t = e.tareas.find((x) => x.id === tareaId);
  if (!t || !puedeVer(p, t)) throw new ErrorDeRegla("No encontramos la tarea o no tienes acceso a ella.");
  if (t.estado === "completada" || t.estado === "cancelada")
    throw new ErrorDeRegla("La tarea ya está cerrada y no se puede modificar.");
  return { p, t };
}

function auditar(e: EstadoDemo, actorId: string, accion: string, modulo: "acceso" | "administracion" | "operacion", detalle: string) {
  e.auditoria.unshift({ id: id(), actorId, accion, modulo, detalle, creadaEn: ahora() });
}

export function crearFuenteDemo(): FuenteDatos {
  const f: FuenteDatos = {
    modo: "demo",

    async cuentasDemo() {
      const e = leer();
      // Las invitaciones vigentes aparecen como cuentas: entrar con una simula aceptar la invitación
      // (lo que en la app real hace vincular_invitacion() al confirmar el correo).
      const invitadas: Persona[] = e.invitaciones
        .filter((i) => estadoDe(i) === "enviada")
        .map((i) => ({ id: `inv:${i.id}`, nombre: i.correo, correo: i.correo, rol: i.rol, areaIds: i.areaIds, activa: true }));
      return [...e.personas, ...invitadas];
    },
    async entrarDemo(personaId) {
      await espera();
      const e = leer();
      e.aal2 = false;
      if (personaId.startsWith("inv:")) {
        const inv = e.invitaciones.find((i) => `inv:${i.id}` === personaId);
        if (!inv || estadoDe(inv) !== "enviada") throw new ErrorDeRegla("Esa invitación ya no está vigente.");
        const nueva: Persona = {
          id: id(),
          nombre: (inv.correo.split("@")[0] ?? inv.correo).replace(/[._]/g, " "),
          correo: inv.correo,
          rol: inv.rol,
          areaIds: inv.areaIds,
          activa: true,
        };
        e.personas.push(nueva);
        inv.aceptadaEn = ahora();
        e.sesion = nueva.id;
        auditar(e, nueva.id, "Aceptó su invitación", "acceso", inv.id);
        escribir(e);
        return;
      }
      const p = e.personas.find((x) => x.id === personaId);
      if (!p) throw new ErrorDeRegla("Esa cuenta no existe.");
      e.sesion = p.id;
      // Igual que en la base: el ingreso queda registrado aunque la cuenta esté desactivada.
      auditar(e, p.id, p.activa ? "Ingresó" : "Intentó ingresar con la cuenta desactivada", "acceso", p.id);
      escribir(e);
    },
    async ingresar() {
      throw new ErrorDeRegla("En el modo demo se entra eligiendo una cuenta de ejemplo.");
    },
    async salir() {
      const e = leer();
      e.sesion = null;
      e.aal2 = false;
      escribir(e);
    },
    async acceso() {
      return contexto(leer());
    },
    async tieneDosPasos() {
      const e = leer();
      return e.sesion !== null && e.dosPasos.includes(e.sesion);
    },
    async iniciarDosPasos() {
      await espera();
      return { factorId: "demo", qr: QR_DEMO, secreto: "DEMO DEMO DEMO DEMO" };
    },
    async verificarDosPasos(codigo) {
      await espera();
      if (!/^\d{6}$/.test(codigo.trim()))
        throw new ErrorDeRegla("El código tiene 6 dígitos (en la demo sirve cualquiera).");
      const e = leer();
      if (!e.sesion) throw new ErrorDeRegla("Tu sesión no es válida. Vuelve a ingresar.");
      if (!e.dosPasos.includes(e.sesion)) {
        e.dosPasos.push(e.sesion);
        auditar(e, e.sesion, "Activó la verificación en dos pasos", "acceso", e.sesion);
      }
      e.aal2 = true;
      escribir(e);
    },
    async recuperarClave() {
      await espera(); // en la demo no se envía nada; la pantalla dice siempre lo mismo
    },
    async canjearEnlace() {
      throw new ErrorDeRegla("Los enlaces de correo solo funcionan en la app real.");
    },
    async definirClave() {
      throw new ErrorDeRegla("En el modo demo no hay claves.");
    },
    alCambiarSesion(cb) {
      // Otra pestaña cambió la sesión de la demo.
      const escuchar = (ev: StorageEvent) => {
        if (ev.key === CLAVE) cb("otro");
      };
      window.addEventListener("storage", escuchar);
      return () => window.removeEventListener("storage", escuchar);
    },
    async invitaciones() {
      await espera();
      const e = leer();
      exigirAdmin(e);
      return e.invitaciones.map((i) => ({
        id: i.id,
        correo: i.correo,
        rol: i.rol,
        areaIds: i.areaIds,
        estado: estadoDe(i),
        creadaEn: i.creadaEn,
        venceEn: i.venceEn,
      }));
    },
    async invitar(datos) {
      await espera();
      const e = leer();
      const p = exigirAdmin(e);
      const correo = datos.correo.trim().toLowerCase();
      if (!CORREO.test(correo) || correo.length > 254) throw new ErrorDeRegla("Escribe un correo válido.");
      if (e.personas.some((x) => x.correo.toLowerCase() === correo))
        throw new ErrorDeRegla("Esa persona ya pertenece a la organización. Reactívala o cámbiale el rol.");
      if (!datos.areaIds.every((a) => e.areas.some((x) => x.id === a)))
        throw new ErrorDeRegla("Alguna de las áreas no existe o está inactiva en tu organización.");
      for (const i of e.invitaciones)
        if (i.correo === correo && estadoDe(i) === "vencida") i.revocadaEn = ahora();
      if (e.invitaciones.some((i) => i.correo === correo && estadoDe(i) === "enviada"))
        throw new ErrorDeRegla("Ya hay una invitación vigente para ese correo. Usa Reenviar.");
      const inv: InvitacionDemo = {
        id: id(),
        correo,
        rol: datos.rol,
        areaIds: datos.areaIds,
        creadaEn: ahora(),
        venceEn: new Date(Date.now() + SIETE_DIAS).toISOString(),
        aceptadaEn: null,
        revocadaEn: null,
      };
      e.invitaciones.unshift(inv);
      auditar(e, p.id, "Invitó a una persona", "administracion", inv.id);
      escribir(e);
      return {
        enviado: true,
        aviso: "Modo demo: no se envió ningún correo. La invitación aparece como cuenta en Ingreso.",
      };
    },
    async reenviarInvitacion(invId) {
      await espera();
      const e = leer();
      const p = exigirAdmin(e);
      const inv = e.invitaciones.find((i) => i.id === invId);
      if (!inv || inv.aceptadaEn || inv.revocadaEn) throw new ErrorDeRegla("Esa invitación ya no está pendiente.");
      inv.venceEn = new Date(Date.now() + SIETE_DIAS).toISOString();
      auditar(e, p.id, "Reenvió una invitación", "administracion", inv.id);
      escribir(e);
      return { enviado: true };
    },
    async revocarInvitacion(invId) {
      await espera();
      const e = leer();
      const p = exigirAdmin(e);
      const inv = e.invitaciones.find((i) => i.id === invId);
      if (!inv || inv.aceptadaEn || inv.revocadaEn) throw new ErrorDeRegla("Esa invitación ya no está pendiente.");
      inv.revocadaEn = ahora();
      auditar(e, p.id, "Revocó una invitación", "administracion", inv.id);
      escribir(e);
    },

    async personas() {
      await espera();
      const e = leer();
      actor(e);
      return e.personas;
    },
    async areas() {
      const e = leer();
      actor(e);
      return e.areas;
    },
    async plantillas() {
      const e = leer();
      actor(e);
      return e.plantillas;
    },
    async tareas() {
      await espera();
      const e = leer();
      const p = actor(e);
      return e.tareas.filter((t) => puedeVer(p, t));
    },
    async tarea(tareaId) {
      await espera();
      const e = leer();
      const p = actor(e);
      const t = e.tareas.find((x) => x.id === tareaId);
      return t && puedeVer(p, t) ? t : null;
    },
    async evidencias(tareaId) {
      const e = leer();
      const p = actor(e);
      const t = e.tareas.find((x) => x.id === tareaId);
      if (!t || !puedeVer(p, t)) return [];
      return e.evidencias
        .filter((x) => x.tareaId === tareaId)
        .map((x) => ({ ...x, url: localStorage.getItem(CLAVE_FOTO(x.id)) ?? "" }));
    },

    async guardarAvance(tareaId, respuestas) {
      await espera();
      const e = leer();
      const { p, t } = tareaEditable(e, tareaId);
      const plantilla = e.plantillas.find((x) => x.id === t.plantillaId);
      if (!plantilla) throw new ErrorDeRegla("La plantilla de esta tarea no existe.");
      const claves = new Set(plantilla.pasos.map((x) => x.key));
      const limpias: Record<string, Respuesta> = {};
      for (const [k, v] of Object.entries({ ...t.respuestas, ...respuestas })) if (claves.has(k)) limpias[k] = v;
      if (new Blob([JSON.stringify(limpias)]).size > RESPUESTAS_BYTES_MAX)
        throw new ErrorDeRegla("Las respuestas son demasiado largas. Acorta las observaciones.");
      t.respuestas = limpias;
      if (t.estado === "pendiente") {
        t.estado = "en_progreso";
        t.iniciadaEn = ahora();
      }
      void p;
      escribir(e);
    },

    async subirEvidencia(tareaId, foto) {
      const e = leer();
      const { p, t } = tareaEditable(e, tareaId);
      if (!(EVIDENCIA.tiposPermitidos as readonly string[]).includes(foto.type))
        throw new ErrorDeRegla("Ese archivo no es una foto válida. Usa JPG, PNG, WebP o HEIC.");
      if (foto.size < EVIDENCIA.bytesMinimos)
        throw new ErrorDeRegla("La foto es demasiado pequeña. Sácala de nuevo con buena luz.");
      const propias = e.evidencias.filter((x) => x.tareaId === tareaId);
      if (propias.length >= EVIDENCIA.maxPorTarea)
        throw new ErrorDeRegla(`Esta tarea ya tiene el máximo de ${EVIDENCIA.maxPorTarea} fotos.`);
      const h = await huella(foto);
      if (propias.some((x) => x.huella === h)) throw new ErrorDeRegla("Esa foto ya está en la tarea.");
      const ev = { id: id(), tareaId, bytes: foto.size, huella: h, subidaPor: p.id, creadaEn: ahora() };
      try {
        localStorage.setItem(CLAVE_FOTO(ev.id), await aDataUrl(foto));
      } catch {
        throw new ErrorDeRegla("No queda espacio en este navegador para más fotos. Pulsa «Reiniciar demo».");
      }
      e.evidencias.push(ev);
      if (t.estado === "pendiente") {
        t.estado = "en_progreso";
        t.iniciadaEn = ahora();
      }
      auditar(e, p.id, `Subió una foto a «${t.titulo}»`, "operacion", t.id);
      escribir(e);
    },

    async completar(tareaId) {
      await espera();
      const e = leer();
      const { p, t } = tareaEditable(e, tareaId);
      const plantilla = e.plantillas.find((x) => x.id === t.plantillaId);
      if (!plantilla) throw new ErrorDeRegla("La plantilla de esta tarea no existe.");
      const fotos = e.evidencias.filter((x) => x.tareaId === tareaId).map((x) => ({ ...x, url: "" }));
      const falta = faltantes(plantilla, t, fotos);
      if (falta.length) throw new ErrorDeRegla(`No se puede completar. ${textoFaltantes(falta)}.`);
      t.estado = "completada";
      t.completadaEn = ahora();
      t.completadaPor = p.id;
      auditar(e, p.id, `Completó la tarea «${t.titulo}»`, "operacion", t.id);
      escribir(e);
    },

    async cancelar(tareaId, motivo) {
      await espera();
      const e = leer();
      const { p, t } = tareaEditable(e, tareaId);
      if (!esGestion(p)) throw new ErrorDeRegla("Solo un Gestor o un Administrador puede cancelar tareas.");
      const m = motivo.trim();
      if (!m) throw new ErrorDeRegla("Escribe el motivo de la cancelación.");
      if (m.length > 500) throw new ErrorDeRegla("El motivo no puede pasar de 500 caracteres.");
      t.estado = "cancelada";
      t.canceladaEn = ahora();
      t.motivoCancelacion = m;
      auditar(e, p.id, `Canceló la tarea «${t.titulo}»`, "operacion", t.id);
      escribir(e);
    },

    async crearTarea(datos) {
      await espera();
      const e = leer();
      const p = actor(e);
      if (!esGestion(p)) throw new ErrorDeRegla("Solo un Gestor o un Administrador puede crear tareas.");
      const titulo = datos.titulo.trim();
      if (!titulo || titulo.length > 200) throw new ErrorDeRegla("El título debe tener entre 1 y 200 caracteres.");
      if (!e.plantillas.some((x) => x.id === datos.plantillaId)) throw new ErrorDeRegla("Elige una plantilla.");
      const resp = datos.responsableId ? e.personas.find((x) => x.id === datos.responsableId) : null;
      if (datos.responsableId && (!resp || !resp.activa))
        throw new ErrorDeRegla("La persona responsable no existe o tiene la cuenta desactivada.");
      const t: Tarea = {
        id: id(),
        titulo,
        plantillaId: datos.plantillaId,
        areaId: datos.areaId,
        responsableId: datos.responsableId,
        estado: "pendiente",
        venceEn: datos.venceEn,
        respuestas: {},
        iniciadaEn: null,
        completadaEn: null,
        completadaPor: null,
        canceladaEn: null,
        motivoCancelacion: null,
        creadaPor: p.id,
        creadaEn: ahora(),
      };
      e.tareas.unshift(t);
      auditar(e, p.id, `Creó la tarea «${t.titulo}»${resp ? ` para ${resp.nombre}` : ""}`, "operacion", t.id);
      escribir(e);
      return t.id;
    },

    async cambiarEstadoPersona(personaId, activa) {
      await espera();
      const e = leer();
      const p = actor(e);
      if (p.rol !== "admin") throw new ErrorDeRegla("Solo un Administrador puede activar o desactivar cuentas.");
      const objetivo = e.personas.find((x) => x.id === personaId);
      if (!objetivo) throw new ErrorDeRegla("Esa persona no existe.");
      if (!activa && objetivo.id === p.id) throw new ErrorDeRegla("No puedes desactivar tu propia cuenta.");
      // Protección del último administrador (igual que en la migración).
      if (!activa && objetivo.rol === "admin" && e.personas.filter((x) => x.rol === "admin" && x.activa).length <= 1)
        throw new ErrorDeRegla("Debe quedar al menos un Administrador activo.");
      objetivo.activa = activa;
      auditar(e, p.id, `${activa ? "Activó" : "Desactivó"} la cuenta de ${objetivo.nombre}`, "administracion", objetivo.id);
      escribir(e);
      return null;
    },

    async auditoria() {
      await espera();
      const e = leer();
      const p = actor(e);
      if (p.rol !== "admin") throw new ErrorDeRegla("Solo un Administrador puede ver la auditoría.");
      return e.auditoria;
    },

    async enlacesDemo() {
      throw new ErrorDeRegla("Los enlaces de demo se crean en la app real.");
    },
    async crearEnlaceDemo() {
      throw new ErrorDeRegla("Los enlaces de demo se crean en la app real.");
    },
    async revocarEnlaceDemo() {
      throw new ErrorDeRegla("Los enlaces de demo se crean en la app real.");
    },
    async reiniciar() {
      const e = leer();
      for (const ev of e.evidencias) localStorage.removeItem(CLAVE_FOTO(ev.id));
      const nuevo = semilla();
      nuevo.sesion = e.sesion; // reiniciar no cierra la sesión
      escribir(nuevo);
    },
  };
  for (const k of ["entrarDemo", "salir", "verificarDosPasos", "invitar", "reenviarInvitacion", "revocarInvitacion", "guardarAvance", "subirEvidencia", "completar", "cancelar", "crearTarea", "cambiarEstadoPersona", "reiniciar"] as const) {
    (f as unknown as Record<string, unknown>)[k] = enFila(f[k] as (...a: unknown[]) => Promise<unknown>);
  }
  return f;
}
