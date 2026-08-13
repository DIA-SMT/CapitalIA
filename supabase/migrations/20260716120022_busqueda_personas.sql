-- =============================================================================
-- Capital humanIA — 0022 · Búsqueda de personas del lado del servidor
--
-- POR QUÉ: hoy `/personas` trae TODAS las personas y filtra en el navegador
-- (`tabla-personas.tsx`). Con 4.771 eso no se sostiene: PostgREST corta en 1.000
-- filas y devuelve HTTP 200 sin error, así que la pantalla mostraría el primer
-- tramo alfabético y la búsqueda contestaría "Sin coincidencias" para cualquiera
-- que quedara afuera. Se ve bien y miente.
--
-- Al mover la búsqueda al servidor aparece una regresión sutil: `ilike` pliega
-- mayúsculas pero NO acentos, así que "gomez" dejaría de encontrar a "Gómez".
-- En Tucumán eso es buena parte del padrón, y falla con la misma cara que el bug
-- que estamos arreglando. Por eso la columna normalizada va ANTES que el cambio
-- en la app, no después.
--
-- Se normaliza de los dos lados: la columna guarda el texto sin tildes ni
-- mayúsculas, y el término que manda la app pasa por la misma transformación.
--
-- `translate` y `lower` son IMMUTABLE, así que sirven dentro de una columna
-- generada. `unaccent()` no: es STABLE y necesitaría un wrapper aparte.
--
-- Idempotente.
-- =============================================================================

alter table public.personas
  add column if not exists busqueda text
  generated always as (
    lower(translate(
      coalesce(full_name, '') || ' ' ||
      coalesce(legajo, '')    || ' ' ||
      coalesce(email, ''),
      'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
      'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
    ))
  ) stored;

comment on column public.personas.busqueda is
  'Nombre, legajo y email juntos, en minúscula y sin tildes. La app busca acá y '
  'normaliza el término igual antes de mandarlo. No se escribe a mano: es generada.';

-- Trigram: hace que `ilike '%texto%'` no tenga que recorrer la tabla entera.
-- pg_trgm ya está habilitado desde la 0001.
create index if not exists idx_personas_busqueda_trgm
  on public.personas using gin (busqueda gin_trgm_ops);
