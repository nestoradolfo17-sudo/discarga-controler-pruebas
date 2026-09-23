import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Route, RouteClientEntry } from '../types';
import {
  downloadExcelTemplate,
  scoreSheetForRoutes,
  parseRoutesFromSheet,
  parseClientesFromSheet,
  groupClientesByRuta,
  isClientesSheetName,
  extractDayNumberFromSheetName,
  extractFechaEntregaMonthYear,
  ImportReport,
} from '../utils/excel';
import { formatDateToGuatemala } from '../utils/date';
import { SEGMENTO_OPTIONS } from '../data/segmentos';
import { getRouteKey } from '../utils/routeKey';
import { FileSpreadsheet, Download, UploadCloud, CheckCircle, X, Layers, AlertCircle, Users, MapPin, Tag } from 'lucide-react';

export interface BatchImportTarget {
  agencia: string;
  segmento: string;
}

interface BatchImportViewProps {
  existingRoutes: Route[];
  // Agencias a las que el usuario en sesión puede cargar rutas (según su
  // permiso de agencias en Usuarios; un administrador ve todas).
  agencyOptions: string[];
  onCommitRoutes: (newRoutes: Route[], target: BatchImportTarget) => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

// Normaliza un número de ruta para comparar el ID de ruta (hoja "Resumen N") contra
// la clave de ruta agrupada del detalle de clientes (hoja "Clientes N") sin que
// diferencias de formato (ceros a la izquierda, espacios) rompan el emparejamiento.
function normRuta(v: string): string {
  return String(v ?? '').trim().replace(/^0+(?=\d)/, '');
}

// Detecta, dentro del mismo archivo cargado, cuáles pestañas son de detalle de
// clientes ("Clientes N"), para poder ofrecerlas como pareja opcional de la
// pestaña de rutas ("Resumen N") seleccionada.
function detectClientesSheets(wb: XLSX.WorkBook): string[] {
  return wb.SheetNames.filter((n) => isClientesSheetName(n));
}

// Sugiere automáticamente la pestaña de clientes que corresponde al mismo día
// que la pestaña de rutas seleccionada (mismo número de pestaña). Si no hay
// coincidencia exacta de día, sugiere la primera disponible; el usuario puede
// cambiarla o desactivarla desde el selector.
function autoMatchClientesSheet(routesSheetName: string, candidates: string[]): string {
  if (candidates.length === 0) return '';
  const routesDay = extractDayNumberFromSheetName(routesSheetName);
  if (routesDay !== null) {
    const sameDay = candidates.find((c) => extractDayNumberFromSheetName(c) === routesDay);
    if (sameDay) return sameDay;
  }
  return candidates[0];
}

export const BatchImportView: React.FC<BatchImportViewProps> = ({
  existingRoutes,
  agencyOptions,
  onCommitRoutes,
  onShowToast,
}) => {
  // Destino de la carga: agencia y segmento elegidos por el usuario. Se aplican
  // a TODAS las rutas del archivo (reemplazan lo que traiga el Excel en esas
  // columnas). Si el usuario solo tiene permiso para una agencia, se
  // preselecciona automáticamente.
  const [targetAgencia, setTargetAgencia] = useState<string>(agencyOptions.length === 1 ? agencyOptions[0] : '');
  const [targetSegmento, setTargetSegmento] = useState<string>('');
  const effectiveAgencia = agencyOptions.includes(targetAgencia) ? targetAgencia : '';
  const targetReady = !!effectiveAgencia && !!targetSegmento;
  const [isDragging, setIsDragging] = useState(false);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [previewRoutes, setPreviewRoutes] = useState<Route[]>([]);
  // Corrección: se conserva el reporte de filas leídas/importadas/descartadas del
  // último parseo, para mostrarlo en la vista previa (antes no se informaba nada
  // sobre las filas que se descartaban silenciosamente).
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Detalle de Clientes por Ruta (opcional, del mismo archivo) ---
  // Si el archivo cargado además trae una pestaña "Clientes N" (aparte de la
  // pestaña "Resumen N" de rutas), se puede seleccionar aquí mismo para que el
  // detalle de clientes quede adjunto a cada ruta desde el momento en que se
  // crea — sin necesidad de subir el mismo archivo dos veces.
  const [clientesSheetNames, setClientesSheetNames] = useState<string[]>([]);
  const [selectedClientesSheet, setSelectedClientesSheet] = useState<string>('');
  const [clientesByRutaMap, setClientesByRutaMap] = useState<Map<string, RouteClientEntry[]> | null>(null);
  const [clientesImportReport, setClientesImportReport] = useState<ImportReport | null>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, {
          type: 'array',
          cellDates: true,
          cellNF: true,
          cellText: true,
        });

