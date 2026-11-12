// Errores con un mensaje pensado para mostrarse tal cual a la persona (en un aviso), en español de Chile.
export class ErrorDeRegla extends Error {
  override name = "ErrorDeRegla";
}

/**
 * No se pudo hablar con el servidor (sin señal, servidor caído). Se distingue de una denegación a
 * propósito: un error de red se reintenta y NUNCA lleva a «sin acceso» (ADR-0005, A3).
 */
export class ErrorDeConexion extends Error {
  override name = "ErrorDeConexion";
  constructor(message = "No hay conexión con el servidor. Revisa tu señal e inténtalo de nuevo.") {
    super(message);
  }
}
