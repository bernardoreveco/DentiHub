// Hook del contrato «contexto de acceso» (docs/modulos/README.md, ADR-0005).
// Todos los módulos lo leen para saber quién es la persona, su rol y si está habilitada.
//
// Cuándo se vuelve a comprobar (A3): al volver a la pestaña, cada 5 minutos y ante cada cambio de
// sesión (ingreso, salida, renovación, también desde otra pestaña). En cada cambio de sesión se
// borra TODA la caché: los datos de una persona nunca se ven con la sesión de otra.
// Un error de red se reintenta 3 veces con espera creciente; nunca se trata como «sin acceso».
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ErrorDeConexion, fuente } from "@/datos/fuente";

const CINCO_MINUTOS = 5 * 60_000;

/**
 * Borra los datos de la sesión anterior y vuelve a pedir el acceso.
 * Por qué no solo qc.clear(): clear() quita la caché pero NO avisa a la pantalla que ya está
 * mostrando el acceso, así que nadie lo vuelve a pedir (al pulsar «Cancelar y salir» en A2 la
 * pantalla quedaba igual). resetQueries() sí lo vuelve a pedir en las pantallas montadas.
 */
async function reiniciarSesion(qc: QueryClient) {
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "acceso" });
  await qc.resetQueries({ queryKey: ["acceso"] });
}

export function useAcceso() {
  return useQuery({
    queryKey: ["acceso"],
    queryFn: () => fuente.acceso(),
    staleTime: 60_000,
    refetchInterval: CINCO_MINUTOS,
    refetchOnWindowFocus: true,
    // Solo se reintenta un problema de conexión; cualquier otro error se muestra de inmediato.
    retry: (intentos, error) => error instanceof ErrorDeConexion && intentos < 3,
    retryDelay: (intento) => Math.min(1000 * 2 ** intento, 8000),
  });
}

/** Escucha los cambios de sesión y limpia la caché. Se monta una vez, en la raíz de la app. */
export function useEscucharSesion() {
  const qc = useQueryClient();
  useEffect(
    () =>
      fuente.alCambiarSesion((evento) => {
        if (evento === "renovacion") {
          void qc.invalidateQueries({ queryKey: ["acceso"] });
          return;
        }
        void reiniciarSesion(qc);
      }),
    [qc],
  );
}

/** Entrar o salir limpia toda la caché: los datos de una persona no deben verse con otra sesión. */
export function useSesion() {
  const qc = useQueryClient();
  const reset = () => reiniciarSesion(qc);
  return {
    entrarDemo: useMutation({ mutationFn: (id: string) => fuente.entrarDemo(id), onSuccess: reset }),
    ingresar: useMutation({
      mutationFn: (v: { correo: string; clave: string }) => fuente.ingresar(v.correo, v.clave),
      onSuccess: reset,
    }),
    // Si el servidor no responde al salir, igual se limpia lo local (fail-closed).
    salir: useMutation({ mutationFn: () => fuente.salir(), onSettled: reset }),
  };
}
