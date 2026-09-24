import React from 'react';
import { Search, Download, RefreshCw, FileSpreadsheet, LayoutDashboard, Truck, Users, CheckCircle2, AlertTriangle, ShieldCheck, Gauge, PanelLeftClose, PanelLeftOpen, Maximize2 } from 'lucide-react';

export type ActiveTab = 'dashboard' | 'board' | 'liquidated' | 'trucks' | 'staff' | 'batch' | 'users';

interface TabNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onExportExcel: () => void;
  onResetDemo: () => void;
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
  showTrucks?: boolean;
  showStaff?: boolean;
  showBatch?: boolean;
  showUsers?: boolean;
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
  showTrucks = true,
  showStaff = true,
  showBatch = true,
  showUsers = false,
  isAdmin = false,
  mode = 'toolbar',
  leading,
  railCollapsed = false,
  onToggleRail,
  onFullscreen,
}) => {
  const items: NavItem[] = [
    { key: 'dashboard', label: 'Dashboard', short: 'Dashboard', icon: Gauge, activeClass: 'bg-slate-900 text-white', iconClass: 'text-slate-500', show: showDashboard },
    { key: 'board', label: 'Tablero de Rutas', short: 'Tablero', icon: LayoutDashboard, count: activeCount, activeClass: 'bg-slate-900 text-white', iconClass: 'text-slate-600', show: showBoard },
    { key: 'liquidated', label: 'Rutas Liquidadas', short: 'Liquidadas', icon: CheckCircle2, count: liquidatedCount, activeClass: 'bg-emerald-600 text-white', iconClass: 'text-emerald-600', show: showLiquidated },
    { key: 'trucks', label: 'Camiones', short: 'Camiones', icon: Truck, count: trucksCount, activeClass: 'bg-blue-600 text-white', iconClass: 'text-blue-600', show: showTrucks },
    { key: 'staff', label: 'Personal', short: 'Personal', icon: Users, count: staffCount, activeClass: 'bg-indigo-600 text-white', iconClass: 'text-indigo-600', show: showStaff },
    { key: 'batch', label: 'Carga Masiva Excel', short: 'Carga Excel', icon: FileSpreadsheet, activeClass: 'bg-emerald-600 text-white', iconClass: 'text-emerald-600', show: showBatch },
    { key: 'users', label: 'Usuarios', short: 'Usuarios', icon: ShieldCheck, count: usersCount, activeClass: 'bg-slate-700 text-white', iconClass: 'text-slate-500', show: showUsers },
  ].filter((i) => i.show) as NavItem[];

  // --- Navegación vertical (tablet / escritorio) ---
  if (mode === 'rail') {
    return (
      <nav className="flex flex-col gap-1.5 p-2" aria-label="Secciones">
        {onToggleRail && (
          <button
            onClick={onToggleRail}
            title="Ocultar menú para ampliar el tablero"
            className="w-full min-h-[40px] flex items-center justify-center gap-1 rounded-xl text-slate-400 hover:text-slate-800 hover:bg-slate-100 cursor-pointer active:scale-95"
          >
            <PanelLeftClose className="w-4 h-4" />
            <span className="text-[10px] font-semibold">Ocultar</span>
          </button>
        )}
        {items.map((it) => {
          const active = activeTab === it.key;
          const Icon = it.icon;
          return (
            <React.Fragment key={it.key}>
              {it.key === 'users' && <div className="h-px bg-slate-200 my-1" />}
              <button
                onClick={() => onTabChange(it.key)}
                title={it.label}
                className={`relative w-full min-h-[64px] flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 transition-all cursor-pointer active:scale-95 ${
                  active ? `${it.activeClass} shadow-sm` : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
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
            </React.Fragment>
          );
        })}
      </nav>
    );
  }

  // --- Navegación horizontal compacta (teléfonos) ---
  if (mode === 'bar') {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-1.5">
        <div className="flex items-stretch gap-1 overflow-x-auto">
          {items.map((it) => {
            const active = activeTab === it.key;
            const Icon = it.icon;
            return (
              <button
                key={it.key}
                onClick={() => onTabChange(it.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
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
          })}
        </div>
      </div>
    );
  }

  // --- Barra de herramientas: indicadores + búsqueda + acciones (una sola fila) ---
  return (
    <div className="flex flex-wrap items-center gap-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm px-2.5 py-2">
      {onToggleRail && railCollapsed && (
        <button
          onClick={onToggleRail}
          title="Mostrar menú (Tablero, Liquidadas, Camiones, Personal, Carga Excel...)"
          className="hidden md:flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer active:scale-95"
        >
          <PanelLeftOpen className="w-4 h-4" />
          Menú
        </button>
      )}
      {leading && <div className="min-w-0 flex-shrink">{leading}</div>}
      <div className="relative flex-1 min-w-[180px] max-w-sm">
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar ruta, camión, piloto..."
          className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
        />
        <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
      </div>

      <div className="flex items-center gap-2 ml-auto">
        {onFullscreen && (
          <button
            onClick={onFullscreen}
            title="Ver el Tablero de Rutas a pantalla completa"
            className="flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer active:scale-95"
          >
            <Maximize2 className="w-4 h-4" />
            <span className="hidden sm:inline">Pantalla completa</span>
          </button>
        )}
        {onOpenUnassignedResourcesModal && (
          <button
            id="btnMotivosPendientes"
            onClick={onOpenUnassignedResourcesModal}
            title="Asignar motivo a camiones y personal disponibles que no salieron a ruta hoy"
            className={`relative flex items-center min-h-[40px] px-2.5 rounded-xl border transition cursor-pointer ${
              (pendingReasonsCount || 0) > 0
                ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <AlertTriangle className="w-4 h-4 mr-1.5" />
            <span className="text-xs font-semibold whitespace-nowrap">Fin de Asignación</span>
            {(pendingReasonsCount || 0) > 0 && (
              <span className="ml-1.5 px-1.5 rounded-full text-[10px] font-bold bg-amber-600 text-white">
                {pendingReasonsCount}
              </span>
            )}
          </button>
        )}
        <button
          onClick={onExportExcel}
          title="Descargar reporte detallado en Excel (.xlsx)"
          className="min-h-[40px] min-w-[40px] flex items-center justify-center bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition cursor-pointer"
        >
          <Download className="w-4 h-4 text-emerald-600" />
        </button>
        {/* "Restablecer datos de prueba": solo administrador y solo sin base de
            datos compartida (ver nota de seguridad en allowResetDemo). */}
        {isAdmin && allowResetDemo && (
          <button
            onClick={onResetDemo}
            title="Restablecer datos de prueba (solo administrador)"
            className="min-h-[40px] px-2.5 text-xs bg-rose-50 border border-rose-200 rounded-xl text-rose-600 hover:bg-rose-100 transition font-medium flex items-center cursor-pointer"
          >
            <RefreshCw className="w-3 h-3 mr-1" />
            Demo
          </button>
        )}
      </div>
    </div>
  );
};
