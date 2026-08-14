-- =============================================================================
-- Capital humanIA — 0024 · Candidatos a asignar, resueltos en la base
--
-- POR QUÉ: `listarPersonasSinPuesto()` traía personas sin acotar y descartaba en
-- JS a las que ya tienen puesto. PostgREST corta en 1.000 filas con HTTP 200 y
-- sin error, y el corte pasa ANTES del filtro: el <select> de la ficha del puesto
-- muestra un puñado de opciones verosímil sin ninguna señal de que falta gente.
--
-- Con 4.771 personas, a alguien apellidado Zurita no se lo puede asignar y la
-- pantalla no dice por qué. Peor: si las primeras 1.000 por orden alfabético ya
-- tienen puesto, el filtro deja cero y se imprime "No hay personas activas sin
-- puesto asignado" — falso, y sin forma de que el usuario lo sospeche.
--
-- El filtro tiene que estar en SQL: "no tiene asignación abierta" no se puede
-- expresar en PostgREST sin una vista o una función.
--
-- SIN `security definer`, A PROPÓSITO. Corre con los permisos de quien llama,
-- igual que la consulta que reemplaza, así que la RLS de `personas` sigue
-- acotando el alcance. Con `definer`, el director pasaría a ver el padrón del
-- municipio entero desde este selector.
--
-- `total` sale de una ventana: se calcula después del WHERE y antes del LIMIT,
-- así que la UI puede avisar cuando hay más de los que muestra en vez de
-- presentar un recorte como si fuera la lista completa.
--
-- Idempotente.
-- =============================================================================

create or replace function public.personas_sin_puesto(
  q       text default '',
  limite  int  default 200
)
returns table (id uuid, legajo text, full_name text, total int)
language sql
stable
set search_path = public
as $$
  select p.id, p.legajo, p.full_name, (count(*) over ())::int
    from public.personas p
   where p.is_active
     and not exists (
       select 1
         from public.asignaciones a
        where a.persona_id = p.id
          and a.valid_until is null
     )
     and (
       q = ''
       -- El término se escapa acá: un `%` tecleado no tiene que traer todo.
       or p.busqueda like '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
     )
   order by p.full_name, p.id
   limit least(greatest(limite, 1), 500);
$$;

comment on function public.personas_sin_puesto is
  'Personas activas sin asignación abierta, para el selector de la ficha del '
  'puesto. Acotada y con el total real, para que un recorte nunca se lea como la '
  'lista completa. SECURITY INVOKER: el alcance lo pone la RLS de personas.';

revoke all on function public.personas_sin_puesto(text, int) from public;
grant execute on function public.personas_sin_puesto(text, int) to authenticated;
