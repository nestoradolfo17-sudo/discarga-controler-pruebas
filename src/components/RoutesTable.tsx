import React from 'react';
import { Route, Truck, Staff } from '../types';
import {
  getRouteElapsedHours,
  formatDateToGuatemala,
  formatDateTimeToGuatemala,
  getTomorrowGuatemalaDate,
  parseFlexibleDate,
} from '../utils/date';
import {
  Clock,
  AlertCircle,
  AlertTriangle,
  Flame,
  CheckCircle,
  Package,
  RotateCcw,
  Repeat,
  Warehouse,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Users,
} from 'lucide-react';
import { AssignmentDetailModal } from './modals/AssignmentDetailModal';
import { ClientesRutaList } from './ClientesRutaList';
import { RouteRowActions } from './RouteRowActions';
import { Button } from './ui/Button';
import { ACTION_ICONS } from './ui/actionIcons';
import { getRouteKey, isSameSplitGroup } from '../utils/routeKey';

interface RoutesTableProps {
  // Rediseño tablet: el tablero ocupa toda la altura disponible de la pantalla
  // (con su propio scroll y encabezado fijo) en vez de un máximo de 70vh.
  fillHeight?: boolean;
  routes: Route[];
  allRoutes: Route[];
  trucks?: Truck[];
  staff?: Staff[];
  // Corrección: el mismo ID de ruta puede repetirse en fechas distintas (ruta
  // recurrente). Se agrega "fecha" a estos callbacks para identificar sin ambigüedad
  // la fila exacta sobre la que se hizo clic (ver src/utils/routeKey.ts).
  onOpenAssignModal: (routeId: string, fecha: string) => void;
  onOpenLiquidateModal: (routeId: string, fecha: string) => void;
  onOpenSplitRouteModal: (routeId: string, fecha: string) => void;
  onOpenRevertSplitModal: (routeId: string, fecha: string) => void;
  onViewSettlementReceipt: (routeId: string, fecha: string) => void;
  onViewConsolidatedReceipt: (parentRouteId: string, ref?: Route) => void;
  onOpenNewRouteModal: () => void;
  onMoveToFloor?: (routeId: string, fecha: string, tomorrowDate: string, motivo?: string) => void;
  // routeIds aquí son claves compuestas ID+Fecha (ver getRouteKey), no solo el ID.
  onBulkMoveToFloor?: (routeIds: string[]) => void;
  onOpenDeleteModal?: (routeIds: string[]) => void;
}

type SortKey =
  | 'id'
  | 'agencia'
  | 'mercado'
  | 'segmento'
  | 'fecha'
  | 'horas'
  | 'carga'
  | 'asignacion'
  | 'camion'
  | 'tripulacion'
  | 'estado'
  | 'liquidacion';

type SortOrder = 'asc' | 'desc';

