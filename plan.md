# Plan de trabajo — Capital humanIA

> Plan vivo: **dónde estamos, qué falta y por qué**. Se actualiza a medida que se
> cierra cada punto.
>
> Este documento cubre la **propuesta de Capital Humano** (Etapas 1–3: integración
> Civitas → asignación de funciones → evaluación y aprobación) y el trabajo que se
> apoya encima. Para el estado general del proyecto y las trampas conocidas,
> [`CONTEXT.md`](CONTEXT.md); para el plan original por etapas técnicas,
> [`docs/roadmap.md`](docs/roadmap.md).
>
> ⚠️ **Cuidado con la numeración.** La propuesta de Capital Humano habla de
> "Etapas 1/2/3", que **no** son las Etapas del `roadmap.md` interno (0–8). Cuando
> acá dice "Etapa 2/3" sin aclarar, es la de Capital Humano.

---

## 1. Dónde estamos

**Migraciones aplicadas: `0001`–`0027`.** Todo en la rama `matias`.

| Etapa (Capital Humano) | Estado |
|---|---|
| 1 · Integración con Civitas | ⏸️ **Diferida** — no hay acceso al sistema todavía |
| 2 · Asignación de funciones | ✅ El director/secretario carga y asigna su personal |
| 3 · Solicitudes y aprobación | ✅ Alta, bandeja, evaluar, aprobar y rechazar con motivo |

Civitas es privado y Capital Humano todavía no dio acceso; recién ahí se verá si
se puede integrar por API. Por eso la Etapa 1 quedó para el final y las
fundaciones se construyeron localmente, dejando `reparticiones.external_id` y
`personas.legajo` (único) como enganches para el *upsert* futuro.

---

## 2. Lo que está hecho

### Fundaciones — roles, reparticiones y RLS ✅

Eran el bloqueo transversal: sin roles ni reparticiones no arrancaba ni la
Etapa 2 ni la Etapa 3. El proyecto ya lo tenía anotado como próximo paso obligado
en tres lugares (cabecera de la `0008`, `CONTEXT.md` §4, `roadmap.md` Etapa 5).

- **Reparticiones** (`0010`, `0011`, `0016`, `0017`): organigrama de tres niveles
  —secretaría → subsecretaría → dirección— cargado del POA 2026. Hoy: **9
  secretarías, 7 subsecretarías, 53 direcciones**. ABM completo desde la app, con
  un trigger que impide ciclos en la jerarquía (`0017`): un ciclo no da error
  visible, simplemente hace desaparecer del árbol a las unidades involucradas y
  vuelve poco confiable el alcance del secretario.
- **Roles** (`0009`, `0014`): `admin`, `secretario` y `director`.
  `handle_new_user()` dejó de crear admins. Panel de gestión de usuarios en la
  app, así que Capital Humano ya no depende de SQL para dar de alta a alguien.
- **Vínculo usuario ↔ repartición**: `perfil_reparticiones` (N:N) — un director
  puede tener varias reparticiones a cargo.
- **RLS por repartición** (`0012`, `0015`): el director ve el nomenclador entero
  (lectura) y **solo las personas de su repartición**. El secretario, lo mismo
  pero con alcance a toda su secretaría, resuelto con un `with recursive` sobre el
  organigrama dentro de `mis_reparticiones()`. Pasó revisión adversarial: se
  corrigió un oráculo `SECURITY DEFINER` que filtraba la repartición de cualquier
  persona.

### Etapa 2 — asignación de funciones ✅

- El director y el secretario **asignan y desasignan puestos** a su gente
  (`0018`). Antes `asignar_persona` exigía `is_admin()`, así que veían a su
  personal y no lo podían mover: lo seguía haciendo Capital Humano a mano.
- También **dan de alta personas**, acotado a su repartición por la base
  (`personas_insert_director`). Se habilitó porque Civitas está diferido: sin eso
  no hay ninguna vía de carga y la asignación self-service queda inerte por falta
  de a quién asignar.

### Etapa 3 — solicitudes ✅

Tabla `solicitudes` (`0013`), alta para el director, bandeja para Capital Humano,
evaluación reusando el formulario técnico de 10 campos que ya existía, aprobación
que llama a `crear_puesto` y rechazo con motivo.

### Correcciones del segundo testeo con usuarios (2026-08-27) ✅

