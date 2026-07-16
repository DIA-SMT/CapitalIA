# Capital humanIA

Plataforma interna de la **Municipalidad de San Miguel de Tucumán** para
digitalizar y administrar el **Nomenclador de Puestos**.

Los dos tomos escaneados del Nomenclador de 2016 —436 MB sin capa de texto— hoy
son **210 puestos** consultables y editables, cada uno trazable hasta su página
del original.

> **Alcance:** administración de **puestos**, más la **dotación** (qué persona
> ocupa cada puesto: legajo, nombre, área y fechas).
>
> **No incluye** legajos completos, salarios, licencias, sanciones, evaluaciones
> de desempeño ni contrataciones. Sumar cualquiera de esos datos requiere
> resolver antes el modelo de roles — ver [`CONTEXT.md`](CONTEXT.md) §4.

## Documentación

- [`CONTEXT.md`](CONTEXT.md) — **empezá por acá**: estado real, decisiones
  tomadas y trampas conocidas.
- [`docs/architecture.md`](docs/architecture.md) — arquitectura, modelo de datos,
  estrategia de auth y de server/client components.
- [`docs/roadmap.md`](docs/roadmap.md) — plan de trabajo por etapas.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript estricto · Tailwind CSS v4 ·
shadcn/ui · Supabase (PostgreSQL + Auth) · Zod · React Hook Form ·
TanStack Table · Lucide · Vercel.

## Puesta en marcha

```bash
# 1) Instalar dependencias
npm install

# 2) Configurar variables de entorno
cp .env.example .env.local   # completar con valores reales (no versionar)

# 3) Entorno de desarrollo
npm run dev                  # http://localhost:3000
```

## Scripts

| Script | Descripción |
|--------|-------------|
| `npm run dev` | Servidor de desarrollo. |
| `npm run build` | Build de producción. |
| `npm run start` | Sirve el build de producción. |
| `npm run lint` | ESLint (config de Next.js). |
| `npm run typecheck` | Chequeo de tipos con `tsc --noEmit`. |

## Estado

**En producción:** https://capital-ia-eight.vercel.app — acceso solo con usuarios
habilitados por un administrador, sin registro público.

Etapas 0 a 5 del [roadmap](docs/roadmap.md) cerradas: el nomenclador está
cargado, se consulta, se edita por versiones (sin perder las fichas de 2016) y
registra la dotación.

Falta comparar puestos y detectar similares (Etapa 6) y la consulta en lenguaje
natural (Etapa 7). El detalle del estado real y la deuda conocida está en
[`CONTEXT.md`](CONTEXT.md).
