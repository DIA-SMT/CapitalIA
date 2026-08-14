/**
 * Corrige el `tipo` de las reparticiones importadas cuando el NOMBRE lo declara
 * y contradice al deducido del código.
 *
 * POR QUÉ. `preparar-staging.mjs` deducía el escalón del `codigoOrganiza`:
 * `.000` secretaría, `.X00` subsecretaría, `.XY0` dirección, `.XYZ` subdirección.
 * Anda para casi todo, pero la rama de los "despachos" está corrida un nivel:
 *
 *     1.03.100  DIRECCION DE DESPACHO DE GOBIERNO      -> deducía subsecretaría
 *     1.03.110  SUBDIRECCION DE DESPACHO DE GOBIERNO   -> deducía dirección
 *
 * Son 24 unidades. El efecto es que las tarjetas del dashboard cuentan mal, que
 * es exactamente lo que la migración 0025 vino a evitar cuando reemplazó la
 * heurística de la forma del árbol por un dato.
 *
 * SOLO toca filas cuyo nombre viene de GRH (está en MAYÚSCULAS) y cuyo nombre
 * declara explícitamente el escalón. Las que tienen nombre propio de CapitalIA
 * quedan intactas: ahí el tipo se decidió a mano y con motivo —los cuatro museos
 * son subdirecciones a propósito, y Fiscalía Ambiental subsecretaría—.
 *
 *   node scripts/importacion/corregir-tipos.mjs            -> en seco
 *   node scripts/importacion/corregir-tipos.mjs --aplicar
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(DIR, "../..");
const APLICAR = process.argv.includes("--aplicar");

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
const U = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const H = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

/** El escalón que el propio nombre declara, o null si no lo dice. */
function escalonDeclarado(nombre) {
  const n = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
  if (/^SUBDIRECC?ION\b|^SUBD\b/.test(n)) return "subdireccion";
  if (/^(SUB\s?SECRETARIA|SUBSEC)/.test(n)) return "subsecretaria";
  if (/^SECRETARIA\b/.test(n)) return "secretaria";
  if (/^DIRECC?ION\b/.test(n)) return "direccion";
  return null;
}

const reps = await (
  await fetch(`${U}/reparticiones?select=id,code,nombre,tipo&limit=1000`, { headers: H })
).json();

const aCorregir = [];
for (const r of reps) {
  // Nombre propio de CapitalIA (tiene minúsculas): el tipo se decidió a mano.
  if (r.nombre !== r.nombre.toUpperCase()) continue;
  const declarado = escalonDeclarado(r.nombre);
  if (declarado && declarado !== r.tipo) aCorregir.push({ ...r, declarado });
}

console.log(APLICAR ? "=== APLICANDO ===" : "=== EN SECO ===");
console.log(`${aCorregir.length} de ${reps.length} reparticiones con el tipo mal\n`);

const por = {};
for (const r of aCorregir) {
  const k = `${r.tipo} -> ${r.declarado}`;
  (por[k] ??= []).push(r.nombre);
}
for (const [k, nombres] of Object.entries(por)) {
  console.log(`${String(nombres.length).padStart(3)}  ${k}`);
  for (const n of nombres) console.log(`       ${n}`);
}

if (!APLICAR) {
  console.log("\nNada escrito. Para aplicar: --aplicar");
  process.exit(0);
}

for (const r of aCorregir) {
  const res = await fetch(`${U}/reparticiones?id=eq.${r.id}`, {
    method: "PATCH",
    headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({ tipo: r.declarado }),
  });
  if (!res.ok) throw new Error(`${r.code}: ${res.status} ${await res.text()}`);
}
console.log(`\n${aCorregir.length} corregidas.`);

const despues = await (
  await fetch(`${U}/reparticiones?select=tipo&limit=1000`, { headers: H })
).json();
const cuenta = {};
for (const r of despues) cuenta[r.tipo] = (cuenta[r.tipo] || 0) + 1;
console.log("organigrama ahora:", JSON.stringify(cuenta));
