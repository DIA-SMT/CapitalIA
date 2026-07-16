# Roadmap — Capital humanIA

Plan de trabajo por etapas. Cada etapa es incremental y verificable
(`lint` + `typecheck` + `build` en verde). No se avanza a la siguiente sin
cerrar la anterior.

> **Regla de alcance del MVP:** solo se administran **puestos**. Nada de
> empleados, legajos, salarios, licencias, evaluaciones ni contrataciones.

---

## ✅ Etapa 0 — Fundaciones (actual)

Preparación del terreno técnico. **No** incluye CRUD ni IA.

- [x] Scaffold Next.js 16 (App Router) + TypeScript estricto.
- [x] Tailwind v4 + shadcn/ui inicializados.
- [x] Dependencias del stack instaladas (Supabase, Zod, RHF, TanStack Table, Lucide).
- [x] Paleta institucional aplicada como tokens en `globals.css`.
- [x] Estructura de carpetas escalable (feature-first).
- [x] Scripts `dev`, `build`, `lint`, `typecheck`.
- [x] `.env.example` sin secretos.
- [x] Documentación: `architecture.md` y `roadmap.md`.
- [ ] Carga del logo municipal en `public/brand/` *(pendiente del usuario)*.
- [ ] Carga de los PDF fuente para análisis de campos *(pendiente del usuario)*.

---

## Etapa 1 — Base visual, navegación y autenticación

Objetivo: shell institucional, navegación y sesión funcionando, sin dominio aún.
En el MVP existe un único rol: **admin**.

- [x] Clientes Supabase: `lib/supabase/{client,server}.ts` + `proxy.ts` (sesión).
- [x] Supabase Auth: login (grupo `(auth)`) y protección del grupo `(app)`.
- [x] Sin registro público: acceso solo con usuarios creados por un administrador.
- [x] Layout privado: sidebar colapsable, header, breadcrumb, usuario, logout,
      navegación responsive (Sheet móvil), logo y acceso rápido a "Nuevo puesto".
- [x] Pantallas: `/login`, `/dashboard`, `/puestos`, `/puestos/nuevo`,
      `/catalogos`, `/documentos`, `/configuracion`.
- [x] Estados visuales: loading, vacío, error, sin resultados, no autorizado.
- [x] Accesibilidad base: foco visible, teclado, labels, `prefers-reduced-motion`.
- [ ] Crear proyecto Supabase y cargar variables en `.env.local` *(pendiente del usuario)*.
- [ ] Tabla `perfil` (rol) y RLS por rol → se aborda con el modelo (Etapa 2).
- [ ] Generación de `lib/types/database.types.ts`.
- **Salida:** con Supabase configurado, un admin inicia sesión y ve el shell
  protegido con las pantallas base.

---

## Etapa 2 — Modelo de datos del nomenclador ✅

Objetivo: esquema de base de datos en Supabase. Documentado en
[`database.md`](./database.md).

- [x] 18+ tablas: perfiles, catálogos, `positions`, `position_versions`,
      puentes, fuentes y `audit_logs`.
- [x] Estados (`draft`/`current`/`historical`/`archived`) y verificación.
- [x] Código interno estable y único (`SG-I-0001`, `TEC-CON-0001`, …).
- [x] RLS: todo cerrado, solo `admin`; auditoría y timestamps automáticos.
- [x] Sin borrado físico de puestos (archivado lógico).
- [x] Migraciones SQL versionadas + `seed.sql` (3 puestos DEMO).
- [x] Datos de referencia (agrupamientos, niveles, áreas, niveles de riesgo).
- [x] Validado aplicando migraciones sobre un PostgreSQL real.
- [ ] Ajustar campos/catálogos reales al analizar los PDF (durante la ingesta).
- [ ] Generar `database.types.ts` (comando `npm run db:types` listo; requiere
      proyecto Supabase vinculado).
- **Salida:** esquema versionado en `supabase/migrations/` listo para `db push`.

---

## Etapa 3 — Preservación de fichas históricas (ingesta) ✅

Objetivo: cargar las fichas históricas conservando su origen.

- [x] Extracción de las **210 fichas** de los dos PDF escaneados. Sin capa de
      texto: se detectaron las páginas-ficha por el color del encabezado y se
      transcribieron con modelo de visión, con fidelidad literal a la fuente.
- [x] Registro de la fuente (documento + página impresa + página PDF + evidencia)
      por ficha, en `source_references`.
- [x] Validación de la carga: ids únicos, campos completos, nivel XOR área,
      agrupamiento contrastado contra el color del bloque.
- [x] Migración `0006` con las correcciones que la ingesta dejó a la vista
      (áreas técnicas, niveles de riesgo, `raw_text`, `minimum_experience`).
