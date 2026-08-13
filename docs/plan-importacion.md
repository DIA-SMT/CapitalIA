# Fase 0 — Preparar el terreno antes de importar

Criterio de corte, sin diplomacia: **bloqueante** es lo que, si no está hecho el día de la importación, deja los datos mal escritos o invisibles para la app, sin ningún error. Todo lo demás va después. Hay 9 ítems bloqueantes y 7 que pueden esperar. La mitad de los hallazgos del informe son el mismo defecto raíz visto desde pantallas distintas; están unificados acá.

---

## Paso 0 — La palanca que hace todo verificable hoy (30 minutos, antes que nada)

Con 2 personas en la base, ninguno de los bloqueantes se puede ejercitar. Se pueden ejercitar todos si bajás el tope de filas.

**Qué hacer**

1. Confirmá el tope REAL del proyecto hosted en **Settings → API → Max rows**. `supabase/config.toml:18` (`max_rows = 1000`) es la config del entorno local, no la del proyecto donde se pegan las migraciones. Si el hosted está en otro valor, todos los números del informe cambian de escala pero no de naturaleza.
2. Bajá ese valor a **5** (en un proyecto de prueba, o en el de desarrollo local si lo corrés).
3. Cargá 6 personas de prueba con apellidos que cubran el alfabeto: `AAAAA`, `BBBBB`, `MMMMM`, `PÉREZ`, `ZÁRATE`, `ZZZZZ`.

**Cómo se verifica que la palanca sirve**: abrí `/personas`. Va a decir "5 personas" con 6 cargadas, sin error en consola, y buscar "zzzzz" va a contestar "Sin coincidencias". Eso es exactamente el bug de producción a escala 4.771, reproducido con 6 filas. Cada ítem bloqueante de abajo se verifica contra este entorno **antes** de tocar los datos reales.

> No es opcional: sin esto, "quedó arreglado" significa "compila", que es justo lo que el proyecto ya decidió que no alcanza.

---

# BLOQUEANTE — antes de importar

Orden de dependencia real. B1–B4 son una sola migración. B5–B7 son la app. B8 es la carga. B9 sella.

---

## B1 · Migración 0021 — `reparticiones.tipo`

**Por qué es bloqueante**: el dato de qué es cada unidad (secretaría / subsecretaría / dirección / subdirección) viene explícito en el origen de sueldos y en ningún otro lado. Si la columna no existe cuando se importa, ese dato se pierde y después hay que re-deducirlo de una fuente que quizás ya no tengas a mano. Hoy el tipo se deduce de la forma del árbol (`reparticiones.ts:119-129`: raíz = secretaría, con hijos = subsecretaría, sin hijos = dirección) y con 4 niveles esa heurística cruza categorías por construcción.

**Toca**: `supabase/migrations/20260716120021_preparacion_import.sql` (nueva).

```sql
alter table public.reparticiones add column if not exists tipo text;

alter table public.reparticiones drop constraint if exists chk_reparticiones_tipo;
alter table public.reparticiones add constraint chk_reparticiones_tipo
  check (tipo is null or tipo in ('secretaria','subsecretaria','direccion','subdireccion'));

comment on column public.reparticiones.tipo is
  'Tipo de unidad según el organigrama de origen. Se carga en la importación: NO se '
  'deduce de la forma del árbol (una dirección con subdirecciones a cargo sigue '
  'siendo una dirección).';
```

Queda **nullable a propósito** en 0021: se puebla en B8 y se sella en B9.

**Cómo se verifica**: `insert` de prueba con `tipo = 'gerencia'` tiene que ser rechazado por el check; con `tipo = 'subdireccion'` tiene que entrar. Correr la migración dos veces seguidas no debe fallar (idempotencia).

**Decisión que hay que tomar acá, no después**: las 62 unidades actuales (migraciones 0011 y 0016) son datos provisionales del POA 2026. ¿Las 187 que entran las reemplazan por `external_id`, o conviven? Si conviven, las viejas quedan con `tipo` nulo y B9 no puede sellar. Recomendación: que el import las matchee por `external_id` y las que no matcheen se den de baja explícitamente (`is_active = false`), no se borren — hay personas y solicitudes que las referencian.

---

## B2 · Migración 0021 — columna de búsqueda normalizada sobre `personas`

**Por qué es bloqueante**: no por sí sola, sino porque **B5 la necesita**. Hoy `normalizar()` (`tabla-personas.tsx:21-27`) saca tildes en el cliente, así que "gomez" encuentra "Gómez". Al mover la búsqueda al servidor (obligatorio, B5), un `.ilike("full_name", "%gomez%")` pelado pierde eso: `ILIKE` pliega mayúsculas pero **no** acentos. En Tucumán eso es la mayoría del padrón, y la regresión se presenta con la misma cara: "Sin coincidencias". Si B5 entra sin B2, arreglás un bug bloqueante creando otro.

**Toca**: la misma migración 0021.

```sql
-- Normalización de los dos lados: la columna guarda el texto sin tildes ni
-- mayúsculas, y el término que manda la app pasa por la misma transformación.
-- Se usa translate() y no unaccent(): translate y lower son IMMUTABLE builtins,
-- así que sirven en una columna generada. unaccent() es STABLE y necesitaría un
-- wrapper IMMUTABLE aparte.
alter table public.personas
  add column if not exists busqueda text
  generated always as (
    lower(translate(
      coalesce(full_name,'') || ' ' || coalesce(legajo,'') || ' ' || coalesce(email,''),
      'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
      'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
    ))
  ) stored;

create index if not exists idx_personas_busqueda_trgm
  on public.personas using gin (busqueda gin_trgm_ops);
```

`pg_trgm` ya está (init.sql:7). Las dos cadenas de `translate` tienen 48 caracteres cada una — si no coinciden, Postgres lo rechaza al pegarla, así que el error es ruidoso.

**Cómo se verifica** (ejercitándolo, no leyéndolo):

```sql
select full_name, busqueda from public.personas where legajo = '<el de PÉREZ>';
-- busqueda tiene que decir 'perez ... ' sin tilde y en minúscula
select count(*) from public.personas where busqueda ilike '%zarate%';  -- 1
select count(*) from public.personas where busqueda ilike '%ZÁRATE%';  -- 0 (esperado: el término va normalizado desde la app)
explain analyze select * from public.personas where busqueda ilike '%gomez%';
-- tiene que usar idx_personas_busqueda_trgm (con pocas filas puede elegir seq scan: probar con set enable_seqscan = off)
```

**Trade-off que hay que aceptar explícitamente**: hoy la búsqueda del cliente también matchea por **repartición** y **puesto** (`tabla-personas.tsx:52-61`), que viven en otras tablas y no pueden entrar en una columna generada. La repartición pasa a ser un filtro propio (`?rep=<uuid>`, más preciso que el texto). La búsqueda por nombre de puesto **se pierde**. Decidilo y escribilo en el placeholder del buscador; si no, es otra regresión silenciosa.

---

## B3 · Migración 0021 — vista `personas_sin_puesto`

**Por qué es bloqueante**: `listarPersonasSinPuesto()` (`personas.ts:186-213`) trae las personas activas **sin ningún límite** y recién ahí filtra en JS (línea 211) quién tiene asignación abierta. Con 4.771 activas, PostgREST devuelve las primeras 1.000 por `full_name` y el filtro de JS corre sobre ese recorte. Peor: la ventana se calcula sobre `personas`, no sobre las disponibles, así que **asignar gente no la corre hacia adelante**. A medida que el admin asigna, el selector se vacía hasta llegar a cero y la UI renderiza `personas-del-puesto.tsx:110-114`: *"No hay personas activas sin puesto asignado"* — con miles de personas sin puesto en la base. Es un camino de escritura tapiado.

