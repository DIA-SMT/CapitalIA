# Ingesta del Nomenclador de Puestos

Extracción de las **210 fichas de puesto** de los dos PDF escaneados del
Nomenclador (Etapa 3 del [roadmap](../../docs/roadmap.md)).

> **Este directorio es reanudable.** La extracción se hace por etapas y el
> resultado se guarda acá a medida que avanza. Si se corta a mitad (límite de
> cuota, otra sesión, otra cuenta), se retoma leyendo este archivo — no hace
> falta el historial de la conversación.

---

## 1. Estado

| Etapa | Fichas | Estado |
|-------|-------:|--------|
| `etapa-1-sg-mp` — Servicios Generales + Mantenimiento (parte 1) | 49 | ✅ extraída |
| `etapa-2-adm` — Administrativo | 34 | ✅ extraída |
| `etapa-3-tec-p1` — Técnico (parte 1, 4 áreas) | 56 | pendiente |
| `etapa-4-tec-p2` — Técnico (parte 2, Del Control) | 23 | pendiente |
| `etapa-5-pro` — Profesional | 41 | pendiente |
| `etapa-6-anexo` — Anexo final (impresas 259–264) | 7 | pendiente |
| **Total** | **210** | |

`fichas.json` acumula lo extraído. `mapa-documento.json` marca `estado` por ficha.

---

## 2. Fuente

Los PDF **no están versionados** (pesan 287 MB y 149 MB). Hay que tenerlos en
disco; por defecto se buscan en `~/Downloads/`:

| Código | Archivo | Págs. PDF | Fichas | Págs. impresas |
|--------|---------|----------:|-------:|----------------|
| `NOM-P1` | `Nomenclador de Puestos parte 1.pdf` | 171 | 139 | 29 – 189 |
| `NOM-P2` | `Nomenclador de Puestos parte 2.pdf` | 87 | 71 | 190 – 264 |

Datos del documento:

- **Impreso en septiembre de 2016** (colofón, última hoja de la parte 2).
- **Escaneado, sin capa de texto.** ~5000×6900 px por hoja. Requiere modelo con
  visión; no sirve un parser de texto.
- **Una ficha = una página exacta.** No hay fichas partidas ni dos por hoja.
- Las dos partes son **continuas**: la parte 1 termina en la impresa 189 y la
  parte 2 sigue en la 190, partiendo al medio las variantes "A" y "B" del puesto
  Inspector de Transportes Públicos.
- El **offset entre página impresa y página del PDF crece de 6 a 18** por las
  hojas separadoras. Por eso se guardan las dos.

---

## 3. Cómo se detectaron las fichas

Cada agrupamiento tiene su color en la barra "Identificación del Puesto":

| Color (hue) | Agrupamiento |
|-------------|--------------|
| ~20 naranja | Servicios Generales |
| ~78 verde | Mantenimiento y Producción |
| ~350 rojo | Administrativo |
| ~213 azul | Técnico |
| ~328 violeta | Profesional |

Se renderizó cada página a 36 dpi y se midió la proporción de píxeles cromáticos
en la banda del encabezado (script `map_doc.py`, ver §7). Páginas con >25% de
píxeles cromáticos = ficha. Dio 139 + 71 = 210, sin falsos positivos verificados.

`mapa-documento.json` lleva `agrupamiento_esperado` / `area_esperada` por ficha,
**inferidos del color**. No son autoritativos: el valor real lo lee la extracción
de cada ficha. Si no coinciden, gana la ficha y hay que revisar el bloque.

---

## 4. Estructura de la ficha

Campos fijos, en este orden. El mapeo a
[`position_versions`](../../docs/database.md) es casi 1:1:

| Campo de la ficha | Columna / tabla destino |
|---|---|
| Agrupamiento | `grouping_id` |
| Nivel *(o **Área** en Técnico — la columna cambia de rótulo)* | `level_id` / `technical_area_id` |
| Nombre del Puesto | `name` + `variant` (sufijos `"A"` / `"B"`) |
| Descripción General | `general_description` |
| Descripción Específica | `specific_description` |
| Requisitos Intelectuales → Instrucción | `minimum_education` |
| Requisitos Intelectuales → Título | `required_title` |
| Requisitos Intelectuales → Otros conocimientos | puente `position_version_knowledge` |
| Competencias Requeridas | puente `position_version_competencies` |
| Requisito Físico | `physical_requirement` |
| Condiciones de Trabajo | `working_conditions` |
| Riesgo de Trabajo | puente `position_version_risks` |
| Nivel de Riesgo | `risk_level_id` |
| Responsabilidad Sobre | puente `position_version_responsibilities` |

Procedencia → `source_references`: `printed_page_number`, `pdf_page_number`,
`evidence_text`, `verification_status`.

---

## 5. Reglas de extracción (importantes)

