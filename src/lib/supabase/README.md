# lib/supabase

Helpers de acceso a Supabase (`@supabase/ssr`):

- `config.ts` — lectura de variables de entorno y `isSupabaseConfigured()`.
- `client.ts` — cliente para **Client Components** (`createBrowserClient`).
  Instanciar dentro de manejadores de eventos, no en el cuerpo de render.
- `server.ts` — cliente para **Server Components / Route Handlers / Server
  Actions** (`createServerClient` con cookies) y `getSessionUser()`.
- `middleware.ts` — `updateSession()`: refresco de sesión y protección de rutas.
  Se invoca desde `src/proxy.ts` (convención `proxy` de Next.js 16).

La configuración de credenciales se toma de `.env.local` (ver `.env.example`).
Sin configurar, la app arranca igual y muestra avisos de configuración.