El filtro tiene que estar en SQL. PostgREST no puede expresar "no tiene asignación abierta" sin una vista o RPC.

**Toca**: la misma migración 0021.

```sql
-- drop + create, no "create or replace": replace no permite cambiar la lista de columnas.
drop view if exists public.personas_sin_puesto;
create view public.personas_sin_puesto
with (security_invoker = true) as
select p.id, p.legajo, p.full_name, p.reparticion_id, p.busqueda
  from public.personas p
 where p.is_active
   and not exists (
     select 1 from public.asignaciones a
      where a.persona_id = p.id and a.valid_until is null
   );

-- security_invoker = true es OBLIGATORIO: sin él la vista corre con los permisos
-- del dueño y se saltea personas_select_director (0012:82-85). Eso sería una fuga
-- de datos de personal, que es el punto más sensible del proyecto.
grant select on public.personas_sin_puesto to authenticated;
```

El `grant` explícito hace falta: `supabase/config.toml` documenta que las entidades nuevas del schema `public` **no** se auto-exponen a los roles de la Data API sin GRANT.

**Cómo se verifica — este es el que hay que ejercitar con más cuidado, porque toca RLS**:

1. Como **admin**: `select count(*) from personas_sin_puesto` = cantidad real de personas activas sin asignación abierta.
2. Como **director** de una repartición de prueba (con `perfil_reparticiones` cargado): el mismo select tiene que devolver **solo** su gente. Si devuelve más, `security_invoker` no quedó puesto y hay fuga. Es el chequeo que no se puede saltear.
3. Asigná a alguien a un puesto y volvé a contar: tiene que bajar de a uno. Esa es la prueba de que la vista, a diferencia del filtro en JS, se recalcula sobre las disponibles reales.

---

## B4 · Migración 0021 — tablas de staging (y la regla del CSV)

**Por qué es bloqueante**: pegar 4.771 `insert` a mano en el SQL Editor no es viable, y la parte que importa no es insertar sino **conciliar**. Con staging, la conciliación es una consulta; sin staging, es fe.

**Toca**: la misma migración 0021.

```sql
create table if not exists public.stg_reparticiones (
  external_id        text primary key,   -- id de la unidad en el sistema de sueldos
  code               text not null,
  nombre             text not null,
  parent_external_id text,
  tipo               text not null,
  error_mapeo        text
);

create table if not exists public.stg_personas (
  legajo                  text primary key,
  full_name               text not null,
  reparticion_external_id text,
  error_mapeo             text
);

-- RLS prendida y SIN policies: nadie las alcanza por la API. Solo el SQL Editor,
-- que corre como postgres y bypassea RLS.
alter table public.stg_reparticiones enable row level security;
alter table public.stg_personas      enable row level security;
revoke all on public.stg_reparticiones from anon, authenticated;
revoke all on public.stg_personas      from anon, authenticated;
```

**Regla de alcance mínimo, no negociable**: el export de sueldos probablemente traiga DNI, CUIL, categoría y haberes. Esas columnas se recortan **en el CSV, antes de subirlo**. No entran a staging "por un rato". La cabecera de la 0008 es explícita sobre qué guarda este sistema, y una tabla de staging es una tabla.

**Cómo se verifica**: logueado como usuario normal en la app, `supabase.from("stg_personas").select("*")` desde la consola del navegador tiene que devolver error o cero filas. Y `\d stg_personas` no debe tener ninguna columna que no sea legajo, nombre y repartición.

---

## B5 · Paginar, buscar y filtrar `/personas` en el servidor

**El bloqueante principal.** Es el que produce el modo de falla peor del proyecto: HTTP 200, `error === null`, sin banner, sin log, pantalla prolija que informa mal sobre el 79% de la nómina.

`listarPersonas()` (`personas.ts:85-143`) es `.from("personas").select(...).order("full_name")` y nada más: sin `.range()`, sin `.limit()`, sin `count`. A 4.771 devuelve 1.000 filas con status ok, así que el `if (error)` de la línea 102 no se dispara nunca. Y todo lo que se construye río abajo hereda el recorte:

- `tabla-personas.tsx:133-138` imprime `${personas.length} personas` → dice "1000 personas" como si fuera la dotación.
- `tabla-personas.tsx:45-63` filtra en el cliente sobre ese array: buscar a alguien que quedó afuera devuelve el `NoResultsState` de las líneas 140-144, *"Sin coincidencias — Probá con otro término"*. Es un negativo falso con cara de certeza. Un jefe de personal concluye que el empleado no se importó y lo carga de nuevo; el `unique` de legajo (0008:22) lo rechaza y nadie entiende por qué.
- `tabla-personas.tsx:39-43` arma el desplegable de repartición con `new Set` sobre las filas cargadas, y además compara por **nombre** (línea 48), que no tiene `unique` en el esquema (0010:30-33). Faltan opciones sin señal, y dos unidades homónimas de secretarías distintas colapsan en una.
- `tabla-personas.tsx:65-68` cuenta `sinPuesto` sobre el recorte.
- El dashboard, en cambio, usa `resumenDotacion()` (`personas.ts:160-183`) con `count: "exact", head: true`, que **no** pasa por el tope: informa el total real. El tile linkea a `/personas` (`dashboard/page.tsx:180-190`). Un click y el mismo dato cambia de valor. Ningún código compara los dos números, así que la contradicción es visible para un humano y no para la app.

> Aclaración que evita perder tiempo: el defecto **no** está en el `useMemo` de `tabla-personas.tsx:45`. Ahí solo se manifiesta, y es irreparable por construcción — ningún filtrado en cliente puede encontrar filas que nunca cruzaron la red. El arreglo vive en la capa de datos.

**Toca (los tres juntos, es un solo cambio)**:
- `src/features/personas/data/personas.ts`
- `src/app/(app)/personas/page.tsx`
- `src/features/personas/components/tabla-personas.tsx`
- (nuevo) `src/app/(app)/personas/loading.tsx`

**Qué hacer**

**(a) Capa de datos** — mismo patrón que ya existe en `auditoria.ts:128-136` y `listarAuditoria` (192-205). No inventar uno nuevo.

```ts
export const POR_PAGINA_PERSONAS = 50;   // igual que auditoria.ts:90

export type FiltrosPersonas = { q?: string; rep?: string; estado?: string; pagina?: number };
export type PaginaPersonas = {
  personas: PersonaListado[]; total: number; pagina: number; paginas: number;
};

/** Misma normalización que la columna generada `personas.busqueda` (0021). */
function terminos(q?: string): string[] {
  if (!q) return [];
  return q.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9@.\s-]/g, " ")   // saca comodines de LIKE y la gramática de PostgREST
    .split(/\s+/).filter(Boolean);
}

export async function listarPersonas(f: FiltrosPersonas = {}): Promise<PaginaPersonas> {
  const pagina = Math.max(1, f.pagina ?? 1);
  const vacio: PaginaPersonas = { personas: [], total: 0, pagina, paginas: 0 };
  if (!isSupabaseConfigured()) return vacio;

  const desde = (pagina - 1) * POR_PAGINA_PERSONAS;
  const supabase = await createClient();

  let consulta = supabase
    .from("personas")
    .select(
      `id, legajo, full_name, email, is_active,
       reparticiones ( id, nombre ),
       asignaciones ( valid_until,
         positions ( id, internal_code,
           current_version:position_versions!positions_current_version_fk ( name ) ) )`,
      { count: "exact" },
    )
    .order("full_name")
    .order("id")                                    // desempate: sin esto, con homónimos las páginas se pisan y se saltean filas
    .range(desde, desde + POR_PAGINA_PERSONAS - 1);

  // Filtros encadenados = AND, que reproduce el `terminos.every` del cliente.
  for (const t of terminos(f.q)) consulta = consulta.ilike("busqueda", `%${t}%`);
  if (f.rep) consulta = consulta.eq("reparticion_id", f.rep);   // usa idx_personas_reparticion (0010:95)
  if (f.estado === "activa") consulta = consulta.eq("is_active", true);
  if (f.estado === "baja")   consulta = consulta.eq("is_active", false);

  const { data, error, count } = await consulta;
  if (error) { console.error("[personas] listarPersonas:", error.message); return vacio; }

  const total = count ?? 0;
  return { personas: mapear(data), total, pagina, paginas: Math.ceil(total / POR_PAGINA_PERSONAS) };
}
```

