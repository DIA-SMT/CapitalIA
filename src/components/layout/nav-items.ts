import {
  FileStack,
  FolderOpen,
  LayoutDashboard,
  Library,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Si es true, la ruta se considera activa solo con coincidencia exacta. */
  exact?: boolean;
};

/**
 * Navegación principal del layout privado.
 *
 * "Nuevo puesto" se saca hasta que el formulario exista (Etapa 5): llevaba a una
 * pantalla "en preparación", y ofrecer una acción que no hace nada es peor que
 * no ofrecerla. La ruta sigue existiendo, solo no se enlaza.
 */
export const NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Nomenclador", href: "/puestos", icon: FileStack, exact: true },
  { title: "Catálogos", href: "/catalogos", icon: Library },
  { title: "Documentos", href: "/documentos", icon: FolderOpen },
  { title: "Configuración", href: "/configuracion", icon: Settings },
];

/** Etiquetas legibles por segmento de ruta, para breadcrumbs. */
export const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  puestos: "Nomenclador",
  nuevo: "Nuevo puesto",
  catalogos: "Catálogos",
  documentos: "Documentos",
  configuracion: "Configuración",
};

export function isActiveRoute(
  pathname: string,
  item: Pick<NavItem, "href" | "exact">,
): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
