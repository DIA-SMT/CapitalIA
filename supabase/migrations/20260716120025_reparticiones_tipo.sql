-- =============================================================================
-- Capital humanIA — 0025 · `reparticiones.tipo`
--
-- POR QUÉ: hoy el tipo de unidad no es un dato, es una deducción de la forma del
-- árbol —raíz = secretaría, con dependientes = subsecretaría, sin dependientes =
-- dirección— (`reparticiones.ts`, `resumenOrganigrama`). El propio comentario de
-- esa función ya avisaba que si el tipo llegaba a importar de verdad,
-- correspondía una columna.
--
-- Llegó. El organigrama del sistema de sueldos tiene CUATRO niveles: 13
-- secretarías, 33 subsecretarías, 81 direcciones y 60 subdirecciones. Con eso la
-- heurística cruza categorías por construcción: una dirección con subdirecciones
-- a cargo pasa a contarse como subsecretaría, y las subdirecciones como
-- direcciones. Las tarjetas del dashboard quedan mal Y la suma igual cierra, que
-- es la peor forma de estar mal.
--
-- Además el tipo viene EXPLÍCITO en el origen y en ningún otro lado. Si la
-- columna no existe el día de la importación, ese dato se pierde y después hay
-- que re-deducirlo de una fuente que quizá ya no esté a mano.
--
-- Queda NULLABLE a propósito: se puebla en la importación y se sella después
-- (B9). Ponerlo NOT NULL ahora obligaría a que la carga acierte a la primera.
--
-- Idempotente.
-- =============================================================================

alter table public.reparticiones add column if not exists tipo text;

alter table public.reparticiones drop constraint if exists chk_reparticiones_tipo;
alter table public.reparticiones add constraint chk_reparticiones_tipo
  check (tipo is null or tipo in ('secretaria', 'subsecretaria', 'direccion', 'subdireccion'));

comment on column public.reparticiones.tipo is
  'Qué es la unidad según el organigrama de origen. Se carga con el dato, NO se '
  'deduce de la forma del árbol: una dirección con subdirecciones a cargo sigue '
  'siendo una dirección.';

-- Backfill de las que ya están. El prefijo del `code` las clasifica sin
-- ambigüedad (9 SEC + 7 SUB + 53 DIR = 69), y da exactamente los mismos números
-- que venía informando la heurística: si después de correr esto el dashboard
-- cambia algún total, es que algo salió mal.
update public.reparticiones set tipo = 'secretaria'    where tipo is null and code like 'SEC%';
update public.reparticiones set tipo = 'subsecretaria' where tipo is null and code like 'SUB%';
update public.reparticiones set tipo = 'direccion'     where tipo is null and code like 'DIR%';
