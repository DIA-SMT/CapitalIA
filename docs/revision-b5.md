## Veredicto

Los 12 hallazgos son 8: #2=#9, #3=#11, #7=#12, #8=#10.

**Antes de commitear (4).** Le mienten al usuario: muestran una lista recortada como si fuera completa, o un control dice que hizo algo que no hizo.

| # | Qué miente |
|---|---|
| #8/#10 | El selector de asignación ofrece un tramo del abecedario como si fuera todo; y llega a imprimir "No hay personas activas sin puesto asignado", que es falso. |
| #2/#9 | El input muestra un filtro que no está aplicado, "Limpiar" desaparece, y 300 ms después la app se re-filtra sola: Atrás y el ítem "Personas" del menú parecen rotos. |
| #3/#11 | "Limpiar" deja puestos `rep` y `estado`. No se autocorrige. |
| #1 | "Sin coincidencias" sobre alguien que existe — la mentira exacta que este cambio vino a matar. El comentario de `personas.ts:106-108` declara una invariante que el código no cumple. |

**Después (4):** #4 (`push` en vez de `replace`), #5 (rebote de los selects), #6 (`pendiente`/`aria-busy` en la paginación), #7/#12 (`*` en `escaparLike`). Ninguno oculta datos: #4 y #6 son molestia y pulido, #5 se autocorrige solo, #7 falla por exceso y es autoevidente (tecleás `*`, ves de más, borrás el `*`).

---

## 1 · `listarPersonasSinPuesto()` — filtrar en la base y decir cuántos hay

El filtro "sin puesto" corre en JS **después** del corte de 1.000 filas. No es expresable en PostgREST (`not exists` no existe del lado del cliente), así que va una función. **SECURITY INVOKER a propósito** (sin `security definer`): tiene que correr bajo la RLS de quien llama, si no el director pasa a ver personas de otras reparticiones. El `not exists` queda bajo la misma RLS que el embed que reemplaza, así que en esa dimensión no cambia nada.

`supabase/migrations/20260716120024_personas_sin_puesto.sql` (nueva):

```sql
-- =============================================================================
-- Capital humanIA — 0024 · Candidatos a asignar, resueltos en la base
--
-- POR QUÉ: `listarPersonasSinPuesto()` traía personas sin acotar y descartaba en
-- JS a las que ya tienen puesto. PostgREST corta en 1.000 filas (max_rows en
-- config.toml) con HTTP 200 y sin error, y como el corte pasa ANTES del filtro,
-- el <select> de la ficha del puesto muestra un puñado de opciones verosímil sin
-- ninguna señal de que falta gente. Con 4.771 personas, a Zurita no se lo puede
-- asignar y la pantalla no lo dice. Es el mismo defecto que la 0022 vino a cerrar.
--
-- SIN security definer, a propósito: corre con la RLS del que llama, igual que la
-- consulta que reemplaza. Con definer, el director vería a todo el municipio.
--
-- `total` sale de una ventana: se calcula antes del LIMIT, así que la UI puede
-- avisar cuando hay más de los que muestra.
-- =============================================================================

create or replace function public.personas_sin_puesto(q text default '', limite int default 200)
returns table (id uuid, legajo text, full_name text, total int)
language sql
stable
set search_path = public
as $$
  select p.id, p.legajo, p.full_name, (count(*) over ())::int
  from public.personas p
  where p.is_active
    and not exists (
      select 1 from public.asignaciones a
      where a.persona_id = p.id and a.valid_until is null
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
  'puesto. Acotada y con el total real, para que un recorte nunca se lea como '
  'la lista completa. SECURITY INVOKER: el alcance lo pone la RLS.';

revoke all on function public.personas_sin_puesto(text, int) from public;
grant execute on function public.personas_sin_puesto(text, int) to authenticated;
```

`src/features/personas/data/personas.ts:271-299` — reemplazar la función entera:

```ts
/** Tope de opciones del selector. Por encima, hace falta buscar. */
const MAX_SIN_PUESTO = 200;

export type CandidatosSinPuesto = {
  personas: { id: string; nombre: string; legajo: string }[];
  /** Cuántos hay en el alcance del usuario, no cuántos vinieron. */
  total: number;
};

/**
 * Candidatos para asignar a un puesto. El filtro y el recorte los hace la base:
 * si se filtrara en JS, el corte de 1.000 filas de PostgREST dejaría afuera a la
 * segunda mitad del abecedario sin ningún aviso.
 */
export async function listarPersonasSinPuesto(q = ""): Promise<CandidatosSinPuesto> {
  const vacio: CandidatosSinPuesto = { personas: [], total: 0 };
  if (!isSupabaseConfigured()) return vacio;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("personas_sin_puesto", {
    q: normalizarBusqueda(q),
    limite: MAX_SIN_PUESTO,
  });

  if (error) {
    console.error("[personas] listarPersonasSinPuesto:", error.message);
    return vacio;
  }

  type Fila = { id: string; legajo: string; full_name: string; total: number };
  const filas = (data ?? []) as Fila[];

  return {
    personas: filas.map((p) => ({ id: p.id, nombre: p.full_name, legajo: p.legajo })),
    total: filas[0]?.total ?? 0,
  };
}
```

