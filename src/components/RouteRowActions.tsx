import React from 'react';
import { Route } from '../types';
import { ACTION_ICONS } from './ui/actionIcons';

// --- Acciones de una fila del Tablero de Rutas ---
//
// Análisis de botones, puntos 1 y 18:
//   • Cada fila muestra DIRECTO el botón de la acción principal según su
//     estado (antes "Asignar" estaba dentro de "Acciones" = 2 toques):
//       Pendiente   → Asignar          (azul)
//       A Piso      → Sacar de Piso    (azul)
//       En Tránsito → Liquidar         (verde)
//       Abierta     → Liquidar         (verde)
//       Liquidada   → Ver Acta         (blanco)
//   • Todo lo demás queda en "⋯" (más acciones).
//   • Una sola tabla de configuración (getRowActions) en vez de repetir el
//     menú en 4 bloques por estado.
//   • Todos los botones miden al menos 44 px (dedo en tablet).

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'purple';
type IconType = React.ComponentType<{ className?: string }>;

export interface RowAction {
  key: string;
  label: string;
  hint?: string;
  icon: IconType;
  tone: Tone;
  run: () => void;
}

export interface RowActionHandlers {
  onAssign: () => void;
  onLiquidate: () => void;
  onSplit: () => void;
  onRevertSplit: () => void;
  onMoveToFloor?: () => void;
  // Ruta Bolsón: sacarla del bolsón (vuelve a quedar por asignar).
  onRemoveBolson?: () => void;
  // Self Service: quitar la marca (vuelve a quedar por asignar).
  onRemoveSelfService?: () => void;
  onViewReceipt: () => void;
  onViewConsolidated?: () => void;
  // Cambiar el segmento de la ruta (pide usuario y contraseña de administrador).
  onChangeSegment?: () => void;
  onDelete?: () => void;
}

