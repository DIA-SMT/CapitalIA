-- =============================================================================
-- Capital humanIA — 0006 · Ajustes para la ingesta del nomenclador
--
-- Correcciones detectadas al extraer las 210 fichas de los dos PDF de 2016.
-- Detalle, números y evidencia en data/nomenclador/README.md §8.
--
-- Criterio: aditiva y reversible. No se cambia ninguna decisión de diseño del
-- esquema original; solo se corrigen datos de referencia que no coincidían con
-- el documento y se agregan columnas que faltaban.
-- =============================================================================

-- --- 1. Áreas técnicas --------------------------------------------------------
-- El seed cargó Construcción / Electricidad / Mecánica / Informática. Contra las
-- 83 fichas del agrupamiento Técnico, tres de esas cuatro no existen: las áreas
-- reales son Salud, Construcción, Formación e Información, y Control.
-- Se borran las inexistentes (ninguna versión las referencia todavía) en lugar
-- de desactivarlas: no son áreas viejas, son datos equivocados.

delete from public.technical_areas where code in ('ELE', 'MEC', 'INF');

update public.technical_areas
   set name        = 'De la Construcción',
       description = 'Área técnica del nomenclador 2016.'
 where code = 'CON';

insert into public.technical_areas (code, name, description) values
  ('SAL', 'De la Salud',                   'Área técnica del nomenclador 2016.'),
  ('FOR', 'De la Formación e Información', 'Área técnica del nomenclador 2016.'),
  ('CTL', 'Del Control',                   'Área técnica del nomenclador 2016.')
on conflict (code) do nothing;

comment on table public.technical_areas is
  'Áreas del agrupamiento Técnico. Las cuatro del nomenclador 2016. La ficha '
  'rotula el área con nombre completo ("DE LA SALUD"); el code es interno.';

-- --- 2. Niveles de riesgo -----------------------------------------------------
-- El campo "Nivel de Riesgo" de la ficha se escribe de 13 formas distintas que
-- canonizan a 10 valores. Tres problemas mezclados:
--   a) hay RANGOS ("Moderado a Alto") — 45 fichas
--   b) hay SINÓNIMOS (medio/moderado, escaso/bajo, severo/alto)
--   c) el mismo rango aparece de tres formas: "bajo a moderado" (20 fichas),
--      "de bajo a moderado" (2) y "moderado a bajo" (1)
--
-- Se cargan los valores observados tal como aparecen, incluidos los rangos.
-- Modelar el rango como min/max sería más correcto, pero implica reemplazar
-- position_versions.risk_level_id: es un cambio de diseño que excede la ingesta
-- y conviene decidir aparte. Mientras tanto risk_level_raw (punto 4) preserva
-- el literal impreso, así que nada se pierde y la decisión sigue abierta.
--
-- 'Crítico' no aparece ni una vez en las 210 fichas. No se borra —puede hacer
-- falta al actualizar el nomenclador— pero se desactiva para que no aparezca en
-- los selectores.

update public.risk_levels set is_active = false where code = 'CRIT';

insert into public.risk_levels (code, name, sort_order) values
  ('ESCASO',   'Escaso',           1),
  ('BAJO_MOD', 'Bajo a Moderado',  3),
  ('MODERADO', 'Moderado',         5),
  ('MOD_ALTO', 'Moderado a Alto',  6),
  ('SEVERO',   'Severo',           8)
on conflict (code) do nothing;

-- Reordenar los preexistentes dentro de la escala completa.
update public.risk_levels set sort_order = 2 where code = 'BAJO';
update public.risk_levels set sort_order = 4 where code = 'MEDIO';
update public.risk_levels set sort_order = 7 where code = 'ALTO';
update public.risk_levels set sort_order = 9 where code = 'CRIT';

comment on table public.risk_levels is
  'Nivel de riesgo global. Incluye rangos ("Bajo a Moderado") porque la ficha '
  'los usa en 45 de 210 casos. El literal impreso se guarda en '
  'position_versions.risk_level_raw.';

-- --- 3. Texto literal en las tablas puente ------------------------------------
-- Las puentes vinculan la versión con una entrada canónica del catálogo, pero no
-- guardaban cómo estaba escrito el ítem en la ficha. Al canonizar se pierden 32
-- variantes en competencias y 50 en riesgos ("Caídas a nivel y desnivel" /
-- "Caídas de nivel y desnivel" / "Caídas a nivel" / "Caídas" son la misma
-- entrada). Eso contradice el principio 3 de database.md (procedencia).
--
-- raw_text guarda el literal impreso; el FK sigue apuntando al canónico. Así se
-- puede filtrar y comparar por catálogo sin perder fidelidad con la fuente.

alter table public.position_version_competencies
  add column if not exists raw_text text;
alter table public.position_version_risks
  add column if not exists raw_text text;
alter table public.position_version_responsibilities
  add column if not exists raw_text text;
alter table public.position_version_knowledge
  add column if not exists raw_text text;

comment on column public.position_version_competencies.raw_text is
  'Literal como figura impreso en la ficha, antes de canonizar. Preserva la '
  'procedencia: el FK apunta a la entrada canónica del catálogo.';
comment on column public.position_version_risks.raw_text is
  'Literal como figura impreso en la ficha, antes de canonizar.';
comment on column public.position_version_responsibilities.raw_text is
  'Literal como figura impreso en la ficha, antes de canonizar.';
comment on column public.position_version_knowledge.raw_text is
  'Literal como figura impreso en la ficha, antes de canonizar.';

-- --- 4. Campos de la ficha que no tenían columna ------------------------------
-- "Antigüedad y Experiencia" aparece impreso dentro de Requisitos Intelectuales
-- en 10 fichas de 3 agrupamientos (ej. "3 años como Jefe de Sección.").
alter table public.position_versions
  add column if not exists minimum_experience text;

comment on column public.position_versions.minimum_experience is
  'Sub-campo "Antigüedad y Experiencia" de Requisitos Intelectuales. Presente '
  'en 10 fichas del nomenclador 2016.';

-- Literal impreso del nivel de riesgo (ver punto 2).
alter table public.position_versions
  add column if not exists risk_level_raw text;

comment on column public.position_versions.risk_level_raw is
  'Nivel de riesgo tal como está impreso ("Moderado a Alto.", "Bajo a moderado."). '
  'risk_level_id guarda el canónico; acá queda la fidelidad con la fuente.';

-- --- 5. Páginas de los documentos fuente --------------------------------------
update public.source_documents
   set total_pages = 171,
       description = 'PDF escaneado sin capa de texto. 139 fichas, páginas '
                     'impresas 29 a 189. Impreso en septiembre de 2016.'
 where code = 'NOM-P1';

update public.source_documents
   set total_pages = 87,
       description = 'PDF escaneado sin capa de texto. 71 fichas, páginas '
                     'impresas 190 a 266, incluido el anexo final. Continúa la '
                     'parte 1 sin corte de numeración.'
 where code = 'NOM-P2';

-- =============================================================================
-- Los catálogos de competencias (64), riesgos (90), responsabilidades (90) y el
-- reemplazo de knowledge_items NO van acá: se derivan de las fichas extraídas y
-- los puebla el script de ingesta. Ver data/nomenclador/README.md §8 puntos 4 y 5.
-- =============================================================================
