/**
 * Arma los dos CSV que se suben a las tablas de staging (migración 0026).
 *
 * No toca ninguna base: lee los export de GRH que están en este directorio y
 * escribe `stg_reparticiones.csv` y `stg_personas.csv`.
 *
 * El recorte de columnas está enforced acá abajo (`COLUMNAS`): si alguna vez se
 * agrega un campo de más, el script se planta en vez de escribirlo. La regla de
 * alcance mínimo no puede depender de que alguien se acuerde.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

/** Lo ÚNICO que puede salir de acá. Cualquier otra cosa es un error, no un aviso. */
const COLUMNAS = {
  stg_reparticiones: ["external_id", "code", "nombre", "parent_external_id", "tipo"],
  stg_personas: ["legajo", "full_name", "reparticion_external_id", "error_mapeo"],
};

const NIVEL = { 1: "secretaria", 2: "subsecretaria", 3: "direccion", 4: "subdireccion" };

const readCsv = (p) => {
  if (!fs.existsSync(p)) {
    console.error(`Falta ${path.basename(p)}. Ver el README de este directorio.`);
    process.exit(1);
  }
  return fs
    .readFileSync(p, "utf8")
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((l) => (l.match(/"[^"]*"/g) ?? []).map((c) => c.slice(1, -1)));
};

/** Escribe validando que no se cuele ninguna columna fuera de la lista. */
function escribir(nombreTabla, filas) {
  const permitidas = COLUMNAS[nombreTabla];
  for (const f of filas) {
    const demas = Object.keys(f).filter((k) => !permitidas.includes(k));
    if (demas.length) {
      console.error(
        `ABORTADO: ${nombreTabla} llevaría columnas fuera del alcance mínimo: ${demas.join(", ")}.\n` +
          `Si hace falta alguna, se discute y se agrega a COLUMNAS a propósito, no de costado.`,
      );
      process.exit(1);
    }
  }
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const salida =
    permitidas.join(",") +
    "\n" +
    filas.map((f) => permitidas.map((c) => esc(f[c])).join(",")).join("\n");
  const destino = path.join(DIR, `${nombreTabla}.csv`);
  fs.writeFileSync(destino, salida, "utf8");
  console.log(`${nombreTabla}.csv  ${String(filas.length).padStart(5)} filas`);
}

// --- 1. Reparticiones: el árbol de ORGANIZA ----------------------------------
const unidades = readCsv(path.join(DIR, "organiza.csv")).map(([id, code, nombre]) => {
  const suf = code.split(".")[2] ?? "";
  const nivel = suf === "000" ? 1 : suf.endsWith("00") ? 2 : suf.endsWith("0") ? 3 : 4;
  return { id, code, nombre: nombre.trim(), nivel };
});
const porCode = new Map(unidades.map((u) => [u.code, u]));

/** El padre sale del propio código; si ese escalón no existe, se sube al que sí. */
function padreDe(u) {
  const [a, b, suf] = u.code.split(".");
  const candidatos = [];
  if (u.nivel >= 4) candidatos.push(`${a}.${b}.${suf.slice(0, 2)}0`);
  if (u.nivel >= 3) candidatos.push(`${a}.${b}.${suf[0]}00`);
  if (u.nivel >= 2) candidatos.push(`${a}.${b}.000`);
  for (const c of candidatos) if (c !== u.code && porCode.has(c)) return porCode.get(c);
  return null;
}

escribir(
  "stg_reparticiones",
  unidades.map((u) => ({
    external_id: u.id,
    code: u.code,
    nombre: u.nombre,
    parent_external_id: padreDe(u)?.id ?? "",
    tipo: NIVEL[u.nivel],
  })),
);

// --- 2. Personas: la nómina del último período liquidado ---------------------
// nomina.csv sale de GRH con EXACTAMENTE tres columnas. Ver el README.
const nomina = readCsv(path.join(DIR, "nomina.csv")).map(([legajo, nombre, codi07]) => ({
  legajo: legajo.trim(),
  nombre: nombre.trim(),
  codi07: codi07.trim(),
}));

// El mapeo sector -> unidad lo confirma Capital Humano (planilla). Sin él, el
// script no adivina: marca la fila y sigue.
const rutaMapeo = path.join(DIR, "mapeo-sectores.json");
const mapeo = fs.existsSync(rutaMapeo)
  ? JSON.parse(fs.readFileSync(rutaMapeo, "utf8"))
  : {};
if (!fs.existsSync(rutaMapeo)) {
  console.warn(
    "\n⚠ No hay mapeo-sectores.json: TODAS las personas van a quedar marcadas\n" +
      "  sin repartición. Es lo esperado hasta que vuelva la planilla confirmada.\n",
  );
}

const sinMapeo = new Set();
const personas = nomina.map((p) => {
  const externalId = mapeo[p.codi07];
  if (!externalId) sinMapeo.add(p.codi07);
  return {
    legajo: p.legajo,
    full_name: p.nombre,
    reparticion_external_id: externalId ?? "",
    // Se marca y NO se inventa: una persona sin repartición es invisible para
    // todo director y secretario (ver la 0012 y el B7 del plan).
    error_mapeo: externalId ? "" : `sector ${p.codi07} sin equivalencia confirmada`,
  };
});

escribir("stg_personas", personas);

const conProblema = personas.filter((p) => p.error_mapeo).length;
console.log(`\nsectores sin mapear: ${sinMapeo.size}`);
console.log(`personas sin repartición: ${conProblema} de ${personas.length}`);
if (conProblema > 0) {
  console.log("\nNO importar hasta que ese número sea 0: esas personas no las vería nadie.");
}