export const RoutesTable: React.FC<RoutesTableProps> = ({
  fillHeight = false,
  routes,
  allRoutes,
  trucks = [],
  staff = [],
  onOpenAssignModal,
  onOpenLiquidateModal,
  onOpenSplitRouteModal,
  onOpenRevertSplitModal,
  onViewSettlementReceipt,
  onViewConsolidatedReceipt,
  onOpenNewRouteModal,
  onMoveToFloor,
  onBulkMoveToFloor,
  onOpenDeleteModal,
}) => {
  const [activeDropdownId, setActiveDropdownId] = React.useState<string | null>(null);
  const [sortKey, setSortKey] = React.useState<SortKey | null>(null);
  const [sortOrder, setSortOrder] = React.useState<SortOrder>('asc');
  const [selectedRouteIds, setSelectedRouteIds] = React.useState<string[]>([]);
  const [viewingAssignmentRoute, setViewingAssignmentRoute] = React.useState<Route | null>(null);
  // Clave (ID+Fecha) de la ruta cuya lista de clientes de referencia está
  // desplegada debajo de su fila, o null si ninguna está abierta.
  const [expandedClientesKey, setExpandedClientesKey] = React.useState<string | null>(null);

  // Limpiar seleccionados que ya no existan en la lista de rutas
  React.useEffect(() => {
    const validKeys = new Set(routes.map((r) => getRouteKey(r)));
    setSelectedRouteIds((prev) => prev.filter((key) => validKeys.has(key)));
  }, [routes]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Para métricas numéricas se inicia de mayor a menor (desc). Para texto/alfabético de A a Z (asc).
      if (key === 'horas' || key === 'carga') {
        setSortOrder('desc');
      } else {
        setSortOrder('asc');
      }
    }
  };

  const sortedRoutes = React.useMemo(() => {
    if (!sortKey) return routes;

    return [...routes].sort((a, b) => {
      let comparison = 0;
      switch (sortKey) {
        case 'id':
          comparison = (a.id || '').localeCompare(b.id || '', undefined, {
            numeric: true,
            sensitivity: 'base',
          });
          break;
        case 'agencia':
          comparison = (a.agencia || '').localeCompare(b.agencia || '', undefined, {
            sensitivity: 'base',
          });
          break;
        case 'mercado':
          comparison = (a.mercado || 'Mercado Abierto').localeCompare(
            b.mercado || 'Mercado Abierto',
            undefined,
            { sensitivity: 'base' }
          );
          break;
        case 'segmento':
          comparison = (a.segmento || '').localeCompare(b.segmento || '', undefined, {
            sensitivity: 'base',
          });
          break;
        case 'fecha': {
          const fA = a.fechaOriginalRuta || a.fecha || a.fechaCarga || '';
          const fB = b.fechaOriginalRuta || b.fecha || b.fechaCarga || '';
          const dA = parseFlexibleDate(fA)?.getTime() || 0;
          const dB = parseFlexibleDate(fB)?.getTime() || 0;
          if (dA !== dB) {
            comparison = dA - dB;
          } else {
            comparison = fA.localeCompare(fB, undefined, { numeric: true, sensitivity: 'base' });
          }
          break;
        }
        case 'horas':
          comparison = getRouteElapsedHours(a) - getRouteElapsedHours(b);
          break;
        case 'carga': {
          const cA = Number(a.cajasFisicas) || 0;
          const cB = Number(b.cajasFisicas) || 0;
          if (cA !== cB) {
            comparison = cA - cB;
          } else {
            comparison = (Number(a.paradas) || 0) - (Number(b.paradas) || 0);
          }
          break;
        }
        case 'asignacion':
        case 'camion': {
          const pA = a.asignacion ? `${a.asignacion.camionPlaca} ${a.asignacion.conductor}` : a.estado === 'Abierta' ? '00_Liberada' : 'ZZ_Sin asignar';
          const pB = b.asignacion ? `${b.asignacion.camionPlaca} ${b.asignacion.conductor}` : b.estado === 'Abierta' ? '00_Liberada' : 'ZZ_Sin asignar';
          comparison = pA.localeCompare(pB, undefined, { numeric: true, sensitivity: 'base' });
          break;
        }
        case 'tripulacion': {
          const tA = a.asignacion?.conductor || (a.estado === 'Abierta' ? 'Liberado' : 'Sin tripulación');
          const tB = b.asignacion?.conductor || (b.estado === 'Abierta' ? 'Liberado' : 'Sin tripulación');
          comparison = tA.localeCompare(tB, undefined, { sensitivity: 'base' });
          break;
        }
        case 'estado': {
          const sA = (a.aPiso ? 'A Piso' : a.estado) || '';
          const sB = (b.aPiso ? 'A Piso' : b.estado) || '';
          comparison = sA.localeCompare(sB, undefined, { sensitivity: 'base' });
          break;
        }
        case 'liquidacion': {
          const lA =
            a.liquidacion?.cajasEntregadas !== undefined
              ? Number(a.liquidacion.cajasEntregadas)
              : a.estado === 'Liquidada'
              ? 999999
              : -1;
          const lB =
            b.liquidacion?.cajasEntregadas !== undefined
              ? Number(b.liquidacion.cajasEntregadas)
              : b.estado === 'Liquidada'
              ? 999999
              : -1;
          comparison = lA - lB;
          break;
        }
        default:
          comparison = 0;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [routes, sortKey, sortOrder]);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('.actions-dropdown-container')) {
        setActiveDropdownId(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
  if (routes.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
        <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
          <Package className="w-8 h-8" />
        </div>
        <h4 className="text-slate-700 font-bold text-base">No hay rutas activas para mostrar</h4>
        <p className="text-slate-500 text-xs mt-1">
          Las rutas liquidadas han pasado al Tablero de Rutas Liquidadas. Crea una nueva ruta o ajusta los filtros.
        </p>
        <Button variant="primary" icon={ACTION_ICONS.nuevo} onClick={onOpenNewRouteModal} className="mt-4">
          Crear nueva ruta
        </Button>
      </div>
    );
  }

  const renderElapsedBadge = (route: Route) => {
    if (route.estado === 'Liquidada') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] md:text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>Liquidada</span>
        </span>
      );
    }

    const hours = getRouteElapsedHours(route);

    if (hours >= 72) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] md:text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300 shadow-2xs animate-pulse whitespace-nowrap">
          <Flame className="w-3.5 h-3.5 text-rose-600 shrink-0" />
          <span>{hours}h sin liq.</span>
        </span>
      );
    } else if (hours >= 48) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] md:text-xs font-bold bg-orange-100 text-orange-900 border border-orange-300 whitespace-nowrap">
          <AlertCircle className="w-3.5 h-3.5 text-orange-600 shrink-0" />
          <span>{hours}h sin liq.</span>
        </span>
      );
    } else if (hours >= 24) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] md:text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>{hours}h sin liq.</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] md:text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
        <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <span>{hours}h sin liq.</span>
      </span>
    );
  };

  const renderSortHeader = (key: SortKey, label: string, extraClass: string = '') => {
    const isActive = sortKey === key;
    return (
      <th
        scope="col"
        aria-sort={isActive ? (sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}
        // Corrección: el "sticky" se aplica en cada <th> (no en el <thead>), que es
        // el patrón que de verdad funciona de forma consistente en navegadores
        // basados en Chromium para encabezados de tabla — poner "sticky" solo en el
        // <thead> se veía bien en el código pero no se pegaba visualmente al
        // desplazarse. Cada celda necesita también su propio fondo sólido
        // (bg-slate-50) porque, al pegarse de forma independiente, sin esto se
        // vería el contenido de las filas pasando "por debajo" y transparentándose.
        className={`px-2 md:px-2.5 lg:px-3 py-1 select-none transition-colors hover:bg-slate-100 group sticky top-0 z-20 bg-slate-50 ${extraClass}`}
        title={`Ordenar por ${label} (${
          isActive
            ? sortOrder === 'asc'
              ? 'Ascendente: Menor a Mayor / A-Z'
              : 'Descendente: Mayor a Menor / Z-A'
            : 'Clic para ordenar'
        })`}
      >
        <button
          type="button"
          onClick={() => handleSort(key)}
          className={`flex items-center gap-1 w-full min-h-[36px] uppercase tracking-wider font-bold cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded ${extraClass.includes('text-center') ? 'justify-center' : ''}`}
        >
          <span className={isActive ? 'text-blue-700 font-extrabold' : ''}>{label}</span>
          <span
            className={`inline-flex items-center transition-colors ${
              isActive ? 'text-blue-600' : 'text-slate-500 group-hover:text-blue-600'
            }`}
          >
            {isActive ? (
              sortOrder === 'asc' ? (
                <ArrowUp className="w-3 h-3 stroke-[2.5]" />
              ) : (
                <ArrowDown className="w-3 h-3 stroke-[2.5]" />
              )
            ) : (
              <ArrowUpDown className="w-3 h-3" />
            )}
          </span>
        </button>
      </th>
    );
  };

  // Sumador de la selección: subtotal de cajas físicas y paradas de las rutas
  // marcadas con la casilla (útil para armar la carga de un camión con varias rutas).
  const selectedKeySet = new Set(selectedRouteIds);
  const selectedRoutesForTotals = allRoutes.filter((r) => selectedKeySet.has(getRouteKey(r)));
  const subtotalCajas = selectedRoutesForTotals.reduce((acc, r) => acc + (parseFloat(String(r.cajasFisicas || 0)) || 0), 0);
  const subtotalParadas = selectedRoutesForTotals.reduce((acc, r) => acc + (parseInt(String(r.paradas || 0)) || 0), 0);

  return (
    <div className={`bg-white border border-slate-200/80 rounded-2xl shadow-sm w-full ${fillHeight ? 'h-full flex flex-col' : ''}`}>
      {/* Barra de selección: sumador (subtotal de cajas y paradas) + acciones
          en lote. Azul (no rojo): seleccionar se usa sobre todo para sumar carga,
          no solo para eliminar. */}
      {selectedRouteIds.length > 0 && (
        <div className="bg-blue-50 border-b border-blue-200 px-3 md:px-4 py-2 flex flex-wrap items-center justify-between gap-2 animate-in fade-in slide-in-from-top-1 text-xs">
          <div className="flex items-center gap-2 text-blue-900 font-medium flex-wrap">
            <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1 rounded-full bg-blue-600 text-white font-bold text-[11px]">
              {selectedRouteIds.length}
            </span>
            <span className="text-sm">
              {selectedRouteIds.length === 1 ? '1 ruta seleccionada' : `${selectedRouteIds.length} rutas seleccionadas`}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl bg-white border border-blue-200 text-blue-800 shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wide text-blue-500">Subtotal</span>
              <span className="text-sm font-extrabold font-mono">
                {subtotalCajas.toLocaleString('es-GT', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
              </span>
              <span className="text-[11px] font-semibold">cajas</span>
              <span className="text-slate-300">·</span>
              <span className="text-sm font-bold">{subtotalParadas}</span>
              <span className="text-[11px] font-semibold">paradas</span>
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => setSelectedRouteIds([])}>
              Quitar selección
            </Button>
            {onBulkMoveToFloor && (
              <Button
                variant="warning"
                size="sm"
                icon={ACTION_ICONS.aPiso}
                onClick={() => {
                  onBulkMoveToFloor(selectedRouteIds);
                  setSelectedRouteIds([]);
                }}
              >
                Enviar a Piso ({selectedRouteIds.length})
              </Button>
            )}
            {onOpenDeleteModal && (
              <Button
                variant="danger"
                size="sm"
                icon={ACTION_ICONS.eliminar}
                onClick={() => onOpenDeleteModal(selectedRouteIds)}
              >
                Eliminar ({selectedRouteIds.length})
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Corrección (causa real del encabezado "trabado"): este contenedor de la
          tabla tiene "overflow-x-auto" para poder deslizarla horizontalmente en
          pantallas angostas. Por especificación CSS, en cuanto un eje de overflow
          es distinto de "visible" (overflow-x), el otro eje (overflow-y) se calcula
          también como "auto" aunque no se declare — esto convertía a este div en su
          propio "contenedor de scroll". Como "position: sticky" se calcula siempre
          respecto a su contenedor de scroll más cercano, el encabezado dejaba de
          fijarse contra la ventana/Navbar (para lo cual se había usado "top-[68px]")
          e intentaba fijarse contra ESTE div — que no tenía altura limitada ni
          scroll propio real, dando el comportamiento errático reportado ("se queda
          trabado"). La quitada anterior de "overflow-hidden" en el contenedor
          exterior no resolvía esto porque el problema estaba aquí, no allá. Fix:
          este mismo contenedor ahora tiene también su propio scroll vertical
          limitado ("overflow-auto" + "max-h-[70vh]"), y el encabezado se fija con
          "top-0" respecto a SU PROPIO borde superior — ya no depende del scroll de
          la ventana ni de la Navbar. */}
      <div className={`overflow-auto pb-8 md:pb-10 ${fillHeight ? 'flex-1 min-h-0' : 'min-h-[280px] max-h-[70vh]'}`}>
        <table className="w-full divide-y divide-slate-200 text-left text-xs">
          {/* El "sticky" real se aplica celda por celda (ver renderSortHeader y los
              <th> de abajo), no aquí en el <thead> — ver la nota en renderSortHeader. */}
          <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider font-bold text-[10px] md:text-[11px]">
            <tr>
              <th scope="col" className="px-1 py-1 w-12 text-center sticky top-0 z-20 bg-slate-50">
                <label className="inline-flex items-center justify-center min-w-[40px] min-h-[40px] rounded-lg hover:bg-slate-100 cursor-pointer">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todas las rutas visibles"
                  checked={
                    sortedRoutes.length > 0 &&
                    sortedRoutes.every((r) => selectedRouteIds.includes(getRouteKey(r)))
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      const allVisibleKeys = sortedRoutes.map((r) => getRouteKey(r));
                      setSelectedRouteIds(Array.from(new Set([...selectedRouteIds, ...allVisibleKeys])));
                    } else {
                      const visibleKeySet = new Set(sortedRoutes.map((r) => getRouteKey(r)));
                      setSelectedRouteIds(selectedRouteIds.filter((key) => !visibleKeySet.has(key)));
                    }
                  }}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-5 h-5"
                />
                </label>
              </th>
              {renderSortHeader('id', 'ID', 'whitespace-nowrap')}
              {renderSortHeader('agencia', 'Agencia')}
              {renderSortHeader('segmento', 'Segmento')}
              {renderSortHeader('fecha', 'Fecha')}
              {renderSortHeader('carga', 'Carga')}
              <th scope="col" className="px-2 md:px-2.5 lg:px-3 py-2 md:py-2.5 text-center whitespace-nowrap sticky top-0 z-20 bg-slate-50">Acciones</th>
              {renderSortHeader('horas', 'Horas sin Liq.', 'whitespace-nowrap')}
              {renderSortHeader('estado', 'Estado')}
              {renderSortHeader('asignacion', 'Camión y Tripulación', 'text-center whitespace-nowrap')}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-normal">
            {sortedRoutes.map((route, index) => {
              const isAbierta = route.estado === 'Abierta';
              const routeKey = getRouteKey(route);
              const isSelected = selectedRouteIds.includes(routeKey);
              const isNearBottom = sortedRoutes.length >= 3 && index >= sortedRoutes.length - 2;

              const helpers = [
                route.asignacion?.auxiliar1,
                route.asignacion?.auxiliar2,
                route.asignacion?.auxiliar3,
                route.asignacion?.auxiliar4,
              ].filter(Boolean);

              // Consolidated receipt condition: if route is split, check if all sibling lines of parent are settled
              const isPartOfSplit = !!(route.isSplitRoute && route.parentRouteId);
              const siblings = isPartOfSplit
                ? allRoutes.filter((r) => isSameSplitGroup(r, route.parentRouteId!, route))
                : [];
              const allSettled =
                isPartOfSplit &&
                siblings.length > 0 &&
                siblings.every((r) => r.estado === 'Liquidada');

              return (
                <React.Fragment key={routeKey}>
                <tr
                  className={`transition-colors ${
                    isSelected
                      ? 'bg-blue-50 hover:bg-blue-100/70'
                      : isAbierta
                      ? 'bg-rose-50/40 hover:bg-rose-50/70'
                      : 'hover:bg-slate-50/80'
                  }`}
                >
                  {/* Checkbox de selección */}
                  <td className="px-1 py-1 text-center">
                    <label className="inline-flex items-center justify-center min-w-[40px] min-h-[40px] rounded-lg hover:bg-slate-100 cursor-pointer">
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ruta ${route.id}`}
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        if (e.target.checked) {
                          setSelectedRouteIds((prev) => [...prev, routeKey]);
                        } else {
                          setSelectedRouteIds((prev) => prev.filter((key) => key !== routeKey));
                        }
                      }}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer w-5 h-5"
                    />
                    </label>
                  </td>

                  {/* ID Ruta without # */}
                  <td className="px-2 md:px-2.5 lg:px-3 py-2 md:py-2.5 font-mono">
                    <div className="font-bold text-slate-900 text-xs md:text-sm whitespace-nowrap">{route.id}</div>
                    {route.tipoAsignacion === 'Recarga' || route.esRecarga ? (
                      <span className="inline-flex items-center gap-0.5 mt-0.5 px-1.5 py-0.2 rounded text-[10px] md:text-[11px] font-bold bg-purple-100 text-purple-900 border border-purple-300 whitespace-nowrap">
                        <Repeat className="w-2.5 h-2.5 text-purple-700" />
                        Recarga {(route.historialDespachos?.length || 0) > 1 ? `#${(route.historialDespachos?.length || 0) + 1}` : '(2° Viaje)'}
                      </span>
                    ) : (route.tipoAsignacion === 'Revisita' || route.esReasignacion || (route.historialDespachos && route.historialDespachos.length > 0)) ? (
                      <span className="inline-flex items-center gap-0.5 mt-0.5 px-1.5 py-0.2 rounded text-[10px] md:text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap">
                        <RotateCcw className="w-2.5 h-2.5 text-amber-700" />
                        Revisita #{route.historialDespachos?.length || 1}
                      </span>
                    ) : route.aPiso || route.tipoAsignacion === 'Ruta a Piso' ? (
                      <span className="inline-flex items-center gap-0.5 mt-0.5 px-1.5 py-0.2 rounded text-[10px] md:text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap">
                        <Warehouse className="w-2.5 h-2.5 text-amber-700" />
                        A Piso
                      </span>
                    ) : null}
                  </td>

                  {/* Agencia */}
                  <td className="px-2 md:px-2.5 lg:px-3 py-2 md:py-2.5 font-semibold text-blue-700 text-xs whitespace-nowrap">
                    {route.agencia || '-'}
                  </td>

                  {/* Segmento */}
                  <td className="px-2 md:px-2.5 lg:px-3 py-2 md:py-2.5 text-slate-700 text-xs font-medium whitespace-nowrap">
                    {route.segmento || '-'}
                  </td>

                  {/* Fecha */}
                  <td className="px-2 md:px-2.5 lg:px-3 py-2 md:py-2.5 text-slate-700 text-xs whitespace-nowrap">
                    <div className="font-medium text-slate-800">
                      <span className="text-[10px] text-slate-400 block uppercase font-medium">Ruta:</span>
                      {formatDateToGuatemala(route.fechaOriginalRuta || route.fecha || route.fechaCarga) || '-'}
                    </div>
                    {route.aPiso && route.fechaReprogramada && (
                      <div className="text-[10px] md:text-[11px] text-amber-700 font-mono mt-0.5" title="Ruta a piso reprogramada">
                        <span className="text-slate-400">Piso: </span>
                        {route.fechaReprogramada}
                      </div>
                    )}
                    {(route.fechaAsignacion || route.asignacion?.fechaAsignacion) && (
                      <div className="text-[10px] md:text-[11px] text-blue-700 font-mono mt-0.5" title="Fecha en que fue asignada">
                        <span className="text-slate-400">Asig: </span>
                        {route.fechaAsignacion || route.asignacion?.fechaAsignacion}
                      </div>
                    )}
                    {(route.fechaLiquidacion || route.liquidacion?.fechaLiquidacion) && (
                      <div className="text-[10px] md:text-[11px] text-emerald-700 font-mono mt-0.5" title="Fecha en que fue liquidada">
                        <span className="text-slate-400">Liq: </span>
                        {formatDateTimeToGuatemala(route.fechaLiquidacion || route.liquidacion?.fechaLiquidacion)}
                      </div>
                    )}
                  </td>

                  {/* Carga & Operación (Posición 5) */}
                  <td className="px-2 md:px-2.5 lg:px-3 py-2 md:py-2.5">
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-800 text-xs flex items-center whitespace-nowrap">
                        {route.paradas} paradas
                        {route.isSplitRoute && (
                          <span className="bg-purple-100 text-purple-800 border border-purple-200 px-1.5 py-0.2 rounded text-[10px] font-bold ml-1">
                            V{route.tripNumber}/{route.totalTrips}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] md:text-xs font-mono text-slate-700 whitespace-nowrap">
                        Cajas: <b className="text-blue-700 font-bold">{route.cajasFisicas || 0}</b>
                      </div>
                      <div className="text-[10px] md:text-[11px] font-mono text-slate-500 whitespace-nowrap">
                        12 Oz: <b className="text-slate-700 font-bold">{route.cajas12Oz || 0}</b>
                      </div>
                      {route.clientesRuta && route.clientesRuta.length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedClientesKey((prev) => (prev === routeKey ? null : routeKey));
                          }}
                          title="Ver la lista de clientes de esta ruta (solo consulta)"
                          aria-expanded={expandedClientesKey === routeKey}
                          className={`mt-1 inline-flex items-center gap-1 min-h-[36px] px-2.5 text-[11px] font-semibold rounded-lg border transition cursor-pointer ${
                            expandedClientesKey === routeKey
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-400'
                          }`}
                        >
                          <Users className="w-3 h-3" />
                          {expandedClientesKey === routeKey ? 'Ocultar' : 'Ver'} clientes ({route.clientesRuta.length})
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Acciones: acción principal directa según el estado + detalle
                      + "⋯" (ver RouteRowActions.tsx, configuración única). */}
                  <td className="px-2 md:px-2.5 lg:px-3 py-2 md:py-2.5 text-center whitespace-nowrap">
                    <RouteRowActions
                      route={route}
                      isMenuOpen={activeDropdownId === routeKey}
                      onToggleMenu={() => setActiveDropdownId(activeDropdownId === routeKey ? null : routeKey)}
                      onCloseMenu={() => setActiveDropdownId(null)}
                      openUp={isNearBottom}
                      onViewDetail={() => setViewingAssignmentRoute(route)}
                      detailTone={route.asignacion ? 'assigned' : isAbierta ? 'released' : 'none'}
                      detailTitle={
                        route.asignacion
                          ? `Ver detalle: Camión ${route.asignacion.camionPlaca} · Piloto ${route.asignacion.conductor}`
                          : isAbierta
                          ? 'Ver detalle de ruta liberada'
                          : 'Ver detalle (sin asignar)'
                      }
                      handlers={{
                        onAssign: () => onOpenAssignModal(route.id, routeKey),
                        onLiquidate: () => onOpenLiquidateModal(route.id, routeKey),
                        onSplit: () => onOpenSplitRouteModal(route.id, routeKey),
                        onRevertSplit: () => onOpenRevertSplitModal(route.id, routeKey),
                        onMoveToFloor: onMoveToFloor
                          ? () =>
                              onMoveToFloor(
                                route.id,
                                routeKey,
                                getTomorrowGuatemalaDate(route.fecha),
                                'Ruta a Piso para despacho de mañana'
                              )
                          : undefined,
                        onViewReceipt: () => onViewSettlementReceipt(route.id, routeKey),
                        onViewConsolidated:
                          allSettled && route.parentRouteId
                            ? () => onViewConsolidatedReceipt(route.parentRouteId!, route)
                            : undefined,
                        onDelete: onOpenDeleteModal ? () => onOpenDeleteModal([routeKey]) : undefined,
                      }}
                    />
                  </td>

                  {/* Horas sin Liquidar (El resto al lado derecho) */}
                  <td className="px-2 md:px-2.5 lg:px-3 py-2 md:py-2.5 whitespace-nowrap">
                    {renderElapsedBadge(route)}
                  </td>

                  {/* Estado */}
                  <td className="px-2 md:px-2.5 lg:px-3 py-2 md:py-2.5 whitespace-nowrap">
                    {route.estado === 'Pendiente' && (
                      <div className="space-y-0.5">
                        {route.aPiso || route.tipoAsignacion === 'Ruta a Piso' ? (
                          <div>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                              <Warehouse className="w-3 h-3 mr-1 text-amber-700" /> A Piso
                            </span>
                            {route.fechaReprogramada && (
                              <div className="text-[10px] font-semibold text-amber-800 flex items-center mt-0.5">
                                {route.fechaReprogramada}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1"></span> Sin Asignar
                          </span>
                        )}
                      </div>
                    )}
                    {route.estado === 'En Tránsito' && (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-1 animate-pulse"></span> En Tránsito
                        </span>
                        {route.tipoAsignacion === 'Recarga' || route.esRecarga ? (
                          <div className="text-[10px] font-bold text-purple-700 flex items-center mt-0.5">
                            <Repeat className="w-3 h-3 mr-1 text-purple-600" />
                            Recarga {(route.historialDespachos?.length || 0) > 1 ? `#${(route.historialDespachos?.length || 0) + 1}` : '(2° Viaje)'}
                          </div>
                        ) : (route.tipoAsignacion === 'Revisita' || route.esReasignacion || ((route.historialDespachos?.length || 0) > 0)) ? (
                          <div className="text-[10px] font-bold text-amber-800 flex items-center mt-0.5">
                            <RotateCcw className="w-3 h-3 mr-1 text-amber-600" />
                            Revisita
                          </div>
                        ) : null}
                      </div>
                    )}
                    {route.estado === 'Abierta' && (
                      <div className="space-y-0.5">
                        <span className="inline-flex flex-col items-start px-2 py-1 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-900 border border-indigo-300">
                          <span className="flex items-center">
                            <RotateCcw className="w-3 h-3 text-indigo-600 mr-1" />
                            ABIERTA
                          </span>
                          <span className="text-[9px] text-indigo-700 font-medium">
                            Por Reasignar
                          </span>
                        </span>
                        {route.tipoAsignacion === 'Recarga' || route.esRecarga ? (
                          <div className="text-[10px] font-bold text-purple-700 flex items-center mt-0.5">
                            <Repeat className="w-3 h-3 mr-1 text-purple-600" />
                            Recarga #{route.historialDespachos?.length || 1}
                          </div>
                        ) : (
                          <div className="text-[10px] font-bold text-amber-800 flex items-center mt-0.5">
                            <RotateCcw className="w-3 h-3 mr-1 text-amber-600" />
                            Revisita #{route.historialDespachos?.length || 1}
                          </div>
                        )}
                      </div>
                    )}
                    {route.estado === 'Liquidada' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1"></span> Liquidada
                      </span>
                    )}
                  </td>

                  {/* Camión y Tripulación: resumen visible sin necesidad de clic.
                      El botón para ver el detalle completo (auxiliares, etc.) se
                      movió junto a "Acciones"; esta columna ahora solo informa
                      de un vistazo y se puede seguir ordenando igual que antes. */}
                  <td className="px-2 md:px-2.5 lg:px-3 py-2 md:py-2.5 text-center whitespace-nowrap">
                    {route.asignacion ? (
                      <div className="text-[11px] leading-tight text-left inline-block">
                        <div className="font-bold text-slate-800">{route.asignacion.camionPlaca}</div>
                        <div className="text-slate-500">{route.asignacion.conductor}</div>
                      </div>
                    ) : isAbierta ? (
                      <span className="text-[11px] font-semibold text-emerald-700">Liberada</span>
                    ) : (
                      <span className="text-[11px] text-slate-400">Sin asignar</span>
                    )}
                  </td>
                </tr>
                {expandedClientesKey === routeKey && route.clientesRuta && route.clientesRuta.length > 0 && (
                  <tr key={`${routeKey}-clientes`} className="bg-slate-50/70">
                    <td colSpan={10} className="px-4 py-3">
                      <ClientesRutaList clientes={route.clientesRuta} />
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <AssignmentDetailModal
        isOpen={!!viewingAssignmentRoute}
        onClose={() => setViewingAssignmentRoute(null)}
        route={viewingAssignmentRoute}
        allRoutes={allRoutes}
        trucks={trucks}
        staff={staff}
        onOpenAssignModal={onOpenAssignModal}
      />
    </div>
  );
};
