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
  Plus,
  CheckCircle,
  Split,
  Undo2,
  FileText,
  Package,
  RotateCcw,
  Repeat,
  Warehouse,
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Trash2,
  Eye,
  Users,
} from 'lucide-react';
import { AssignmentDetailModal } from './modals/AssignmentDetailModal';
import { ClientesRutaList } from './ClientesRutaList';
import { getRouteKey } from '../utils/routeKey';

interface RoutesTableProps {
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
  onViewConsolidatedReceipt: (parentRouteId: string) => void;
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
        <button
          onClick={onOpenNewRouteModal}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition cursor-pointer"
        >
          Crear nueva ruta
        </button>
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
        onClick={() => handleSort(key)}
        // Corrección: el "sticky" se aplica en cada <th> (no en el <thead>), que es
        // el patrón que de verdad funciona de forma consistente en navegadores
        // basados en Chromium para encabezados de tabla — poner "sticky" solo en el
        // <thead> se veía bien en el código pero no se pegaba visualmente al
        // desplazarse. Cada celda necesita también su propio fondo sólido
        // (bg-slate-50) porque, al pegarse de forma independiente, sin esto se
        // vería el contenido de las filas pasando "por debajo" y transparentándose.
        className={`px-2 md:px-2.5 lg:px-3 py-2 md:py-2.5 cursor-pointer select-none transition-colors hover:bg-slate-100 group sticky top-[68px] z-20 bg-slate-50 ${extraClass}`}
        title={`Ordenar por ${label} (${
          isActive
            ? sortOrder === 'asc'
              ? 'Ascendente: Menor a Mayor / A-Z'
              : 'Descendente: Mayor a Menor / Z-A'
            : 'Clic para ordenar'
        })`}
      >
        <div className={`flex items-center gap-1 ${extraClass.includes('text-center') ? 'justify-center' : ''}`}>
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
        </div>
      </th>
    );
  };

  return (
    // Corrección: este contenedor tenía "overflow-hidden" junto con "rounded-2xl"
    // (para recortar las esquinas cuadradas de la tabla y que se vieran redondeadas
    // como el contenedor). Esa combinación —overflow:hidden + border-radius en un
    // ancestro— es un problema conocido en navegadores basados en Chromium: hace
    // que los elementos "sticky" (como el encabezado fijo de la tabla) se queden
    // "trabados" en una posición incorrecta en vez de pegarse correctamente al
    // desplazarse, que es exactamente el comportamiento que se reportó. Se quita
    // "overflow-hidden" aquí para que el encabezado fijo funcione; como efecto
    // secundario mínimo, las esquinas superiores de la tabla ya no se recortan de
    // forma perfecta al redondeado del contenedor (imperceptible en el uso normal).
    <div className="bg-white border border-slate-200/80 rounded-2xl shadow-sm w-full">
      {/* Barra de acción masiva cuando hay rutas seleccionadas */}
      {selectedRouteIds.length > 0 && (
        <div className="bg-rose-50 border-b border-rose-200 px-3 md:px-4 py-2 flex flex-wrap items-center justify-between gap-2 animate-in fade-in slide-in-from-top-1 text-xs">
          <div className="flex items-center gap-2 text-rose-900 font-medium">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-rose-600 text-white font-bold text-[10px]">
              {selectedRouteIds.length}
            </span>
            <span>
              {selectedRouteIds.length === 1
                ? '1 ruta seleccionada'
                : `${selectedRouteIds.length} rutas seleccionadas`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedRouteIds([])}
              className="px-2.5 py-1 text-slate-600 hover:text-slate-800 hover:bg-white/80 rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              Cancelar selección
            </button>
            {onBulkMoveToFloor && (
              <button
                type="button"
                onClick={() => {
                  onBulkMoveToFloor(selectedRouteIds);
                  setSelectedRouteIds([]);
                }}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <Warehouse className="w-3.5 h-3.5" />
                <span>Enviar a Piso ({selectedRouteIds.length})</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (onOpenDeleteModal) {
                  onOpenDeleteModal(selectedRouteIds);
                }
              }}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Eliminar seleccionadas ({selectedRouteIds.length})</span>
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto min-h-[280px] pb-8 md:pb-10">
        <table className="w-full divide-y divide-slate-200 text-left text-xs">
          {/* Corrección: encabezado fijo (sticky) al desplazarse verticalmente, igual
              que en la tabla de Rutas Liquidadas. El "top" se compensa con la altura
              de la barra superior (Navbar, 68px, fija con z-30) para que el
              encabezado quede pegado justo debajo de ella. El "sticky" real se aplica
              celda por celda (ver renderSortHeader y los <th> de abajo), no aquí en
              el <thead> — ver la nota en renderSortHeader. */}
          <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider font-bold text-[10px] md:text-[11px]">
            <tr>
              <th scope="col" className="px-2 md:px-2.5 py-2 md:py-2.5 w-7 text-center sticky top-[68px] z-20 bg-slate-50">
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
                  className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer w-3.5 h-3.5"
                />
              </th>
              {renderSortHeader('id', 'ID', 'whitespace-nowrap')}
              {renderSortHeader('agencia', 'Agencia')}
              {renderSortHeader('segmento', 'Segmento')}
              {renderSortHeader('fecha', 'Fecha')}
              {renderSortHeader('carga', 'Carga')}
              <th scope="col" className="px-2 md:px-2.5 lg:px-3 py-2 md:py-2.5 text-center w-24 whitespace-nowrap sticky top-[68px] z-20 bg-slate-50">Acciones</th>
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
              const canSplit = !route.isSplitRoute && route.estado === 'Pendiente';
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
                ? allRoutes.filter((r) => r.parentRouteId === route.parentRouteId)
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
                      ? 'bg-rose-50/70 hover:bg-rose-50'
                      : isAbierta
                      ? 'bg-rose-50/40 hover:bg-rose-50/70'
                      : 'hover:bg-slate-50/80'
                  }`}
                >
                  {/* Checkbox de selección */}
                  <td className="px-2 md:px-2.5 py-2 md:py-2.5 text-center">
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
                      className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer w-3.5 h-3.5"
                    />
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
                          className={`mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-md border transition cursor-pointer ${
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

                  {/* Acciones (Columna No. 6): el botón de la acción más frecuente
                      (Liquidar) va directo y visible; el resto queda en "Acciones".
                      El ícono de "Ver detalle" vive aquí también, pegado a "Acciones",
                      en vez de aislado al otro extremo de la fila. */}
                  <td className="px-2 md:px-2.5 lg:px-3 py-2 md:py-2.5 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1.5">
                      {(route.estado === 'En Tránsito' || route.estado === 'Abierta') && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveDropdownId(null);
                            onOpenLiquidateModal(route.id, route.fecha);
                          }}
                          title={
                            route.estado === 'Abierta'
                              ? 'Liquidar definitivamente esta ruta'
                              : 'Liquidar esta ruta: registrar entrega, cajas y cierre'
                          }
                          className="inline-flex items-center justify-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer shadow-2xs bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600 shrink-0"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Liquidar</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setViewingAssignmentRoute(route)}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-all cursor-pointer shadow-2xs group shrink-0 ${
                          route.asignacion
                            ? 'text-blue-600 hover:text-white bg-blue-50 hover:bg-blue-600 border border-blue-200 hover:border-blue-600 ring-1 ring-blue-100'
                            : isAbierta
                            ? 'text-emerald-700 hover:text-white bg-emerald-50 hover:bg-emerald-600 border border-emerald-200 hover:border-emerald-600 ring-1 ring-emerald-100'
                            : 'text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-200 border border-slate-200 hover:border-slate-300'
                        }`}
                        title={
                          route.asignacion
                            ? `Ver detalle: Camión ${route.asignacion.camionPlaca} · Piloto ${route.asignacion.conductor}`
                            : isAbierta
                            ? 'Ver detalle de ruta liberada'
                            : 'Ver detalle (Sin asignar)'
                        }
                      >
                        <Eye className="w-4 h-4 transition-transform group-hover:scale-110" />
                      </button>
                      <div className="relative inline-block text-left actions-dropdown-container">
                      <button
                        id={`btnAcciones-${routeKey}`}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveDropdownId(activeDropdownId === routeKey ? null : routeKey);
                        }}
                        className={`inline-flex items-center justify-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer shadow-2xs border ${
                          activeDropdownId === routeKey
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-200'
                            : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 hover:border-slate-400'
                        }`}
                        title="Opciones y acciones disponibles para la ruta"
                      >
                        <span>Acciones</span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 transition-transform duration-150 ${
                            activeDropdownId === routeKey ? 'rotate-180 text-white' : 'text-slate-500'
                          }`}
                        />
                      </button>

                      {activeDropdownId === routeKey && (
                        <div
                          className={`absolute left-0 ${
                            isNearBottom ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                          } z-50 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 text-left divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-100`}
                        >
                          {/* CASO: Pendiente */}
                          {route.estado === 'Pendiente' && (
                            <>
                              {route.aPiso || route.tipoAsignacion === 'Ruta a Piso' ? (
                                <div className="py-1">
                                  <div className="px-3 py-1 text-[10px] font-bold text-amber-700 uppercase tracking-wider bg-amber-50/70">
                                    Ruta en Bodega / A Piso
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveDropdownId(null);
                                      onOpenAssignModal(route.id, route.fecha);
                                    }}
                                    className="w-full text-left px-3 py-2 hover:bg-amber-50/70 flex items-center gap-2.5 transition cursor-pointer group"
                                  >
                                    <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800 group-hover:bg-amber-200 transition shrink-0">
                                      <Warehouse className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="text-xs font-semibold text-slate-800 group-hover:text-amber-900 transition">
                                        Modificar / Sacar de Piso
                                      </div>
                                      <div className="text-[11px] text-slate-500">
                                        Asignar camión y despachar hoy
                                      </div>
                                    </div>
                                  </button>
                                  {canSplit && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveDropdownId(null);
                                        onOpenSplitRouteModal(route.id, route.fecha);
                                      }}
                                      className="w-full text-left px-3 py-2 hover:bg-purple-50/70 flex items-center gap-2.5 transition cursor-pointer group"
                                    >
                                      <div className="p-1.5 rounded-lg bg-purple-100 text-purple-700 group-hover:bg-purple-200 transition shrink-0">
                                        <Split className="w-4 h-4" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="text-xs font-semibold text-slate-800 group-hover:text-purple-900 transition">
                                          Partir en Viajes
                                        </div>
                                        <div className="text-[11px] text-slate-500">
                                          Dividir carga en varios viajes
                                        </div>
                                      </div>
                                    </button>
                                  )}
                                  {route.isSplitRoute && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveDropdownId(null);
                                        onOpenRevertSplitModal(route.id, route.fecha);
                                      }}
                                      className="w-full text-left px-3 py-2 hover:bg-indigo-50/70 flex items-center gap-2.5 transition cursor-pointer group"
                                    >
                                      <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700 group-hover:bg-indigo-200 transition shrink-0">
                                        <Undo2 className="w-4 h-4" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="text-xs font-semibold text-slate-800 group-hover:text-indigo-900 transition">
                                          Revertir Partición
                                        </div>
                                        <div className="text-[11px] text-slate-500">
                                          Restaurar ruta matriz
                                        </div>
                                      </div>
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="py-1">
                                  <div className="px-3 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50">
                                    Despacho & Asignación
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveDropdownId(null);
                                      onOpenAssignModal(route.id, route.fecha);
                                    }}
                                    className="w-full text-left px-3 py-2 hover:bg-blue-50/70 flex items-center gap-2.5 transition cursor-pointer group"
                                  >
                                    <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700 group-hover:bg-blue-200 transition shrink-0">
                                      <Plus className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="text-xs font-semibold text-slate-800 group-hover:text-blue-900 transition">
                                        Asignar y Despachar
                                      </div>
                                      <div className="text-[11px] text-slate-500">
                                        Tripulación, viajes o enviar a piso
                                      </div>
                                    </div>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveDropdownId(null);
                                      if (onMoveToFloor) {
                                        const tomorrowDate = getTomorrowGuatemalaDate(route.fecha);
                                        onMoveToFloor(route.id, route.fecha, tomorrowDate, 'Ruta a Piso para despacho de mañana');
                                      }
                                    }}
                                    className="w-full text-left px-3 py-2 hover:bg-amber-50/70 flex items-center gap-2.5 transition cursor-pointer group"
                                  >
                                    <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800 group-hover:bg-amber-200 transition shrink-0">
                                      <Warehouse className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="text-xs font-semibold text-slate-800 group-hover:text-amber-900 transition">
                                        A Piso
                                      </div>
                                      <div className="text-[11px] text-slate-500">
                                        Guardar en bodega para mañana
                                      </div>
                                    </div>
                                  </button>
                                  {canSplit && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveDropdownId(null);
                                        onOpenSplitRouteModal(route.id, route.fecha);
                                      }}
                                      className="w-full text-left px-3 py-2 hover:bg-purple-50/70 flex items-center gap-2.5 transition cursor-pointer group"
                                    >
                                      <div className="p-1.5 rounded-lg bg-purple-100 text-purple-700 group-hover:bg-purple-200 transition shrink-0">
                                        <Split className="w-4 h-4" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="text-xs font-semibold text-slate-800 group-hover:text-purple-900 transition">
                                          Partir en Viajes
                                        </div>
                                        <div className="text-[11px] text-slate-500">
                                          Dividir carga en varios viajes
                                        </div>
                                      </div>
                                    </button>
                                  )}
                                  {route.isSplitRoute && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveDropdownId(null);
                                        onOpenRevertSplitModal(route.id, route.fecha);
                                      }}
                                      className="w-full text-left px-3 py-2 hover:bg-indigo-50/70 flex items-center gap-2.5 transition cursor-pointer group"
                                    >
                                      <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700 group-hover:bg-indigo-200 transition shrink-0">
                                        <Undo2 className="w-4 h-4" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <div className="text-xs font-semibold text-slate-800 group-hover:text-indigo-900 transition">
                                          Revertir Partición
                                        </div>
                                        <div className="text-[11px] text-slate-500">
                                          Restaurar ruta matriz
                                        </div>
                                      </div>
                                    </button>
                                  )}
                                </div>
                              )}
                            </>
                          )}

                          {/* CASO: En Tránsito */}
                          {route.estado === 'En Tránsito' && (
                            <div className="py-1">
                              <div className="px-3 py-1 text-[10px] font-bold text-amber-700 uppercase tracking-wider bg-amber-50">
                                Ruta en Tránsito
                              </div>
                              {/* "Liquidar Ruta" ya no está aquí: ahora es el botón verde
                                  directo junto a "Acciones" en la fila, por ser la acción
                                  más frecuente del día a día. */}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDropdownId(null);
                                  onOpenAssignModal(route.id, route.fecha);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-blue-50/70 flex items-center gap-2.5 transition cursor-pointer group"
                              >
                                <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700 group-hover:bg-blue-200 transition shrink-0">
                                  <RotateCcw className="w-4 h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-semibold text-slate-800 group-hover:text-blue-900 transition">
                                    Modificar / Reasignar
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    Actualizar camión o tripulación
                                  </div>
                                </div>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDropdownId(null);
                                  if (onMoveToFloor) {
                                    const tomorrowDate = getTomorrowGuatemalaDate(route.fecha);
                                    onMoveToFloor(route.id, route.fecha, tomorrowDate, 'Ruta a Piso para despacho de mañana');
                                  }
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-amber-50/70 flex items-center gap-2.5 transition cursor-pointer group"
                              >
                                <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800 group-hover:bg-amber-200 transition shrink-0">
                                  <Warehouse className="w-4 h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-semibold text-slate-800 group-hover:text-amber-900 transition">
                                    A Piso
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    Guardar en bodega para mañana
                                  </div>
                                </div>
                              </button>
                            </div>
                          )}

                          {/* CASO: Abierta */}
                          {route.estado === 'Abierta' && (
                            <div className="py-1">
                              <div className="px-3 py-1 text-[10px] font-bold text-rose-700 uppercase tracking-wider bg-rose-50">
                                Ruta Abierta (Cierre Parcial)
                              </div>
                              {/* "Liquidar Definitivamente" ya no está aquí: ahora es el
                                  botón verde directo junto a "Acciones" en la fila. */}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDropdownId(null);
                                  onOpenAssignModal(route.id, route.fecha);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-indigo-50/70 flex items-center gap-2.5 transition cursor-pointer group"
                              >
                                <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700 group-hover:bg-indigo-200 transition shrink-0">
                                  <RotateCcw className="w-4 h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-semibold text-slate-800 group-hover:text-indigo-900 transition">
                                    Reasignar Unidad / 2° Viaje
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    Asignar recarga o nueva tripulación
                                  </div>
                                </div>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDropdownId(null);
                                  if (onMoveToFloor) {
                                    const tomorrowDate = getTomorrowGuatemalaDate(route.fecha);
                                    onMoveToFloor(route.id, route.fecha, tomorrowDate, 'Ruta a Piso para despacho de mañana');
                                  }
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-amber-50/70 flex items-center gap-2.5 transition cursor-pointer group"
                              >
                                <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800 group-hover:bg-amber-200 transition shrink-0">
                                  <Warehouse className="w-4 h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-semibold text-slate-800 group-hover:text-amber-900 transition">
                                    A Piso
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    Guardar en bodega para mañana
                                  </div>
                                </div>
                              </button>
                            </div>
                          )}

                          {/* CASO: Liquidada */}
                          {route.estado === 'Liquidada' && (
                            <div className="py-1">
                              <div className="px-3 py-1 text-[10px] font-bold text-emerald-700 uppercase tracking-wider bg-emerald-50">
                                Ruta Liquidada
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDropdownId(null);
                                  onViewSettlementReceipt(route.id, route.fecha);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2.5 transition cursor-pointer group"
                              >
                                <div className="p-1.5 rounded-lg bg-slate-100 text-slate-600 group-hover:bg-slate-200 transition shrink-0">
                                  <FileText className="w-4 h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-semibold text-slate-800 group-hover:text-slate-900 transition">
                                    Ver Acta de Liquidación
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    Comprobante oficial de cierre
                                  </div>
                                </div>
                              </button>
                              {allSettled && route.parentRouteId && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveDropdownId(null);
                                    onViewConsolidatedReceipt(route.parentRouteId!);
                                  }}
                                  className="w-full text-left px-3 py-2 hover:bg-purple-50/70 flex items-center gap-2.5 transition cursor-pointer group"
                                >
                                  <div className="p-1.5 rounded-lg bg-purple-100 text-purple-700 group-hover:bg-purple-200 transition shrink-0">
                                    <FileText className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-semibold text-slate-800 group-hover:text-purple-900 transition">
                                      Acta Consolidada
                                    </div>
                                    <div className="text-[11px] text-slate-500">
                                      Resumen de viajes divididos
                                    </div>
                                  </div>
                                </button>
                              )}
                            </div>
                          )}

                          {/* Opción común: Eliminar registro individual */}
                          {onOpenDeleteModal && (
                            <div className="py-1 border-t border-slate-100 bg-rose-50/20">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDropdownId(null);
                                  onOpenDeleteModal([routeKey]);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-rose-50 flex items-center gap-2.5 transition cursor-pointer group"
                              >
                                <div className="p-1.5 rounded-lg bg-rose-100 text-rose-700 group-hover:bg-rose-200 transition shrink-0">
                                  <Trash2 className="w-4 h-4 text-rose-600" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-semibold text-rose-700 group-hover:text-rose-800 transition">
                                    Eliminar Ruta
                                  </div>
                                  <div className="text-[11px] text-slate-400">
                                    Requiere clave (1605)
                                  </div>
                                </div>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      </div>
                    </div>
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
