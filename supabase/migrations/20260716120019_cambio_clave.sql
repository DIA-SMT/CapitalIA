-- =============================================================================
-- Capital humanIA — 0019 · Cambio de contraseña temporal obligatorio
--
-- Los usuarios se crean con una contraseña temporal que Capital Humano dicta por
-- fuera (no hay envío de mails; ver la cabecera de usuarios/actions.ts). Hasta
-- ahora esa contraseña quedaba para siempre: no había pantalla para cambiarla.
-- Este cambio marca a los usuarios recién creados con `must_change_password` y la
-- app los obliga a elegir una nueva antes de usar el sistema.
--
-- El flag se apaga con `marcar_clave_cambiada()`, NO con un UPDATE directo: la RLS
-- de profiles solo deja escribir al admin (0004), así que un director no podría
-- apagarse su propio flag. La función SECURITY DEFINER es el único camino.
--
-- Idempotente.
-- =============================================================================

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  'Si es true, la app obliga a cambiar la contraseña antes de continuar. Se '
  'enciende al crear el usuario (contraseña temporal) y se apaga al cambiarla.';

-- Apaga el flag del usuario actual. Se llama después de un cambio de contraseña
-- exitoso; no recibe la contraseña, solo baja la bandera para el propio usuario.
create or replace function public.marcar_clave_cambiada()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  update public.profiles
     set must_change_password = false
   where id = auth.uid();
end;
$$;

comment on function public.marcar_clave_cambiada is
  'Apaga must_change_password para el usuario actual, tras cambiar su contraseña.';

revoke all on function public.marcar_clave_cambiada() from public;
grant execute on function public.marcar_clave_cambiada() to authenticated;
