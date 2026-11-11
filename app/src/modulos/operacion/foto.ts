// Comprime la foto en el teléfono antes de subirla: lado mayor de 1600 px, JPG al 80 %.
// Por qué: en terreno la señal es mala y una foto de cámara pesa 3 a 6 MB; comprimida queda en
// unos 200 a 500 KB y se sube en segundos (idea de las apps de terreno, ver docs/referencias).
import { EVIDENCIA } from "@/modulos/operacion/reglas";
import { ErrorDeRegla } from "@/datos/errores";

export async function comprimirFoto(archivo: File): Promise<Blob> {
  if (!archivo.type.startsWith("image/")) throw new ErrorDeRegla("Ese archivo no es una foto.");
  let imagen: ImageBitmap;
  try {
    imagen = await createImageBitmap(archivo);
  } catch {
    // Algunos navegadores no leen HEIC: se explica en vez de fallar en silencio.
    throw new ErrorDeRegla("No pudimos leer esa foto. Prueba sacarla de nuevo o usa formato JPG.");
  }
  const escala = Math.min(1, EVIDENCIA.ladoMaximo / Math.max(imagen.width, imagen.height));
  const ancho = Math.round(imagen.width * escala);
  const alto = Math.round(imagen.height * escala);
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new ErrorDeRegla("Este navegador no puede procesar fotos.");
  ctx.drawImage(imagen, 0, 0, ancho, alto);
  imagen.close();
  const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", 0.8));
  if (!blob) throw new ErrorDeRegla("No pudimos procesar la foto. Inténtalo de nuevo.");
  return blob;
}
