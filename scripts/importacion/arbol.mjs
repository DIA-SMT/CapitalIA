/**
 * Reporte EN SECO de la Fase 1: arma el árbol de ORGANIZA, le cruza la dotación
 * real de la liquidación y lo compara contra las reparticiones que HOY tiene
 * CapitalIA (leídas de la base, no del seed).
 *
 * No escribe nada en ningún lado. Solo lee y reporta.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(DIR, "../..");

// --- helpers -----------------------------------------------------------------
const norm = (s) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[.,()\-'"]/g, " ")
    .replace(/\bSUBDIRECC?ION\b|\bSUBD\b/g, "SUBDIRECCION")
    .replace(/\bSUB\s+SECRETARIA\b|\bSUBSECRET\w*\b|\bSUBSEC\w*\b/g, "SUBSECRETARIA")
    .replace(/\bDIRECC?ION\b|\bDIREC\b|\bDIR\b/g, "DIRECCION")
    .replace(/\bSECRETARIA\b|\bSECRET\b|\bSECR\b/g, "SECRETARIA")
    .replace(/\bGENERAL\b|\bGRAL\b/g, " ")
    .replace(/\b(DE|DEL|LA|LAS|EL|LOS|Y|E)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const readCsv = (p) =>
  fs
    .readFileSync(p, "utf8")
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((l) => (l.match(/"[^"]*"/g) ?? []).map((c) => c.slice(1, -1)));

// --- 1. ORGANIZA -> árbol ----------------------------------------------------
const NIVEL = { 1: "Secretaría", 2: "Subsecretaría", 3: "Dirección", 4: "Subdirección" };

const unidades = readCsv(path.join(DIR, "organiza.csv")).map(([id, code, nombre, activo]) => {
  const suf = code.split(".")[2] ?? "";
  const nivel = suf === "000" ? 1 : suf.endsWith("00") ? 2 : suf.endsWith("0") ? 3 : 4;
  return { id, code, nombre: nombre.trim(), activo, nivel };
});

const porCode = new Map(unidades.map((u) => [u.code, u]));

/** El padre sale del propio código; si ese nivel no existe, se sube al que sí. */
function padreDe(u) {
  const [a, b, suf] = u.code.split(".");
  const candidatos = [];
  if (u.nivel >= 4) candidatos.push(`${a}.${b}.${suf.slice(0, 2)}0`);
  if (u.nivel >= 3) candidatos.push(`${a}.${b}.${suf[0]}00`);
  if (u.nivel >= 2) candidatos.push(`${a}.${b}.000`);
  for (const c of candidatos) if (c !== u.code && porCode.has(c)) return porCode.get(c);
  return null;
}

const huerfanas = [];
for (const u of unidades) {
  const p = padreDe(u);
  u.parent = p;
  if (u.nivel > 1 && !p) huerfanas.push(u);
}

// --- 2. dotación real de la liquidación --------------------------------------
const sectores = readCsv(path.join(DIR, "sectores.csv")).map(([codi, nombre, agentes]) => ({
  codi,
  nombre: nombre.trim(),
  agentes: +agentes,
}));

const porNombreOrg = new Map();
for (const u of unidades) if (!porNombreOrg.has(norm(u.nombre))) porNombreOrg.set(norm(u.nombre), u);

const sinUnidad = [];
for (const s of sectores) {
  const u = porNombreOrg.get(norm(s.nombre));
  if (u) {
    u.agentes = (u.agentes ?? 0) + s.agentes;
    u.codi07 = s.codi;
  } else sinUnidad.push(s);
}

// --- 3. lo que HOY tiene CapitalIA -------------------------------------------
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
  `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/reparticiones` +
    `?select=id,code,nombre,parent_id,external_id,is_active&order=code`,
  {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  },
);

