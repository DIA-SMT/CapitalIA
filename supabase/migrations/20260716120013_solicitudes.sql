-- =============================================================================
-- Capital humanIA — 0013 · Solicitudes de puestos nuevos
--
-- Etapas 2 y 3 de la propuesta de Capital Humano:
--   · Etapa 2: si la función que cumple un agente no está en el nomenclador, el
--     director genera una SOLICITUD con lo mínimo — nombre del puesto y
--     descripción general de las tareas. Ese es el insumo del análisis técnico.
--   · Etapa 3: la solicitud queda PENDIENTE. Un admin la evalúa, completa la
--     ficha técnica y la APRUEBA (el puesto se incorpora al nomenclador) o la
--     RECHAZA indicando el motivo, que el solicitante puede leer.
--
-- Diseño: la solicitud es una entidad propia y NO un puesto en 'draft'. Un puesto
-- exige agrupamiento y genera código interno al insertarse; la solicitud a
-- propósito no tiene nada de eso — el solicitante solo aporta nombre y
-- descripción, y la clasificación la define el admin al evaluar.
--
-- Toda escritura pasa por funciones SECURITY DEFINER (no hay políticas de INSERT
-- ni UPDATE): así la validación de quién puede qué vive en un solo lugar.
--
-- Idempotente.
-- =============================================================================

-- --- Estado del ciclo de vida de una solicitud --------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'solicitud_estado') then
    create type public.solicitud_estado as enum ('pendiente', 'aprobada', 'rechazada');
  end if;
end $$;

-- --- Tabla --------------------------------------------------------------------
create table if not exists public.solicitudes (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,                  -- nombre propuesto del puesto
  descripcion    text not null,                  -- tareas / funciones que desarrolla
  reparticion_id uuid not null references public.reparticiones (id) on delete restrict,
  solicitante_id uuid references public.profiles (id) on delete set null,
  estado         public.solicitud_estado not null default 'pendiente',
  motivo_rechazo text,
  position_id    uuid references public.positions (id) on delete set null,
  resuelta_por   uuid references public.profiles (id) on delete set null,
  resuelta_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint chk_solicitudes_nombre
    check (length(trim(nombre)) >= 3),
  constraint chk_solicitudes_descripcion
    check (length(trim(descripcion)) >= 10),
  -- Coherencia del estado: una aprobada apunta al puesto creado; una rechazada
  -- tiene motivo; una pendiente todavía no tiene ni lo uno ni lo otro.
  constraint chk_solicitudes_resolucion check (
    (estado = 'pendiente' and position_id is null and motivo_rechazo is null)
    or (estado = 'aprobada'  and position_id is not null)
    or (estado = 'rechazada' and motivo_rechazo is not null)
  )
);

comment on table public.solicitudes is
  'Pedidos de creación de puestos que no están en el nomenclador. El solicitante '
  'aporta nombre + descripción; el admin completa la ficha técnica al aprobar.';
comment on column public.solicitudes.position_id is
  'Puesto creado al aprobar. Deja la trazabilidad solicitud -> puesto.';

create index if not exists idx_solicitudes_estado      on public.solicitudes (estado);
create index if not exists idx_solicitudes_reparticion on public.solicitudes (reparticion_id);
create index if not exists idx_solicitudes_creada      on public.solicitudes (created_at desc);

drop trigger if exists trg_solicitudes_updated_at on public.solicitudes;
create trigger trg_solicitudes_updated_at
  before update on public.solicitudes
  for each row execute function public.set_updated_at();

drop trigger if exists trg_audit_solicitudes on public.solicitudes;
create trigger trg_audit_solicitudes
  after insert or update or delete on public.solicitudes
  for each row execute function public.record_audit();

-- --- RLS ----------------------------------------------------------------------
-- Lectura: el admin ve todas; el director, solo las de su(s) repartición(es).
-- Escritura: ninguna política — se hace solo por las funciones de abajo.
alter table public.solicitudes enable row level security;

drop policy if exists solicitudes_admin_all on public.solicitudes;
create policy solicitudes_admin_all on public.solicitudes
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists solicitudes_select_director on public.solicitudes;
create policy solicitudes_select_director on public.solicitudes
  for select to authenticated
  using (reparticion_id in (select public.mis_reparticiones()));

