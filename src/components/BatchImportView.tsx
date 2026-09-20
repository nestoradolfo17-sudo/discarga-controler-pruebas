import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Route } from '../types';
import { downloadExcelTemplate, scoreSheetForRoutes, parseRoutesFromSheet, ImportReport } from '../utils/excel';
import { formatDateToGuatemala } from '../utils/date';
import { FileSpreadsheet, Download, UploadCloud, CheckCircle, X, Layers, AlertCircle } from 'lucide-react';

interface BatchImportViewProps {
  existingRoutes: Route[];
  onCommitRoutes: (newRoutes: Route[]) => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const BatchImportView: React.FC<BatchImportViewProps> = ({
  existingRoutes,
  onCommitRoutes,
  onShowToast,
}) => {
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

        // Find best sheet
        let bestSheetName = wb.SheetNames[0];
        let bestScore = -1;

        for (const sName of wb.SheetNames) {
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

    const parsed = parseRoutesFromSheet(ws);
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

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    if (workbook) {
      parseAndSetRoutes(workbook, sheetName);
    }
  };

  const handleCancelPreview = () => {
    setPreviewRoutes([]);
    setImportReport(null);
    setWorkbook(null);
    setSheetNames([]);
    setSelectedSheet('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCommit = () => {
    if (previewRoutes.length === 0) {
      onShowToast('No hay rutas para importar', 'error');
      return;
    }
    onCommitRoutes(previewRoutes);
    handleCancelPreview();
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
            Sube tu archivo de rutas para crearlas en estado <strong>Pendiente</strong>. Se conservará la cola de rutas no asignadas o no liquidadas.
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
          Formato compatible: <strong>Agencia | Fecha | ID de ruta | Viaje | Servicio | Descanso | Total | Distancia | Paradas | Equipo Frio | % de capacidad | Cajas 12 Oz | Peso | Cajas Fisicas</strong>
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
              {sheetNames.length > 1 && (
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
                    {sheetNames.map((name) => (
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
                className="px-4 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm flex items-center cursor-pointer"
              >
                <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                Confirmar e Importar Rutas
              </button>
            </div>
          </div>

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
                  <th className="py-2.5 px-3">Fecha</th>
                  <th className="py-2.5 px-3">ID de Ruta</th>
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
                  const isDuplicate = existingRoutes.some(
                    (ex) => String(ex.id) === String(r.id) && ex.estado !== 'Liquidada'
                  );
                  return (
                    <tr
                      key={`${r.id}-${idx}`}
                      className={isDuplicate ? 'bg-amber-50/80 hover:bg-amber-100/70' : 'hover:bg-slate-50'}
                    >
                      <td className="py-2 px-3 font-sans font-medium text-slate-800">{r.agencia}</td>
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
