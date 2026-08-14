/**
 * Importa el organigrama y el padrón desde staging a las tablas reales.
 *
 *   node scripts/importacion/importar.mjs             -> EN SECO: informa y no escribe
 *   node scripts/importacion/importar.mjs --aplicar    -> escribe
 *
 * En seco es el modo por defecto a propósito. Lo que informa es exactamente lo
 * que haría, con los mismos números.
 *
 * ANTES de correr con --aplicar: `node scripts/importacion/respaldar.mjs`.
 * No hay Point-in-Time Recovery en el plan gratuito de Supabase.
 *
 * Qué NO hace, por decisión:
 *   · No borra ni desactiva ninguna repartición existente. Hay personas,
 *     solicitudes y `perfil_reparticiones` colgando de ellas: desactivar una le
 *     saca el acceso a un director sin avisarle.
 *   · No inventa reparticiones para las personas que no mapean: las deja afuera
 *     y las informa. Una persona con repartición nula no la ve ningún director.
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

async function api(ruta, opciones = {}) {
  const r = await fetch(`${U}/${ruta}`, { ...opciones, headers: { ...H, ...opciones.headers } });
  if (!r.ok) throw new Error(`${ruta} -> ${r.status} ${(await r.text()).slice(0, 300)}`);
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

/** Trae la tabla entera de a mil: PostgREST no devuelve más de eso por vez. */
async function traerTodo(tabla, select = "*") {
  const LOTE = 1000;
  const filas = [];
  for (let desde = 0; ; desde += LOTE) {
    const lote = await api(`${tabla}?select=${select}&limit=${LOTE}&offset=${desde}`);
    filas.push(...lote);
    if (lote.length < LOTE) break;
  }
  return filas;
}

/** Escribe de a lotes: 4.771 filas en un solo POST no entran. */
async function enLotes(tabla, filas, extraHeaders = {}, tam = 500) {
  let hechas = 0;
  for (let i = 0; i < filas.length; i += tam) {
    const trozo = filas.slice(i, i + tam);
    await api(tabla, {
      method: "POST",
      headers: { Prefer: "return=minimal", ...extraHeaders },
      body: JSON.stringify(trozo),
    });
    hechas += trozo.length;
    process.stdout.write(`\r    ${hechas}/${filas.length}`);
  }
  if (filas.length) process.stdout.write("\n");
}

// --- normalización de nombres, para enganchar lo que ya existe ---------------
const STOP = new Set(["DE","DEL","LA","LAS","EL","LOS","Y","E","A","AL","DIRECCION","SECRETARIA","SUBSECRETARIA","SUBDIRECCION"]);
const tokens = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/[.,()\-'"]/g, " ")
    .replace(/\bSUBD\b|\bSUBDIRECC?ION\b/g, "SUBDIRECCION")
    .replace(/\bSUBSECRET\w*\b|\bSUBSEC\w*\b|\bSUB\s+SECRETARIA\b/g, "SUBSECRETARIA")
    .replace(/\bDIRECC?ION\b|\bDIREC\b|\bDIR\b/g, "DIRECCION")
    .replace(/\bSECRET\w*\b|\bSECR\b/g, "SECRETARIA")
    .replace(/\bGRAL\b/g, "GENERAL")
    .split(/\s+/).filter((t) => t && !STOP.has(t));
const parecidos = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));
function solape(ta, tb) {
  if (!ta.length || !tb.length) return 0;
  let c = 0; const usados = new Set();
  for (const a of ta) { const i = tb.findIndex((b, j) => !usados.has(j) && parecidos(a, b)); if (i >= 0) { c++; usados.add(i); } }
  return (2 * c) / (ta.length + tb.length);
}
const NIVEL_PREF = { SEC: "secretaria", SUB: "subsecretaria", DIR: "direccion" };
/** Solo se engancha automáticamente con parecido muy alto Y mismo tipo. */
const CIERTO = 0.85;