if (!res.ok) {
  console.error(`No pude leer reparticiones de Supabase: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const actuales = await res.json();

const porNombreCap = new Map();
for (const r of actuales) if (!porNombreCap.has(norm(r.nombre))) porNombreCap.set(norm(r.nombre), r);

let enganchan = 0;
for (const u of unidades) {
  const r = porNombreCap.get(norm(u.nombre));
  if (r) {
    u.existente = r;
    enganchan++;
  }
}
const soloCapitalIA = actuales.filter((r) => !porNombreOrg.has(norm(r.nombre)));

// --- 4. reporte --------------------------------------------------------------
const L = [];
const p = (s = "") => L.push(s);
const tot = (n) => unidades.filter((u) => u.nivel === n).length;
const sum = (a) => a.reduce((t, x) => t + (x.agentes ?? 0), 0);

p("# Fase 1 — Reporte en seco: reparticiones");
p();
p("> Nada de esto se escribió todavía. Es lo que **haría** el script.");
p();
p("## Resumen");
p();
p("| | |");
p("|---|---|");
p(`| Unidades en ORGANIZA | **${unidades.length}** |`);
p(`| · Secretarías | ${tot(1)} |`);
p(`| · Subsecretarías / Direcciones Generales | ${tot(2)} |`);
p(`| · Direcciones | ${tot(3)} |`);
p(`| · Subdirecciones | ${tot(4)} |`);
p(`| Reparticiones hoy en CapitalIA | ${actuales.length} |`);
p(`| **Enganchan** con una existente (no se duplica) | **${enganchan}** |`);
p(`| **Se crearían** nuevas | **${unidades.length - enganchan}** |`);
p(`| En CapitalIA sin equivalente en ORGANIZA | ${soloCapitalIA.length} |`);
p(`| Dotación cruzada | ${sum(unidades)} de 4771 agentes |`);
p();

if (huerfanas.length) {
  p("## ⚠ Unidades sin padre resoluble");
  p();
  p("El código no apunta a ningún ancestro que exista. Quedarían colgando de la raíz:");
  p();
  for (const u of huerfanas) p(`- \`${u.code}\` ${u.nombre} (${NIVEL[u.nivel]})`);
  p();
}

if (sinUnidad.length) {
  p("## ⚠ Sectores que liquidan y ORGANIZA no tiene");
  p();
  p("**Estas personas quedarían sin repartición** si no se resuelve antes de importar:");
  p();
  p("| Agentes | CODI_07 | Sector |");
  p("|--:|---|---|");
  for (const s of sinUnidad.sort((a, b) => b.agentes - a.agentes))
    p(`| ${s.agentes} | ${s.codi} | ${s.nombre} |`);
  p();
  p(`**Total: ${sum(sinUnidad)} agentes sin destino.**`);
  p();
}

if (soloCapitalIA.length) {
  p("## Reparticiones de CapitalIA que ORGANIZA no tiene");
  p();
  p("No se tocan ni se borran. Quedan como están, pero conviene revisarlas:");
  p();
  for (const r of soloCapitalIA) p(`- \`${r.code}\` ${r.nombre}`);
  p();
}

p("## El árbol que se importaría");
p();
p("`+` = se crea · `=` = engancha con una que ya existe · el número es la dotación de julio 2026");
p();
p("```");
const raices = unidades.filter((u) => !u.parent).sort((a, b) => a.code.localeCompare(b.code));
const hijosDe = new Map();
for (const u of unidades) {
  if (!u.parent) continue;
  if (!hijosDe.has(u.parent.code)) hijosDe.set(u.parent.code, []);
  hijosDe.get(u.parent.code).push(u);
}
function imprimir(u, prof) {
  const marca = u.existente ? "=" : "+";
  const dot = u.agentes ? `  · ${u.agentes}` : "";
  p(`${marca} ${"  ".repeat(prof)}${u.code}  ${u.nombre}${dot}`);
  for (const h of (hijosDe.get(u.code) ?? []).sort((a, b) => a.code.localeCompare(b.code)))
    imprimir(h, prof + 1);
}
for (const r of raices) imprimir(r, 0);
p("```");

const out = path.join(DIR, "reporte-reparticiones.md");
fs.writeFileSync(out, L.join("\n"), "utf8");
console.log(L.slice(0, 60).join("\n"));
console.log(`\n\n--- reporte completo escrito en: ${out}`);
