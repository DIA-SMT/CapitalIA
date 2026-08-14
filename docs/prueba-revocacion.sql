-- =============================================================================
-- PRUEBA NEGATIVA de la migración 0021 — desactivar revoca el acceso
--
-- CÓMO CORRERLO: pegar todo y ejecutar. El resultado que se ve es la tabla de
-- cuatro filas. Después, si querés, correr el `drop function` del final para no
-- dejar nada.
--
-- (Dos intentos anteriores fallaron por cómo ejecuta el SQL Editor de Supabase:
--  solo muestra el resultado de la ÚLTIMA sentencia, y hace commit entre
--  sentencias, así que una tabla temporal no sobrevive. Esta versión mete todo
--  en una función y la última sentencia es el SELECT que la llama.)
--
-- QUÉ PRUEBA. Antes de la 0021, desmarcar "Activo" en /usuarios no revocaba nada:
-- el usuario seguía viendo el personal de su repartición y podía cargar gente,
-- mientras la pantalla mostraba el badge "Sin acceso".
--
-- ES SEGURO. La función restaura todo por su cuenta —reactiva el perfil y
-- devuelve la función arreglada a su lugar— y si algo explota a mitad, la
-- transacción implícita de la sentencia se deshace sola.
--
-- El sujeto es el director de la Dirección de IA (matiaslujanw@gmail.com), con 3
-- personas a cargo.
-- =============================================================================

create or replace function public.__prueba_revocacion()
returns table (caso text, resultado text, esperado text)
language plpgsql
as $fn$
declare
  v_uid       uuid := '71cd4477-0ce8-49f8-95f2-17df980748f6';
  v_claims    text := '{"sub":"71cd4477-0ce8-49f8-95f2-17df980748f6","role":"authenticated"}';
  v_arreglada text;
  n_a bigint; n_b bigint; n_d bigint;
  v_escritura text;
begin
  -- Guardar la versión arreglada para volver a ponerla al final.
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

  -- ---- C · estando de baja, tampoco puede escribir -------------------------
  begin
    insert into public.personas (legajo, full_name, reparticion_id)
    values ('PRUEBA-REVOCACION', 'NO DEBERIA ENTRAR',
            (select id from public.reparticiones where code = 'DIR36'));
    v_escritura := 'PUDO ESCRIBIR ← falla la prueba';
  exception when others then
    v_escritura := 'rechazada';
  end;
  perform set_config('role', 'postgres', true);

  -- ---- D · el ANTES: la función de la 0015, y la misma consulta ------------
  -- Sin comparar contra la versión vieja, un 0 en B no demuestra que el arreglo
  -- sea lo que lo produce.
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
  execute v_arreglada;
  update public.profiles set is_active = true where id = v_uid;
  perform set_config('request.jwt.claims', '', true);

  return query
  select * from (values
    ('A · arreglado + ACTIVO',           n_a::text,   '3  (ve a su gente)'),
    ('B · arreglado + DESACTIVADO',      n_b::text,   '0  <= ESTE ES EL ARREGLO'),
    ('C · escritura estando de baja',    v_escritura, 'rechazada'),
    ('D · SIN el arreglo + DESACTIVADO', n_d::text,   '3  <= el bug que se cerro')
  ) t(caso, resultado, esperado);
end $fn$;

select * from public.__prueba_revocacion();


-- =============================================================================
-- Después de leer el resultado, para no dejar nada:
--
--   drop function public.__prueba_revocacion();
--
-- Y para confirmar que quedó todo en su lugar:
--
--   select is_active from public.profiles
--    where id = '71cd4477-0ce8-49f8-95f2-17df980748f6';                 -- true
--   select obj_description('public.mis_reparticiones()'::regprocedure)
--          like '%fail-closed%';                                        -- true
-- =============================================================================
