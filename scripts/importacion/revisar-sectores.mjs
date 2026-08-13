/**
 * Lista los enganches sector→unidad que NO son obvios, con la gente que arrastra
 * cada uno. Existe porque el script de equivalencias acepta solo cualquier
 * parecido >=50%, y a ese nivel ya se equivoca. Un enganche malo acá no es un
 * nombre feo: son cientos de personas en la repartición de otro.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

const STOP = new Set([
  "DE", "DEL", "LA", "LAS", "EL", "LOS", "Y", "E", "A", "AL",
  "DIRECCION", "SECRETARIA", "SUBSECRETARIA", "SUBDIRECCION",
]);

const tokens = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[.,()\-'"]/g, " ")
    .replace(/\bSUBD\b|\bSUBDIRECC?ION\b/g, "SUBDIRECCION")
    .replace(/\bSUBSECRET\w*\b|\bSUBSEC\w*\b|\bSUB\s+SECRETARIA\b/g, "SUBSECRETARIA")
    .replace(/\bDIRECC?ION\b|\bDIREC\b|\bDIR\b/g, "DIRECCION")
    .replace(/\bSECRET\w*\b|\bSECR\b/g, "SECRETARIA")
    .replace(/\bGRAL\b/g, "GENERAL")
    .replace(/\bINSTITUC\w*\b|\bINSTITITUC\w*\b/g, "INSTITUCIONAL")
    .replace(/\bINTERNAC\w*\b/g, "INTERNACIONALES")
    .replace(/\bCOMUNIC\w*\b/g, "COMUNICACION")
    .replace(/\bESTRAT\w*\b/g, "ESTRATEGICA")
    .replace(/\bADMINISTRAT\w*\b|\bADM\b/g, "ADMINISTRATIVA")
    .replace(/\bTRANSP\w*\b/g, "TRANSPORTE")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));

const parecidos = (a, b) =>
  a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));

function solape(ta, tb) {
  if (!ta.length || !tb.length) return 0;
  let comunes = 0;
  const usados = new Set();
  for (const a of ta) {
    const i = tb.findIndex((b, j) => !usados.has(j) && parecidos(a, b));
    if (i >= 0) {
      comunes++;
      usados.add(i);
    }
  }
  return (2 * comunes) / (ta.length + tb.length);
}

const readCsv = (p) =>
  fs
    .readFileSync(p, "utf8")
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((l) => (l.match(/"[^"]*"/g) ?? []).map((c) => c.slice(1, -1)));

const unidades = readCsv(path.join(DIR, "organiza.csv")).map(([id, code, nombre]) => ({
  id,
  code,
  nombre: nombre.trim(),
  tk: tokens(nombre),
}));

const sectores = readCsv(path.join(DIR, "sectores.csv")).map(([codi, nombre, agentes]) => ({
  codi,
  nombre: nombre.trim(),
  agentes: +agentes,
  tk: tokens(nombre),
}));

const CIERTO = 0.85;

const filas = sectores
  .map((s) => {
    const rank = unidades
      .map((u) => ({ u, s: solape(s.tk, u.tk) }))
      .sort((a, b) => b.s - a.s);
    return { s, m1: rank[0], m2: rank[1] };
  })
  .sort((a, b) => b.s.agentes - a.s.agentes);

const dudosos = filas.filter((f) => !f.m1 || f.m1.s < CIERTO);
const obvios = filas.filter((f) => f.m1 && f.m1.s >= CIERTO);
const gente = (a) => a.reduce((t, x) => t + x.s.agentes, 0);
const pct = (x) => `${Math.round(x * 100)}%`;

const L = [];
const p = (x = "") => L.push(x);

p("# Enganches sector → repartición que hay que mirar a ojo");
p();
p("> El sector es lo que dice la liquidación; la unidad es a qué repartición iría su gente.");
p("> **Un enganche mal puesto acá manda a toda esa gente a la repartición de otro**, y con la");
p("> RLS puesta eso significa mostrársela al director que no corresponde.");
p();
p(`- Sectores en la nómina: **${filas.length}** · **${gente(filas)} agentes**`);
p(`- Enganche obvio (≥${pct(CIERTO)}): ${obvios.length} sectores · ${gente(obvios)} agentes`);
p(`- **A confirmar: ${dudosos.length} sectores · ${gente(dudosos)} agentes**`);
p();
p("| Agentes | Sector (liquidación) | Iría a (ORGANIZA) | Parecido | Segunda opción |");
p("|--:|---|---|--:|---|");
for (const { s, m1, m2 } of dudosos)
  p(
    `| **${s.agentes}** | ${s.nombre} | ${m1 && m1.s > 0 ? m1.u.nombre : "— nada —"} | ${m1 ? pct(m1.s) : "—"} | ${m2 && m2.s > 0.3 ? `${m2.u.nombre} (${pct(m2.s)})` : "—"} |`,
  );

const out = path.join(DIR, "revisar-sectores.md");
fs.writeFileSync(out, L.join("\n"), "utf8");
console.log(L.join("\n"));