/**
 * Equivalencias resueltas A MANO entre una repartición de CapitalIA (su `code`) y
 * una unidad de ORGANIZA (`IDORGANIZA`), con el tipo que le corresponde.
 *
 * POR QUÉ EXISTE ESTA TABLA. El matcheo por parecido enganchaba 47 de 187 y
 * dejaba 22 sin resolver. Pero 21 de esas 22 son la MISMA unidad que una de las
 * que se iban a crear: el resultado eran dos "Contaduría General" —una con 121
 * personas y otra vacía—, dos "Museo de la Industria Azucarera", dos de Prensa,
 * dos de Deportes. `reparticiones.nombre` no tiene UNIQUE, así que nada lo
 * frenaba y el organigrama quedaba duplicado en silencio.
 *
 * Dos motivos por los que el umbral no alcanzaba, y ninguno se arregla subiéndolo
 * o bajándolo:
 *   · Las erratas del origen. `DESARROLO` (una L), `ORENAMIENTO`, `CIUDADANO` por
 *     "Ciudadana", `COMUNIC.INSTITITUC`. El parecido cae a 0.667 y no engancha.
 *   · El guard de tipo bloquea nombres idénticos cuando el escalón difiere
 *     ("Contaduría General" es secretaría acá y dirección en ORGANIZA). Ese guard
 *     igual se queda: sin él aparecen enganches peores.
 *
 * Es la misma disciplina que `DECIDIDOS` en armar-mapeo.mjs: lo que no es obvio
 * lo firma una persona, no un umbral.
 */
const EQUIVALENCIAS = {
  // Mismo nombre, con la errata o la abreviatura del origen.
  SEC06: ["13000", "secretaria"],    // SECRETARIA DE ATENCION AL CIUDADANO
  SEC07: ["12000", "secretaria"],    // SECRETARIA DE AMBIENTE Y DESARROLO SUST
  SEC09: ["16000", "secretaria"],    // SECRETARIA DE ORENAMIENTO Y CONV
  SUB02: ["1600", "subsecretaria"],  // SUBSEC DE GESTION ESTRATEGICA Y DOC
  SUB04: ["700", "subsecretaria"],   // SUBSEC. DE PRENSA Y COMUNIC.INSTITITUC
  DIR27: ["300", "direccion"],       // DIRECCION DE CEREMONIAL
  DIR33: ["5300", "direccion"],      // DIRECCION DE REL.INSTITUC. E INTERNAC.
  DIR35: ["5260", "direccion"],      // DIRECCION DEPORTES Y RECREACION
  DIR50: ["10200", "direccion"],     // DIRECCION DE ARBOLADO
  DIR17: ["3770", "direccion"],      // DIRECCION GENERAL DE MUSEOS Y TEATROS
  DIR09: ["3710", "direccion"],      // DIRECCION CENTRO DE TARTAMUDEZ MUN
  DIR36: ["350", "direccion"],       // DIRECCION DE IA — cuelga de Intendencia en ORGANIZA
  // La misma unidad, pero en ORGANIZA es un escalón más abajo: los cuatro museos
  // son subdirecciones de la Dirección General de Museos y Teatros.
  DIR18: ["3772", "subdireccion"],   // SUBD MUSEO DE LA CIUDAD
  DIR19: ["3773", "subdireccion"],   // SUBD MUSEO CASA BELGRANIANA
  DIR20: ["3774", "subdireccion"],   // SUBD MUSEO DE LA INDUSTRIA AZUCARERA
  DIR21: ["3771", "subdireccion"],   // SUBD MUSEO CASA MERCEDES SOSA
  // El nombre difiere pero es la misma repartición. Revisadas de a una.
  DIR07: ["3200", "direccion"],      // "Género y Diversidad" = INCLUSION, GENERO Y DIV (17)
  DIR34: ["5500", "direccion"],      // "Empleo" = EMPLEO Y EMPRENDIMIENTO (43)
  DIR29: ["4200", "direccion"],      // "Centro de Operaciones y Monitoreo" = CENTRO DE MONITOREO MUNICIPAL (52)
  DIR54: ["16600", "subsecretaria"], // "Fiscalía Ambiental Municipal" = FISCALIA AMBIENTAL
};

