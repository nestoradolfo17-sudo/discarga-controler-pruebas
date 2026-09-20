import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Download, RefreshCw, FileSpreadsheet, LayoutDashboard, Truck, Users, CheckCircle2, AlertTriangle, ShieldCheck, Gauge, Settings, ChevronDown } from 'lucide-react';

export type ActiveTab = 'dashboard' | 'board' | 'liquidated' | 'trucks' | 'staff' | 'batch' | 'users';

interface TabNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onExportExcel: () => void;
  onResetDemo: () => void;
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
}

export const TabNav: React.FC<TabNavProps> = ({
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  onExportExcel,
  onResetDemo,
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
}) => {
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  // Posición calculada del menú (se dibuja aparte del flujo normal, ver más abajo),
  // para que no quede recortado por la fila de pestañas que se desplaza horizontalmente.
  const [adminMenuPos, setAdminMenuPos] = useState<{ top: number; left: number } | null>(null);
  const adminMenuRef = useRef<HTMLDivElement>(null);
  const adminMenuPanelRef = useRef<HTMLDivElement>(null);

  // La fila de pestañas tiene desplazamiento horizontal (overflow-x-auto), y eso hace
  // que cualquier menú "absolute" normal quede cortado o casi invisible. Por eso el
  // panel del menú "Administración" se dibuja con un portal directo al <body>, en
  // posición fija calculada a partir del botón, para que siempre aparezca completo
  // y por encima de todo, sin importar el desplazamiento de la fila.
  const handleToggleAdminMenu = () => {
    if (!isAdminMenuOpen && adminMenuRef.current) {
      const rect = adminMenuRef.current.getBoundingClientRect();
      const menuWidth = 224; // ancho del menú (w-56)
      let left = rect.left;
      if (left + menuWidth > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - menuWidth - 8);
      }
      setAdminMenuPos({ top: rect.bottom + 6, left });
    }
    setIsAdminMenuOpen((prev) => !prev);
  };

  // Cierra el submenú "Administración" al hacer clic fuera (del botón o del panel
  // flotante), al presionar Escape, o al desplazar/cambiar el tamaño de la ventana
  // (para que el menú nunca quede "flotando" en un lugar que ya no corresponde).
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedButton = !!adminMenuRef.current?.contains(target);
      const clickedPanel = !!adminMenuPanelRef.current?.contains(target);
      if (!clickedButton && !clickedPanel) {
        setIsAdminMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsAdminMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!isAdminMenuOpen) return;
    const handleDismiss = () => setIsAdminMenuOpen(false);
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);
    return () => {
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
    };
  }, [isAdminMenuOpen]);

  const activeIsAdminSection = activeTab === 'users';

  return (
    <div className="space-y-2.5">
      {/* Fila 1: Navegación principal */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-1.5">
        <div className="flex items-stretch gap-1 overflow-x-auto">
          {showDashboard && (
          <button
            onClick={() => onTabChange('dashboard')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs md:text-[13px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'dashboard' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Gauge className="w-4 h-4 shrink-0" />
            Dashboard
          </button>
          )}

          {showBoard && (
          <button
            onClick={() => onTabChange('board')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs md:text-[13px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'board' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            Tablero de Rutas
            {activeCount !== undefined && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold shrink-0 ${
                  activeTab === 'board' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {activeCount}
              </span>
            )}
          </button>
          )}

          {showLiquidated && (
          <button
            onClick={() => onTabChange('liquidated')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs md:text-[13px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'liquidated' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <CheckCircle2 className={`w-4 h-4 shrink-0 ${activeTab === 'liquidated' ? 'text-white' : 'text-emerald-600'}`} />
            Rutas Liquidadas
            {liquidatedCount !== undefined && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold shrink-0 ${
                  activeTab === 'liquidated' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {liquidatedCount}
              </span>
            )}
          </button>
          )}

          {showTrucks && (
          <button
            onClick={() => onTabChange('trucks')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs md:text-[13px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'trucks' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Truck className={`w-4 h-4 shrink-0 ${activeTab === 'trucks' ? 'text-white' : 'text-blue-600'}`} />
            Camiones
            {trucksCount !== undefined && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold shrink-0 ${
                  activeTab === 'trucks' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {trucksCount}
              </span>
            )}
          </button>
          )}

          {showStaff && (
          <button
            onClick={() => onTabChange('staff')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs md:text-[13px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'staff' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Users className={`w-4 h-4 shrink-0 ${activeTab === 'staff' ? 'text-white' : 'text-indigo-600'}`} />
            Personal
            {staffCount !== undefined && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold shrink-0 ${
                  activeTab === 'staff' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {staffCount}
              </span>
            )}
          </button>
          )}

          {showBatch && (
          <button
            onClick={() => onTabChange('batch')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs md:text-[13px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'batch' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <FileSpreadsheet className={`w-4 h-4 shrink-0 ${activeTab === 'batch' ? 'text-white' : 'text-emerald-600'}`} />
            Carga Masiva Excel
          </button>
          )}

          {showUsers && <div className="w-px my-1 bg-slate-200 shrink-0" />}

          {/* Submenú "Administración": agrupa funciones de uso exclusivo del
              administrador (hoy, Usuarios) para no competir por espacio con las
              pestañas de uso diario. Carga Masiva Excel puede usarla cualquier
              usuario regular, así que quedó como pestaña normal, fuera de aquí. */}
          {showUsers && (
            <div className="relative inline-block text-left shrink-0" ref={adminMenuRef}>
              <button
                type="button"
                onClick={handleToggleAdminMenu}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs md:text-[13px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  activeIsAdminSection ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                }`}
                title="Funciones de administración: usuarios"
              >
                <Settings className={`w-4 h-4 shrink-0 ${activeIsAdminSection ? 'text-white' : 'text-slate-500'}`} />
                Administración
                <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isAdminMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isAdminMenuOpen && adminMenuPos && createPortal(
                <div
                  ref={adminMenuPanelRef}
                  style={{ position: 'fixed', top: adminMenuPos.top, left: adminMenuPos.left, width: 224 }}
                  className="z-[9999] bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 text-left animate-in fade-in zoom-in-95 duration-100"
                >
                  {showUsers && (
                    <button
                      onClick={() => {
                        onTabChange('users');
                        setIsAdminMenuOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2.5 transition cursor-pointer"
                    >
                      <ShieldCheck className="w-4 h-4 shrink-0 text-slate-600" />
                      <span className="text-xs font-semibold text-slate-800 flex-1">Usuarios</span>
                      {usersCount !== undefined && (
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                          {usersCount}
                        </span>
                      )}
                    </button>
                  )}
                </div>,
                document.body
              )}
            </div>
          )}
        </div>
      </div>

      {/* Fila 2: Búsqueda y acciones */}
      <div className="flex flex-wrap items-center gap-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-2.5">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar ruta, camión, piloto..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
        </div>

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {onOpenUnassignedResourcesModal && (
            <button
              id="btnMotivosPendientes"
              onClick={onOpenUnassignedResourcesModal}
              title="Asignar motivo a camiones y personal disponibles que no salieron a ruta hoy"
              className={`relative flex items-center px-2.5 py-1.5 rounded-xl border transition cursor-pointer ${
                (pendingReasonsCount || 0) > 0
                  ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                  : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
              <div className="flex flex-col items-start leading-tight">
                <span className="text-xs font-semibold">Fin de Asignación</span>
                <span className="text-[9px] font-medium opacity-75">No Asignado</span>
              </div>
              {(pendingReasonsCount || 0) > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-600 text-white">
                  {pendingReasonsCount}
                </span>
              )}
            </button>
          )}
          {/* Los botones "Inicio de Día" / "Fin de Día" que antes estaban aquí, duplicados
              con la cabecera, se quitaron: ahora viven en un único lugar (la barra superior),
              visible siempre, para no dejar dudas de cuál usar. */}
          <button
            onClick={onExportExcel}
            title="Descargar reporte detallado en Excel (.xlsx)"
            className="p-2 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 text-slate-600 hover:text-slate-800 transition cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-600" />
          </button>
          {/* "Restablecer datos de prueba" solo para administradores: en producción,
              un operador de agencia no debe tener a la vista un botón que puede borrar
              datos reales por error de un clic. */}
          {isAdmin && (
            <button
              onClick={onResetDemo}
              title="Restablecer datos de prueba (solo administrador)"
              className="px-2.5 py-1.5 text-xs bg-rose-50 border border-rose-200 rounded-xl text-rose-600 hover:bg-rose-100 transition font-medium flex items-center cursor-pointer"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Demo
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
