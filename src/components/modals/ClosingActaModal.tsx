import React, { useEffect, useMemo, useState } from 'react';
import { Route } from '../../types';
import { formatDateToGuatemala, formatDateTimeToGuatemala } from '../../utils/date';
import {
  X,
  Printer,
  CheckCircle2,
  AlertCircle,
  ClipboardCheck,
} from 'lucide-react';

interface ClosingActaModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Rutas activas (no liquidadas) visibles para el usuario en sesión
  routes: Route[];
  // Todas las rutas liquidadas (histórico archivado + activas ya liquidadas)
  allLiquidatedRoutes: Route[];
  selectedAgency: string;
  agencies: string[];
  // Fecha operativa del día (misma que usa el Dashboard / Resumen Diario)
  fechaHoy: string;
  // Nombre a mostrar como "Quien Liquida": el usuario que tiene la sesión abierta
  quienLiquida: string;
}

interface ActaRow {
  id: string;
  agencia: string;
  mercado: string;
  estado: string;
  isLiquidada: boolean;
  isFloor: boolean;
  camionPlaca: string;
  conductor: string;
  cajasPlan: number;
  cajasEntregadas: number;
  cajasDevueltas: number;
  paradasPlan: number;
  guiasExitosas: number;
  horaLiquidacion: string;
  motivo: string;
}

// Determina si una fecha (en cualquier formato reconocido por el sistema) corresponde
// a la jornada operativa actual, comparando contra la fecha operativa activa (fechaHoy)
// y contra la fecha real de hoy, igual que el resto del Dashboard/Resumen Diario.
function isSameOperationDay(dateStr: string | null | undefined, fechaHoy: string, todayDateStr: string): boolean {
  if (!dateStr) return false;
  const formatted = formatDateToGuatemala(dateStr);
  if (!formatted) return false;
  return formatted === fechaHoy || formatted === todayDateStr;
}

function buildActaRow(r: Route): ActaRow {
  const isLiquidada = r.estado === 'Liquidada' || Boolean(r.liquidacion);
  const isFloor = Boolean(
    r.aPiso || r.tipoAsignacion === 'Ruta a Piso' || r.asignacion?.tipoAsignacion === 'Ruta a Piso'
  );
  const asig = r.asignacion || r.ultimoDespacho || null;

  return {
    id: String(r.id),
    agencia: r.agencia || 'Mercado Abierto',
    mercado: r.mercado || 'Principal',
    estado: r.estado,
    isLiquidada,
    isFloor,
    camionPlaca: asig?.camionPlaca || '—',
    conductor: asig?.conductor || '—',
    cajasPlan: Number(r.cajasFisicas || r.cajasOriginales || 0) || 0,
    cajasEntregadas: Number(r.liquidacion?.cajasEntregadas || 0) || 0,
    cajasDevueltas: Number(r.liquidacion?.cajasDevueltas || 0) || 0,
    paradasPlan: Number(r.paradas || r.paradasOriginales || 0) || 0,
    guiasExitosas: Number(r.liquidacion?.guiasExitosas || 0) || 0,
    horaLiquidacion: r.fechaLiquidacion || r.liquidacion?.fechaLiquidacion || '',
    motivo: r.liquidacion?.motivoDevolucion || r.motivoDevolucion || r.motivoPiso || '',
  };
}

