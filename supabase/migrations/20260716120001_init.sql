-- =============================================================================
-- Capital humanIA — 0001 · Inicialización
-- Extensiones, tipos enumerados y funciones auxiliares genéricas.
-- =============================================================================

create extension if not exists pgcrypto;      -- gen_random_uuid()
create extension if not exists pg_trgm;        -- similitud textual (etapas futuras)

-- --- Tipos enumerados ---------------------------------------------------------

-- Rol de usuario. En el MVP solo existe 'admin'; el enum permite ampliarlo luego
-- con ALTER TYPE ... ADD VALUE.
create type public.user_role as enum ('admin');

-- Estados del ciclo de vida (aplican a positions.status y a
-- position_versions.validity_status).
--   draft      -> borrador, aún no vigente
--   current    -> versión/puesto vigente
--   historical -> versión superada, preservada
--   archived   -> archivado lógicamente (no se borra físicamente)
create type public.position_status as enum (
  'draft',
  'current',
  'historical',
  'archived'
);

-- Estado de verificación de la transcripción de una fuente.
create type public.verification_status as enum (
  'pending',
  'verified',
  'needs_review'
);

-- --- Funciones auxiliares genéricas -------------------------------------------

-- Actualiza automáticamente la columna updated_at en cada UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Impide el borrado físico (se usa archivado lógico). Se adjunta a las tablas de
-- puestos como defensa en profundidad, además de las políticas RLS.
create or replace function public.prevent_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Borrado físico no permitido en "%": usar archivado lógico (status/archived_at).',
    tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

-- --- Generación de código interno estable -------------------------------------
-- Los puestos no tienen código oficial: se genera un código interno único y
-- estable (no cambia aunque cambie el nombre). Formato: <PREFIJO>-NNNN.
create table public.code_sequences (
  prefix     text primary key,
  last_value integer not null default 0
);

comment on table public.code_sequences is
  'Contadores por prefijo para generar internal_code (ej. SG-I -> SG-I-0001).';

-- Devuelve el siguiente código para un prefijo dado, de forma atómica.
create or replace function public.next_internal_code(p_prefix text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value integer;
begin
  if p_prefix is null or length(trim(p_prefix)) = 0 then
    raise exception 'El prefijo del código interno no puede estar vacío';
  end if;

  insert into public.code_sequences (prefix, last_value)
  values (p_prefix, 1)
  on conflict (prefix)
  do update set last_value = public.code_sequences.last_value + 1
  returning last_value into v_value;

  return p_prefix || '-' || lpad(v_value::text, 4, '0');
end;
$$;
