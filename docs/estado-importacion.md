# Estado de la importación — al cierre del 2026-08-13

> Dónde quedamos y qué sigue. Para retomar sin releer nada más que esto.
> El plan completo con el SQL de cada paso: [`plan-importacion.md`](plan-importacion.md).

## En una línea

**Todavía no se importó ninguna persona.** CapitalIA sigue con 2 personas y 69
reparticiones. Lo que se hizo fue dejar el sistema en condiciones de recibir las
4.771 sin que se rompa ni mienta, y armar los datos listos para cargar.

## La fuente

`GRH_TUCUMAN`, el sistema de sueldos municipal (SQL Server, red interna). **Solo
lectura garantizada por el servidor**: el login tiene `CONNECT` + `SELECT` y nada
más, así que ninguna escritura es posible ni por error. No es Civitas — Civitas
sigue sin acceso y ya no hace falta.

De ahí salen:

- **4.771 personas** activas (última liquidación: julio 2026), con legajo, nombre
  y sector.
- **`ORGANIZA`**: el organigrama vigente, 187 unidades en cuatro escalones (13
  secretarías, 33 subsecretarías, 81 direcciones, 60 subdirecciones),
  actualizado a mayo-2026. La jerarquía no está en `ID_PADRE` —que está vacío—
  sino codificada en `codigoOrganiza` (`1.14.000` → `1.14.210` → `1.14.211`).

Lo que **no** se puede traer, y hay que dar por cerrado:

| | Por qué |
|---|---|
| Email | Vive en `personas_produccion`, base denegada |
| Cargo / situación de revista | Las columnas existen y están **vacías al 100%** |
| Nomenclador de puestos | GRH no tiene ninguno. Los 209 puestos del repo no tienen equivalente |

La consecuencia importante: **la asignación persona → puesto no se puede
automatizar.** Se sigue haciendo a mano desde la app, una por una.

## Lo que se hizo (7 commits, 6 migraciones aplicadas)

Todo en `matias`, pusheado.

| Commit | Qué |
|---|---|
| `e68dfcc` | **Bug de seguridad.** Desactivar un usuario no le revocaba nada: seguía leyendo el personal de su repartición y podía dar de alta y reasignar, mientras la pantalla decía "Sin acceso". Cerrado en tres capas (RLS, sesión, baneo en Auth) |
| `50bd85a` | **`/personas` paginado y con búsqueda en la base.** Antes se cortaba en 1.000 filas sin avisar |
| `634e613` | El análisis y las herramientas, que vivían en un temporal |
| `f54358c` | **El selector de asignar** tenía el mismo corte: el filtro corría *después* de las 1.000 |
| `cb1d2f8` | **Repartición obligatoria para todos.** Una persona con repartición nula no la ve ningún director ni secretario, solo el admin, y sin ninguna señal |
| `8ea9ab7` | **`reparticiones.tipo`.** El tipo era una deducción de la forma del árbol; con cuatro escalones cruza categorías y la suma igual cierra |
| `32fc4f6` | **Staging** y el recorte de columnas enforced en el origen |

Migraciones `0021`–`0026`: **todas aplicadas.**

## Los datos, ya listos

Generados y verificados contra la base real. Viven en `scripts/importacion/` y
**no están en git** (traen 4.771 nombres):

| Archivo | |
|---|---|
| `stg_reparticiones.csv` | 187 unidades con su árbol y su tipo |
| `stg_personas.csv` | 4.771 personas |
| `mapeo-sectores.json` | 81 de 84 sectores → repartición |

**4.704 de 4.771 personas tienen repartición resuelta.** El mapeo se rearma con
`node scripts/importacion/armar-mapeo.mjs`; las decisiones a mano están escritas
en ese archivo, con el motivo de cada una.

## Lo único que falta definir: 65 personas, 2 sectores

