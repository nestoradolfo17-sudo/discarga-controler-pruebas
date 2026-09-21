import React, { useState, useEffect } from 'react';
import { Route } from '../../types';
import { X, Lock, CheckCircle } from 'lucide-react';

interface FinalizeCajaAbiertaModalProps {
  isOpen: boolean;
  onClose: () => void;
  route: Route | null;
  onConfirmFinalize: (routeId: string, fecha: string, comentarioFinal?: string) => void;
}

// Modal para registrar la "Liquidación Final" de una ruta que quedó en estado
// Caja Abierta (pendiente de validar la caja/boleta del punto de venta). No
// modifica ningún dato operativo ya liquidado (cajas, paradas, motivo, etc.):
// únicamente marca el pendiente como resuelto y guarda la fecha y un
// comentario opcional de cierre, para trazabilidad en el Tablero de Rutas
// Liquidadas.
export const FinalizeCajaAbiertaModal: React.FC<FinalizeCajaAbiertaModalProps> = ({
  isOpen,
  onClose,
  route,
  onConfirmFinalize,
}) => {
  const [comentarioFinal, setComentarioFinal] = useState('');

  useEffect(() => {
    if (isOpen) {
      setComentarioFinal('');
    }
  }, [isOpen, route]);

  if (!isOpen || !route) return null;

  const liq = route.liquidacion;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden transform transition-all p-6 space-y-4 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 text-amber-700">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <Lock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Liquidación Final (Caja Abierta)</h3>
              <p className="text-[11px] text-slate-500">Ruta {route.id} | Agencia: {route.agencia}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {liq?.motivoCajaAbierta && (
          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">
            <span className="font-semibold">Motivo pendiente de validar:</span> {liq.motivoCajaAbierta}
          </div>
        )}

        <p className="text-slate-600 leading-relaxed">
          Esta ruta ya fue liquidada operativamente y solo quedó marcada como <strong>Caja Abierta</strong> a la espera
          de validar la caja/boleta del punto de venta. Al confirmar la <strong>Liquidación Final</strong>, se cierra
          ese pendiente y queda registrada la fecha de validación, sin modificar los datos ya liquidados de la ruta.
        </p>

        <div>
          <label className="block font-semibold text-slate-700 mb-1">Comentario de cierre (opcional)</label>
          <textarea
            value={comentarioFinal}
            onChange={(e) => setComentarioFinal(e.target.value)}
            rows={2}
            placeholder="Ej: Boleta validada en caja el día de hoy, sin diferencias..."
            className="w-full p-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-amber-500 outline-none resize-none"
          />
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={() => onConfirmFinalize(route.id, route.fecha, comentarioFinal.trim() || undefined)}
            className="w-full py-2.5 px-4 rounded-xl font-bold flex items-center justify-center space-x-2 shadow-sm transition bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
          >
            <CheckCircle className="w-4 h-4" />
            <span>Registrar Liquidación Final</span>
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