        if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
          onShowToast('El archivo no contiene hojas válidas', 'error');
          return;
        }

        setWorkbook(wb);
        setSheetNames(wb.SheetNames);

        // Find best sheet (se excluyen las pestañas de detalle de clientes: aunque
        // también mencionan "ruta", no son la fuente de las rutas en sí).
        let bestSheetName = wb.SheetNames[0];
        let bestScore = -1;

        for (const sName of wb.SheetNames) {
          if (isClientesSheetName(sName)) continue;
          const ws = wb.Sheets[sName];
          if (!ws || !ws['!ref']) continue;
          const score = scoreSheetForRoutes(ws);
          if (score > bestScore) {
            bestScore = score;
            bestSheetName = sName;
          }
        }

        setSelectedSheet(bestSheetName);
        parseAndSetRoutes(wb, bestSheetName);

        // Detecta y preselecciona automáticamente la pestaña de clientes del mismo día.
        const clientesCandidates = detectClientesSheets(wb);
        setClientesSheetNames(clientesCandidates);
        const autoClientes = autoMatchClientesSheet(bestSheetName, clientesCandidates);
        setSelectedClientesSheet(autoClientes);
        parseAndSetClientes(wb, autoClientes);
      } catch (err) {
        console.error('Error procesando archivo Excel:', err);
        onShowToast('Error al leer el archivo Excel.', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const parseAndSetRoutes = (wb: XLSX.WorkBook, sheetName: string) => {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) {
      onShowToast(`La pestaña "${sheetName}" está vacía`, 'error');
      setPreviewRoutes([]);
      return;
    }

    // Corrección: las hojas "Resumen N" tipo ROADNET/UPS Logistics no traen
    // columna de Fecha por fila — sin este cálculo, cada ruta importada se
    // quedaba con la fecha de HOY (día del import), lo que rompía por completo
    // el emparejamiento con el detalle de clientes ("Clientes N"). Se usa el
    // número de la pestaña como el día real (ya establecido para el detalle de
    // clientes) y el mes/año del texto "Fecha de entrega" de la propia hoja
    // (ese texto sí trae el mes/año correctos, aunque el día pueda diferir en
    // uno respecto al número de pestaña). Si la hoja SÍ trae columna de Fecha
    // por fila (plantilla propia), esa columna sigue teniendo prioridad — ver
    // parseRoutesFromSheet.
    const dayFromSheetName = extractDayNumberFromSheetName(sheetName);
    const entregaMonthYear = extractFechaEntregaMonthYear(ws);
    const dateOverride =
      dayFromSheetName !== null && entregaMonthYear
        ? formatDateToGuatemala(new Date(entregaMonthYear.year, entregaMonthYear.month - 1, dayFromSheetName, 12))
        : undefined;

    const parsed = parseRoutesFromSheet(ws, dateOverride);
    setImportReport(parsed.importReport || null);
    if (parsed.length === 0) {
      onShowToast(`No se encontraron registros de rutas válidos en "${sheetName}".`, 'error');
      setPreviewRoutes([]);
      return;
    }

    const discardedMsg =
      parsed.importReport && parsed.importReport.discarded > 0
        ? ` (${parsed.importReport.discarded} fila(s) descartada(s))`
        : '';
    setPreviewRoutes(parsed);
    onShowToast(`Se extrajeron ${parsed.length} rutas correctamente${discardedMsg}`, 'success');
  };

  const parseAndSetClientes = (wb: XLSX.WorkBook, sheetName: string) => {
    if (!sheetName) {
      setClientesByRutaMap(null);
      setClientesImportReport(null);
      return;
    }
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) {
      setClientesByRutaMap(null);
      setClientesImportReport(null);
      return;
    }
    const parsed = parseClientesFromSheet(ws);
    setClientesImportReport(parsed.importReport || null);
    setClientesByRutaMap(groupClientesByRuta(parsed));
  };

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    if (workbook) {
      parseAndSetRoutes(workbook, sheetName);
      // Re-sincroniza la pestaña de clientes sugerida con el nuevo día de rutas.
      const autoClientes = autoMatchClientesSheet(sheetName, clientesSheetNames);
      setSelectedClientesSheet(autoClientes);
      parseAndSetClientes(workbook, autoClientes);
    }
  };

  const handleClientesSheetChange = (sheetName: string) => {
    setSelectedClientesSheet(sheetName);
    if (workbook) {
      parseAndSetClientes(workbook, sheetName);
    }
  };

  const handleCancelPreview = () => {
    setPreviewRoutes([]);
    setImportReport(null);
    setWorkbook(null);
    setSheetNames([]);
    setSelectedSheet('');
    setClientesSheetNames([]);
    setSelectedClientesSheet('');
    setClientesByRutaMap(null);
    setClientesImportReport(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Mapa de clientes por ruta ya normalizado, listo para emparejar contra el ID
  // de ruta de cada fila de la vista previa (evita que ceros a la izquierda u
  // otros detalles de formato impidan el match).
  const clientesByNormRuta = useMemo(() => {
    if (!clientesByRutaMap) return null;
    const m = new Map<string, RouteClientEntry[]>();
    clientesByRutaMap.forEach((v, k) => m.set(normRuta(k), v));
    return m;
  }, [clientesByRutaMap]);

  const clientesSummary = useMemo(() => {
    if (!clientesByRutaMap || previewRoutes.length === 0) return null;
    const routeIds = new Set(previewRoutes.map((r) => normRuta(r.id)));
    let matchedRoutes = 0;
    let totalClientes = 0;
    const unmatchedRutas: string[] = [];
    clientesByRutaMap.forEach((clientes, ruta) => {
      totalClientes += clientes.length;
      if (routeIds.has(normRuta(ruta))) matchedRoutes++;
      else unmatchedRutas.push(ruta);
    });
    return {
      matchedRoutes,
      totalRutasEnHoja: clientesByRutaMap.size,
      totalClientes,
      unmatchedRutas: unmatchedRutas.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    };
  }, [clientesByRutaMap, previewRoutes]);

  const handleCommit = () => {
    if (previewRoutes.length === 0) {
      onShowToast('No hay rutas para importar', 'error');
      return;
    }
    if (!effectiveAgencia) {
      onShowToast('Selecciona la agencia a la que se cargarán las rutas.', 'error');
      return;
    }
    if (!targetSegmento) {
      onShowToast('Selecciona el segmento al que se cargarán las rutas.', 'error');
      return;
    }
    // Corrección: antes, si algo fallaba aquí adentro (o dentro de onCommitRoutes,
    // que se llama de forma síncrona), el error quedaba solo en la consola del
    // navegador — en pantalla no aparecía ningún aviso ni de éxito ni de error, y
    // parecía que el botón "Confirmar e Importar Rutas" simplemente no hacía nada.
    // Ahora cualquier error se atrapa y se muestra como aviso en pantalla, para
    // poder diagnosticar exactamente qué falla en vez de adivinar.
    try {
      const finalRoutes = previewRoutes.map((r) => {
        const withTarget: Route = { ...r, agencia: effectiveAgencia, segmento: targetSegmento };
        const clientes = clientesByNormRuta?.get(normRuta(r.id));
        return clientes && clientes.length > 0 ? { ...withTarget, clientesRuta: clientes } : withTarget;
      });
      onCommitRoutes(finalRoutes, { agencia: effectiveAgencia, segmento: targetSegmento });
      handleCancelPreview();
    } catch (err) {
      console.error('Error al confirmar la importación de rutas:', err);
      const detail = err instanceof Error ? err.message : String(err);
      onShowToast(`Ocurrió un error al importar las rutas: ${detail}`, 'error');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h3 className="font-bold text-slate-800 text-base flex items-center">
            <FileSpreadsheet className="w-5 h-5 mr-2 text-emerald-600" />
            Carga Masiva de Rutas desde Excel (.xlsx / .xls / .csv)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Sube tu archivo de rutas para crearlas en estado <strong>Pendiente</strong>. Se conservará la cola de rutas no asignadas o no liquidadas. Si el mismo archivo trae una pestaña de detalle de clientes ("Clientes N"), podrás seleccionarla abajo para adjuntarla a cada ruta en el mismo paso.
          </p>
        </div>
        <button
          onClick={downloadExcelTemplate}
          className="inline-flex items-center px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-lg text-xs font-semibold transition cursor-pointer"
        >
          <Download className="w-4 h-4 mr-1.5 text-emerald-600" />
          Descargar Plantilla Excel (.xlsx)
        </button>
      </div>

      {/* Destino de la carga: Agencia y Segmento */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
        <div>
          <label htmlFor="importAgencia" className="flex items-center text-xs font-semibold text-slate-700 mb-1">
            <MapPin className="w-3.5 h-3.5 mr-1 text-blue-600" />
            Agencia destino *
          </label>
          <select
            id="importAgencia"
            value={effectiveAgencia}
            onChange={(e) => setTargetAgencia(e.target.value)}
            disabled={agencyOptions.length === 0}
            className={`w-full p-2.5 border rounded-lg text-sm font-medium bg-white outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
              effectiveAgencia ? 'border-slate-300' : 'border-amber-400'
            }`}
          >
            <option value="">— Selecciona una agencia —</option>
            {agencyOptions.map((ag) => (
              <option key={ag} value={ag}>
                {ag}
              </option>
            ))}
          </select>
          {agencyOptions.length === 0 && (
            <p className="text-[11px] text-rose-600 mt-1">
              Tu usuario no tiene agencias asignadas. Solicita acceso al administrador.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="importSegmento" className="flex items-center text-xs font-semibold text-slate-700 mb-1">
            <Tag className="w-3.5 h-3.5 mr-1 text-emerald-600" />
            Segmento *
          </label>
          <select
            id="importSegmento"
            value={targetSegmento}
            onChange={(e) => setTargetSegmento(e.target.value)}
            className={`w-full p-2.5 border rounded-lg text-sm font-medium bg-white outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
              targetSegmento ? 'border-slate-300' : 'border-amber-400'
            }`}
          >
            <option value="">— Selecciona un segmento —</option>
            {SEGMENTO_OPTIONS.map((sg) => (
              <option key={sg} value={sg}>
                {sg}
              </option>
            ))}
          </select>
        </div>
        <p className="sm:col-span-2 text-[11px] text-slate-500">
          Todas las rutas del archivo se cargarán a la agencia y segmento seleccionados (reemplazan lo que traiga el Excel en esas columnas).
        </p>
      </div>

      {/* Drag and drop area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
          }
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
          isDragging
            ? 'border-blue-500 bg-blue-50/50'
            : 'border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/30'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          accept=".xlsx, .xls, .csv"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFile(e.target.files[0]);
            }
          }}
          className="hidden"
        />
        <div className="w-14 h-14 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
          <UploadCloud className="w-7 h-7" />
        </div>
        <h4 className="font-bold text-slate-800 text-sm">Haz clic para seleccionar o arrastra tu archivo Excel aquí</h4>
        <p className="text-xs text-slate-400 mt-1">
          Formato compatible: <strong>Agencia | Segmento | Fecha | ID de ruta | Viaje | Servicio | Descanso | Total | Distancia | Paradas | Equipo Frio | % de capacidad | Cajas 12 Oz | Peso | Cajas Fisicas</strong>
        </p>
      </div>

      {/* Preview table */}
      {previewRoutes.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <h4 className="font-bold text-xs text-slate-800">
                Vista Previa de Rutas Detectadas (<span>{previewRoutes.length}</span>)
              </h4>
              <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono">
                Pestaña: "{selectedSheet}"
              </span>
            </div>

            <div className="flex items-center space-x-2">
              {sheetNames.filter((n) => !isClientesSheetName(n)).length > 1 && (
                <div className="flex items-center space-x-1.5 text-xs bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                  <Layers className="w-3.5 h-3.5 text-slate-500" />
                  <label htmlFor="sheetSelect" className="text-slate-600 font-semibold">
                    Pestaña:
                  </label>
                  <select
                    id="sheetSelect"
                    value={selectedSheet}
                    onChange={(e) => handleSheetChange(e.target.value)}
                    className="bg-white border border-slate-300 rounded text-xs py-0.5 px-1 font-medium cursor-pointer"
                  >
                    {sheetNames
                      .filter((n) => !isClientesSheetName(n))
                      .map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <button
                onClick={handleCancelPreview}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg flex items-center cursor-pointer"
              >
                <X className="w-3 h-3 mr-1" />
                Cancelar
              </button>

              <button
                onClick={handleCommit}
                disabled={!targetReady}
                title={targetReady ? undefined : 'Selecciona Agencia y Segmento arriba'}
                className="px-4 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm flex items-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                Confirmar e Importar Rutas
              </button>
            </div>
          </div>

          {clientesSheetNames.length > 0 && (
            <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-1.5 text-xs shrink-0">
                <Users className="w-3.5 h-3.5 text-blue-600" />
                <label htmlFor="clientesSheetSelect" className="text-blue-800 font-semibold">
                  Detalle de Clientes (opcional):
                </label>
                <select
                  id="clientesSheetSelect"
                  value={selectedClientesSheet}
                  onChange={(e) => handleClientesSheetChange(e.target.value)}
                  className="bg-white border border-blue-300 rounded text-xs py-1 px-1.5 font-medium cursor-pointer"
                >
                  <option value="">— No importar clientes —</option>
                  {clientesSheetNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedClientesSheet && clientesSummary && (
                <div className="text-[11px] text-blue-800 font-medium">
                  {clientesSummary.totalClientes} cliente(s) listos para {clientesSummary.matchedRoutes} de{' '}
                  {previewRoutes.length} ruta(s) de esta hoja.
                  {clientesSummary.unmatchedRutas.length > 0 && (
                    <span className="text-amber-700">
                      {' '}
                      · {clientesSummary.unmatchedRutas.length} ruta(s) del detalle de clientes no aparecen en "
                      {selectedSheet}" ({clientesSummary.unmatchedRutas.slice(0, 8).join(', ')}
                      {clientesSummary.unmatchedRutas.length > 8 ? '…' : ''})
                    </span>
                  )}
                </div>
              )}
              {selectedClientesSheet && !clientesSummary && (
                <div className="text-[11px] text-blue-700">No se detectaron clientes válidos en esta pestaña.</div>
              )}
            </div>
          )}

          {importReport && importReport.discarded > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>
                  Se leyeron {importReport.totalRows} filas con datos: {importReport.imported} se importaron y{' '}
                  {importReport.discarded} se descartaron.
                </span>
              </div>
              <ul className="list-disc list-inside text-[11px] text-amber-800 space-y-0.5">
                {importReport.discardedReasons.map((r) => (
                  <li key={r.reason}>
                    {r.count} fila(s): {r.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-72 overflow-y-auto">
            <table className="min-w-full text-xs text-left divide-y divide-slate-200 whitespace-nowrap">
              <thead className="bg-slate-100 text-slate-700 uppercase font-semibold sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">Agencia</th>
                  <th className="py-2.5 px-3">Segmento</th>
                  <th className="py-2.5 px-3">Fecha</th>
                  <th className="py-2.5 px-3">ID de Ruta</th>
                  {clientesByNormRuta && <th className="py-2.5 px-2 text-center">Clientes</th>}
                  <th className="py-2.5 px-2 text-center">Viaje</th>
                  <th className="py-2.5 px-2 text-center">Servicio</th>
                  <th className="py-2.5 px-2 text-center">Descanso</th>
                  <th className="py-2.5 px-2 text-center font-bold">Total</th>
                  <th className="py-2.5 px-3 text-right">Distancia</th>
                  <th className="py-2.5 px-3 text-center">Paradas</th>
                  <th className="py-2.5 px-3 text-center">Equipo Frío</th>
                  <th className="py-2.5 px-3 text-right">% Capacidad</th>
                  <th className="py-2.5 px-3 text-right">Cajas 12 Oz</th>
                  <th className="py-2.5 px-3 text-right">Peso</th>
                  <th className="py-2.5 px-3 text-right font-bold text-blue-700">Cajas Físicas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white font-mono">
                {previewRoutes.map((r, idx) => {
                  // Ya existe una ruta vigente con el mismo número, fecha y agencia destino.
                  const isDuplicate =
                    !!effectiveAgencia &&
                    existingRoutes.some(
                      (ex) =>
                        ex.estado !== 'Liquidada' &&
                        getRouteKey(ex) === getRouteKey({ id: r.id, fecha: r.fecha, agencia: effectiveAgencia })
                    );
                  const clienteCount = clientesByNormRuta?.get(normRuta(r.id))?.length || 0;
                  return (
                    <tr
                      key={`${r.id}-${idx}`}
                      className={isDuplicate ? 'bg-amber-50/80 hover:bg-amber-100/70' : 'hover:bg-slate-50'}
                    >
                      <td className="py-2 px-3 font-sans font-medium text-slate-800">
                        {effectiveAgencia || <span className="text-amber-600">Sin seleccionar</span>}
                      </td>
                      <td className="py-2 px-3 font-sans text-slate-700">
                        {targetSegmento || <span className="text-amber-600">Sin seleccionar</span>}
                      </td>
                      <td className="py-2 px-3 font-sans text-slate-700 whitespace-nowrap">
                        {formatDateToGuatemala(r.fecha) || r.fecha}
                      </td>
                      <td className="py-2 px-3 font-bold text-slate-900 font-mono">
                        {r.id}{' '}
                        {isDuplicate && (
                          <span className="ml-1 text-[9px] bg-amber-200 text-amber-900 px-1 py-0.5 rounded font-sans">
                            En cola
                          </span>
                        )}
                      </td>
                      {clientesByNormRuta && (
                        <td className="py-2 px-2 text-center">
                          {clienteCount > 0 ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-sans">
                              <Users className="w-2.5 h-2.5" /> {clienteCount}
                            </span>
                          ) : (
                            <span className="text-slate-300">–</span>
                          )}
                        </td>
                      )}
                      <td className="py-2 px-2 text-center text-slate-600">{r.viaje || '-'}</td>
                      <td className="py-2 px-2 text-center text-slate-600">{r.servicio || '-'}</td>
                      <td className="py-2 px-2 text-center text-slate-600">{r.descanso || '-'}</td>
                      <td className="py-2 px-2 text-center font-bold text-slate-900">{r.total || '-'}</td>
                      <td className="py-2 px-3 text-right">{r.distancia}</td>
                      <td className="py-2 px-3 text-center font-bold">{r.paradas}</td>
                      <td className="py-2 px-3 text-center text-cyan-700 font-semibold">{r.equipoFrio}</td>
                      <td className="py-2 px-3 text-right font-medium text-indigo-700">{r.capacidadPorc}</td>
                      <td className="py-2 px-3 text-right text-slate-700">{r.cajas12Oz}</td>
                      <td className="py-2 px-3 text-right text-slate-700">{r.pesoKg}</td>
                      <td className="py-2 px-3 text-right font-bold text-blue-700">{r.cajasFisicas}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