Se usa `.ilike` encadenado y **no** `.or(...)`: la gramática de `or()` se rompe con comas y paréntesis en el término del usuario y habría que sanitizar a mano.

Añadir `reparticionId` a `PersonaListado` (el select hoy pide `reparticiones ( nombre )` y descarta el id, `personas.ts:132`).

**(b) Página** — `searchParams` es una Promesa; el repo ya lo hace en `auditoria/page.tsx:53-59`.

```tsx
type ParamsPersonas = { q?: string; rep?: string; estado?: string; pagina?: string };

export default async function PersonasPage(
  { searchParams }: { searchParams: Promise<ParamsPersonas> },
) {
  const params = await searchParams;
  const datos = await listarPersonas({
    q: params.q, rep: params.rep, estado: params.estado,
    pagina: Number(params.pagina ?? "1") || 1,
  });
```

El desplegable de repartición se alimenta de **`listarReparticionesPlanas()`** (`reparticiones.ts:149-162`) — las 187 completas, con el id como `value` — y no de un `new Set` sobre las filas cargadas.

**(c) Componente** — deja de tener `useState` de búsqueda. Buscador con `next/form`, filtros con `<Link>` reusando el helper `href(actual, cambio)` de `filtros-auditoria.tsx:22-33`, paginación calcada de `auditoria/page.tsx:187-213`, y el contador pasa a `${datos.total} personas · página ${pagina} de ${paginas}`.

⚠️ **Detalle que rompe si no se ve**: un `<Form>` GET manda **solo sus propios campos**. Los filtros activos (`rep`, `estado`) tienen que ir como `<input type="hidden">` adentro del form, o se pierden al buscar. Y `pagina` **no** debe ir, para que una búsqueda nueva vuelva a la página 1. Esto lo deduje de la semántica de los formularios HTML, no de una afirmación en `form.md`.

**(d) Red de seguridad, en todo el repo**: cualquier consulta que pueda superar las 1.000 filas pide `{ count: "exact" }` y compara. Si difiere, se loguea y se avisa en pantalla en vez de fingir un total.

```ts
if (count !== null && (data?.length ?? 0) < count) {
  console.error("[personas] TRUNCADO: llegaron", data?.length, "de", count);
}
```

**Cómo se verifica** (con `max rows = 5` y las 6 personas de prueba):

1. `/personas` dice **6 personas · página 1 de 2**, no "5 personas".
2. Buscar `zzzzz` (que está en la fila 6, fuera del primer tramo) **lo encuentra**. Antes contestaba "Sin coincidencias".
3. Buscar `perez` sin tilde encuentra a `PÉREZ`. Buscar `PÉREZ` con tilde también.
4. Buscar por número de legajo encuentra a la persona (el legajo está en la columna `busqueda`).
5. Buscar dos términos (`perez juan`) exige que matcheen los dos, igual que hoy.
6. El desplegable de repartición lista **todas** las reparticiones de la base, incluidas las que no tienen a nadie en la página visible.
7. Filtrar por una repartición y **volver atrás con el botón del navegador** conserva el filtro. Copiar la URL y abrirla en otra pestaña muestra lo mismo. Eso prueba que el estado está en la URL.
8. Deshabilitá JavaScript en el navegador: el buscador tiene que seguir funcionando (es un GET nativo).
9. Ir a la página 2, volver a la 1, ir a la 2: nadie aparece dos veces ni desaparece. Eso prueba el desempate por `id`.
10. Comparar el número del tile "Personas" del dashboard con el total del listado. Tienen que coincidir. *(Ojo: hoy `resumenDotacion` filtra `is_active = true` y `listarPersonas` no filtra nada, así que van a diferir si hay bajas. Decidí una sola semántica y usala en las dos pantallas.)*
11. Mirá el HTML fuente de `/personas`: tienen que viajar 50 filas, no todas.

---

## B6 · Selector de asignación: vista + búsqueda server-side, y detrás del chequeo de rol

**Por qué es bloqueante**: es el mismo corte de 1.000 pero sobre un camino de **escritura**. Con la vista de B3 ya creada, esto es corto.

Además, `listarPersonasSinPuesto()` corre dentro del `Promise.all` de `puestos/[id]/page.tsx:89-95`, o sea **antes** del `getSessionRole()` de la línea 99, y `disponibles` se pasa al Client Component `PersonasDelPuesto` sin importar `puedeAsignar`. Los props de un componente cliente se serializan en el payload RSC sí o sí, aunque el panel arranque cerrado (`abriendo` nace en `false`, `personas-del-puesto.tsx:47`). Son nombres y legajos de personal viajando en cada una de las 210 fichas, para todo el que las abra, sin que la pantalla los use. No es una fuga (la RLS acota a cada uno a su alcance) pero es desperdicio evitable.

Y el `<select>` nativo de `personas-del-puesto.tsx:120-132` no tiene búsqueda: el type-ahead del navegador compara desde el primer carácter del texto de la opción, que arranca con el nombre, así que **tipear el legajo no salta a nadie** — y el legajo es la clave de identidad y lo único que desambigua entre homónimos, que con 4.771 municipales existen.

**Toca**:
- `src/features/personas/data/personas.ts` *(mismo archivo que B5 — hacelos juntos)*
- `src/features/personas/actions.ts`
- `src/features/personas/components/personas-del-puesto.tsx`
- `src/app/(app)/puestos/[id]/page.tsx`

**Qué hacer**

1. `listarPersonasSinPuesto(q?: string)` consulta **la vista** `personas_sin_puesto`, con `.ilike("busqueda", ...)` por término y `.limit(50)`. Nunca la lista entera, nunca filtro en JS después del fetch.
2. Sacarla del `Promise.all` de la ficha. El componente arranca **sin** `disponibles`.
3. Cuando el usuario abre el panel y tipea, se consulta bajo demanda con una Server Action (`buscarPersonasSinPuesto(q)`), que es el patrón que el repo ya usa. La guía de Next lo dice explícito: *"the route is reachable to anyone who can send the same POST. Treat every action as an untrusted entry point"* (`server-actions.md:78`) y *"Render-time gating (...) is not a security boundary"* (`:89`). Acá la defensa real es la RLS de la vista con `security_invoker` (B3), no el hecho de no renderizar el input.
4. La opción muestra `{nombre} — legajo {legajo} · {repartición}`, para desambiguar homónimos a la vista.
5. Índice trgm sobre legajo: no hace falta uno nuevo, `busqueda` ya lo concatena y tiene su GIN (B2).

**Cómo se verifica**:

