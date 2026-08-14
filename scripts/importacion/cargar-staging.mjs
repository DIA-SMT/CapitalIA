/**
 * Vacía staging y la carga con los CSV generados por `preparar-staging.mjs`.
 *
 * Staging es descartable: se puede vaciar y volver a llenar cuantas veces haga
 * falta sin consecuencias. Es justamente el paso reversible de la importación.
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
const U = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const H = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

/** Parser de CSV con comillas dobles escapadas, que es lo que emiten los scripts. */
function leerCsv(archivo) {
  const texto = fs.readFileSync(path.join(DIR, archivo), "utf8").trim();
  const lineas = texto.split(/\r?\n/);
  const cols = lineas[0].split(",");
  return lineas.slice(1).map((l) => {
    const valores = [];
    let actual = "";
    let dentro = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') {
        if (dentro && l[i + 1] === '"') { actual += '"'; i++; }
        else dentro = !dentro;
      } else if (c === "," && !dentro) { valores.push(actual); actual = ""; }
      else actual += c;
    }
    valores.push(actual);
    return Object.fromEntries(cols.map((c, i) => [c, valores[i] === "" ? null : valores[i]]));
  });
}

async function api(ruta, opciones = {}) {
  const r = await fetch(`${U}/${ruta}`, { ...opciones, headers: { ...H, ...opciones.headers } });
  if (!r.ok) throw new Error(`${ruta} -> ${r.status} ${(await r.text()).slice(0, 300)}`);
}

for (const [tabla, archivo, clave] of [
  ["stg_reparticiones", "stg_reparticiones.csv", "external_id"],
  ["stg_personas", "stg_personas.csv", "legajo"],
]) {
  await api(`${tabla}?${clave}=not.is.null`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  const filas = leerCsv(archivo);
  const TAM = 500;
  for (let i = 0; i < filas.length; i += TAM) {
    await api(tabla, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(filas.slice(i, i + TAM)),
    });
    process.stdout.write(`\r  ${tabla}: ${Math.min(i + TAM, filas.length)}/${filas.length}`);
  }
  console.log("");
}
console.log("\nstaging cargada.");
