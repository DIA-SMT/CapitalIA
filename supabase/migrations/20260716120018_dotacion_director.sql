-- =============================================================================
-- Capital humanIA — 0018 · El director gestiona la dotación de su repartición
--
-- Cierra la Etapa 2 de la propuesta de Capital Humano ("asignación de funciones"),
-- que estaba a medias: la 0012 le dio al director LECTURA acotada de su gente,
-- pero asignar_persona y desasignar_persona siguieron arrancando con
-- `if not is_admin() then raise`. Resultado: el director veía a su personal y no
-- podía moverlo de puesto. Lo seguía haciendo Capital Humano a mano, que es justo
-- lo que la Etapa 2 venía a sacarles de encima.
--
-- Qué habilita, para 'director' y 'secretario' (el alcance de cada uno lo resuelve
-- mis_reparticiones(), que para el secretario incluye todo lo que cuelga de su
-- secretaría):
--   1. Asignar y desasignar puestos, SOLO a personas de su(s) repartición(es).
--   2. Dar de alta personas, SOLO en su(s) repartición(es).
--
-- Por qué también el alta y no solo la asignación: Civitas está diferido (no hay
-- acceso todavía), así que no hay ninguna vía automática de carga. Si el director
-- no puede cargar a su gente, la tiene que cargar Capital Humano de a uno para
-- todo el municipio, y la asignación self-service queda inerte por falta de a
-- quién asignar. Decidido con el área.
--
-- Qué NO cambia:
--   - El nomenclador sigue siendo de escritura solo-admin. El director asigna
--     personas a puestos que ya existen; no crea, edita ni archiva puestos.
--   - No se agrega UPDATE ni DELETE sobre personas. El director puede cargar y
--     asignar; corregir un nombre o dar de baja a alguien sigue siendo de Capital
--     Humano. Es a propósito, no un olvido: la baja de una persona es una decisión
--     administrativa, no de gestión de dotación.
--   - El alcance mínimo de `personas` sigue igual (legajo, nombre, email,
--     repartición). Nada de DNI, CUIL, salario ni licencias — ver la cabecera de
--     la 0008.
--
-- El PUESTO no se restringe, a propósito: cualquiera puede ocupar cualquier puesto
-- vigente, porque el nomenclador es municipal y no de una repartición. Lo que se
-- acota es SOBRE QUIÉN se opera, que es donde está el dato sensible.
--
-- Idempotente.
-- =============================================================================

-- --- 1. Alta de personas acotada a la propia repartición ----------------------
-- Va `with check` y no `using`: en un INSERT no hay fila previa que mirar.
--
-- Un `reparticion_id` nulo NO pasa este check (`null in (...)` da null, que no es
-- true), así que la base obliga al director a elegir repartición y a que sea una
-- de las suyas. El formulario además solo le ofrece las propias, pero el que manda
-- es este check: una Server Action recibe lo que le mande el cliente.
--
-- El admin no depende de esta policy: personas_admin (0008) le da `for all` y las
-- políticas se combinan con OR.
drop policy if exists personas_insert_director on public.personas;
create policy personas_insert_director on public.personas
  for insert to authenticated
  with check (reparticion_id in (select public.mis_reparticiones()));

-- --- 2. Asignar / desasignar: admin, o el dueño de esa persona ----------------
-- Se reemplazan enteras porque `create or replace function` no permite parchear
-- solo el guard. El cuerpo es idéntico al de la 0008; lo único que cambia es la
-- condición de autorización.

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
  -- La autorización va ANTES de comprobar que la persona existe, y eso es
  -- deliberado: al revés, un director podría distinguir "esa persona no existe"
  -- de "existe pero no es tuya" y sondear el padrón ajeno probando ids. Así las
  -- dos cosas contestan lo mismo.
  if not (public.is_admin()
          or public.persona_en_mis_reparticiones(p_persona_id)) then
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
  -- Mismo criterio que asignar_persona: autorizar primero, para no delatar qué
  -- ids existen.
  if not (public.is_admin()
          or public.persona_en_mis_reparticiones(p_persona_id)) then
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
  'transacción. La asignación anterior se conserva: es la dotación histórica. '
  'La puede llamar un admin, o un director/secretario sobre una persona de su '
  'alcance (mis_reparticiones).';

comment on function public.desasignar_persona is
  'Cierra la asignación vigente de una persona. Mismo alcance que asignar_persona.';

comment on policy personas_insert_director on public.personas is
  'Un director/secretario carga personas solo en su(s) repartición(es). Un '
  'reparticion_id nulo no pasa el check, así que la repartición es obligatoria '
  'para todo el que no sea admin.';

-- `create or replace function` conserva los privilegios, pero se reafirman para
-- que esta migración se sostenga sola si alguien la lee suelta.
revoke all on function public.asignar_persona(uuid, uuid, date, text) from public;
revoke all on function public.desasignar_persona(uuid, date) from public;
grant execute on function public.asignar_persona(uuid, uuid, date, text) to authenticated;
grant execute on function public.desasignar_persona(uuid, date) to authenticated;