`src/features/personas/components/personas-del-puesto.tsx` — el prop pasa a llevar el total, y la pantalla deja de afirmar algo falso:

```tsx
  /** Personas activas sin puesto. Ya viene acotado por RLS y por `limite`. */
  disponibles: CandidatosSinPuesto;
```

```tsx
            {disponibles.total === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay personas activas sin puesto asignado. Cargá una desde{" "}
                <strong>Personas</strong>, o quitá a alguien de su puesto actual.
              </p>
            ) : (
              <>
                <label htmlFor="persona" className="text-sm font-medium">
                  Elegí la persona
                </label>
                <select id="persona" value={elegida} onChange={(e) => setElegida(e.target.value)} /* … */>
                  <option value="">Elegir…</option>
                  {disponibles.personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} — legajo {p.legajo}
                    </option>
                  ))}
                </select>
                {disponibles.total > disponibles.personas.length && (
                  <p className="text-xs text-muted-foreground">
                    Se muestran {disponibles.personas.length} de{" "}
                    {disponibles.total.toLocaleString("es-AR")} personas sin puesto,
                    en orden alfabético.
                  </p>
                )}
              </>
            )}
```

`src/app/(app)/puestos/[id]/page.tsx:95` no cambia: la firma sigue aceptando cero argumentos.

El selector con búsqueda tipeada (usando el parámetro `q` que ya quedó) es el ítem siguiente. No bloquea el commit porque la pantalla ya deja de mentir.

## 2 · `tabla-personas.tsx` — la URL manda, y las navegaciones componen sobre lo pedido

Un solo patch cierra #2/#9 y #3/#11: las dos salen de leer `useSearchParams()` como si fuera la verdad. Durante una transición pendiente devuelve la URL **vieja**, y cuando la URL cambia por afuera nadie sincroniza el input.

Reemplazar `personas/components/tabla-personas.tsx:49-92`:

```tsx
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pendiente, startTransition] = useTransition();

  // El input se maneja solo mientras se tipea; la URL se actualiza después.
  const [texto, setTexto] = useState(filtros.q ?? "");

  /**
   * La query que pedimos por última vez. `useSearchParams()` no sirve de base:
   * mientras la navegación está en vuelo sigue devolviendo la anterior, así que
   * dos cambios seguidos —Limpiar y el eco de la espera de tipeo— se construirían
   * sobre filtros que el usuario ya sacó, y los reviven.
   */
  const pedido = useRef(params.toString());

  /**
   * Si la URL cambió por afuera del input —Atrás/Adelante, "Personas" en el menú,
   * un link pegado— manda la URL. Sin esto el input sigue mostrando el término
   * viejo y la espera de tipeo lo vuelve a empujar 300 ms después: el Atrás se
   * deshace solo y el ítem del menú parece muerto.
   */
  const urlActual = params.toString();
  const [urlVista, setUrlVista] = useState(urlActual);
  if (urlActual !== urlVista) {
    setUrlVista(urlActual);
    if (urlActual !== pedido.current) {
      pedido.current = urlActual;
      setTexto(filtros.q ?? "");
    }
  }

  /** Arma la URL cambiando solo lo que se pide y volviendo a la página 1. */
  function navegar(cambios: Record<string, string | undefined>) {
    const siguiente = new URLSearchParams(pedido.current);
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor) siguiente.set(clave, valor);
      else siguiente.delete(clave);
    }
    // Cambiar un filtro y quedarse en la página 7 muestra una lista vacía que
    // parece "no hay nada" en vez de "estás en una página que ya no existe".
    if (!("pagina" in cambios)) siguiente.delete("pagina");
    const qs = siguiente.toString();
    // Antes de navegar, no después: el cambio que venga tiene que componer sobre
    // esto y no sobre la URL que todavía devuelve useSearchParams().
    pedido.current = qs;
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  // Búsqueda con espera: sin esto habría una consulta por tecla. Se compara
  // contra lo pedido, no contra `filtros.q`, que llega tarde.
  useEffect(() => {
    const id = setTimeout(() => {
      const enUrl = new URLSearchParams(pedido.current).get("q") ?? "";
      if (texto.trim() !== enUrl) navegar({ q: texto.trim() || undefined });
    }, ESPERA_TIPEO);
    return () => clearTimeout(id);
    // `navegar` solo lee refs y valores estables; incluirlo reiniciaría la espera
    // en cada render y la búsqueda no saldría nunca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);
```