/**
 * Sin equivalencia y a propósito. Son unidades propias de CapitalIA: ORGANIZA no
 * tiene nada parecido, así que quedan como están y no se duplican.
 */
const SIN_EQUIVALENCIA = {
  DIR08: "Centro Integral Municipal - Casa Azul: ORGANIZA no tiene nada equivalente.",
  SEC05: "Contaduría General: acá es secretaría raíz; en ORGANIZA es una dirección bajo Economía y Hacienda (6100). Engancharla la saca de la raíz del organigrama, y eso es una decisión de estructura, no de matcheo. Sin definir.",
};

// =============================================================================
console.log(APLICAR ? "=== APLICANDO ===\n" : "=== EN SECO (no escribe nada) ===\n");

const stgRep = await traerTodo("stg_reparticiones");
const stgPer = await traerTodo("stg_personas");
if (!stgRep.length || !stgPer.length) {
  console.error("Staging está vacía. Subí los CSV primero (ver README).");
  process.exit(1);
}
const actuales = await traerTodo("reparticiones", "id,code,nombre,parent_id,external_id,tipo");
console.log(`staging: ${stgRep.length} reparticiones · ${stgPer.length} personas`);
console.log(`ya cargadas: ${actuales.length} reparticiones\n`);

// --- 1. Enganchar las que ya existen -----------------------------------------
const conExternal = new Map(actuales.filter((r) => r.external_id).map((r) => [r.external_id, r]));
const libres = actuales.filter((r) => !r.external_id).map((r) => ({
  ...r,
  tk: tokens(r.nombre),
  tipoInferido: NIVEL_PREF[r.code.slice(0, 3).toUpperCase()] ?? null,
}));

const aEnganchar = [];
const usadas = new Set();

// PRIMERO las resueltas a mano: mandan sobre cualquier parecido.
const porCodeLibre = new Map(libres.map((r) => [r.code, r]));
for (const [code, [externalId, tipo]] of Object.entries(EQUIVALENCIAS)) {
  const r = porCodeLibre.get(code);
  if (!r) continue; // ya tenía external_id, o no existe: nada que hacer
  const s = stgRep.find((x) => x.external_id === externalId);
  if (!s) {
    console.warn(`  ⚠ ${code} apunta a ${externalId}, que no está en staging. Se ignora.`);
    continue;
  }
  usadas.add(r.id);
  aEnganchar.push({
    id: r.id, external_id: externalId, nombreCap: r.nombre, nombreGrh: s.nombre,
    tipo, aMano: true,
  });
}

// DESPUÉS el parecido, sobre lo que quedó libre.
for (const s of stgRep) {
  if (conExternal.has(s.external_id)) continue;
  if (aEnganchar.some((e) => e.external_id === s.external_id)) continue;
  const stk = tokens(s.nombre);
  const cand = libres
    .filter(
      (r) =>
        !usadas.has(r.id) &&
        !SIN_EQUIVALENCIA[r.code] &&
        (!r.tipoInferido || r.tipoInferido === s.tipo),
    )
    .map((r) => ({ r, v: solape(stk, r.tk) }))
    .sort((a, b) => b.v - a.v)[0];
  if (cand && cand.v >= CIERTO) {
    usadas.add(cand.r.id);
    aEnganchar.push({ id: cand.r.id, external_id: s.external_id, nombreCap: cand.r.nombre, nombreGrh: s.nombre, tipo: s.tipo });
  }
}

// --- 2. Qué se crea ----------------------------------------------------------
const enganchados = new Map(aEnganchar.map((e) => [e.external_id, e.id]));
const aCrear = stgRep.filter((s) => !conExternal.has(s.external_id) && !enganchados.has(s.external_id));

const sueltas = actuales.filter(
  (r) => !r.external_id && !aEnganchar.some((e) => e.id === r.id),
);