1. Con `max rows = 5` y 6 personas sin puesto: abrí una ficha de puesto, tipeá `zzzzz` en el selector, **tiene que aparecer**. Antes no aparecía nunca, ni asignando a los otros 5 primero.
2. Asigná a las 5 primeras. El selector **no** debe decir "No hay personas activas sin puesto asignado": tiene que seguir ofreciendo a la sexta.
3. Tipeá el legajo: tiene que encontrarla. Es el caso que el `<select>` nativo no puede resolver.
4. Abrí la ficha con JS deshabilitado / mirá el payload RSC (pestaña Red, documento de la ficha): **no** debe haber ninguna lista de personas embebida.
5. Como **director**, la búsqueda solo devuelve su gente. Como **admin**, todos. Si un director ve gente ajena, `security_invoker` falló.

---

## B7 · Cerrar el agujero del `reparticion_id` nulo

**Por qué es bloqueante**: `personas.reparticion_id` es nullable (`0010:88-89`, con `on delete set null`). La policy `personas_select_director` (`0012:82-85`) es `using (reparticion_id in (select public.mis_reparticiones()))`, y **`null in (...)` da NULL, no true** — la 0018 lo documenta explícitamente en sus líneas 44-47 y depende de esa semántica a propósito. Consecuencia: una persona con repartición nula es **invisible para todo director y secretario, para siempre**, y visible solo para el admin. Sin error, sin señal, sin forma de listarla desde la app.

Al mapear 4.771 personas desde sueldos contra 187 unidades, todo lo que no matchee cae en ese pozo. Con un 5% de fallo de mapeo son ~240 personas invisibles para sus jefes; con 20%, ~950.

Y no hace falta la importación: el alta ya lo produce hoy. `alta-persona.tsx:120-122` le ofrece al admin un `<option value="">Sin repartición</option>` de primera clase, habilitado desde `personas/page.tsx:41-43`.

**Toca**:
- `src/features/personas/components/alta-persona.tsx` *(también lo toca N2 — coordinalos)*
- `src/app/(app)/personas/page.tsx` *(mismo archivo que B5)*
- La migración de mapeo (B8) y el sellado (B9)

**Qué hacer**

1. Sacar la opción "Sin repartición": la repartición pasa a ser obligatoria **para todos**, no solo para el director. Ajustar `reparticionObligatoria` y `personaSchema` (`schemas/persona.ts:20-23`, hoy `.optional()`).
2. El mapeo de B8 **falla ruidosamente** en vez de escribir NULL (ver B8).
3. Antes de importar, arreglar las 2 personas que ya están: `select count(*) from personas where reparticion_id is null` tiene que dar 0, o B9 no va a poder sellar.
4. Dejar escrita la consulta de conciliación como control permanente:

```sql
select coalesce(r.nombre,'*** SIN REPARTICIÓN ***') as unidad, count(*) as personas
  from public.personas p
  left join public.reparticiones r on r.id = p.reparticion_id
 group by 1 order by 2 desc;
```

**Cómo se verifica**: como admin, intentá cargar una persona sin elegir repartición — el formulario tiene que rechazarlo, y si mandás el POST a mano con `reparticion_id: null`, la Server Action también. Después, creá una persona en una repartición X, logueate como director de Y, y confirmá que no la ve (correcto); logueate como director de X y confirmá que sí. Ese par de pruebas es lo que demuestra que el alcance funciona y que un nulo hubiera desaparecido de las dos vistas.

---

## B8 · La importación en sí — dos migraciones, dos compuertas

**Toca**: `20260716120022_import_reparticiones.sql` y `20260716120023_import_personas.sql`.

Van **separadas y en ese orden**: el árbol se verifica entero antes de colgarle 4.771 personas. Si se hace en una sola migración y el árbol está mal, las personas quedan mal mapeadas y hay que deshacer las dos cosas.

**Antes**: cargar los CSV depurados a `stg_reparticiones` y `stg_personas` con el Table Editor de Supabase (no es una migración).

### 0022 — Reparticiones

Dos pasadas, porque el padre puede no existir todavía cuando se inserta el hijo:

```sql
-- 1. Todas las unidades, sin padre.
insert into public.reparticiones (code, nombre, external_id, tipo)
select s.code, s.nombre, s.external_id, s.tipo
  from public.stg_reparticiones s
on conflict (external_id) do update
   set code = excluded.code, nombre = excluded.nombre,
       tipo = excluded.tipo, updated_at = now();

-- 2. Recién ahora, los padres.
update public.reparticiones r
   set parent_id = p.id, updated_at = now()
  from public.stg_reparticiones s
  join public.reparticiones p on p.external_id = s.parent_external_id
 where r.external_id = s.external_id;
```

**Compuerta 1 — verificar antes de seguir**:

```sql
-- (a) los tipos dan lo esperado
select tipo, count(*) from public.reparticiones group by 1 order by 1;
-- esperado: direccion 81 · secretaria 13 · subdireccion 60 · subsecretaria 33

-- (b) el árbol es alcanzable entero desde las raíces, y la profundidad es la que se espera
with recursive t as (
  select id, tipo, 0 as nivel from public.reparticiones where parent_id is null
  union all
  select r.id, r.tipo, t.nivel + 1
    from public.reparticiones r join t on r.parent_id = t.id
)
select
  (select count(*) from public.reparticiones) as en_tabla,
  (select count(*) from t)                    as alcanzables,
  (select max(nivel) from t)                  as profundidad_maxima;
-- en_tabla == alcanzables (si no, hay nodos colgados de un padre inexistente o un ciclo)
-- profundidad_maxima == 3 (cuatro niveles, 0-based)

-- (c) homónimos: `nombre` NO tiene unique en el esquema. Si esto devuelve filas,
--     el filtro por nombre de la tabla mezclaría unidades distintas.
select nombre, count(*) from public.reparticiones group by 1 having count(*) > 1;
```

Y en pantalla: abrí `/reparticiones` y mirá el árbol dibujado. Las subdirecciones tienen que aparecer anidadas bajo su dirección, no colgando de una secretaría. Es la verificación más barata y la que más rápido revela un `parent_external_id` mal mapeado.

### 0023 — Personas

El orden importa: **marcar, cortar, y recién entonces insertar**.

```sql
-- 1. Marcar lo que no matchea, sin escribir nada en personas.
update public.stg_personas s
   set error_mapeo = case
     when s.reparticion_external_id is null
       then 'sin repartición en el origen'
     when not exists (select 1 from public.reparticiones r
                       where r.external_id = s.reparticion_external_id)
       then 'repartición inexistente en el organigrama: ' || s.reparticion_external_id
     else null end;

-- 2. Cortar en seco si hay alguna. Fallar ruidoso, nunca escribir NULL en silencio.
do $$
declare n int;
begin
  select count(*) into n from public.stg_personas where error_mapeo is not null;
  if n > 0 then
    raise exception
      'Importación abortada: % filas sin repartición mapeable. Revisá stg_personas.error_mapeo.', n;
  end if;
end $$;

-- 3. Recién ahora, el upsert.
insert into public.personas (legajo, full_name, reparticion_id)
select trim(s.legajo), trim(s.full_name), r.id
  from public.stg_personas s
  join public.reparticiones r on r.external_id = s.reparticion_external_id
on conflict (legajo) do update
   set full_name = excluded.full_name,
       reparticion_id = excluded.reparticion_id,
       updated_at = now();
```

