import React, { useState, useMemo } from 'react';
import { Route, Staff } from '../types';
import { exportHistoricalToExcel, getRouteAssignmentType } from '../utils/excel';
import { parseFlexibleDate, formatDateToGuatemala, formatDateTimeToGuatemala } from '../utils/date';
import { CheckCircle2, FileText, Download, Search, Filter, Calendar, PackageCheck, AlertCircle, RotateCcw, Repeat } from 'lucide-react';

interface LiquidatedBoardViewProps {
  liquidatedRoutes: Route[];
  allRoutes: Route[];
  staff: Staff[];
  allAgencies: string[];
  onViewSettlementReceipt: (routeId: string, route?: Route) => void;
  onViewConsolidatedReceipt: (parentRouteId: string) => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const LiquidatedBoardView: React.FC<LiquidatedBoardViewProps> = ({
  liquidatedRoutes,
  allRoutes,
  staff,
  allAgencies,
  onViewSettlementReceipt,
  onViewConsolidatedReceipt,
  onShowToast,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgency, setSelectedAgency] = useState('TODAS');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

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
          String(asig.camionPlaca || '').toLowerCase().includes(q) ||
          String(asig.conductor || '').toLowerCase().includes(q) ||
          String(asig.auxiliar1 || '').toLowerCase().includes(q) ||
          String(asig.auxiliar2 || '').toLowerCase().includes(q) ||
          String(asig.auxiliar3 || '').toLowerCase().includes(q) ||
          String(liq.auditor || '').toLowerCase().includes(q) ||
          String(liq.motivoDevolucion || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [liquidatedRoutes, searchTerm, selectedAgency, dateFrom, dateTo]);

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

  const handleExport = () => {
    const success = exportHistoricalToExcel(filteredList, staff);
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
        <button
          onClick={handleExport}
          className="inline-flex items-center px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-lg text-xs font-semibold transition cursor-pointer"
        >
          <Download className="w-4 h-4 mr-1.5 text-emerald-600" />
          Descargar Reporte en Excel (.xlsx)
        </button>
      </div>

      {/* KPI Cards */}
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
      </div>

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
            className="w-full p-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
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
            className="w-full p-2 bg-white border border-slate-300 rounded-lg font-medium cursor-pointer outline-none"
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
            className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none"
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
            className="w-full p-2 bg-white border border-slate-300 rounded-lg outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-xl w-full">
        <table className="min-w-full divide-y divide-slate-200 text-left text-xs sm:text-sm whitespace-nowrap">
          <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-xs sm:text-[13px] tracking-wider">
            <tr>
              <th scope="col" className="px-5 py-4">ID Ruta</th>
              <th scope="col" className="px-5 py-4">Estado</th>
              <th scope="col" className="px-5 py-4">Agencia & Mercado</th>
              <th scope="col" className="px-5 py-4">Fecha Ruta & Cierre</th>
              <th scope="col" className="px-5 py-4">Camión (Placa)</th>
              <th scope="col" className="px-5 py-4 min-w-[200px]">Tripulación</th>
              <th scope="col" className="px-5 py-4">Paradas</th>
              <th scope="col" className="px-5 py-4">Balance Cajas Físicas</th>
              <th scope="col" className="px-5 py-4">Motivo Devolución</th>
              <th scope="col" className="px-5 py-4">Auditor</th>
              <th scope="col" className="px-5 py-4 text-right min-w-[140px]">Actas Oficiales</th>
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
                const siblings = allRoutes.filter((sr) => sr.parentRouteId === parentId);
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

              return (
                <tr
                  key={`${r.id}-${asigType}-${r.tripNumber || 1}-${r.liquidacion?.fechaLiquidacion || ''}`}
                  className="hover:bg-slate-50/90 transition-colors"
                >
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
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Liquidada</span>
                    </span>
                  </td>

                  {/* Agencia & Mercado */}
                  <td className="px-5 py-4 text-xs sm:text-sm">
                    <div className="font-semibold text-blue-700">{r.agencia}</div>
                    <div className="text-[11px] text-slate-500">{r.mercado || 'Mercado Abierto'}</div>
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
                  </td>

                  {/* Acciones */}
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {allSiblingsSettled && parentId && (
                        <button
                          onClick={() => onViewConsolidatedReceipt(parentId)}
                          title="Ver Acta Oficial Consolidada de todos los viajes"
                          className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-300 rounded-lg text-xs sm:text-sm font-semibold transition inline-flex items-center cursor-pointer shadow-xs"
                        >
                          <FileText className="w-4 h-4 mr-1 text-purple-600" />
                          Consolidada
                        </button>
                      )}
                      <button
                        onClick={() => onViewSettlementReceipt(r.id, r)}
                        title="Ver e imprimir acta oficial de liquidación"
                        className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-lg text-xs sm:text-sm font-semibold transition inline-flex items-center cursor-pointer shadow-xs"
                      >
                        <FileText className="w-4 h-4 mr-1 text-emerald-600" />
                        Acta Oficial
                      </button>
                    </div>
                  </td>
                </tr>
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
