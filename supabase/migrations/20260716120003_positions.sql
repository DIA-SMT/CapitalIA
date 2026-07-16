-- =============================================================================
-- Capital humanIA — 0003 · Puestos, versiones, relaciones, fuentes y auditoría
-- =============================================================================

-- --- positions: identidad estable del puesto ---------------------------------
create table public.positions (
  id                 uuid primary key default gen_random_uuid(),
  internal_code      text not null unique,
  current_version_id uuid,                    -- FK agregada tras crear position_versions
  family_id          uuid references public.position_families (id) on delete set null,
  status             public.position_status not null default 'draft',
  is_demo            boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  archived_at        timestamptz
);

comment on table public.positions is
  'Identidad estable del puesto. internal_code no cambia aunque cambie el nombre.';
comment on column public.positions.is_demo is
  'Marca registros demostrativos (seed de desarrollo).';

create index idx_positions_status on public.positions (status);
create index idx_positions_family on public.positions (family_id);

create trigger trg_positions_updated_at
  before update on public.positions
  for each row execute function public.set_updated_at();

-- Sin borrado físico: solo archivado lógico (status='archived' + archived_at).
create trigger trg_positions_no_delete
  before delete on public.positions
  for each row execute function public.prevent_delete();

-- --- position_versions: cada cambio relevante crea una versión ----------------
create table public.position_versions (
  id                       uuid primary key default gen_random_uuid(),
  position_id              uuid not null references public.positions (id) on delete cascade,
  version_number           integer not null check (version_number > 0),
  grouping_id              uuid not null references public.groupings (id) on delete restrict,
  level_id                 uuid references public.levels (id) on delete restrict,
  technical_area_id        uuid references public.technical_areas (id) on delete restrict,
  name                     text not null,
  variant                  text,
  general_description      text,
  specific_description     text,
  minimum_education        text,             -- instrucción
  required_title           text,             -- título
  physical_requirement     text,
  working_conditions       text,
  risk_level_id            uuid references public.risk_levels (id) on delete restrict, -- nivel de riesgo
  additional_notes         text,             -- observaciones libres (información excepcional)
  validity_status          public.position_status not null default 'draft',
  valid_from               date,
  valid_until              date,
  change_reason            text,
  change_document_reference text,
  is_historical_source     boolean not null default false,
  created_by               uuid references public.profiles (id) on delete set null,
  created_at               timestamptz not null default now(),
  unique (position_id, version_number),
  constraint chk_validity_range
    check (valid_until is null or valid_from is null or valid_until >= valid_from)
);

comment on table public.position_versions is
  'Versión de un puesto. Preserva histórico: las versiones no se editan destructivamente.';
comment on column public.position_versions.risk_level_id is
  'Nivel de riesgo global (normaliza el campo "risk_level" de la ficha).';

create index idx_pv_position on public.position_versions (position_id);
create index idx_pv_grouping on public.position_versions (grouping_id);
create index idx_pv_level on public.position_versions (level_id);
create index idx_pv_technical_area on public.position_versions (technical_area_id);
create index idx_pv_validity on public.position_versions (validity_status);
create index idx_pv_name_trgm on public.position_versions using gin (name gin_trgm_ops);

-- Como máximo una versión 'current' por puesto.
create unique index uq_pv_one_current
  on public.position_versions (position_id)
  where validity_status = 'current';

-- Referencia circular: current_version_id apunta a una versión del mismo puesto.
alter table public.positions
  add constraint positions_current_version_fk
  foreign key (current_version_id)
  references public.position_versions (id) on delete set null;

create index idx_positions_current_version on public.positions (current_version_id);

-- Preservar historial: solo se permite borrar versiones en estado 'draft'.
create or replace function public.prevent_delete_nondraft_version()
returns trigger
language plpgsql
as $$
begin
  if old.validity_status <> 'draft' then
    raise exception
      'No se puede borrar una versión en estado "%": se conserva el historial.',
      old.validity_status
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

create trigger trg_pv_no_delete_nondraft
  before delete on public.position_versions
  for each row execute function public.prevent_delete_nondraft_version();

-- --- Tablas puente versión <-> catálogos ---------------------------------------
create table public.position_version_competencies (
  id                  uuid primary key default gen_random_uuid(),
  position_version_id uuid not null references public.position_versions (id) on delete cascade,
  competency_id       uuid not null references public.competencies (id) on delete restrict,
  notes               text,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  unique (position_version_id, competency_id)
);
create index idx_pvc_version on public.position_version_competencies (position_version_id);
create index idx_pvc_competency on public.position_version_competencies (competency_id);

create table public.position_version_risks (
  id                  uuid primary key default gen_random_uuid(),
  position_version_id uuid not null references public.position_versions (id) on delete cascade,
  risk_id             uuid not null references public.risks (id) on delete restrict,
  notes               text,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  unique (position_version_id, risk_id)
);
create index idx_pvr_version on public.position_version_risks (position_version_id);
create index idx_pvr_risk on public.position_version_risks (risk_id);

