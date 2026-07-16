-- =============================================================================
-- Capital humanIA — 0007 · Edición de puestos
--
-- Funciones para modificar el nomenclador sin perder la historia. Toda edición
-- crea una versión nueva y conserva la anterior; nada se sobreescribe.
--
-- Van como funciones de base y no como llamadas desde la app porque cada
-- operación toca varias tablas y tiene que ser atómica. En particular:
-- `uq_pv_one_current` permite una sola versión vigente por puesto, así que la
-- anterior debe pasar a histórica ANTES de insertar la nueva. Si eso se hiciera
-- en dos llamadas desde la app y fallara la segunda, el puesto quedaría sin
-- versión vigente.
-- =============================================================================

-- --- Helper: vuelca los ítems de catálogo a una tabla puente ------------------
-- p_items: [{"id": "<uuid del catalogo>", "raw_text": "<literal>", "notes": "..."}]
-- raw_text guarda el literal tal como se escribe/imprime (ver migración 0006).
create or replace function public.set_items_version(
  p_version_id uuid,
  p_tabla text,
  p_columna_fk text,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_orden integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return;
  end if;

  -- Solo tablas puente conocidas: p_tabla y p_columna_fk se interpolan en el
  -- INSERT, así que no pueden venir libres desde el cliente.
  if p_tabla not in ('position_version_competencies', 'position_version_risks',
                     'position_version_responsibilities', 'position_version_knowledge') then
    raise exception 'Tabla puente no permitida: %', p_tabla;
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    execute format(
      'insert into public.%I (position_version_id, %I, raw_text, notes, sort_order)
       values ($1, $2, $3, $4, $5) on conflict do nothing',
      p_tabla, p_columna_fk
    )
    using p_version_id,
          (v_item ->> 'id')::uuid,
          nullif(v_item ->> 'raw_text', ''),
          nullif(v_item ->> 'notes', ''),
          v_orden;
    v_orden := v_orden + 1;
  end loop;
end;
$$;

comment on function public.set_items_version is
  'Inserta los ítems de catálogo de una versión en su tabla puente. Uso interno '
  'de crear_version_puesto / crear_puesto.';

-- --- Crear una versión nueva de un puesto existente ---------------------------
create or replace function public.crear_version_puesto(
  p_position_id               uuid,
  p_grouping_id               uuid,
  p_level_id                  uuid,
  p_technical_area_id         uuid,
  p_name                      text,
  p_variant                   text,
  p_general_description       text,
  p_specific_description      text,
  p_minimum_education         text,
  p_required_title            text,
  p_minimum_experience        text,
  p_physical_requirement      text,
  p_working_conditions        text,
  p_risk_level_id             uuid,
  p_risk_level_raw            text,
  p_additional_notes          text,
  p_change_reason             text,
  p_change_document_reference text,
  p_competencias              jsonb default '[]'::jsonb,
  p_riesgos                   jsonb default '[]'::jsonb,
  p_responsabilidades         jsonb default '[]'::jsonb,
  p_conocimientos             jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num       integer;
  v_nueva_id  uuid;
begin
  -- SECURITY DEFINER saltea RLS: hay que re-chequear el permiso a mano.
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_change_reason is null or length(trim(p_change_reason)) = 0 then
    raise exception 'El motivo del cambio es obligatorio'
      using errcode = 'check_violation';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'El nombre del puesto es obligatorio'
      using errcode = 'check_violation';
  end if;

  -- Serializa las ediciones concurrentes sobre el mismo puesto: sin esto, dos
  -- usuarios guardando a la vez chocarían contra uq_pv_one_current.
  perform 1 from public.positions where id = p_position_id for update;
  if not found then
    raise exception 'El puesto % no existe', p_position_id using errcode = 'no_data_found';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_num
    from public.position_versions where position_id = p_position_id;

  -- 1. La vigente pasa a histórica. Se preserva entera.
  update public.position_versions
     set validity_status = 'historical',
         valid_until     = current_date
   where position_id = p_position_id
     and validity_status = 'current';

  -- 2. Nace la nueva versión.
  insert into public.position_versions (
    position_id, version_number, grouping_id, level_id, technical_area_id,
    name, variant, general_description, specific_description,
    minimum_education, required_title, minimum_experience,
    physical_requirement, working_conditions,
    risk_level_id, risk_level_raw, additional_notes,
    validity_status, valid_from, change_reason, change_document_reference,
    is_historical_source, created_by
  ) values (
    p_position_id, v_num, p_grouping_id, p_level_id, p_technical_area_id,
    trim(p_name), nullif(trim(coalesce(p_variant, '')), ''),
    p_general_description, p_specific_description,
    p_minimum_education, p_required_title, p_minimum_experience,
    p_physical_requirement, p_working_conditions,
    p_risk_level_id, p_risk_level_raw, p_additional_notes,
    'current', current_date, trim(p_change_reason), p_change_document_reference,
    false,          -- las versiones nuevas ya no son transcripción del PDF 2016
    auth.uid()
  )
  returning id into v_nueva_id;

  -- 3. Los ítems de catálogo.
  perform public.set_items_version(v_nueva_id, 'position_version_competencies',     'competency_id',     p_competencias);
  perform public.set_items_version(v_nueva_id, 'position_version_risks',            'risk_id',           p_riesgos);
  perform public.set_items_version(v_nueva_id, 'position_version_responsibilities', 'responsibility_id', p_responsabilidades);
  perform public.set_items_version(v_nueva_id, 'position_version_knowledge',        'knowledge_item_id', p_conocimientos);

  -- 4. El puesto apunta a la nueva.
  update public.positions
     set current_version_id = v_nueva_id,
         status = case when status = 'draft' then 'current' else status end
   where id = p_position_id;

  return v_nueva_id;
end;
$$;

comment on function public.crear_version_puesto is
  'Crea una versión nueva de un puesto en una transacción: pasa la vigente a '
  'histórica, inserta la nueva y reapunta el puesto. El motivo del cambio es '
  'obligatorio. La versión anterior nunca se borra.';

-- --- Crear un puesto nuevo ----------------------------------------------------
create or replace function public.crear_puesto(
  p_grouping_id               uuid,
  p_level_id                  uuid,
  p_technical_area_id         uuid,
  p_name                      text,
  p_variant                   text,
  p_general_description       text,
  p_specific_description      text,
  p_minimum_education         text,
  p_required_title            text,
  p_minimum_experience        text,
  p_physical_requirement      text,
  p_working_conditions        text,
  p_risk_level_id             uuid,
  p_risk_level_raw            text,
  p_additional_notes          text,
  p_change_reason             text,
  p_change_document_reference text,
  p_competencias              jsonb default '[]'::jsonb,
  p_riesgos                   jsonb default '[]'::jsonb,
  p_responsabilidades         jsonb default '[]'::jsonb,
  p_conocimientos             jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo     text;
  v_puesto_id  uuid;
  v_version_id uuid;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'El nombre del puesto es obligatorio'
      using errcode = 'check_violation';
  end if;

  v_codigo := public.generate_internal_code(p_grouping_id, p_level_id, p_technical_area_id);

  insert into public.positions (internal_code, status)
  values (v_codigo, 'current')
  returning id into v_puesto_id;

  insert into public.position_versions (
    position_id, version_number, grouping_id, level_id, technical_area_id,
    name, variant, general_description, specific_description,
    minimum_education, required_title, minimum_experience,
    physical_requirement, working_conditions,
    risk_level_id, risk_level_raw, additional_notes,
    validity_status, valid_from, change_reason, change_document_reference,
    is_historical_source, created_by
  ) values (
    v_puesto_id, 1, p_grouping_id, p_level_id, p_technical_area_id,
    trim(p_name), nullif(trim(coalesce(p_variant, '')), ''),
    p_general_description, p_specific_description,
    p_minimum_education, p_required_title, p_minimum_experience,
    p_physical_requirement, p_working_conditions,
    p_risk_level_id, p_risk_level_raw, p_additional_notes,
    'current', current_date,
    coalesce(nullif(trim(coalesce(p_change_reason, '')), ''), 'Alta de puesto nuevo'),
    p_change_document_reference,
    false, auth.uid()
  )
  returning id into v_version_id;

  perform public.set_items_version(v_version_id, 'position_version_competencies',     'competency_id',     p_competencias);
  perform public.set_items_version(v_version_id, 'position_version_risks',            'risk_id',           p_riesgos);
  perform public.set_items_version(v_version_id, 'position_version_responsibilities', 'responsibility_id', p_responsabilidades);
  perform public.set_items_version(v_version_id, 'position_version_knowledge',        'knowledge_item_id', p_conocimientos);

  update public.positions set current_version_id = v_version_id where id = v_puesto_id;

  return v_puesto_id;
end;
$$;

comment on function public.crear_puesto is
  'Da de alta un puesto nuevo: genera el código interno, crea el puesto y su '
  'versión 1 en una transacción.';

-- --- Archivar / restaurar -----------------------------------------------------
-- "Dar de baja" un puesto que ya no existe en el organigrama es archivarlo, no
-- borrarlo: el trigger prevent_delete bloquea el borrado físico a propósito. Si
-- mañana preguntan si el puesto existía en 2016, la respuesta tiene que estar.
create or replace function public.archivar_puesto(
  p_position_id uuid,
  p_motivo      text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_motivo is null or length(trim(p_motivo)) = 0 then
    raise exception 'El motivo del archivado es obligatorio'
      using errcode = 'check_violation';
  end if;

  update public.positions
     set status      = 'archived',
         archived_at = now()
   where id = p_position_id
     and status <> 'archived';

  if not found then
    raise exception 'El puesto no existe o ya está archivado'
      using errcode = 'no_data_found';
  end if;

  -- El motivo queda en la versión vigente, que es lo que se conserva.
  update public.position_versions
     set change_reason = trim(p_motivo),
         valid_until   = current_date
   where position_id = p_position_id
     and validity_status = 'current';
end;
$$;

create or replace function public.restaurar_puesto(p_position_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  update public.positions
     set status      = 'current',
         archived_at = null
   where id = p_position_id
     and status = 'archived';

  if not found then
    raise exception 'El puesto no existe o no estaba archivado'
      using errcode = 'no_data_found';
  end if;

  update public.position_versions
     set valid_until = null
   where position_id = p_position_id
     and validity_status = 'current';
end;
$$;

comment on function public.archivar_puesto is
  'Baja lógica de un puesto. No borra: el nomenclador conserva lo que existió.';

-- --- Permisos -----------------------------------------------------------------
-- Las funciones son SECURITY DEFINER y chequean is_admin() por dentro. Se
-- revoca a public para que solo las invoque un usuario autenticado.
revoke all on function public.set_items_version(uuid, text, text, jsonb) from public;
revoke all on function public.crear_version_puesto(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb) from public;
revoke all on function public.crear_puesto(uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb) from public;
revoke all on function public.archivar_puesto(uuid, text) from public;
revoke all on function public.restaurar_puesto(uuid) from public;

grant execute on function public.crear_version_puesto(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.crear_puesto(uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.archivar_puesto(uuid, text) to authenticated;
grant execute on function public.restaurar_puesto(uuid) to authenticated;
