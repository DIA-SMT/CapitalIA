-- =============================================================================
-- Capital humanIA — 0004 · Row Level Security
-- Ninguna tabla del nomenclador es pública. Solo usuarios autenticados con
-- perfil admin activo pueden leer/escribir. Las operaciones pasan por is_admin().
-- =============================================================================

-- code_sequences: sin acceso directo; se usa solo vía funciones SECURITY DEFINER.
alter table public.code_sequences enable row level security;

-- --- profiles -----------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles_select_self_or_admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "profiles_insert_admin" on public.profiles
  for insert to authenticated
  with check (public.is_admin());

create policy "profiles_update_admin" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- --- audit_logs: solo lectura para admin (inserta el trigger SECURITY DEFINER) -
alter table public.audit_logs enable row level security;

create policy "audit_select_admin" on public.audit_logs
  for select to authenticated
  using (public.is_admin());

-- --- Resto de tablas: acceso total solo para admin ----------------------------
do $$
declare
  t text;
  admin_tables text[] := array[
    'position_families',
    'groupings',
    'levels',
    'technical_areas',
    'risk_levels',
    'competencies',
    'risks',
    'knowledge_items',
    'responsibilities',
    'source_documents',
    'positions',
    'position_versions',
    'position_version_competencies',
    'position_version_risks',
    'position_version_responsibilities',
    'position_version_knowledge',
    'source_references'
  ];
begin
  foreach t in array admin_tables loop
    execute format('alter table public.%I enable row level security;', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      'using (public.is_admin()) with check (public.is_admin());',
      t || '_admin_all', t
    );
  end loop;
end;
$$;
