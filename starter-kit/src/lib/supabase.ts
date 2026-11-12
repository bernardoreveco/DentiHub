// Cliente de Supabase para el navegador. Solo usa la clave pública (publishable/anon); la clave
// de servicio (service role) nunca debe estar en código que se envía al navegador.
//
// Los nombres de las variables van en .env.example; los valores, solo en .env (que no se sube a Git)
// o en el panel de Vercel. Si faltan, se exporta null en vez de lanzar un error al importar: la app
// debe poder funcionar en modo demo sin variables (ADR-0004).
//
// flowType "pkce": los enlaces de los correos no llevan el token de sesión en la URL (ADR-0005).
// Para tipar las consultas, genera los tipos con `supabase gen types typescript` y pásalos como
// genérico: createClient<Database>(…). Regéneralos después de cada migración.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env["VITE_SUPABASE_URL"];
const publishableKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

export const supabase: SupabaseClient | null =
  url && publishableKey
    ? createClient(url, publishableKey, {
        auth: {
          flowType: "pkce",
          persistSession: true,
          autoRefreshToken: true,
          // Los enlaces de correo los canjea A9 con un botón, no la carga de la página.
          detectSessionInUrl: false,
        },
      })
    : null;
