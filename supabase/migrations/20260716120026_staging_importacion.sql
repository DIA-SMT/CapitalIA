-- =============================================================================
-- Capital humanIA — 0026 · Tablas de staging para la importación
--
-- POR QUÉ: pegar 4.771 `insert` a mano en el SQL Editor no es viable, pero eso
-- no es lo importante. Lo importante es que **la parte difícil no es insertar,
-- es conciliar**: qué enganchó, qué no, y qué se va a crear. Con staging eso es
-- una consulta que se puede mirar antes de tocar nada. Sin staging es fe.
--
-- Y es lo que hace REVERSIBLE la carga: el proyecto está en el plan gratuito de
-- Supabase, así que no hay Point-in-Time Recovery. La red de seguridad es
-- saber exactamente qué filas entraron y de dónde salió cada una.
--
-- ALCANCE MÍNIMO, NO NEGOCIABLE. El sistema de sueldos tiene DNI, CUIL,
-- domicilio, categoría y haberes. Nada de eso entra acá, ni "por un rato".
-- Se recorta en el origen: la consulta contra GRH devuelve solo estas columnas,
-- así el CSV no puede traer de más aunque alguien se distraiga. La cabecera de
-- la 0008 es explícita sobre qué guarda este sistema, y una tabla de staging es
-- una tabla.
--
-- Estas tablas son transitorias: se llenan, se concilia, se importa y se
-- vacían. No son parte del modelo.
--
-- Idempotente.
-- =============================================================================

create table if not exists public.stg_reparticiones (
  -- IDORGANIZA en el sistema de sueldos. Es la clave de upsert contra
  -- `reparticiones.external_id`: por eso es la PK acá.
  external_id        text primary key,
  code               text not null,
  nombre             text not null,
  parent_external_id text,
  tipo               text not null,
  /** Por qué esta fila no se pudo mapear. Null = lista para importar. */
  error_mapeo        text,
  cargado_en         timestamptz not null default now(),
  constraint chk_stg_rep_tipo
    check (tipo in ('secretaria', 'subsecretaria', 'direccion', 'subdireccion'))
);

create table if not exists public.stg_personas (
  -- Número de legajo, sin ceros a la izquierda. Es la identidad estable de la
  -- persona y la clave de upsert contra `personas.legajo`.
  legajo                  text primary key,
  -- Como viene de sueldos: "APELLIDO NOMBRE", en MAYÚSCULAS y en un solo campo.
  -- No se parte en apellido/nombre: con apellidos compuestos sería adivinar.
  full_name               text not null,
  reparticion_external_id text,
  error_mapeo             text,
  cargado_en              timestamptz not null default now()
);

comment on table public.stg_reparticiones is
  'Antesala de la importación del organigrama. Transitoria: se llena, se '
  'concilia, se importa y se vacía.';
comment on table public.stg_personas is
  'Antesala de la importación del padrón. Alcance mínimo: legajo, nombre y '
  'repartición. Sin DNI, CUIL, domicilio ni haberes — se recortan en el origen.';

-- RLS prendida y SIN políticas: nadie las alcanza desde la API, ni siquiera un
-- admin logueado. Solo el SQL Editor, que corre como `postgres` y saltea RLS.
-- Es a propósito: mientras están cargadas, estas tablas tienen el padrón entero
-- sin ninguna de las restricciones por repartición que protegen a `personas`.
alter table public.stg_reparticiones enable row level security;
alter table public.stg_personas      enable row level security;

revoke all on public.stg_reparticiones from anon, authenticated;
revoke all on public.stg_personas      from anon, authenticated;


-- =============================================================================
-- Conciliación — las consultas para mirar ANTES de importar (B8)
-- =============================================================================
--
-- 1. ¿Qué reparticiones se crearían y cuáles enganchan con una existente?
--
--    select case when r.id is null then 'SE CREA' else 'engancha' end as accion,
--           s.tipo, count(*)
--      from public.stg_reparticiones s
--      left join public.reparticiones r on r.external_id = s.external_id
--     group by 1, 2 order by 1, 2;
--
-- 2. ¿Alguna repartición apunta a un padre que no existe ni en staging ni
--    cargado? Esas quedarían colgando de la raíz.
--
--    select s.external_id, s.nombre
--      from public.stg_reparticiones s
--     where s.parent_external_id is not null
--       and not exists (select 1 from public.stg_reparticiones p
--                        where p.external_id = s.parent_external_id)
--       and not exists (select 1 from public.reparticiones r
--                        where r.external_id = s.parent_external_id);
--
-- 3. ¿Cuánta gente quedaría sin repartición? TIENE QUE DAR 0. Una persona con
--    repartición nula no la ve ningún director ni secretario (ver 0012 y B7).
--
--    select count(*) from public.stg_personas p
--     where p.reparticion_external_id is null
--        or not exists (select 1 from public.reparticiones r
--                        where r.external_id = p.reparticion_external_id);
--
-- 4. Reparto final por unidad, para contrastar contra la liquidación:
--
--    select coalesce(r.nombre, '*** SIN REPARTICIÓN ***') as unidad, count(*)
--      from public.stg_personas p
--      left join public.reparticiones r on r.external_id = p.reparticion_external_id
--     group by 1 order by 2 desc;
--
-- 5. Filas marcadas con problema por el script de mapeo:
--
--    select error_mapeo, count(*) from public.stg_personas
--     where error_mapeo is not null group by 1;
-- =============================================================================
