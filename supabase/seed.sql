-- =============================================================================
-- Capital humanIA — Seed de DESARROLLO
-- Se ejecuta con `supabase db reset`. NO usar en producción.
-- Crea 2-3 puestos DEMO claramente marcados (is_demo = true, prefijo [DEMO]).
-- Los catálogos base se cargan por migración (0005), no aquí.
-- =============================================================================

do $$
declare
  g_sg  uuid; g_adm uuid; g_tec uuid;
  l_sg1 uuid; l_adm3 uuid;
  a_inf uuid;
  rl_bajo uuid; rl_medio uuid;
  doc_p1 uuid;
  c_ors uuid; r_rui uuid;
  pos_id uuid; ver_id uuid;
  v_code text;
begin
  select id into g_sg  from public.groupings where code = 'SG';
  select id into g_adm from public.groupings where code = 'ADM';
  select id into g_tec from public.groupings where code = 'TEC';
  select id into l_sg1  from public.levels where grouping_id = g_sg  and code = 'I';
  select id into l_adm3 from public.levels where grouping_id = g_adm and code = 'III';
  select id into a_inf  from public.technical_areas where code = 'INF';
  select id into rl_bajo  from public.risk_levels where code = 'BAJO';
  select id into rl_medio from public.risk_levels where code = 'MEDIO';
  select id into doc_p1 from public.source_documents where code = 'NOM-P1';
  select id into c_ors from public.competencies where code = 'ORS';
  select id into r_rui from public.risks where code = 'RUI';

  -- Evita duplicar el seed si se corre más de una vez.
  if exists (select 1 from public.positions where is_demo) then
    raise notice 'Seed demo ya presente; se omite.';
    return;
  end if;

  -- === DEMO 1 · SG-I ========================================================
  v_code := public.generate_internal_code(g_sg, l_sg1, null);
  insert into public.positions (internal_code, status, is_demo)
    values (v_code, 'current', true) returning id into pos_id;
  insert into public.position_versions (
    position_id, version_number, grouping_id, level_id, name,
    general_description, specific_description, minimum_education,
    risk_level_id, validity_status, valid_from, is_historical_source, additional_notes
  ) values (
    pos_id, 1, g_sg, l_sg1, 'Auxiliar de Servicios Generales [DEMO]',
    'Tareas generales de limpieza y apoyo en dependencias municipales.',
    'Higiene de espacios, traslado de insumos y colaboración operativa.',
    'Primario completo', rl_bajo, 'current', current_date, false,
    'Registro DEMO de desarrollo.'
  ) returning id into ver_id;
  update public.positions set current_version_id = ver_id where id = pos_id;
  insert into public.position_version_competencies (position_version_id, competency_id)
    values (ver_id, c_ors) on conflict do nothing;
  insert into public.source_references (
    position_version_id, source_document_id, document_part,
    printed_page_number, pdf_page_number, verification_status, evidence_text
  ) values (
    ver_id, doc_p1, 'Servicios Generales', 12, 15, 'pending',
    'Fragmento de ejemplo (DEMO).'
  );

  -- === DEMO 2 · ADM-III =====================================================
  v_code := public.generate_internal_code(g_adm, l_adm3, null);
  insert into public.positions (internal_code, status, is_demo)
    values (v_code, 'current', true) returning id into pos_id;
  insert into public.position_versions (
    position_id, version_number, grouping_id, level_id, name,
    general_description, specific_description, minimum_education, required_title,
    risk_level_id, validity_status, valid_from, is_historical_source, additional_notes
  ) values (
    pos_id, 1, g_adm, l_adm3, 'Asistente Administrativo [DEMO]',
    'Apoyo administrativo a un área municipal.',
    'Gestión documental, registro de expedientes y atención de consultas.',
    'Secundario completo', null, rl_bajo, 'current', current_date, false,
    'Registro DEMO de desarrollo.'
  ) returning id into ver_id;
  update public.positions set current_version_id = ver_id where id = pos_id;

  -- === DEMO 3 · TEC-INF =====================================================
  v_code := public.generate_internal_code(g_tec, null, a_inf);
  insert into public.positions (internal_code, status, is_demo)
    values (v_code, 'current', true) returning id into pos_id;
  insert into public.position_versions (
    position_id, version_number, grouping_id, technical_area_id, name,
    general_description, specific_description, minimum_education,
    risk_level_id, validity_status, valid_from, is_historical_source, additional_notes
  ) values (
    pos_id, 1, g_tec, a_inf, 'Técnico en Informática [DEMO]',
    'Soporte técnico de sistemas y equipamiento informático.',
    'Instalación, mantenimiento y asistencia a usuarios.',
    'Terciario técnico', rl_medio, 'current', current_date, false,
    'Registro DEMO de desarrollo.'
  ) returning id into ver_id;
  update public.positions set current_version_id = ver_id where id = pos_id;
  insert into public.position_version_risks (position_version_id, risk_id)
    values (ver_id, r_rui) on conflict do nothing;

  raise notice 'Seed demo creado: 3 puestos (%).', v_code;
end;
$$;
