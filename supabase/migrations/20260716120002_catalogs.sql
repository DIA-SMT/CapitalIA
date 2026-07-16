-- =============================================================================
-- Capital humanIA — 0002 · Perfiles y catálogos
-- Tablas de referencia normalizadas y perfil de usuario.
-- =============================================================================

-- --- Perfiles (vinculados a auth.users) --------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  role       public.user_role not null default 'admin',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Perfil de aplicación por usuario de Supabase Auth. MVP: rol único admin.';

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- --- Familias de puestos ------------------------------------------------------
create table public.position_families (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.position_families is
  'Agrupación opcional de puestos afines (variantes de un mismo puesto base).';

create trigger trg_position_families_updated_at
  before update on public.position_families
  for each row execute function public.set_updated_at();

-- --- Agrupamientos (agrupamiento) --------------------------------------------
create table public.groupings (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,          -- prefijo de código interno (SG, MP, ADM, TEC, PRO)
  name        text not null,
  description text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column public.groupings.code is
  'Prefijo corto usado en internal_code (ej. SG, MP, ADM, TEC, PRO).';

create trigger trg_groupings_updated_at
  before update on public.groupings
  for each row execute function public.set_updated_at();

-- --- Niveles (nivel), dependientes del agrupamiento ---------------------------
create table public.levels (
  id          uuid primary key default gen_random_uuid(),
  grouping_id uuid not null references public.groupings (id) on delete restrict,
  code        text not null,                 -- I, II, III, IV, V, VI
  name        text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (grouping_id, code)
);

comment on table public.levels is
  'Niveles por agrupamiento. Se pueden crear nuevos niveles desde la aplicación.';

create index idx_levels_grouping on public.levels (grouping_id);

create trigger trg_levels_updated_at
  before update on public.levels
  for each row execute function public.set_updated_at();

-- --- Áreas técnicas (área) ----------------------------------------------------
create table public.technical_areas (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,          -- segmento de internal_code para TEC (ej. CON)
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.technical_areas is
  'Áreas técnicas para el agrupamiento Técnico. Ampliables desde la aplicación.';

create trigger trg_technical_areas_updated_at
  before update on public.technical_areas
  for each row execute function public.set_updated_at();

-- --- Niveles de riesgo (nivel de riesgo) -------------------------------------
create table public.risk_levels (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_risk_levels_updated_at
  before update on public.risk_levels
  for each row execute function public.set_updated_at();

-- --- Catálogo de competencias -------------------------------------------------
create table public.competencies (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  category    text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_competencies_updated_at
  before update on public.competencies
  for each row execute function public.set_updated_at();

-- --- Catálogo de riesgos ------------------------------------------------------
create table public.risks (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  category    text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_risks_updated_at
  before update on public.risks
  for each row execute function public.set_updated_at();

-- --- Catálogo de conocimientos (otros conocimientos) --------------------------
create table public.knowledge_items (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  category    text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_knowledge_items_updated_at
  before update on public.knowledge_items
  for each row execute function public.set_updated_at();

-- --- Catálogo de responsabilidades --------------------------------------------
create table public.responsibilities (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger trg_responsibilities_updated_at
  before update on public.responsibilities
  for each row execute function public.set_updated_at();

-- --- Documentos fuente (PDF escaneados) ---------------------------------------
create table public.source_documents (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  title         text not null,
  description   text,
  kind          text not null default 'pdf_escaneado',
  file_reference text,                        -- ruta en Storage / referencia externa
  total_pages   integer check (total_pages is null or total_pages > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.source_documents is
  'Documentos fuente del nomenclador (ej. los dos PDF históricos).';

create trigger trg_source_documents_updated_at
  before update on public.source_documents
  for each row execute function public.set_updated_at();
