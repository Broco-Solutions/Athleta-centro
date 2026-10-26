'use client';

import React from 'react';
import Link from 'next/link';
import { DeveloperFooter } from '../branding/developer-footer';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import { Activity, ArrowDownLeft, ArrowUpRight, ScanLine, Settings2, CalendarDays, ChevronDown, ChevronRight, ClipboardList, Dumbbell, LogOut, Menu, PanelLeftClose, PanelLeftOpen, UserCog, UserRound, Users, Wallet, X } from 'lucide-react';
import { Button } from '@athleta/ui';
import { currentSession, logout } from './auth';
import { AuthShell } from './auth-shell';
import { NavigationTooltip } from './navigation-tooltip';
import { useDesktopSidebar } from './workspace-navigation-state';

type NavigationItem = {
  key: string;
  href: string;
  label: string;
  icon: typeof Activity;
  canAccess: (permissions: string[]) => boolean;
};
type NavigationGroup = { key: 'home' | 'sala' | 'clinic' | 'finance' | 'team'; label: string; items: NavigationItem[] };

const hasAny = (permissions: string[], values: string[]) => values.some((value) => permissions.includes(value));
const hasDomainPermission = (permissions: string[], prefix: string) => permissions.some((permission) => permission.startsWith(prefix));
const checkInNavigationItem: NavigationItem = {
  key: 'sala-check-in',
  href: '/sala/fichaje',
  label: 'Ingreso',
  icon: ScanLine,
  canAccess: (permissions) => permissions.includes('SALA_AGENDA_MANAGE'),
};

const navigation: NavigationItem[] = [
  { key: 'home', href: '/', label: 'Inicio', icon: Activity, canAccess: () => true },
  { key: 'people', href: '/people', label: 'Personas', icon: Users, canAccess: (permissions) => hasAny(permissions, ['PEOPLE_READ', 'PEOPLE_CREATE', 'PEOPLE_UPDATE_GENERAL']) },
  { key: 'team', href: '/team', label: 'Equipo', icon: UserCog, canAccess: (permissions) => hasDomainPermission(permissions, 'TEAM_') },
  { key: 'sala-agenda', href: '/sala', label: 'Sala', icon: Dumbbell, canAccess: (permissions) => hasAny(permissions, ['SALA_PARTICIPATION_MANAGE', 'SALA_SCHEDULE_MANAGE', 'SALA_AGENDA_MANAGE', 'SALA_ROUTINE_READ', 'SALA_ROUTINE_MANAGE', 'SALA_PHYSICAL_EVALUATION_READ', 'SALA_PHYSICAL_EVALUATION_MANAGE', 'SALA_PAYMENT_READ', 'SALA_PAYMENT_MANAGE']) },
  { key: 'routines', href: '/routines', label: 'Rutinas', icon: ClipboardList, canAccess: (permissions) => permissions.includes('SALA_ROUTINE_MANAGE') },
  { key: 'reservations', href: '/reservations', label: 'Reservas', icon: ClipboardList, canAccess: (permissions) => permissions.includes('SALA_RELATION_READ') },
  { key: 'finance-summary', href: '/finance', label: 'Finanzas', icon: Wallet, canAccess: (permissions) => hasDomainPermission(permissions, 'FINANCE_') || permissions.includes('PAYMENT_METHOD_CATALOG_MANAGE') },
];

const professorNavigation: NavigationItem[] = [
  { key: 'home', href: '/', label: 'Inicio', icon: Activity, canAccess: () => true },
  { key: 'sala-agenda', href: '/sala', label: 'Agenda', icon: CalendarDays, canAccess: (permissions) => permissions.includes('SALA_RELATION_READ') },
  { key: 'sala-students', href: '/students', label: 'Alumnos', icon: Users, canAccess: () => true },
  { key: 'routines', href: '/routines', label: 'Rutinas', icon: ClipboardList, canAccess: () => true },
];

