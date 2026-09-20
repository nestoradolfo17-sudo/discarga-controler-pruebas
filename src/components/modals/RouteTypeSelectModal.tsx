import React from 'react';
import { X, PackageCheck, ArrowLeftRight } from 'lucide-react';

interface RouteTypeSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEntrega: () => void;
  onSelectTraslado: () => void;
}

export const RouteTypeSelectModal: React.FC<RouteTypeSelectModalProps> = ({
  isOpen,
  onClose,
  onSelectEntrega,
  onSelectTraslado,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden transform transition-all">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span>
            <h3 className="font-bold text-sm">¿Qué tipo de ruta deseas crear?</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={onSelectEntrega}
            className="group flex flex-col items-start text-left p-5 rounded-2xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 transition-all cursor-pointer"
          >
            <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <PackageCheck className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-sm text-slate-800 mb-1">Ruta Entrega</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Reparto normal de mercadería a clientes. El ID se genera automáticamente.
            </p>
          </button>

          <button
            type="button"
            onClick={onSelectTraslado}
            className="group flex flex-col items-start text-left p-5 rounded-2xl border-2 border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/50 transition-all cursor-pointer"
          >
            <div className="w-11 h-11 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <h4 className="font-bold text-sm text-slate-800 mb-1">Ruta Traslado</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Movimiento de unidades entre agencias/bodegas. Incluye origen, destino y razón.
            </p>
          </button>
        </div>

        <div className="px-6 pb-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg font-semibold hover:bg-slate-50 cursor-pointer text-xs"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
