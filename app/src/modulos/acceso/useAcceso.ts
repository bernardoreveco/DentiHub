// Hook del contrato «contexto de acceso» (docs/modulos/README.md). Llave de caché estable ["acceso"].
// Todos los módulos lo leen para saber quién es la persona, su rol y si está habilitada.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fuente } from "@/datos/fuente";

export function useAcceso() {
  return useQuery({
    queryKey: ["acceso"],
    queryFn: async () => {
      const a = await fuente.acceso();
      return a;
    },
    staleTime: 60_000,
  });
}

/** Entrar o salir limpia toda la caché: los datos de una persona no deben verse con otra sesión. */
export function useSesion() {
  const qc = useQueryClient();
  const reset = async () => {
    qc.clear();
    await qc.invalidateQueries({ queryKey: ["acceso"] });
  };
  return {
    entrarDemo: useMutation({ mutationFn: (id: string) => fuente.entrarDemo(id), onSuccess: reset }),
    ingresar: useMutation({
      mutationFn: (v: { correo: string; clave: string }) => fuente.ingresar(v.correo, v.clave),
      onSuccess: reset,
    }),
    salir: useMutation({ mutationFn: () => fuente.salir(), onSuccess: reset }),
  };
}
