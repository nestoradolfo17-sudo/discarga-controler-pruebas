import React, { useState, useMemo, useEffect } from 'react';
import { Route, Staff } from '../types';
import { exportHistoricalToExcel, getRouteAssignmentType } from '../utils/excel';
import { parseFlexibleDate, formatDateToGuatemala, formatDateTimeToGuatemala } from '../utils/date';
import { CheckCircle2, FileText, Download, Search, Filter, Calendar, PackageCheck, AlertCircle, RotateCcw, Repeat, Lock, Users, Eye, X } from 'lucide-react';
import { Button } from './ui/Button';
import { ACTION_ICONS } from './ui/actionIcons';
import { ClientesRutaList } from './ClientesRutaList';
import { getRouteKey, isSameSplitGroup } from '../utils/routeKey';
import { toNum, fmtNum } from '../utils/number';

// Indicadores del módulo de Rutas Liquidadas. Se calculan con los filtros
// aplicados (búsqueda, agencia, fechas) y se muestran arriba, en la barra de
// indicadores de la app (en lugar de los indicadores del Tablero de Rutas).
export interface LiquidatedKpis {
  rutas: number;
  cajasSalida: number;
  cajasEntregadas: number;
  cajasDevueltas: number;
  efectividad: string;
  cajaAbierta: number;
}


// --- Estados de una ruta liquidada (filtro) ---
type EstadoLiqFiltro = 'TODOS' | 'liquidada' | 'caja_pendiente' | 'caja_validada' | 'con_devolucion';

const devueltas = (r: Route) => parseFloat(String(r.liquidacion?.cajasDevueltas)) || 0;

const ESTADOS_LIQ: { k: EstadoLiqFiltro; label: string; ayuda: string; activo: string; cumple: (r: Route) => boolean }[] = [
  { k: 'TODOS', label: 'Todas', ayuda: 'Todas las rutas liquidadas', activo: 'bg-slate-800 text-white border-slate-800', cumple: () => true },
  {
    k: 'liquidada',
    label: 'Liquidada',
    ayuda: 'Liquidadas sin Caja Abierta',
    activo: 'bg-emerald-600 text-white border-emerald-600',
    cumple: (r) => !r.liquidacion?.cajaAbierta,
  },
  {
    k: 'caja_pendiente',
    label: 'Caja Abierta pendiente',
    ayuda: 'Caja Abierta sin Liquidación Final',
    activo: 'bg-amber-500 text-white border-amber-500',
    cumple: (r) => !!r.liquidacion?.cajaAbierta && !r.liquidacion?.cajaAbiertaResuelta,
  },
  {
    k: 'caja_validada',
    label: 'Caja Abierta validada',
    ayuda: 'Caja Abierta con Liquidación Final registrada',
    activo: 'bg-teal-600 text-white border-teal-600',
    cumple: (r) => !!r.liquidacion?.cajaAbierta && !!r.liquidacion?.cajaAbiertaResuelta,
  },
  {
    k: 'con_devolucion',
    label: 'Con devolución',
    ayuda: 'Liquidadas con cajas devueltas (cualquier estado)',
    activo: 'bg-rose-600 text-white border-rose-600',
    cumple: (r) => devueltas(r) > 0,
  },
];

interface LiquidatedBoardViewProps {
  onKpisChange?: (kpis: LiquidatedKpis) => void;
  // Si viene definido, solo se cargaron los últimos N días del historial.
  historyLimitedDays?: number;
  onLoadFullHistory?: () => void;
  isLoadingFullHistory?: boolean;
  liquidatedRoutes: Route[];
  allRoutes: Route[];
  staff: Staff[];
  allAgencies: string[];
  onViewSettlementReceipt: (routeId: string, route?: Route) => void;
  onViewConsolidatedReceipt: (parentRouteId: string, ref?: Route) => void;
  // Abre el modal de "Liquidación Final" para cerrar el pendiente de validar
  // caja/boleta de una ruta que quedó en estado Caja Abierta.
  onOpenFinalizeCajaAbierta?: (route: Route) => void;
  // Abonos diarios de una Caja Abierta.
  onOpenAbonosCaja?: (route: Route) => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
  // Solo para administradores: eliminar varias rutas liquidadas a la vez
  // (abre la misma ventana de confirmación con contraseña del Tablero de Rutas).
  onDeleteRoutes?: (routeKeys: string[]) => void;
}

