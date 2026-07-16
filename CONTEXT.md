# Contexto del proyecto

Estado real, decisiones tomadas y trampas conocidas. **Este es el documento para
ponerse al día**: si venís de afuera —o volvés después de un tiempo— leé esto
antes que nada.

Los otros documentos siguen valiendo y son más específicos:

| | |
|---|---|
| [`README.md`](README.md) | Qué es el proyecto y cómo levantarlo |
| [`docs/architecture.md`](docs/architecture.md) | Arquitectura y convenciones |
| [`docs/database.md`](docs/database.md) | Modelo de datos (autoritativo) |
| [`docs/roadmap.md`](docs/roadmap.md) | Plan por etapas |
| [`data/nomenclador/README.md`](data/nomenclador/README.md) | Ingesta de los PDF: método, formato y hallazgos |

---

## 1. Dónde está parado el proyecto

**Funcionando en producción:** https://capital-ia-eight.vercel.app

| Etapa del roadmap | Estado |
|---|---|
| 0 · Fundaciones | ✅ |
| 1 · Base visual, navegación y auth | ✅ |
| 2 · Modelo de datos | ✅ |
| 3 · Preservación de fichas históricas (ingesta) | ✅ 210/210 fichas cargadas |
| 4 · Consulta y filtrado | ✅ listado + ficha + historial |
| 5 · Edición: versiones, altas y bajas | ✅ |
| — · Dotación (personas ↔ puestos) | ✅ *fuera del roadmap original, ver §4* |
| 6 · Comparar y detectar similares | ❌ |
| 7 · Consulta en lenguaje natural | ❌ |
| 8 · Pulido y despliegue | ⚠️ desplegado, sin pulido final |

En la base: **210 puestos**, 210 versiones vigentes, ~2.163 filas de puente,
210 referencias documentales, 640+ registros de auditoría.

**Migraciones aplicadas:** de la `0001` a la `0008`.

---

## 2. Lo que se hizo con los PDF

El Nomenclador de 2016 son dos tomos escaneados (287 MB + 149 MB) **sin capa de
texto**: no se pueden buscar ni copiar. Hoy son 210 registros consultables y
editables, cada uno trazable hasta su página del original.

Método, formato, prompt de extracción y hallazgos completos:
[`data/nomenclador/README.md`](data/nomenclador/README.md). Lo esencial:

- **Una ficha = una página exacta.** Las páginas-ficha se detectaron por el color
  de la barra de encabezado (un color por agrupamiento), no por OCR.
  Verificación cruzada: el reparto por agrupamiento que predijo el color coincidió
  exactamente con el que salió de leer las fichas.
- **Fidelidad literal.** Las erratas del original se preservan:
  `MANTENIMINETO Y PRODUCCION`, `PROESIONAL`, `TRANSPOTES`, `OFICAL`, `Strees`.
  Se corrigen solo los artefactos del escaneo (`Corrcspondc` → `Corresponde`).
- **Las 210 están en `verification_status = 'pending'`.** Nadie las contrastó
  contra el papel una por una. Es correcto que digan eso.
- Para recargar: `python data/nomenclador/cargar.py --dry` y después sin `--dry`.
  Es reanudable por (documento, página PDF).

---

## 3. Decisiones que conviene no revisar sin leer esto

### Por qué NO hay embeddings ni RAG

Fue la idea inicial y se descartó. El objetivo del proyecto es **editar** el
nomenclador —dar de baja puestos, cargar nuevos— y un índice vectorial no se
edita: no podés borrar "el puesto Ordenanza" de un blob de texto. Se pierden
historial, validación, código interno y auditoría, que es todo lo que hace que
el sistema sirva.

Los embeddings tienen lugar, pero **después y para otra cosa**: búsqueda
semántica (Etapa 7) y detección de duplicados (Etapa 6), calculados sobre el
registro estructurado, no sobre el PDF. `pgvector` no está habilitado y está bien
que así sea.

### Por qué las mutaciones van en funciones de Postgres y no en la app

