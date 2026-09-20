import React from 'react';
import { Truck, Plus, Building2, Sun, Moon, User, LogOut } from 'lucide-react';

interface NavbarProps {
  agencies: string[];
  selectedAgency: string;
  onSelectAgency: (agency: string) => void;
  onOpenNewRouteModal: () => void;
  onOpenDailySummaryModal: (mode?: 'inicio' | 'fin') => void;
  currentUsername?: string;
  isAdmin?: boolean;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  agencies,
  selectedAgency,
  onSelectAgency,
  onOpenNewRouteModal,
  onOpenDailySummaryModal,
  currentUsername,
  isAdmin,
  onLogout,
}) => {
  return (
    <header className="bg-gradient-to-b from-slate-900 to-slate-950 text-white shadow-xl sticky top-0 z-30 border-b border-white/5">
      <div className="w-full px-3 sm:px-5 lg:px-8">
        <div className="flex items-center justify-between h-[68px] gap-3">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg ring-1 ring-white/10 shrink-0">
              <Truck className="w-5.5 h-5.5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-base sm:text-lg leading-tight tracking-tight truncate">DISCARGA CONTROLER</h1>
              <p className="text-[11px] text-slate-400 truncate">Asignación, Segmentación y Liquidación Operativa</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden md:flex items-center bg-white/5 rounded-xl p-1 border border-white/10">
              <label htmlFor="agencySelect" className="text-xs text-slate-400 px-2 font-medium flex items-center">
                <Building2 className="w-3.5 h-3.5 mr-1" />
                Agencia:
              </label>
              <select
                id="agencySelect"
                value={selectedAgency}
                onChange={(e) => onSelectAgency(e.target.value)}
                className="bg-slate-900 text-white text-xs font-semibold rounded-lg border-0 py-1.5 px-2.5 focus:ring-2 focus:ring-blue-500 cursor-pointer outline-none"
              >
                <option value="TODAS">-- Todas las Agencias --</option>
                {agencies.map((ag) => (
                  <option key={ag} value={ag}>
                    {ag}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-px h-7 bg-white/10 hidden lg:block" />

            {/* BOTONES DE RESUMEN: INICIO DE DÍA (ESTIMADO) Y FIN DE DÍA (REAL EJECUTADO)
                Única ubicación de estos botones en toda la app (antes también existían,
                duplicados, en la barra de pestañas). Siempre visibles, en cualquier
                tamaño de pantalla; el texto se oculta en móviles muy angostos y solo
                queda el ícono, para no perder la función en ningún dispositivo. */}
            <div className="flex items-center bg-white/5 rounded-xl p-0.5 border border-white/10">
              <button
                id="btnNavbarResumenInicio"
                onClick={() => onOpenDailySummaryModal('inicio')}
                title="Visualizar reporte de inicio de jornada (Planificado)"
                className="inline-flex items-center px-2.5 sm:px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer"
              >
                <Sun className="w-3.5 h-3.5 sm:mr-1.5 text-amber-100" />
                <span className="hidden sm:inline">Inicio de Día</span>
              </button>

              <button
                id="btnNavbarResumenFin"
                onClick={() => onOpenDailySummaryModal('fin')}
                title="Visualizar reporte de fin de jornada (Real ejecutado)"
                className="inline-flex items-center px-2.5 sm:px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer ml-1"
              >
                <Moon className="w-3.5 h-3.5 sm:mr-1.5 text-indigo-200" />
                <span className="hidden sm:inline">Fin de Día</span>
              </button>
            </div>

            <button
              onClick={onOpenNewRouteModal}
              className="inline-flex items-center px-3.5 py-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-600 text-white text-xs font-semibold rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              <span className="hidden sm:inline">Nueva Ruta</span>
            </button>

            {currentUsername && (
              <>
                <div className="w-px h-7 bg-white/10 hidden md:block" />
                <div className="hidden md:flex items-center bg-white/5 rounded-xl px-2.5 py-1.5 border border-white/10 gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-300" />
                  <span className="text-xs font-semibold text-slate-200">{currentUsername}</span>
                  {isAdmin && (
                    <span className="text-[9px] font-bold text-indigo-200 bg-indigo-500/20 px-1.5 py-0.2 rounded-full">
                      ADMIN
                    </span>
                  )}
                </div>
                <button
                  onClick={onLogout}
                  title="Cerrar sesión"
                  className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-300 hover:text-white transition cursor-pointer shrink-0"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
