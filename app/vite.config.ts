// Configuración de Vite del MVP. Alias @/ → src/ (mismo que el kit) y Tailwind v4 como plugin.
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // host: true permite abrir la app desde el celular en la misma red wifi (útil para probar en terreno).
  server: { port: 5173, host: true },
});