`crear_version_puesto`, `crear_puesto`, `archivar_puesto`, `asignar_persona`
(migraciones `0007` y `0008`) hacen el trabajo en una transacción porque cada
operación toca varias tablas **en un orden obligatorio**.

Ejemplo concreto: `uq_pv_one_current` permite una sola versión vigente por
puesto. Entonces la anterior debe pasar a `historical` **antes** de insertar la
nueva. Si eso se hiciera en dos llamadas desde la app y fallara la segunda, el
puesto quedaría **sin versión vigente**. Roto.

Mismo patrón en `uq_asig_una_vigente_por_persona`.

Las funciones son `SECURITY DEFINER` (saltean RLS) y **re-chequean `is_admin()`
por dentro**. Verificado: rechazan incluso a la service role key.

### Por qué "borrar" no borra

Un trigger (`prevent_delete`) bloquea el borrado físico de puestos **a
propósito**. Dar de baja = archivar. Para una municipalidad es lo correcto: si
dentro de cinco años preguntan si el puesto de Fumigador existía en 2016, la
respuesta tiene que estar.

Ya pasó en la práctica: para limpiar un puesto duplicado por un error de carga
hubo que desactivar el trigger a mano. Es una fricción deliberada.

### Por qué el nivel de riesgo quedó como está

La ficha escribe el nivel de riesgo de **13 formas** que canonizan a 10 valores.
Hay rangos ("Moderado a Alto", 45 fichas), sinónimos (medio/moderado,
escaso/bajo, severo/alto) y **el mismo rango escrito de tres maneras**
(`bajo a moderado` / `de bajo a moderado` / `moderado a bajo`). `Crítico`, que
venía en el seed, no aparece ni una vez en las 210.

Lo correcto sería `risk_level_min_id` / `risk_level_max_id` sobre una escala
normalizada. **No se hizo**: implica reemplazar `risk_level_id`, que es un cambio
de diseño que excede la ingesta. En su lugar se cargaron los rangos como
entradas del catálogo y se agregó `risk_level_raw` con el literal impreso.

Así nada se pierde y **la decisión sigue abierta**. Si se retoma, hablarlo con el
autor del esquema.

### Por qué las tablas puente tienen `raw_text`

Al canonizar se pierden **32 variantes de escritura en competencias y 50 en
riesgos** (`Caídas a nivel y desnivel` / `Caídas de nivel y desnivel` /
`Caídas a nivel` / `Caídas` son la misma entrada). Eso contradice el principio 3
de `database.md` (procedencia).

`raw_text` guarda el literal impreso; el FK apunta al canónico. Se puede filtrar
por catálogo sin perder fidelidad con la fuente. La ficha muestra los dos cuando
difieren.

### `knowledge_items` no debería ser catálogo

"Otros conocimientos" tiene **165 valores canónicos en 231 menciones: 71% de uso
único**. Un catálogo donde casi toda entrada se usa una vez no es un catálogo.
Está cargado así porque el esquema ya lo modelaba como tal y cambiarlo excedía la
ingesta. Queda como deuda; por eso `/catalogos` no lo muestra.

Contraste: competencias satura bien (882 menciones → 64 canónicos).

---

## 4. ⚠️ Lo que hay que saber antes de tocar nada

### Todo usuario nace admin

```sql
-- migración 0003, handle_new_user()
values (..., 'admin')   -- todo usuario nuevo entra como admin
```

Y `user_role` tiene **un solo valor**. No existe rol de solo lectura.

Hoy es tolerable porque el acceso son **2 personas de Capital Humano**, que ya
manejan datos de personal por su trabajo. **El día que entre un tercer usuario
que no debería editar, o que no debería ver personal, hay que armar roles
primero.** No es opcional a partir de ahí.

### El alcance de `personas` es deliberadamente mínimo

Se guarda: legajo, nombre, área, email, y a qué puesto está asignado con fechas.

