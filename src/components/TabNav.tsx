import React from 'react';
import { Search, FileSpreadsheet, LayoutDashboard, Truck, Users, CheckCircle2, ShieldCheck, Gauge, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button, IconButton } from './ui/Button';
import { ACTION_ICONS } from './ui/actionIcons';

export type ActiveTab = 'dashboard' | 'board' | 'liquidated' | 'trucks' | 'staff' | 'batch' | 'users';

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
        {items.map((it) => {
          const active = activeTab === it.key;
          const Icon = it.icon;
          return (
            <React.Fragment key={it.key}>
              {it.key === 'users' && <div className="h-px bg-slate-200 my-1" />}
              <button
                type="button"
                onClick={() => onTabChange(it.key)}
                title={it.label}
                aria-label={it.count !== undefined ? `${it.label} (${it.count})` : it.label}
                aria-current={active ? 'page' : undefined}
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
                type="button"
                onClick={() => onTabChange(it.key)}
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
          })}
        </div>
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
          title="Mostrar menú (Tablero, Liquidadas, Camiones, Personal, Carga Excel...)"
          className="hidden md:inline-flex"
        >
          Menú
        </Button>
      )}
      {leading && <div className="min-w-0 flex-shrink">{leading}</div>}
      <div className="relative flex-1 min-w-[180px] max-w-sm">
        <label htmlFor="toolbarSearch" className="sr-only">
          Buscar ruta, camión o piloto
        </label>
        <input
          id="toolbarSearch"
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar ruta, camión, piloto..."
          className="w-full min-h-[44px] pl-9 pr-3 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
        />
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 ml-auto max-w-full">
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