function groupedNavigation(permissions: string[]): NavigationGroup[] {
  const allowed = (item: NavigationItem) => item.canAccess(permissions);
  const groups: NavigationGroup[] = [
    { key: 'home', label: 'Inicio', items: [
      { key: 'home', href: '/', label: 'Resumen', icon: Activity, canAccess: () => true },
    ] },
    { key: 'sala', label: 'Sala', items: [
      { key: 'sala-agenda', href: '/sala', label: 'Agenda', icon: CalendarDays, canAccess: (values) => values.includes('SALA_AGENDA_MANAGE') },
      { key: 'sala-students', href: '/students', label: 'Alumnos', icon: Users, canAccess: (values) => values.includes('SALA_PARTICIPATION_MANAGE') },
      { key: 'routines', href: '/routines', label: 'Rutinas', icon: ClipboardList, canAccess: (values) => values.includes('SALA_ROUTINE_MANAGE') },
      { key: 'sala-configuration', href: '/sala/configuration', label: 'Configuración', icon: Settings2, canAccess: (values) => hasAny(values, ['SALA_SCHEDULE_MANAGE', 'SALA_PLAN_CATALOG_MANAGE', 'SALA_SERVICE_DURATION_MANAGE']) },
    ] },
    { key: 'finance', label: 'Finanzas', items: [
      { key: 'finance-summary', href: '/finance', label: 'Resumen', icon: Wallet, canAccess: (values) => values.includes('FINANCE_OPERATIONAL_READ') || values.includes('FINANCE_EXECUTIVE_READ') || values.includes('PAYMENT_METHOD_CATALOG_MANAGE') },
      { key: 'finance-income', href: '/finance?view=income', label: 'Ingresos', icon: ArrowDownLeft, canAccess: (values) => values.includes('FINANCE_OPERATIONAL_READ') },
      { key: 'finance-expenses', href: '/finance?view=expenses', label: 'Gastos', icon: ArrowUpRight, canAccess: (values) => values.includes('FINANCE_OPERATIONAL_READ') || values.includes('EXPENSE_HISTORY_READ') },
    ] },
    { key: 'team', label: 'Equipo', items: [
      { key: 'team', href: '/team', label: 'Equipo', icon: UserCog, canAccess: (values) => hasDomainPermission(values, 'TEAM_') },
    ] },
  ];
  return groups.map((group) => ({ ...group, items: group.items.filter(allowed) })).filter((group) => group.items.length > 0);
}

