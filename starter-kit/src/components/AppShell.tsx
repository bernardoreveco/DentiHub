// Estructura general de la app (patrón de AppShell.tsx de Dentiventario, sin nada de su negocio):
//   [Barra lateral clara de 72 px, solo íconos] | [Encabezado fijo] [Contenido, máx. 1280 px]
// - En escritorio (≥ 1024 px) cada grupo es un ícono; al pasar el cursor se abre un panel con sus
//   páginas. Un grupo con una sola página es un enlace directo con globo de texto.
// - En celular la barra se reemplaza por un panel deslizante de 256 px con la lista completa.
// - Solo el contenido hace scroll: la barra y el encabezado quedan siempre fijos.
//
// No depende del enrutador: la navegación entra por `renderLink` (TanStack Router, Next.js, etc.)
// y la página activa por `activePath`. Qué páginas ve cada rol se resuelve ANTES, filtrando
// `groups` con canAccessPage (src/lib/roles.ts); los grupos vacíos no deben pasarse.
import { useState, type ReactNode } from "react";
import { Menu, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export type NavItem = { to: string; label: string; icon?: LucideIcon };
export type NavGroup = { label: string; icon: LucideIcon; items: NavItem[] };

export type RenderLink = (args: {
  to: string;
  className: string;
  active: boolean;
  onClick?: () => void;
  children: ReactNode;
}) => ReactNode;

/** "/" solo está activa en la raíz; las demás también en sus subrutas ("/tareas/12"). */
export function isActivePath(activePath: string, to: string): boolean {
  if (to === "/") return activePath === "/";
  return activePath === to || activePath.startsWith(`${to}/`);
}

const LINK_ACTIVE = "bg-secondary text-foreground";

function SidebarRail({
  groups,
  activePath,
  renderLink,
}: {
  groups: NavGroup[];
  activePath: string;
  renderLink: RenderLink;
}) {
  return (
    <nav aria-label="Navegación principal" className="flex flex-col items-center gap-1.5">
      {groups.map((group) => {
        const only = group.items.length === 1 ? group.items[0] : undefined;
        if (only) {
          const ItemIcon = only.icon ?? group.icon;
          const active = isActivePath(activePath, only.to);
          return (
            <div key={only.to} className="group relative">
              {renderLink({
                to: only.to,
                active,
                className: cn(
                  "flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                  active && LINK_ACTIVE,
                ),
                children: (
                  <>
                    <ItemIcon className="size-5" aria-hidden="true" />
                    <span className="sr-only">{only.label}</span>
                  </>
                ),
              })}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100"
              >
                {only.label}
              </span>
            </div>
          );
        }
        const GroupIcon = group.icon;
        const groupActive = group.items.some((i) => isActivePath(activePath, i.to));
        return (
          <div key={group.label} className="group relative">
            <div
              className={cn(
                "flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors group-hover:bg-secondary group-hover:text-foreground",
                groupActive && LINK_ACTIVE,
              )}
              aria-hidden="true"
            >
              <GroupIcon className="size-5" />
            </div>
            {/* pl-2 (y no ml-2): el "puente" entre el ícono y el panel debe ser parte del elemento
                con hover; si fuera margen, el cursor lo cruza sin tocar nada y el panel se cierra. */}
            <div className="invisible absolute left-full top-0 z-50 min-w-[190px] pl-2 opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              <div className="min-w-[190px] rounded-lg border border-border bg-card p-1.5 shadow-lg">
                <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </p>
                {group.items.map((item) => {
                  const active = isActivePath(activePath, item.to);
                  return (
                    <div key={item.to}>
                      {renderLink({
                        to: item.to,
                        active,
                        className: cn(
                          "block rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                          active && LINK_ACTIVE,
                        ),
                        children: item.label,
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function SidebarList({
  groups,
  activePath,
  renderLink,
  onNavigate,
}: {
  groups: NavGroup[];
  activePath: string;
  renderLink: RenderLink;
  onNavigate: () => void;
}) {
  return (
    <nav aria-label="Navegación principal" className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.label}
          </p>
          {group.items.map((item) => {
            const ItemIcon = item.icon ?? group.icon;
            const active = isActivePath(activePath, item.to);
            return (
              <div key={item.to}>
                {renderLink({
                  to: item.to,
                  active,
                  onClick: onNavigate,
                  className: cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                    active && LINK_ACTIVE,
                  ),
                  children: (
                    <>
                      <ItemIcon className="size-4 shrink-0" aria-hidden="true" />
                      {item.label}
                    </>
                  ),
                })}
              </div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function AppShell({
  groups,
  activePath,
  renderLink,
  logo,
  header,
  children,
}: {
  groups: NavGroup[];
  activePath: string;
  renderLink: RenderLink;
  /** Logo o marca (se ve arriba de la barra lateral y en el panel de celular). */
  logo: ReactNode;
  /** Contenido del encabezado: buscador, campana de avisos, menú de la persona… (alineado a la derecha). */
  header?: ReactNode;
  children: ReactNode;
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    // Alto fijo a la ventana (h-screen + overflow-hidden): solo <main> hace scroll.
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sin overflow aquí: el panel flotante de cada grupo se dibuja fuera de estos 72 px y quedaría recortado. */}
      <aside className="hidden w-[72px] shrink-0 flex-col items-center border-r border-border bg-card py-4 lg:flex">
        <div className="mb-4 flex items-center justify-center">{logo}</div>
        <SidebarRail groups={groups} activePath={activePath} renderLink={renderLink} />
      </aside>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-64 px-3 py-4">
          <SheetTitle className="sr-only">Menú</SheetTitle>
          <div className="mb-4 flex items-center px-1">{logo}</div>
          <SidebarList
            groups={groups}
            activePath={activePath}
            renderLink={renderLink}
            onNavigate={() => setMobileNavOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-border bg-card">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 lg:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Abrir menú"
            >
              <Menu className="size-5" />
            </Button>
            <div className="flex flex-1 flex-wrap items-center justify-end gap-3">{header}</div>
          </div>
        </header>

        {/* REGLA DE LAYOUT: el elemento que hace scroll ocupa TODO el ancho a la derecha de la barra
            lateral (así la rueda funciona también sobre los márgenes vacíos y la barra de scroll
            queda pegada al borde de la ventana). El ancho máximo y el centrado van en el div de
            adentro: no poner max-w ni mx-auto en este <main>. */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-4 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
