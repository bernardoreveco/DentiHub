// Contrato de la fuente de datos (ADR-0004). Las pantallas solo hablan con esta interfaz, nunca
// con Supabase ni con el almacenamiento del navegador directamente. Hay dos implementaciones:
//   - supabase: la app REAL. Acceso y Administración conectados (ADR-0005); Operación, pendiente.
//   - demo:     datos de ejemplo guardados en este navegador, con las mismas reglas, para mostrar
//               y probar la app sin base de datos.
// Cada escritura es UNA llamada (en Supabase, una función transaccional), nunca varios pasos
// sueltos desde el navegador (regla de CLAUDE.md, «Código»).
import type {
  ActivacionDosPasos,
  Area,
  ContextoAcceso,
  EnlaceDemo,
  EventoSesion,
  Evidencia,
  Invitacion,
  NuevaInvitacion,
  NuevaTarea,
  Persona,
  Plantilla,
  RegistroAuditoria,
  Respuesta,
  ResultadoInvitacion,
  Tarea,
} from "@/datos/tipos";
import { crearFuenteDemo } from "@/datos/demo";
import { crearFuenteSupabase } from "@/datos/supabase";
import { supabase } from "@/lib/supabase";
import { modoApp } from "@/datos/modo";

export { ErrorDeRegla, ErrorDeConexion } from "@/datos/errores";

export interface FuenteDatos {
  readonly modo: "demo" | "supabase";

  // ── Acceso (módulo 1, ADR-0005) ──
  /** Cuentas para entrar sin clave (solo modo demo). */
  cuentasDemo(): Promise<Persona[]>;
  entrarDemo(personaId: string): Promise<void>;
  /** A1. Error fijo si las credenciales fallan (no revela si el correo existe). */
  ingresar(correo: string, clave: string): Promise<void>;
  /** A8. Cierra la sesión en este dispositivo. */
  salir(): Promise<void>;
  /** A3. Aplica la invitación pendiente (vincular_invitacion) y lee el contrato (mi_acceso).
   *  null = no hay sesión. Lanza ErrorDeConexion si no se pudo comprobar (nunca «sin acceso»). */
  acceso(): Promise<ContextoAcceso | null>;
  /** A2/A2b. ¿La persona ya tiene un factor de dos pasos verificado? */
  tieneDosPasos(): Promise<boolean>;
  /** A2b. Crea el factor (reemplaza uno a medias) y devuelve el QR. */
  iniciarDosPasos(): Promise<ActivacionDosPasos>;
  /** A2 y A2b. Verifica el código de 6 dígitos y sube la sesión a aal2. */
  verificarDosPasos(codigo: string, factorId?: string): Promise<void>;
  /** A5. Nunca revela si el correo existe: solo falla por falta de conexión. */
  recuperarClave(correo: string): Promise<void>;
  /** A9. Canjea el enlace del correo SOLO cuando la persona pulsa «Continuar». */
  canjearEnlace(tokenHash: string, tipo: "invite" | "recovery"): Promise<void>;
  /** A9, enlaces con ?code= (formato por defecto de Supabase, mientras la plantilla del correo no use
   *  token_hash). Canjea el código PKCE: solo funciona en el navegador que pidió el enlace. */
  canjearCodigo(codigo: string): Promise<void>;
  /** A6. Guarda la clave nueva de la sesión actual. */
  definirClave(clave: string): Promise<void>;
  /** Avisa de cambios de sesión (también desde otra pestaña). Devuelve la función para dejar de escuchar. */
  alCambiarSesion(cb: (evento: EventoSesion) => void): () => void;

  // ── Administración ──
  personas(): Promise<Persona[]>;
  areas(): Promise<Area[]>;
  invitaciones(): Promise<Invitacion[]>;
  invitar(datos: NuevaInvitacion): Promise<ResultadoInvitacion>;
  reenviarInvitacion(id: string): Promise<ResultadoInvitacion>;
  revocarInvitacion(id: string): Promise<void>;
  /** Desactivar corta los datos (base) y bloquea el ingreso (Auth). Devuelve un aviso si quedó a medias. */
  cambiarEstadoPersona(personaId: string, activa: boolean): Promise<string | null>;
  auditoria(): Promise<RegistroAuditoria[]>;
  /** Enlaces de demo (ADR-0007). Solo en la app real y solo para Administradores. */
  enlacesDemo(): Promise<EnlaceDemo[]>;
  /** Devuelve el código UNA vez; la base guarda solo su huella. */
  crearEnlaceDemo(nombre: string, dias: number): Promise<string>;
  revocarEnlaceDemo(id: string): Promise<void>;

  // ── Operación ──
  plantillas(): Promise<Plantilla[]>;
  /** Respeta los permisos: el Técnico recibe solo sus tareas (en Supabase lo hace la RLS). */
  tareas(): Promise<Tarea[]>;
  tarea(id: string): Promise<Tarea | null>;
  evidencias(tareaId: string): Promise<Evidencia[]>;
  /** Guarda solo los pasos que cambiaron; la fuente los mezcla con lo ya guardado (dos cambios
   *  seguidos no se pisan). */
  guardarAvance(tareaId: string, cambios: Record<string, Respuesta>): Promise<void>;
  subirEvidencia(tareaId: string, foto: Blob): Promise<void>;
  completar(tareaId: string): Promise<void>;
  cancelar(tareaId: string, motivo: string): Promise<void>;
  crearTarea(datos: NuevaTarea): Promise<string>;

  /** Vuelve a los datos de ejemplo (solo modo demo). */
  reiniciar(): Promise<void>;
}

function crearFuente(): FuenteDatos {
  // La app real es la de siempre; la demo solo con un enlace válido o en desarrollo (ADR-0007).
  // Con "sin_configuracion" se crea la demo solo para no romper importaciones: main.tsx no deja
  // entrar a la app en ese caso.
  if (modoApp === "supabase" && supabase) return crearFuenteSupabase(supabase);
  return crearFuenteDemo();
}

export const fuente: FuenteDatos = crearFuente();
