-- =============================================================================
-- Capital humanIA — 0012 · RLS por repartición (acceso del rol director)
--
-- Hasta acá toda la RLS era is_admin() (todo o nada). Esto abre el acceso ACOTADO
-- para el rol 'director', que es el corazón de la Etapa 2 de Capital Humano.
--
-- Qué habilita para un 'director':
--   1. LEER el nomenclador (positions, versiones, catálogos, procedencia): consulta,
--      no edición. Es dato de referencia, no sensible. NOTA: se expone TODO el
--      nomenclador (incluye versiones históricas y puestos archivados); el filtrado
--      de "vigente" lo hace la app en sus consultas, no la RLS.
--   2. LEER personas y asignaciones SOLO de su(s) repartición(es).
--
-- Qué NO cambia:
--   - El admin sigue con acceso total (las políticas *_admin_all siguen intactas;
--     estas nuevas son aditivas y se combinan con OR).
--   - El director TODAVÍA NO escribe nada (personas, asignaciones y el nomenclador
--     siguen siendo de escritura solo-admin; las funciones asignar_persona,
--     crear_puesto, etc. re-chequean is_admin() y rechazan a no-admin con 42501).
--     Asignar puestos y crear solicitudes llega después. Fail-safe.
--
-- Pendiente conocido (no de esta migración): la UI de administración todavía no
-- gatea por rol, así que un director vería botones que la base va a rechazar. El
-- bloqueo real está en la base (defensa en profundidad); el gateo por rol en la app
-- va con la UI del director.
--
-- Nota de alcance: el organigrama (reparticiones, incluido external_id de Civitas)
-- es legible por cualquier autenticado. Se considera dato no sensible (estructura
-- organizativa pública). Si eso cambiara, acotar reparticiones_select_auth.
--
-- Idempotente.
-- =============================================================================

-- ¿La persona pertenece a alguna de MIS reparticiones? Se usa en la policy de
-- asignaciones. Devuelve solo un booleano (no la repartición ajena): aunque sea
-- invocable por RPC, no revela nada que el usuario no pueda ya inferir por su propio
-- alcance. SECURITY DEFINER para no depender de la RLS de personas (evita anidar
-- políticas), igual que is_admin()/mis_reparticiones().
create or replace function public.persona_en_mis_reparticiones(p_persona uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.personas
    where id = p_persona
      and reparticion_id in (select public.mis_reparticiones())
  );
$$;

revoke all on function public.persona_en_mis_reparticiones(uuid) from public;
grant execute on function public.persona_en_mis_reparticiones(uuid) to authenticated;

-- --- 1. Nomenclador legible por cualquier autenticado (admin y director) -------
-- Solo SELECT. La escritura sigue gobernada por las políticas *_admin_all.
-- El set es exactamente lo que el listado y la ficha del puesto consultan.
do $$
declare
  t text;
  tablas text[] := array[
    'groupings', 'levels', 'technical_areas', 'risk_levels',
    'competencies', 'risks', 'knowledge_items', 'responsibilities',
    'source_documents', 'positions', 'position_versions',
    'position_version_competencies', 'position_version_risks',
    'position_version_responsibilities', 'position_version_knowledge',
    'source_references'
  ];
begin
  foreach t in array tablas loop
    execute format('drop policy if exists %I on public.%I;', t || '_select_auth', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true);',
      t || '_select_auth', t
    );
  end loop;
end $$;

-- --- 2. personas: el director ve solo las de su repartición --------------------
drop policy if exists personas_select_director on public.personas;
create policy personas_select_director on public.personas
  for select to authenticated
  using (reparticion_id in (select public.mis_reparticiones()));

-- --- 3. asignaciones: el director ve las de su gente ---------------------------
drop policy if exists asignaciones_select_director on public.asignaciones;
create policy asignaciones_select_director on public.asignaciones
  for select to authenticated
  using (public.persona_en_mis_reparticiones(persona_id));
