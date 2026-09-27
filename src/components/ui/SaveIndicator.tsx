import React from 'react';
import { Loader2, CheckCircle2, CloudOff, AlertTriangle } from 'lucide-react';

// Estado de guardado en la base compartida, siempre a la vista en la barra
// superior: el usuario sabe si su asignación/liquidación ya quedó guardada.
interface SaveIndicatorProps {
  isOnline: boolean;
  pending: number;
  failed: boolean;
  compact?: boolean;
}

export const SaveIndicator: React.FC<SaveIndicatorProps> = ({ isOnline, pending, failed, compact }) => {
  let Icon: React.ComponentType<{ className?: string }> = CheckCircle2;
  let text = 'Guardado';
  let cls = 'text-emerald-300 bg-emerald-500/10 border-emerald-400/20';
  let spin = false;
  if (!isOnline) {
    Icon = CloudOff;
    text = 'Sin conexión';
    cls = 'text-rose-200 bg-rose-500/20 border-rose-400/40';
  } else if (pending > 0) {
    Icon = Loader2;
    text = 'Guardando…';
    cls = 'text-sky-200 bg-sky-500/15 border-sky-400/30';
    spin = true;
  } else if (failed) {
    Icon = AlertTriangle;
    text = 'No se guardó';
    cls = 'text-amber-200 bg-amber-500/20 border-amber-400/40';
  }
  return (
    <div
      role="status"
      aria-live="polite"
      title={text}
      className={`flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-xl border text-xs font-semibold whitespace-nowrap ${cls}`}
    >
      <Icon className={`w-4 h-4 shrink-0 ${spin ? 'animate-spin' : ''}`} aria-hidden />
      <span className={compact ? 'hidden xl:inline' : ''}>{text}</span>
    </div>
  );
};
