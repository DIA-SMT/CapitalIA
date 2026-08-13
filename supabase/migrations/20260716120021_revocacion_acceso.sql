-- =============================================================================
-- Capital humanIA — 0021 · Desactivar un usuario le revoca el acceso de verdad
--
-- BUG QUE CIERRA (existía desde la 0010, la 0015 lo heredó):
--   `mis_reparticiones()` miraba `is_active` para decidir si el usuario era
--   secretario, pero NUNCA para decidir si alcanzaba algo. La rama del director
--   devolvía `perfil_reparticiones` sin haber mirado el perfil.
--
--   Efecto: desmarcar "Activo" en /usuarios NO revocaba nada. El usuario seguía
--   leyendo legajo y nombre de toda su repartición y —desde la 0018— seguía
--   pudiendo dar de alta personas y reasignar puestos, porque
--   `personas_insert_director` y `persona_en_mis_reparticiones` resuelven por
--   esta misma función. Mientras tanto la UI mostraba el badge "Sin acceso" y el
--   checkbox prometía "si se desactiva, deja de tener acceso".
--
--   Con el secretario era peor: al desactivarlo, `v_es_secretario` daba false y
--   caía a la rama del director, así que conservaba su repartición y perdía el
--   subárbol. Un permiso revocado a medias es más difícil de detectar que uno
--   que no se revocó.
--
--   `is_admin()` (0003) siempre chequeó `is_active`: solo `director` y
--   `secretario` estaban expuestos.
--
-- CÓMO SE ARREGLA: una sola lectura del perfil, y se corta ANTES de mirar
-- ninguna repartición. Sin perfil activo no se alcanza nada, y toda la RLS que
-- depende de esta función (personas, asignaciones, solicitudes) queda cerrada
-- sin tocar una sola política.
--
-- OJO — esto solo cierra la puerta de los datos. Una sesión ya abierta sigue
-- siendo válida hasta que expire el JWT: la app la mata baneando la cuenta en
-- Auth desde `actualizarUsuario`. Son dos capas distintas y se necesitan las dos.
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
  v_activo        boolean;
  v_es_secretario boolean;
begin
  -- Una sola consulta al perfil para las dos preguntas. Antes el `is_active`
  -- vivía adentro del `exists` que buscaba al secretario, así que solo filtraba
  -- esa rama.
  select p.is_active, p.role = 'secretario'
    into v_activo, v_es_secretario
    from public.profiles p
   where p.id = auth.uid();

  -- Fail-closed y primero que nada: sin sesión, sin perfil o con el perfil
  -- desactivado no se devuelve ninguna repartición.
  if not coalesce(v_activo, false) then
    return;
  end if;

  -- Director (y cualquier otro rol): exactamente las reparticiones asignadas.
  if not coalesce(v_es_secretario, false) then
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
  'Reparticiones que alcanza el usuario actual. Un perfil desactivado no alcanza '
  'ninguna (fail-closed). El director ve solo las asignadas; el secretario, '
  'también las que dependen de ellas en el organigrama.';