1. **Fidelidad literal.** No corregir erratas de la fuente, no normalizar
   mayúsculas, no completar lo que falte. El original dice `TRANSPOTES`,
   `Strees`, `supervisón` — se transcribe así.
2. **Excepción: degradación de tinta.** El escaneo hace que varias `e` se lean
   como `c` (`Corrcspondc` por `Corresponde`). Eso es artefacto del escaneo, no
   errata del documento: se transcribe la lectura correcta. La distinción es
   sutil y a veces va a fallar — por eso todo entra con
   `verification_status = 'pending'` para que Capital Humano lo revise contra el PDF.
3. **`null` ≠ `"No requiere."`** Si el rótulo no está impreso → `null`. Si dice
   "No requiere." → ese es el valor.
4. **Separadores de lista variables.** Unas fichas usan puntos
   (`Golpes. Caídas.`), otras guiones (`golpes - caída – carga`). Por eso la
   extracción va con modelo, no con regex.

---

## 6. Formato de `fichas.json`

Array de objetos, uno por ficha:

```jsonc
{
  "id": "p1-023",              // = <parte>-<pdf_page>, cruza con mapa-documento.json
  "parte": 1,
  "pdf_page": 23,
  "printed_page": 29,          // leído de la hoja
  "agrupamiento": "SERVICIOS GENERALES",
  "nivel": "I",                // null en Técnico
  "area": null,                // solo Técnico
  "nombre": "AUXILIAR DE LIMPIEZA",
  "variant": null,             // "A" / "B" si el nombre lo trae
  "descripcion_general": "...",
  "descripcion_especifica": "...",
  "instruccion": "Primario completo.",
  "titulo": "No requiere.",
  "otros_conocimientos": ["No requiere."],
  "competencias": ["Disciplina.", "Adaptabilidad."],
  "requisito_fisico": "No requiere.",
  "condiciones_trabajo": "Caminando. De pie.",
  "riesgos_trabajo": ["Golpes.", "Caídas a nivel y desnivel."],
  "nivel_riesgo": "Bajo.",
  "responsabilidad_sobre": ["Elementos de Limpieza"],
  "dudas": null                // texto si algo quedó ilegible o dudoso
}
```

---

## 7. Cómo retomar

```bash
# 1) Qué falta
#    mapa-documento.json -> fichas con "estado": "pendiente"

# 2) Renderizar las páginas de la etapa (150 dpi es legible y suficiente)
python -c "
import fitz
d = fitz.open(r'~/Downloads/Nomenclador de Puestos parte 1.pdf')
for p in [23, 24, 25]:                      # pdf_page de la etapa
    d[p-1].get_pixmap(dpi=150).save(f'p{p:03d}.png')
"

# 3) Pasarle las imágenes a un modelo con visión, con el prompt de abajo.
# 4) Agregar los objetos devueltos a fichas.json y marcar estado: "extraida".
```

Requiere `pymupdf` y `pillow`.

### Prompt de extracción (usar tal cual)

> Transcribí fichas de puesto de un nomenclador municipal escaneado. Leé estas
> imágenes (son páginas de PDF renderizadas): `<rutas>`
>
> Cada página contiene UNA ficha con esta estructura fija: "Identificación del
> Puesto" (Agrupamiento | Nivel o Área | Nombre del Puesto), "Análisis del Puesto"
> (Descripción General | Descripción Específica), y "Especificaciones" (Requisitos
> Intelectuales con sub-campos Instrucción/Título/Otros conocimientos; Competencias
> Requeridas; Requisito Físico; Condiciones de Trabajo; Riesgo de Trabajo; Nivel de
> Riesgo; Responsabilidad Sobre).
>
> REGLAS CRÍTICAS:
> - Fidelidad literal a la fuente. NO corrijas erratas, NO normalices mayúsculas,
>   NO completes lo que falte. Si el original dice "TRANSPOTES", escribí "TRANSPOTES".
> - Si un campo está vacío o ausente en la ficha, usá null. Si dice "No requiere",
>   ese ES el valor, no null.
> - Los campos que son listas (competencias, riesgos, responsabilidades, otros
>   conocimientos) devolvelos como array de strings, un ítem por elemento. El
>   separador varía entre fichas: puede ser punto o guión.
> - Si algo es ilegible o dudoso, ponelo igual y anotalo en "dudas".
> - El número de página IMPRESO aparece arriba en la hoja (distinto al del archivo).
>
> Devolvé SOLO un array JSON, sin markdown ni comentarios, con el formato de §6
> de este README.

---

## 8. Hallazgos que afectan el esquema

Detectados durante la muestra de validación. **Resolver después de extraer todo**,
con el universo real de valores a la vista — no antes.

