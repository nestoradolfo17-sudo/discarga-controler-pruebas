import React, { useEffect, useRef, useState } from 'react';
import { Building2, User, LogOut, ChevronDown, Download, RefreshCw } from 'lucide-react';
import logoDiscarga from '../assets/logo-discarga.png';

// Barra superior organizada por niveles (análisis de botones, punto 10):
//   1. Identidad + agencia (el selector de agencia ahora se ve también en
//      tablet vertical y teléfono; antes se ocultaba debajo de 768 px).
//   2. (Inicio / Fin de Día y "Nueva Ruta" se movieron a la barra del Tablero.)
//   3. Estado de guardado.
//   4. Menú del usuario: nombre, respaldo (admin), datos de prueba (solo modo
//      local) y "Cerrar sesión" — acciones poco frecuentes fuera de la vista.

interface NavbarProps {
  agencies: string[];
  selectedAgency: string;
  onSelectAgency: (agency: string) => void;
  currentUsername?: string;
  isAdmin?: boolean;
  // Agencias de las que es administrador (administrador de agencias).
  adminAgencias?: string[];
  onLogout?: () => void;
  saveIndicator?: React.ReactNode;
  // Campana de pendientes por autorizar (solo administradores).
  notificaciones?: React.ReactNode;
  onDownloadBackup?: () => void | Promise<void>;
  onResetDemo?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  agencies,
  selectedAgency,
  onSelectAgency,
  currentUsername,
  isAdmin,
  adminAgencias = [],
  onLogout,
  saveIndicator,
  notificaciones,
  onDownloadBackup,
  onResetDemo,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const menuItem =
    'w-full min-h-[48px] px-4 flex items-center gap-3 text-sm font-semibold text-left cursor-pointer outline-none focus-visible:bg-slate-100';

  return (
    <header className="bg-gradient-to-b from-slate-900 to-slate-950 text-white shadow-xl sticky top-0 z-30 border-b border-white/5">
      <div className="w-full px-3 sm:px-5 lg:px-8">
        <div className="flex items-center justify-between h-[68px] gap-2 sm:gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center shadow-lg ring-1 ring-white/10 shrink-0 overflow-hidden p-0.5">
              <img src={logoDiscarga} alt="DISCARGA S.A." className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0 hidden sm:block">
              <h1 className="font-bold text-base lg:text-lg leading-tight tracking-tight truncate">DISCARGA CONTROLER</h1>
              <p className="text-[11px] text-slate-400 truncate hidden lg:block">
                Asignación, Segmentación y Liquidación Operativa
              </p>
            </div>

            {/* Agencia: visible en TODOS los tamaños (antes desaparecía en tablet vertical). */}
            <label className="flex items-center bg-white/5 rounded-xl pl-2.5 pr-1 border border-white/10 min-h-[44px] shrink-0">
              <Building2 className="w-4 h-4 text-slate-400 shrink-0" aria-hidden />
              <span className="sr-only">Agencia</span>
              <select
                id="agencySelect"
                value={selectedAgency}
                onChange={(e) => onSelectAgency(e.target.value)}
                aria-label="Agencia"
                className="bg-transparent text-white text-sm font-semibold border-0 py-2 pl-1.5 pr-1 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-lg max-w-[42vw] sm:max-w-[200px] [&>option]:bg-slate-900"
              >
                <option value="TODAS">Todas las agencias</option>
                {agencies.map((ag) => (
                  <option key={ag} value={ag}>
                    {ag}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {notificaciones}
            {saveIndicator && <div className="hidden sm:block">{saveIndicator}</div>}

            {currentUsername && (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label={`Menú de usuario: ${currentUsername}`}
                  className="flex items-center gap-1.5 min-h-[44px] px-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  <User className="w-4 h-4 text-slate-300" aria-hidden />
                  <span className="hidden md:inline text-xs font-semibold max-w-[140px] truncate">{currentUsername}</span>
                  {isAdmin ? (
                    <span className="hidden md:inline text-[9px] font-bold text-indigo-200 bg-indigo-500/20 px-1.5 rounded-full">
                      ADMIN
                    </span>
                  ) : adminAgencias.length > 0 ? (
                    <span className="hidden md:inline text-[9px] font-bold text-violet-200 bg-violet-500/25 px-1.5 rounded-full">
                      ADMIN AGENCIA
                    </span>
                  ) : null}
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} aria-hidden />
                </button>

                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-2 w-64 bg-white text-slate-800 rounded-2xl shadow-2xl border border-slate-200 py-1.5 z-50"
                  >
                    <div className="px-4 py-2.5 border-b border-slate-100">
                      <div className="text-sm font-bold truncate">{currentUsername}</div>
                      <div className="text-xs text-slate-500">
                        {isAdmin
                          ? 'Administrador'
                          : adminAgencias.length > 0
                          ? `Administrador de: ${adminAgencias.join(', ')}`
                          : 'Usuario'}
                      </div>
                    </div>
                    {saveIndicator && <div className="sm:hidden px-4 py-2 bg-slate-900 mx-2 my-1.5 rounded-xl">{saveIndicator}</div>}
                    {onDownloadBackup && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          void onDownloadBackup();
                        }}
                        className={`${menuItem} hover:bg-slate-50`}
                      >
                        <Download className="w-5 h-5 text-slate-500" aria-hidden />
                        Descargar respaldo
                      </button>
                    )}
                    {onResetDemo && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          onResetDemo();
                        }}
                        className={`${menuItem} hover:bg-amber-50 text-amber-800`}
                      >
                        <RefreshCw className="w-5 h-5" aria-hidden />
                        Restablecer datos de prueba
                      </button>
                    )}
                    <div className="h-px bg-slate-100 my-1" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        onLogout?.();
                      }}
                      className={`${menuItem} hover:bg-rose-50 text-rose-700`}
                    >
                      <LogOut className="w-5 h-5" aria-hidden />
                      Cerrar sesión
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