**Decisión previa, y es de una sola oportunidad**: `legajo` es `unique` (0008:22) y **hoy no hay ninguna forma de editarlo desde la app** (no existe `editarPersona`, ver N3). Si sueldos exporta `00123` y alguien después carga `123`, quedan dos personas. Fijá la normalización acá — `trim`, y decidí de una vez si se rellena con ceros a la izquierda o no — porque corregirlo después es SQL a mano.

Lo mismo con `full_name`: si viene en MAYÚSCULAS, decidí si se deja o se aplica `initcap`. No es bloqueante para el dato (la columna `busqueda` lo normaliza para buscar) pero es visible en toda la app y se cambia en masa solo con otra migración.

**Compuerta 2 — verificar antes de dar la carga por buena**:

```sql
select count(*) from public.personas;                                  -- 4.771 + las 2 previas
select count(*) from public.personas where reparticion_id is null;     -- 0, sin excepciones
-- totales por unidad, para comparar contra los de sueldos unidad por unidad
select r.tipo, r.nombre, count(*) as personas
  from public.personas p join public.reparticiones r on r.id = p.reparticion_id
 group by 1,2 order by 3 desc;
```

Y en pantalla, con el `max rows` ya devuelto a su valor normal:

1. `/personas` muestra el total real y pagina. **No** dice 1.000.
2. Buscá tres apellidos del final del alfabeto sacados del CSV. Aparecen los tres.
3. El tile "Personas" del dashboard y el total del listado dicen lo mismo.
4. Abrí una ficha de puesto y buscá en el selector a alguien apellidado con Z. Aparece.
5. Logueate como director de una repartición concreta: el total que ve tiene que coincidir con el `count` de esa unidad de la consulta de arriba. Ni más ni menos.

---

## B9 · Migración 0024 — sellar

**Por qué es bloqueante**: sin esto, el próximo alta o el próximo import vuelve a abrir el pozo de los nulos. Va **después** de la carga porque las columnas no pueden ser `not null` mientras se está poblando.

```sql
alter table public.reparticiones alter column tipo set not null;
alter table public.personas      alter column reparticion_id set not null;

-- El `on delete set null` de la 0010:89 convertiría un borrado de repartición en
-- personas huérfanas e invisibles. `restrict` es lo que ya usa solicitudes (0013:36).
-- Confirmá primero el nombre real del constraint:
--   select conname from pg_constraint
--    where conrelid = 'public.personas'::regclass and contype = 'f';
alter table public.personas drop constraint if exists personas_reparticion_id_fkey;
alter table public.personas add constraint personas_reparticion_id_fkey
  foreign key (reparticion_id) references public.reparticiones (id) on delete restrict;
```

**Cómo se verifica**: `insert into personas (legajo, full_name) values ('X','Y')` tiene que fallar por not-null. `delete from reparticiones where id = <una que tenga gente>` tiene que fallar por la FK, en vez de dejar personas huérfanas. Si alguno de los dos **no** falla, la migración no se aplicó.

---

# NO BLOQUEANTE — después de la carga

Son defectos reales, con efecto observable, pero no dejan datos mal escritos ni ocultos el día de la importación.

## N1 · Contar el organigrama por `tipo`, no por la forma del árbol · *medio*

Depende de B1. Es media hora y conviene hacerlo el mismo día, porque el dashboard es la landing.

`resumenOrganigrama()` (`reparticiones.ts:113-143`) clasifica: raíz = secretaría, con hijos = subsecretaría, sin hijos = dirección. Con 4 niveles, **al menos una de las dos tarjetas está mal, sin importar cómo venga el árbol**: sea `k` la cantidad de direcciones con subdirección a cargo y `m` las subsecretarías sin nada colgando, la tarjeta "Subsecretarías" muestra `33 − m + k` y "Direcciones" muestra `141 + m − k`. Para que las dos acertaran haría falta `k = m` y `k − m = 60` a la vez. Y las tres tarjetas **siempre suman 187**, así que el total cierra y nadie sospecha. Las 60 subdirecciones no tienen tarjeta: desaparecen como categoría. Los rótulos empeoran el engaño ("Subsecretarías / Con direcciones a cargo" sobre un número que incluye direcciones).

La cabecera del propio archivo (líneas 101-108) ya prescribe el arreglo: *"si el tipo llega a importar de verdad, corresponde una columna en la tabla y no una heurística acá"*.

**Toca**: `src/features/reparticiones/data/reparticiones.ts`, `src/app/(app)/dashboard/page.tsx`.
**Qué hacer**: cuatro `select("*", { count: "exact", head: true }).eq("tipo", …)` sin traer filas, y una cuarta tarjeta "Subdirecciones". Corregir los `detalle` de cada tarjeta.
**Cómo se verifica**: los cuatro números del dashboard tienen que ser idénticos al `group by tipo` de la compuerta 1 de B8. Después movés una dirección debajo de otra en `/reparticiones` y los números **no** deben cambiar — hoy cambian, y esa es toda la prueba.

## N2 · Los selectores de repartición · *medio*

Tres archivos, un solo problema de fondo: un `<select>` nativo de 187 opciones no es navegable y no desambigua homónimas.

- `alta-persona.tsx:128` sangra con **U+00A0** (lo verifiqué a nivel de bytes: hay exactamente 1 NBSP en el archivo). La sangría **se ve**, pero el NBSP sobrevive al recorte de whitespace del `<option>` y queda como primer carácter, así que el type-ahead nativo solo alcanza a las 13 secretarías (nivel 0, string vacío). Las otras 174 unidades quedan sin atajo de teclado.
- `formulario-reparticion.tsx:113` usa **U+0020**, espacio ASCII (0 bytes NBSP en ese archivo). El navegador lo colapsa: la sangría **no se ve nunca** y las 187 salen chatas. El comentario de `alta-persona.tsx:123-125` describe el mecanismo correcto; ese archivo lo aplica y este no. Son dos archivos con el mismo código aparente y dos comportamientos distintos, ninguno correcto.
- `selector-reparticiones.tsx:38-42` tiene un ternario de tres ramas sobre `nivel`, así que las 81 direcciones y las 60 subdirecciones quedan tipográficamente idénticas, separadas solo por 20px de sangría, dentro de una caja `max-h-56` que muestra ~7 de 187 sin buscador.

**Qué hacer**: `<optgroup>` por secretaría (con optgroup el navegador ya indenta y el type-ahead vuelve a arrancar en la primera letra), o mejor un combobox con búsqueda. Mostrar `r.code` junto al nombre — el campo **ya viene** en `ReparticionPlana` y ningún consumidor lo usa; es lo que desambigua dos "Dirección de Administración". Agregar la rama de `nivel === 2` al ternario del selector de usuarios. Y corregir los comentarios de `reparticiones.ts:7-8` y `:30`, que fijan tres niveles.
**Cómo se verifica**: con las 187 cargadas, abrí el alta, apretá "P" y confirmá que salta a una subdirección que empiece con P. En el formulario de reparticiones, confirmá que la jerarquía se ve. Y buscá dos unidades homónimas: tienen que distinguirse por código.

**Empaquetado con esto** (mismo archivo `reparticiones.ts`, misma pasada): **las reparticiones dadas de baja siguen apareciendo en todos los selectores**. `traerFilas()` (`:46-49`) no filtra `is_active` y `ReparticionPlana` (`:26-32`) ni siquiera lleva el campo, así que ningún consumidor puede filtrar. Mientras tanto, `formulario-reparticion.tsx:132-136` le promete al usuario por escrito que destildar "Activa" la saca de los selectores. Es falso, y es reproducible hoy con las 62 unidades actuales, en tres pasos. Afecta cuatro selectores: alta de personas, alta/edición de usuarios, aprobar acceso, y el "Depende de" del propio ABM.

