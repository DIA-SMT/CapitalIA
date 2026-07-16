-- =============================================================================
-- Capital humanIA — 0008 · Personas y dotación
--
-- Amplía el alcance: hasta acá el sistema era solo de puestos (descripciones de
-- trabajo). Esto agrega QUIÉN ocupa cada puesto.
--
-- ALCANCE DELIBERADAMENTE MÍNIMO. Se guarda lo necesario para responder "¿quién
-- es el Oficial Mecánico?" y "¿cuántos Ordenanzas hay?": nombre, legajo, área y
-- la asignación con sus fechas.
--
-- NO se guarda —y no debería agregarse sin antes resolver roles y protección de
-- datos—: DNI, CUIL, domicilio, fecha de nacimiento, salario, licencias,
-- sanciones, evaluaciones de desempeño. Son datos personales sensibles de
-- empleados municipales. Hoy todo usuario nace admin (handle_new_user) y no
-- existe un rol de solo lectura: mientras eso siga así, el sistema no está
-- preparado para datos más sensibles que estos.
-- =============================================================================

-- --- Personas -----------------------------------------------------------------
create table public.personas (
  id           uuid primary key default gen_random_uuid(),
  legajo       text not null unique,
  full_name    text not null,
  email        text,
  area         text,                    -- repartición donde presta servicios
  notes        text,
  is_active    boolean not null default true,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint chk_personas_legajo    check (length(trim(legajo)) > 0),
  constraint chk_personas_full_name check (length(trim(full_name)) > 0)
);

comment on table public.personas is
  'Empleados municipales. Alcance mínimo: identificación y área. No guarda datos '
  'sensibles (ver cabecera de la migración 0008).';
comment on column public.personas.legajo is
  'Número de legajo municipal. Es la identidad estable de la persona.';
comment on column public.personas.is_active is
  'false = ya no presta servicios. No se borra: la dotación histórica se conserva.';

create index idx_personas_area   on public.personas (area);
create index idx_personas_activo on public.personas (is_active);
create index idx_personas_nombre_trgm
  on public.personas using gin (full_name gin_trgm_ops);

create trigger trg_personas_updated_at
  before update on public.personas
  for each row execute function public.set_updated_at();

-- --- Asignaciones (persona ocupa un puesto) -----------------------------------
-- La gente cambia de puesto y eso también es historia: por eso hay fechas y no
-- una simple FK en personas.
create table public.asignaciones (
  id          uuid primary key default gen_random_uuid(),
  persona_id  uuid not null references public.personas (id) on delete cascade,
  position_id uuid not null references public.positions (id) on delete restrict,
  valid_from  date not null default current_date,
  valid_until date,                     -- null = asignación vigente
  notes       text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint chk_asignaciones_rango
    check (valid_until is null or valid_until >= valid_from)
);

comment on table public.asignaciones is
  'Qué persona ocupa qué puesto y desde cuándo. valid_until null = vigente. '
  'Las asignaciones terminadas se conservan: son la dotación histórica.';

create index idx_asig_persona  on public.asignaciones (persona_id);
create index idx_asig_position on public.asignaciones (position_id);
create index idx_asig_vigentes on public.asignaciones (position_id) where valid_until is null;

-- Una persona ocupa un solo puesto a la vez. Mismo patrón que la versión vigente
-- de un puesto (uq_pv_one_current).
create unique index uq_asig_una_vigente_por_persona
  on public.asignaciones (persona_id)
  where valid_until is null;

create trigger trg_asignaciones_updated_at
  before update on public.asignaciones
  for each row execute function public.set_updated_at();

-- --- Auditoría ----------------------------------------------------------------
create trigger trg_audit_personas
  after insert or update or delete on public.personas
  for each row execute function public.record_audit();

create trigger trg_audit_asignaciones
  after insert or update or delete on public.asignaciones
  for each row execute function public.record_audit();

-- --- RLS ----------------------------------------------------------------------
alter table public.personas     enable row level security;
alter table public.asignaciones enable row level security;

create policy personas_admin on public.personas
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy asignaciones_admin on public.asignaciones
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- --- Asignar / desasignar -----------------------------------------------------
-- Va en una función porque mover a alguien de puesto son dos operaciones (cerrar
-- la asignación anterior, abrir la nueva) y el índice único
-- uq_asig_una_vigente_por_persona las rechaza si no se hacen en orden.
create or replace function public.asignar_persona(
  p_persona_id  uuid,
  p_position_id uuid,
  p_desde       date default current_date,
  p_notas       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  perform 1 from public.personas where id = p_persona_id for update;
  if not found then
    raise exception 'La persona no existe' using errcode = 'no_data_found';
  end if;

  perform 1 from public.positions where id = p_position_id and status <> 'archived';
  if not found then
    raise exception 'El puesto no existe o está archivado' using errcode = 'no_data_found';
  end if;

  -- 1. Cerrar la asignación vigente, si la hay.
  update public.asignaciones
     set valid_until = greatest(p_desde - 1, valid_from)
   where persona_id = p_persona_id
     and valid_until is null;

  -- 2. Abrir la nueva.
  insert into public.asignaciones (persona_id, position_id, valid_from, notes, created_by)
  values (p_persona_id, p_position_id, p_desde, p_notas, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.desasignar_persona(
  p_persona_id uuid,
  p_hasta      date default current_date
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

  update public.asignaciones
     set valid_until = greatest(p_hasta, valid_from)
   where persona_id = p_persona_id
     and valid_until is null;

  if not found then
    raise exception 'La persona no tiene una asignación vigente'
      using errcode = 'no_data_found';
  end if;
end;
$$;

comment on function public.asignar_persona is
  'Asigna una persona a un puesto cerrando su asignación anterior, en una '
  'transacción. La asignación anterior se conserva: es la dotación histórica.';

revoke all on function public.asignar_persona(uuid, uuid, date, text) from public;
revoke all on function public.desasignar_persona(uuid, date) from public;
grant execute on function public.asignar_persona(uuid, uuid, date, text) to authenticated;
grant execute on function public.desasignar_persona(uuid, date) to authenticated;
