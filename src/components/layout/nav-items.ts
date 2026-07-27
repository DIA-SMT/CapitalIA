import {
  Building2,
  ClipboardList,
  FilePlus2,
  FileStack,
  FolderOpen,
  History,
  LayoutDashboard,
  Library,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Si es true, la ruta se considera activa solo con coincidencia exacta. */
  exact?: boolean;
  /** Si es true, el ítem solo lo ve el rol admin. */
  adminOnly?: boolean;
};

/** Navegación principal del layout privado. */
export const NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Nomenclador", href: "/puestos", icon: FileStack, exact: true },
  { title: "Nuevo puesto", href: "/puestos/nuevo", icon: FilePlus2, adminOnly: true },
  { title: "Solicitudes", href: "/solicitudes", icon: ClipboardList },
  { title: "Personas", href: "/personas", icon: Users },
  { title: "Reparticiones", href: "/reparticiones", icon: Building2 },
  { title: "Bitácora", href: "/auditoria", icon: History, adminOnly: true },
  { title: "Catálogos", href: "/catalogos", icon: Library, adminOnly: true },
  { title: "Documentos", href: "/documentos", icon: FolderOpen, adminOnly: true },
  { title: "Configuración", href: "/configuracion", icon: Settings },
];

/** Etiquetas legibles por segmento de ruta, para breadcrumbs. */
export const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  puestos: "Nomenclador",
  nuevo: "Nuevo puesto",
  editar: "Editar",
  solicitudes: "Solicitudes",
  personas: "Personas",
  reparticiones: "Reparticiones",
  auditoria: "Bitácora",
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
