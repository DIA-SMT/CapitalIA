-- =============================================================================
-- Capital humanIA — 0010 · Reparticiones, vínculo usuario-repartición y rol por defecto
--
-- Fundaciones para las Etapas 2 y 3 de la propuesta de Capital Humano. Ver plan.md.
-- Requiere que la 0009 ('director' en user_role) ya esté aplicada y confirmada.
--
-- Qué hace:
--   1. Tabla `reparticiones` (unidad organizativa). parent_id modela el
--      organigrama; external_id es el enganche para Civitas (Etapa 1).
--   2. Tabla puente `perfil_reparticiones` (N:N): a qué repartición(es) pertenece
--      cada usuario director.
--   3. `personas.reparticion_id`: normaliza el texto libre `personas.area`.
--   4. `handle_new_user()` deja de crear a todo usuario como admin: ahora nacen
--      como 'director' sin repartición (acceso mínimo). Los admin existentes NO se
--      tocan (el trigger solo corre en altas nuevas).
--   5. Helper `mis_reparticiones()` para la RLS por repartición que viene después.
--   6. RLS de las tablas NUEVAS.
--
-- OJO — fail-closed a propósito: después de esta migración un usuario 'director'
-- todavía NO ve nada del nomenclador ni de personas. Toda esa RLS sigue siendo
-- is_admin(). Abrir el acceso acotado por repartición es el paso siguiente (otra
-- migración, el bloque delicado del plan), para ejercitarlo con cuidado.
--
-- Idempotente: se puede correr más de una vez sin romper nada.
-- =============================================================================

-- --- 1. Reparticiones ---------------------------------------------------------
create table if not exists public.reparticiones (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  nombre      text not null,
  parent_id   uuid references public.reparticiones (id) on delete restrict,
  external_id text unique,          -- ID en Civitas (Etapa 1); null hasta el sync
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint chk_reparticiones_code    check (length(trim(code)) > 0),
  constraint chk_reparticiones_nombre  check (length(trim(nombre)) > 0),
  constraint chk_reparticiones_no_self check (parent_id is null or parent_id <> id)
);

comment on table public.reparticiones is
  'Unidad organizativa de la Municipalidad. parent_id modela el organigrama; '
  'external_id enlaza con Civitas cuando haya integración (Etapa 1).';
comment on column public.reparticiones.external_id is
  'ID de la repartición en Civitas. Null hasta que exista el sync; es la clave de '
  'upsert para no duplicar.';

create index if not exists idx_reparticiones_parent on public.reparticiones (parent_id);
create index if not exists idx_reparticiones_activa on public.reparticiones (is_active);

drop trigger if exists trg_reparticiones_updated_at on public.reparticiones;
create trigger trg_reparticiones_updated_at
  before update on public.reparticiones
  for each row execute function public.set_updated_at();

drop trigger if exists trg_audit_reparticiones on public.reparticiones;
create trigger trg_audit_reparticiones
  after insert or update or delete on public.reparticiones
  for each row execute function public.record_audit();

-- --- 2. Vínculo usuario <-> repartición (N:N) ---------------------------------
-- Un director puede tener varias reparticiones a cargo. Tiene `id` propio para que
-- funcione el trigger de auditoría (record_audit usa la columna id).
create table if not exists public.perfil_reparticiones (
  id             uuid primary key default gen_random_uuid(),
  perfil_id      uuid not null references public.profiles (id) on delete cascade,
  reparticion_id uuid not null references public.reparticiones (id) on delete cascade,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (perfil_id, reparticion_id)
);

comment on table public.perfil_reparticiones is
  'A qué repartición(es) pertenece un usuario. Determina qué personal ve/administra '
  '(lo aplica la RLS por repartición del paso siguiente).';

create index if not exists idx_perfil_reparticiones_reparticion
  on public.perfil_reparticiones (reparticion_id);

drop trigger if exists trg_audit_perfil_reparticiones on public.perfil_reparticiones;
create trigger trg_audit_perfil_reparticiones
  after insert or update or delete on public.perfil_reparticiones
  for each row execute function public.record_audit();

-- --- 3. personas.reparticion_id -----------------------------------------------
-- Normaliza el texto libre personas.area. Se conserva `area` por ahora (decisión
-- pendiente); cuando reparticion_id esté poblado, `area` puede quedar deprecado.
alter table public.personas
  add column if not exists reparticion_id uuid references public.reparticiones (id) on delete set null;

comment on column public.personas.reparticion_id is
  'Repartición donde presta servicios (normaliza el texto libre "area"). Se completa '
  'desde el ABM o, más adelante, desde Civitas.';

create index if not exists idx_personas_reparticion on public.personas (reparticion_id);

-- --- 4. Los usuarios nuevos dejan de nacer admin ------------------------------
-- Antes: 'admin' fijo. Ahora: 'director' sin repartición (acceso mínimo, fail-closed).
-- Los perfiles existentes NO se tocan; este trigger solo corre en altas nuevas.
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
    'director'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user is
  'Alta automática de perfil. Los usuarios nuevos nacen como director sin '
  'repartición (acceso mínimo); un admin les asigna rol/repartición después.';

-- --- 5. Helper: reparticiones del usuario actual ------------------------------
-- SECURITY DEFINER para poder usarse dentro de políticas RLS sin recursión, igual
-- que is_admin(). Lo consumirá la RLS por repartición del paso siguiente.
create or replace function public.mis_reparticiones()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select reparticion_id
  from public.perfil_reparticiones
  where perfil_id = auth.uid();
$$;

revoke all on function public.mis_reparticiones() from public;
grant execute on function public.mis_reparticiones() to authenticated;

-- --- 6. RLS de las tablas nuevas ----------------------------------------------
alter table public.reparticiones        enable row level security;
alter table public.perfil_reparticiones enable row level security;

-- reparticiones: las lee cualquier usuario autenticado (no es dato sensible y el
-- director necesita ver los nombres). Solo admin las crea/edita.
drop policy if exists reparticiones_select_auth on public.reparticiones;
create policy reparticiones_select_auth on public.reparticiones
  for select to authenticated using (true);

drop policy if exists reparticiones_write_admin on public.reparticiones;
create policy reparticiones_write_admin on public.reparticiones
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- perfil_reparticiones: admin administra todo; el director puede ver sus propias
-- asignaciones.
drop policy if exists perfil_reparticiones_admin_all on public.perfil_reparticiones;
create policy perfil_reparticiones_admin_all on public.perfil_reparticiones
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists perfil_reparticiones_select_own on public.perfil_reparticiones;
create policy perfil_reparticiones_select_own on public.perfil_reparticiones
  for select to authenticated using (perfil_id = auth.uid());
