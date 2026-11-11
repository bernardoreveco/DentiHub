// Datos de ejemplo del modo demo. Todo es ficticio (personas, correos y empresa).
// Las fechas se calculan desde «ahora» para que siempre haya tareas de hoy, atrasadas y próximas.
import type { Area, Persona, Plantilla, RegistroAuditoria, Tarea } from "@/datos/tipos";

export type EstadoDemo = {
  version: 1;
  sesion: string | null;
  areas: Area[];
  personas: Persona[];
  plantillas: Plantilla[];
  tareas: Tarea[];
  /** Metadatos de las fotos; la imagen va aparte en el almacenamiento del navegador. */
  evidencias: { id: string; tareaId: string; bytes: number; huella: string; subidaPor: string; creadaEn: string }[];
  auditoria: RegistroAuditoria[];
};

export function semilla(ahora = new Date()): EstadoDemo {
  const h = (dias: number, horas: number) => {
    const d = new Date(ahora);
    d.setDate(d.getDate() + dias);
    d.setHours(horas, 0, 0, 0);
    return d.toISOString();
  };

  const areas: Area[] = [
    { id: "area-ope", nombre: "Operaciones" },
    { id: "area-man", nombre: "Mantención" },
    { id: "area-bod", nombre: "Bodega" },
  ];

  const personas: Persona[] = [
    { id: "u-admin", nombre: "Ana Torres", correo: "ana.torres@empresa-demo.cl", rol: "admin", areaIds: [], activa: true },
    { id: "u-gestor", nombre: "Diego Muñoz", correo: "diego.munoz@empresa-demo.cl", rol: "gestor", areaIds: ["area-ope", "area-man"], activa: true },
    { id: "u-tec1", nombre: "Camila Rojas", correo: "camila.rojas@empresa-demo.cl", rol: "tecnico", areaIds: ["area-man"], activa: true },
    { id: "u-tec2", nombre: "Matías Soto", correo: "matias.soto@empresa-demo.cl", rol: "tecnico", areaIds: ["area-ope"], activa: true },
    { id: "u-tec3", nombre: "Paula Vera", correo: "paula.vera@empresa-demo.cl", rol: "tecnico", areaIds: ["area-bod"], activa: false },
  ];

  const plantillas: Plantilla[] = [
    {
      id: "pl-filtros",
      nombre: "Revisión de filtros",
      version: 1,
      exigeFoto: true,
      minFotos: 1,
      pasos: [
        { key: "apagar", label: "Apagar el equipo y bloquear el interruptor", tipo: "check", requerido: true },
        { key: "retirar", label: "Retirar y revisar el filtro", tipo: "check", requerido: true },
        { key: "cambio", label: "¿Fue necesario cambiar el filtro?", tipo: "yesno", requerido: true },
        { key: "presion", label: "Presión de salida (bar)", tipo: "number", requerido: true },
        { key: "obs", label: "Observaciones", tipo: "text", requerido: false },
      ],
    },
    {
      id: "pl-limpieza",
      nombre: "Limpieza de equipo",
      version: 1,
      exigeFoto: true,
      minFotos: 1,
      pasos: [
        { key: "superficie", label: "Limpiar superficies exteriores", tipo: "check", requerido: true },
        { key: "desinfectar", label: "Desinfectar puntos de contacto", tipo: "check", requerido: true },
        { key: "registro", label: "Dejar el equipo rotulado como limpio", tipo: "check", requerido: true },
      ],
    },
    {
      id: "pl-temperatura",
      nombre: "Control de temperatura",
      version: 1,
      exigeFoto: false,
      minFotos: 1,
      pasos: [
        { key: "temp", label: "Temperatura registrada (°C)", tipo: "number", requerido: true },
        { key: "rango", label: "¿Está dentro del rango permitido?", tipo: "yesno", requerido: true },
      ],
    },
  ];

  const base = {
    iniciadaEn: null,
    completadaEn: null,
    completadaPor: null,
    canceladaEn: null,
    motivoCancelacion: null,
    creadaPor: "u-gestor",
    creadaEn: h(-3, 8),
  } as const;

  const tareas: Tarea[] = [
    { ...base, id: "t-1", titulo: "Revisión de filtros · Sala de máquinas 2", plantillaId: "pl-filtros", areaId: "area-man", responsableId: "u-tec1", estado: "pendiente", venceEn: h(0, 18), respuestas: {} },
    { ...base, id: "t-2", titulo: "Limpieza de equipo · Compresor C-14", plantillaId: "pl-limpieza", areaId: "area-man", responsableId: "u-tec1", estado: "en_progreso", venceEn: h(0, 13), respuestas: { superficie: true }, iniciadaEn: h(0, 9) },
    { ...base, id: "t-3", titulo: "Control de temperatura · Bodega fría", plantillaId: "pl-temperatura", areaId: "area-ope", responsableId: "u-tec2", estado: "pendiente", venceEn: h(-1, 17), respuestas: {} },
    { ...base, id: "t-4", titulo: "Revisión de filtros · Planta norte", plantillaId: "pl-filtros", areaId: "area-man", responsableId: "u-tec1", estado: "pendiente", venceEn: h(-2, 12), respuestas: {} },
    { ...base, id: "t-5", titulo: "Limpieza de equipo · Línea de envasado", plantillaId: "pl-limpieza", areaId: "area-ope", responsableId: "u-tec2", estado: "pendiente", venceEn: h(2, 10), respuestas: {} },
    { ...base, id: "t-6", titulo: "Control de temperatura · Cámara 1", plantillaId: "pl-temperatura", areaId: "area-ope", responsableId: "u-tec2", estado: "completada", venceEn: h(-1, 12), respuestas: { temp: 4, rango: true }, iniciadaEn: h(-1, 9), completadaEn: h(-1, 10), completadaPor: "u-tec2" },
    { ...base, id: "t-7", titulo: "Control de temperatura · Sala de máquinas 1", plantillaId: "pl-temperatura", areaId: "area-man", responsableId: "u-tec1", estado: "completada", venceEn: h(-2, 18), respuestas: { temp: 21, rango: true }, iniciadaEn: h(-2, 15), completadaEn: h(-2, 16), completadaPor: "u-tec1" },
    { ...base, id: "t-8", titulo: "Limpieza de equipo · Bodega central", plantillaId: "pl-limpieza", areaId: "area-bod", responsableId: null, estado: "pendiente", venceEn: h(1, 9), respuestas: {} },
  ];

  return {
    version: 1,
    sesion: null,
    areas,
    personas,
    plantillas,
    tareas,
    evidencias: [],
    auditoria: [
      { id: "a-1", actorId: "u-tec2", accion: "Completó la tarea «Control de temperatura · Cámara 1»", modulo: "operacion", detalle: "t-6", creadaEn: h(-1, 10) },
      { id: "a-2", actorId: "u-tec1", accion: "Completó la tarea «Control de temperatura · Sala de máquinas 1»", modulo: "operacion", detalle: "t-7", creadaEn: h(-2, 16) },
      { id: "a-3", actorId: "u-admin", accion: "Desactivó la cuenta de Paula Vera", modulo: "administracion", detalle: "u-tec3", creadaEn: h(-3, 11) },
    ],
  };
}
