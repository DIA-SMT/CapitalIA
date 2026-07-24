# Plan — Fundaciones: Roles + Reparticiones

> Base para las **Etapas 1–3 de la propuesta de Capital Humano** (integración
> Civitas → asignación de funciones y solicitudes → evaluación y aprobación).
> Este documento aterriza **solo las fundaciones**: el modelo de roles y las
> reparticiones. Todo lo demás se apoya encima y se diseña acá para soportarlo.
>
> ⚠️ Cuidado con la numeración: la propuesta de Capital Humano habla de
> "Etapas 1/2/3", que **no** son las Etapas del [`roadmap.md`](docs/roadmap.md)
> interno (0–8). Cuando digo "Etapa 2/3" acá, es la de Capital Humano.

---

## 1. Por qué esto va primero

- Es lo **transversal**: sin roles ni reparticiones, no se puede empezar ni la
  Etapa 2 (directores con acceso acotado) ni la Etapa 3 (separar solicitante de
  administrador). Todo lo demás depende de esto.
- **El proyecto ya lo tenía anotado como el próximo paso obligado**, en tres
  lugares: cabecera de la migración `0008`, [`CONTEXT.md`](CONTEXT.md) §4 ("el día
  que entre un tercer usuario… hay que armar roles primero. No es opcional a
  partir de ahí") y `roadmap.md` Etapa 5.
- **No depende de Civitas.** Construimos las reparticiones localmente y dejamos el
  hueco (`external_id`) para que Civitas las alimente cuando haya acceso.
- **El momento es bueno:** `personas` y `asignaciones` están en **0 filas reales**
  (solo el registro de prueba `ZZZ`/`TEST-0001`). Normalizar `personas.area` a una
  FK **no tiene migración de datos dolorosa** — es prácticamente hoja en blanco.

---

## 2. Alcance de este plan

**Entra:**
- Modelo de roles (más allá de `admin`).
- `reparticiones` como entidad (con lugar para el organigrama y para Civitas).
- Vínculo usuario ↔ repartición.
- Reescritura de la RLS: de `is_admin()` todo-o-nada → por rol y por repartición.
- Cambiar `handle_new_user()` (hoy hace admin a todos).
- Normalizar `personas.area` → `reparticion_id`.
- Mínimo de gestión de usuarios/roles para poder operar.

**No entra** (se construye encima, en su propia etapa, pero se diseña para que
encaje):
- Tabla y flujo de **solicitudes** (Etapa 2/3 de Capital Humano).
- **Asignación self-service** por directores.
- **Sync con Civitas** (Etapa 1).

---

## 3. De dónde partimos (estado real, verificado en código)

| Pieza | Hoy | Archivo |
|---|---|---|
| Roles | `user_role` tiene **un solo valor**: `'admin'` | `migrations/…0001_init.sql:13` |
| Alta de usuario | Todo usuario nuevo nace **admin** | `…0003_positions.sql:308` (`handle_new_user`) |
| Autorización | Toda la RLS es `is_admin()` → **todo o nada** | `…0004_rls.sql` |
| Repartición | No existe como entidad; solo `personas.area` (texto libre) | `…0008_personas.sql:25` |
| Vínculo usuario↔repartición | No existe | `profiles` no tiene la columna |
| Rol en la app | No se lee; `/configuracion` lo muestra **hardcodeado** | `src/app/(app)/configuracion/page.tsx` |
| Dotación real | `personas`/`asignaciones` en **0 filas** | `CONTEXT.md` §1 |
| Migraciones | `0001`–`0008` aplicadas | `supabase/migrations/` |

Nota: **`architecture.md` §5 ya había propuesto** roles `lector`/`editor`/`admin`
con RLS en dos capas. Nunca se implementó. Lo reconciliamos abajo — el director de
la propuesta no encaja como `lector`/`editor` (esos editaban el nomenclador; el
director **no** edita el nomenclador).

---

## 4. Diseño propuesto

### 4.1 Roles

Para lo que pide Capital Humano alcanzan **dos roles** (el enum queda extensible):

| Rol | Qué puede hacer |
|---|---|
| `admin` (Capital Humano) | Todo: nomenclador (alta/versión/baja), **aprobar/rechazar** solicitudes, gestión de usuarios y reparticiones, ve **todo** el personal. |
| `director` *(nombre a definir)* | Acotado a **su(s) repartición(es)**: consulta el nomenclador **vigente** (solo lectura), ve y gestiona la **dotación de su gente**, **crea solicitudes** de puestos nuevos. **No** edita el nomenclador. |

Cambios que implica:
- `ALTER TYPE public.user_role ADD VALUE 'director';` (el enum ya se pensó
  extensible, ver comentario en `0001_init.sql:11`).
- Reescribir `handle_new_user()`: dejar de asignar `admin` por defecto → rol
  mínimo, sin repartición, hasta que un admin lo habilite. **Los 2 admins actuales
  no se tocan** (el trigger solo dispara en usuarios nuevos).
- Leer el rol en la app: un helper `getSessionProfile()`/`getRole()` en
  `lib/supabase/server.ts`, y `/configuracion` deja de hardcodear el badge.

### 4.2 Reparticiones

```
reparticiones
  id            uuid pk
  code          text unique          -- código corto / interno
  nombre        text
  parent_id     uuid null → reparticiones.id   -- organigrama (jerarquía opcional)
  external_id   text null unique     -- ⟵ hueco reservado para el ID de Civitas
  is_active     boolean
  created_at / updated_at
```

- `parent_id` deja el organigrama **modelable** aunque al principio scopeemos
  plano (ver Decisión 3).
- `external_id` es el enganche para que Civitas haga *upsert* sin duplicar.
- `personas.area` (texto) → se agrega `personas.reparticion_id` FK. Como no hay
  datos reales, es limpio.

### 4.3 Vínculo usuario ↔ repartición

**Decidido: N:N** — tabla puente `perfil_reparticiones (perfil_id, reparticion_id)`,
para que un director pueda tener varias reparticiones a cargo (ver Decisión 2).

### 4.4 RLS nueva (el corazón, y lo más delicado)

Helpers `SECURITY DEFINER` (evitan recursión de RLS, como el `is_admin()` actual):
- `is_admin()` — ya existe.
- `mis_reparticiones()` — devuelve el set de `reparticion_id` del usuario actual.

Políticas objetivo:

| Tabla | `admin` | `director` |
|---|---|---|
| `positions` / `position_versions` / catálogos | todo | **solo SELECT** (nomenclador vigente) |
| `personas` / `asignaciones` | todo | solo filas de **sus** reparticiones |
| `solicitudes` *(se agrega después)* | todo | crear + ver las de **su** repartición |

---

## 5. Trabajo por bloques — estado (al 2026-07-24)

Migraciones aplicadas: `0009`–`0012`. Todo commiteado en la rama `matias`.

- **Bloque 0 · Pre-vuelo.** ✅ Resuelto: el SQL se pega a mano en el editor (no se
  usa `db push`), así que no hay historial que reparar; seguimos numerando archivos.
- **Bloque 1 · Reparticiones.** ✅ Tabla `reparticiones` (`0010`) + carga del
  organigrama del POA 2026 (`0011`: 9 secretarías + 53 direcciones) + página
  `/reparticiones`. Pendiente: el ABM (crear/editar desde la UI).
- **Bloque 2 · Roles.** ✅ Rol `director` (`0009`); `handle_new_user` deja de crear
  admins (`0010`); helper `getSessionRole()` + gateo de la UI por rol.
- **Bloque 3 · Vínculo + personas.** ✅ `perfil_reparticiones` (N:N) +
  `personas.reparticion_id` + selector de repartición en el alta de personas.
- **Bloque 4 · RLS.** ✅ `0012`: el director lee el nomenclador y ve **solo** las
  personas de su repartición; sin escritura. Pasó revisión adversarial (se corrigió
  un oráculo `SECURITY DEFINER` que filtraba la repartición de cualquier persona).
- **Bloque 5 · Ejercitar de punta a punta.** 🔶 En curso: se creó un director de
  prueba (`matiaslujanw@gmail.com`, Dirección de IA) + una persona en esa
  repartición. Falta confirmar, logueado como director, que ve **solo su gente** y
  no puede escribir. Limpiar los datos de prueba (`ZZZ`) al cerrar.

> Regla del proyecto que respetamos: *"que compile no significa que funciona"*
> (`CONTEXT.md` §4 — aparecieron 8 defectos la primera vez que se ejercitaron los
> circuitos, con `lint`/`typecheck`/`build` en verde). Cada bloque se **ejercita**,
> no solo se compila. Y en RLS, un error no es un bug cosmético: es **fuga de datos
> de personal**.

---

## 6. Decisiones (esto es lo que hay que definir)

Decisiones 1–4 y 6 confirmadas; 5, 7 y 8 en curso o diferidas.

| # | Decisión | Definición | Estado |
|---|---|---|---|
| 1 | Forma del modelo de roles | **`admin` + `director`** — dos roles, enum extensible | ✅ Decidido |
| 2 | Cardinalidad usuario↔repartición | **N:N** — tabla puente `perfil_reparticiones` | ✅ Decidido |
| 3 | Alcance de "personal dependiente" | **Solo su repartición** (plano); `parent_id` queda preparado para el organigrama de Civitas | ✅ Decidido |
| 4 | Reparticiones sin Civitas | **ABM y las cargan ellos**; para construir/probar uso datos de prueba mientras tanto | ✅ Decidido |
| 5 | Gestión de roles/repartición por usuario | **SQL/dashboard por ahora**; panel de admin en la app pendiente (próxima sesión) | 🔶 En uso (SQL) |
| 6 | Nombre del rol | **`director`** | ✅ Decidido |
| 7 | ¿Separar evaluación técnica de aprobación? | admin hace las dos · o sumar `analista` | ⏳ Diferible — sugerido: no sobre-diseñar |
| 8 | `personas.area` | se agregó `reparticion_id` y la app usa eso; `area` quedó **sin uso** | 🔶 Migrado; falta el `drop` de `area` |

---

## 7. Riesgos y trampas conocidas

- **RLS mal escrita = fuga de datos de personal.** Es el punto más sensible. Se
  prueba con un usuario `director` real, no solo leyendo el SQL.
- **Historial de migraciones desincronizado** (`CONTEXT.md` §4). Resolver en el
  Bloque 0 antes de agregar la `0009`.
- **Datos personales.** Recién con roles se habilita exponer personal a no-admins.
  Mantener el alcance mínimo de `personas` (sin DNI/CUIL/salario) — sigue vigente.
- **`database.types.ts` no está generado**: las tablas nuevas se tipan a mano en
  `data/` hasta generarlo.
- **Next.js 16**: `params`/`searchParams` son Promesas; el middleware es `proxy`.

---

## 8. Lo que esto habilita después (fuera de este plan)

- **Etapa 2 (Capital Humano):** asignación self-service por directores (reusa
  `asignar_persona`, ya existe) + crear solicitudes.
- **Etapa 3:** bandeja de solicitudes + evaluación (el formulario técnico de 10
  campos **ya existe**) + aprobar (llama a `crear_puesto`, ya existe) / rechazar
  con motivo.
- **Etapa 1:** sync con Civitas — *upsert* de reparticiones por `external_id` y de
  legajos por `personas.legajo` (ya es único). El modelo queda preparado para
  recibirlo.

---

## 9. Próxima sesión — por dónde seguir

Las fundaciones (roles + reparticiones + RLS + gateo de la UI) están hechas y
aplicadas. Lo que sigue, en orden:

1. **Cerrar el Bloque 5:** confirmar el test del director (ve solo su gente, no
   escribe). Después, limpiar los datos de prueba `ZZZ`.
2. **Escritura del director (Etapa 2 en serio):**
   - Que el director **asigne puestos a su gente** — adaptar `asignar_persona`, que
     hoy exige `is_admin()`, para aceptar al director acotado a su repartición.
   - **Solicitudes de puestos nuevos:** tabla `solicitudes` (nombre + descripción +
     estado pendiente/aprobada/rechazada + repartición + solicitante) + pantalla de
     alta para el director.
3. **Panel de gestión de usuarios (admin):** que Capital Humano cree los directores
   y les asigne repartición **desde la app**, sin Supabase ni SQL (decisión 5).
4. **Etapa 3:** bandeja de solicitudes + evaluar (el formulario técnico de 10 campos
   ya existe) + aprobar (llama a `crear_puesto`) / rechazar con motivo.
5. Cuando quieras: **ABM de reparticiones** (editar el organigrama desde la UI) y,
   más adelante, **Civitas** (Etapa 1).

---

*Última actualización: 2026-07-24. Fundaciones (Bloques 0–4) hechas; Bloque 5 en
verificación. Migraciones 0009–0012 aplicadas.*