console.log("── REPARTICIONES ──");
console.log(`  enganchan con una existente : ${aEnganchar.length}  (se les completa external_id y tipo; se CONSERVA el nombre de CapitalIA)`);
console.log(`      de esas, resueltas a mano: ${aEnganchar.filter((e) => e.aMano).length}`);
console.log(`  se crean nuevas             : ${aCrear.length}`);
console.log(`  total después              : ${actuales.length + aCrear.length}`);
console.log(`\n  quedan sueltas (sin external_id): ${sueltas.length}`);
for (const r of sueltas) {
  console.log(`      ${r.code}  ${r.nombre}`);
  if (SIN_EQUIVALENCIA[r.code]) console.log(`          └─ ${SIN_EQUIVALENCIA[r.code]}`);
  else console.log(`          └─ ⚠ SIN MOTIVO REGISTRADO: puede quedar duplicada`);
}

// --- 3. Personas -------------------------------------------------------------
//
// UNA SOLA función de resolución, usada para informar y para escribir. Antes eran
// dos caminos distintos y divergieron: los 2 de la Dirección de IA quedaban
// afuera del informe aunque el mapeo especial existía.
//
// Acepta dos formas de referencia:
//   · IDORGANIZA — la unidad viene del organigrama de sueldos.
//   · `CAP:<code>` — la unidad ya existe en CapitalIA y NO en ORGANIZA. Pasa con
//     las áreas nuevas: la de IA se creó en julio y ORGANIZA es de mayo. Va a
//     volver a pasar en cada liquidación.
const porCode = new Map(actuales.map((r) => [r.code, r.id]));
const idPorExternal = new Map([
  ...[...conExternal.entries()].map(([ext, r]) => [ext, r.id]),
  ...enganchados.entries(),
]);
// Las que se crean todavía no tienen id, pero van a existir: cuentan como resueltas.
const porCrearExternal = new Set(aCrear.map((s) => s.external_id));

/** null = no se puede ubicar. `pendiente` = va a existir recién tras insertar. */
function resolverReferencia(ref) {
  if (!ref) return null;
  if (ref.startsWith("CAP:")) return porCode.get(ref.slice(4)) ?? null;
  if (idPorExternal.has(ref)) return idPorExternal.get(ref);
  if (porCrearExternal.has(ref)) return "pendiente";
  return null;
}

const sinRep = stgPer.filter((p) => resolverReferencia(p.reparticion_external_id) === null);
const conRep = stgPer.filter((p) => resolverReferencia(p.reparticion_external_id) !== null);

console.log("\n── PERSONAS ──");
console.log(`  con repartición resuelta : ${conRep.length}`);
console.log(`  SIN repartición (no entran): ${sinRep.length}`);
if (sinRep.length) {
  const porMotivo = {};
  for (const p of sinRep) (porMotivo[p.error_mapeo || "sin motivo registrado"] ??= []).push(p.legajo);
  for (const [m, ls] of Object.entries(porMotivo)) console.log(`      ${ls.length}  ${m}`);
}

const yaCargadas = await traerTodo("personas", "legajo");
const legajosExistentes = new Set(yaCargadas.map((p) => p.legajo));
const nuevas = conRep.filter((p) => !legajosExistentes.has(p.legajo));
const actualiza = conRep.filter((p) => legajosExistentes.has(p.legajo));
console.log(`  altas nuevas             : ${nuevas.length}`);
console.log(`  actualiza existentes     : ${actualiza.length}`);
console.log(`  total después           : ${yaCargadas.length + nuevas.length}`);

if (!APLICAR) {
  console.log("\n── MUESTRA DE ENGANCHES (los 12 primeros) ──");
  for (const e of aEnganchar.slice(0, 12)) {
    console.log(`  ${e.nombreCap}`);
    console.log(`      ← ${e.nombreGrh}  [${e.tipo}]`);
  }
  console.log("\nNada escrito. Para aplicar: node scripts/importacion/importar.mjs --aplicar");
  process.exit(0);
}

// =============================================================================
// APLICAR
// =============================================================================
console.log("\n── escribiendo ──");

