-- =============================================================================
-- Capital humanIA — 0011 · Carga inicial de reparticiones (provisional)
--
-- Estructura organizativa de la Municipalidad tomada del organigrama del POA 2026
-- (planilla de Capital Humano). Es PROVISIONAL: cuando exista la integración con
-- Civitas se reconcilia por external_id (que acá queda null a propósito).
--
-- Alcance: 2 niveles — secretarías (parent_id null) y direcciones (cuelgan de su
-- secretaría). Las subsecretarías del organigrama NO se cargan todavía: en la
-- fuente vienen como texto libre con el mail incrustado y hay que limpiarlas a mano.
--
-- Tampoco se cargan responsables ni sus mails: eso es dato de personas y se maneja
-- al provisionar los usuarios 'director' (Etapa 2), manteniendo el alcance mínimo.
--
-- code = el código del organigrama (SECxx / DIRxx). Idempotente.
-- =============================================================================

-- --- Secretarías --------------------------------------------------------------
insert into public.reparticiones (code, nombre, parent_id) values
  ('SEC01', 'Secretaría General',                                null),
  ('SEC02', 'Secretaría de Gobierno',                            null),
  ('SEC03', 'Secretaría de Innovación Tecnológica',              null),
  ('SEC04', 'Secretaría de Ingresos Municipales',                null),
  ('SEC05', 'Contaduría General',                                null),
  ('SEC06', 'Secretaría de Atención Ciudadana',                  null),
  ('SEC07', 'Secretaría de Ambiente y Desarrollo Sustentable',   null),
  ('SEC08', 'Secretaría de Servicios Públicos',                  null),
  ('SEC09', 'Secretaría de Ordenamiento y Convivencia',          null)
on conflict (code) do nothing;

-- --- Direcciones (cuelgan de su secretaría por code) --------------------------
insert into public.reparticiones (code, nombre, parent_id)
select d.code, d.nombre, s.id
from (values
  -- Secretaría General
  ('DIR01', 'Dirección de Salud',                                     'SEC01'),
  ('DIR02', 'Dirección de Educación',                                 'SEC01'),
  ('DIR03', 'Dirección de Niñez y Juventud',                          'SEC01'),
  ('DIR04', 'Dirección de Adulto Mayor',                              'SEC01'),
  ('DIR05', 'Dirección de Población Animal',                          'SEC01'),
  ('DIR06', 'Dirección de Asistencia Pública',                        'SEC01'),
  ('DIR07', 'Dirección de Género y Diversidad',                       'SEC01'),
  ('DIR08', 'Centro Integral Municipal - Casa Azul',                  'SEC01'),
  ('DIR09', 'Centro Integral Municipal de Tartamudez',                'SEC01'),
  ('DIR10', 'Dirección de Planificación Estratégica',                 'SEC01'),
  ('DIR11', 'Dirección de Gerencia de Datos',                         'SEC01'),
  ('DIR12', 'Dirección de Documentación Estratégica',                 'SEC01'),
  ('DIR13', 'Dirección de Información Estratégica',                    'SEC01'),
  ('DIR14', 'Dirección de Centros Vecinales',                         'SEC01'),
  ('DIR15', 'Dirección de Respuestas Rápidas',                        'SEC01'),
  ('DIR16', 'Dirección de Gestión Cultural',                          'SEC01'),
  ('DIR17', 'Dirección de Museos',                                    'SEC01'),
  ('DIR18', 'Casa Museo de la Ciudad',                                'SEC01'),
  ('DIR19', 'Casa Belgraniana',                                       'SEC01'),
  ('DIR20', 'Museo de la Industria Azucarera',                        'SEC01'),
  ('DIR21', 'Museo Mercedes Sosa - Casa Natal',                       'SEC01'),
  ('DIR22', 'Dirección de Turismo',                                   'SEC01'),
  ('DIR23', 'Dirección de Comunicación',                              'SEC01'),
  ('DIR24', 'Dirección de Comunicación Digital',                      'SEC01'),
  ('DIR25', 'Dirección de Comunicación No Tradicional',               'SEC01'),
  ('DIR26', 'Dirección de Radio Municipal',                           'SEC01'),
  ('DIR27', 'Dirección de Ceremonial y Protocolo',                    'SEC01'),
  ('DIR28', 'Dirección de Promoción de Eventos',                      'SEC01'),
  -- Secretaría de Gobierno
  ('DIR29', 'Centro de Operaciones y Monitoreo Municipal (COMM)',     'SEC02'),
  ('DIR30', 'Dirección de Defensa Civil',                             'SEC02'),
  ('DIR31', 'Patrulla de Protección Ciudadana (PPC)',                 'SEC02'),
  ('DIR32', 'Dirección de Capital Humano',                            'SEC02'),
  ('DIR33', 'Dirección de Relaciones Institucionales e Internacionales', 'SEC02'),
  ('DIR34', 'Dirección de Empleo',                                    'SEC02'),
  ('DIR35', 'Dirección de Deportes',                                  'SEC02'),
  -- Secretaría de Innovación Tecnológica
  ('DIR36', 'Dirección de Inteligencia Artificial',                   'SEC03'),
  ('DIR37', 'Dirección de Innovación Tecnológica',                    'SEC03'),
  -- Secretaría de Ingresos Municipales
  ('DIR38', 'Dirección de Ingresos Municipales',                      'SEC04'),
  ('DIR39', 'Dirección de Informática Tributaria',                    'SEC04'),
  ('DIR40', 'Dirección de Política Fiscal',                           'SEC04'),
  -- Secretaría de Atención Ciudadana
  ('DIR42', 'Dirección de Programas Sociales',                        'SEC06'),
  ('DIR43', 'Dirección de Familia',                                   'SEC06'),
  -- Secretaría de Ambiente y Desarrollo Sustentable
  ('DIR44', 'Dirección de Ambiente',                                  'SEC07'),
  ('DIR45', 'Dirección de Salud Ambiental',                           'SEC07'),
  ('DIR46', 'Dirección de Bromatología',                              'SEC07'),
  -- Secretaría de Servicios Públicos
  ('DIR47', 'Dirección de Cementerios',                               'SEC08'),
  ('DIR48', 'Dirección de Parque 9 de Julio',                         'SEC08'),
  ('DIR49', 'Dirección de Espacios Verdes',                           'SEC08'),
  ('DIR50', 'Dirección de Arbolado Urbano',                           'SEC08'),
  ('DIR51', 'Dirección de Limpieza Urbana',                           'SEC08'),
  -- Secretaría de Ordenamiento y Convivencia
  ('DIR52', 'Dirección de Vía Pública',                               'SEC09'),
  ('DIR53', 'Dirección de Señalización y Cartelería',                 'SEC09'),
  ('DIR54', 'Fiscalía Ambiental Municipal',                           'SEC09')
) as d(code, nombre, parent_code)
join public.reparticiones s on s.code = d.parent_code
on conflict (code) do nothing;
