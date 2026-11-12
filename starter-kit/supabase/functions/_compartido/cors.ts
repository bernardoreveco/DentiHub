// Utilidades comunes de las funciones de servidor de DentiHub (Supabase Edge Functions, Deno).
// CORS solo para la URL de la app (APP_URL): ninguna otra página puede llamar a estas funciones
// desde un navegador. Los errores salen con un mensaje para la persona, sin detalles internos.

const APP_URL = Deno.env.get("APP_URL") ?? "";

export function encabezados(origen: string | null): Record<string, string> {
  // localhost se acepta solo para desarrollo local (Vite en el puerto 5173).
  const permitido =
    origen && (origen === APP_URL || origen === "http://localhost:5173") ? origen : APP_URL;
  return {
    "Access-Control-Allow-Origin": permitido,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export function responder(req: Request, cuerpo: unknown, estado = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...encabezados(req.headers.get("Origin")), "Content-Type": "application/json" },
  });
}

/** Mensaje de un error de Postgres (RAISE EXCEPTION) apto para mostrar; si no lo es, uno genérico. */
export function mensajeDeBase(error: { message?: string; code?: string } | null): string {
  if (!error?.message) return "No se pudo completar la acción. Inténtalo de nuevo.";
  // Los RAISE EXCEPTION de las funciones de DentiHub ya están escritos para la persona (en español).
  if (error.code === "P0001" || error.code === "42501") return error.message;
  return "No se pudo completar la acción. Inténtalo de nuevo.";
}

export function variable(nombre: string): string {
  const v = Deno.env.get(nombre);
  if (!v) throw new Error(`Falta la variable de entorno ${nombre}`);
  return v;
}

export { APP_URL };