export function getRowActions(
  route: Route,
  h: RowActionHandlers
): { primary: RowAction | null; more: RowAction[]; danger: RowAction[] } {
  const isPiso = !!(route.aPiso || route.tipoAsignacion === 'Ruta a Piso');
  const isBolson = !!(route.esBolson || route.tipoAsignacion === 'Ruta Bolsón');
  const isSelfService = !!(route.esSelfService || route.tipoAsignacion === 'Self Service');
  const canSplit = !route.isSplitRoute && route.estado === 'Pendiente';
  const more: RowAction[] = [];
  let primary: RowAction | null = null;

  const aPiso: RowAction | null = h.onMoveToFloor
    ? { key: 'piso', label: 'A Piso', hint: 'Guardar en bodega para mañana', icon: ACTION_ICONS.aPiso, tone: 'warning', run: h.onMoveToFloor }
    : null;
  const split: RowAction = { key: 'partir', label: 'Partir en viajes', hint: 'Dividir clientes y carga', icon: ACTION_ICONS.partir, tone: 'purple', run: h.onSplit };
  const revert: RowAction = { key: 'revertir', label: 'Revertir partición', hint: 'Volver a la ruta original', icon: ACTION_ICONS.revertir, tone: 'danger', run: h.onRevertSplit };

  switch (route.estado) {
    case 'Pendiente':
      if (isSelfService) {
        // Sin camión ni tripulación: se liquida directo con el formulario normal.
        primary = { key: 'liquidar', label: 'Liquidar Self Service', hint: 'Registrar entrega y cierre (sin tripulación)', icon: ACTION_ICONS.liquidar, tone: 'success', run: h.onLiquidate };
        if (h.onRemoveSelfService) more.push({ key: 'quitarSelfService', label: 'Quitar Self Service', hint: 'Vuelve a quedar por asignar', icon: ACTION_ICONS.revertir, tone: 'primary', run: h.onRemoveSelfService });
        break;
      }
      if (isBolson) {
        // No sale a ruta: se liquida directo como rechazo (sin camión ni tripulación).
        primary = { key: 'liquidar', label: 'Liquidar bolsón', hint: 'Cerrar como rechazo (no salió)', icon: ACTION_ICONS.liquidar, tone: 'success', run: h.onLiquidate };
        if (h.onRemoveBolson) more.push({ key: 'quitarBolson', label: 'Quitar de Bolsón', hint: 'Vuelve a quedar por asignar', icon: ACTION_ICONS.revertir, tone: 'primary', run: h.onRemoveBolson });
        break;
      }
      if (isPiso) {
        primary = { key: 'asignar', label: 'Sacar de Piso', hint: 'Asignar camión y despachar hoy', icon: ACTION_ICONS.asignar, tone: 'primary', run: h.onAssign };
      } else {
        primary = { key: 'asignar', label: 'Asignar', hint: 'Camión y tripulación', icon: ACTION_ICONS.asignar, tone: 'primary', run: h.onAssign };
        if (aPiso) more.push(aPiso);
      }
      if (canSplit) more.push(split);
      if (route.isSplitRoute) more.push(revert);
      break;
    case 'En Tránsito':
      primary = { key: 'liquidar', label: 'Liquidar', hint: 'Registrar entrega y cierre', icon: ACTION_ICONS.liquidar, tone: 'success', run: h.onLiquidate };
      more.push({ key: 'reasignar', label: 'Modificar / Reasignar', hint: 'Cambiar camión o tripulación', icon: ACTION_ICONS.reasignar, tone: 'primary', run: h.onAssign });
      if (aPiso) more.push(aPiso);
      break;
    case 'Abierta':
      primary = { key: 'liquidar', label: 'Liquidar', hint: 'Liquidar definitivamente', icon: ACTION_ICONS.liquidar, tone: 'success', run: h.onLiquidate };
      more.push({ key: 'reasignar', label: 'Reasignar / 2° viaje', hint: 'Recarga o nueva tripulación', icon: ACTION_ICONS.reasignar, tone: 'primary', run: h.onAssign });
      if (aPiso) more.push(aPiso);
      break;
    case 'Liquidada':
      primary = { key: 'acta', label: 'Acta', hint: 'Comprobante de liquidación', icon: ACTION_ICONS.acta, tone: 'neutral', run: h.onViewReceipt };
      if (h.onViewConsolidated) {
        more.push({ key: 'consolidada', label: 'Acta consolidada', hint: 'Resumen de viajes divididos', icon: ACTION_ICONS.acta, tone: 'purple', run: h.onViewConsolidated });
      }
      break;
  }

  if (h.onChangeSegment && route.estado !== 'Liquidada') {
    more.push({ key: 'segmento', label: 'Cambiar segmento', hint: 'Requiere contraseña de administrador', icon: ACTION_ICONS.segmento, tone: 'neutral', run: h.onChangeSegment });
  }

  const danger: RowAction[] = h.onDelete
    ? [{ key: 'eliminar', label: 'Eliminar ruta', hint: 'Se confirma con tu contraseña', icon: ACTION_ICONS.eliminar, tone: 'danger', run: h.onDelete }]
    : [];

  return { primary, more, danger };
}

const PRIMARY_BTN: Record<Tone, string> = {
  primary: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white border-blue-600 focus-visible:ring-blue-300',
  success: 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white border-emerald-600 focus-visible:ring-emerald-300',
  warning: 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500 focus-visible:ring-amber-300',
  danger: 'bg-rose-600 hover:bg-rose-700 text-white border-rose-600 focus-visible:ring-rose-300',
  neutral: 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 focus-visible:ring-slate-300',
  purple: 'bg-white hover:bg-purple-50 text-purple-800 border-purple-300 focus-visible:ring-purple-300',
};

const MENU_ICON: Record<Tone, string> = {
  primary: 'bg-blue-100 text-blue-700',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-rose-100 text-rose-700',
  neutral: 'bg-slate-100 text-slate-600',
  purple: 'bg-purple-100 text-purple-700',
};

