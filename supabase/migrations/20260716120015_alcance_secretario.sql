-- =============================================================================
-- Capital humanIA — 0015 · Alcance jerárquico del secretario
--
-- Requiere la 0014 ('secretario' en user_role) aplicada y confirmada.
--
-- Un secretario ve lo mismo que un director, pero de toda su secretaría: su
-- repartición asignada MÁS todas las que cuelgan de ella (parent_id).
--
-- El cambio es de una sola función. Toda la RLS por repartición (personas,
-- asignaciones, solicitudes) resuelve el alcance con mis_reparticiones(), así que
-- ampliarla acá alcanza: no se toca ninguna política. Por eso la 0010 dejó
-- parent_id preparado aunque el scoping arrancara plano.
--
-- Idempotente.
-- =============================================================================

create or replace function public.mis_reparticiones()
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_es_secretario boolean;
begin
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_active
      and role = 'secretario'
  ) into v_es_secretario;

  -- Director (y cualquier otro rol): exactamente las reparticiones asignadas.
  if not v_es_secretario then
    return query
      select pr.reparticion_id
        from public.perfil_reparticiones pr
       where pr.perfil_id = auth.uid();
    return;
  end if;

  -- Secretario: las asignadas y todo lo que dependa de ellas.
  -- `union` (no `union all`) deduplica, así un parent_id mal cargado en ciclo no
  -- deja la recursión colgada.
  return query
    with recursive arbol as (
      select pr.reparticion_id as id
        from public.perfil_reparticiones pr
       where pr.perfil_id = auth.uid()
      union
      select r.id
        from public.reparticiones r
        join arbol a on r.parent_id = a.id
    )
    select id from arbol;
end;
$$;

comment on function public.mis_reparticiones is
  'Reparticiones que alcanza el usuario actual. El director ve solo las asignadas; '
  'el secretario, también las que dependen de ellas en el organigrama.';
