import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { router } from "@/router";
import { modoApp } from "@/datos/modo";
import { SinConfiguracion } from "@/modulos/acceso/ActivarDemo";
import "@/styles.css";

// Sin reintentos automáticos en errores de regla: repetir «falta la foto» tres veces no ayuda.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true }, mutations: { retry: 0 } },
});

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Falta el elemento #root en index.html");

createRoot(raiz).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {modoApp === "sin_configuracion" ? <SinConfiguracion /> : <RouterProvider router={router} />}
      {/* Avisos arriba a la derecha (DESIGN_SYSTEM.md); en celular sonner los centra arriba. */}
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  </StrictMode>,
);