// 3.1 Enganchar: completar external_id y tipo, sin tocar el nombre.
console.log("  reparticiones existentes (external_id + tipo)");
for (const e of aEnganchar) {
  await api(`reparticiones?id=eq.${e.id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ external_id: e.external_id, tipo: e.tipo }),
  });
}
console.log(`    ${aEnganchar.length} enganchadas`);

// 3.2 Crear las nuevas SIN parent_id: el padre puede no existir todavía.
console.log("  reparticiones nuevas");
await enLotes(
  "reparticiones",
  aCrear.map((s) => ({
    code: `GRH-${s.external_id}`,
    nombre: s.nombre,
    external_id: s.external_id,
    tipo: s.tipo,
  })),
);

// 3.3 Ahora sí, el árbol: ya existen todos los nodos.
console.log("  jerarquía (parent_id)");
const todas = await traerTodo("reparticiones", "id,external_id,parent_id");
const idPorExt = new Map(todas.filter((r) => r.external_id).map((r) => [r.external_id, r.id]));
let padres = 0;
for (const s of stgRep) {
  if (!s.parent_external_id) continue;
  const hijo = idPorExt.get(s.external_id);
  const padre = idPorExt.get(s.parent_external_id);
  if (!hijo || !padre) continue;
  const actual = todas.find((r) => r.id === hijo);
  if (actual?.parent_id === padre) continue;
  await api(`reparticiones?id=eq.${hijo}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ parent_id: padre }),
  });
  padres++;
}
console.log(`    ${padres} vínculos padre-hijo`);

// 3.4 Personas. DOS operaciones distintas a propósito, no un upsert parejo:
//
//   · Alta: legajo, nombre y repartición.
//   · Ya cargada: SOLO el nombre. La repartición NO se toca.
//
// Por qué. CapitalIA no es un espejo de la liquidación: es donde Capital Humano
// ordena el organigrama de verdad. El sector de sueldos dice dónde se le PAGA a
// alguien, que no siempre es dónde trabaja —la Dirección de IA tiene 4 personas y
// la liquidación imputa 2—. Si la sincronización del mes que viene reescribiera
// `reparticion_id`, le borraría en silencio cada corrección que hicieron.
//
// Como el payload de la actualización solo lleva legajo y nombre, el UPDATE del
// upsert toca esas dos columnas y nada más.
console.log("  personas");
// Misma resolución que arriba, pero ahora TODAS las reparticiones ya existen, así
// que lo que antes era "pendiente" ya tiene un id de verdad.
const resolverFinal = (ref) =>
  ref?.startsWith("CAP:") ? (porCode.get(ref.slice(4)) ?? null) : (idPorExt.get(ref) ?? null);

const altas = nuevas
  .map((p) => ({
    legajo: p.legajo,
    full_name: p.full_name,
    reparticion_id: resolverFinal(p.reparticion_external_id),
  }))
  .filter((p) => p.reparticion_id);

if (altas.length !== nuevas.length) {
  console.warn(
    `    ⚠ ${nuevas.length - altas.length} altas quedaron sin repartición resoluble y NO se cargan`,
  );
}

console.log(`    altas: ${altas.length}`);
await enLotes("personas", altas, { Prefer: "return=minimal" });

if (actualiza.length) {
  console.log(`    refresco de nombre (sin tocar repartición): ${actualiza.length}`);
  // `on_conflict=legajo` explícito: sin eso PostgREST resuelve por la clave
  // primaria, que no estamos mandando.
  await enLotes(
    "personas?on_conflict=legajo",
    actualiza.map((p) => ({ legajo: p.legajo, full_name: p.full_name })),
    { Prefer: "return=minimal,resolution=merge-duplicates" },
  );
}

// --- 4. Verificación ---------------------------------------------------------
console.log("\n── después de importar ──");
for (const t of ["reparticiones", "personas"]) {
  const r = await fetch(`${U}/${t}?select=id&limit=1`, { headers: { ...H, Prefer: "count=exact" } });
  console.log(`  ${t.padEnd(15)} ${(r.headers.get("content-range") || "").split("/")[1]} filas`);
}
const nulas = await fetch(`${U}/personas?select=id&reparticion_id=is.null&limit=1`, {
  headers: { ...H, Prefer: "count=exact" },
});
const cantNulas = (nulas.headers.get("content-range") || "").split("/")[1];
console.log(`  personas sin repartición: ${cantNulas}  ${cantNulas === "0" ? "✓" : "← REVISAR"}`);
