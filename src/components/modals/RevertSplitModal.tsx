import React from 'react';
import { Route } from '../../types';
import { X, Undo2 } from 'lucide-react';

interface RevertSplitModalProps {
  isOpen: boolean;
  onClose: () => void;
  route: Route | null;
  siblings: Route[];
  onConfirmRevert: (parentRouteId: string) => void;
}

export const RevertSplitModal: React.FC<RevertSplitModalProps> = ({
  isOpen,
  onClose,
  route,
  siblings,
  onConfirmRevert,
}) => {
  if (!isOpen || !route) return null;

  const parentRouteId = route.parentRouteId || String(route.id).split('.')[0];
  const hasSettled = siblings.some((s) => s.estado === 'Liquidada');
  // Corrección: antes solo se bloqueaba si un viaje ya estaba Liquidado, pero un
  // viaje "En Tránsito" significa que el camión ya salió físicamente a la calle con
  // esa carga — revertir en ese momento reconstruye la ruta matriz y descarta el
  // historial de despacho de ese viaje (entregas/devoluciones que ya se hayan
  // registrado), aunque todavía no se haya liquidado formalmente.
  const hasInTransit = siblings.some((s) => s.estado === 'En Tránsito');
  const isBlocked = hasSettled || hasInTransit;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden transform transition-all p-6 space-y-4 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 text-indigo-600">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
              <Undo2 className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Revertir Partición de Ruta</h3>
              <p className="text-[11px] text-slate-500">
                Ruta Matriz {parentRouteId} ({siblings.length} viajes generados)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-slate-600 leading-relaxed">
          Esta ruta fue dividida en múltiples viajes. Al confirmar, se reunificará automáticamente toda la carga en la ruta matriz original en estado <strong>Pendiente</strong> y se liberarán los recursos asignados.
        </p>

        {hasSettled && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 font-medium">
            ⚠️ No se puede revertir porque al menos uno de los viajes ya fue liquidado.
          </div>
        )}
        {!hasSettled && hasInTransit && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 font-medium">
            ⚠️ No se puede revertir porque al menos uno de los viajes ya está En Tránsito (el camión ya salió con esa carga). Espera a que regrese y se liquide, o repórtalo primero, antes de revertir la partición.
          </div>
        )}

        <div className="pt-2">
          <button
            type="button"
            disabled={isBlocked}
            onClick={() => onConfirmRevert(parentRouteId)}
            className={`w-full py-2.5 px-4 rounded-xl font-bold flex items-center justify-center space-x-2 shadow-sm transition ${
              isBlocked
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
            }`}
          >
            <Undo2 className="w-4 h-4" />
            <span>Revertir y Restaurar Ruta Original</span>
          </button>
        </div>

        <div className="pt-2 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 border border-slate-300 text-slate-600 rounded-lg font-semibold hover:bg-slate-50 transition cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
