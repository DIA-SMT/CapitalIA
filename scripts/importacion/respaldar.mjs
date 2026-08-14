/**
 * Respalda a un archivo las tablas que la importación va a tocar.
 *
 * Existe porque el proyecto está en el plan gratuito de Supabase y NO tiene
 * Point-in-Time Recovery: si la carga sale mal, esto es lo único que hay para
 * volver atrás. Se corre ANTES de escribir una sola fila.
 *
 * El archivo queda en este directorio, que está en .gitignore: trae nombres y
 * legajos de empleados municipales.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(DIR, "../..");

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(REPO, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const H = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
};

/** Trae la tabla entera de a mil, porque PostgREST no devuelve más de eso. */
async function traerTodo(tabla) {
  const LOTE = 1000;
  const filas = [];
  for (let desde = 0; ; desde += LOTE) {
    const r = await fetch(
      `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${tabla}?select=*&order=id&offset=${desde}&limit=${LOTE}`,
      { headers: H },
    );
    if (!r.ok) throw new Error(`${tabla}: ${r.status} ${await r.text()}`);
    const lote = await r.json();
    filas.push(...lote);
    if (lote.length < LOTE) break;
  }
  return filas;
}

const TABLAS = ["personas", "reparticiones", "asignaciones", "perfil_reparticiones"];

const respaldo = { generado: new Date().toISOString(), tablas: {} };
for (const t of TABLAS) {
  respaldo.tablas[t] = await traerTodo(t);
  console.log(`${t.padEnd(22)} ${String(respaldo.tablas[t].length).padStart(5)} filas`);
}

// El nombre lleva la marca de tiempo: nunca se pisa un respaldo anterior.
const sello = respaldo.generado.replace(/[:.]/g, "-").slice(0, 19);
const destino = path.join(DIR, `respaldo-${sello}.json`);
fs.writeFileSync(destino, JSON.stringify(respaldo, null, 2), "utf8");
console.log(`\n-> ${path.basename(destino)}`);
console.log(
  "Guardalo fuera de esta carpeta si la carga es grande: acá está ignorado por git,\n" +
    "pero un `git clean` se lo lleva.",
);
