// Genera una versión HTML (para ver en el navegador o el teléfono) de cada .md con diagramas Mermaid
// de docs/diagramas/ y docs/modulos/. El .md es la fuente única: el HTML no se edita a mano.
// Uso (desde la raíz del repositorio):   node scripts/generar-html-diagramas.mjs
// Solo lee esos .md y escribe su .html al lado. No usa la red (el HTML carga Mermaid al abrirse).
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const carpetas = ["docs/diagramas", "docs/modulos"];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const enLinea = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, texto, ref) => {
      // Los enlaces entre documentos de estas carpetas apuntan a su versión HTML; los demás se muestran como texto.
      const local = /^[\w./-]+\.md(#[\w-]*)?$/.test(ref) && !ref.startsWith("../");
      return local ? `<a href="${ref.replace(/\.md/, ".html")}">${texto}</a>` : texto;
    })
    .replace(/`([^`]+)`/g, "<code>$1</code>");

function convertir(md) {
  const lineas = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let lista = null; // "ul" u "ol" mientras se está dentro de una lista
  const cerrarLista = () => {
    if (lista) out.push(`</${lista}>`);
    lista = null;
  };
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (l.startsWith("```mermaid")) {
      cerrarLista();
      const buf = [];
      while (!lineas[++i].startsWith("```")) buf.push(lineas[i]);
      out.push(`<div class="card"><pre class="mermaid">${esc(buf.join("\n"))}</pre></div>`);
      continue;
    }
    const titulo = l.match(/^(#{1,3}) (.*)$/);
    const vineta = l.match(/^- (.*)$/);
    const numero = l.match(/^\d+\. (.*)$/);
    if (titulo) {
      cerrarLista();
      const n = titulo[1].length;
      out.push(`<h${n}>${enLinea(titulo[2])}</h${n}>`);
    } else if (vineta || numero) {
      const tipo = vineta ? "ul" : "ol";
      if (lista !== tipo) {
        cerrarLista();
        out.push(`<${tipo}>`);
        lista = tipo;
      }
      out.push(`<li>${enLinea((vineta || numero)[1])}</li>`);
    } else if (l.trim()) {
      cerrarLista();
      out.push(`<p>${enLinea(l)}</p>`);
    } else cerrarLista();
  }
  cerrarLista();
  return out.join("\n");
}

const plantilla = (titulo, cuerpo) => `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<!-- Generado desde el .md del mismo nombre con scripts/generar-html-diagramas.mjs: no editar a mano.
     Necesita internet para dibujar los diagramas (carga Mermaid). -->
<style>
:root{--bg:#f7f8fa;--card:#fff;--fg:#1f2937;--muted:#5b6472;--line:#e3e6ea;--link:#0077a9}
@media (prefers-color-scheme:dark){:root{--bg:#0f141a;--card:#161c24;--fg:#e8ecf1;--muted:#9aa4b2;--line:#273140;--link:#5cc3ee}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 Inter,system-ui,sans-serif;padding:16px}
main{max-width:1000px;margin:0 auto}
h1{font-size:22px;margin:8px 0 12px}h2{font-size:18px;margin:28px 0 8px}h3{font-size:16px;margin:20px 0 6px}
p,li{color:var(--muted)}p{margin:6px 0}ul,ol{padding-left:22px;margin:6px 0}
a{color:var(--link)}code{font-size:13px}strong{color:var(--fg)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;margin:12px 0;overflow-x:auto}
.card .mermaid{margin:0;text-align:center;background:#fff;border-radius:8px;padding:8px}
.card svg{max-width:100%;height:auto}
</style>
</head>
<body><main>
${cuerpo}
</main>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<script>mermaid.initialize({startOnLoad:true,theme:"default",securityLevel:"strict",flowchart:{htmlLabels:true,useMaxWidth:true}});</script>
</body>
</html>
`;

let n = 0;
for (const c of carpetas) {
  for (const f of readdirSync(join(raiz, c)).filter((x) => x.endsWith(".md"))) {
    const md = readFileSync(join(raiz, c, f), "utf8");
    const titulo = (md.match(/^# (.*)$/m)?.[1] ?? f).replace(/[`*]/g, "");
    writeFileSync(join(raiz, c, f.replace(/\.md$/, ".html")), plantilla(titulo, convertir(md)), "utf8");
    console.log(`  ${c}/${f.replace(/\.md$/, ".html")}`);
    n++;
  }
}
console.log(`Listo: ${n} archivo(s) HTML generados.`);