⚠️ **No arreglarlo en `traerFilas():46`**, que es adonde apunta el síntoma. Filtrar en la consulta rompe cuatro cosas: `construirArbol()` deja huérfanas a las hijas **activas** de una madre de baja (desaparecen del árbol entero), `/reparticiones` deja de mostrarlas tachadas a propósito, `resumenOrganigrama()` deja de cuadrar con `/reparticiones` (su comentario dice que las incluye a propósito), y `obtenerReparticion()` haría `notFound()` en la edición, dejando a una unidad de baja **imposible de reactivar**. El filtro va en el aplanado (`listarReparticionesPlanas`/`recorrer`), agregándole `activa` a `ReparticionPlana`. Trampa de segundo orden: `listarPosiblesPadres` alimenta un select cuyo `defaultValue` es el `parent_id` actual — si la madre está de baja y el filtro la saca, el select cae en la primera opción ("No depende de nadie") y guardar el formulario **ascendería la unidad a secretaría raíz sin avisar**. El filtro tiene que conservar siempre la madre actualmente seleccionada.

## N3 · ABM de personas: editar, trasladar, dar de baja · *alto, y lo primero después de la carga*

`personas` es **insert-only desde la app**. No hay `editarPersona`, no hay ruta `/personas/[id]`, no hay un solo `.update()` contra `personas` en todo `src/`, y `is_active` se lee en seis lugares y no se escribe en ninguno. Consecuencias con número equivocado, no meramente incómodas:

- El headcount del dashboard (`resumenDotacion` filtra `.eq("is_active", true)`) es **monótonamente creciente**: con rotación municipal normal se despega de la realidad y no vuelve nunca.
- El filtro "Estado: Baja" de la tabla es UI muerta: no puede coincidir con nada.
- No se puede cambiar `reparticion_id`. Con traslados habituales, un director sigue viendo a quien ya se fue de su área y no ve a quien llegó. Eso es alcance de datos personales quedando mal.

Lo que **no** justifica este ítem: las correcciones sistemáticas de la importación (mayúsculas, tildes, apellidos partidos) se hacen con un UPDATE masivo en una migración numerada, que es la convención del proyecto. Nadie va a normalizar 4.771 nombres a mano. Lo que lo justifica es la operación de a una fila y recurrente: baja de un agente, traslado, corrección de un legajo puntual.

**Tres cosas que hay que hacer bien** (el arreglo tiene trampas):

1. **RLS**: hoy `personas` tiene `personas_admin` (`for all`, 0008:100), `personas_insert_director` (solo insert, 0018:52) y `personas_select_director` (solo select, 0012:83). **No existe policy de UPDATE para director ni secretario.** Si ponés el botón "Editar" con el mismo criterio que el alta (`rol !== null`), el director come un 42501 en la cara. O la UI se limita a admin, o hace falta una `personas_update_director` con `using` **y** `with check` — sin el `with check`, un director podría mover a una persona **a** una repartición ajena.
2. **El UPDATE tiene que ser ruidoso**: en un UPDATE, la RLS no rechaza, **filtra**. Si la fila no pasa el `using`, se actualizan cero filas, PostgREST devuelve 204 y supabase-js devuelve `{ error: null }`. La app diría "guardado" sin haber guardado. Terminá la cadena con `.select("id").single()` para que el caso vacío sea un error PGRST116 explícito, y agregá ese código a `mensaje()` (`actions.ts:24-31`). El mismo patrón mudo está hoy en `reparticiones/actions.ts:83-97` y — más sensible, porque toca roles — en `usuarios/actions.ts:180-183`. Arreglá los tres en la misma pasada.
3. **El guard va dentro de la acción**, no en el render: `server-actions.md:89` es explícito en que renderizar o no el formulario no es un límite de seguridad.

Aprovechá para corregir el mensaje del 23505 (`actions.ts:26`): hoy dice "Ya existe una persona con ese legajo" y termina ahí, cuando la persona puede estar en una repartición que ese director no ve y no puede tocar. Que el texto cierre el circuito: *"Puede estar cargada en otra repartición: pedile a Capital Humano que la traslade."*

**Cómo se verifica**: como admin, editar el nombre de alguien y ver el cambio en `/personas` y en la ficha del puesto. Trasladar a una persona de la repartición A a la B y confirmar que el director de A **deja** de verla y el de B **empieza** a verla. Dar de baja a alguien y confirmar que el headcount del dashboard **baja**. Y el caso que prueba el punto 2: como director, mandá a mano el POST de la acción sobre una persona ajena — tiene que devolver un error visible, no un toast de éxito.

## N4 · Alcance y RLS — *gate del alta de las ~187 cuentas, no de la importación* · *alto*

No bloquea el import (la carga de personas no crea usuarios), pero **sí bloquea el rollout de cuentas**, que es el paso inmediatamente siguiente. Después de crear 187 cuentas ya no se auditan a mano.

1. **`mis_reparticiones()` no chequea `profiles.is_active` en la rama de director** (`0015:36-42`). Desactivar un usuario desde `/usuarios` **no le revoca nada**: sigue leyendo legajo y nombre de toda su repartición, y desde la 0018 sigue pudiendo **cargar personas y reasignar puestos**, porque `personas_insert_director` y `persona_en_mis_reparticiones` resuelven por la misma función. Mientras tanto el checkbox dice literalmente *"si se desactiva, deja de tener acceso"* y la lista muestra el badge "Sin acceso". La UI promete una revocación que no ocurre. Para el secretario es peor: la sonda `v_es_secretario` (`0015:31`) **sí** mira `is_active`, así que un secretario desactivado cae a la rama de director y conserva su repartición pero pierde el subárbol — funciona a medias, que es más difícil de detectar que si no funcionara.
   Y el arreglo en la función **no alcanza**: `getSessionRole()` (`server.ts:62-77`) lee solo `role` y no `is_active`, mientras `is_admin()` (0003:210-215) sí lo exige. Hacen falta las tres capas: `is_active` en la rama de director, el chequeo en la puerta de sesión, y que `actualizarUsuario` banee la cuenta en Auth cuando `is_active` pasa a false.
   *(Nota: el hueco nació en la 0010:127-137, no en la 0015. La 0015 lo heredó.)*
2. **Con 4 niveles, un director de una dirección deja de ver a la gente de sus subdirecciones**, porque solo el rol `secretario` recursa. Hasta ~1.500 personas invisibles para su jefe directo — y tampoco las puede asignar ni dar de alta. **Falla cerrado** (sub-reporta, nunca sobre-reporta), por eso no es bloqueante. Y hay salida sin tocar la base: el admin pone `role = 'secretario'` sobre esa dirección y el `with recursive` hace lo correcto, porque `secretario` es un rol de **alcance recursivo desde el nodo asignado**, no un rol de nivel. Lo que hay que corregir sí o sí es `ROL_ETIQUETA` en `src/lib/roles.ts:21-25`, que dice "Secretario (toda su secretaría)" y esconde eso.
   **Esto es una decisión de Capital Humano, no técnica**: ¿el director de una dirección debe ver a sus subdirecciones? Tomala **antes** de asignar los alcances de las 187 cuentas.
3. Ojo con `usuarioSchema`/`cambioUsuarioSchema` (`schemas/usuario.ts:26,38`): topean en `.max(60)` las reparticiones por usuario, y `.refine(role === 'admin' || reparticiones.length > 0)` impide **vaciar** las reparticiones de un director al desactivarlo — o sea, el workaround obvio del punto 1 tampoco está disponible.

