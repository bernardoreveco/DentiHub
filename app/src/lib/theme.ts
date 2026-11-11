// Temas de color y modo oscuro. Sin dependencias de datos: guardar la preferencia de cada persona
// (por ejemplo en profiles.theme) es responsabilidad de quien use esto.
//
// Los valores de cada tema viven en src/styles/themes.css (bloques :root[data-theme="…"]) y el
// modo oscuro en el bloque .dark de src/styles.css. "clasico" es el tema por defecto y no tiene
// bloque propio: simplemente no se aplica ningún data-theme.

export type ThemeKey = "clasico" | "rosa" | "azul-marino" | "celeste" | "morado" | "diente-feliz";

export const THEME_OPTIONS: { key: ThemeKey; label: string; swatch: string }[] = [
  { key: "clasico", label: "Clásico", swatch: "oklch(0.53 0.13 232)" },
  { key: "rosa", label: "Rosa Coral", swatch: "oklch(0.668 0.176 3)" },
  { key: "azul-marino", label: "Azul Marino", swatch: "oklch(0.353 0.093 259)" },
  { key: "celeste", label: "Celeste Clínico", swatch: "oklch(0.678 0.111 217)" },
  { key: "morado", label: "Morado Aurora", swatch: "oklch(0.554 0.15 296)" },
  { key: "diente-feliz", label: "Diente Feliz", swatch: "oklch(0.757 0.148 36)" },
];

export function isThemeKey(value: string | null | undefined): value is ThemeKey {
  return !!value && THEME_OPTIONS.some((t) => t.key === value);
}

/** Aplica el tema al documento completo (atributo data-theme en <html>). */
export function applyTheme(theme: ThemeKey | null | undefined): void {
  const root = document.documentElement;
  if (theme && theme !== "clasico") {
    root.setAttribute("data-theme", theme);
  } else {
    root.removeAttribute("data-theme");
  }
}

/**
 * Activa o desactiva el modo oscuro (clase `dark` en <html>).
 * NOTA: esta función es nueva, no viene de Dentiventario. Allí el bloque .dark existe en
 * styles.css pero ningún código lo activa, así que el modo oscuro nunca se probó en pantalla.
 */
export function applyColorMode(mode: "light" | "dark"): void {
  document.documentElement.classList.toggle("dark", mode === "dark");
}
