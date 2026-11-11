// Reglas puras de Operación. Repiten en el navegador las reglas que impone la base de datos
// (step_is_answered y complete_task de la migración 20261110130000) para explicar QUÉ falta antes
// de intentar cerrar. La base sigue siendo la que decide: esto solo evita un viaje inútil y le dice
// al técnico, en palabras simples, por qué el botón está bloqueado (idea tomada de los formularios
// móviles que marcan lo obligatorio, ver docs/referencias).
import type { Evidencia, Paso, Plantilla, Respuesta, Tarea } from "@/datos/tipos";

/** Límites de evidencia: los mismos valores que las constantes evidence_* de la migración. */
export const EVIDENCIA = {
  bytesMinimos: 10 * 1024,
  maxPorTarea: 20,
  tiposPermitidos: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
  /** Lado mayor de la foto comprimida en el teléfono. */
  ladoMaximo: 1600,
} as const;

/** Límite de las respuestas de una tarea (32 KB en la base). */
export const RESPUESTAS_BYTES_MAX = 32 * 1024;

/** ¿La respuesta cuenta como respondida? Tipo desconocido = no respondida (fail-closed). */
export function pasoRespondido(paso: Paso, r: Respuesta | undefined): boolean {
  if (r === undefined || r === null) return false;
  switch (paso.tipo) {
    case "check":
      return r === true;
    case "yesno":
      return typeof r === "boolean";
    case "text":
      return typeof r === "string" && r.trim() !== "";
    case "number":
      return typeof r === "number" && Number.isFinite(r);
    default:
      return false;
  }
}

export function avance(plantilla: Plantilla, tarea: Pick<Tarea, "respuestas">) {
  const requeridos = plantilla.pasos.filter((p) => p.requerido);
  const hechos = requeridos.filter((p) => pasoRespondido(p, tarea.respuestas[p.key])).length;
  return { hechos, total: requeridos.length };
}

/** Lista de lo que falta para completar, en frases cortas. Vacía = se puede completar. */
export function faltantes(
  plantilla: Plantilla,
  tarea: Pick<Tarea, "respuestas" | "estado">,
  evidencias: readonly Evidencia[],
): string[] {
  if (tarea.estado === "completada") return ["La tarea ya está completada"];
  if (tarea.estado === "cancelada") return ["La tarea está cancelada"];
  const out: string[] = [];
  const { hechos, total } = avance(plantilla, tarea);
  const pendientes = total - hechos;
  if (pendientes > 0) out.push(pendientes === 1 ? "1 paso" : `${pendientes} pasos`);
  if (plantilla.exigeFoto && evidencias.length < plantilla.minFotos) {
    const n = plantilla.minFotos - evidencias.length;
    out.push(n === 1 ? (plantilla.minFotos === 1 ? "la foto" : "1 foto") : `${n} fotos`);
  }
  return out;
}

/** «Te falta 1 paso», «Te faltan 3 pasos y la foto». */
export function textoFaltantes(lista: string[]): string {
  if (lista.length === 0) return "";
  if (lista[0]?.startsWith("La tarea")) return lista[0];
  // Concordancia: «falta 1 paso», «faltan 3 pasos», «faltan 1 paso y la foto».
  const plural = lista.length > 1 || /^([2-9]|\d{2,}) /.test(lista[0] ?? "");
  return `Te ${plural ? "faltan" : "falta"} ${lista.join(" y ")}`;
}

/** ¿Está atrasada? Solo si sigue abierta y ya pasó el vencimiento. */
export function estaAtrasada(t: Pick<Tarea, "estado" | "venceEn">, ahora = new Date()): boolean {
  return (
    (t.estado === "pendiente" || t.estado === "en_progreso") &&
    t.venceEn !== null &&
    new Date(t.venceEn) < ahora
  );
}

export type Pestana = "hoy" | "atrasadas" | "proximas" | "hechas";

/** Pestañas de «Mis tareas» (idea de las apps de terreno: lo de hoy primero). */
export function pestanaDe(t: Tarea, ahora = new Date()): Pestana | null {
  if (t.estado === "cancelada") return null;
  if (t.estado === "completada") return "hechas";
  if (estaAtrasada(t, ahora)) return "atrasadas";
  if (!t.venceEn) return "hoy";
  const fin = new Date(ahora);
  fin.setHours(23, 59, 59, 999);
  return new Date(t.venceEn) <= fin ? "hoy" : "proximas";
}
