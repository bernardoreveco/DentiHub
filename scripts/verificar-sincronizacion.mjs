// Verificador de sincronización de DentiHub. Compara las "bases" entre sí y avisa si alguna quedó desfasada.
// Uso (desde la raíz del repositorio):   node scripts/verificar-sincronizacion.mjs
// Sale con código 1 si encuentra diferencias, para poder usarlo antes de cada commit o en el CI.
// Solo LEE archivos del proyecto: no escribe, no usa la red ni toca Supabase.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const leer = (rel) => {
  const p = join(raiz, rel);
  if (!existsSync(p)) throw new Error(`Falta el archivo ${rel}`);
  return readFileSync(p, "utf8").replace(/\r\n/g, "\n");
};

const fallos = [];
const avisos = [];
let revisiones = 0;
const iguales = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const comparar = (titulo, fuentes) => {
  revisiones++;
  const nombres = Object.keys(fuentes);
  const base = fuentes[nombres[0]];
  for (const n of nombres.slice(1)) {
    if (!iguales(base, fuentes[n])) {
      fallos.push(`${titulo}: «${nombres[0]}» = [${base}] pero «${n}» = [${fuentes[n]}]`);
    }
  }
};
const conjunto = (txt) => [...new Set(txt.split(",").map((s) => s.trim()).filter(Boolean))].sort();

try {
  const base = leer("docs/BASE-DEL-PRODUCTO.md");
  const demo = leer("DentiHub-Modelo-Visual.html");
  const roles = leer("starter-kit/src/lib/roles.ts");
  const sql = leer("starter-kit/supabase/migrations/20260101000000_base_perfiles_roles_auditoria.sql");
  const kitCss = leer("starter-kit/src/styles.css");
  const disenio = leer("DESIGN_SYSTEM.md");

  // 1) Módulos: base del producto = menú de la demo
  const marcaModulos = base.match(/<!-- sync:modulos ([^>]+?) -->/);
  if (!marcaModulos) fallos.push("BASE-DEL-PRODUCTO.md no tiene la línea <!-- sync:modulos … -->");
  else {
    const menuDemo = conjunto([...demo.matchAll(/<button class="ri[^"]*" data-act="go" data-v="([^"]+)"/g)].map((m) => m[1]).join(","));
    comparar("Módulos", { "base del producto": conjunto(marcaModulos[1]), "menú de la demo": menuDemo });
  }

  // 2) Roles: base del producto = roles.ts = enum de SQL = selector de la demo = tabla de DESIGN/CLAUDE
  const marcaRoles = base.match(/<!-- sync:roles ([^>]+?) -->/);
  if (!marcaRoles) fallos.push("BASE-DEL-PRODUCTO.md no tiene la línea <!-- sync:roles … -->");
  else {
    const enRoles = roles.match(/export type AppRole = ([^;]+);/);
    const enSql = sql.match(/CREATE TYPE public\.app_role AS ENUM \(([^)]+)\)/);
    const selector = demo.match(/<select id="rol"[^>]*>([\s\S]*?)<\/select>/);
    comparar("Roles", {
      "base del producto": conjunto(marcaRoles[1]),
      "roles.ts": conjunto((enRoles?.[1] ?? "").replace(/["|]/g, ",")),
      "enum de SQL": conjunto((enSql?.[1] ?? "").replace(/'/g, "")),
      "selector de la demo": conjunto([...(selector?.[1] ?? "").matchAll(/value="([^"]+)"/g)].map((m) => m[1]).join(",")),
    });
  }

  // 3) Colores: la demo usa los mismos valores que el kit (los alias de la demo tienen otro nombre)
  const valor = (css, nombre) => css.match(new RegExp(`--${nombre}:\\s*(oklch\\([^)]*\\))`))?.[1]?.replace(/\s+/g, " ");
  const demoRoot = demo.slice(demo.indexOf(":root{"), demo.indexOf("@media (prefers-color-scheme"));
  const kitRoot = kitCss.slice(kitCss.indexOf(":root {"), kitCss.indexOf(".dark {"));
  const pares = [
    ["background", "background"], ["foreground", "foreground"], ["card", "card"], ["primary", "primary"],
    ["primary-foreground", "primary-foreground"], ["secondary", "secondary"], ["muted-bg", "muted"],
    ["muted-foreground", "muted-foreground"], ["hover", "accent"], ["border", "border"],
    ["destructive", "destructive"], ["success", "success"], ["warning", "warning"], ["warning-foreground", "warning-foreground"],
  ];
  for (const [d, k] of pares) {
    revisiones++;
    const vd = valor(demoRoot, d), vk = valor(kitRoot, k);
    if (!vd || !vk) avisos.push(`Color --${d} (demo) / --${k} (kit): no se pudo leer uno de los dos`);
    else if (vd !== vk) fallos.push(`Color: la demo define --${d} = ${vd} pero el kit define --${k} = ${vk}`);
  }

  // 4) DESIGN_SYSTEM.md menciona los valores clave del kit
  for (const k of ["primary", "background", "destructive", "success", "warning"]) {
    revisiones++;
    const vk = valor(kitRoot, k)?.match(/oklch\(([^)]*)\)/)?.[1];
    if (vk && !disenio.includes(vk)) fallos.push(`DESIGN_SYSTEM.md no contiene el valor actual de --${k} del kit (${vk})`);
  }

  // 4b) La app (app/) usa los mismos estilos y roles que el kit (se copió de él; ADR-0004)
  for (const rel of ["src/styles.css", "src/styles/themes.css", "src/lib/roles.ts", "src/components/AppShell.tsx", "src/components/StatusBadge.tsx"]) {
    if (!existsSync(join(raiz, "app", rel))) continue;
    revisiones++;
    if (leer(`app/${rel}`) !== leer(`starter-kit/${rel}`)) fallos.push(`app/${rel} no coincide con starter-kit/${rel}: aplica el cambio en los dos`);
  }

  // 5) Cada módulo de la demo tiene su pantalla
  revisiones++;
  for (const clave of conjunto(marcaModulos?.[1] ?? "")) {
    if (!demo.includes(`id="v-${clave}"`)) fallos.push(`La demo no tiene la pantalla «v-${clave}» de la base del producto`);
  }
} catch (e) {
  fallos.push(e.message);
}

console.log(`Sincronización de DentiHub · ${revisiones} comprobaciones`);
for (const a of avisos) console.log(`  ⚠ ${a}`);
if (fallos.length) {
  console.log(`\n✗ ${fallos.length} desfase(s) encontrado(s):`);
  for (const f of fallos) console.log(`  - ${f}`);
  console.log("\nActualiza los archivos indicados (ver AGENTE.md, sección 8) y vuelve a ejecutarlo.");
  process.exit(1);
}
console.log("✓ Todo coincide: módulos, roles, colores y documentación de diseño.");
