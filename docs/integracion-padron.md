# El padrón para otros sistemas — `/api/padron`

> Para quien integra **otro sistema municipal** con CapitalIA y necesita los
> agentes y el organigrama. Del lado de CapitalIA no hay nada que instalar: es una
> URL con un token.

## Qué expone

| Recurso | Qué trae | Filas hoy |
|---|---|---|
| `agentes` (por defecto) | Un agente por fila, con su repartición ya resuelta | 4.706 |
| `reparticiones` | El organigrama aplanado, con el código del padre | 188 |

Los dos salen en JSON (por defecto) o en CSV (`?formato=csv`, abre en Excel).

**Es de solo lectura.** No hay `POST`, `PUT` ni `DELETE`: cualquier otro método
recibe un 405. Desde afuera no se puede escribir nada en CapitalIA.

## Autenticación

Una cabecera, con el valor de `PADRON_API_TOKEN`:

```
Authorization: Bearer <token>
```

| Respuesta | Qué pasó |
|---|---|
| `401` | Falta el token, o no es el que es |
| `404` | El endpoint está **apagado**: `PADRON_API_TOKEN` no está configurado en el servidor |
| `400` | El `recurso` que pediste no existe |

El 404 es a propósito: sin token configurado, el endpoint no existe para quien le
pegue. El motivo queda en los logs de Vercel, no en la respuesta.

## Ejemplos

```bash
# Todos los agentes, en JSON
curl -H "Authorization: Bearer $TOKEN" https://capital-ia-eight.vercel.app/api/padron

# El organigrama
curl -H "Authorization: Bearer $TOKEN" "https://capital-ia-eight.vercel.app/api/padron?recurso=reparticiones"

# Los agentes en CSV, a un archivo
curl -H "Authorization: Bearer $TOKEN" "https://capital-ia-eight.vercel.app/api/padron?formato=csv" -o padron.csv
```

```ts
const r = await fetch(`${CAPITALIA_URL}/api/padron`, {
  headers: { Authorization: `Bearer ${process.env.PADRON_API_TOKEN}` },
  cache: "no-store",
});
if (!r.ok) throw new Error(`padrón: ${r.status}`);
const { generado, total, datos } = await r.json();
```

## La forma de la respuesta

```jsonc
{
  "generado": "2026-10-30T14:22:08.290Z",  // de cuándo es la foto
  "recurso": "agentes",
  "total": 4706,                            // explícito: delata un recorte
  "datos": [
    {
      "legajo": "14385",
      "nombre": "APELLIDO NOMBRE",          // un solo campo, en MAYÚSCULAS
      "activo": true,
      "email": null,
      "reparticionCodigo": "SEC01",
      "reparticion": "Secretaría General",
      "reparticionTipo": "secretaria",      // secretaria | subsecretaria | direccion | subdireccion
      "reparticionIdGrh": "400",            // ← la columna para cruzar
      "secretaria": "Secretaría General"    // la raíz del árbol
    }
  ]
}
```

En `reparticiones`, cada unidad trae `codigo`, `nombre`, `tipo`, `idGrh`,
`dependeDe` (el **código** de la unidad padre, `null` si es secretaría) y `activa`.
Con eso se reconstruye el árbol sin pedir nada más.

## Tres cosas que conviene saber antes de integrar

1. **`email` viene vacío en todos.** GRH no lo tiene por ninguna vía, así que
   CapitalIA nunca lo cargó. Si el otro sistema necesita mail, ese dato hay que
   conseguirlo en otro lado.
2. **`reparticionIdGrh` es la clave de cruce**, no el nombre. Los nombres se
   editan en CapitalIA —es el sistema donde vive el organigrama real—, y el
   `legajo` identifica a la persona, pero para cruzar *unidades* con otro sistema
   municipal el id de GRH es lo único estable. Viene `null` en las unidades que se
   crearon desde CapitalIA y no existen en GRH.
3. **La repartición dice dónde la persona presta servicios, no dónde se le paga.**
   Es la corrección que hace Capital Humano y es el valor que CapitalIA agrega
   sobre la liquidación. No esperes que coincida con el sector de GRH.

## Qué pasa cuando cambia el padrón

No hay webhooks ni *push*: el otro sistema pregunta cuando quiere. Con 4.706
agentes la respuesta completa pesa ~600 KB, así que una sincronización diaria o
semanal pidiendo todo es perfectamente razonable y no justifica complicar esto.

El padrón se refresca con cada liquidación (`scripts/importacion/importar.mjs`), y
las correcciones de repartición las hace Capital Humano cuando las detecta.

## Cortar o rotar el acceso

Cambiar `PADRON_API_TOKEN` en Vercel y volver a desplegar. El token viejo deja de
servir en el acto. No hay usuarios ni sesiones que dar de baja: el acceso **es** el
token.

## Cómo está hecho, del lado de CapitalIA

| | |
|---|---|
| Ruta | [`src/app/api/padron/route.ts`](../src/app/api/padron/route.ts) |
| Consulta | [`src/features/personas/data/padron.ts`](../src/features/personas/data/padron.ts) |
| Excepción en el proxy | `RUTAS_CON_TOKEN` en [`src/lib/supabase/middleware.ts`](../src/lib/supabase/middleware.ts) |

Dos decisiones que no son obvias y conviene no revertir sin leer esto:

- **Lee con la service role key, salteando la RLS.** No hay sesión de usuario del
  otro lado, y la RLS por repartición sin sesión no devuelve *ninguna* fila. Por
  eso la puerta la pone la ruta (el token) y no la base. Es la única ruta así.
- **El `proxy` la deja pasar sin sesión.** Si no, redirigiría a `/login` cualquier
  pedido sin cookie, que es exactamente lo que manda otro sistema. La excepción es
  solo para este path y está en una lista aparte de las rutas públicas, para que
  agregar otra sea una decisión consciente.

## Alternativa que se descartó

Darle al otro sistema una conexión directa a Postgres con un usuario de solo
lectura. Se descartó porque obliga a repartir credenciales de base, expone el
esquema entero —incluidas las tablas que no tienen por qué salir— y acopla los dos
sistemas al modelo de datos de CapitalIA: cualquier migración futura puede romper
al otro. El endpoint expone columnas elegidas, y el esquema puede cambiar abajo sin
que el otro lado se entere.
