// Cierre de sesión por inactividad (ADR-0005, celulares compartidos). Lo configura la organización
// (organizations.idle_timeout_minutes); null = apagado, que es el valor por defecto.
// Cuenta como actividad tocar, escribir, hacer scroll o volver a la pestaña. Si la pestaña estuvo en
// segundo plano más tiempo que el límite, al volver se cierra de inmediato.
import { useEffect } from "react";

const EVENTOS = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

export function useInactividad(minutos: number | null, alVencer: () => void) {
  useEffect(() => {
    if (!minutos) return;
    const limite = minutos * 60_000;
    let ultima = Date.now();
    const marcar = () => {
      ultima = Date.now();
    };
    const revisar = () => {
      if (Date.now() - ultima >= limite) alVencer();
    };
    const alVolver = () => {
      if (document.visibilityState === "visible") revisar();
    };
    for (const ev of EVENTOS) window.addEventListener(ev, marcar, { passive: true });
    document.addEventListener("visibilitychange", alVolver);
    const reloj = window.setInterval(revisar, 30_000);
    return () => {
      for (const ev of EVENTOS) window.removeEventListener(ev, marcar);
      document.removeEventListener("visibilitychange", alVolver);
      window.clearInterval(reloj);
    };
  }, [minutos, alVencer]);
}