interface RouteRowActionsProps {
  route: Route;
  handlers: RowActionHandlers;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  openUp?: boolean;
  onViewDetail: () => void;
  detailTitle: string;
  detailTone: 'assigned' | 'released' | 'none';
}

export const RouteRowActions: React.FC<RouteRowActionsProps> = ({
  route,
  handlers,
  isMenuOpen,
  onToggleMenu,
  onCloseMenu,
  openUp,
  onViewDetail,
  detailTitle,
  detailTone,
}) => {
  const { primary, more, danger } = getRowActions(route, handlers);
  const hasMenu = more.length + danger.length > 0;
  const PrimaryIcon = primary?.icon;
  const DetailIcon = ACTION_ICONS.detalle;
  const MoreIcon = ACTION_ICONS.mas;

  const detailCls =
    detailTone === 'assigned'
      ? 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-600 hover:text-white'
      : detailTone === 'released'
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-600 hover:text-white'
      : 'text-slate-500 bg-slate-50 border-slate-200 hover:bg-slate-200 hover:text-slate-800';

  const run = (a: RowAction) => {
    onCloseMenu();
    a.run();
  };

  const renderItem = (a: RowAction) => {
    const Icon = a.icon;
    return (
      <button
        key={a.key}
        type="button"
        role="menuitem"
        onClick={() => run(a)}
        className={`w-full min-h-[52px] text-left px-3 flex items-center gap-3 transition cursor-pointer outline-none focus-visible:bg-slate-100 ${
          a.tone === 'danger' ? 'hover:bg-rose-50' : 'hover:bg-slate-50'
        }`}
      >
        <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${MENU_ICON[a.tone]}`}>
          <Icon className="w-4.5 h-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-semibold ${a.tone === 'danger' ? 'text-rose-700' : 'text-slate-800'}`}>{a.label}</span>
          {a.hint && <span className="block text-[11px] text-slate-500">{a.hint}</span>}
        </span>
      </button>
    );
  };

  return (
    <div className="flex items-center justify-center gap-1.5">
      {primary && PrimaryIcon && (
        <button
          type="button"
          onClick={() => run(primary)}
          title={primary.hint ? `${primary.label}: ${primary.hint}` : primary.label}
          className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-3 text-xs sm:text-sm font-bold rounded-xl border shadow-2xs transition-all cursor-pointer active:scale-95 outline-none focus-visible:ring-4 ${PRIMARY_BTN[primary.tone]}`}
        >
          <PrimaryIcon className="w-4 h-4 shrink-0" />
          <span>{primary.label}</span>
        </button>
      )}
      <button
        type="button"
        onClick={onViewDetail}
        aria-label={`Ver detalle de la ruta ${route.id}`}
        title={detailTitle}
        className={`inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl border transition-all cursor-pointer active:scale-95 shrink-0 outline-none focus-visible:ring-4 focus-visible:ring-blue-200 ${detailCls}`}
      >
        <DetailIcon className="w-5 h-5" />
      </button>
      {hasMenu && (
        <div className="relative inline-block text-left actions-dropdown-container">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMenu();
            }}
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            aria-label={`Más acciones para la ruta ${route.id}`}
            title="Más acciones"
            className={`inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl border transition-all cursor-pointer active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-blue-200 ${
              isMenuOpen ? 'bg-slate-900 text-white border-slate-900' : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
            }`}
          >
            <MoreIcon className="w-5 h-5" />
          </button>
          {isMenuOpen && (
            <div
              role="menu"
              className={`absolute right-0 ${openUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} z-50 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 text-left`}
            >
              <div className="px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Ruta {route.id} · {route.estado}
              </div>
              {more.map(renderItem)}
              {danger.length > 0 && (
                <>
                  {more.length > 0 && <div className="h-px bg-slate-100 my-1" />}
                  {danger.map(renderItem)}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
