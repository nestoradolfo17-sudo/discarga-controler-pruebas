import React, { useRef } from 'react';
import { Route, Staff } from '../../types';
import { formatDateToGuatemala, formatDateTimeToGuatemala } from '../../utils/date';
import { getRouteAssignmentType } from '../../utils/excel';
import { X, Printer } from 'lucide-react';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  route: Route | null;
  consolidatedSiblings?: Route[];
  staff: Staff[];
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  route,
  consolidatedSiblings,
  staff,
}) => {
  const printContentRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !route) return null;

  const isConsolidated = consolidatedSiblings && consolidatedSiblings.length > 0;

  const handlePrint = () => {
    const printableContent = printContentRef.current;
    if (!printableContent) return;

    const targetRouteId = isConsolidated
      ? String(route.parentRouteId || route.id)
      : String(route.id);

    // Obtener fecha de liquidación
    let rawFechaLiq = '';
    if (isConsolidated && consolidatedSiblings && consolidatedSiblings.length > 0) {
      const sibWithLiq = [...consolidatedSiblings].reverse().find((s) => s.liquidacion?.fechaLiquidacion);
      rawFechaLiq = sibWithLiq?.liquidacion?.fechaLiquidacion || route.liquidacion?.fechaLiquidacion || '';
    } else {
      rawFechaLiq = route.liquidacion?.fechaLiquidacion || '';
    }

    if (!rawFechaLiq) {
      rawFechaLiq = formatDateTimeToGuatemala(new Date());
    }

    const cleanDate = (formatDateToGuatemala(rawFechaLiq) || formatDateTimeToGuatemala(new Date()).slice(0, 10)).replace(/\//g, '-');
    const cleanRouteId = targetRouteId.trim().replace(/[/\\?%*:|"<>]/g, '-');

    const documentTitle = isConsolidated
      ? `Acta_Consolidado_Liquidacion_Ruta_${cleanRouteId}_${cleanDate}`
      : `Acta_Liquidacion_Ruta_${cleanRouteId}_${cleanDate}`;

    const originalTitle = document.title;
    document.title = documentTitle;

    try {
      const printWindow = window.open('', '_blank', 'width=850,height=900');
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html lang="es">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${documentTitle}</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
            <style>
              @page { size: letter portrait; margin: 12mm 15mm; }
              body {
                font-family: 'Inter', sans-serif;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                background-color: #ffffff;
                color: #0f172a;
                padding: 10px;
              }
            </style>
          </head>
          <body class="p-4 bg-white text-xs">
            <div class="max-w-2xl mx-auto space-y-4">
              ${printableContent.innerHTML}
            </div>
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.focus();
                  window.print();
                  setTimeout(function() { window.close(); }, 750);
                }, 350);
              };
            </script>
          </body>
          </html>
        `);
        printWindow.document.close();
        setTimeout(() => {
          document.title = originalTitle;
        }, 1500);
        return;
      }
    } catch (err) {
      console.warn('Popup blocked, fallback to window.print()', err);
    }

    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1500);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between no-print">
          <h3 className="font-bold text-xs">
            {isConsolidated
              ? 'Acta Oficial Consolidada de Liquidación de Ruta'
              : 'Acta Oficial de Liquidación de Ruta'}
          </h3>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center space-x-1 transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 mr-1" />
              <span>Imprimir / Guardar PDF</span>
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div
          ref={printContentRef}
          id="printableSettlement"
          className="p-6 text-xs text-slate-800 space-y-4 overflow-y-auto"
        >
          {isConsolidated ? (
            // Consolidated Receipt
            (() => {
              const siblings = consolidatedSiblings!;
              const baseAgencia = siblings[0].agencia;
              const baseFecha = siblings[0].fecha;
              const parentRouteId = route.parentRouteId || route.id;

              const sumParadas = siblings.reduce((acc, r) => acc + (parseInt(String(r.paradas)) || 0), 0);
              const sumExitosas = siblings.reduce(
                (acc, r) => acc + ((r.liquidacion && r.liquidacion.guiasExitosas) || 0),
                0
              );
              const sumRechazadas = siblings.reduce(
                (acc, r) => acc + ((r.liquidacion && r.liquidacion.guiasRechazadas) || 0),
                0
              );
              const sumCajasSalida = siblings.reduce(
                (acc, r) => acc + (parseFloat(String(r.cajasFisicas)) || 0),
                0
              );
              const sumCajasEntregadas = siblings.reduce(
                (acc, r) => acc + ((r.liquidacion && r.liquidacion.cajasEntregadas) || 0),
                0
              );
              const sumCajasDevueltas = siblings.reduce(
                (acc, r) => acc + ((r.liquidacion && r.liquidacion.cajasDevueltas) || 0),
                0
              );

              return (
                <>
                  <div className="border-b-2 border-slate-900 pb-3 mb-4 flex justify-between items-start">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900 uppercase">
                        Acta Oficial Consolidada de Liquidación de Ruta
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        DISCARGA CONTROLER - Suma Total de los {siblings.length} Viajes Liquidados
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold bg-slate-900 text-white px-2 py-1 rounded">
                        Ruta Matriz {parentRouteId}
                      </span>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {formatDateTimeToGuatemala(new Date())}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Agencia:</span>
                      <strong className="text-slate-800">{baseAgencia}</strong> ({formatDateToGuatemala(baseFecha) || 'Fecha de Ruta'})
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Estructura Operativa:
                      </span>
                      <strong className="text-slate-800">
                        {siblings.length} Viajes (.1 a .{siblings.length})
                      </strong>
                    </div>
                  </div>

                  <div className="mt-4 border border-slate-200 rounded-lg overflow-hidden">
                    <div className="bg-slate-100 p-2 font-bold text-[11px] text-slate-800 uppercase tracking-wider">
                      Detalle de las {siblings.length} Liquidaciones Individuales
                    </div>
                    <table className="w-full text-[11px] text-left divide-y divide-slate-200">
                      <thead className="bg-slate-50 text-slate-600 font-semibold">
                        <tr>
                          <th className="p-2">ID Línea</th>
                          <th className="p-2">Camión (Placa)</th>
                          <th className="p-2">Piloto y Auxiliares</th>
                          <th className="p-2 text-right">Cajas Entregadas</th>
                          <th className="p-2 text-right">Cajas Devueltas</th>
                          <th className="p-2">Motivo Devolución</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {siblings.map((s) => {
                          const liq = s.liquidacion || {};
                          const asig = s.asignacion || s.ultimoDespacho || {};
                          const auxList = [asig.auxiliar1, asig.auxiliar2, asig.auxiliar3, asig.auxiliar4].filter(Boolean);
                          // Corrección: el acta consolidada mostraba cajas entregadas/devueltas
                          // por línea pero no el motivo de la devolución, que sí aparece en el
                          // acta individual — obligando a abrir cada línea por separado para
                          // saber por qué hubo devolución.
                          const cajasDevSib = parseFloat(String(liq.cajasDevueltas !== undefined ? liq.cajasDevueltas : 0));
                          const motivoSib = cajasDevSib > 0 ? liq.motivoDevolucion || '-' : '-';
                          return (
                            <tr key={s.id}>
                              <td className="p-2 font-bold text-indigo-900">{s.id}</td>
                              <td className="p-2 font-semibold text-slate-800">{asig.camionPlaca || '-'}</td>
                              <td className="p-2 font-sans">
                                {asig.conductor || '-'}{' '}
                                {auxList.length > 0 && (
                                  <span className="block text-slate-500 font-mono text-[10px]">
                                    Aux: {auxList.join(', ')}
                                  </span>
                                )}
                              </td>
                              <td className="p-2 text-right text-emerald-700 font-bold">
                                {liq.cajasEntregadas !== undefined ? liq.cajasEntregadas : '-'}
                              </td>
                              <td className="p-2 text-right text-rose-700">
                                {liq.cajasDevueltas !== undefined ? liq.cajasDevueltas : '-'}
                              </td>
                              <td className="p-2 font-sans text-[10px] text-slate-600">{motivoSib}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-2 mt-4">
                    <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider border-b border-slate-200 pb-1">
                      Suma del Total Consolidado (Balance Global de la Ruta {parentRouteId})
                    </h4>
                    <table className="w-full text-left font-mono text-xs">
                      <tbody>
                        <tr className="border-b border-slate-100">
                          <td className="py-1 text-slate-600 font-sans">Total Paradas Programadas:</td>
                          <td className="py-1 font-bold text-right text-slate-800">{sumParadas}</td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="py-1 text-emerald-700 font-sans">Paradas Entregadas (Suma Total):</td>
                          <td className="py-1 font-bold text-right text-emerald-700">{sumExitosas}</td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="py-1 text-rose-700 font-sans">Paradas Rechazadas (Suma Total):</td>
                          <td className="py-1 font-bold text-right text-rose-700">{sumRechazadas}</td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="py-1 text-slate-600 font-sans">Cajas Físicas Salida (Total Ruta):</td>
                          <td className="py-1 font-bold text-right text-slate-800">{sumCajasSalida.toFixed(3)}</td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="py-1 text-emerald-700 font-sans font-bold">
                            Cajas Físicas Entregadas (Suma Total):
                          </td>
                          <td className="py-1 font-extrabold text-right text-emerald-700">
                            {sumCajasEntregadas.toFixed(3)}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="py-1 text-rose-700 font-sans">Cajas Devueltas / Rechazos (Suma Total):</td>
                          <td className="py-1 font-bold text-right text-rose-700">{sumCajasDevueltas.toFixed(3)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="pt-8 grid grid-cols-2 gap-8 text-center text-[11px] border-t border-slate-200 mt-6">
                    <div>
                      <div className="border-t border-slate-400 w-3/4 mx-auto mb-1"></div>
                      <strong className="text-slate-800 block">
                        Pilotos de las Líneas (.1 a .{siblings.length})
                      </strong>
                      <span className="text-slate-400 text-[10px]">Firmas de Pilotos Titulares</span>
                    </div>
                    <div>
                      <div className="border-t border-slate-400 w-3/4 mx-auto mb-1"></div>
                      <strong className="text-slate-800 block">
                        {(siblings[0].liquidacion && siblings[0].liquidacion.auditor) || 'Auditor de Agencia'}
                      </strong>
                      <span className="text-slate-400 text-[10px]">Firma Auditor / Liquidador</span>
                    </div>
                  </div>
                </>
              );
            })()
          ) : (
            // Individual Receipt
            (() => {
              const liq = route.liquidacion || {
                cajasDevueltas: 0,
                cajasEntregadas: route.cajasFisicas,
                guiasExitosas: route.paradas,
                guiasRechazadas: 0,
                auditor: 'Auditor de Agencia',
                fechaLiquidacion: formatDateTimeToGuatemala(new Date()),
              };
              const asig = route.asignacion || route.ultimoDespacho || {};
              const helpersList = [asig.auxiliar1, asig.auxiliar2, asig.auxiliar3, asig.auxiliar4].filter(Boolean);
              const helpersText = helpersList.length > 0 ? helpersList.join(', ') : 'Sin auxiliares asignados';

              const driverObj = staff.find((s) => s.nombre === asig.conductor);

              const isDevolucionRevisita = Boolean(
                (liq.motivoDevolucion && liq.motivoDevolucion.toLowerCase().includes('revisita')) ||
                (route.motivoDevolucion && route.motivoDevolucion.toLowerCase().includes('revisita')) ||
                route.tipoAsignacion === 'Revisita' ||
                route.esReasignacion ||
                (route.historialDespachos && route.historialDespachos.length > 0)
              );

              return (
                <>
                  <div className="border-b-2 border-slate-900 pb-3 mb-4 flex justify-between items-start">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-900 uppercase">
                        Acta Oficial de Liquidación de Ruta
                      </h2>
                      <p className="text-[11px] text-slate-500">DISCARGA CONTROLER - Cierre de Distribución</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold bg-slate-900 text-white px-2 py-1 rounded">
                        Ruta {route.id}
                      </span>
                      <p className="text-[10px] text-slate-400 mt-1">
                        {formatDateTimeToGuatemala(liq.fechaLiquidacion || new Date())}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Agencia:</span>
                      <strong className="text-slate-800">{route.agencia || '-'}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Segmento:</span>
                      <strong className="text-slate-800">{route.segmento || '-'}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Modalidad de Viaje:</span>
                      <strong className="text-slate-800">
                        {(() => {
                          // Corrección: antes este cálculo tenía su propia lógica, distinta
                          // de la usada en Dashboard/Excel (getRouteAssignmentType), lo que
                          // podía mostrar una modalidad diferente para la misma ruta según la
                          // pantalla. Ahora se reutiliza la misma función canónica.
                          const tipo = getRouteAssignmentType(route);
                          if (tipo === 'Revisita') return 'Revisita (Reasignada)';
                          if (tipo === 'Recarga') return 'Recarga (2° Viaje)';
                          if (tipo === 'Ruta a Piso') return 'Ruta a Piso';
                          return 'Primer Viaje';
                        })()}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Fecha de Ruta:</span>
                      <strong className="text-slate-800">{formatDateToGuatemala(route.fechaOriginalRuta || route.fecha) || '-'}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Fecha de Asignación:</span>
                      <strong className="text-blue-900">
                        {route.fechaAsignacion || asig.fechaAsignacion || (asig.horaSalida ? `${formatDateToGuatemala(route.fechaOriginalRuta || route.fecha)} ${asig.horaSalida}` : '-')}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Fecha de Liquidación:</span>
                      <strong className="text-emerald-700">
                        {formatDateTimeToGuatemala(liq.fechaLiquidacion || route.fechaLiquidacion || new Date())}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Camión Asignado (Placa):
                      </span>
                      <strong className="text-slate-800">{asig.camionPlaca || '-'}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">Piloto Titular:</span>
                      <strong className="text-slate-800">{asig.conductor || '-'}</strong>{' '}
                      <span className="text-[10px] font-mono font-semibold text-slate-500">
                        ({driverObj ? driverObj.puesto || 'VPP' : 'VPP'})
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                        Auxiliares de Reparto ({helpersList.length}/4):
                      </span>
                      <strong className="text-slate-800">{helpersText}</strong>
                    </div>
                  </div>

                  <div className="space-y-2 mt-4">
                    <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider border-b border-slate-200 pb-1">
                      Balance Operativo de Carga y Paradas
                    </h4>
                    <table className="w-full text-left font-mono text-xs">
                      <tbody>
                        <tr className="border-b border-slate-100">
                          <td className="py-1 text-slate-600 font-sans">Total Paradas Programadas:</td>
                          <td className="py-1 font-bold text-right text-slate-800">{route.paradas}</td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="py-1 text-emerald-700 font-sans">Paradas Entregadas:</td>
                          <td className="py-1 font-bold text-right text-emerald-700">
                            {liq.guiasExitosas !== undefined ? liq.guiasExitosas : route.paradas}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="py-1 text-rose-700 font-sans">
                            {isDevolucionRevisita ? 'Total Devuelto (Revisita):' : 'Paradas Rechazadas:'}
                          </td>
                          <td className="py-1 font-bold text-right text-rose-700">
                            {liq.guiasRechazadas !== undefined ? liq.guiasRechazadas : 0}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="py-1 text-slate-600 font-sans">Cajas Físicas Salida:</td>
                          <td className="py-1 font-bold text-right text-slate-800">
                            {parseFloat(String(route.cajasFisicas || 0)).toFixed(3)}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="py-1 text-emerald-700 font-sans font-bold">Cajas Físicas Entregadas:</td>
                          <td className="py-1 font-extrabold text-right text-emerald-700">
                            {parseFloat(
                              String(liq.cajasEntregadas !== undefined ? liq.cajasEntregadas : route.cajasFisicas || 0)
                            ).toFixed(3)}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-100">
                          <td className="py-1 text-rose-700 font-sans">Cajas Devueltas / Rechazos:</td>
                          <td className="py-1 font-bold text-right text-rose-700">
                            {parseFloat(String(liq.cajasDevueltas !== undefined ? liq.cajasDevueltas : 0)).toFixed(3)}
                          </td>
                        </tr>
                        {(() => {
                          const isFullDelivered =
                            parseFloat(String(liq.cajasDevueltas !== undefined ? liq.cajasDevueltas : 0)) === 0 &&
                            (liq.guiasRechazadas === 0 || liq.guiasRechazadas === undefined);
                          const motivoToShow = isFullDelivered ? '' : (liq.motivoDevolucion || '');

                          if (!motivoToShow) return null;

                          return (
                            <tr>
                              <td
                                colSpan={2}
                                className="py-2 text-[11px] text-slate-700 italic bg-amber-50 p-2.5 rounded-lg border border-amber-200 font-sans mt-1"
                              >
                                <strong>Motivo de rechazo / devolución:</strong> {motivoToShow}
                              </td>
                            </tr>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>

                  {route.historialDespachos && route.historialDespachos.length > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-1.5 font-sans">
                      <div className="text-[11px] font-bold text-slate-800 flex items-center justify-between">
                        <span>Historial de Despachos y Retornos Previos:</span>
                        <span className="text-[10px] font-mono text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                          {route.historialDespachos.length} Retorno(s)
                        </span>
                      </div>
                      <div className="space-y-1 text-[10px] text-slate-600">
                        {route.historialDespachos.map((hd, idx) => (
                          <div
                            key={idx}
                            className="bg-white p-2 rounded border border-slate-200 flex justify-between items-start"
                          >
                            <div>
                              <span className="font-bold text-slate-800">
                                Salida #{hd.intento || idx + 1}:
                              </span>{' '}
                              Unidad {hd.camionPlaca} | Piloto: {hd.conductor}
                              <div className="text-slate-500 italic mt-0.5">
                                Motivo: {hd.motivoDevolucion || 'Devolución'}
                              </div>
                            </div>
                            <div className="text-right font-mono">
                              <span className="text-rose-700 font-bold">
                                Devueltas: {parseFloat(String(hd.cajasDevueltas || 0)).toFixed(3)}
                              </span>
                              <div className="text-[9px] text-slate-400">
                                {formatDateTimeToGuatemala(hd.fechaRetorno)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-8 grid grid-cols-2 gap-8 text-center text-[11px] border-t border-slate-200 mt-6">
                    <div>
                      <div className="border-t border-slate-400 w-3/4 mx-auto mb-1"></div>
                      <strong className="text-slate-800 block">{asig.conductor || 'Piloto Titular'}</strong>
                      <span className="text-slate-400 text-[10px]">Firma Piloto Titular</span>
                    </div>
                    <div>
                      <div className="border-t border-slate-400 w-3/4 mx-auto mb-1"></div>
                      <strong className="text-slate-800 block">{liq.auditor || 'Auditor de Agencia'}</strong>
                      <span className="text-slate-400 text-[10px]">Firma Auditor / Liquidador</span>
                    </div>
                  </div>
                </>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
};
