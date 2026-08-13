# Importación desde el sistema de sueldos (GRH_TUCUMAN)

Herramientas de análisis para la Etapa 1 (ver [`../../docs/plan-importacion.md`](../../docs/plan-importacion.md)).

**Ninguna de estas escribe nada.** Leen, comparan y emiten reportes. La carga
todavía no está escrita.

## De dónde salen los datos

| Origen | Qué se lee | Cómo |
|---|---|---|
| `GRH_TUCUMAN` (SQL Server, red municipal) | Organigrama y liquidación | Solo lectura. El login tiene `CONNECT` + `SELECT` y nada más: el servidor rechaza cualquier escritura |
| CapitalIA (Supabase) | Las reparticiones ya cargadas | Se leen de la base, **no del seed del repo** — el ABM las cambia |

Las credenciales de GRH **no están acá y no van al repo**. Se pasan por fuera.
Las de Supabase salen de `.env.local`, que está en `.gitignore`.

## Los scripts

Todos esperan dos CSV exportados de GRH en este mismo directorio:

- `organiza.csv` — `SELECT IDORGANIZA, codigoOrganiza, N1_DESC, activo FROM ORGANIZA`
- `sectores.csv` — dotación por sector del último período liquidado

| Script | Qué hace |
|---|---|
| `arbol.mjs` | Arma el árbol de las 187 unidades, le cruza la dotación real y lo compara contra lo que hay en CapitalIA. Reporte en seco: dice qué **haría**, no hace nada |
| `equivalencias.mjs` | Propone qué repartición de CapitalIA es cuál de GRH. **Propone, no decide** |
| `revisar-sectores.mjs` | Los enganches sector → repartición que no son obvios, con cuánta gente arrastra cada uno |
| `datos-confirmacion.mjs` | Emite `confirmacion.json` con las dos tablas a confirmar |
| `armar_xlsx.py` | Convierte ese JSON en la planilla para Capital Humano (`openpyxl`) |

```bash
node scripts/importacion/equivalencias.mjs
node scripts/importacion/revisar-sectores.mjs
node scripts/importacion/datos-confirmacion.mjs && python scripts/importacion/armar_xlsx.py
```

## Por qué el matcheo es "propone y no decide"

Los nombres de GRH vienen truncados y con erratas —`SECRETARIA DE ORENAMIENTO`,
`DESARROLO SUST`, `COMUNIC.INSTITITUC`—, así que la igualdad exacta engancha 45
de 187. El matcheo por parecido de palabras sube a ~76 de 84 sectores, pero se
equivoca de formas que ningún umbral arregla:

- `Contaduría General` → `SECRETARIA GENERAL` (comparten "General" y nada más)
- `direccion general de transito` → `SECRETARIA GENERAL` (**40 agentes**)
- `Casa Azul` → `Centro de Monitoreo Municipal`

Por eso hay un castigo por nivel distinto y por eso todo lo que no llega al 85%
va a una planilla para que lo confirme alguien que conoce el municipio. Un
enganche mal puesto no es un nombre feo: con la RLS puesta, es mostrarle el
personal al director que no corresponde.
