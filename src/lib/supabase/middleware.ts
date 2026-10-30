import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

/** Rutas accesibles sin sesión. */
const PUBLIC_ROUTES = ["/login"];

/**
 * Rutas que NO son públicas: se autentican solas, con un token, porque las
 * consume otro sistema y no una persona con sesión de navegador. El proxy las
 * deja pasar y la puerta la pone la ruta.
 *
 * Van en una lista aparte de PUBLIC_ROUTES a propósito: agregar algo acá tiene
 * que ser una decisión consciente, no algo que se lea como "esto es público".
 */
const RUTAS_CON_TOKEN = ["/api/padron"];

function coincide(pathname: string, rutas: readonly string[]): boolean {
  return rutas.some(
    (ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`),
  );
}

/**
 * Refresca la sesión de Supabase y protege las rutas privadas.
 *
 * - Ruta con token (`/api/padron`) → pasa de largo; la valida la ruta.
 * - Sin sesión en ruta privada → redirige a `/login`.
 * - Con sesión en `/login` → redirige a `/dashboard`.
 * - Si Supabase no está configurado, deja pasar (la app muestra el aviso de
 *   configuración); el layout privado igualmente valida en servidor.
 */
export async function updateSession(
  request: NextRequest,
): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) {
    return response;
  }

  // Una ruta con token no trae cookies que refrescar. Cortar acá, antes de armar
  // el cliente, evita una consulta al servidor de Auth por cada pedido del otro
  // sistema.
  if (coincide(request.nextUrl.pathname, RUTAS_CON_TOKEN)) {
    return response;
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANTE: usar getUser() (valida contra el servidor de Auth), no getSession().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !coincide(pathname, PUBLIC_ROUTES)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}
