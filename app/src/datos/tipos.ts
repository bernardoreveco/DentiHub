// Tipos del MVP. Siguen los nombres de las tablas de las migraciones de la Etapa 1
// (starter-kit/supabase/migrations/20261110*.sql), traducidos al español para la interfaz.
// Cuando exista el proyecto de Supabase, estos tipos se mapean desde los generados por
// `supabase gen types` en la fuente `supabase`; las pantallas no cambian.
import type { AppRole } from "@/lib/roles";

export type Area = { id: string; nombre: string };

export type Persona = {
  id: string;
  nombre: string;
  correo: string;
  rol: AppRole;
  areaIds: string[];
  activa: boolean;
};

/** Tipos de paso que acepta form_schema_is_valid(). */
export type TipoPaso = "check" | "yesno" | "text" | "number";

/** Un paso del checklist. `requerido` es true salvo que diga false (igual que en la base). */
export type Paso = { key: string; label: string; tipo: TipoPaso; requerido: boolean };

export type Plantilla = {
  id: string;
  nombre: string;
  version: number;
  exigeFoto: boolean;
  /** Mínimo de fotos cuando exige foto (min_photos, 1 a 20; por defecto 1). */
  minFotos: number;
  pasos: Paso[];
};

/** Mismos valores que el enum public.task_status. */
export type EstadoTarea = "pendiente" | "en_progreso" | "completada" | "cancelada";

export type Respuesta = boolean | string | number | null;

export type Tarea = {
  id: string;
  titulo: string;
  plantillaId: string;
  areaId: string | null;
  responsableId: string | null;
  estado: EstadoTarea;
  /** Fecha y hora ISO. */
  venceEn: string | null;
  respuestas: Record<string, Respuesta>;
  iniciadaEn: string | null;
  completadaEn: string | null;
  completadaPor: string | null;
  canceladaEn: string | null;
  motivoCancelacion: string | null;
  creadaPor: string;
  creadaEn: string;
};

export type Evidencia = {
  id: string;
  tareaId: string;
  /** En la demo, la foto comprimida como data URL; con Supabase, una URL firmada de corta duración. */
  url: string;
  bytes: number;
  /** Huella SHA-256 del archivo: evita subir dos veces la misma foto (en Storage es el eTag). */
  huella: string;
  subidaPor: string;
  creadaEn: string;
};

export type RegistroAuditoria = {
  id: string;
  actorId: string | null;
  accion: string;
  modulo: "acceso" | "administracion" | "operacion";
  detalle: string;
  creadaEn: string;
};

/**
 * Contrato «contexto de acceso» (docs/modulos/README.md). Lo entrega el módulo Acceso y lo
 * consumen todos los demás. En Supabase lo devolverá la función mi_acceso() (pendiente).
 */
export type ContextoAcceso = {
  userId: string;
  nombre: string;
  orgId: string | null;
  rol: AppRole | null;
  areas: string[];
  habilitada: boolean;
  motivo: "desactivada" | "sin_organizacion" | "sin_rol" | null;
};

export type NuevaTarea = {
  titulo: string;
  plantillaId: string;
  areaId: string | null;
  responsableId: string | null;
  venceEn: string | null;
};
