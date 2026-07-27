-- =============================================================================
-- Capital humanIA — 0016 · Subsecretarías: el organigrama a tres niveles
--
-- La carga inicial (0011) se quedó en dos niveles (secretaría → dirección) y dejó
-- las subsecretarías afuera porque en la fuente venían con el mail pegado al
-- nombre. Esto las incorpora y recuelga las direcciones donde corresponde:
--
--     Secretaría → Subsecretaría → Dirección
--
-- FUENTE: pestaña "Hoja1" del POA 2026, que es el directorio organizativo
-- (secretaría / subsecretaría / dirección / responsable / mail). Se revisaron
-- además las 8 pestañas por secretaría (SGral, SGob, SITec, SIMun, ContGral,
-- SATCiu, SAyDS, ServPub): son planillas de planificación (proyectos, metas,
-- indicadores), NO tienen columna de subsecretaría y su numeración DIRxx es local
-- de cada hoja, así que no sirven como referencia organizativa. Detalle de las
-- diferencias encontradas al pie.
--
-- No se borra ni se renombra nada: solo se agregan las 7 subsecretarías y se
-- cambia el parent_id de las 40 direcciones que dependen de ellas. Las otras 13
-- siguen colgando directo de su secretaría, que es lo que dice la fuente.
--
-- Idempotente.
-- =============================================================================

-- --- 1. Las 7 subsecretarías --------------------------------------------------
insert into public.reparticiones (code, nombre, parent_id)
select s.code, s.nombre, p.id
from (values
  ('SUB01', 'Subsecretaría de Desarrollo Humano',                  'SEC01'),
  ('SUB02', 'Subsecretaría de Gestión Estratégica y Documentación','SEC01'),
  ('SUB03', 'Subsecretaría de Cultura',                            'SEC01'),
  ('SUB04', 'Subsecretaría de Prensa y Comunicación Institucional','SEC01'),
  ('SUB05', 'Subsecretaría de Seguridad Ciudadana',                'SEC02'),
  ('SUB06', 'Subsecretaría de Gobierno',                           'SEC02'),
  ('SUB07', 'Subsecretaría de Servicios Públicos',                 'SEC08')
) as s(code, nombre, parent_code)
join public.reparticiones p on p.code = s.parent_code
on conflict (code) do nothing;

-- --- 2. Recolgar las direcciones bajo su subsecretaría ------------------------
-- 40 de las 53. Las 13 restantes (SEC03, SEC04, SEC06, SEC07 y SEC09) no tienen
-- subsecretaría en la fuente y quedan como están.
update public.reparticiones d
   set parent_id = sub.id
  from (values
    -- Subsecretaría de Desarrollo Humano
    ('DIR01', 'SUB01'), ('DIR02', 'SUB01'), ('DIR03', 'SUB01'), ('DIR04', 'SUB01'),
    ('DIR05', 'SUB01'), ('DIR06', 'SUB01'), ('DIR07', 'SUB01'), ('DIR08', 'SUB01'),
    ('DIR09', 'SUB01'),
    -- Subsecretaría de Gestión Estratégica y Documentación
    ('DIR10', 'SUB02'), ('DIR11', 'SUB02'), ('DIR12', 'SUB02'), ('DIR13', 'SUB02'),
    ('DIR14', 'SUB02'), ('DIR15', 'SUB02'),
    -- Subsecretaría de Cultura
    ('DIR16', 'SUB03'), ('DIR17', 'SUB03'), ('DIR18', 'SUB03'), ('DIR19', 'SUB03'),
    ('DIR20', 'SUB03'), ('DIR21', 'SUB03'), ('DIR22', 'SUB03'),
    -- Subsecretaría de Prensa y Comunicación Institucional
    ('DIR23', 'SUB04'), ('DIR24', 'SUB04'), ('DIR25', 'SUB04'), ('DIR26', 'SUB04'),
    ('DIR27', 'SUB04'), ('DIR28', 'SUB04'),
    -- Subsecretaría de Seguridad Ciudadana
    ('DIR29', 'SUB05'), ('DIR30', 'SUB05'), ('DIR31', 'SUB05'),
    -- Subsecretaría de Gobierno
    ('DIR32', 'SUB06'), ('DIR33', 'SUB06'), ('DIR34', 'SUB06'), ('DIR35', 'SUB06'),
    -- Subsecretaría de Servicios Públicos
    ('DIR47', 'SUB07'), ('DIR48', 'SUB07'), ('DIR49', 'SUB07'), ('DIR50', 'SUB07'),
    ('DIR51', 'SUB07')
  ) as m(dir_code, sub_code)
  join public.reparticiones sub on sub.code = m.sub_code
 where d.code = m.dir_code
   and d.parent_id is distinct from sub.id;

-- =============================================================================
-- Diferencias encontradas entre la hoja resumen y las pestañas por secretaría.
-- Se resolvieron a favor de "Hoja1" (el directorio organizativo). Quedan acá
-- anotadas para que Capital Humano las confirme:
--
-- 1. PATRULLA DE PROTECCIÓN CIUDADANA (PPC): figura en Hoja1 bajo la Subsecretaría
--    de Seguridad Ciudadana, pero NO aparece en la pestaña "SGob". Se conserva.
--
-- 2. DIRECCIÓN DE VÍA PÚBLICA: Hoja1 la ubica en la Secretaría de Ordenamiento y
--    Convivencia (SEC09); la pestaña "SGob" la lista dentro de Gobierno. Se
--    mantiene en SEC09. ES LA ÚNICA CONTRADICCIÓN REAL DE UBICACIÓN.
--
-- 3. CONTADURÍA GENERAL (SEC05) NO TIENE DIRECCIONES, y está bien así: la fila
--    "DIR41" de Hoja1 viene con el nombre vacío (es la propia Contaduría con su
--    responsable), y la pestaña "ContGral" no lista ninguna dirección. No es un
--    dato que falte cargar.
--
-- 4. Los códigos DIRxx de las pestañas por secretaría NO coinciden con los de
--    Hoja1: a partir de "SATCiu" se corren en uno porque esas hojas no le asignan
--    código a Contaduría. Los códigos cargados son los de Hoja1.
--
-- 5. No hay pestaña propia para la Secretaría de Ordenamiento y Convivencia
--    (SEC09); sus tres direcciones solo figuran en Hoja1.
-- =============================================================================
