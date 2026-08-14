-- =============================================================================
-- PRUEBA NEGATIVA de la migración 0021 — desactivar revoca el acceso
--
-- Pegar TODO junto en el SQL Editor. Devuelve UNA tabla con los cuatro casos.
--
-- (La versión anterior de este archivo usaba cuatro SELECT sueltos y no servía:
--  el SQL Editor solo muestra el resultado del último. Ahora las mediciones se
--  juntan en una tabla temporal y se leen de una.)
--
-- QUÉ PRUEBA. Antes de la 0021, desmarcar "Activo" en /usuarios no revocaba nada:
-- el usuario seguía viendo el personal de su repartición y podía cargar gente,
-- mientras la pantalla mostraba el badge "Sin acceso". Con 4.706 personas
-- cargadas, dejó de ser un detalle.
--
-- POR QUÉ POR SQL Y NO CON UN LOGIN. Postgres puede impersonar a un usuario, que
-- es la forma estándar de probar RLS y es más rigurosa que un navegador —prueba el
-- predicado exacto— y no necesita la contraseña de nadie.
--
-- ES SEGURO. El bloque restaura todo por su cuenta: reactiva el perfil y devuelve
-- la función a su versión arreglada. Si algo explota a mitad, la transacción
-- entera se deshace sola y nada queda tocado.
--
-- El sujeto es el director de la Dirección de IA (matiaslujanw@gmail.com), con 3
-- personas a cargo.
-- =============================================================================

begin;

create temp table _prueba (
  orden    int,
  caso     text,
  resultado text,
  esperado text
) on commit drop;

do $$
declare
  v_uid       uuid := '71cd4477-0ce8-49f8-95f2-17df980748f6';
  v_claims    text := json_build_object('sub', '71cd4477-0ce8-49f8-95f2-17df980748f6',
                                        'role', 'authenticated')::text;
  v_arreglada text;
  n_a bigint;
  n_b bigint;
  n_d bigint;
  v_escritura text;
begin
  -- Guardar la versión arreglada para poder volver a ponerla al final.
  select pg_get_functiondef('public.mis_reparticiones()'::regprocedure) into v_arreglada;

  -- ---- A · con el arreglo, perfil ACTIVO -----------------------------------
  perform set_config('request.jwt.claims', v_claims, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n_a from public.personas;
  perform set_config('role', 'postgres', true);

  -- ---- B · con el arreglo, perfil DESACTIVADO ------------------------------
  update public.profiles set is_active = false where id = v_uid;

  perform set_config('role', 'authenticated', true);
  select count(*) into n_b from public.personas;

  -- ---- C · y tampoco puede escribir ---------------------------------------
  begin
    insert into public.personas (legajo, full_name, reparticion_id)
    values ('PRUEBA-REVOCACION', 'NO DEBERIA ENTRAR',
            (select id from public.reparticiones where code = 'DIR36'));
    v_escritura := 'PUDO ESCRIBIR ← falla la prueba';
  exception when others then
    v_escritura := 'rechazada: ' || left(sqlerrm, 60);
  end;
  perform set_config('role', 'postgres', true);

  -- ---- D · el ANTES: se restaura la función de la 0015 y se repite --------
  -- Esto es lo que hace que la prueba valga: sin comparar contra la versión
  -- vieja, un 0 en B no demuestra que el arreglo sea el que lo produce.
  create or replace function public.mis_reparticiones()
  returns setof uuid language plpgsql stable security definer
  set search_path = public as $vieja$
  declare v_es_secretario boolean;
  begin
    select exists (
      select 1 from public.profiles
       where id = auth.uid() and is_active and role = 'secretario'
    ) into v_es_secretario;
    if not v_es_secretario then
      return query select pr.reparticion_id from public.perfil_reparticiones pr
                    where pr.perfil_id = auth.uid();
      return;
    end if;
    return query
      with recursive arbol as (
        select pr.reparticion_id as id from public.perfil_reparticiones pr
         where pr.perfil_id = auth.uid()
        union
        select r.id from public.reparticiones r join arbol a on r.parent_id = a.id
      ) select id from arbol;
  end $vieja$;

  perform set_config('role', 'authenticated', true);
  select count(*) into n_d from public.personas;
  perform set_config('role', 'postgres', true);

  -- ---- Restaurar todo -----------------------------------------------------
  execute v_arreglada;                       -- vuelve la función arreglada
  update public.profiles set is_active = true where id = v_uid;
  perform set_config('request.jwt.claims', '', true);

  -- ---- Resultados ---------------------------------------------------------
  insert into _prueba values
    (1, 'A · arreglado + ACTIVO',       n_a::text,   '3  (ve a su gente)'),
    (2, 'B · arreglado + DESACTIVADO',  n_b::text,   '0  ← ESTE ES EL ARREGLO'),
    (3, 'C · escritura estando de baja', v_escritura, 'rechazada'),
    (4, 'D · SIN el arreglo + DESACTIVADO', n_d::text, '3  ← el bug que se cerró');
end $$;

select caso, resultado, esperado from _prueba order by orden;

commit;