**No se guarda** —y no debería agregarse sin resolver antes los roles—: DNI,
CUIL, domicilio, fecha de nacimiento, salario, licencias, sanciones,
evaluaciones. Son datos personales sensibles de empleados municipales.

Está escrito en la cabecera de la migración `0008` para que quede constancia.

### Historia del alcance de "personas"

La documentación original excluye personas del MVP, y lo dice tres veces
(README, `architecture.md`, `roadmap.md`). Se agregó después, a pedido, acotado a
dotación. **Si aparece la idea de sumar legajos completos, esa decisión revierte
un criterio explícito del diseño original: hablarlo con el autor del esquema.**

### La historia de migraciones puede estar desincronizada

Las migraciones `0001`–`0005` las aplicó el autor del esquema; las `0006`–`0008`
se pegaron a mano en el SQL Editor. **Si nadie usó `supabase db push`, Supabase no
tiene registro de ninguna** y un `db push` futuro va a intentar aplicarlas todas
de nuevo y fallar.

Verificar antes de correr `db push` por primera vez.

### `database.types.ts` no está generado

`npm run db:types` requiere `supabase login` interactivo. Las consultas tipan sus
formas a mano en cada archivo de `data/`. Al generarlo, reemplazar por
`Database["public"]["Tables"]`.

### Next.js 16 no es el que conocés

Lo dice [`AGENTS.md`](AGENTS.md) y es en serio. Leer
`node_modules/next/dist/docs/` **antes** de escribir código. Lo que ya mordió:

- `params` y `searchParams` son **Promesas**: hay que await-earlas.
- `middleware` se llama `proxy`.

### Warnings de lint conocidos

Dos, y no son defectos del código: TanStack Table y React Hook Form son
incompatibles con el compilador de React (`react-hooks/incompatible-library`).

---

## 5. Hallazgo de contenido para Capital Humano

La ficha **OFICIAL DE JUSTICIA "A"** (página impresa 118) lista **"sexo
masculino"** entre los requisitos del puesto.

Se cargó literal, como corresponde: el sistema preserva la ficha histórica. La
corrección se hace creando una versión nueva, que es exactamente para lo que
sirve. **Es decisión del área, no del equipo técnico**, pero conviene que lo vean
antes de publicar el nomenclador digitalizado.

---

## 6. Qué falta

**Del MVP:**
- Comparar puestos entre sí (Etapa 6)
- Detectar similares / duplicados con `pg_trgm` (Etapa 6). El índice GIN trigram
  sobre `position_versions.name` ya existe.

**Deuda conocida:**
- Roles (`lector` / `editor` / `admin`) — bloqueante si entran más usuarios
- `risk_level` como min/max sobre escala normalizada
- `knowledge_items` como texto en vez de catálogo
- Las 210 fichas siguen `pending` de verificación: falta la pantalla para
  marcarlas verificadas a medida que Capital Humano las revise
- El historial no diffea cambios en catálogos, solo campos de texto
- Familias de puestos (`position_families`) sin poblar: hay 21 fichas con
  variante en 11 nombres base, pero **requiere revisión humana** — una familia
  está partida por una errata (`TRANSPOTES` vs `TRANSPORTES`) y cruza los dos
  PDF, y hay variantes huérfanas (B y C sin A)
- Logo municipal en `public/brand/`

---

## 7. Cómo trabajar acá

```bash
npm install
npm run dev          # http://localhost:3000
npm run typecheck    # tiene que quedar en verde
npm run lint         # 2 warnings conocidos, 0 errores
npm run build
```

`.env.local` no se versiona. Las variables están en Vercel para producción.

**Migraciones:** archivos numerados en `supabase/migrations/`. Ver la advertencia
de §4 antes de usar `db push`.

**Convenciones** (de `architecture.md`, se respetaron):
- Server Components por defecto; `"use client"` solo donde hay interactividad
- Feature-first: `src/features/<dominio>/{data,components,schemas}` + `actions.ts`
- Validación con Zod, **siempre repetida en el servidor**
- Las mutaciones que tocan varias tablas van en funciones de Postgres