1. **Áreas técnicas mal cargadas.** `20260716120005_reference_data.sql` tiene
   `Construcción / Electricidad / Mecánica / Informática`. Las reales son
   **De la Salud**, **De la Construcción**, **De la Formación e Información**,
   **Del Control**. (La tabla de la pág. impresa 25 dice "De la Formación y la
   Información"; las fichas dicen "E INFORMACIÓN". Inconsistencia de la fuente.)

2. **`risk_levels` no alcanza.** El seed tiene `Bajo/Medio/Alto/Crítico` como FK
   simple. El universo real observado hasta ahora (8 valores):
   `Bajo` · `Moderado` · `Medio` · `Alto` · `Escaso` · `Severo` ·
   `Bajo a Moderado` · `Moderado a Alto`.
   Son rangos y vocabulario inconsistente (`Medio` y `Escaso` solo aparecen en el
   anexo final; `Severo` una sola vez en Mantenimiento). `Crítico` no aparece
   nunca. Hay que decidir: catálogo con los valores observados, o columnas
   min/max. **Sigue creciendo con cada etapa — no fijarlo hasta terminar.**

3. **Falta dónde guardar el texto literal de los ítems de catálogo.** Las tablas
   puente tienen FK + `notes`, pero no el literal impreso. Al canonizar
   `Caídas a nivel y desnivel` / `Caídas de nivel y desnivel` / `Caídas a nivel` /
   `Caídas` a una sola entrada se pierde cómo estaba escrito — y eso contradice el
   principio 3 de `database.md` (procedencia). **Propuesta: agregar `raw_text` a
   las 4 tablas puente** (migración `0006`, no toca lo existente).

4. **`knowledge_items` no debe ser catálogo.** Confirmado con las 49 fichas de la
   etapa 1: **48 menciones → 43 literales distintos (90% únicos)**. "Otros
   conocimientos" es texto libre por ficha ("Tratamiento de madera y preparación
   de lustre", "Carnet de manejo de categoría acorde"). Un catálogo donde el 90%
   de las entradas se usa una sola vez no es un catálogo — conviene texto en la
   versión. Contrastar con competencias, que sí saturan.

5. **Catálogos starter muy cortos** (esperado: la migración dice "no pretende ser
   exhaustivo, se curará durante la ingesta"). Medido sobre 49 fichas:

   | Catálogo | Menciones | Literales distintos | % únicos | ¿Catálogo? |
   |---|---:|---:|---:|---|
   | competencias | 184 | 40 | 22% | sí, satura bien |
   | riesgos | 126 | 43 | 34% | sí |
   | responsabilidades | 79 | 33 | 42% | sí, en el límite |
   | otros conocimientos | 48 | 43 | 90% | **no** |

   Los literales incluyen variantes de puntuación/mayúsculas que colapsan al
   canonizar; el conteo canónico será menor. El seed tiene 5 competencias y 5
   riesgos.

6. **Falta el campo "Antigüedad y Experiencia".** Aparece impreso dentro de
   Requisitos Intelectuales en las fichas de nivel V y **no tiene columna en
   `position_versions`**:

   | Ficha | Puesto | Valor |
   |---|---|---|
   | p1-082 (impresa 93) | JEFE DEPARTAMENTO ADMINISTRATIVO | "3 años como Jefe de Sección." |
   | p1-104 (impresa 115) | JEFE DEPARTAMENTO ESPECIALIZADO | "3 años en la administración" |

   Por ahora queda en `dudas` para no perderlo. Requiere columna nueva
   (`minimum_experience`) en la migración `0006`. Revisar si reaparece en
   Profesional / Técnico, donde también hay jefaturas.

---

## 9. Hallazgos de contenido para Capital Humano

No son problemas técnicos: es contenido del nomenclador de 2016 que la extracción
dejó a la vista y que probablemente haya que revisar al actualizarlo. **Decisión
del área, no del equipo técnico.** Se cargan literales igual — el sistema preserva
la ficha histórica; la corrección se hace después creando una versión nueva.

| Ficha | Puesto | Qué dice |
|---|---|---|
| p1-107 (impresa 118) | OFICIAL DE JUSTICIA "A" | Lista **"sexo masculino"** entre los requisitos ("Otros conocimientos"). |

Este es exactamente el tipo de cosa que motivó el proyecto. Conviene que Capital
Humano lo vea antes de publicar el nomenclador digitalizado.

---

## 10. Después de la extracción

1. Consolidar el universo real de competencias / riesgos / responsabilidades /
   niveles de riesgo / áreas técnicas.
2. Migración `0006`: corregir catálogos, poblarlos con los valores reales y
   agregar `raw_text` a las puentes.
3. Cargar `positions` + `position_versions` (v1, `is_historical_source = true`,
   `validity_status = 'current'`) + puentes + `source_references`.
4. Vincular variantes "A"/"B"/"C" del mismo puesto vía `position_families`.
5. Recién ahí, el CRUD (Etapas 4 y 5 del roadmap).