**Cómo se verifica** (es el único ítem que se verifica con una prueba negativa, y hay que hacerla): creá un director de prueba con reparticiones, logueate con él y confirmá que ve su gente. Desactivalo desde `/usuarios` **sin cerrarle la sesión**. Con la sesión vieja todavía viva: `select count(*) from personas` tiene que devolver **0**, e intentar cargar una persona tiene que fallar. Hoy devuelve su padrón completo y el alta funciona.

## N5 · `desasignar_persona` ignora el puesto · *medio*

La Server Action recibe `positionId` (`actions.ts:114-131`) y solo lo usa para revalidar rutas; nunca llega a la base. La función SQL (`0018:126-129`) hace `where persona_id = ... and valid_until is null`, sin `position_id`. Con `uq_asig_una_vigente_por_persona` garantizando una sola vigente por persona, el update pega **exactamente en la vigente del momento**, sea cual sea. Si el director A tiene abierta la ficha del puesto X, B mueve a esa persona al puesto Y, y A aprieta "Quitar" sobre su pantalla vieja, cierra la asignación recién creada en Y y el toast dice "Se cerró la asignación". La firma miente y el `confirm` dice "de este puesto" mientras la base hace "de cualquier puesto".

No es grave: queda rastro en `audit_logs`, la autorización sigue en pie, y se arregla reasignando. Pero el arreglo convierte un éxito silencioso equivocado en un error explícito.

**Dos detalles que hacen fallar el fix**: (a) `create or replace function` con una firma nueva **no** reemplaza la vieja — Postgres sobrecarga, y la vieja `desasignar_persona(uuid, date)` conserva su `grant execute to authenticated` (0018:157) y sigue invocable por RPC. Agregá `p_position_id uuid default null` para mantener **una sola firma**. (b) Con el filtro puesto, el click viejo cae en `raise exception 'La persona no tiene una asignación vigente'` con errcode `no_data_found`, pero `mensaje()` (`actions.ts:24-31`) solo deja pasar textos que contengan "no existe" o "archivado" — el usuario vería el genérico "No se pudo guardar", inútil justo en el caso que el fix busca hacer visible. Cambiá el texto del raise a algo tipo *"Esa persona ya no ocupa este puesto: actualizá la página"* y hacelo matchear.

**Cómo se verifica**: dos navegadores. En A abrí la ficha del puesto X con la persona asignada. En B movela al puesto Y. En A, sin refrescar, apretá "Quitar". Tiene que dar un error legible, y la asignación en Y tiene que **seguir viva**. Hoy se cierra en silencio.

## N6 · Bitácora · *medio*

1. **`.in()` con hasta 1.000 UUIDs**: `resolverPersonas` (`auditoria.ts:279-287`) y `resolverPuestos` (`:245-255`) arman `id=in.(uuid,uuid,…)` sin trocear. En pantalla no pasa nada (lotes de 50), pero la **exportación** va de a 1.000 (`:222`). Cada UUID cuesta 39 bytes en la query string (URLSearchParams percent-encodea las comas): 210 ids ≈ 8,4 KB, 1.000 ids ≈ 39 KB → 414/400 en el gateway. Y el manejo de error **no aborta**: hace `console.error` y devuelve el Map vacío, así que `describir()` cae en los defaults y el CSV sale entero, bien formado, diciendo *"Una persona — Ordenanza"* en cada fila de asignación. Se abre perfecto en Excel y no informa nada.
   Aclaración de alcance: los `positionId` están acotados por la cantidad de puestos (210), no por 1.000 — importar personas no crea puestos. El que revienta es `resolverPersonas`, y solo cuando haya 1.000 eventos de `asignaciones` en un lote, o sea cuando empiece la asignación masiva. Por eso no es bloqueante para el import.
   Nota técnica: el `urlLengthLimit = 8000` de postgrest-js (`PostgrestBuilder`) **no corta nada** — lo miré: solo agrega un hint al mensaje de error cuando el fetch ya falló por timeout o headers overflow. El límite real lo pone el gateway.
   **Arreglo**: trocear en tandas de ~100 y unir los Maps, en las dos funciones. Y que el fallo deje de ser mudo: propagarlo para marcar `completa: false`, o al menos poner "(no se pudo resolver el nombre)" en lugar de "Una persona", que se lee como un dato real.
2. **`reparticiones` no está en `TABLAS_AUDITADAS`** (`auditoria.ts:39-44`) pero **sí tiene trigger** (`0010:57-58`). Los 187 eventos del import van a caer en la rama `default` de `describir()` y aparecer como "insert en reparticiones" con un UUID crudo, sin chip de filtro.
3. **Volumen**: el import suma ~4.958 filas a `audit_logs` (4.771 personas + 187 reparticiones), todas con `actor_id` nulo porque las migraciones se pegan en el SQL Editor. Van a aparecer solo bajo "incluir la ingesta y los scripts", que es lo semánticamente correcto — avisalo para que nadie se asuste. El total (~5.600) queda debajo de `TOPE_EXPORTACION = 10.000`, pero ese techo pasa a ser una fecha de vencimiento, no un número abstracto.

**Cómo se verifica**: cargá 1.100 asignaciones de prueba, entrá a `/auditoria?inicial=1`, descargá el CSV y abrí la columna "Sobre qué". Tiene que traer nombres reales, no "Una persona".

## N7 · Cosmética y prolijidad · *bajo*

- **Separador de miles**: `dashboard/page.tsx:65` renderiza `{valor}` crudo. La tarjeta de Personas va a decir "4771" a 30px, cuando en rioplatense se escribe 4.771. No hay ningún formateador de números en `src/` (solo cuatro `Intl.DateTimeFormat("es-AR")`), así que el proyecto ya respeta es-AR para fechas y no tiene camino para números. Un `numero()` en `src/lib/`, al lado del `hoy()` de `lib/fechas`. `tabular-nums` no lo resuelve: iguala el ancho de los dígitos, no inserta separador. Aplicalo también en `auditoria/page.tsx:129` (`{datos.total} movimientos`), que sí crece con el import; los cuatro `Dato` del resumen **no**, porque filtran `actor_id not null` y la ingesta no tiene sesión.
- **"210 puestos" hardcodeado** en `src/app/api/asistente/route.ts:42,47` y en `asistente.tsx:152,189`, mientras `contexto.ts:114` arma el encabezado con `${filas.length}`. Hoy los dos números coinciden (los 211 `positions` incluyen el `ZZZ PRUEBA TECNICA` archivado, que `contexto.ts:66` filtra), así que la contradicción aparece recién con la primera alta o baja desde el ABM. No lo toca el import. Arreglo: sacar el número de `INSTRUCCIONES` — *"revisá TODOS los puestos del nomenclador, no des una muestra"* — y no interpolarlo, para no invalidar el prefijo cacheado (`cache_control`) en cada alta. De paso unificar el comentario de tokens (`route.ts` dice ~105k, `contexto.ts:9` dice ~61k).
- **`resumenDotacion` se traga el error del count de asignaciones** (`personas.ts:176-182`): `asignadas.error` no se mira nunca y `?? 0` tapa el fallo, así que el dashboard puede decir "N personas / 0 con puesto asignado". La asimetría no es hipotética: `personas_select_director` es un subplan hasheado que se evalúa una vez, mientras `asignaciones_select_director` (`0012:91`) es `persona_en_mis_reparticiones(persona_id)` — SECURITY DEFINER, no inlineable, evaluada **por fila**.
  ⚠️ **No copies la rama de `personas.error`**: `return vacio` pone `personas: 0` y el ternario de `dashboard/page.tsx:184` cae en "Todavía no se cargó dotación" con 4.771 personas cargadas — una mentira más grande que la original. Modelá `conPuesto` como `number | null` y que el dashboard muestre que ese número no se pudo calcular.