`primeraVez` se borra (y su `useRef` si no queda otro uso): al montar, `texto` ya coincide con la `q` de la URL, así que el guard no hacía nada. `limpiar()` queda igual: `setTexto("")` deja `texto === ""` y `pedido.current` ya no tiene `q`, así que el temporizador dispara, compara `"" !== ""` y no navega. `hrefPagina` sigue usando `params`: se renderiza junto a `listado`, que viene del mismo render commiteado.

Verificar a mano: Atrás y Adelante con búsqueda puesta, clic en "Personas" del menú con filtro puesto, y Limpiar con `?q=gomez&rep=<uuid>&estado=activa`.

## 3 · La columna `busqueda` tiene que normalizar como el JS

La lista de 48 caracteres de `translate()` no es equivalente a `NFD` + borrar combining marks. Dos agujeros: cualquier diacrítico fuera del set español (`KOVAČIĆ` no se encuentra ni tipeándolo perfecto), y —lo grave— si el padrón de la semana que viene viene en NFD, `translate()` no toca nada y **no se encuentra a nadie con tilde**, con la misma cara de "Sin coincidencias" de siempre. `normalize()` es IMMUTABLE desde PG13 y acá corre PG17 (`config.toml`), así que sirve en una columna generada.

`supabase/migrations/20260716120023_busqueda_normalizada.sql` (nueva):

```sql
-- =============================================================================
-- Capital humanIA — 0023 · `busqueda` normaliza igual que la app
--
-- POR QUÉ: la 0022 sacaba tildes con una lista fija de 48 caracteres
-- precompuestos y la app (normalizarBusqueda, personas.ts) con NFD + borrado de
-- combining marks. No es lo mismo, y el comentario de personas.ts afirma que sí:
--   · un diacrítico fuera de la lista (č, ć, š, ž, ā…) queda inencontrable aun
--     tipeando el nombre exacto, porque el JS lo saca y la columna no;
--   · si el padrón llega descompuesto (NFD, típico de un export de macOS),
--     translate() no toca nada y se cae la búsqueda del padrón entero.
-- Los dos síntomas son "Sin coincidencias" sobre gente que existe: exactamente
-- lo que la 0022 vino a evitar.
--
-- Ahora los dos lados hacen la MISMA operación, no dos listas que hay que
-- mantener sincronizadas: NFD, borrar U+0300–U+036F, minúsculas.
-- normalize() y regexp_replace() son IMMUTABLE, así que sirven en una generada.
--
-- Recrear la columna implica reescribir la tabla y el índice. Con este volumen
-- es inmediato, y tiene que pasar ANTES de importar el padrón.
-- Idempotente.
-- =============================================================================

drop index if exists public.idx_personas_busqueda_trgm;
alter table public.personas drop column if exists busqueda;

alter table public.personas
  add column busqueda text
  generated always as (
    lower(regexp_replace(
      normalize(
        coalesce(full_name, '') || ' ' ||
        coalesce(legajo, '')    || ' ' ||
        coalesce(email, ''),
        nfd
      ),
      -- El mismo rango de combining marks que borra normalizarBusqueda().
      '[\u0300-\u036f]', '', 'g'
    ))
  ) stored;

comment on column public.personas.busqueda is
  'Nombre, legajo y email juntos, en NFD sin combining marks y en minúscula. La '
  'app normaliza el término con la misma operación (normalizarBusqueda). Si los '
  'dos lados se desincronizan, buscar "Gómez" deja de encontrar a Gómez.';

create index if not exists idx_personas_busqueda_trgm
  on public.personas using gin (busqueda gin_trgm_ops);
```

`personas.ts` no cambia: `normalizarBusqueda()` ya hace `NFD` → strip → `toLowerCase` → `trim`, en ese orden. Sí conviene actualizar el comentario de la línea 103 para que apunte a la 0023 y diga que la equivalencia ahora es por construcción, no por dos listas paralelas.

Verificar contra la base: cargar una persona con `č` y buscarla, y una con el nombre en NFD (`'GO' || U&'\0301' || 'MEZ'`) y buscar "gomez".