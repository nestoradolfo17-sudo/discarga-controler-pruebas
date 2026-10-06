import {
  Send,
  RotateCcw,
  CheckCircle,
  Split,
  Undo2,
  Warehouse,
  Eye,
  Trash2,
  Download,
  FileText,
  Repeat,
  ClipboardCheck,
  Maximize2,
  Minimize2,
  X,
  Users,
  Plus,
  Tag,
} from 'lucide-react';
import React from 'react';

// Ícono "⋯" (más acciones) dibujado aquí para no depender del nombre del ícono
// en la versión instalada de lucide-react.
function MoreDots({ className }: { className?: string }) {
  return React.createElement(
    'svg',
    { className, viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true },
    React.createElement('circle', { cx: 5, cy: 12, r: 2 }),
    React.createElement('circle', { cx: 12, cy: 12, r: 2 }),
    React.createElement('circle', { cx: 19, cy: 12, r: 2 })
  );
}

// --- Diccionario fijo de íconos por acción ---
// Una acción = un ícono en toda la app (antes "Asignar" era 🚚, 👤+ o ➕ según
// la pantalla y "Eliminar" era 🗑 o ✕). Usar siempre este mapa.
export const ACTION_ICONS = {
  asignar: Send,
  reasignar: RotateCcw,
  recarga: Repeat,
  liquidar: CheckCircle,
  partir: Split,
  revertir: Undo2,
  aPiso: Warehouse,
  detalle: Eye,
  clientes: Users,
  eliminar: Trash2,
  exportar: Download,
  acta: FileText,
  finAsignacion: ClipboardCheck,
  pantallaCompleta: Maximize2,
  restaurar: Minimize2,
  cerrar: X,
  nuevo: Plus,
  mas: MoreDots,
  segmento: Tag,
} as const;

export type ActionIconKey = keyof typeof ACTION_ICONS;
