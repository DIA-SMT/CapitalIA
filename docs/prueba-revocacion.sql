-- =============================================================================
-- PRUEBA NEGATIVA de la migración 0021 — desactivar revoca el acceso
--
-- Pegar TODO junto en el SQL Editor de Supabase y leer los cuatro resultados.
--
-- QUÉ PRUEBA. Antes de la 0021, desmarcar "Activo" en /usuarios no revocaba nada:
-- el usuario seguía viendo el personal de su repartición y podía cargar gente,
-- mientras la pantalla mostraba el badge "Sin acceso". Con 4.706 personas
-- cargadas, eso ya no es un detalle.
--
-- POR QUÉ ASÍ Y NO CON UN LOGIN. Postgres puede impersonar a un usuario
-- (`set local role` + `request.jwt.claims`), que es la forma estándar de probar
-- RLS y es más rigurosa que un navegador: prueba el predicado exacto. Y no hace
-- falta la contraseña de nadie.
--
-- ES SEGURO. Todo va dentro de una transacción que termina en ROLLBACK: al final
-- no queda absolutamente nada, ni el perfil desactivado ni la función vieja.
-- Si algo sale mal a mitad, cortá y corré `rollback;` suelto.
--
-- El sujeto es el director de la Dirección de IA (matiaslujanw@gmail.com), que
-- tiene 3 personas a cargo.
-- =============================================================================

begin;

-- --- 1. CON EL ARREGLO PUESTO, perfil ACTIVO: tiene que ver a su gente --------
set local role authenticated;
set local request.jwt.claims = '{"sub":"71cd4477-0ce8-49f8-95f2-17df980748f6","role":"authenticated"}';

select 'A · arreglado + activo'            as caso,
       count(*)                            as personas_visibles,
       'esperado: 3 (las de su Dirección)' as esperado
  from public.personas;


-- --- 2. CON EL ARREGLO PUESTO, perfil DESACTIVADO: tiene que ver CERO --------
reset role;   -- un director no puede tocar profiles; esto lo hace el admin
update public.profiles
   set is_active = false
 where id = '71cd4477-0ce8-49f8-95f2-17df980748f6';

set local role authenticated;
set local request.jwt.claims = '{"sub":"71cd4477-0ce8-49f8-95f2-17df980748f6","role":"authenticated"}';

select 'B · arreglado + desactivado'    as caso,
       count(*)                         as personas_visibles,
       'esperado: 0  ← ESTE ES EL FIX'  as esperado
  from public.personas;


-- --- 3. Y tampoco puede escribir ---------------------------------------------
-- Antes de la 0021 esto FUNCIONABA: `personas_insert_director` resuelve por la
-- misma función, así que un desactivado seguía cargando personal.
do $$
begin
  insert into public.personas (legajo, full_name, reparticion_id)
  values ('PRUEBA-REVOCACION', 'NO DEBERIA ENTRAR',
          (select id from public.reparticiones where code = 'DIR36'));
  raise warning 'C · FALLÓ LA PRUEBA: un usuario desactivado pudo cargar una persona';
exception
  when insufficient_privilege or others then
    raise notice 'C · correcto: la escritura fue rechazada (%)', sqlerrm;
end $$;


-- --- 4. EL ANTES: se restaura la función vieja y se repite la consulta --------
-- Esto es lo que demuestra que el número de arriba lo produce el arreglo y no
-- otra cosa. Es la versión de la 0015, tal cual: mira `is_active` solo para
-- decidir si es secretario, nunca para decidir si alcanza algo.
reset role;

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
    select 1 from public.profiles
     where id = auth.uid() and is_active and role = 'secretario'
  ) into v_es_secretario;

  if not v_es_secretario then
    return query
      select pr.reparticion_id from public.perfil_reparticiones pr
       where pr.perfil_id = auth.uid();
    return;
  end if;

  return query
    with recursive arbol as (
      select pr.reparticion_id as id from public.perfil_reparticiones pr
       where pr.perfil_id = auth.uid()
      union
      select r.id from public.reparticiones r join arbol a on r.parent_id = a.id
    )
    select id from arbol;
end;
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"71cd4477-0ce8-49f8-95f2-17df980748f6","role":"authenticated"}';

select 'D · SIN el arreglo + desactivado'                        as caso,
       count(*)                                                  as personas_visibles,
       'esperado: 3  ← el bug: desactivado y sigue viendo todo'   as esperado
  from public.personas;


-- --- Deshacer TODO -----------------------------------------------------------
-- Vuelve el perfil a activo y la función arreglada a su lugar.
reset role;
rollback;


-- --- Control posterior (fuera de la transacción) -----------------------------
-- Después del rollback, estas dos tienen que dar lo de siempre.
select is_active as perfil_volvio_activo
  from public.profiles
 where id = '71cd4477-0ce8-49f8-95f2-17df980748f6';

select obj_description('public.mis_reparticiones()'::regprocedure) like '%fail-closed%'
       as funcion_arreglada_en_su_lugar;
