import React from 'react';
import { Search, FileSpreadsheet, LayoutDashboard, Truck, Users, CheckCircle2, ShieldCheck, Gauge, PanelLeftClose, PanelLeftOpen, Repeat, ArrowLeftRight, Sun, Moon, LayoutGrid, ChevronDown, Banknote } from 'lucide-react';
import { Button, IconButton } from './ui/Button';
import { ACTION_ICONS } from './ui/actionIcons';

export type ActiveTab = 'dashboard' | 'board' | 'liquidated' | 'recargas' | 'prestamos' | 'trucks' | 'staff' | 'batch' | 'zr' | 'users';

interface TabNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  // Solo se muestra donde exporta lo que se ve (Tablero / Dashboard). En Rutas
  // Liquidadas la exportación vive en la propia vista (respeta sus filtros).
  onExportExcel?: () => void;
  // "Rutas Prioridades": Excel con No. Ruta, Camión, Piloto y Segmento (solo Tablero).
  onExportPrioridades?: () => void;
  // Ya no se dibuja aquí: pasó al menú del usuario en la barra superior.
  onResetDemo?: () => void;
  // Corrección de seguridad: el botón "Demo" reemplaza TODO el contenido de
  // Rutas, Camiones y Personal por datos de ejemplo, sin confirmación. Eso
  // solo tiene sentido en modo local (sin base de datos compartida) — con
  // Supabase configurado ya causó pérdidas reales de datos de todos los
  // usuarios conectados. Este flag (pasado como `!isSupabaseConfigured` desde
  // App.tsx) oculta el botón por completo en modo compartido; `onResetDemo`
  // además se niega a ejecutarse en ese caso como segunda capa de protección.
  allowResetDemo?: boolean;
  onOpenUnassignedResourcesModal?: () => void;
  pendingReasonsCount?: number;
  activeCount?: number;
  liquidatedCount?: number;
  trucksCount?: number;
  staffCount?: number;
  usersCount?: number;
  showDashboard?: boolean;
  showBoard?: boolean;
  showLiquidated?: boolean;
  // Módulo de Recargas: visible para todos los usuarios con sesión.
  showRecargas?: boolean;
  // Préstamos de personal y camiones entre agencias (todos los usuarios).
  showPrestamos?: boolean;
  showTrucks?: boolean;
  showStaff?: boolean;
  showBatch?: boolean;
  showUsers?: boolean;
  showZr?: boolean;
  // Solo los administradores ven el submenú "Administración" (Carga Masiva / Usuarios)
  // y el botón "Demo" para restablecer datos de prueba, evitando que un operador de
  // agencia lo confunda con una acción normal del día a día.
  isAdmin?: boolean;
  // Disposición (rediseño para tablet — más espacio para el Tablero de Rutas):
  //  - 'rail': navegación vertical fija a la izquierda (tablet/escritorio).
  //  - 'bar': navegación horizontal compacta (teléfonos).
  //  - 'toolbar': fila de búsqueda y acciones; `leading` permite colocar ahí
  //    los indicadores compactos (StatsCards compact).
  mode?: 'rail' | 'bar' | 'toolbar';
  leading?: React.ReactNode;
  // Ocultar / mostrar el menú lateral para dar más ancho al tablero.
  railCollapsed?: boolean;
  onToggleRail?: () => void;
  // Abre el Tablero de Rutas a pantalla completa (solo se muestra en el Tablero).
  onFullscreen?: () => void;
  // Reportes del día (Inicio / Fin de Día) y "Nueva Ruta": antes en la barra
  // superior, ahora dentro de la barra del Tablero.
  onOpenDailySummary?: (mode: 'inicio' | 'fin') => void;
  onNewRoute?: () => void;
}

interface NavItem {
  key: ActiveTab;
  label: string;
  short: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  activeClass: string;
  iconClass: string;
  show: boolean;
}

