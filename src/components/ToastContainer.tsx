import React from 'react';
import { ToastMessage } from '../types';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  return (
    <div id="toast-container" className="fixed bottom-5 right-5 z-50 space-y-2 pointer-events-none no-print print:hidden">
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
            className={`p-3 px-4 rounded-xl border text-xs shadow-xl flex items-center space-x-2 transition-all transform pointer-events-auto ${bg}`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">{toast.message}</span>
            <button
              onClick={() => onDismiss(toast.id)}
              className="ml-2 text-white/70 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
