-- =============================================================================
-- Capital humanIA — 0023 · `busqueda` normaliza igual que la app
--
-- POR QUÉ: la 0022 sacaba tildes con una lista fija de 48 caracteres
-- precompuestos, y la app (`normalizarBusqueda`, personas.ts) con NFD + borrado
-- de combining marks. No es lo mismo, y el comentario de personas.ts afirmaba
-- que sí. Dos agujeros, los dos con la misma cara:
--
--   · Un diacrítico fuera del set español (č, ć, š, ž, ā…) queda inencontrable
--     AUN tipeando el nombre exacto: el JS se lo saca al término y la columna no
--     se lo sacó al dato, así que no matchean por ninguna de las dos vías.
--   · Si el padrón llega descompuesto (NFD, típico de un export de macOS o de
--     casi cualquier ETL), `translate()` no toca nada y se cae la búsqueda del
--     padrón ENTERO. Esto importa ahora: la importación de las 4.771 personas
--     desde el sistema de sueldos es el próximo paso.
--
-- Los dos síntomas son "Sin coincidencias" sobre gente que existe — exactamente
-- lo que la 0022 vino a evitar.
--
-- Ahora los dos lados hacen la MISMA operación en vez de mantener dos listas
-- sincronizadas a mano: NFD, borrar U+0300–U+036F, minúsculas. `normalize()` es
-- IMMUTABLE desde PG13 (acá corre PG17), así que sirve en una columna generada.
--
-- Recrear la columna reescribe la tabla y el índice. Con el volumen de hoy es
-- inmediato, y tiene que pasar ANTES de importar el padrón.
--
-- Idempotente.
-- =============================================================================

drop index if exists public.idx_personas_busqueda_trgm;
alter table public.personas drop column if exists busqueda;

alter table public.personas
  add column busqueda text
  generated always as (
    lower(regexp_replace(
      normalize(
        coalesce(full_name, '') || ' ' ||
        coalesce(legajo, '')    || ' ' ||
        coalesce(email, ''),
        nfd
      ),
      -- El mismo rango de combining marks que borra `normalizarBusqueda()`.
      '[̀-ͯ]', '', 'g'
    ))
  ) stored;

comment on column public.personas.busqueda is
  'Nombre, legajo y email juntos, en NFD sin combining marks y en minúscula. La '
  'app normaliza el término con la misma operación (normalizarBusqueda). Si los '
  'dos lados se desincronizan, buscar "Gómez" deja de encontrar a Gómez.';

create index if not exists idx_personas_busqueda_trgm
  on public.personas using gin (busqueda gin_trgm_ops);
