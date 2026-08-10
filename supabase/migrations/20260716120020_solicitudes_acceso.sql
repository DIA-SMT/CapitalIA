-- =============================================================================
-- Capital humanIA — 0020 · Solicitudes de acceso (registro desde el login)
--
-- Una persona sin cuenta puede pedir una desde la pantalla de login: deja
-- nombre, apellido, email y legajo, y la solicitud queda PENDIENTE para que un
-- admin la apruebe (crea el usuario) o la rechace con motivo.
--
-- Escritura pública: la alta la hace el rol anónimo (anon), SIN sesión, a través
-- de `solicitar_acceso` — la única forma de insertar (no hay política de INSERT).
-- Es una superficie de escritura sin autenticar, así que:
--   · el índice único parcial evita apilar solicitudes pendientes del mismo email;
--   · la función valida y normaliza, y no revela si el email ya tiene cuenta.
-- Lectura y resolución: solo admin.
--
-- Idempotente.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'solicitud_acceso_estado') then
    create type public.solicitud_acceso_estado as enum ('pendiente', 'aprobada', 'rechazada');
  end if;
end $$;

create table if not exists public.solicitudes_acceso (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  apellido       text not null,
  email          text not null,
  legajo         text not null,
  estado         public.solicitud_acceso_estado not null default 'pendiente',
  motivo_rechazo text,
  resuelta_por   uuid references public.profiles (id) on delete set null,
  resuelta_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint chk_sa_nombre   check (length(trim(nombre))   >= 2),
  constraint chk_sa_apellido check (length(trim(apellido)) >= 2),
  constraint chk_sa_email    check (position('@' in email) > 1),
  constraint chk_sa_legajo   check (length(trim(legajo))   >= 1),
  -- Coherencia del estado: una rechazada tiene motivo; una pendiente todavía no.
  constraint chk_sa_resolucion check (
    (estado = 'pendiente' and motivo_rechazo is null)
    or (estado = 'aprobada')
    or (estado = 'rechazada' and motivo_rechazo is not null)
  )
);

comment on table public.solicitudes_acceso is
  'Pedidos de cuenta hechos desde el login por personas sin acceso. El admin los '
  'aprueba (crea el usuario con la Admin API) o los rechaza con motivo.';

-- Una sola solicitud pendiente por email: corta el reintento en loop desde el
-- formulario público. Rechazada/aprobada no cuentan, así que se puede re-pedir.
create unique index if not exists uq_sa_email_pendiente
  on public.solicitudes_acceso (lower(email))
  where estado = 'pendiente';

create index if not exists idx_sa_estado on public.solicitudes_acceso (estado);
create index if not exists idx_sa_creada on public.solicitudes_acceso (created_at desc);

drop trigger if exists trg_sa_updated_at on public.solicitudes_acceso;
create trigger trg_sa_updated_at
  before update on public.solicitudes_acceso
  for each row execute function public.set_updated_at();

drop trigger if exists trg_audit_solicitudes_acceso on public.solicitudes_acceso;
create trigger trg_audit_solicitudes_acceso
  after insert or update or delete on public.solicitudes_acceso
  for each row execute function public.record_audit();

-- --- RLS ----------------------------------------------------------------------
-- Solo el admin lee/gestiona. El alta pública NO usa política: entra por la
-- función SECURITY DEFINER de abajo, que corre como dueño y saltea RLS.
alter table public.solicitudes_acceso enable row level security;

drop policy if exists solicitudes_acceso_admin_all on public.solicitudes_acceso;
create policy solicitudes_acceso_admin_all on public.solicitudes_acceso
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- --- Alta pública (rol anónimo) ----------------------------------------------
create or replace function public.solicitar_acceso(
  p_nombre   text,
  p_apellido text,
  p_email    text,
  p_legajo   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if p_nombre is null or length(trim(p_nombre)) < 2 then
    raise exception 'Ingresá tu nombre' using errcode = 'check_violation';
  end if;
  if p_apellido is null or length(trim(p_apellido)) < 2 then
    raise exception 'Ingresá tu apellido' using errcode = 'check_violation';
  end if;
  if v_email is null or position('@' in v_email) < 2 then
    raise exception 'Ingresá un email válido' using errcode = 'check_violation';
  end if;
  if p_legajo is null or length(trim(p_legajo)) < 1 then
    raise exception 'Ingresá tu número de legajo' using errcode = 'check_violation';
  end if;

  insert into public.solicitudes_acceso (nombre, apellido, email, legajo)
  values (trim(p_nombre), trim(p_apellido), v_email, trim(p_legajo));

exception
  -- Ya hay una pendiente con ese email. No es error para quien pide: que no pueda
  -- deducir, por la respuesta, si ya solicitó o si el email ya tiene cuenta.
  when unique_violation then
    return;
end;
$$;

comment on function public.solicitar_acceso is
  'Alta pública de una solicitud de acceso desde el login. La hace el rol anon. '
  'Si ya hay una pendiente con ese email, no hace nada (idempotente para quien pide).';

-- --- Resolver (admin) ---------------------------------------------------------
-- Marca la solicitud como aprobada o rechazada. La creación del usuario la hace
-- la app con la Admin API (service_role), no acá: esta función solo resuelve el
-- pedido, en la misma línea que rechazar_solicitud de la 0013.
create or replace function public.resolver_solicitud_acceso(
  p_id     uuid,
  p_estado public.solicitud_acceso_estado,
  p_motivo text default null
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

  if p_estado = 'pendiente' then
    raise exception 'Estado inválido para resolver' using errcode = 'check_violation';
  end if;

  if p_estado = 'rechazada' and (p_motivo is null or length(trim(p_motivo)) < 5) then
    raise exception 'Indicá el motivo del rechazo (mínimo 5 caracteres)'
      using errcode = 'check_violation';
  end if;

  update public.solicitudes_acceso
     set estado         = p_estado,
         motivo_rechazo = case when p_estado = 'rechazada' then trim(p_motivo) else null end,
         resuelta_por   = auth.uid(),
         resuelta_at    = now()
   where id = p_id
     and estado = 'pendiente';

  if not found then
    raise exception 'La solicitud no existe o ya fue resuelta'
      using errcode = 'no_data_found';
  end if;
end;
$$;

comment on function public.resolver_solicitud_acceso is
  'Marca una solicitud de acceso como aprobada o rechazada (admin). La creación '
  'del usuario la hace la app con la Admin API; acá solo se resuelve el pedido.';

-- --- Permisos -----------------------------------------------------------------
revoke all on function public.solicitar_acceso(text, text, text, text) from public;
revoke all on function public.resolver_solicitud_acceso(uuid, public.solicitud_acceso_estado, text) from public;

-- Alta: la puede llamar cualquiera, incluso sin sesión (el formulario del login).
grant execute on function public.solicitar_acceso(text, text, text, text) to anon, authenticated;
-- Resolución: solo autenticados; la función re-chequea que sea admin por dentro.
grant execute on function public.resolver_solicitud_acceso(uuid, public.solicitud_acceso_estado, text) to authenticated;
