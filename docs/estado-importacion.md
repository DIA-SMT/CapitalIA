# Estado de la importación — al 2026-08-14

> Dónde está todo. Para retomar sin leer nada más que esto.
> El plan con el SQL de cada paso: [`plan-importacion.md`](plan-importacion.md).
> Lo que se le manda a Capital Humano:
> [resumen para Capital Humano](https://claude.ai/code/artifact/4e4c9bbf-2345-4794-9b84-d76da9b18b02).

## En una línea

**El padrón está cargado y Capital Humano ya puede corregirlo.** 4.706 agentes y
188 reparticiones. Los 9 ítems bloqueantes del plan están cerrados. Lo que queda
depende de decisiones de personas, no de código.

## Qué hay en la base

| | |
|---|---|
| Personas | **4.706**, ninguna sin repartición |
| Reparticiones | **188** — 13 secretarías, 21 subsecretarías, 82 direcciones, 72 subdirecciones |
| Con personal | 82 |
| Asignadas a un puesto | **0** (no se puede automatizar: ver más abajo) |

La suma del personal de cada secretaría da exactamente 4.706, así que nadie quedó
fuera de la estructura. Y las 82 reparticiones con gente tienen **la dotación
exacta** que informa la liquidación: se verificó una por una.

## La fuente

`GRH_TUCUMAN`, el sistema de sueldos municipal (SQL Server, red interna). **Solo
lectura garantizada por el servidor**: el login tiene `CONNECT` + `SELECT` y nada
más. No es Civitas, y Civitas ya no hace falta.

El organigrama sale de `ORGANIZA` (187 unidades). La jerarquía no está en
`ID_PADRE` —que está vacío— sino codificada en `codigoOrganiza`
(`1.14.000` → `1.14.210` → `1.14.211`).

Lo que **no** se puede traer, y hay que dar por cerrado:

| | Por qué |
|---|---|
| Email | Vive en `personas_produccion`, base denegada |
| Puesto / cargo | Las columnas existen en GRH y están **vacías en los 4.706 legajos** |
| Dónde trabaja realmente | Ver abajo: el sector es dónde se le **paga** |

La consecuencia práctica: **asignar cada persona a su puesto del nomenclador es
trabajo manual**, desde la ficha de cada puesto. No hay dato de origen.

## El límite conceptual que hay que tener presente

El sector de la liquidación indica **dónde se le paga** a alguien, no
necesariamente dónde trabaja. Caso conocido: la Dirección de IA tiene 4 personas
y la liquidación imputa 2.

Se buscó una fuente mejor y no existe: `LEGAJO.lugarDeTrabajo` está **vacío en
4.376 de 4.706** y el resto es texto libre que contradice al sector (gente de
Bromatología con lugar de trabajo "Honorable Concejo Deliberante").

Por eso CapitalIA **no es un espejo de GRH**: es donde vive el organigrama real, y
GRH queda como sistema de liquidación. De ahí se desprende todo lo siguiente.

## La sincronización mensual

`importar.mjs` está pensado para volver a correrse con cada liquidación. Hace **dos
operaciones distintas a propósito**:

| | Qué escribe |
|---|---|
| Persona nueva | legajo, nombre y repartición |
| Persona ya cargada | **solo el nombre** |

La repartición **nunca se reescribe**. Si no fuera así, la sincronización del mes
siguiente borraría en silencio cada corrección que hizo Capital Humano. GRH no
vuelve a opinar sobre dónde trabaja alguien después de la primera carga.

Corolario importante: **el script escribe `reparticion_id` una sola vez en la vida
de cada persona.** Todo lo que decide ubicación tiene que estar bien *antes* de la
primera carga de esa persona, porque volver a correrlo no lo corrige.

## Lo que falta, y de quién depende

Todo lo que queda son decisiones de personas. **No hay nada pendiente de código ni de
verificación.**

### Necesita una definición de Capital Humano

1. **65 agentes de dos sectores de Tránsito.** Se dejaron afuera a propósito.
   - *Dirección General de Tránsito* (40): **no existe** como unidad en `ORGANIZA`.
     Ahí solo están la Administrativa (14900) y la Operativa (15000), que la
     liquidación ya trae aparte como 1731 y 1732. Esta parece una tercera unidad
     por encima de las dos.
   - *Dir. Gral. de Transporte Público, Seg. Vial y Licencias* (25): por el nombre
     parece dirección general, pero el único candidato en `ORGANIZA` es una
     subsecretaría.

   Están listados con su motivo en `EXCLUIDOS`, dentro de `armar-mapeo.mjs`, para
   que falten a propósito y no por olvido. Definido eso, se cargan sin rehacer nada.

2. **Un nombre con errata del origen.** `GRH-16300 SUBSECRETARIA DE ORDANAMIENTO Y
   CONV` — la A donde va la E. Es el único de los 119 que quedó en mayúsculas: no
   se corrigió porque adivinar la intención de otro sistema no corresponde.

3. **¿El director de una dirección ve a la gente de sus subdirecciones?** Hoy
   **no**: solo el rol `secretario` recorre el árbol hacia abajo. Con 72
   subdirecciones cargadas esto ya no es teórico. Falla cerrado, no es fuga. Y se
   resuelve sin tocar la base: `secretario` es un rol de **alcance recursivo desde
   el nodo asignado**, no de nivel. Definirlo **antes** de crear cuentas.

### Nada más. Lo que estaba pendiente de ejercitar ya se ejercitó

**La revocación de acceso quedó probada** el 2026-08-14 con
[`prueba-revocacion.sql`](prueba-revocacion.sql), sobre el director de la Dirección
de IA:

| Caso | Resultado |
|---|---|
| A · con el arreglo, perfil **activo** | **3** — ve a su gente |
| B · con el arreglo, perfil **desactivado** | **0** — la revocación funciona |
| C · escritura estando de baja | **rechazada** |
| D · **sin** el arreglo, desactivado | **3** — el bug que se cerró |

Los cuatro juntos son la prueba: A contra B muestra que desactivar revoca, y B
contra D muestra que **el arreglo es lo que produce el 0** y no otra cosa — con la
función de la `0015`, el mismo usuario desactivado seguía viendo a sus 3 y podía
escribir.

Se verificó después que el test no dejó nada tocado: los 4 perfiles activos, la
función arreglada en su lugar y ninguna fila de prueba.

(El rol `admin` nunca estuvo afectado: `is_admin()` siempre chequeó `is_active`.
Los expuestos eran `director` y `secretario`, y con el secretario era peor —al
desactivarlo caía a la rama del director, conservaba su repartición y perdía el
subárbol—.)

## Errores propios que aparecieron y cómo se encontraron

Vale registrarlos porque ninguno daba error y los tres se vieron **leyendo la
salida de una corrida en seco**, no compilando.

- **El organigrama duplicado.** El matcheo por parecido dejaba 22 reparticiones sin
  enganchar, y 21 de ellas eran la misma unidad que una de las que iba a crear:
  dos "Contaduría General" —una con 121 personas y otra vacía—, dos "Museo de la
  Industria Azucarera", dos de Prensa, dos de Deportes, con 581 personas en las
  gemelas. `reparticiones.nombre` no tiene `UNIQUE`, así que nada lo frenaba. Lo
  encontró una revisión adversarial del script **antes** de correrlo.
- **189 personas invisibles para su director.** "Secretaría de Ingresos
  Municipales" y "Dirección de Ingresos Municipales" empataban en 1.000 —`STOP`
  saca las palabras SECRETARIA y DIRECCION de los tokens— y ganaba la primera del
  archivo. Ahora el escalón desempata.
- **24 unidades con el escalón mal.** El tipo se deducía del código numérico y la
  rama de los "despachos" está corrida un nivel: `DIRECCION DE DESPACHO DE
  GOBIERNO` había quedado como subsecretaría. Se reemplazó una deducción por otra;
  ahora manda el nombre. Corregido con `corregir-tipos.mjs`.
- **`SECRETARIA` y `SUBSECRETARIA` sin tilde** en el script que prolija nombres.
  Son las dos palabras más frecuentes del organigrama.

## Las herramientas

Todas en `scripts/importacion/`, ninguna escribe sin `--aplicar`. Los CSV y los
respaldos **no van al repo** (el `.gitignore` de la carpeta es lista blanca).

| Orden | Script |
|---|---|
| 1 | `respaldar.mjs` — exporta las 4 tablas que la carga toca. **Es la única red**: no hay Point-in-Time Recovery en el plan gratuito de Supabase |
| 2 | `armar-mapeo.mjs` — sector de la liquidación → repartición. 82 de 84 |
| 3 | `preparar-staging.mjs` — arma los CSV, con el recorte de columnas enforced |
| 4 | `cargar-staging.mjs` — vacía y llena staging (paso descartable) |
| 5 | `importar.mjs` — la carga. En seco por defecto |
| — | `corregir-tipos.mjs`, `prolijar-nombres.mjs` — arreglos posteriores |

Las cinco consultas de conciliación están comentadas al final de la migración
`0026`, para tenerlas a mano el día de una recarga.

## Migraciones

`0021`–`0027`, todas aplicadas.

| | |
|---|---|
| `0021` | Desactivar un usuario le revoca el acceso de verdad |
| `0022` / `0023` | Búsqueda server-side, normalizada igual que la app |
| `0024` | Candidatos a asignar, resueltos en la base |
| `0025` | `reparticiones.tipo` — el escalón pasa a ser un dato |
| `0026` | Tablas de staging |
| `0027` | Sellado: `NOT NULL` en `reparticion_id` y `tipo`, y la FK a `ON DELETE RESTRICT` |

De la `0027`, la parte menos obvia y más importante: la FK estaba en `on delete set
null`, así que **borrar una repartición convertía a toda su gente en personas
huérfanas e invisibles**, sin un error. Borrar Dirección de Educación desaparecía
515 personas de la vista de todos.

## Lo que sigue después de esto

Nada bloqueante. En orden de valor:

1. **Cruce `positions` × `asignaciones`** — "qué puestos están cubiertos y cuáles
   vacantes". Es la pregunta que Capital Humano se hace todos los días, el sistema
   la puede contestar y todavía no la contesta. Hoy daría "0 de 209".
2. **`actualizarReparticion` tiene un UPDATE mudo**: sin `.select()`, cero filas
   afectadas devuelve éxito y la app dice "guardado" sin haber guardado. Está vivo.
   `editarPersona` no lo copió.
3. Cuatro cosas menores de la revisión de B5, ninguna oculta datos: ver
   [`revision-b5.md`](revision-b5.md).