-- --- Crear una solicitud (director o admin) -----------------------------------
create or replace function public.crear_solicitud(
  p_nombre         text,
  p_descripcion    text,
  p_reparticion_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  -- El director solo puede pedir para SU repartición. El admin, para cualquiera.
  if not public.is_admin()
     and p_reparticion_id not in (select public.mis_reparticiones()) then
    raise exception 'No autorizado: la repartición no es la suya'
      using errcode = '42501';
  end if;

  if p_nombre is null or length(trim(p_nombre)) < 3 then
    raise exception 'El nombre del puesto es obligatorio'
      using errcode = 'check_violation';
  end if;

  if p_descripcion is null or length(trim(p_descripcion)) < 10 then
    raise exception 'Describí las tareas del puesto (mínimo 10 caracteres)'
      using errcode = 'check_violation';
  end if;

  insert into public.solicitudes (nombre, descripcion, reparticion_id, solicitante_id)
  values (trim(p_nombre), trim(p_descripcion), p_reparticion_id, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.crear_solicitud is
  'Alta de una solicitud de puesto nuevo. El director solo puede pedir para su '
  'repartición; queda en estado pendiente para que la evalúe un admin.';

-- --- Rechazar (admin) ---------------------------------------------------------
create or replace function public.rechazar_solicitud(
  p_solicitud_id uuid,
  p_motivo       text
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

  if p_motivo is null or length(trim(p_motivo)) < 10 then
    raise exception 'Indicá el motivo del rechazo (mínimo 10 caracteres)'
      using errcode = 'check_violation';
  end if;

  update public.solicitudes
     set estado         = 'rechazada',
         motivo_rechazo = trim(p_motivo),
         resuelta_por   = auth.uid(),
         resuelta_at    = now()
   where id = p_solicitud_id
     and estado = 'pendiente';

  if not found then
    raise exception 'La solicitud no existe o ya fue resuelta'
      using errcode = 'no_data_found';
  end if;
end;
$$;

-- --- Aprobar (admin): crea el puesto y resuelve la solicitud -------------------
-- Recibe los mismos parámetros que crear_puesto y lo invoca por dentro, así el
-- alta del puesto y la resolución de la solicitud ocurren en UNA transacción: no
-- puede quedar un puesto creado con la solicitud todavía pendiente.
create or replace function public.aprobar_solicitud(
  p_solicitud_id              uuid,
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
  v_position_id uuid;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  -- Bloquea la solicitud: dos admins aprobando a la vez no pueden crear dos puestos.
  perform 1 from public.solicitudes
   where id = p_solicitud_id and estado = 'pendiente'
   for update;
  if not found then
    raise exception 'La solicitud no existe o ya fue resuelta'
      using errcode = 'no_data_found';
  end if;

  v_position_id := public.crear_puesto(
    p_grouping_id, p_level_id, p_technical_area_id,
    p_name, p_variant, p_general_description, p_specific_description,
    p_minimum_education, p_required_title, p_minimum_experience,
    p_physical_requirement, p_working_conditions,
    p_risk_level_id, p_risk_level_raw, p_additional_notes,
    p_change_reason, p_change_document_reference,
    p_competencias, p_riesgos, p_responsabilidades, p_conocimientos
  );

  update public.solicitudes
     set estado       = 'aprobada',
         position_id  = v_position_id,
         resuelta_por = auth.uid(),
         resuelta_at  = now()
   where id = p_solicitud_id;

  return v_position_id;
end;
$$;

comment on function public.aprobar_solicitud is
  'Aprueba una solicitud: crea el puesto con la ficha técnica completa y marca la '
  'solicitud como aprobada, en una sola transacción.';

-- --- Permisos -----------------------------------------------------------------
revoke all on function public.crear_solicitud(text, text, uuid) from public;
revoke all on function public.rechazar_solicitud(uuid, text) from public;
revoke all on function public.aprobar_solicitud(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb) from public;

grant execute on function public.crear_solicitud(text, text, uuid) to authenticated;
grant execute on function public.rechazar_solicitud(uuid, text) to authenticated;
grant execute on function public.aprobar_solicitud(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb) to authenticated;