export const TabNav: React.FC<TabNavProps> = ({
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  onExportExcel,
  onExportPrioridades,
  onResetDemo,
  allowResetDemo = true,
  onOpenUnassignedResourcesModal,
  pendingReasonsCount,
  activeCount,
  liquidatedCount,
  trucksCount,
  staffCount,
  usersCount,
  showDashboard = true,
  showBoard = true,
  showLiquidated = true,
  showRecargas = true,
  showPrestamos = true,
  showTrucks = true,
  showStaff = true,
  showBatch = true,
  showUsers = false,
  showZr = false,
  isAdmin = false,
  mode = 'toolbar',
  leading,
  railCollapsed = false,
  onToggleRail,
  onFullscreen,
  onOpenDailySummary,
  onNewRoute,
}) => {
  const items: NavItem[] = [
    { key: 'dashboard', label: 'Dashboard', short: 'Dashboard', icon: Gauge, activeClass: 'bg-slate-900 text-white', iconClass: 'text-slate-500', show: showDashboard },
    { key: 'board', label: 'Asignación', short: 'Asignación', icon: LayoutDashboard, count: activeCount, activeClass: 'bg-slate-900 text-white', iconClass: 'text-slate-600', show: showBoard },
    { key: 'liquidated', label: 'Rutas Liquidadas', short: 'Liquidadas', icon: CheckCircle2, count: liquidatedCount, activeClass: 'bg-emerald-600 text-white', iconClass: 'text-emerald-600', show: showLiquidated },
    { key: 'recargas', label: 'Recargas', short: 'Recargas', icon: Repeat, activeClass: 'bg-violet-600 text-white', iconClass: 'text-violet-600', show: showRecargas },
    { key: 'prestamos', label: 'Préstamos', short: 'Préstamos', icon: ArrowLeftRight, activeClass: 'bg-teal-600 text-white', iconClass: 'text-teal-600', show: showPrestamos },
    { key: 'trucks', label: 'Camiones', short: 'Camiones', icon: Truck, count: trucksCount, activeClass: 'bg-blue-600 text-white', iconClass: 'text-blue-600', show: showTrucks },
    { key: 'staff', label: 'Personal', short: 'Personal', icon: Users, count: staffCount, activeClass: 'bg-indigo-600 text-white', iconClass: 'text-indigo-600', show: showStaff },
    { key: 'batch', label: 'Cargar Rutas', short: 'Cargar Rutas', icon: FileSpreadsheet, activeClass: 'bg-emerald-600 text-white', iconClass: 'text-emerald-600', show: showBatch },
    { key: 'zr', label: 'ZR', short: 'ZR', icon: Banknote, activeClass: 'bg-rose-700 text-white', iconClass: 'text-rose-700', show: showZr },
    { key: 'users', label: 'Usuarios', short: 'Usuarios', icon: ShieldCheck, count: usersCount, activeClass: 'bg-slate-700 text-white', iconClass: 'text-slate-500', show: showUsers },
  ].filter((i) => i.show) as NavItem[];

  // Menú lateral: a la vista Dashboard, Asignación, ZR (tercero), Liquidadas y Carga
  // Excel; lo demás (Recargas, Préstamos, Camiones, Personal, Usuarios) queda
  // agrupado en "Otros", que se despliega al tocarlo.
  const PRINCIPALES: ActiveTab[] = ['dashboard', 'board', 'zr', 'liquidated', 'batch'];
  const principales = PRINCIPALES.map((k) => items.find((i) => i.key === k)).filter(Boolean) as NavItem[];
  const otros = items.filter((i) => !PRINCIPALES.includes(i.key));
  const otroActivo = otros.some((i) => i.key === activeTab);
  const [otrosAbierto, setOtrosAbierto] = React.useState(otroActivo);
  React.useEffect(() => {
    if (otroActivo) setOtrosAbierto(true);
  }, [otroActivo]);

  // --- Navegación vertical (tablet / escritorio) ---
  if (mode === 'rail') {
    return (
      <nav className="flex flex-col gap-1.5 p-2" aria-label="Secciones">
        {onToggleRail && (
          <button
            type="button"
            onClick={onToggleRail}
            title="Ocultar menú para ampliar el tablero"
            aria-label="Ocultar menú para ampliar el tablero"
            className="w-full min-h-[44px] flex items-center justify-center gap-1 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 cursor-pointer active:scale-95"
          >
            <PanelLeftClose className="w-4 h-4" />
            <span className="text-[10px] font-semibold">Ocultar</span>
          </button>
        )}
        {principales.map((it) => (
          <RailButton key={it.key} it={it} active={activeTab === it.key} onClick={() => onTabChange(it.key)} />
        ))}
        {otros.length > 0 && (
          <>
            <div className="h-px bg-slate-200 my-1" />
            <button
              type="button"
              onClick={() => setOtrosAbierto((v) => !v)}
              aria-expanded={otrosAbierto}
              aria-controls="menuOtros"
              title={otrosAbierto ? 'Ocultar otras secciones' : 'Ver otras secciones (Recargas, Préstamos, Camiones, Personal...)'}
              className={`relative w-full min-h-[56px] flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 transition-all cursor-pointer active:scale-95 ${
                otroActivo && !otrosAbierto ? 'bg-slate-900 text-white shadow-sm' : otrosAbierto ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <LayoutGrid className={`w-5 h-5 shrink-0 ${otroActivo && !otrosAbierto ? 'text-white' : 'text-slate-500'}`} />
              <span className="text-[10.5px] font-semibold leading-tight flex items-center gap-0.5">
                Otros
                <ChevronDown className={`w-3 h-3 transition-transform ${otrosAbierto ? 'rotate-180' : ''}`} aria-hidden />
              </span>
            </button>
            {otrosAbierto && (
              <div id="menuOtros" className="flex flex-col gap-1.5 rounded-xl bg-slate-50 border border-slate-200 p-1">
                {otros.map((it) => (
                  <RailButton key={it.key} it={it} active={activeTab === it.key} onClick={() => onTabChange(it.key)} compact />
                ))}
              </div>
            )}
          </>
        )}
      </nav>
    );
  }

  // --- Navegación horizontal compacta (teléfonos) ---
  if (mode === 'bar') {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-1.5">
        <div className="flex items-stretch gap-1 overflow-x-auto">
          {principales.map((it) => (
            <BarButton key={it.key} it={it} active={activeTab === it.key} onClick={() => onTabChange(it.key)} />
          ))}
          {otros.length > 0 && (
            <button
              type="button"
              onClick={() => setOtrosAbierto((v) => !v)}
              aria-expanded={otrosAbierto}
              className={`flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                otroActivo && !otrosAbierto ? 'bg-slate-900 text-white shadow-sm' : otrosAbierto ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <LayoutGrid className="w-4 h-4 shrink-0" />
              Otros
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${otrosAbierto ? 'rotate-180' : ''}`} aria-hidden />
            </button>
          )}
        </div>
        {otrosAbierto && otros.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-slate-100">
            {otros.map((it) => (
              <BarButton key={it.key} it={it} active={activeTab === it.key} onClick={() => onTabChange(it.key)} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // --- Barra de herramientas: indicadores + búsqueda + acciones (una sola fila) ---
  // Jerarquía (análisis de botones, punto 10): la acción del momento se
  // destaca (Fin de Asignación en verde, solo en el Tablero); Pantalla completa
  // y Excel son secundarias. "Restablecer datos de prueba" se movió al menú del
  // usuario (barra superior).
  return (
    <div className="flex flex-wrap items-center gap-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm px-2.5 py-2">
      {onToggleRail && railCollapsed && (
        <Button
          variant="dark"
          size="md"
          icon={PanelLeftOpen}
          onClick={onToggleRail}
          title="Mostrar menú (Asignación, Liquidadas, Camiones, Personal, Cargar Rutas...)"
          className="hidden md:inline-flex"
        >
          Menú
        </Button>
      )}
      {leading && <div className="min-w-0 flex-shrink">{leading}</div>}
      <div className="relative flex-1 min-w-[180px] max-w-sm">
        <label htmlFor="toolbarSearch" className="sr-only">
          Buscar ruta, camión, piloto o cliente
        </label>
        <input
          id="toolbarSearch"
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar ruta, camión, piloto, cliente..."
          className="w-full min-h-[44px] pl-9 pr-3 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
        />
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 ml-auto max-w-full">
        {onOpenDailySummary && <DayReportButtons onOpen={onOpenDailySummary} />}
        {onNewRoute && <NewRouteButton onClick={onNewRoute} />}
        {onFullscreen && (
          <IconButton
            variant="secondary"
            icon={ACTION_ICONS.pantallaCompleta}
            label="Pantalla completa"
            showLabel
            onClick={onFullscreen}
          />
        )}
        {onExportExcel && (
          <IconButton
            variant="secondary"
            icon={ACTION_ICONS.exportar}
            label="Descargar Excel"
            showLabel
            onClick={onExportExcel}
            className="text-emerald-700"
          />
        )}
        {onExportPrioridades && (
          // Siempre con texto visible (también en tablet/celular) y con su propio
          // ícono, para no confundirlo con "Descargar Excel".
          <Button
            id="btnRutasPrioridades"
            variant="secondary"
            icon={ACTION_ICONS.prioridades}
            onClick={onExportPrioridades}
            title="Descargar Excel de Rutas Prioridades: No. Ruta, ID Camión, Camión, Piloto, Segmento, Horario y Prioridad de Carga"
            className="text-indigo-700 border-indigo-300"
          >
            <span className="whitespace-nowrap">Rutas Prioridades</span>
          </Button>
        )}
        {onOpenUnassignedResourcesModal && (
          <Button
            id="btnMotivosPendientes"
            variant={(pendingReasonsCount || 0) > 0 ? 'success' : 'secondary'}
            icon={ACTION_ICONS.finAsignacion}
            onClick={onOpenUnassignedResourcesModal}
            title="Cerrar la asignación del día: motivo para camiones y personal que no salieron"
            badge={(pendingReasonsCount || 0) > 0 ? pendingReasonsCount : undefined}
          >
            <span className="whitespace-nowrap">Fin de Asignación</span>
          </Button>
        )}
      </div>
    </div>
  );
};

// Reportes del día: Inicio (planificado) y Fin de Día (real ejecutado).
export const DayReportButtons: React.FC<{ onOpen: (mode: 'inicio' | 'fin') => void }> = ({ onOpen }) => (
  <div className="flex items-center gap-1 bg-slate-50 rounded-xl p-1 border border-slate-300">
    <button
      id="btnResumenInicio"
      type="button"
      onClick={() => onOpen('inicio')}
      aria-label="Reporte de Inicio de Día (planificado)"
      title="Reporte de Inicio de Día (planificado)"
      className="inline-flex items-center justify-center gap-1.5 min-h-[36px] min-w-[36px] px-2.5 text-xs font-semibold text-slate-700 hover:bg-white hover:shadow-sm rounded-lg transition cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
    >
      <Sun className="w-4 h-4 text-amber-500" aria-hidden />
      <span className="whitespace-nowrap">Inicio de Día</span>
    </button>
    <button
      id="btnResumenFin"
      type="button"
      onClick={() => onOpen('fin')}
      aria-label="Reporte de Fin de Día (real ejecutado)"
      title="Reporte de Fin de Día (real ejecutado)"
      className="inline-flex items-center justify-center gap-1.5 min-h-[36px] min-w-[36px] px-2.5 text-xs font-semibold text-slate-700 hover:bg-white hover:shadow-sm rounded-lg transition cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
    >
      <Moon className="w-4 h-4 text-indigo-500" aria-hidden />
      <span className="whitespace-nowrap">Fin de Día</span>
    </button>
  </div>
);

export const NewRouteButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <Button
    id="btnNuevaRuta"
    variant="primary"
    icon={ACTION_ICONS.nuevo}
    onClick={onClick}
    title="Crear una nueva ruta"
    className="shrink-0"
  >
    <span className="whitespace-nowrap">Nueva Ruta</span>
  </Button>
);

// Botón del menú lateral (tablet / escritorio).
const RailButton: React.FC<{ it: NavItem; active: boolean; onClick: () => void; compact?: boolean }> = ({ it, active, onClick, compact }) => {
  const Icon = it.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      title={it.label}
      aria-label={it.count !== undefined ? `${it.label} (${it.count})` : it.label}
      aria-current={active ? 'page' : undefined}
      className={`relative w-full ${compact ? 'min-h-[56px]' : 'min-h-[64px]'} flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 transition-all cursor-pointer active:scale-95 ${
        active ? `${it.activeClass} shadow-sm` : 'text-slate-500 hover:text-slate-900 hover:bg-white'
      }`}
    >
      <Icon className={`w-5 h-5 shrink-0 ${active ? 'text-white' : it.iconClass}`} />
      <span className="text-[10.5px] font-semibold leading-tight text-center">{it.short}</span>
      {it.count !== undefined && (
        <span
          className={`absolute top-1 right-1 min-w-[20px] px-1 py-px rounded-full text-[9.5px] font-bold leading-tight ${
            active ? 'bg-white/25 text-white' : 'bg-slate-200 text-slate-700'
          }`}
        >
          {it.count}
        </span>
      )}
    </button>
  );
};

// Botón de la barra horizontal (teléfonos).
const BarButton: React.FC<{ it: NavItem; active: boolean; onClick: () => void }> = ({ it, active, onClick }) => {
  const Icon = it.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
        active ? `${it.activeClass} shadow-sm` : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
      }`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-white' : it.iconClass}`} />
      {it.short}
      {it.count !== undefined && (
        <span className={`px-1.5 rounded-full text-[10px] font-bold ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
          {it.count}
        </span>
      )}
    </button>
  );
};
