/**
 * Propone equivalencias entre las reparticiones de CapitalIA y las unidades de
 * ORGANIZA, para que un humano las confirme. NO decide solo.
 *
 * Existe porque los nombres de GRH vienen truncados y con erratas
 * ("ORENAMIENTO", "DESARROLO SUST", "COMUNIC.INSTITITUC"), así que la igualdad
 * exacta sólo engancha 45 de 187. Lo que se propone acá se revisa a mano.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(DIR, "../..");

// OJO: "GENERAL" NO va acá. Si se saca, "Secretaría General" se queda sin ningún
// token y no matchea con nada — que es exactamente lo que pasaba.
const STOP = new Set([
  "DE", "DEL", "LA", "LAS", "EL", "LOS", "Y", "E", "A", "AL",
  "DIRECCION", "SECRETARIA", "SUBSECRETARIA", "SUBDIRECCION",
]);

/** Normaliza y despliega abreviaturas conocidas de GRH. */
const tokens = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));

/** Dos tokens se parecen si uno es prefijo del otro (cubre los truncados). */
const parecidos = (a, b) =>
  a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));

/** Similitud por solapamiento de tokens, tolerante a truncados y erratas. */
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

/**
 * Similitud con castigo por nivel distinto. Sin esto propone cosas como
 * "Subsecretaría de Gestión Estratégica" → "Dirección de Documentación", que
 * comparten palabras pero son otro escalón del organigrama. Y meter gente en la
 * repartición equivocada, con la RLS puesta, es mostrársela al director que no es.
 */
function score(a, b) {
  const s = solape(a.tk, b.tk);
  return a.nivel && b.nivel && a.nivel !== b.nivel ? s * 0.55 : s;
}

const readCsv = (p) =>
  fs
    .readFileSync(p, "utf8")
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((l) => (l.match(/"[^"]*"/g) ?? []).map((c) => c.slice(1, -1)));

// --- datos -------------------------------------------------------------------
const unidades = readCsv(path.join(DIR, "organiza.csv")).map(([id, code, nombre]) => {
  const suf = code.split(".")[2] ?? "";
  return {
    id,
    code,
    nombre: nombre.trim(),
    nivel: suf === "000" ? 1 : suf.endsWith("00") ? 2 : suf.endsWith("0") ? 3 : 4,
    tk: tokens(nombre),
  };
});

const sectores = readCsv(path.join(DIR, "sectores.csv")).map(([codi, nombre, agentes]) => ({
  codi,
  nombre: nombre.trim(),
  agentes: +agentes,
  tk: tokens(nombre),
}));

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

const res = await fetch(
  `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/reparticiones?select=id,code,nombre&order=code`,
  {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  },
);
if (!res.ok) {
  console.error(`Supabase: ${res.status} ${await res.text()}`);
  process.exit(1);
}
// El nivel sale del prefijo del code: SEC01 -> secretaría, SUB03 -> subsecretaría.
const NIVEL_POR_PREFIJO = { SEC: 1, SUB: 2, DIR: 3 };
const capitalia = (await res.json()).map((r) => ({
  ...r,
  tk: tokens(r.nombre),
  nivel: NIVEL_POR_PREFIJO[r.code.slice(0, 3).toUpperCase()] ?? null,
}));

// --- proponer ----------------------------------------------------------------
const mejor = (x, candidatos) =>
  candidatos
    .map((c) => ({ c, s: score(x, c) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 2);

const CIERTO = 0.85; // se da por buena
const DUDA = 0.5; // se propone para revisar

const seguras = [];
const revisar = [];
const nuevas = [];

for (const r of capitalia) {
  const [m1] = mejor(r, unidades);
  if (m1 && m1.s >= CIERTO) seguras.push({ r, u: m1.c, s: m1.s });
  else if (m1 && m1.s >= DUDA) revisar.push({ r, u: m1.c, s: m1.s });
  else nuevas.push(r);
}

// sectores que liquidan y no encuentran unidad
const sectoresSinUnidad = [];
for (const s of sectores) {
  const [m1] = mejor(s, unidades); // el sector no trae nivel: sin castigo
  if (!m1 || m1.s < DUDA) sectoresSinUnidad.push({ s, m: m1 });
  else s.unidad = m1.c;
}

// --- reporte -----------------------------------------------------------------
const L = [];
const p = (x = "") => L.push(x);
const pct = (s) => `${Math.round(s * 100)}%`;

p("# Equivalencias propuestas — CapitalIA ↔ ORGANIZA");
p();
p("> Propuesta automática **para revisar**. No se aplicó nada.");
p("> Los nombres de GRH vienen truncados y con erratas, así que el matcheo es por");
p("> parecido de palabras, no por igualdad. **Lo que está acá hay que confirmarlo.**");
p();
p(`- Reparticiones en CapitalIA: **${capitalia.length}**`);
p(`- Unidades en ORGANIZA: **${unidades.length}**`);
p(`- Enganche seguro (≥${pct(CIERTO)}): **${seguras.length}**`);
p(`- **A revisar a mano** (${pct(DUDA)}–${pct(CIERTO)}): **${revisar.length}**`);
p(`- Sin equivalente en ORGANIZA: **${nuevas.length}**`);
p();

p("## ⚠ A revisar — ¿son la misma repartición?");
p();
p("| CapitalIA | ORGANIZA | Código | Parecido |");
p("|---|---|---|--:|");
for (const { r, u, s } of revisar.sort((a, b) => b.s - a.s))
  p(`| ${r.code} · ${r.nombre} | ${u.nombre} | \`${u.code}\` | ${pct(s)} |`);
p();

p("## Sin equivalente en ORGANIZA — quedan como están");
p();
for (const r of nuevas) p(`- \`${r.code}\` ${r.nombre}`);
p();

p("## Enganche seguro — se completa `external_id`, se conserva TU nombre");
p();
p("| CapitalIA | ORGANIZA | Código |");
p("|---|---|---|");
for (const { r, u } of seguras.sort((a, b) => a.u.code.localeCompare(b.u.code)))
  p(`| ${r.code} · ${r.nombre} | ${u.nombre} | \`${u.code}\` |`);
p();

if (sectoresSinUnidad.length) {
  p("## ⚠ Sectores que liquidan y no encuentran unidad en ORGANIZA");
  p();
  p("**Su gente quedaría sin repartición.** Hay que resolverlos antes de importar personas.");
  p();
  p("| Agentes | CODI_07 | Sector | Mejor candidato | Parecido |");
  p("|--:|---|---|---|--:|");
  for (const { s, m } of sectoresSinUnidad.sort((a, b) => b.s.agentes - a.s.agentes))
    p(`| ${s.agentes} | ${s.codi} | ${s.nombre} | ${m ? m.c.nombre : "—"} | ${m ? pct(m.s) : "—"} |`);
  p();
  p(`**Total: ${sectoresSinUnidad.reduce((t, x) => t + x.s.agentes, 0)} agentes sin destino.**`);
}

const out = path.join(DIR, "equivalencias.md");
fs.writeFileSync(out, L.join("\n"), "utf8");
console.log(L.join("\n"));
console.log(`\n--- escrito en ${out}`);