- [ ] Verificar las 210 fichas contra el papel (quedan en `pending`; lo hace
      Capital Humano, falta la pantalla para marcarlas).
- **Salida:** ✅ fichas históricas disponibles y trazables. Método y hallazgos en
  [`data/nomenclador/README.md`](../data/nomenclador/README.md).

---

## Etapa 4 — Consulta y filtrado (lectura) ✅

Objetivo: explorar el nomenclador.

- [x] Listado de puestos con **TanStack Table** (orden, paginación).
- [x] Buscador (ignora tildes) y filtro por agrupamiento.
- [x] Vista de **detalle** con la versión vigente y el historial de versiones.
- [x] Indicadores de **procedencia**: documento, página impresa, página PDF y
      estado de verificación. Cuando el literal impreso difiere del canónico del
      catálogo, se muestran los dos.
- [x] Dashboard, Catálogos y Documentos conectados a datos reales.
- [ ] Filtros por nivel, área, riesgo y estado; persistencia en la URL.
- **Salida:** ✅ consulta y filtrado sobre datos reales.

---

## Etapa 5 — Edición: nuevas versiones y nuevos puestos (escritura) ✅

Objetivo: mantener el nomenclador vivo sin perder historia.

- [x] Formulario por secciones con **React Hook Form + Zod** (Server Actions).
      Un solo esquema para cliente y servidor; la validación se repite en el
      servidor.
- [x] Crear **nuevo puesto** (`crear_puesto`, genera el código interno).
- [x] Crear **versión actualizada** (`crear_version_puesto`): la vigente pasa a
      `historical` y se conserva. Motivo del cambio obligatorio, validado en la
      base.
- [x] **Baja lógica** (`archivar_puesto` / `restaurar_puesto`). No borra: el
      trigger `prevent_delete` lo impide a propósito.
- [x] Historial en la ficha: quién, cuándo, por qué y qué campos cambiaron.
- [x] Las mutaciones que tocan varias tablas van en funciones de Postgres, en una
      transacción. Ver `CONTEXT.md` §3 para el motivo.
- [ ] Autorización por rol (`lector`/`editor`/`admin`): **hoy todo usuario nace
      admin**. Tolerable con 2 usuarios de Capital Humano; bloqueante si entran
      más. Ver `CONTEXT.md` §4.
- [ ] Diff de cambios en catálogos (hoy solo campos de texto).
- **Salida:** ✅ ABM de puestos por versión, auditado.

---

## Etapa 5.5 — Dotación: personas y puestos ✅

Fuera del roadmap original: la documentación excluía personas del MVP. Se agregó
a pedido, **acotado a dotación**.

- [x] `personas` (legajo, nombre, área, email) y `asignaciones` con fechas: una
      persona ocupa un puesto a la vez, y los cambios quedan en el historial.
- [x] `asignar_persona` / `desasignar_persona` en una transacción.
- [x] Panel "Personas en este puesto" en la ficha, y listado en `/personas`.
- **Alcance deliberadamente mínimo.** No se guardan datos sensibles (DNI, CUIL,
  salario, licencias, sanciones, evaluaciones) y no deberían agregarse sin
  resolver antes los roles. Ver la cabecera de la migración `0008`.

---

## Etapa 6 — Comparación y detección de similares

Objetivo: herramientas analíticas sobre el nomenclador.

- [ ] **Comparar** dos o más puestos/versiones campo a campo.
- [ ] **Detección de similares** con `pg_trgm` (similitud textual, sin IA).
- [ ] Alertas de posibles duplicados al crear un puesto.
- **Salida:** comparación y sugerencia de similares operativas.

---

## Etapa 7 — Consulta en lenguaje natural (IA)

Objetivo: preguntar al nomenclador en español.

- [ ] Búsqueda semántica con `pgvector` (embeddings de fichas).
- [ ] Interfaz conversacional que responde citando puestos/fuentes.
- [ ] Salvaguardas de alcance (solo puestos; nunca personas ni decisiones).
- **Salida:** consulta en lenguaje natural con respuestas trazables.

---

## Etapa 8 — Pulido y despliegue

- [ ] Accesibilidad y responsive revisados (auditoría).
- [ ] Aplicar logo e identidad final en el shell institucional.
- [ ] Despliegue en **Vercel** (Preview + Production) con Supabase productivo.
- [ ] Documentación de operación y manual de usuario interno.

---

### Convención de trabajo

- Ramas por etapa; cada PR deja `lint`, `typecheck` y `build` en verde.
- Sin datos mock permanentes: los placeholders se retiran al conectar datos reales.
- No se elimina código existente sin justificación registrada en el PR.
