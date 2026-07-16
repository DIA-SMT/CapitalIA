# Capital humanIA

Plataforma interna de la **Municipalidad de San Miguel de Tucumán** para
digitalizar y administrar el **Nomenclador de Puestos**.

> **Alcance del MVP:** solo administración de **puestos**. No incluye empleados,
> legajos, salarios, licencias, evaluaciones de personas ni contrataciones.

## Documentación

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

Fase de **configuración inicial** (Etapa 0 del roadmap): estructura técnica
lista, sin CRUD ni IA todavía.