export const LiquidatedBoardView: React.FC<LiquidatedBoardViewProps> = ({
  onKpisChange,
  historyLimitedDays,
  onLoadFullHistory,
  isLoadingFullHistory,
  liquidatedRoutes,
  allRoutes,
  staff,
  allAgencies,
  onViewSettlementReceipt,
  onViewConsolidatedReceipt,
  onOpenFinalizeCajaAbierta,
  onOpenAbonosCaja,
  onShowToast,
  onDeleteRoutes,
}) => {
  const canDelete = !!onDeleteRoutes;
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgency, setSelectedAgency] = useState('TODAS');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Filtro por estado de la liquidación (ver ESTADOS_LIQ más abajo).
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoLiqFiltro>('TODOS');
  const [expandedClientesKey, setExpandedClientesKey] = useState<string | null>(null);
  // Ventanita (ojo) con camión y tripulación de una ruta liquidada.
  const [unidadPop, setUnidadPop] = useState<{
    key: string;
    top: number;
    left: number;
    placa: string;
    idCamion: string;
    piloto: string;
    puesto: string;
    dpi: string;
    auxiliares: string[];
    salida: string;
  } | null>(null);
  useEffect(() => {
    if (!unidadPop) return;
    const cerrar = () => setUnidadPop(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cerrar();
    window.addEventListener('scroll', cerrar, true);
    window.addEventListener('resize', cerrar);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', cerrar, true);
      window.removeEventListener('resize', cerrar);
      window.removeEventListener('keydown', onKey);
    };
  }, [unidadPop]);

  // Lista con los filtros de búsqueda, agencia y fecha (sin el de estado):
  // de aquí salen los conteos de cada estado.
  const baseList = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    const fromTime = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : null;
    const toTime = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : null;

    return liquidatedRoutes.filter((r) => {
      if (selectedAgency !== 'TODAS' && r.agencia !== selectedAgency) {
        return false;
      }

      if (fromTime || toTime) {
        // Corrección: este tablero muestra rutas YA LIQUIDADAS, pero el filtro de
        // fecha comparaba contra la fecha de la ruta/creación, no contra la fecha
        // real de liquidación (cierre). Esto hacía que filtrar "Liquidadas de
        // ayer" pudiera mostrar rutas creadas ayer pero liquidadas hoy (o
        // viceversa: excluir rutas liquidadas ayer pero creadas antes). Ahora se
        // filtra por fecha de liquidación, con la fecha de ruta como respaldo
        // solo si un registro antiguo no tuviera fecha de liquidación registrada.
        const rDate =
          parseFlexibleDate(r.liquidacion?.fechaLiquidacion || r.fechaLiquidacion) ||
          parseFlexibleDate(r.fecha) ||
          parseFlexibleDate(r.fechaCarga) ||
          parseFlexibleDate(r.fechaCreacion);
        if (rDate && !isNaN(rDate.getTime())) {
          const t = rDate.getTime();
          if (fromTime && t < fromTime) return false;
          if (toTime && t > toTime) return false;
        }
      }

      if (q) {
        const asig = r.asignacion || r.ultimoDespacho || {};
        const liq = r.liquidacion || {};
        const match =
          String(r.id).toLowerCase().includes(q) ||
          String(r.agencia || '').toLowerCase().includes(q) ||
          String(r.mercado || '').toLowerCase().includes(q) ||
          String(r.segmento || '').toLowerCase().includes(q) ||
          String(asig.camionPlaca || '').toLowerCase().includes(q) ||
          String(asig.conductor || '').toLowerCase().includes(q) ||
          String(asig.auxiliar1 || '').toLowerCase().includes(q) ||
          String(asig.auxiliar2 || '').toLowerCase().includes(q) ||
          String(asig.auxiliar3 || '').toLowerCase().includes(q) ||
          String(liq.auditor || '').toLowerCase().includes(q) ||
          String(liq.motivoDevolucion || '').toLowerCase().includes(q) ||
          String(liq.motivoCajaAbierta || '').toLowerCase().includes(q) ||
          String(liq.comentario || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [liquidatedRoutes, searchTerm, selectedAgency, dateFrom, dateTo]);

  const conteoEstados = useMemo(() => {
    const c: Record<EstadoLiqFiltro, number> = { TODOS: baseList.length, liquidada: 0, caja_pendiente: 0, caja_validada: 0, con_devolucion: 0 };
    baseList.forEach((r) => {
      ESTADOS_LIQ.forEach((e) => {
        if (e.k !== 'TODOS' && e.cumple(r)) c[e.k] += 1;
      });
    });
    return c;
  }, [baseList]);

  const filteredList = useMemo(() => {
    if (estadoFiltro === 'TODOS') return baseList;
    const def = ESTADOS_LIQ.find((e) => e.k === estadoFiltro);
    return def ? baseList.filter((r) => def.cumple(r)) : baseList;
  }, [baseList, estadoFiltro]);

  // Selección para eliminar (solo administradores): se conserva solo lo que sigue visible.
  const visibleKeys = useMemo(() => Array.from(new Set(filteredList.map((r) => getRouteKey(r)))), [filteredList]);
  const selectedVisible = useMemo(() => visibleKeys.filter((k) => selectedKeys.has(k)), [visibleKeys, selectedKeys]);
  const allVisibleSelected = visibleKeys.length > 0 && selectedVisible.length === visibleKeys.length;
  const toggleKey = (k: string) =>
    setSelectedKeys((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const toggleAllVisible = () =>
    setSelectedKeys((prev) => {
      const n = new Set(prev);
      if (allVisibleSelected) visibleKeys.forEach((k) => n.delete(k));
      else visibleKeys.forEach((k) => n.add(k));
      return n;
    });
  // Al eliminarse, las rutas desaparecen de la lista: se limpian de la selección.
  useEffect(() => {
    setSelectedKeys((prev) => {
      const all = new Set(liquidatedRoutes.map((r) => getRouteKey(r)));
      const n = new Set([...prev].filter((k) => all.has(k)));
      return n.size === prev.size ? prev : n;
    });
  }, [liquidatedRoutes]);

  const totalCajasSalida = useMemo(() => {
    return filteredList.reduce(
      (acc, r) => acc + (toNum(r.cajasFisicas) || 0),
      0
    );
  }, [filteredList]);

  const totalCajasEntregadas = useMemo(() => {
    return filteredList.reduce(
      (acc, r) => acc + (parseFloat(String(r.liquidacion?.cajasEntregadas)) || 0),
      0
    );
  }, [filteredList]);

  const totalCajasDevueltas = useMemo(() => {
    return filteredList.reduce(
      (acc, r) => acc + (parseFloat(String(r.liquidacion?.cajasDevueltas)) || 0),
      0
    );
  }, [filteredList]);

  const efectividad = useMemo(() => {
    const total = totalCajasEntregadas + totalCajasDevueltas;
    if (total === 0) return '100.0';
    return ((totalCajasEntregadas / total) * 100).toFixed(1);
  }, [totalCajasEntregadas, totalCajasDevueltas]);

  // Corrección: conteo de rutas liquidadas con el nuevo estado "Caja Abierta"
  // (pendientes de validar caja/boleta), para que se note de un vistazo cuántas
  // quedan por resolver sin tener que revisar fila por fila. Solo cuenta las que
  // AÚN no tienen registrada su Liquidación Final (ver cajaAbiertaResuelta).
  const cajaAbiertaCount = useMemo(
    () => filteredList.filter((r) => r.liquidacion?.cajaAbierta && !r.liquidacion?.cajaAbiertaResuelta).length,
    [filteredList]
  );

  useEffect(() => {
    onKpisChange?.({
      rutas: filteredList.length,
      cajasSalida: totalCajasSalida,
      cajasEntregadas: totalCajasEntregadas,
      cajasDevueltas: totalCajasDevueltas,
      efectividad,
      cajaAbierta: cajaAbiertaCount,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredList.length, totalCajasSalida, totalCajasEntregadas, totalCajasDevueltas, efectividad, cajaAbiertaCount]);

  const handleExport = async () => {
    const success = await exportHistoricalToExcel(filteredList, staff);
    if (success) {
      onShowToast(`Se descargaron ${filteredList.length} registros de Rutas Liquidadas en Excel`, 'success');
    } else {
      onShowToast('No hay rutas liquidadas para exportar', 'error');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-sm space-y-3">
      {/* Encabezado + filtros en una sola franja compacta (para que el
          historial de rutas tenga más espacio). Los filtros son los mismos. */}
      <div className="flex flex-wrap items-center gap-2">
        <h3
          className="font-bold text-slate-800 text-sm flex items-center whitespace-nowrap mr-1"
          title="Control centralizado de rutas cerradas operativamente, balances de entrega y actas de liquidación."
        >
          <CheckCircle2 className="w-4 h-4 mr-1.5 text-emerald-600" />
          Rutas Liquidadas
        </h3>

        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="liqSearchInput"
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar ID, piloto, camión…"
            aria-label="Buscar por ID, Piloto, Camión"
            className="w-full min-h-[40px] pl-8 pr-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <select
          id="liqAgencyFilter"
          value={selectedAgency}
          onChange={(e) => setSelectedAgency(e.target.value)}
          aria-label="Filtrar por Agencia"
          className={`min-h-[40px] px-2 text-xs border rounded-lg font-semibold cursor-pointer outline-none ${
            selectedAgency !== 'TODAS' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-300'
          }`}
        >
          <option value="TODAS">Todas las agencias</option>
          {allAgencies.map((ag) => (
            <option key={ag} value={ag}>
              {ag}
            </option>
          ))}
        </select>

        <div
          className="flex items-center gap-1 text-xs text-slate-600 bg-slate-50 border border-slate-300 rounded-lg px-2 min-h-[40px]"
          title="Filtra por fecha de liquidación (cierre), no por fecha de la ruta"
        >
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-semibold whitespace-nowrap">Liquidación</span>
          <input
            id="liqDateFrom"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="Fecha Liquidación Desde"
            className="bg-transparent outline-none text-xs py-1 w-[120px]"
          />
          <span className="text-slate-400">a</span>
          <input
            id="liqDateTo"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="Fecha Liquidación Hasta"
            className="bg-transparent outline-none text-xs py-1 w-[120px]"
          />
        </div>

        {(searchTerm || selectedAgency !== 'TODAS' || dateFrom || dateTo || estadoFiltro !== 'TODOS') && (
          <button
            type="button"
            onClick={() => {
              setSearchTerm('');
              setSelectedAgency('TODAS');
              setDateFrom('');
              setDateTo('');
              setEstadoFiltro('TODOS');
            }}
            className="min-h-[40px] px-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg bg-white cursor-pointer"
            title="Quitar todos los filtros"
          >
            Limpiar
          </button>
        )}

        {/* Exportación única de esta sección: descarga lo que se ve (respeta los filtros). */}
        <Button variant="secondary" size="sm" icon={ACTION_ICONS.exportar} onClick={handleExport} className="text-emerald-700 ml-auto">
          Exportar vista ({filteredList.length})
        </Button>
      </div>

      {/* Filtro por estado de la liquidación: cada botón muestra cuántas rutas
          hay en ese estado con los demás filtros aplicados. */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por estado de la liquidación">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">Estado</span>
        {ESTADOS_LIQ.map((e) => {
          const activo = estadoFiltro === e.k;
          const n = conteoEstados[e.k];
          return (
            <button
              key={e.k}
              type="button"
              onClick={() => setEstadoFiltro(e.k)}
              aria-pressed={activo}
              title={e.ayuda}
              disabled={!activo && n === 0 && e.k !== 'TODOS'}
              className={`min-h-[36px] px-3 rounded-full border text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                activo ? e.activo : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {e.label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activo ? 'bg-white/25' : 'bg-slate-100 text-slate-600'}`}>
                {fmtNum(n)}
              </span>
            </button>
          );
        })}
      </div>

      {historyLimitedDays && onLoadFullHistory && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-sky-900">
          <span>
            Mostrando liquidaciones de los <strong>últimos {historyLimitedDays} días</strong>.
          </span>
          <Button variant="secondary" size="sm" onClick={onLoadFullHistory} loading={isLoadingFullHistory} loadingText="Cargando…" className="text-sky-800 border-sky-300">
            Cargar historial completo
          </Button>
        </div>
      )}

      {/* Los indicadores (Rutas, Entregadas, Devueltas, Efectividad, Caja
          Abierta) ahora se muestran arriba, en la barra de indicadores de la app,
          y cambian con los filtros de esta pantalla. Solo se dibujan aquí si la
          vista se usa sin esa barra (sin onKpisChange). */}
      {!onKpisChange && (
      <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
          <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">Rutas Liquidadas</span>
          <div className="flex items-baseline space-x-2 mt-0.5">
            <h4 className="text-xl font-bold text-slate-800">{filteredList.length}</h4>
            <span className="text-[10px] text-slate-400 font-medium">cerradas</span>
          </div>
        </div>

        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
          <span className="text-[11px] text-emerald-700 font-medium uppercase tracking-wider">Cajas Entregadas</span>
          <div className="flex items-baseline space-x-2 mt-0.5">
            <h4 className="text-xl font-extrabold text-emerald-700">{fmtNum(totalCajasEntregadas, 3)}</h4>
            <span className="text-[10px] text-emerald-600 font-medium">de {fmtNum(totalCajasSalida, 3)}</span>
          </div>
        </div>

        <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
          <span className="text-[11px] text-rose-700 font-medium uppercase tracking-wider">Cajas Devueltas / Rechazos</span>
          <div className="flex items-baseline space-x-2 mt-0.5">
            <h4 className="text-xl font-extrabold text-rose-700">{fmtNum(totalCajasDevueltas, 3)}</h4>
            <span className="text-[10px] text-rose-500 font-medium">físicas</span>
          </div>
        </div>

        <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-200">
          <span className="text-[11px] text-indigo-700 font-medium uppercase tracking-wider">Efectividad de Entrega</span>
          <div className="flex items-baseline space-x-2 mt-0.5">
            <h4 className="text-xl font-extrabold text-indigo-700">{efectividad}%</h4>
            <span className="text-[10px] text-indigo-500 font-medium">ratio cajas</span>
          </div>
        </div>

        {cajaAbiertaCount > 0 && (
          <div className="p-3 bg-amber-50 rounded-xl border border-amber-300">
            <span className="text-[11px] text-amber-800 font-medium uppercase tracking-wider">Caja Abierta</span>
            <div className="flex items-baseline space-x-2 mt-0.5">
              <h4 className="text-xl font-extrabold text-amber-700">{fmtNum(cajaAbiertaCount)}</h4>
              <span className="text-[10px] text-amber-600 font-medium">pendiente(s) de validar</span>
            </div>
          </div>
        )}
      </div>

      </>
      )}

      {/* Table */}
      {/* Corrección (causa real del encabezado "trabado"): este contenedor tiene
          "overflow-x-auto" para permitir deslizar la tabla horizontalmente en
          pantallas angostas. Por especificación CSS, en cuanto un eje de overflow
          es distinto de "visible" (aquí overflow-x), el otro eje (overflow-y) se
          calcula también como "auto" aunque no se declare — esto convierte a ESTE
          div en un "contenedor de scroll" propio. El problema: "position: sticky"
          se calcula siempre en relación a su contenedor de scroll más cercano, así
          que el encabezado dejaba de fijarse contra la ventana/Navbar (para lo cual
          se había puesto "top-[68px]") y en su lugar intentaba fijarse contra ESTE
          div — que no se desplaza de forma independiente porque no tenía una altura
          limitada, dando el comportamiento errático e incorrecto reportado ("se
          queda trabado"). La solución correcta y estándar para "encabezado fijo +
          scroll horizontal" es que este mismo contenedor tenga también su propio
          scroll VERTICAL limitado (max-h + overflow-y-auto, aquí via "overflow-auto"
          + "max-h-[70vh]"), de modo que el encabezado se fije con "top-0" respecto
          a SU PROPIO borde superior (ya no se necesita compensar los 68px de la
          Navbar, porque ya no depende del scroll de la ventana). */}
      {canDelete && (
        <div
          className={`flex flex-wrap items-center gap-2 sm:gap-3 px-3 py-2 rounded-xl border text-xs sm:text-sm ${
            selectedVisible.length ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <Lock className="w-4 h-4 text-slate-400" aria-hidden />
          <span className="font-semibold text-slate-700">
            {selectedVisible.length
              ? `${selectedVisible.length} ruta${selectedVisible.length !== 1 ? 's' : ''} liquidada${selectedVisible.length !== 1 ? 's' : ''} seleccionada${selectedVisible.length !== 1 ? 's' : ''}`
              : 'Administrador: marca las rutas liquidadas que quieras eliminar'}
          </span>
          <span className="flex-1" />
          {selectedVisible.length > 0 && (
            <Button variant="secondary" size="sm" onClick={() => setSelectedKeys(new Set())}>
              Quitar selección
            </Button>
          )}
          <Button
            variant="danger"
            size="sm"
            icon={ACTION_ICONS.eliminar}
            disabled={!selectedVisible.length}
            onClick={() => onDeleteRoutes && onDeleteRoutes(selectedVisible)}
            title="Pide tu contraseña antes de eliminar"
          >
            Eliminar seleccionadas{selectedVisible.length ? ` (${selectedVisible.length})` : ''}
          </Button>
        </div>
      )}

      <div className="overflow-auto border border-slate-200 rounded-xl w-full max-h-[70vh]">
        <table className="min-w-full divide-y divide-slate-200 text-left text-xs sm:text-sm whitespace-nowrap">
          <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-xs sm:text-[13px] tracking-wider">
            <tr>
              {canDelete && (
                <th scope="col" className="pl-4 pr-1 py-4 sticky top-0 z-20 bg-slate-50 w-10">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todas las rutas visibles"
                    title="Seleccionar todas las rutas visibles (según filtros)"
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = selectedVisible.length > 0 && !allVisibleSelected;
                    }}
                    onChange={toggleAllVisible}
                    className="w-5 h-5 accent-rose-600 cursor-pointer align-middle"
                  />
                </th>
              )}
              <th scope="col" className="px-5 py-4 sticky top-0 z-20 bg-slate-50">ID Ruta</th>
              <th scope="col" className="px-5 py-4 sticky top-0 z-20 bg-slate-50">Estado</th>
              <th scope="col" className="px-5 py-4 sticky top-0 z-20 bg-slate-50">Clientes</th>
              <th scope="col" className="px-5 py-4 sticky top-0 z-20 bg-slate-50">Agencia y Segmento</th>
              <th scope="col" className="px-5 py-4 sticky top-0 z-20 bg-slate-50">Fecha Ruta & Cierre</th>
              <th scope="col" className="px-5 py-4 sticky top-0 z-20 bg-slate-50">Unidad</th>
              <th scope="col" className="px-5 py-4 sticky top-0 z-20 bg-slate-50">Paradas</th>
              <th scope="col" className="px-5 py-4 sticky top-0 z-20 bg-slate-50">Balance Cajas Físicas</th>
              <th scope="col" className="px-5 py-4 sticky top-0 z-20 bg-slate-50">Motivo Devolución</th>
              <th scope="col" className="px-5 py-4 sticky top-0 z-20 bg-slate-50">Auditor</th>
              <th scope="col" className="px-5 py-4 text-right min-w-[140px] sticky top-0 z-20 bg-slate-50">Actas Oficiales</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-normal">
            {filteredList.map((r) => {
              const asig = r.asignacion || r.ultimoDespacho || {};
              const liq = r.liquidacion || {};
              const driverObj = staff.find((s) => s.nombre === asig.conductor);
              const helpers = [asig.auxiliar1, asig.auxiliar2, asig.auxiliar3, asig.auxiliar4].filter(Boolean);

              const cajasSalida = toNum(r.cajasFisicas) || 0;
              const cajasEntregadas = parseFloat(String(liq.cajasEntregadas)) || 0;
              const cajasDevueltas = parseFloat(String(liq.cajasDevueltas)) || 0;

              // Check if part of a split where all siblings are settled
              const parentId = r.parentRouteId;
              let allSiblingsSettled = false;
              if (parentId) {
                const siblings = allRoutes.filter((sr) => isSameSplitGroup(sr, parentId, r));
                if (siblings.length > 1) {
                  allSiblingsSettled = siblings.every((s) => s.estado === 'Liquidada');
                }
              }

              const asigType = getRouteAssignmentType(r);
              const isDevolucionRevisita = Boolean(
                (liq.motivoDevolucion && liq.motivoDevolucion.toLowerCase().includes('revisita')) ||
                (r.motivoDevolucion && r.motivoDevolucion.toLowerCase().includes('revisita')) ||
                asigType === 'Revisita' ||
                r.tipoAsignacion === 'Revisita' ||
                r.esReasignacion ||
                (r.historialDespachos && r.historialDespachos.length > 0)
              );

              const routeKey = getRouteKey(r);
              const rowKey = `${r.id}-${asigType}-${r.tripNumber || 1}-${r.liquidacion?.fechaLiquidacion || ''}`;

              return (
                <React.Fragment key={rowKey}>
                <tr
                  className={`transition-colors ${canDelete && selectedKeys.has(routeKey) ? 'bg-rose-50/70 hover:bg-rose-50' : 'hover:bg-slate-50/90'}`}
                >
                  {canDelete && (
                    <td className="pl-4 pr-1 py-4 w-10">
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ruta ${r.id}`}
                        checked={selectedKeys.has(routeKey)}
                        onChange={() => toggleKey(routeKey)}
                        className="w-5 h-5 accent-rose-600 cursor-pointer align-middle"
                      />
                    </td>
                  )}
                  {/* ID */}
                  <td className="px-5 py-4 font-mono">
                    <div className="font-bold text-slate-900 text-sm sm:text-base">{r.id}</div>
                    {r.parentRouteId && (
                      <span className="text-[11px] bg-purple-100 text-purple-800 font-mono px-1.5 py-0.5 rounded block w-fit mt-1">
                        Matriz {r.parentRouteId}
                      </span>
                    )}
                    {asigType === 'Recarga' && (
                      <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 font-bold px-2 py-0.5 rounded inline-flex items-center gap-0.5 mt-1">
                        <Repeat className="w-3 h-3 text-purple-600" />
                        Recarga (2° Viaje)
                      </span>
                    )}
                    {asigType === 'Revisita' && (
                      <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-300 font-bold px-2 py-0.5 rounded inline-flex items-center gap-0.5 mt-1">
                        <RotateCcw className="w-3 h-3 text-amber-700" />
                        Revisita
                      </span>
                    )}
                    {asigType === 'Primer Viaje' && (
                      <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 font-bold px-2 py-0.5 rounded inline-flex items-center gap-0.5 mt-1">
                        Primer Viaje
                      </span>
                    )}
                    {asigType === 'Ruta a Piso' && (
                      <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 font-bold px-2 py-0.5 rounded inline-flex items-center gap-0.5 mt-1">
                        Ruta a Piso
                      </span>
                    )}
                  </td>

                  {/* Estado Badge */}
                  <td className="px-5 py-4">
                    {liq.cajaAbierta ? (
                      <div className="space-y-1">
                        {liq.cajaAbiertaResuelta ? (
                          <span
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
                            title="Caja Abierta ya validada (Liquidación Final registrada)"
                          >
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>Caja Abierta (Validada)</span>
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300"
                            title="Ruta liquidada, pero pendiente de validar la caja/boleta del punto de venta"
                          >
                            <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>Caja Abierta</span>
                          </span>
                        )}
                        {liq.motivoCajaAbierta && !liq.cajaAbiertaResuelta && (
                          <span className="block text-[10px] text-amber-700 font-medium">
                            {liq.motivoCajaAbierta}
                          </span>
                        )}
                        {typeof liq.montoDiferenciaCaja === 'number' && (
                          <span className="block text-[10px] text-amber-800 font-bold font-mono">
                            Diferencia: Q {liq.montoDiferenciaCaja.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        )}
                        {liq.abonosCaja && liq.abonosCaja.length > 0 && (() => {
                          const ab = liq.abonosCaja.reduce((a, x) => a + (Number(x.monto) || 0), 0);
                          const tot = Number(liq.montoDiferenciaCaja) || 0;
                          const f = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                          return (
                            <span className="block text-[10px] font-bold font-mono text-emerald-700">
                              Abonado: Q {f(ab)}
                              {tot > 0 && !liq.cajaAbiertaResuelta ? ` · Saldo: Q ${f(Math.max(0, tot - ab))}` : ''}
                              {` (${liq.abonosCaja.length} abono${liq.abonosCaja.length === 1 ? '' : 's'})`}
                            </span>
                          );
                        })()}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Liquidada</span>
                      </span>
                    )}

                    {/* Historial de Estados: línea de tiempo ordenada con la fecha de
                        cada proceso realizado (Liquidada/Caja Abierta al momento de
                        liquidar, y Liquidación Final cuando se resuelve). */}
                    {liq.historialEstados && liq.historialEstados.length > 0 && (
                      <div className="mt-1.5 space-y-0.5 border-l-2 border-slate-200 pl-2">
                        {liq.historialEstados.map((h, idx) => (
                          <div key={idx} className="text-[10px] text-slate-500 leading-tight">
                            <span className="font-semibold text-slate-600">{h.estado}:</span>{' '}
                            <span className="font-mono">{formatDateTimeToGuatemala(h.fecha)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>

                  {/* Clientes (prioridad): lista completa con los pendientes marcados */}
                  <td className="px-5 py-4 text-xs sm:text-sm">
                    {(() => {
                      const total = r.clientesRuta?.length || 0;
                      const pend = liq.clientesPendientes?.length || 0;
                      if (total === 0 && pend === 0) return <span className="text-[11px] text-slate-400">Sin lista</span>;
                      const abierto = expandedClientesKey === routeKey;
                      return (
                        <button
                          type="button"
                          onClick={() => setExpandedClientesKey((prev) => (prev === routeKey ? null : routeKey))}
                          title="Ver la lista de clientes de esta ruta"
                          aria-expanded={abierto}
                          className={`inline-flex flex-col items-start gap-0.5 min-h-[44px] px-3 py-1.5 rounded-lg border-2 transition cursor-pointer text-left ${
                            abierto
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'bg-blue-50 border-blue-300 text-blue-800 hover:bg-blue-100'
                          }`}
                        >
                          <span className="inline-flex items-center gap-1 font-bold text-xs whitespace-nowrap">
                            <Users className="w-3.5 h-3.5" />
                            {abierto ? 'Ocultar' : 'Ver'} clientes ({Math.max(total, pend)})
                          </span>
                          {pend > 0 && (
                            <span
                              className={`text-[10px] font-bold px-1.5 rounded ${
                                abierto ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-700'
                              }`}
                            >
                              {pend} pendiente(s)
                            </span>
                          )}
                        </button>
                      );
                    })()}
                  </td>

                  {/* Agencia y Segmento */}
                  <td className="px-5 py-4 text-xs sm:text-sm">
                    <div className="font-semibold text-blue-700">{r.agencia}</div>
                    {r.segmento && (
                      <div className="text-[11px] text-slate-500">{r.segmento}</div>
                    )}
                  </td>

                  {/* Fecha Ruta & Cierre */}
                  <td className="px-5 py-4 text-xs sm:text-sm">
                    <div className="font-medium text-slate-800">
                      <span className="text-[10px] sm:text-[11px] text-slate-400 block uppercase font-medium">Ruta:</span>
                      {formatDateToGuatemala(r.fechaOriginalRuta || r.fecha) || '-'}
                    </div>
                    {(r.aPiso || r.tipoAsignacion === 'Ruta a Piso') && r.fechaReprogramada && (
                      <div className="text-[11px] text-amber-700 font-mono mt-0.5" title="Ruta a piso reprogramada">
                        <span className="text-slate-400">Piso: </span>
                        {r.fechaReprogramada}
                      </div>
                    )}
                    {(r.fechaAsignacion || asig.fechaAsignacion) && (
                      <div className="text-[11px] text-blue-700 font-mono mt-0.5" title="Fecha en que fue asignada">
                        <span className="text-slate-400">Asig: </span>
                        {r.fechaAsignacion || asig.fechaAsignacion}
                      </div>
                    )}
                    <div className="text-[11px] text-emerald-700 font-mono mt-0.5" title="Fecha en que fue liquidada">
                      <span className="text-slate-400">Liq: </span>
                      {formatDateTimeToGuatemala(liq.fechaLiquidacion || r.fechaLiquidacion) || '-'}
                    </div>
                  </td>

                  {/* Unidad: placa + ojo con camión y tripulación (compacto) */}
                  <td className="px-5 py-4 text-xs sm:text-sm">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0">
                        <div className="font-mono font-bold text-slate-800 whitespace-nowrap">{asig.camionPlaca || '-'}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[140px]" title={asig.conductor || ''}>
                          {asig.conductor || 'Sin piloto'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setUnidadPop((prev) =>
                            prev && prev.key === routeKey
                              ? null
                              : {
                                  key: routeKey,
                                  top: rect.bottom + 6,
                                  left: Math.max(8, Math.min(rect.left - 120, window.innerWidth - 300)),
                                  placa: asig.camionPlaca || '-',
                                  idCamion: '',
                                  piloto: asig.conductor || '',
                                  puesto: driverObj?.puesto || 'VPP',
                                  dpi: driverObj?.dpi && driverObj.dpi !== 'N/A' ? driverObj.dpi : '',
                                  auxiliares: helpers as string[],
                                  salida: asig.horaSalida || '',
                                }
                          );
                        }}
                        aria-label={`Ver camión y tripulación de la ruta ${r.id}`}
                        title="Ver camión y tripulación"
                        className={`shrink-0 w-10 h-10 rounded-lg border flex items-center justify-center cursor-pointer transition ${
                          unidadPop?.key === routeKey
                            ? 'bg-slate-800 border-slate-800 text-white'
                            : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </td>

                  {/* Paradas */}
                  <td className="px-5 py-4 font-mono text-xs sm:text-sm">
                    <div className="font-semibold text-slate-700">Prog: {fmtNum(r.paradas)}</div>
                    <div className="text-[11px] sm:text-xs text-emerald-700 font-semibold">
                      Entregadas: {liq.guiasExitosas !== undefined ? liq.guiasExitosas : r.paradas}
                    </div>
                    {liq.guiasRechazadas !== undefined && liq.guiasRechazadas > 0 && (
                      <div className="text-[11px] text-rose-700 font-bold">
                        {isDevolucionRevisita ? 'Total Devuelto: ' : 'Rechazadas: '}
                        {liq.guiasRechazadas}
                      </div>
                    )}
                  </td>

                  {/* Balance Cajas */}
                  <td className="px-5 py-4 font-mono text-xs sm:text-sm">
                    <div className="text-slate-500 text-[11px]">
                      Salida: <b>{fmtNum(cajasSalida, 3)}</b>
                    </div>
                    <div className="text-emerald-700 font-bold">
                      Entregadas: {fmtNum(cajasEntregadas, 3)}
                    </div>
                    <div className={`text-[11px] sm:text-xs ${cajasDevueltas > 0 ? 'text-rose-700 font-bold' : 'text-slate-400'}`}>
                      Devueltas: {fmtNum(cajasDevueltas, 3)}
                    </div>
                  </td>

                  {/* Motivo Devolución */}
                  <td className="px-5 py-4 text-xs sm:text-sm max-w-xs truncate">
                    {(() => {
                      const isFullDelivered =
                        cajasDevueltas === 0 &&
                        (liq.guiasRechazadas === 0 || liq.guiasRechazadas === undefined);
                      const motivoToShow = isFullDelivered ? '' : (liq.motivoDevolucion || '');

                      if (motivoToShow) {
                        return (
                          <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded text-xs font-medium">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span className="truncate">{motivoToShow}</span>
                          </span>
                        );
                      }
                      return (
                        <span className="text-emerald-700 font-semibold text-xs inline-flex items-center bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                          100% Entregado
                        </span>
                      );
                    })()}
                    {liq.clientesPendientes && liq.clientesPendientes.length > 0 && (
                      <div className="mt-1.5 space-y-0.5 max-w-[240px] whitespace-normal">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">
                          Clientes pendientes ({liq.clientesPendientes.length}):
                        </span>
                        {liq.clientesPendientes.slice(0, 3).map((cp, idx) => (
                          <div key={`${cp.codigo}-${idx}`} className="text-[10px] text-slate-600 leading-tight">
                            <strong className="text-slate-700">{cp.nombre || cp.codigo}</strong>: {cp.motivo}
                          </div>
                        ))}
                        {liq.clientesPendientes.length > 3 && (
                          <div className="text-[10px] text-slate-400">
                            +{liq.clientesPendientes.length - 3} más
                          </div>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Auditor */}
                  <td className="px-5 py-4 text-slate-700 font-medium text-xs sm:text-sm">
                    {liq.auditor || '-'}
                    {/* Corrección: se muestra además el usuario del sistema que realmente
                        ejecutó la liquidación (trazabilidad), sin afectar el campo Auditor
                        de texto libre que puede ser una persona distinta. */}
                    {liq.liquidadoPorUsuario && (
                      <div
                        className="text-[10px] text-slate-400 font-mono mt-0.5"
                        title="Usuario del sistema que registró la liquidación"
                      >
                        Sistema: {liq.liquidadoPorUsuario}
                      </div>
                    )}
                    {liq.comentario && (
                      <div
                        className="text-[10px] text-slate-500 italic mt-1 max-w-[220px] whitespace-normal"
                        title="Comentario registrado al liquidar"
                      >
                        "{liq.comentario}"
                      </div>
                    )}
                    {liq.cajaAbiertaResuelta && liq.comentarioLiquidacionFinal && (
                      <div
                        className="text-[10px] text-emerald-700 italic mt-1 max-w-[220px] whitespace-normal"
                        title="Comentario de la Liquidación Final"
                      >
                        Final: "{liq.comentarioLiquidacionFinal}"
                      </div>
                    )}
                  </td>

                  {/* Acciones */}
                  <td className="px-5 py-4 text-right">
                    {/* Acción principal por estado: si la caja quedó abierta, "Liquidación
                        final" (ámbar) va primero; el acta siempre disponible. */}
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      {liq.cajaAbierta && onOpenAbonosCaja && (!liq.cajaAbiertaResuelta || (liq.abonosCaja && liq.abonosCaja.length > 0)) && (
                        <Button
                          variant={liq.cajaAbiertaResuelta ? 'secondary' : 'success'}
                          size="sm"
                          onClick={() => onOpenAbonosCaja(r)}
                          title={liq.cajaAbiertaResuelta ? 'Ver historial de abonos' : 'Registrar abono diario a la Caja Abierta'}
                        >
                          {liq.cajaAbiertaResuelta ? 'Ver abonos' : 'Abonos'}
                        </Button>
                      )}
                      {liq.cajaAbierta && !liq.cajaAbiertaResuelta && onOpenFinalizeCajaAbierta && (
                        <Button
                          variant="warning"
                          size="sm"
                          icon={Lock}
                          onClick={() => onOpenFinalizeCajaAbierta(r)}
                          title="Registrar Liquidación Final: cierra el pendiente de validar caja/boleta"
                        >
                          Liquidación final
                        </Button>
                      )}
                      {allSiblingsSettled && parentId && (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={ACTION_ICONS.acta}
                          onClick={() => onViewConsolidatedReceipt(parentId, r)}
                          title="Ver Acta Oficial Consolidada de todos los viajes"
                        >
                          Consolidada
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={ACTION_ICONS.acta}
                        onClick={() => onViewSettlementReceipt(r.id, r)}
                        title="Ver e imprimir acta oficial de liquidación"
                      >
                        Acta
                      </Button>
                    </div>
                  </td>
                </tr>
                {expandedClientesKey === routeKey &&
                  ((r.clientesRuta && r.clientesRuta.length > 0) || (liq.clientesPendientes && liq.clientesPendientes.length > 0)) && (
                  <tr className="bg-slate-50/70">
                    <td colSpan={canDelete ? 12 : 11} className="px-5 py-3">
                      <ClientesRutaList clientes={r.clientesRuta || []} pendientes={liq.clientesPendientes} />
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        {filteredList.length === 0 && (
          <div className="p-12 text-center text-slate-400 text-xs">
            <PackageCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <div className="font-semibold text-slate-600">No hay rutas liquidadas para mostrar</div>
            <p className="mt-1 text-slate-400">
              Las rutas aparecerán aquí una vez que sean liquidadas desde Asignación.
            </p>
          </div>
        )}
      </div>
      {unidadPop && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setUnidadPop(null)} aria-hidden />
          <div
            role="dialog"
            aria-label="Camión y tripulación"
            className="fixed z-50 w-[290px] bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-xs space-y-2"
            style={{ top: Math.min(unidadPop.top, window.innerHeight - 260), left: unidadPop.left }}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800">Camión y tripulación</span>
              <button
                type="button"
                onClick={() => setUnidadPop(null)}
                aria-label="Cerrar"
                className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-2">
              <div className="text-[10px] uppercase text-slate-500 font-semibold">Camión</div>
              <div className="font-mono font-bold text-slate-900 text-sm">
                {unidadPop.idCamion ? `${unidadPop.idCamion} · ` : ''}
                {unidadPop.placa}
              </div>
              {unidadPop.salida && <div className="text-[11px] text-slate-500">Salida: {unidadPop.salida}</div>}
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-2">
              <div className="text-[10px] uppercase text-slate-500 font-semibold">Piloto</div>
              <div className="font-semibold text-slate-900">
                {unidadPop.piloto || 'Sin piloto'}{' '}
                <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono font-bold">{unidadPop.puesto}</span>
              </div>
              {unidadPop.dpi && <div className="text-[11px] text-slate-500 font-mono">DPI: {unidadPop.dpi}</div>}
            </div>
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-2">
              <div className="text-[10px] uppercase text-slate-500 font-semibold">Auxiliares ({unidadPop.auxiliares.length})</div>
              {unidadPop.auxiliares.length > 0 ? (
                <ul className="list-disc list-inside text-slate-800">
                  {unidadPop.auxiliares.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              ) : (
                <div className="text-slate-400">Sin auxiliares</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
