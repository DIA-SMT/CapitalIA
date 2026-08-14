/**
 * Reescribe los nombres de repartición que vinieron de GRH en MAYÚSCULAS.
 *
 *   node scripts/importacion/prolijar-nombres.mjs            -> en seco
 *   node scripts/importacion/prolijar-nombres.mjs --aplicar
 *
 * QUÉ HACE: mayúsculas/minúsculas al uso castellano, tildes, y expande solo las
 * abreviaturas confirmadas. Nada más.
 *
 * QUÉ NO HACE, a propósito: no adivina. Las reglas se armaron leyendo las 144
 * palabras que aparecen realmente en esos 119 nombres, no un diccionario
 * general. Cualquier nombre en el que quede un fragmento sin resolver se marca
 * para que lo escriba una persona, en vez de dejarlo "prolijo pero mal" — que es
 * peor, porque deja de verse crudo y nadie lo vuelve a mirar.
 *
 * Solo toca filas cuyo nombre está en MAYÚSCULAS. Las que tienen nombre propio
 * de CapitalIA no se rozan.
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

/** Palabras que llevan tilde y GRH escribe sin ella. */
const TILDES = {
  DIRECCION: "Dirección", SUBDIRECCION: "Subdirección", PLANIFICACION: "Planificación",
  ECONOMIA: "Economía", PUBLICAS: "Públicas", PUBLICOS: "Públicos", PUBLICA: "Pública",
  PUBLICO: "Público", FISCALIA: "Fiscalía", ESTRATEGICA: "Estratégica",
  INNOVACION: "Innovación", ATENCION: "Atención", EDIFICACION: "Edificación",
  TRANSITO: "Tránsito", PROMOCION: "Promoción", INFORMACION: "Información",
  DOCUMENTACION: "Documentación", RAPIDA: "Rápida", EDUCACION: "Educación",
  INCLUSION: "Inclusión", GENERO: "Género", POBLACION: "Población",
  TECNICA: "Técnica", ADMINISTRACION: "Administración", TESORERIA: "Tesorería",
  SUBTESORERIA: "Subtesorería", SUBCONTADURIA: "Subcontaduría",
  URBANISTICA: "Urbanística", FISCALIZACION: "Fiscalización",
  HABILITACION: "Habilitación", INFORMATICA: "Informática",
  TECNOLOGICA: "Tecnológica", GESTION: "Gestión", BROMATOLOGIA: "Bromatología",
  SEMAFOROS: "Semáforos", MOVILES: "Móviles", COMUNICACIÓN: "Comunicación",
  SECRETARIA: "Secretaría", SUBSECRETARIA: "Subsecretaría", CREDITO: "Crédito",
};

/** Abreviaturas del origen, confirmadas una por una contra su contexto. */
const ABREVIATURAS = {
  DESP: "Despacho", GRAL: "General", PRESUP: "Presupuesto", TECN: "Tecnológica",
  SUST: "Sustentable", CONV: "Convivencia", INT: "Integral", REL: "Relaciones",
  INSTITUC: "Institucionales", INTERNAC: "Internacionales", MUN: "Municipal",
  LIC: "Licencias", COND: "Conducir", SEG: "Seguridad", DIV: "Diversidad",
  PROG: "Programas", SUBSECRET: "Subsecretaría", DIREC: "Dirección",
  ORDENAM: "Ordenamiento", SOC: "Social",
};

/** Se dejan como están: son siglas, no palabras. */
const SIGLAS = new Set(["TEA", "PPC", "CEMMU", "SUTRAPA"]);

/** Van en minúscula salvo al principio del nombre. */
const PARTICULAS = new Set(["DE", "DEL", "Y", "E", "AL", "LA", "LAS", "EL", "LOS", "EN"]);

/** Erratas del origen. No se corrigen solas: las firma una persona. */
const ERRATAS = { ORDANAMIENTO: "¿Ordenamiento?" };

function prolijar(nombre) {
  const dudas = [];
  // El punto de las abreviaturas se saca antes de partir: "REL.INSTITUC." son dos palabras.
  const bruto = nombre.replace(/\./g, " ").replace(/\s+/g, " ").trim();

  const palabras = bruto.split(" ").map((p, i) => {
    const k = p.toUpperCase();

    if (ERRATAS[k]) {
      dudas.push(`«${p}» parece errata del origen (${ERRATAS[k]})`);
      return p;                                  // se deja tal cual
    }
    if (SIGLAS.has(k)) return k;
    if (ABREVIATURAS[k]) return ABREVIATURAS[k];
    if (TILDES[k]) return TILDES[k];
    if (PARTICULAS.has(k) && i > 0) return k.toLowerCase();

    // Fragmento corto en mayúsculas que no está en ninguna lista: abreviatura
    // que no conozco. No la invento.
    // Palabras castellanas de cuatro letras o menos que aparecen en estos
    // nombres: no son abreviaturas y no hay que marcarlas.
    if (k.length <= 4 && !/^(OBRAS|SALUD|MAYOR|RADIO|NO|CASA|VIAL|TEA)$/.test(k)) {
      dudas.push(`«${p}» podría ser una abreviatura sin expandir`);
    }
    return k.charAt(0) + k.slice(1).toLowerCase();
  });

  return { nombre: palabras.join(" "), dudas };
}

// -----------------------------------------------------------------------------
const reps = await (
  await fetch(`${U}/reparticiones?select=id,code,nombre&limit=1000`, { headers: H })
).json();

const deGrh = reps.filter((r) => r.nombre === r.nombre.toUpperCase());
const listas = [];
const paraRevisar = [];

for (const r of deGrh) {
  const { nombre, dudas } = prolijar(r.nombre);
  if (dudas.length) paraRevisar.push({ ...r, propuesto: nombre, dudas });
  else if (nombre !== r.nombre) listas.push({ ...r, propuesto: nombre });
}

console.log(APLICAR ? "=== APLICANDO ===" : "=== EN SECO ===");
console.log(`${deGrh.length} nombres vinieron de GRH en mayúsculas`);
console.log(`  se reescriben solos : ${listas.length}`);
console.log(`  necesitan una firma : ${paraRevisar.length}\n`);

console.log("── LISTOS (muestra de 12) ──");
for (const r of listas.slice(0, 12)) console.log(`  ${r.nombre}\n      → ${r.propuesto}`);

console.log("\n── PARA REVISAR A MANO ──");
for (const r of paraRevisar) {
  console.log(`  ${r.code.padEnd(10)} ${r.nombre}`);
  console.log(`      propuesta: ${r.propuesto}`);
  for (const d of r.dudas) console.log(`      · ${d}`);
}

if (!APLICAR) {
  console.log("\nNada escrito. Para aplicar los listos: --aplicar");
  process.exit(0);
}

for (const r of listas) {
  const res = await fetch(`${U}/reparticiones?id=eq.${r.id}`, {
    method: "PATCH",
    headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({ nombre: r.propuesto }),
  });
  if (!res.ok) throw new Error(`${r.code}: ${res.status} ${await res.text()}`);
}
console.log(
  `\n${listas.length} reescritos.` +
    (paraRevisar.length === 1
      ? " El de arriba quedó intacto."
      : ` Los ${paraRevisar.length} de arriba quedaron intactos.`),
);