| Personas | Sector en la liquidación | El problema |
|--:|---|---|
| 40 | `direccion general de transito` (1717) | **No existe en ORGANIZA.** Ahí solo están la *Administrativa* (14900) y la *Operativa* (15000) de Tránsito, y la nómina ya las trae aparte como 1731 y 1732. Esta es una tercera unidad, por encima de las dos. Hay que definir qué es |
| 25 | `dir gral transp pub, seg. vial y lic` (1716) | Por el nombre parece una dirección general, pero el único candidato en ORGANIZA es una subsecretaría. Sin confirmar |

Decisión tomada el 13/08: **no se importan hasta que estén definidas.** Quedan
marcadas con el motivo en `armar-mapeo.mjs`, para que falten a propósito y no por
olvido.

Aparte, la **Dirección de Inteligencia Artificial** (sector 1412, 2 personas) no
está en ORGANIZA porque se creó en julio-2026, pero **sí existe en CapitalIA**
(`DIR36`). Se resuelve dentro de la importación, no en el mapeo.

## Mañana

### 1. Correr B8 contra staging *(no toca `personas`)*

```bash
node scripts/importacion/armar-mapeo.mjs
node scripts/importacion/preparar-staging.mjs
```

Subir los dos CSV a `stg_reparticiones` y `stg_personas` desde el Table Editor de
Supabase, y **mirar las cinco consultas de conciliación** que están comentadas al
final de la migración `0026`. Recién si cierran, escribir en `reparticiones` y
`personas`.

Staging se vacía y se vuelve a llenar cuantas veces haga falta: es el paso
reversible. No hay Point-in-Time Recovery —el proyecto está en el plan gratuito
de Supabase—, así que **antes de escribir en `personas` conviene exportar
`personas`, `reparticiones` y `asignaciones` a un archivo.** Esa es la red.

### 2. B9 — sellar

`NOT NULL` en `personas.reparticion_id` y en `reparticiones.tipo`. La primera ya
se puede: el padrón quedó en cero nulos.

### 3. Lo que sigue esperando a una persona, no a código

1. **La prueba negativa del arreglo de seguridad.** Crear un director, entrar con
   él, desactivarlo desde otro navegador y confirmar —sin cerrarle la sesión— que
   queda afuera. Es el commit más delicado de los siete y el único sin ejercitar.
2. **La planilla de las 29 equivalencias** (`Confirmacion-organigrama-CapitalIA.xlsx`).
   Ya no bloquea la importación —el mapeo se resolvió por otra vía— pero sigue
   siendo la forma de que Capital Humano valide el organigrama.
3. **Dos preguntas de fondo**, ninguna técnica:
   - ¿Las 187 reparticiones **reemplazan** a las 69 actuales, o conviven? Si
     conviven, las viejas quedan con `tipo` nulo y B9 no puede sellar.
   - ¿El director de una dirección ve a la gente de sus **subdirecciones**? Hoy
     **no**: solo el rol `secretario` recorre el árbol hacia abajo, así que con
     cuatro escalones hay hasta ~1.500 personas invisibles para su jefe directo.
     Falla cerrado, no es fuga. Y tiene salida sin tocar la base: `secretario` es
     un rol de **alcance recursivo desde el nodo asignado**, no de nivel. Definir
     esto **antes** de crear las ~187 cuentas, porque después no se auditan a mano.

### 4. Lo que quedó anotado para después

De la revisión adversarial de B5 ([`revision-b5.md`](revision-b5.md)), cuatro
cosas que no ocultan datos: cada pausa de tipeo deja una entrada en el historial
(`push` donde va `replace`), los selects rebotan un instante durante la
navegación, el indicador de carga no cubre la paginación, y `escaparLike` no
neutraliza el `*` de PostgREST (falla por exceso, se ve y se corrige tecleando).

Y del plan: **el cruce `positions` × `asignaciones`**, que contesta "qué puestos
están cubiertos y cuáles vacantes". Es la pregunta que Capital Humano se hace
todos los días, el sistema la puede contestar y todavía no la contesta.
