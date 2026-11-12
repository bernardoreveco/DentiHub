// Qué fuente usa la app al arrancar (ADR-0007):
//   - "supabase": la app real. Es lo normal en dentihub.brevco.cl.
//   - "demo": SOLO si esta pestaña entró con un enlace de demo válido (lo crea un Administrador),
//             o en el computador de desarrollo sin variables de Supabase.
//   - "sin_configuracion": producción sin variables de Supabase. Antes caía sola a la demo y
//             parecía que se publicaba «el demo»; ahora muestra un aviso y no entra a nada.
// La marca de demo vive en sessionStorage: dura lo que dura la pestaña y no la ve otra pestaña.
import { supabase } from "@/lib/supabase";

const CLAVE_DEMO = "dentihub-demo-activa";

export type ModoApp = "supabase" | "demo" | "sin_configuracion";

function demoActivada(): boolean {
  try {
    return sessionStorage.getItem(CLAVE_DEMO) === "1";
  } catch {
    return false;
  }
}

export function calcularModo(): ModoApp {
  if (demoActivada()) return "demo";
  // En desarrollo se puede forzar la demo con VITE_DATA_SOURCE=demo.
  if (import.meta.env.DEV && import.meta.env["VITE_DATA_SOURCE"] === "demo") return "demo";
  if (supabase) return "supabase";
  return import.meta.env.DEV ? "demo" : "sin_configuracion";
}

export const modoApp: ModoApp = calcularModo();

/** Comprueba el código del enlace con la base. Solo responde válido o no válido. */
export async function validarEnlaceDemo(codigo: string): Promise<boolean> {
  if (!supabase || !/^[0-9a-f]{48}$/.test(codigo)) return false;
  const { data, error } = await supabase.rpc("validar_enlace_demo", { p_token: codigo });
  if (error) throw new Error("No pudimos comprobar el enlace. Revisa tu conexión e inténtalo de nuevo.");
  return data === true;
}

/** Entra a la demo en esta pestaña y recarga para cambiar de fuente. */
export function entrarADemo() {
  sessionStorage.setItem(CLAVE_DEMO, "1");
  window.location.replace("/ingreso");
}

/** Sale de la demo y vuelve a la app real. */
export function salirDeDemo() {
  try {
    sessionStorage.removeItem(CLAVE_DEMO);
  } catch {
    // nada que borrar
  }
  window.location.replace("/");
}

export const enDemoPorEnlace = () => demoActivada();