Capital Humano mandó tres cosas, y las tres apoyaban en el mismo malentendido:
**creer que Civitas es la fuente de estos datos**. No lo es —el padrón vino de la
liquidación y el organigrama lo ordena CapitalIA—, así que las respuestas salieron
distintas entre sí.

- **Nombre y legajo, bloqueados en la ficha de la persona.** No era solo una
  cuestión de permisos: la sincronización mensual reescribe `full_name` de toda
  persona ya cargada (`scripts/importacion/importar.mjs`), así que corregir un
  nombre ahí se perdía en silencio en la corrida siguiente. El campo prometía algo
  que el sistema no cumplía. Ahora los dos se muestran como texto con el motivo, y
  `full_name` salió del esquema y del UPDATE, no solo de la pantalla.
- **La repartición sigue editable, con la aclaración en pantalla** (decisión #13).
  Es dato propio de CapitalIA: la liquidación dice dónde se le *paga* a alguien, la
  sincronización nunca la reescribe y no existe otra fuente. Bloquearla congelaba
  las 4.706 personas con el sector de sueldos. Se renombró el campo a "Repartición
  donde presta servicios" y dice de dónde sale.
- **El organigrama queda como estaba: solo admin** (decisión #14). El director y el
  secretario nunca pudieron editarlo. Pasarlo a solo lectura dejaba a Capital
  Humano sin forma de crear, renombrar ni desactivar una unidad sin SQL, y
  contradice la decisión #4.
- **"Asignar puesto" desde la fila de la persona** (decisión #15). Existía desde la
  `0018`, pero solo desde la ficha del puesto; la consulta que llegó —"¿todavía
  falta generar la funcionalidad?"— es la prueba de que ahí no se encuentra. Con
  4.706 personas cargadas y 0 asignadas, el recorrido natural es persona → puesto.
  Reusa `asignarPersona`, así que el alcance lo sigue cortando la base.
- De paso, **`actualizarReparticion` dejó de tener el UPDATE mudo**: sin
  `.select()` anunciaba "Repartición actualizada" sin haber guardado nada. Estaba
  anotado como defecto vivo en `docs/estado-importacion.md`.

Falta **ejercitarlo con un login real** (§4), que es donde este proyecto encuentra
sus defectos.

### Dashboard y correcciones

- Dashboard con puestos, fichas, organigrama, dotación y solicitudes pendientes,
  más el reparto por secretaría y por agrupamiento.
- Se sacó la tarjeta "Pendientes de verificar": las 210 fichas siguen en
  `pending`, pero **todavía no existe la pantalla para marcarlas verificadas**, y
  anunciarlas como pendientes era reclamar una tarea que no se puede hacer. Vuelve
  cuando exista esa pantalla, y como progreso (`12/210`), no como reclamo.
- **Bug de roles** (`40f31f8`): `getSessionRole()` no reconocía `secretario` y
  devolvía `null`, así que `/configuracion` le mostraba "—" y la app no lo podía
  distinguir de un director. La causa era tener la lista de roles escrita en dos
  lados; ahora hay una sola en `src/lib/roles.ts`.
- **Bug de conteo** (`5be9042`): el reparto por agrupamiento sumaba 211 bajo el
  título "los 210 puestos vigentes". Un puesto archivado conserva su versión
  vigente y se colaba el puesto de prueba `ZZZ`. Corregido, y ahora coincide
  exacto con el reparto documentado de la ingesta.

### Correcciones del primer testeo con usuarios (2026-08-10) ✅

Capital Humano probó el sistema y mandó cuatro cosas. Las cuatro están hechas
—código + migraciones `0019`/`0020`—; falta **ejercitarlas con un login real**,
que es donde el proyecto encontró sus ocho defectos (ver §4 y `CONTEXT.md` §4).

- **Cerrar sesión no se encontraba.** Estaba solo en el menú del avatar. Se sumó
  al pie del sidebar y del menú móvil, con un chevron en el avatar como pista de
  que es un desplegable.
- **La contraseña temporal no se podía cambiar.** No existía la pantalla. Ahora
  `must_change_password` (`0019`) obliga a cambiarla en el primer ingreso
  (`/cambiar-clave`), con enlace voluntario desde Configuración. El helper
  `debeCambiarClave()` **falla abierto**: sin la migración aplicada no bloquea a
  nadie, así que el deploy del código no depende del orden con el SQL.
- **No se sabía dónde ver los archivados.** El nomenclador los filtraba a
  propósito. Se agregó el filtro Estado (Vigentes / Archivados / Todos) con badge
  "Archivado"; el link lleva a la ficha, donde el admin ya restaura.
- **Registro desde el login.** Una persona sin cuenta pide acceso (nombre,
  apellido, mail, legajo) y el pedido queda pendiente en `/solicitudes-acceso`,
  donde un admin lo aprueba —crea el usuario reusando el alta— o lo rechaza. La
  escritura es pública (rol anónimo) por la función `solicitar_acceso` (`0020`),
  con índice único parcial para que no se apilen pedidos del mismo mail y sin
  revelar si el email ya tiene cuenta.

---

## 3. Lo que falta

En orden de valor, acordado el 2026-07-27.

### 3. Dashboard por rol + cobertura 🔜 *(el que sigue)*

El dashboard es de admin. Un director entra y ve "9 secretarías · 7
subsecretarías · 53 direcciones · 210 fichas históricas": cuatro tarjetas sobre un
municipio que él no gestiona. Le falta lo único que le importa —su repartición:
cuánta gente tiene, cuántos con puesto y cuántos sin, sus solicitudes abiertas—, y
todo eso ya sale con lo que hay (`getSessionRole()` + RLS).

Y hay un cruce que **nunca se hizo**: `positions` × `asignaciones`. La pregunta
que Capital Humano se hace todos los días —"¿qué puestos están cubiertos y cuáles
vacantes?"— el sistema la puede contestar y no la contesta. Hoy daría "2 de 210
con dotación cargada", y ese número *es* la métrica de avance del proyecto.

De paso: dos tarjetas dicen el mismo 210 (Puestos y Fichas históricas) y se leen
como un error. Compactar.

### 4. Actividad reciente en el dashboard

`resumenAuditoria()` y `listarAuditoria()` **ya están escritas** y devuelven
eventos legibles con autor y link; solo las usa `/auditoria`. Cinco líneas de
"últimos movimientos" en el dashboard es código ya hecho.

### 5. Verificación de fichas

Las 210 están en `verification_status = 'pending'` porque nadie las contrastó
contra el papel, y **no hay pantalla para marcarlas**. Es tarea de Capital Humano,
que son los usuarios que tenemos. Botón "Verificada contra el papel" en la ficha
(las columnas `verified_by` / `verified_at` ya existen) y el número vuelve al
dashboard como progreso.

### Más adelante

- **Etapa 6 del roadmap:** comparar puestos campo a campo y detectar similares con
  `pg_trgm`. El índice GIN trigram sobre `position_versions.name` ya existe.
- **El asistente no conoce el organigrama.** Le pasamos los 210 puestos y nada
  más. Dejar personas afuera está bien y es deliberado, pero las reparticiones no
  son dato sensible —lo dice la propia RLS— y son ~2k tokens: habilita "¿qué
  direcciones dependen de la Secretaría de Gobierno?".
- **Etapa 1 · Civitas**, cuando haya acceso: *upsert* de reparticiones por
  `external_id` y de legajos por `personas.legajo`.

---

## 4. Verificaciones pendientes

> Regla del proyecto: *"que compile no significa que funciona"* (`CONTEXT.md` §4 —
> ocho defectos aparecieron la primera vez que se ejercitaron dos circuitos, con
> `lint`, `typecheck` y `build` en verde los ocho). Cada bloque se **ejercita**, no
> solo se compila. Y en RLS un error no es cosmético: es fuga de datos de personal.

Del test del director (usuario `matiaslujanw@gmail.com`, Dirección de IA):

| Qué | Estado |
|---|---|
| `/personas` muestra solo su gente (1 de 2) | ✅ Verificado en pantalla |
| Las rutas de admin (`/usuarios`, `/puestos/nuevo`) redirigen de verdad | ✅ Verificado |
| El sidebar oculta lo de admin | ✅ Verificado |
| La ficha de un puesto con gente ajena no la muestra | 🔶 Leído del SQL (`asignaciones_select_director`), no observado |
| **Escritura**: cargar y asignar personal de su repartición | ⏳ Pendiente — es lo que habilitó la `0018` |

Del testeo con usuarios (2026-08-10), hecho en código pero **sin ejercitar con
login real**:

| Qué | Estado |
|---|---|
| Cerrar sesión desde el sidebar y el menú móvil | ⏳ Pendiente de probar |
| Forzar el cambio de la contraseña temporal en el primer ingreso | ⏳ Pendiente — depende de la `0019` |
| Filtro de archivados en el nomenclador | ⏳ Pendiente de probar |
| Solicitar acceso desde el login → aprobar/rechazar en la bandeja | ⏳ Pendiente — depende de la `0020` |

Del segundo testeo con usuarios (2026-08-27), hecho en código y **sin ejercitar
con login real**:

| Qué | Estado |
|---|---|
| Nombre y legajo ya no se pueden editar en la ficha de la persona | ⏳ Pendiente de probar |
| Guardar una corrección (email / repartición / baja) sin mandar `full_name` | ⏳ Pendiente de probar |
| Asignar un puesto desde la fila del agente | ⏳ Pendiente — es el circuito nuevo |
| Cambiar de puesto desde la fila, que cierra la asignación anterior | ⏳ Pendiente — no se ejercitó por ninguna vía |
| Editar una repartición avisa si no guardó, en vez de redirigir mudo | ⏳ Pendiente de probar |

Y sigue sin resolverse:

- **Datos de prueba `ZZZ` en producción.** El puesto `ZZZ PRUEBA TECNICA`
  (`SG-I-0008`) no se puede borrar (`prevent_delete`, a propósito), pero la
  persona `TEST-0001` sí. Limpiar al cerrar el test del director.

---

## 5. Decisiones tomadas

| # | Decisión | Definición |
|---|---|---|
| 1 | Modelo de roles | `admin` + `secretario` + `director`, enum extensible |
| 2 | Cardinalidad usuario↔repartición | N:N (`perfil_reparticiones`) |
| 3 | Alcance del director | Solo su repartición |
| 3b | Alcance del secretario | Su secretaría entera, recursivo por el organigrama |
| 4 | Reparticiones sin Civitas | ABM en la app; las cargan ellos |
| 5 | Gestión de usuarios | Panel en la app, sin SQL |
| 6 | Nombre del rol | `director` |
| 7 | ¿Separar evaluación técnica de aprobación? | No se separó: el admin hace las dos. No sobre-diseñar |
| 8 | `personas.area` | Reemplazado por `reparticion_id`; falta el `drop` de la columna vieja |
| 9 | ¿El director da de alta personas, o solo asigna? | **Las dos.** Sin Civitas no hay otra vía de carga |
| 10 | ¿El director edita o da de baja personas? | **No.** Carga y asigna; corregir o dar de baja es de Capital Humano |
| 11 | ¿Se acota a qué puesto puede asignar? | **No.** El nomenclador es municipal; lo acotado es sobre *quién* se opera |
| 12 | Fichas pendientes de verificar en el dashboard | Fuera hasta que exista la pantalla para verificarlas |
| 13 | ¿Se bloquea la repartición de la persona, como el nombre? | **No.** Es dato propio de CapitalIA y no hay otra vía de corrección; se aclara en pantalla |
| 14 | ¿El organigrama pasa a solo lectura? | **No.** Sigue siendo ABM solo-admin, como la #4 |
| 15 | ¿Asignar puesto desde el listado de personas? | **Sí**, además de la ficha del puesto. Misma acción y mismo alcance |

---

## 6. Riesgos y trampas

- **RLS mal escrita = fuga de datos de personal.** Es el punto más sensible del
  proyecto y ahora también hay escritura. Se prueba con un usuario `director`
  real, no leyendo el SQL.
- **Las migraciones se pegan a mano** en el SQL Editor; no se usa `db push`. Si
  alguien lo corre por primera vez, va a intentar aplicarlas todas de nuevo.
- **Datos personales.** El alcance mínimo de `personas` (legajo, nombre, email,
  repartición) sigue vigente: sin DNI, CUIL, salario, licencias ni evaluaciones.
  Ver la cabecera de la `0008`.
- **`database.types.ts` no está generado**: las consultas tipan sus formas a mano
  en cada archivo de `data/`.
- **Next.js 16 no es el que conocés**: `params`/`searchParams` son Promesas y el
  middleware se llama `proxy`. Leer `node_modules/next/dist/docs/`.

---

*Última actualización: 2026-08-27. Migraciones `0001`–`0027` aplicadas. Etapas 2 y
3 de Capital Humano cerradas; se sumaron las correcciones del primer y del segundo
testeo con usuarios (§2), las dos pendientes de ejercitar con login real (§4).*
