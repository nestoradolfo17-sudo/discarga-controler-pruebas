import React, { useState, useEffect } from 'react';
import { Route } from '../../types';
import { X, Trash2, Lock, AlertTriangle, KeyRound, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { getRouteKey } from '../../utils/routeKey';

interface DeleteRoutesModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Corrección: routeIds ahora son claves compuestas ID+Fecha (ver
  // src/utils/routeKey.ts), no solo el ID — el mismo ID de ruta puede repetirse en
  // fechas distintas, así que identificar solo por ID podía terminar seleccionando
  // (y eliminando) también otra fila con el mismo ID pero de otra fecha.
  routeIds: string[];
  routes: Route[];
  onConfirmDelete: (routeIds: string[]) => void;
}

export const DeleteRoutesModal: React.FC<DeleteRoutesModalProps> = ({
  isOpen,
  onClose,
  routeIds,
  routes,
  onConfirmDelete,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Corrección: se agrega un paso adicional de confirmación (escribir "ELIMINAR")
  // para eliminaciones de mayor riesgo — varias rutas a la vez o rutas que ya
  // fueron Liquidadas (contienen datos de cierre/entrega reales) — sin afectar el
  // flujo existente para eliminar una sola ruta no liquidada, que sigue igual.
  const [confirmPhrase, setConfirmPhrase] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setShowPassword(false);
      setError(null);
      setConfirmPhrase('');
    }
  }, [isOpen]);

  if (!isOpen || routeIds.length === 0) return null;

  const routesToDelete = routes.filter((r) => routeIds.includes(getRouteKey(r)));
  const isMultiple = routeIds.length > 1;
  const hasLiquidadas = routesToDelete.some((r) => r.estado === 'Liquidada');
  const isHighRisk = isMultiple || hasLiquidadas;
  const CONFIRM_WORD = 'ELIMINAR';
  const confirmPhraseOk = !isHighRisk || confirmPhrase.trim().toUpperCase() === CONFIRM_WORD;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmPhraseOk) {
      setError(`Escribe "${CONFIRM_WORD}" para confirmar antes de continuar.`);
      return;
    }
    // Corrección de seguridad: el código de autorización NO debe mostrarse nunca
    // en la interfaz (ni en el mensaje de error ni en el placeholder del campo,
    // ver más abajo). Antes se mostraba en texto plano en ambos lugares.
    if (password.trim() !== '1605') {
      setError('Código incorrecto. Verifica e intenta de nuevo.');
      return;
    }

    setError(null);
    onConfirmDelete(routeIds);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden transform transition-all p-5 sm:p-6 space-y-4 text-xs">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3.5">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0 text-rose-600 shadow-2xs">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm sm:text-base flex items-center gap-1.5">
                {isMultiple ? `Eliminar ${routeIds.length} Rutas Seleccionadas` : `Eliminar Ruta ${routesToDelete[0]?.id ?? routeIds[0]}`}
              </h3>
              <p className="text-[11px] text-rose-600 font-medium flex items-center gap-1 mt-0.5">
                <Lock className="w-3 h-3" />
                Requiere clave de seguridad administrativa
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition cursor-pointer"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning info */}
        <div className="p-3.5 bg-rose-50/70 border border-rose-200 rounded-xl text-rose-950 space-y-2">
          <div className="flex items-center gap-1.5 font-bold text-xs text-rose-900">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>Confirmación de Eliminación Permanente</span>
          </div>
          <p className="text-[11px] leading-relaxed text-rose-900">
            {isMultiple
              ? `Está a punto de eliminar ${routeIds.length} registros del tablero de rutas. Esta acción no se puede deshacer.`
              : `Está a punto de eliminar la ruta ${routesToDelete[0]?.id ?? routeIds[0]} del tablero de rutas. Esta acción no se puede deshacer.`}
          </p>
        </div>

        {/* Resumen de rutas a eliminar */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
          <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
            <span>Rutas afectadas ({routesToDelete.length})</span>
            <span className="font-mono text-slate-500 lowercase">
              {routesToDelete.reduce((acc, r) => acc + (parseFloat(String(r.cajasFisicas || 0)) || 0), 0).toFixed(1)} cajas totales
            </span>
          </div>
          <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 divide-y divide-slate-200/60">
            {routesToDelete.map((r) => (
              <div key={r.id} className="pt-1.5 first:pt-0 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono font-bold text-slate-800 bg-white px-1.5 py-0.5 rounded border border-slate-200 text-[11px]">
                    Ruta {r.id}
                  </span>
                  <span className="text-slate-600 truncate text-[11px]">{r.agencia}</span>
                  <span className="text-slate-400 text-[10px] truncate hidden sm:inline">({r.mercado || 'Mercado Abierto'})</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-[11px] text-slate-700">{r.cajasFisicas} cjs</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                      r.estado === 'En Tránsito'
                        ? 'bg-blue-100 text-blue-800'
                        : r.estado === 'Liquidada'
                        ? 'bg-emerald-100 text-emerald-800'
                        : r.estado === 'Abierta'
                        ? 'bg-indigo-100 text-indigo-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {r.estado}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {routesToDelete.some((r) => r.asignacion) && (
            <div className="text-[10px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200 mt-2">
              ℹ️ Las unidades o tripulaciones asignadas serán liberadas automáticamente a estado Disponible si no están asignadas a otras rutas activas.
            </div>
          )}
        </div>

        {/* Corrección: fricción adicional para eliminaciones de mayor riesgo (varias
            rutas a la vez, o rutas que ya fueron Liquidadas y por lo tanto contienen
            datos reales de cierre/entrega). Antes la fricción era la misma para
            cualquier eliminación, sin distinguir el riesgo. */}
        {isHighRisk && (
          <div className="p-3 bg-rose-100 border-2 border-rose-300 rounded-xl text-rose-950 space-y-2">
            <div className="flex items-center gap-1.5 font-black text-xs text-rose-900">
              <ShieldAlert className="w-4 h-4 text-rose-700 shrink-0" />
              <span>Riesgo Elevado — Confirmación Adicional Requerida</span>
            </div>
            <p className="text-[11px] leading-relaxed text-rose-900">
              {isMultiple && hasLiquidadas
                ? 'Estás eliminando varias rutas a la vez, incluyendo al menos una ya Liquidada (con datos reales de cierre y entrega).'
                : isMultiple
                ? 'Estás eliminando varias rutas a la vez.'
                : 'La ruta que vas a eliminar ya fue Liquidada (contiene datos reales de cierre y entrega).'}
              {' '}Para continuar, escribe <strong>{CONFIRM_WORD}</strong> abajo.
            </p>
            <input
              type="text"
              value={confirmPhrase}
              onChange={(e) => {
                setConfirmPhrase(e.target.value);
                if (error) setError(null);
              }}
              placeholder={`Escribe ${CONFIRM_WORD} para continuar`}
              className="w-full p-2 border border-rose-300 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 font-bold text-center uppercase tracking-widest text-rose-900 bg-white"
            />
          </div>
        )}

        {/* Formulario de contraseña */}
        <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
          <div>
            <label htmlFor="deletePasswordInput" className="block font-bold text-slate-800 text-xs mb-1.5 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-rose-600" />
              Contraseña de Autorización *:
            </label>
            <div className="relative">
              <input
                id="deletePasswordInput"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                autoFocus
                placeholder="Ingrese el código de autorización..."
                required
                className="w-full p-2.5 sm:p-3 pr-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:border-rose-500 font-mono text-xs sm:text-sm bg-white text-slate-900 outline-none shadow-2xs placeholder:text-slate-400 placeholder:font-sans"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {error && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-700 bg-rose-50 p-2 rounded-lg border border-rose-200 animate-in fade-in">
                <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Botones de acción */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer text-xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!confirmPhraseOk}
              title={!confirmPhraseOk ? `Escribe "${CONFIRM_WORD}" arriba para habilitar` : undefined}
              className={`px-5 py-2.5 rounded-xl font-bold flex items-center gap-1.5 shadow-sm transition text-xs ${
                !confirmPhraseOk
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white cursor-pointer'
              }`}
            >
              <Trash2 className="w-4 h-4" />
              <span>{isMultiple ? `Confirmar y Eliminar (${routeIds.length})` : 'Confirmar y Eliminar'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
