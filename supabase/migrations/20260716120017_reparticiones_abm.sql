-- =============================================================================
-- Capital humanIA — 0017 · Resguardos para el ABM de reparticiones
--
-- Habilitar la edición del organigrama desde la app abre una puerta que hasta
-- ahora estaba cerrada: que alguien cuelgue una repartición de una de sus propias
-- dependientes y arme un ciclo (A → B → A).
--
-- Un ciclo no es un error visible: las unidades del ciclo simplemente DESAPARECEN
-- del organigrama (el árbol se arma desde las raíces, y en un ciclo no hay raíz),
-- y el alcance del secretario deja de ser confiable. Por eso se bloquea en la
-- base y no solo en el formulario: la RLS ya deja escribir a cualquier admin.
--
-- El constraint chk_reparticiones_no_self ya cubría el caso directo (A → A);
-- esto cubre las cadenas más largas.
--
-- Idempotente.
-- =============================================================================

create or replace function public.prevent_reparticion_cycle()
returns trigger
language plpgsql
as $$
declare
  v_ancestro uuid;
  v_saltos   integer := 0;
begin
  if new.parent_id is null then
    return new;
  end if;

  v_ancestro := new.parent_id;

  -- Se sube por la cadena de padres: si se llega a la propia fila, hay ciclo.
  while v_ancestro is not null loop
    if v_ancestro = new.id then
      raise exception
        'Una repartición no puede depender de sí misma ni de otra que dependa de ella.'
        using errcode = 'check_violation';
    end if;

    -- Cinturón de seguridad: si ya existiera un ciclo previo en los datos, este
    -- recorrido no terminaría nunca. El organigrama municipal no tiene 50 niveles.
    v_saltos := v_saltos + 1;
    if v_saltos > 50 then
      raise exception 'La jerarquía de reparticiones es demasiado profunda o tiene un ciclo.'
        using errcode = 'check_violation';
    end if;

    select parent_id into v_ancestro
      from public.reparticiones
     where id = v_ancestro;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_reparticiones_sin_ciclos on public.reparticiones;
create trigger trg_reparticiones_sin_ciclos
  before insert or update of parent_id on public.reparticiones
  for each row execute function public.prevent_reparticion_cycle();

comment on function public.prevent_reparticion_cycle is
  'Impide ciclos en el organigrama (A depende de B y B de A). Sin esto, las '
  'unidades del ciclo desaparecen del árbol y el alcance del secretario deja de '
  'ser confiable.';