create table public.position_version_responsibilities (
  id                  uuid primary key default gen_random_uuid(),
  position_version_id uuid not null references public.position_versions (id) on delete cascade,
  responsibility_id   uuid not null references public.responsibilities (id) on delete restrict,
  notes               text,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  unique (position_version_id, responsibility_id)
);
create index idx_pvresp_version on public.position_version_responsibilities (position_version_id);
create index idx_pvresp_responsibility on public.position_version_responsibilities (responsibility_id);

create table public.position_version_knowledge (
  id                  uuid primary key default gen_random_uuid(),
  position_version_id uuid not null references public.position_versions (id) on delete cascade,
  knowledge_item_id   uuid not null references public.knowledge_items (id) on delete restrict,
  notes               text,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now(),
  unique (position_version_id, knowledge_item_id)
);
create index idx_pvk_version on public.position_version_knowledge (position_version_id);
create index idx_pvk_knowledge on public.position_version_knowledge (knowledge_item_id);

-- --- Referencias a la fuente (procedencia por versión) -----------------------
create table public.source_references (
  id                  uuid primary key default gen_random_uuid(),
  position_version_id uuid not null references public.position_versions (id) on delete cascade,
  source_document_id  uuid not null references public.source_documents (id) on delete restrict,
  document_part       text,                  -- parte del documento
  printed_page_number integer check (printed_page_number is null or printed_page_number >= 1),
  pdf_page_number     integer check (pdf_page_number is null or pdf_page_number >= 1),
  notes               text,                  -- observaciones
  verification_status public.verification_status not null default 'pending',
  evidence_text       text,                  -- fragmento / evidencia textual
  verified_by         uuid references public.profiles (id) on delete set null,
  verified_at         timestamptz,
  created_at          timestamptz not null default now()
);

comment on table public.source_references is
  'Procedencia documental de cada versión: documento, página impresa/PDF, evidencia y verificación.';

create index idx_srcref_version on public.source_references (position_version_id);
create index idx_srcref_document on public.source_references (source_document_id);
create index idx_srcref_verification on public.source_references (verification_status);

-- --- Auditoría (historial de modificaciones) ---------------------------------
create table public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id  uuid,
  action     text not null,                  -- insert | update | delete
  actor_id   uuid references public.profiles (id) on delete set null,
  diff       jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_table_record on public.audit_logs (table_name, record_id);
create index idx_audit_actor on public.audit_logs (actor_id);
create index idx_audit_created on public.audit_logs (created_at);

-- =============================================================================
-- Funciones de dominio
-- =============================================================================

-- ¿El usuario actual es admin activo? SECURITY DEFINER para evitar recursión RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active
  );
$$;

-- Construye el prefijo del código interno a partir de agrupamiento + (área | nivel).
create or replace function public.build_code_prefix(
  p_grouping_id uuid,
  p_level_id uuid,
  p_technical_area_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_grouping text;
  v_segment  text;
begin
  select code into v_grouping from public.groupings where id = p_grouping_id;
  if v_grouping is null then
    raise exception 'Agrupamiento inexistente: %', p_grouping_id;
  end if;

  if p_technical_area_id is not null then
    select code into v_segment from public.technical_areas where id = p_technical_area_id;
  elsif p_level_id is not null then
    select code into v_segment from public.levels where id = p_level_id;
  end if;

  if v_segment is null then
    return v_grouping;
  end if;
  return v_grouping || '-' || v_segment;
end;
$$;

-- Genera un internal_code único y estable (ej. SG-I-0001, TEC-CON-0001).
create or replace function public.generate_internal_code(
  p_grouping_id uuid,
  p_level_id uuid,
  p_technical_area_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.next_internal_code(
    public.build_code_prefix(p_grouping_id, p_level_id, p_technical_area_id)
  );
end;
$$;

-- Registro de auditoría genérico.
create or replace function public.record_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record_id uuid;
  v_diff jsonb;
begin
  if tg_op = 'DELETE' then
    v_record_id := old.id;
    v_diff := to_jsonb(old);
  else
    v_record_id := new.id;
    v_diff := to_jsonb(new);
  end if;

  insert into public.audit_logs (table_name, record_id, action, actor_id, diff)
  values (tg_table_name, v_record_id, lower(tg_op), auth.uid(), v_diff);

  return null;
end;
$$;

create trigger trg_audit_positions
  after insert or update or delete on public.positions
  for each row execute function public.record_audit();

create trigger trg_audit_position_versions
  after insert or update or delete on public.position_versions
  for each row execute function public.record_audit();

-- Alta automática de perfil al crear un usuario en Supabase Auth.
-- MVP: rol admin por defecto (los usuarios se crean solo desde el panel por un
-- administrador). En etapas con múltiples roles, restringir esta asignación.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'admin'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
