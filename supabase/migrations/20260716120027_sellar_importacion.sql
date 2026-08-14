-- =============================================================================
-- Capital humanIA — 0027 · Sellar lo que la importación dejó consistente
--
-- Va DESPUÉS de la carga: mientras se estaba poblando, las columnas no podían ser
-- `not null`. Ahora las 188 reparticiones tienen `tipo` y las 4.706 personas
-- tienen repartición, así que se cierra la puerta para que no se vuelva a abrir.
--
-- QUÉ CIERRA, y por qué importa cada una:
--
-- 1. `personas.reparticion_id not null`. Una persona con repartición nula no la ve
--    NINGÚN director ni secretario —`reparticion_id in (select …)` con null da
--    NULL, no true— y solo aparece para el admin, sin ningún error. La app ya lo
--    exige desde el commit cb1d2f8, pero eso es la app: cualquier script, RPC o
--    consulta suelta podía dejar un nulo. Ahora lo rechaza la base.
--
-- 2. `reparticiones.tipo not null`. Sin el tipo, el conteo del organigrama vuelve
--    a caer en la heurística de la forma del árbol, que con cuatro escalones
--    cruza categorías (ver la 0025).
--
-- 3. La FK de `personas.reparticion_id` pasa de `on delete set null` a
--    `on delete restrict`. Esto es lo menos obvio y lo más importante: con `set
--    null`, borrar una repartición convertía en silencio a toda su gente en
--    personas huérfanas e invisibles. Con 4.706 cargadas, borrar una dirección
--    podía desaparecer a 200 personas de la vista de todos. `restrict` es lo que
--    ya usa `solicitudes` (0013).
--
--    Ojo: y como `reparticion_id` ahora es `not null`, `set null` ni siquiera
--    podría ejecutarse — el borrado fallaría con un error de not-null en vez de
--    uno de FK, que es mucho menos claro.
--
-- CÓMO SE VERIFICA (correr después, tienen que fallar las dos):
--   insert into public.personas (legajo, full_name) values ('X','Y');
--     -> error de not-null en reparticion_id
--   delete from public.reparticiones where code = 'DIR36';
--     -> error de FK, no un borrado silencioso con 3 personas huérfanas
--   Si alguna NO falla, la migración no se aplicó.
--
-- Idempotente.
-- =============================================================================

-- --- 1 y 2. Sellar las columnas ----------------------------------------------
alter table public.reparticiones alter column tipo           set not null;
alter table public.personas      alter column reparticion_id set not null;

comment on column public.personas.reparticion_id is
  'Dónde presta servicios. NOT NULL desde la 0027: un nulo la volvía invisible '
  'para todo director y secretario, sin ningún error.';

-- --- 3. La FK, con el nombre que realmente tenga -------------------------------
-- Se descubre en vez de asumirlo: si el nombre no fuera el esperado, un
-- `drop constraint if exists` no haría nada y el `add` de abajo fallaría por
-- duplicado o dejaría dos constraints sobre la misma columna.
do $$
declare
  v_nombre text;
begin
  select con.conname
    into v_nombre
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid
     and att.attnum   = con.conkey[1]
   where con.conrelid = 'public.personas'::regclass
     and con.contype  = 'f'
     and att.attname  = 'reparticion_id'
   limit 1;

  if v_nombre is not null then
    execute format('alter table public.personas drop constraint %I', v_nombre);
    raise notice 'FK anterior eliminada: %', v_nombre;
  end if;
end $$;

alter table public.personas
  add constraint personas_reparticion_id_fkey
  foreign key (reparticion_id)
  references public.reparticiones (id)
  on delete restrict;
