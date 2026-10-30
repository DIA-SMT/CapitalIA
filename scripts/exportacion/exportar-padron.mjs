/**
 * Exporta el padrón —agentes con su repartición— para cargarlo en otro sistema.
 *
 *   node scripts/exportacion/exportar-padron.mjs
 *
 * Deja dos archivos en esta carpeta, que está en .gitignore: un CSV para abrir en
 * Excel y un JSON para que lo consuma un programa.
 *
 * ES UNA FOTO, NO UNA INTEGRACIÓN. El padrón se refresca con cada liquidación, así
 * que un archivo generado hoy envejece. Para un sistema que necesite el dato vivo,
 * lo correcto es un endpoint de solo lectura en CapitalIA, no reenviar este
 * archivo todos los meses.
 *
 * SOLO LECTURA: no escribe una fila. Usa la service role key porque tiene que ver
 * el padrón entero, salteando la RLS por repartición.
 *
 * Qué NO se exporta, a propósito: el id interno de cada persona (no le sirve a
 * nadie afuera y es la llave de la base) y el puesto del nomenclador (hoy no hay
 * ninguna asignación cargada; si mañana las hay, se agrega una columna).
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

if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const U = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const H = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
};

/** Trae una tabla entera de a mil: PostgREST no devuelve más que eso por pedido. */
async function traerTodo(tabla, select, orden) {
  const LOTE = 1000;
  const filas = [];
  for (let desde = 0; ; desde += LOTE) {
    const r = await fetch(
      `${U}/${tabla}?select=${select}&order=${orden}&offset=${desde}&limit=${LOTE}`,
      { headers: H },
    );
    if (!r.ok) throw new Error(`${tabla}: ${r.status} ${await r.text()}`);
    const lote = await r.json();
    filas.push(...lote);
    if (lote.length < LOTE) break;
  }
  return filas;
}

// --- 1. El organigrama -------------------------------------------------------
const reparticiones = await traerTodo(
  "reparticiones",
  "id,code,nombre,tipo,parent_id,external_id,is_active",
  "code",
);
const porId = new Map(reparticiones.map((r) => [r.id, r]));
console.log(`reparticiones  ${String(reparticiones.length).padStart(5)}`);

/**
 * La secretaría de la que cuelga una unidad: se sube por parent_id hasta la raíz.
 * El tope de saltos es por las dudas; un ciclo lo impide un trigger (migración
 * 0017), pero un bucle infinito en un export no se perdona.
 */
function secretariaDe(rep) {
  let actual = rep;
  for (let i = 0; i < 10 && actual?.parent_id; i++) actual = porId.get(actual.parent_id);
  return actual;
}

// --- 2. Las personas ---------------------------------------------------------
const personas = await traerTodo(
  "personas",
  "legajo,full_name,email,is_active,reparticion_id",
  "legajo",
);
console.log(`personas       ${String(personas.length).padStart(5)}`);

const filas = personas.map((p) => {
  const rep = porId.get(p.reparticion_id);
  const sec = rep ? secretariaDe(rep) : null;
  return {
    legajo: p.legajo,
    nombre: p.full_name,
    activo: p.is_active ? "SI" : "NO",
    email: p.email ?? "",
    reparticion_codigo: rep?.code ?? "",
    reparticion: rep?.nombre ?? "",
    reparticion_tipo: rep?.tipo ?? "",
    // El id de la unidad en GRH. Es la columna para cruzar con otro sistema
    // municipal; viene vacía en las unidades creadas desde CapitalIA.
    reparticion_id_grh: rep?.external_id ?? "",
    secretaria: sec?.nombre ?? "",
  };
});

// --- 3. Los archivos ---------------------------------------------------------
// Las tres reglas del CSV son las mismas de src/lib/csv.ts, repetidas acá porque
// este script es Node y aquello es TypeScript de la app: separador `;` (Excel en
// español), BOM UTF-8 (si no, los acentos salen rotos) y comilla delante de lo que
// arranca con = + - @ (Excel lo ejecutaría como fórmula).
const BOM = String.fromCharCode(0xfeff);
const celda = (v) => {
  const s = String(v ?? "").replace(/\r?\n/g, " ").trim();
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

const columnas = Object.keys(filas[0] ?? { legajo: "" });
const csv =
  BOM +
  [
    columnas.map(celda).join(";"),
    ...filas.map((f) => columnas.map((c) => celda(f[c])).join(";")),
  ].join("\r\n") +
  "\r\n";

const sello = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const baseCsv = path.join(DIR, `padron-${sello}.csv`);
const baseJson = path.join(DIR, `padron-${sello}.json`);
fs.writeFileSync(baseCsv, csv, "utf8");
fs.writeFileSync(
  baseJson,
  JSON.stringify({ generado: new Date().toISOString(), total: filas.length, agentes: filas }, null, 2),
  "utf8",
);

const activos = filas.filter((f) => f.activo === "SI").length;
const sinRep = filas.filter((f) => !f.reparticion).length;
console.log(`\n${filas.length} agentes · ${activos} activos · ${sinRep} sin repartición`);
console.log(`-> ${path.basename(baseCsv)}`);
console.log(`-> ${path.basename(baseJson)}`);
console.log(
  "\nLos dos archivos traen datos personales de empleados municipales:\n" +
    "esta carpeta está ignorada por git, pero un `git clean` se los lleva.",
);