export const ClosingActaModal: React.FC<ClosingActaModalProps> = ({
  isOpen,
  onClose,
  routes,
  allLiquidatedRoutes,
  selectedAgency,
  agencies,
  fechaHoy,
  quienLiquida,
}) => {
  const [filterAgency, setFilterAgency] = useState<string>(selectedAgency || 'TODAS');

  useEffect(() => {
    if (isOpen) {
      setFilterAgency(selectedAgency || 'TODAS');
    }
  }, [isOpen, selectedAgency]);

  const todayDateStr = formatDateToGuatemala(new Date());
  const activeFechaHoy = fechaHoy || todayDateStr;

  // Consolidar rutas activas + liquidadas de la jornada actual, sin duplicar por ID
  const todayRows = useMemo(() => {
    const map = new Map<string, Route>();
    routes.forEach((r) => map.set(String(r.id), r));
    allLiquidatedRoutes.forEach((r) => {
      if (!map.has(String(r.id))) {
        map.set(String(r.id), r);
      }
    });

    return Array.from(map.values())
      .filter((r) => {
        const candidates = [
          r.liquidacion?.fechaLiquidacion,
          r.fechaLiquidacion,
          r.fecha,
          r.fechaOriginalRuta,
          r.fechaPiso,
          r.fechaCarga,
          r.fechaCreacion,
        ];
        return candidates.some((c) => isSameOperationDay(c, activeFechaHoy, todayDateStr));
      })
      .map(buildActaRow)
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }, [routes, allLiquidatedRoutes, activeFechaHoy, todayDateStr]);

  const filteredRows = useMemo(
    () => todayRows.filter((r) => filterAgency === 'TODAS' || r.agencia === filterAgency),
    [todayRows, filterAgency]
  );

  const liquidadas = useMemo(() => filteredRows.filter((r) => r.isLiquidada), [filteredRows]);
  const noLiquidadas = useMemo(() => filteredRows.filter((r) => !r.isLiquidada), [filteredRows]);

  const totalCajasPlan = filteredRows.reduce((acc, r) => acc + r.cajasPlan, 0);
  const totalCajasEntregadas = liquidadas.reduce((acc, r) => acc + r.cajasEntregadas, 0);
  const totalCajasDevueltas = liquidadas.reduce((acc, r) => acc + r.cajasDevueltas, 0);
  const cumplimientoPorc =
    filteredRows.length > 0 ? ((liquidadas.length / filteredRows.length) * 100).toFixed(1) : '0.0';

  if (!isOpen) return null;

  const handlePrint = () => {
    const originalTitle = document.title;
    const cleanFecha = activeFechaHoy.replace(/\//g, '-');
    const agencyLabel = filterAgency === 'TODAS' ? 'Todas_Agencias' : filterAgency.replace(/\s+/g, '_');
    document.title = `Acta_Cierre_Liquidacion_Total_DISCARGA_${agencyLabel}_${cleanFecha}`;
    document.body.classList.add('printing-closing-acta');
    try {
      window.print();
    } catch (err) {
      console.warn('window.print() bloqueado o interceptado:', err);
    }
    setTimeout(() => {
      document.title = originalTitle;
      document.body.classList.remove('printing-closing-acta');
    }, 1000);
  };

  return (
    <div
      id="closingActaModal"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 print:p-0 print:static print:bg-white print:overflow-visible print:block print:w-full"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden print:max-h-none print:h-auto print:shadow-none print:border-0 print:rounded-none print:overflow-visible print:block print:w-full">
        {/* HEADER */}
        <div className="px-6 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 print:bg-white print:text-slate-900 print:border-b-2 print:border-slate-900 print:px-2 print:py-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white print:text-slate-900 print:text-xl flex items-center">
              <ClipboardCheck className="w-5 h-5 mr-2 text-emerald-400 print:text-emerald-700" />
              Acta de Cierre y Liquidación Total del Día
            </h2>
            <p className="text-xs text-slate-400 print:text-slate-600 mt-0.5">
              DISCARGA CONTROLER • Constancia de rutas liquidadas y no liquidadas de la jornada, para firma de recibido conforme
            </p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 print:bg-slate-100 print:text-slate-800 print:border-slate-300">
                Fecha: {activeFechaHoy}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 print:bg-slate-100 print:text-slate-800 print:border-slate-300">
                Agencia: {filterAgency}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            {agencies.length > 1 && (
              <select
                value={filterAgency}
                onChange={(e) => setFilterAgency(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-semibold text-slate-200 outline-none cursor-pointer"
              >
                <option value="TODAS">Todas las Agencias</option>
                {agencies.map((ag) => (
                  <option key={ag} value={ag}>
                    {ag}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={handlePrint}
              title="Imprimir Acta de Cierre (o guardar como PDF desde el diálogo de impresión)"
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-lg text-xs font-bold flex items-center transition border border-indigo-500 cursor-pointer shadow-xs"
            >
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              Imprimir / Guardar PDF
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto flex-1 print:overflow-visible space-y-5 text-xs">
          {/* KPIs RESUMEN */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print:grid-cols-4">
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Total Rutas del Día</span>
              <div className="text-2xl font-black text-slate-900">{filteredRows.length}</div>
            </div>
            <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50">
              <span className="text-[10px] font-bold text-emerald-700 uppercase">Liquidadas</span>
              <div className="text-2xl font-black text-emerald-800">{liquidadas.length}</div>
              <p className="text-[10px] text-emerald-700 font-semibold">{cumplimientoPorc}% cumplimiento</p>
            </div>
            <div className="p-3 rounded-xl border border-rose-200 bg-rose-50">
              <span className="text-[10px] font-bold text-rose-700 uppercase">No Liquidadas</span>
              <div className="text-2xl font-black text-rose-800">{noLiquidadas.length}</div>
            </div>
            <div className="p-3 rounded-xl border border-indigo-200 bg-indigo-50">
              <span className="text-[10px] font-bold text-indigo-700 uppercase">Cajas (Plan / Ent / Dev)</span>
              <div className="text-sm font-black text-indigo-900">
                {totalCajasPlan.toFixed(1)} / {totalCajasEntregadas.toFixed(1)} / {totalCajasDevueltas.toFixed(1)}
              </div>
            </div>
          </div>

          {/* TABLA: RUTAS LIQUIDADAS */}
          <div>
            <h3 className="font-bold text-slate-800 text-sm flex items-center mb-2">
              <CheckCircle2 className="w-4 h-4 mr-1.5 text-emerald-600" />
              Rutas Liquidadas ({liquidadas.length})
            </h3>
            {liquidadas.length === 0 ? (
              <p className="text-slate-400 italic p-3 border border-dashed border-slate-200 rounded-lg">
                Ninguna ruta liquidada en esta selección.
              </p>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse print:text-[10px]">
                  <thead className="bg-emerald-50 text-emerald-900 font-bold text-[10px] uppercase">
                    <tr>
                      <th className="px-2.5 py-2">No. Ruta</th>
                      <th className="px-2.5 py-2">Agencia</th>
                      <th className="px-2.5 py-2">Mercado</th>
                      <th className="px-2.5 py-2">Piloto</th>
                      <th className="px-2.5 py-2">Camión</th>
                      <th className="px-2.5 py-2 text-right">Cajas Plan</th>
                      <th className="px-2.5 py-2 text-right">Entregadas</th>
                      <th className="px-2.5 py-2 text-right">Devueltas</th>
                      <th className="px-2.5 py-2 text-center">Paradas</th>
                      <th className="px-2.5 py-2">Hora Liquidación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {liquidadas.map((r) => (
                      <tr key={r.id}>
                        <td className="px-2.5 py-2 font-bold text-indigo-900 whitespace-nowrap">#{r.id}</td>
                        <td className="px-2.5 py-2 whitespace-nowrap">{r.agencia}</td>
                        <td className="px-2.5 py-2 whitespace-nowrap">{r.mercado}</td>
                        <td className="px-2.5 py-2 whitespace-nowrap">{r.conductor}</td>
                        <td className="px-2.5 py-2 font-mono whitespace-nowrap">{r.camionPlaca}</td>
                        <td className="px-2.5 py-2 text-right font-semibold">{r.cajasPlan.toFixed(1)}</td>
                        <td className="px-2.5 py-2 text-right font-bold text-emerald-700">
                          {r.cajasEntregadas.toFixed(1)}
                        </td>
                        <td className="px-2.5 py-2 text-right font-bold text-rose-700">
                          {r.cajasDevueltas.toFixed(1)}
                        </td>
                        <td className="px-2.5 py-2 text-center whitespace-nowrap">
                          {r.guiasExitosas}/{r.paradasPlan}
                        </td>
                        <td className="px-2.5 py-2 whitespace-nowrap">{r.horaLiquidacion || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* TABLA: RUTAS NO LIQUIDADAS */}
          <div>
            <h3 className="font-bold text-slate-800 text-sm flex items-center mb-2">
              <AlertCircle className="w-4 h-4 mr-1.5 text-rose-600" />
              Rutas NO Liquidadas ({noLiquidadas.length})
            </h3>
            {noLiquidadas.length === 0 ? (
              <p className="text-emerald-700 font-semibold p-3 border border-dashed border-emerald-200 rounded-lg bg-emerald-50/40">
                Todas las rutas del día fueron liquidadas. No hay pendientes.
              </p>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse print:text-[10px]">
                  <thead className="bg-rose-50 text-rose-900 font-bold text-[10px] uppercase">
                    <tr>
                      <th className="px-2.5 py-2">No. Ruta</th>
                      <th className="px-2.5 py-2">Agencia</th>
                      <th className="px-2.5 py-2">Mercado</th>
                      <th className="px-2.5 py-2">Estado</th>
                      <th className="px-2.5 py-2">Piloto</th>
                      <th className="px-2.5 py-2">Camión</th>
                      <th className="px-2.5 py-2 text-right">Cajas Plan</th>
                      <th className="px-2.5 py-2">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {noLiquidadas.map((r) => (
                      <tr key={r.id}>
                        <td className="px-2.5 py-2 font-bold text-indigo-900 whitespace-nowrap">#{r.id}</td>
                        <td className="px-2.5 py-2 whitespace-nowrap">{r.agencia}</td>
                        <td className="px-2.5 py-2 whitespace-nowrap">{r.mercado}</td>
                        <td className="px-2.5 py-2 whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                            {r.isFloor ? 'En Bodega / Piso' : r.estado}
                          </span>
                        </td>
                        <td className="px-2.5 py-2 whitespace-nowrap">{r.conductor}</td>
                        <td className="px-2.5 py-2 font-mono whitespace-nowrap">{r.camionPlaca}</td>
                        <td className="px-2.5 py-2 text-right font-semibold">{r.cajasPlan.toFixed(1)}</td>
                        <td className="px-2.5 py-2 text-slate-600">{r.motivo || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* FIRMAS */}
          <div className="pt-6 mt-4 border-t-2 border-slate-300 grid grid-cols-1 sm:grid-cols-2 gap-8">
            <div className="text-center">
              <div className="h-14 flex items-end justify-center">
                <div className="w-full border-b-2 border-slate-800"></div>
              </div>
              <p className="font-bold text-slate-800 mt-1">{quienLiquida}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                Firma de Quien Liquida (Usuario del Sistema)
              </p>
            </div>
            <div className="text-center">
              <div className="h-14 flex items-end justify-center">
                <div className="w-full border-b-2 border-slate-800"></div>
              </div>
              <p className="font-bold text-slate-800 mt-1">&nbsp;</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide">
                Firma de Quien Recibe la Liquidación (Cliente)
              </p>
            </div>
          </div>

          <div className="hidden print:flex items-center justify-between pt-3 mt-2 border-t border-slate-300 text-[9px] text-slate-500">
            <span className="font-bold text-slate-800">DISCARGA CONTROLER • Sistema de Asignación, Segmentación y Liquidación Operativa</span>
            <span>Generado: {formatDateTimeToGuatemala(new Date())}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