- **`/personas` no tiene `loading.tsx`** (`/puestos` sí). Con `next/form`, la UI de carga se prefetchea cuando el form entra en viewport (`form.md:87` y `:230`), así que sin ese archivo el prefetch no tiene qué precargar. Calcalo de `src/app/(app)/puestos/loading.tsx`.

---

# Mapa de colisiones — archivos que tocan dos o más ítems

| Archivo | Ítems | Regla |
|---|---|---|
| `src/features/personas/data/personas.ts` | **B5**, **B6**, N7 (`resumenDotacion`) | Un solo PR. Es el archivo más disputado del plan; tres cambios en paralelo se pisan seguro. |
| `src/app/(app)/personas/page.tsx` | **B5**, **B7** | Juntos: B5 cambia la firma con `searchParams`, B7 cambia `reparticionObligatoria`. |
| `src/features/personas/components/tabla-personas.tsx` | **B5** (paginación, contador, `NoResultsState`, buscador) y el filtro por id de N2 | Se reescribe entero en B5. No lo toques antes. |
| `src/features/personas/components/alta-persona.tsx` | **B7** (sacar "Sin repartición") y **N2** (optgroup/code) | B7 es bloqueante y N2 no: hacé B7 primero y dejá el `<select>` como está, o hacé los dos juntos. No los mandes en paralelo. |
| `src/features/reparticiones/data/reparticiones.ts` | **N1** (conteo por `tipo`), **N2** (inactivas, `activa` y `code` en `ReparticionPlana`, comentarios de niveles) | Una sola pasada: los tres cambian el mismo tipo `ReparticionPlana`. |
| `src/features/personas/actions.ts` | **B6** (acción de búsqueda), **N3** (`editarPersona` + `mensaje()`), **N5** (`desasignarPersona`) | B6 primero, que es bloqueante. N3 y N5 después, juntos: los dos tocan `mensaje()`. |
| `src/app/(app)/puestos/[id]/page.tsx` | **B6** (sacar del `Promise.all`, mover detrás del rol) | Un solo ítem, pero es el consumidor de B3 y B6: se verifica al final de los dos. |
| `supabase/migrations/…0021…` | **B1**, **B2**, **B3**, **B4** | Una migración sola, idempotente, en ese orden interno. Corré `\d personas` y `\d reparticiones` después para confirmar. |

---

# APIs de Next — qué verifiqué y qué no

**Verificado en `node_modules/next/dist/docs/01-app/`, con línea:**

- `searchParams` es una **Promesa** y hay que `await`earla — `03-api-reference/03-file-conventions/page.md:14`, `:67-83`, `:117-119`. Ejemplo de paginación/filtrado con `const { page = '1', query = '' } = await searchParams` en `:165-190`. El repo ya lo hace en `auditoria/page.tsx:53-59`.
- Existe el helper global `PageProps<'/ruta'>` — `page.md:124-129`. **Recomiendo no usarlo**: el precedente del repo escribe el tipo a mano y conviene la consistencia.
- `params` es una Promesa — `page.md`, y `form.md:374`. Ya está bien en `puestos/[id]/page.tsx:89-90` y en `reparticiones/[id]/editar/page.tsx`.
- `next/form` con `action=""` navega a la **misma ruta** actualizando los search params, con navegación cliente, prefetch y funcionando sin JS — `03-api-reference/02-components/form.md:86-88`, `:113`, `:131`, `:202`. El entrypoint existe: `node_modules/next/form.js`.
- `<Form>` prefetchea el `loading.js` de la ruta destino — `form.md:87`, `:230`.
- `useFormStatus` de `react-dom` para el estado "Buscando…" — `form.md:244-258`.
- `revalidatePath(path, type?: 'page' | 'layout')`, y `type` es **obligatorio** si el path tiene segmento dinámico — `03-api-reference/04-functions/revalidatePath.md:22-26`. O sea `revalidatePath("/puestos/[id]", "page")` es correcto y `revalidatePath("/puestos/[id]")` no.
- `redirect()` **lanza**, así que todo `revalidatePath` va antes — `02-guides/server-actions.md`.
- Server Actions: *"the route is reachable to anyone who can send the same POST. Treat every action as an untrusted entry point"* (`server-actions.md:78`), *"Render-time gating (...) is not a security boundary"* (`:89`), y pide *"a loud failure when those checks miss"* (`:95`). Esto justifica N3 punto 2 y B6 punto 3.
- La convención `proxy` (no `middleware`) — confirmada en `src/proxy.ts`, que ya la usa correctamente. Ningún ítem de este plan la toca.

**NO verificado — decilo antes de escribir código:**

- **Route Handlers como alternativa a la Server Action de B6.** `03-api-reference/03-file-conventions/route.md` existe pero **no lo leí**. Si vas por un `GET /api/personas/buscar` en vez de la Server Action, leelo primero: no afirmo su firma en Next 16.
- **Que un `<Form action="">` GET pierda los search params que no son campos suyos.** Lo deduje de la semántica de los formularios HTML, no de una afirmación de `form.md`. Es la razón de los `<input type="hidden">`. Comprobalo en el navegador antes de darlo por hecho: buscá con un filtro de repartición puesto y mirá si sobrevive en la URL.
- **`Settings → API → Max rows` en el proyecto hosted.** No es verificable desde el repo; `supabase/config.toml:18` es la config local. Si el hosted está en otro valor, todo el Paso 0 sigue sirviendo, pero los números cambian.
- **Inmutabilidad de `lower()` y `translate()` para la columna generada de B2, y disponibilidad de `unaccent` en el proyecto.** Es Postgres, no Next. Si Postgres rechaza la generated column, el error al pegar la migración va a ser explícito — no hay forma silenciosa de que salga mal. `unaccent` no aparece en ninguna de las 20 migraciones (solo `pgcrypto` y `pg_trgm`), por eso el plan usa `translate`.
- **El nombre real del constraint FK de `personas.reparticion_id`** para B9. Consultá `pg_constraint` antes de dropearlo; asumí el auto-nombre de Postgres.

---

# Decisiones que no son código y hay que tomar antes de B8

1. **Legajo**: formato canónico (¿con ceros a la izquierda?). Es `unique` y hoy no se puede editar desde la app. Una sola oportunidad.
2. **`full_name`**: ¿se deja como viene de sueldos (probablemente MAYÚSCULAS) o se aplica `initcap`? No afecta la búsqueda (B2 la normaliza) pero sí toda la pantalla.
3. **Las 62 unidades actuales**: ¿las 187 las reemplazan por `external_id`, o conviven? Si conviven, hay que asignarles `tipo` a mano o B9 no sella.
4. **Alcance del director con 4 niveles** (N4 punto 2): ¿el director de una dirección ve a sus subdirecciones? Definilo con Capital Humano antes de asignar los alcances de las cuentas.
5. **`personas.area`**: la columna de texto libre sigue existiendo (0008:25) y está muerta en la app. Recomendación: **no escribirla nunca como sustituto de `reparticion_id`** — si la importación llenara `area` y no `reparticion_id`, todos los directores verían 0 personas. Si querés trazabilidad del texto crudo de sueldos, guardalo en staging, no en `personas`.
6. **Qué se recorta del CSV antes de subirlo** (B4). Legajo, nombre, repartición. Nada más.