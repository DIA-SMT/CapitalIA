/** Emite confirmacion.json con las dos tablas que Capital Humano tiene que confirmar. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(DIR, "../..");

const STOP = new Set([
  "DE", "DEL", "LA", "LAS", "EL", "LOS", "Y", "E", "A", "AL",
  "DIRECCION", "SECRETARIA", "SUBSECRETARIA", "SUBDIRECCION",
]);

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
    if (i >= 0) { comunes++; usados.add(i); }
  }
  return (2 * comunes) / (ta.length + tb.length);
}

const readCsv = (p) =>
  fs.readFileSync(p, "utf8").trim().split(/\r?\n/).slice(1)
    .map((l) => (l.match(/"[^"]*"/g) ?? []).map((c) => c.slice(1, -1)));

const NIVEL = { 1: "Secretaría", 2: "Subsecretaría", 3: "Dirección", 4: "Subdirección" };

const unidades = readCsv(path.join(DIR, "organiza.csv")).map(([id, code, nombre]) => {
  const suf = code.split(".")[2] ?? "";
  return {
    id, code, nombre: nombre.trim(),
    nivel: suf === "000" ? 1 : suf.endsWith("00") ? 2 : suf.endsWith("0") ? 3 : 4,
    tk: tokens(nombre),
  };
});

const sectores = readCsv(path.join(DIR, "sectores.csv")).map(([codi, nombre, agentes]) => ({
  codi, nombre: nombre.trim(), agentes: +agentes, tk: tokens(nombre),
}));

const env = Object.fromEntries(
  fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);

const res = await fetch(
  `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/reparticiones?select=id,code,nombre&order=code`,
  { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } },
);
if (!res.ok) { console.error(await res.text()); process.exit(1); }

const NIVEL_PREF = { SEC: 1, SUB: 2, DIR: 3 };
const capitalia = (await res.json()).map((r) => ({
  ...r, tk: tokens(r.nombre), nivel: NIVEL_PREF[r.code.slice(0, 3).toUpperCase()] ?? null,
}));

const CIERTO = 0.85, DUDA = 0.5;
const rank = (x, castigaNivel) =>
  unidades
    .map((u) => ({ u, s: castigaNivel && x.nivel && x.nivel !== u.nivel ? solape(x.tk, u.tk) * 0.55 : solape(x.tk, u.tk) }))
    .sort((a, b) => b.s - a.s);

// --- tabla 1: reparticiones de CapitalIA cuyo enganche no es obvio ---
const reparticiones = [];
for (const r of capitalia) {
  const [m1, m2] = rank(r, true);
  if (m1 && m1.s >= CIERTO) continue;
  reparticiones.push({
    code: r.code,
    nombre: r.nombre,
    nivel: r.nivel ? NIVEL[r.nivel] : "",
    candidato: m1 && m1.s >= DUDA ? m1.u.nombre : "",
    candidatoCode: m1 && m1.s >= DUDA ? m1.u.code : "",
    candidatoNivel: m1 && m1.s >= DUDA ? NIVEL[m1.u.nivel] : "",
    parecido: m1 && m1.s >= DUDA ? Math.round(m1.s * 100) / 100 : null,
    segunda: m2 && m2.s >= DUDA ? `${m2.u.nombre} (${m2.u.code})` : "",
  });
}

// --- tabla 2: sectores de la liquidación cuyo enganche no es obvio ---
const sectoresDudosos = [];
for (const s of sectores) {
  const [m1, m2] = rank(s, false);
  if (m1 && m1.s >= CIERTO) continue;
  sectoresDudosos.push({
    agentes: s.agentes,
    codi: s.codi,
    sector: s.nombre,
    candidato: m1 && m1.s > 0 ? m1.u.nombre : "",
    candidatoCode: m1 && m1.s > 0 ? m1.u.code : "",
    parecido: m1 && m1.s > 0 ? Math.round(m1.s * 100) / 100 : null,
    segunda: m2 && m2.s > 0.3 ? `${m2.u.nombre} (${m2.u.code})` : "",
  });
}
sectoresDudosos.sort((a, b) => b.agentes - a.agentes);

const totales = {
  unidadesOrganiza: unidades.length,
  reparticionesCapitalia: capitalia.length,
  sectoresNomina: sectores.length,
  agentesTotal: sectores.reduce((t, s) => t + s.agentes, 0),
  agentesEnDuda: sectoresDudosos.reduce((t, s) => t + s.agentes, 0),
};

const out = path.join(DIR, "confirmacion.json");
fs.writeFileSync(out, JSON.stringify({ totales, reparticiones, sectores: sectoresDudosos }, null, 2), "utf8");
console.log(JSON.stringify(totales, null, 2));
console.log(`reparticiones a confirmar: ${reparticiones.length}`);
console.log(`sectores a confirmar:      ${sectoresDudosos.length}`);
console.log(`-> ${out}`);
