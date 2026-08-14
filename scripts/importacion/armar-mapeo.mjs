/**
 * Emite `mapeo-sectores.json`: sector de la liquidación (CODI_07) -> external_id
 * de la repartición en ORGANIZA.
 *
 * Dos fuentes, a propósito separadas:
 *   1. Los enganches OBVIOS (parecido de nombre >= 85%). No son una decisión:
 *      "DIRECCION DE CAPITAL HUMANO" contra "DIRECCION DE CAPITAL HUMANO".
 *   2. `DECIDIDOS`, más abajo: los que un humano miró y resolvió a mano.
 *
 * Lo que no está en ninguna de las dos NO se mapea. El sector queda marcado y su
 * gente no se importa, en vez de aterrizar en la repartición de otro.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resueltos a mano el 2026-08-13. Cada uno con el motivo, porque en seis meses
 * nadie se va a acordar de por qué se eligió esta y no la otra.
 */
const DECIDIDOS = {
  // La nómina la llama "de Museos y Teatros"; ORGANIZA, "General de Museos y Teatros".
  252: "3770",
  // Nombre abreviado en ORGANIZA ("LIC. DE CONDUCIR").
  1721: "15300",
  // La cabecera de la secretaría (1.20.000), NO su Dirección de Despacho.
  2010: "16000",
  // La Dirección (1.02.480), no la Subdirección homónima (1.02.481).
  248: "3710",
  // Ídem: la Dirección (1.02.490), no la Subdirección (1.02.491).
  249: "3730",
  // Dirección de IA. SÍ está en ORGANIZA, como "DIRECCION DE IA" (350, 1.01.230)
  // y colgando de Intendencia, no de Innovación Tecnológica. No la encontraba
  // porque buscaba "INTELIGENCIA" y el nombre está abreviado.
  1412: "350",
};

/**
 * Sectores que liquidan y NO se importan, con el motivo. Se listan explícitos
 * para que su gente falte a propósito y no por olvido.
 */
const EXCLUIDOS = {
  1717: "«dirección general de tránsito» no existe en ORGANIZA: solo están la Administrativa (14900) y la Operativa (15000), que la nómina ya trae aparte como 1731 y 1732. Falta definir qué es esta tercera unidad.",
  1716: "«dir gral transp pub, seg. vial y lic»: por el nombre parece dirección general, pero el único candidato es una subsecretaría. Sin confirmar.",
};

// --- enganches obvios --------------------------------------------------------
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
const readCsv = (p) => fs.readFileSync(path.join(DIR, p), "utf8").trim().split(/\r?\n/).slice(1)
  .map((l) => (l.match(/"[^"]*"/g) ?? []).map((c) => c.slice(1, -1)));

const unidades = readCsv("organiza.csv").map(([id, , nombre]) => ({ id, nombre, tk: tokens(nombre) }));
const sectores = readCsv("sectores.csv").map(([codi, nombre, agentes]) => ({ codi, nombre, agentes: +agentes, tk: tokens(nombre) }));

const CIERTO = 0.85;

/**
 * Qué escalón es, deducido de cómo arranca el nombre.
 *
 * Hace falta porque `STOP` saca las palabras SECRETARIA / DIRECCION / etc. de los
 * tokens, así que "Secretaría de Ingresos Municipales", "Dirección de Ingresos
 * Municipales" y su despacho quedan con los MISMOS tokens y empatan en 1.000. El
 * `.sort()` es estable, así que ganaba el primero de organiza.csv —la secretaría—
 * y los 189 de la Dirección de Ingresos Municipales aterrizaban una capa arriba.
 * Como el alcance del director es plano, ese director veía 0 de sus 189.
 */
function escalon(nombre) {
  const n = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
  if (/^SUBD/.test(n)) return "subdireccion";
  if (/^(SUB\s?SEC|SUBSEC)/.test(n)) return "subsecretaria";
  if (/^(SECRETARIA|SECR|FISCALIA|TRIBUNAL|INTENDENCIA)/.test(n)) return "secretaria";
  if (/^(DIRECCION|DIREC|DIR|CENTRO|OFICINA|PATRULLA)/.test(n)) return "direccion";
  return null;
}

const mapeo = {};
let obvios = 0, sinMapear = [], desempatados = [];

for (const s of sectores) {
  if (EXCLUIDOS[s.codi]) { sinMapear.push(s); continue; }
  if (DECIDIDOS[s.codi]) { mapeo[s.codi] = String(DECIDIDOS[s.codi]); continue; }

  const nivelSector = escalon(s.nombre);
  const rank = unidades.map((u) => ({ u, v: solape(s.tk, u.tk) })).sort((a, b) => b.v - a.v);
  const empatados = rank.filter((c) => c.v >= CIERTO);

  // Con empate, decide el escalón: es el único dato que los distingue.
  let elegido = empatados[0];
  if (empatados.length > 1 && nivelSector) {
    const mismoNivel = empatados.find((c) => escalon(c.u.nombre) === nivelSector);
    if (mismoNivel && mismoNivel !== empatados[0]) {
      desempatados.push({ s, antes: empatados[0].u, ahora: mismoNivel.u });
    }
    if (mismoNivel) elegido = mismoNivel;
  }

  if (elegido && elegido.v >= CIERTO) { mapeo[s.codi] = elegido.u.id; obvios++; }
  else sinMapear.push(s);
}
for (const [codi, id] of Object.entries(DECIDIDOS)) mapeo[codi] = String(id);

fs.writeFileSync(path.join(DIR, "mapeo-sectores.json"), JSON.stringify(mapeo, null, 2), "utf8");

const gente = (a) => a.reduce((t, s) => t + s.agentes, 0);
if (desempatados.length) {
  console.log(`DESEMPATADOS por escalon: ${desempatados.length}`);
  for (const d of desempatados) console.log(`  ${d.s.codi} ${d.s.nombre}
      antes -> ${d.antes.nombre}
      ahora -> ${d.ahora.nombre}`);
  console.log("");
}
console.log(`enganches obvios (>=85%) : ${obvios}`);
console.log(`decididos a mano         : ${Object.keys(DECIDIDOS).length}`);
console.log(`mapeados en total        : ${Object.keys(mapeo).length} de ${sectores.length} sectores`);
console.log(`\nSIN MAPEAR: ${sinMapear.length} sectores · ${gente(sinMapear)} personas`);
for (const s of sinMapear.sort((a, b) => b.agentes - a.agentes)) {
  console.log(`  ${String(s.agentes).padStart(4)}  ${s.codi.padEnd(5)} ${s.nombre}`);
  if (EXCLUIDOS[s.codi]) console.log(`        └─ ${EXCLUIDOS[s.codi]}`);
}
console.log(`\n-> mapeo-sectores.json`);
