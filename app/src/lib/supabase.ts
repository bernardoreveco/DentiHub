// Cliente de Supabase para el navegador. Solo usa la clave pública (publishable/anon); la clave
// de servicio (service role) nunca debe estar en código que se envía al navegador.
//
// Los nombres de las variables van en .env.example; los valores, solo en .env (que no se sube a Git).
// Para tipar las consultas, genera los tipos de la base con `supabase gen types typescript` y pásalos
// como genérico: createClient<Database>(…). Regéneralos después de cada migración.
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env["VITE_SUPABASE_URL"];
const publishableKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

if (!url || !publishableKey) {
  const missing = [
    ...(!url ? ["VITE_SUPABASE_URL"] : []),
    ...(!publishableKey ? ["VITE_SUPABASE_PUBLISHABLE_KEY"] : []),
  ];
  throw new Error(`Faltan variables de entorno de Supabase: ${missing.join(", ")}`);
}

export const supabase = createClient(url, publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});
