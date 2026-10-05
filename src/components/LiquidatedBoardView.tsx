import React, { useState, useMemo, useEffect } from 'react';
import { Route, Staff } from '../types';
import { exportHistoricalToExcel, getRouteAssignmentType } from '../utils/excel';
import { parseFlexibleDate, formatDateToGuatemala, formatDateTimeToGuatemala } from '../utils/date';
import { CheckCircle2, FileText, Download, Search, Filter, Calendar, PackageCheck, AlertCircle, RotateCcw, Repeat, Lock, Users } from 'lucide-react';
import { Button } from './ui/Button';
import { ACTION_ICONS } from './ui/actionIcons';
import { ClientesRutaList } from './ClientesRutaList';
import { getRouteKey, isSameSplitGroup } from '../utils/routeKey';

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
  onShowToast,
  onDeleteRoutes,
}) => {
  const canDelete = !!onDeleteRoutes;
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgency, setSelectedAgency] = useState('TODAS');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedClientesKey, setExpandedClientesKey] = useState<string | null>(null);

  const filteredList = useMemo(() => {
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
      (acc, r) => acc + (parseFloat(String(r.cajasFisicas)) || 0),
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
      onShowToast(`Se descargaron ${filteredList.length} registros del Tablero de Rutas Liquidadas en Excel`, 'success');
    } else {
      onShowToast('No hay rutas liquidadas para exportar', 'error');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h3 className="font-bold text-slate-800 text-base flex items-center">
            <CheckCircle2 className="w-5 h-5 mr-2 text-emerald-600" />
            Tablero de Rutas Liquidadas
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Control centralizado de rutas cerradas operativamente, balances de entrega y actas de liquidación.
          </p>
        </div>
        {/* Exportación única de esta sección: descarga lo que se ve (respeta los filtros). */}
        <Button variant="secondary" icon={ACTION_ICONS.exportar} onClick={handleExport} className="text-emerald-700">
          Exportar vista ({filteredList.length})
        </Button>
      </div>

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
            <h4 className="text-xl font-extrabold text-emerald-700">{totalCajasEntregadas.toFixed(3)}</h4>
            <span className="text-[10px] text-emerald-600 font-medium">de {totalCajasSalida.toFixed(3)}</span>
          </div>
        </div>

        <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
          <span className="text-[11px] text-rose-700 font-medium uppercase tracking-wider">Cajas Devueltas / Rechazos</span>
          <div className="flex items-baseline space-x-2 mt-0.5">
            <h4 className="text-xl font-extrabold text-rose-700">{totalCajasDevueltas.toFixed(3)}</h4>
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
              <h4 className="text-xl font-extrabold text-amber-700">{cajaAbiertaCount}</h4>
              <span className="text-[10px] text-amber-600 font-medium">pendiente(s) de validar</span>
            </div>
          </div>
        )}
      </div>

      </>
      )}

      {historyLimitedDays && onLoadFullHistory && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-sky-200 bg-sky-50 text-sky-900 text-xs">
          <span>
            Se muestran las liquidaciones de los <strong>últimos {historyLimitedDays} días</strong> para que la app abra
            más rápido.
          </span>
          <Button variant="primary" size="sm" onClick={onLoadFullHistory} loading={isLoadingFullHistory} loadingText="Cargando…">
            Cargar historial completo
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
        <div>
          <label htmlFor="liqSearchInput" className="block font-semibold text-slate-600 mb-1 flex items-center">
            <Search className="w-3.5 h-3.5 mr-1 text-slate-400" />
            Buscar por ID, Piloto, Camión:
          </label>
          <input
            id="liqSearchInput"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Ej: 102201, C-102, Carlos..."
            className="w-full min-h-[44px] p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        <div>
          <label htmlFor="liqAgencyFilter" className="block font-semibold text-slate-600 mb-1 flex items-center">
            <Filter className="w-3.5 h-3.5 mr-1 text-slate-400" />
            Filtrar por Agencia:
          </label>
          <select
            id="liqAgencyFilter"
            value={selectedAgency}
            onChange={(e) => setSelectedAgency(e.target.value)}
            className="w-full min-h-[44px] p-2 bg-white border border-slate-300 rounded-lg font-medium cursor-pointer outline-none"
          >
            <option value="TODAS">-- Todas las Agencias --</option>
            {allAgencies.map((ag) => (
              <option key={ag} value={ag}>
                {ag}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="liqDateFrom" className="block font-semibold text-slate-600 mb-1 flex items-center" title="Filtra por fecha de liquidación (cierre), no por fecha de la ruta">
            <Calendar className="w-3.5 h-3.5 mr-1 text-slate-400" />
            Fecha Liquidación Desde:
          </label>
          <input
            id="liqDateFrom"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full min-h-[44px] p-2 bg-white border border-slate-300 rounded-lg outline-none"
          />
        </div>

        <div>
          <label htmlFor="liqDateTo" className="block font-semibold text-slate-600 mb-1 flex items-center" title="Filtra por fecha de liquidación (cierre), no por fecha de la ruta">
            <Calendar className="w-3.5 h-3.5 mr-1 text-slate-400" />
            Fecha Liquidación Hasta:
          </label>
          <input
            id="liqDateTo"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full min-h-[44px] p-2 bg-white border border-slate-300 rounded-lg outline-none"
          />
        </div>
      </div>

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
              <th scope="col" className="px-5 py-4 sticky top-0 z-20 bg-slate-50">Agencia y Segmento</th>
              <th scope="col" className="px-5 py-4 sticky top-0 z-20 bg-slate-50">Fecha Ruta & Cierre</th>
              <th scope="col" className="px-5 py-4 sticky top-0 z-20 bg-slate-50">Camión (Placa)</th>
              <th scope="col" className="px-5 py-4 min-w-[200px] sticky top-0 z-20 bg-slate-50">Tripulación</th>
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

              const cajasSalida = parseFloat(String(r.cajasFisicas)) || 0;
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
                            Diferencia: Q {liq.montoDiferenciaCaja.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        )}
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

                  {/* Camión */}
                  <td className="px-5 py-4 font-mono font-bold text-slate-800 text-xs sm:text-sm">
                    {asig.camionPlaca || '-'}
                  </td>

                  {/* Tripulación */}
                  <td className="px-5 py-4 text-xs sm:text-sm">
                    <div>
                      <strong className="text-slate-800">{asig.conductor || 'N/A'}</strong>{' '}
                      <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono font-bold ml-1">
                        {driverObj?.puesto || 'VPP'}
                      </span>
                    </div>
                    {driverObj?.dpi && driverObj.dpi !== 'N/A' && (
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        DPI: {driverObj.dpi}
                      </div>
                    )}
                    {helpers.length > 0 ? (
                      <div className="text-[11px] sm:text-xs text-slate-500 mt-1">
                        Aux: <span className="font-medium text-slate-700">{helpers.join(', ')}</span>
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 mt-0.5">Sin auxiliares</div>
                    )}
                  </td>

                  {/* Paradas */}
                  <td className="px-5 py-4 font-mono text-xs sm:text-sm">
                    <div className="font-semibold text-slate-700">Prog: {r.paradas}</div>
                    <div className="text-[11px] sm:text-xs text-emerald-700 font-semibold">
                      Entregadas: {liq.guiasExitosas !== undefined ? liq.guiasExitosas : r.paradas}
                    </div>
                    {liq.guiasRechazadas !== undefined && liq.guiasRechazadas > 0 && (
                      <div className="text-[11px] text-rose-700 font-bold">
                        {isDevolucionRevisita ? 'Total Devuelto: ' : 'Rechazadas: '}
                        {liq.guiasRechazadas}
                      </div>
                    )}
                    {r.clientesRuta && r.clientesRuta.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpandedClientesKey((prev) => (prev === routeKey ? null : routeKey))}
                        title="Ver la lista de clientes de esta ruta (solo consulta)"
                        aria-expanded={expandedClientesKey === routeKey}
                        className={`mt-1 inline-flex items-center gap-1 min-h-[36px] px-2.5 text-[11px] font-semibold rounded-lg border transition cursor-pointer ${
                          expandedClientesKey === routeKey
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-400'
                        }`}
                      >
                        <Users className="w-3 h-3" />
                        {expandedClientesKey === routeKey ? 'Ocultar' : 'Ver'} clientes ({r.clientesRuta.length})
                      </button>
                    )}
                  </td>

                  {/* Balance Cajas */}
                  <td className="px-5 py-4 font-mono text-xs sm:text-sm">
                    <div className="text-slate-500 text-[11px]">
                      Salida: <b>{cajasSalida.toFixed(3)}</b>
                    </div>
                    <div className="text-emerald-700 font-bold">
                      Entregadas: {cajasEntregadas.toFixed(3)}
                    </div>
                    <div className={`text-[11px] sm:text-xs ${cajasDevueltas > 0 ? 'text-rose-700 font-bold' : 'text-slate-400'}`}>
                      Devueltas: {cajasDevueltas.toFixed(3)}
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
                {expandedClientesKey === routeKey && r.clientesRuta && r.clientesRuta.length > 0 && (
                  <tr className="bg-slate-50/70">
                    <td colSpan={canDelete ? 12 : 11} className="px-5 py-3">
                      <ClientesRutaList clientes={r.clientesRuta} />
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
              Las rutas aparecerán aquí una vez que sean liquidadas desde el Tablero de Rutas.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
