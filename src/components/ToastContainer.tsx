import React from 'react';
import { ToastMessage } from '../types';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

// Avisos: abajo al centro en tablet/teléfono (a la vista y lejos de los botones
// de la tabla) y abajo a la derecha en pantallas grandes. Los avisos con acción
// ("Deshacer") tienen un botón grande y duran más (ver showToast en App.tsx).
export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div
      id="toast-container"
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 lg:left-auto lg:translate-x-0 lg:right-5 z-[80] w-[calc(100%-2rem)] max-w-md space-y-2 pointer-events-none no-print print:hidden"
    >
      {toasts.map((toast) => {
        let bg = 'bg-slate-900 text-white border-slate-700';
        let Icon = Info;
        if (toast.type === 'success') {
          bg = 'bg-emerald-800 text-white border-emerald-600';
          Icon = CheckCircle2;
        } else if (toast.type === 'error') {
          bg = 'bg-rose-800 text-white border-rose-600';
          Icon = AlertCircle;
        }

        return (
          <div
            key={toast.id}
            className={`min-h-[52px] pl-4 pr-1.5 py-1.5 rounded-xl border text-sm shadow-xl flex items-center gap-2.5 pointer-events-auto ${bg}`}
          >
            <Icon className="w-5 h-5 flex-shrink-0" aria-hidden />
            <span className="font-medium flex-1 min-w-0">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action!.onClick();
                  onDismiss(toast.id);
                }}
                className="min-h-[44px] px-4 rounded-lg bg-white text-slate-900 font-bold text-sm cursor-pointer active:scale-95 shrink-0"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Cerrar aviso"
              title="Cerrar aviso"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
