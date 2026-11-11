// Contrato de la fuente de datos (ADR-0004). Las pantallas solo hablan con esta interfaz, nunca
// con Supabase ni con el almacenamiento del navegador directamente. Hay dos implementaciones:
//   - demo:     datos de ejemplo guardados en este navegador, para usar el MVP antes de tener base.
//   - supabase: pendiente (necesita la migración mi_acceso() y los tipos generados).
// Cada escritura es UNA llamada (en Supabase, una función transaccional), nunca varios pasos
// sueltos desde el navegador (regla de CLAUDE.md, «Código»).
import type {
  Area,
  ContextoAcceso,
  Evidencia,
  NuevaTarea,
  Persona,
  Plantilla,
  RegistroAuditoria,
  Respuesta,
  Tarea,
} from "@/datos/tipos";
import { crearFuenteDemo } from "@/datos/demo";

export { ErrorDeRegla } from "@/datos/errores";

export interface FuenteDatos {
  readonly modo: "demo" | "supabase";
  /** Cuentas para entrar sin clave (solo modo demo). */
  cuentasDemo(): Promise<Persona[]>;
  entrarDemo(personaId: string): Promise<void>;
  ingresar(correo: string, clave: string): Promise<void>;
  salir(): Promise<void>;
  /** null = no hay sesión. */
  acceso(): Promise<ContextoAcceso | null>;

  personas(): Promise<Persona[]>;
  areas(): Promise<Area[]>;
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

  cambiarEstadoPersona(personaId: string, activa: boolean): Promise<void>;
  auditoria(): Promise<RegistroAuditoria[]>;
  /** Vuelve a los datos de ejemplo (solo modo demo). */
  reiniciar(): Promise<void>;
}

function crearFuente(): FuenteDatos {
  // Mientras no exista la fuente Supabase, la app siempre usa la demo, aunque haya variables
  // VITE_SUPABASE_* en el .env. Así nadie cree que está guardando en la base real.
  return crearFuenteDemo();
}

export const fuente: FuenteDatos = crearFuente();
