// Formatos de Chile (DESIGN_SYSTEM.md): fechas dd-mm-aaaa y hora de 24 h, en la zona de Santiago.
const ZONA = "America/Santiago";

const partes = (iso: string) => {
  const f = new Intl.DateTimeFormat("es-CL", {
    timeZone: ZONA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const v = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return { d: v("day"), m: v("month"), a: v("year"), h: v("hour"), min: v("minute") };
};

export function fecha(iso: string | null): string {
  if (!iso) return "Sin fecha";
  const p = partes(iso);
  return `${p.d}-${p.m}-${p.a}`;
}

export function fechaHora(iso: string | null): string {
  if (!iso) return "Sin fecha";
  const p = partes(iso);
  return `${p.d}-${p.m}-${p.a} ${p.h}:${p.min}`;
}

export function hora(iso: string): string {
  const p = partes(iso);
  return `${p.h}:${p.min}`;
}

/** «Vence hoy 18:00», «Vence mañana 09:00», «Atrasada 2 días», «Vence 14-11-2026». */
export function vencimiento(iso: string | null, ahora = new Date()): string {
  if (!iso) return "Sin vencimiento";
  const v = new Date(iso);
  const dia = (x: Date) => Math.floor((x.getTime() - x.getTimezoneOffset() * 60000) / 86400000);
  const dif = dia(v) - dia(ahora);
  if (v < ahora) {
    const dias = Math.max(0, dia(ahora) - dia(v));
    if (dias === 0) return `Atrasada desde las ${hora(iso)}`;
    return dias === 1 ? "Atrasada 1 día" : `Atrasada ${dias} días`;
  }
  if (dif === 0) return `Vence hoy ${hora(iso)}`;
  if (dif === 1) return `Vence mañana ${hora(iso)}`;
  return `Vence ${fecha(iso)}`;
}

export function porcentaje(parte: number, total: number): string {
  if (total === 0) return "Sin datos";
  return `${Math.round((parte / total) * 100)} %`;
}
