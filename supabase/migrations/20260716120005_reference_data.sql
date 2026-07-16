-- =============================================================================
-- Capital humanIA — 0005 · Datos de referencia (catálogos base)
-- Datos estructurales necesarios en cualquier entorno (no son demo).
-- Idempotente: re-ejecutable sin duplicar (ON CONFLICT DO NOTHING).
-- =============================================================================

-- --- Agrupamientos ------------------------------------------------------------
insert into public.groupings (code, name, sort_order) values
  ('SG',  'Servicios Generales',        1),
  ('MP',  'Mantenimiento y Producción', 2),
  ('ADM', 'Administrativo',             3),
  ('TEC', 'Técnico',                    4),
  ('PRO', 'Profesional',                5)
on conflict (code) do nothing;

-- --- Niveles por agrupamiento -------------------------------------------------
-- Servicios Generales: I, II, III
insert into public.levels (grouping_id, code, sort_order)
select g.id, v.code, v.sort_order
from public.groupings g
cross join (values ('I', 1), ('II', 2), ('III', 3)) as v(code, sort_order)
where g.code = 'SG'
on conflict (grouping_id, code) do nothing;

-- Mantenimiento y Producción: I, II, III
insert into public.levels (grouping_id, code, sort_order)
select g.id, v.code, v.sort_order
from public.groupings g
cross join (values ('I', 1), ('II', 2), ('III', 3)) as v(code, sort_order)
where g.code = 'MP'
on conflict (grouping_id, code) do nothing;

-- Administrativo: I..VI
insert into public.levels (grouping_id, code, sort_order)
select g.id, v.code, v.sort_order
from public.groupings g
cross join (values
  ('I', 1), ('II', 2), ('III', 3), ('IV', 4), ('V', 5), ('VI', 6)
) as v(code, sort_order)
where g.code = 'ADM'
on conflict (grouping_id, code) do nothing;

-- Profesional: I, II, III
insert into public.levels (grouping_id, code, sort_order)
select g.id, v.code, v.sort_order
from public.groupings g
cross join (values ('I', 1), ('II', 2), ('III', 3)) as v(code, sort_order)
where g.code = 'PRO'
on conflict (grouping_id, code) do nothing;

-- (Técnico usa áreas técnicas en lugar de niveles numéricos.)

-- --- Áreas técnicas (iniciales, editables desde la aplicación) ----------------
insert into public.technical_areas (code, name, description) values
  ('CON', 'Construcción', 'Área técnica inicial (editable).'),
  ('ELE', 'Electricidad', 'Área técnica inicial (editable).'),
  ('MEC', 'Mecánica',     'Área técnica inicial (editable).'),
  ('INF', 'Informática',  'Área técnica inicial (editable).')
on conflict (code) do nothing;

-- --- Niveles de riesgo --------------------------------------------------------
insert into public.risk_levels (code, name, sort_order) values
  ('BAJO',  'Bajo',    1),
  ('MEDIO', 'Medio',   2),
  ('ALTO',  'Alto',    3),
  ('CRIT',  'Crítico', 4)
on conflict (code) do nothing;

-- --- Catálogos iniciales (starter) -------------------------------------------
-- Conjunto mínimo y transversal para arrancar. Se curará/ampliará durante la
-- ingesta de las fichas (Etapa 3). No pretende ser exhaustivo.

insert into public.competencies (code, name, category) values
  ('COM', 'Comunicación',            'transversal'),
  ('TEQ', 'Trabajo en equipo',       'transversal'),
  ('RES', 'Responsabilidad',         'transversal'),
  ('ORS', 'Orientación al servicio', 'transversal'),
  ('ADP', 'Adaptabilidad',           'transversal')
on conflict (code) do nothing;

insert into public.risks (code, name, category) values
  ('CAI', 'Caídas / trabajo en altura',      'general'),
  ('CAR', 'Manipulación manual de cargas',   'general'),
  ('RUI', 'Exposición a ruido',              'general'),
  ('RELE', 'Riesgo eléctrico',               'general'),
  ('QUI', 'Exposición a agentes químicos',   'general')
on conflict (code) do nothing;

insert into public.knowledge_items (code, name, category) values
  ('OFI', 'Herramientas informáticas de oficina', 'general'),
  ('NOR', 'Normativa municipal aplicable',        'general')
on conflict (code) do nothing;

insert into public.responsibilities (code, name) values
  ('ATP', 'Atención al público'),
  ('CUS', 'Custodia de bienes y herramientas'),
  ('SUP', 'Supervisión de tareas')
on conflict (code) do nothing;

-- --- Documentos fuente (los dos PDF históricos) -------------------------------
insert into public.source_documents (code, title, kind) values
  ('NOM-P1', 'Nomenclador de Puestos — Parte 1', 'pdf_escaneado'),
  ('NOM-P2', 'Nomenclador de Puestos — Parte 2', 'pdf_escaneado')
on conflict (code) do nothing;