export function WorkspaceShell({ children, active }: { children: React.ReactNode; active: string }): React.JSX.Element {
  const activeKey = active;
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useDesktopSidebar();
  const desktopNavRef = React.useRef<HTMLElement>(null);
  const drawerRef = React.useRef<HTMLDivElement>(null);
  const signingOut = React.useRef(false);
  const closeMenuRef = React.useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();
  const session = useQuery({ queryKey: ['auth', 'session'], queryFn: currentSession, retry: false });
  const signOut = useMutation({ mutationFn: (csrfToken: string) => logout(csrfToken), retry: false, onSuccess: async () => { await queryClient.cancelQueries(); queryClient.clear(); window.location.replace('/login'); }, onSettled: () => { signingOut.current = false; } });
  const requestSignOut = () => { if (signingOut.current || !session.data) return; signingOut.current = true; signOut.mutate(session.data.csrfToken); };
  const permissions = session.data?.permissions ?? [];
  const roles = session.data?.roles ?? [];
  const roleLabels: Record<string, string> = {
    PROFESSOR: 'Profesor',
    KINESIOLOGIST: 'Kinesiólogo',
    OSTEOPATH: 'Osteópata',
    ADMINISTRATIVE: 'Administrativo',
    GENERAL_ADMIN: 'Administrador general',
    BROCO_SUPPORT: 'Soporte Broco',
  };
  const fullName = `${session.data?.user.firstName ?? ''} ${session.data?.user.lastName ?? ''}`.trim();
  const rolesLabel = roles.map((role) => roleLabels[role] ?? role).join(' · ');
  const accountContent = (onNavigate?: () => void, compact = false) => <footer className="mt-auto min-w-0 border-t border-zinc-700 pt-4">
    <div className={compact ? 'sr-only' : 'min-w-0 px-3'} title={[fullName, rolesLabel].filter(Boolean).join(' · ')}>
      <div className="truncate text-sm font-medium text-white">{fullName}</div>
      <div className="truncate text-xs text-zinc-400">{rolesLabel}</div>
    </div>
    <div className="mt-3 space-y-1">
      {!roles.includes('BROCO_SUPPORT') ? compact ? <NavigationTooltip label="Mi perfil"><Link href="/profile" aria-label="Mi perfil" className="flex h-11 items-center justify-center rounded-md text-zinc-300 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><UserRound aria-hidden="true" size={18} /></Link></NavigationTooltip> : <Link href="/profile" aria-label="Mi perfil" onClick={() => onNavigate?.()} className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><UserRound aria-hidden="true" size={18} />Mi perfil</Link> : null}
      <NavigationTooltip label={signOut.isPending ? 'Cerrando sesión…' : 'Cerrar sesión'}><Button aria-label={signOut.isPending ? 'Cerrando sesión…' : 'Cerrar sesión'} variant="ghost" className={`h-11 w-full gap-3 text-zinc-300 hover:bg-zinc-800 hover:text-white ${compact ? 'px-0' : 'justify-start px-3'}`} disabled={signOut.isPending || !session.data} onClick={requestSignOut}><LogOut aria-hidden="true" size={18} /><span className={compact ? 'sr-only' : undefined}>{signOut.isPending ? 'Cerrando sesión…' : 'Cerrar sesión'}</span></Button></NavigationTooltip>
      {signOut.isError ? <div role="alert" className="mt-2 rounded-md bg-red-950 p-2 text-sm text-red-100"><p>{compact ? 'No se pudo salir.' : 'No pudimos cerrar la sesión. Intentá nuevamente.'}</p><button type="button" onClick={requestSignOut} className="mt-1 min-h-11 w-full break-words text-xs underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Reintentar</button></div> : null}
    </div>
  </footer>;
  const isProfessorOnly = roles.length === 1 && roles.includes('PROFESSOR');
  const hasAdministrativeNavigation = roles.includes('ADMINISTRATIVE') || roles.includes('GENERAL_ADMIN');
  const groups = hasAdministrativeNavigation ? groupedNavigation(permissions) : null;
  const activeGroupKey = groups?.find((group) => group.items.some((item) => item.key === activeKey))?.key;
  const [openGroupKey, setOpenGroupKey] = React.useState<NavigationGroup['key'] | undefined>(activeGroupKey);
  const visibleNavigation = roles.includes('GENERAL_ADMIN') ? (groups?.flatMap((group) => group.items) ?? []) : hasAdministrativeNavigation ? (groups?.flatMap((group) => group.items) ?? []) : isProfessorOnly ? professorNavigation.filter((item) => item.canAccess(permissions)) : navigation.filter((item) => item.canAccess(permissions));

  React.useEffect(() => {
    setOpenGroupKey(activeGroupKey);
  }, [activeGroupKey]);

  React.useEffect(() => {
    if (!mobileMenuOpen) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeMenuRef.current?.focus();
    const desktop = window.matchMedia?.('(min-width: 768px)');
    const closeOnDesktop = () => { if (desktop?.matches) setMobileMenuOpen(false); };
    desktop?.addEventListener('change', closeOnDesktop);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
      if (event.key === 'Tab') {
        const controls = Array.from(drawerRef.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), [tabindex="0"]') ?? []).filter(element => !element.closest('[hidden]'));
        const first = controls[0]; const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      desktop?.removeEventListener('change', closeOnDesktop);
      document.removeEventListener('keydown', handleKeyDown);
      trigger?.focus();
    };
  }, [mobileMenuOpen]);

  React.useEffect(() => { desktopNavRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest' }); }, [activeKey, desktopSidebarOpen, session.data]);

  const itemLink = ({ key, href, label, icon: Icon }: NavigationItem, onNavigate?: () => void) => <Link key={key} aria-current={activeKey === key ? 'page' : undefined} className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeKey === key ? 'border-l-2 border-primary! bg-zinc-800 font-semibold text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`} href={href} onClick={() => onNavigate?.()}>
    <Icon aria-hidden="true" size={18} />
    <span>{label}</span>
  </Link>;
  const navigationContent = (idSuffix: string, onNavigate?: () => void) => groups
    ? groups.map((group) => {
      const isOpen = openGroupKey === group.key;
      const contentId = `navigation-group-${group.key}-${idSuffix}`;
      const Chevron = isOpen ? ChevronDown : ChevronRight;
      return <section key={group.key} className="space-y-1">
        <h2 className="pt-2 first:pt-0">
          <Link href={group.items[0]!.href} aria-expanded={isOpen} aria-controls={contentId} className="flex min-h-11 w-full items-center justify-between rounded-md px-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-300 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setOpenGroupKey(group.key); onNavigate?.(); }}>
            <span>{group.label}</span>
            <Chevron aria-hidden="true" size={16} className="transition-transform duration-150" />
          </Link>
        </h2>
        <div id={contentId} hidden={!isOpen} className="space-y-1">{group.items.map((item) => itemLink(item, onNavigate))}</div>
      </section>;
    })
    : visibleNavigation.map((item) => <React.Fragment key={item.key}>{itemLink(item, onNavigate)}</React.Fragment>);
  const navigationWithCheckIn = (idSuffix: string, onNavigate?: () => void) => <>
    {navigationContent(idSuffix, onNavigate)}
    {checkInNavigationItem.canAccess(permissions) ? <div className="mt-3 space-y-1">{itemLink(checkInNavigationItem, onNavigate)}</div> : null}
  </>;

  return <AuthShell mobileNavigationOpen={mobileMenuOpen} desktopSidebarOpen={desktopSidebarOpen} onToggleDesktopSidebar={() => setDesktopSidebarOpen((open) => !open)} mobileNavigationTrigger={<Button variant="ghost" aria-label="Abrir menú" aria-expanded={mobileMenuOpen} aria-controls="internal-mobile-navigation" className="h-11 gap-2 px-3 md:hidden" onClick={() => setMobileMenuOpen(true)}><Menu aria-hidden="true" size={20} />Menú</Button>}>
    <main className={`flex min-h-screen min-w-0 flex-col bg-background pt-14 motion-safe:transition-[margin] motion-safe:duration-200 ${desktopSidebarOpen ? 'md:ml-60 md:pt-0' : 'md:ml-20 md:pt-0'}`}>
      <aside inert={mobileMenuOpen} className={`fixed inset-y-0 left-0 z-50 hidden min-w-0 flex-col bg-sidebar py-5 text-sidebar-foreground md:flex ${desktopSidebarOpen ? 'w-60 px-4' : 'w-20 px-3'}`}>
        <div className={`mb-5 flex min-w-0 items-center ${desktopSidebarOpen ? 'gap-2' : 'justify-center'}`}>
          {desktopSidebarOpen ? <Link href="/" aria-label="Athleta · Inicio" className="min-w-0 flex-1 text-center"><Image src="/logo-athleta.png" width={1983} height={793} alt="Athleta" priority className="h-auto w-full" /></Link> : null}
          <NavigationTooltip label={desktopSidebarOpen ? 'Compactar menú lateral' : 'Expandir menú lateral'}><Button variant="ghost" aria-label={desktopSidebarOpen ? 'Ocultar menú lateral' : 'Mostrar menú lateral'} className="h-11 w-11 shrink-0 px-0 text-zinc-300 hover:bg-zinc-800 hover:text-white" onClick={() => setDesktopSidebarOpen(open => !open)}>{desktopSidebarOpen ? <PanelLeftClose aria-hidden="true" size={18} /> : <PanelLeftOpen aria-hidden="true" size={18} />}</Button></NavigationTooltip>
        </div>
        <nav ref={desktopNavRef} aria-label="Navegación principal" className="min-h-0 min-w-0 flex-1 space-y-1 overflow-y-auto pb-4">
          {desktopSidebarOpen ? navigationWithCheckIn('desktop') : <>{visibleNavigation.map(item => {
            const Icon = item.icon;
            const group = groups?.find(value => value.items.some(child => child.key === item.key));
            const label = group ? `${group.label}: ${item.label}` : item.label;
            return <NavigationTooltip key={item.key} label={label}><Link href={item.href} aria-label={label} aria-current={activeKey === item.key ? 'page' : undefined} className={`flex h-11 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeKey === item.key ? 'border-l-2 border-primary! bg-zinc-800 text-primary' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}><Icon aria-hidden="true" size={20} /></Link></NavigationTooltip>;
          })}{checkInNavigationItem.canAccess(permissions) ? <NavigationTooltip label="Ingreso"><Link href={checkInNavigationItem.href} aria-label={checkInNavigationItem.label} aria-current={activeKey === 'sala-check-in' ? 'page' : undefined} className={`flex h-11 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${activeKey === 'sala-check-in' ? 'border-l-2 border-primary! bg-zinc-800 text-primary' : 'text-zinc-300 hover:bg-zinc-800'}`}><ScanLine aria-hidden="true" size={20} /></Link></NavigationTooltip> : null}</>}
        </nav>
        {accountContent(undefined, !desktopSidebarOpen)}
      </aside>
      {mobileMenuOpen ? <>
        <button type="button" aria-label="Cerrar menú desde el fondo" className="fixed inset-0 z-50 bg-black/40 md:hidden" onClick={() => setMobileMenuOpen(false)} />
        <div ref={drawerRef} id="internal-mobile-navigation" role="dialog" aria-modal="true" aria-label="Menú principal" className="fixed inset-y-0 left-0 z-[60] flex w-72 max-w-[85vw] min-w-0 flex-col overflow-y-auto bg-sidebar px-4 py-6 text-sidebar-foreground md:hidden">
          <div className="mb-8 flex min-w-0 items-start justify-between gap-3">
            <Link href="/" aria-label="Athleta · Inicio" className="min-w-0 flex-1" onClick={() => setMobileMenuOpen(false)}>
              <Image src="/logo-athleta.png" width={1983} height={793} alt="Athleta" className="h-auto w-full max-w-44" />
            </Link>
            <button ref={closeMenuRef} type="button" aria-label="Cerrar menú" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setMobileMenuOpen(false)}><X aria-hidden="true" size={20} /></button>
          </div>
          <nav aria-label="Navegación móvil" className="min-w-0 flex-1 space-y-1">{navigationWithCheckIn('mobile', () => setMobileMenuOpen(false))}</nav>
          {accountContent(() => setMobileMenuOpen(false))}
        </div>
      </> : null}
      <section inert={mobileMenuOpen} className="min-w-0 flex-1 p-4 sm:p-5 md:p-8">{children}</section>
      <footer inert={mobileMenuOpen} className="border-t border-border px-4 py-5 text-center sm:px-5 md:px-8"><DeveloperFooter /></footer>
    </main>
  </AuthShell>;
}
