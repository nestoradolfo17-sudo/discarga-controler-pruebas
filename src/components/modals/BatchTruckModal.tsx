import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Truck } from '../../types';
import { downloadTruckExcelTemplate, parseTrucksFromSheet, ImportReport } from '../../utils/excel';
import { X, UploadCloud, FileSpreadsheet, Download, CheckCircle, AlertCircle } from 'lucide-react';

interface BatchTruckModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingTrucks: Truck[];
  defaultAgencia?: string;
  onCommitTrucks: (importedTrucks: Truck[]) => void;
  onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const BatchTruckModal: React.FC<BatchTruckModalProps> = ({
  isOpen,
  onClose,
  existingTrucks,
  defaultAgencia,
  onCommitTrucks,
  onShowToast,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [previewTrucks, setPreviewTrucks] = useState<Truck[]>([]);
  // Corrección: reporte de la carga (filas leídas/importadas/descartadas y sus
  // motivos), antes descartado en silencio sin ningún aviso al usuario.
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFile = (file: File) => {
    if (!file) return;
    setFileName(file.name);
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
          onShowToast?.('El archivo no contiene hojas de cálculo válidas.', 'error');
          return;
        }

        setWorkbook(wb);
        setSheetNames(wb.SheetNames);

        // Try to pick sheet named "Camiones", "Flota", "Vehiculos" or first sheet
        const truckSheet = wb.SheetNames.find((s) => /camion|flota|vehiculo|truck/i.test(s)) || wb.SheetNames[0];
        setSelectedSheet(truckSheet);
        parseAndSetTrucks(wb, truckSheet);
      } catch (err) {
        console.error('Error procesando Excel de camiones:', err);
        onShowToast?.('Error al leer el archivo Excel.', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const parseAndSetTrucks = (wb: XLSX.WorkBook, sheetName: string) => {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) {
      onShowToast?.(`La pestaña "${sheetName}" está vacía`, 'error');
      setPreviewTrucks([]);
      return;
    }

    const parsed = parseTrucksFromSheet(ws, defaultAgencia);
    if (parsed.length === 0) {
      onShowToast?.(`No se encontraron unidades en "${sheetName}". Verifica que tenga la columna Placa / Código.`, 'error');
      setPreviewTrucks([]);
      setImportReport(parsed.importReport || null);
      return;
    }

    setPreviewTrucks(parsed);
    setImportReport(parsed.importReport || null);
    const discardedMsg = parsed.importReport?.discarded ? ` (${parsed.importReport.discarded} fila(s) descartada(s), ver detalle)` : '';
    onShowToast?.(`Se extrajeron ${parsed.length} camiones de la hoja "${sheetName}"${discardedMsg}`, 'success');
  };

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    if (workbook) {
      parseAndSetTrucks(workbook, sheetName);
    }
  };

  const handleReset = () => {
    setPreviewTrucks([]);
    setImportReport(null);
    setWorkbook(null);
    setSheetNames([]);
    setSelectedSheet('');
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirm = () => {
    if (previewTrucks.length === 0) return;
    onCommitTrucks(previewTrucks);
    handleReset();
    onClose();
  };

  // Stats
  // Corrección: la carga masiva ya NO sobrescribe camiones existentes — las filas
  // que coinciden con un camión ya cargado se omiten por completo (solo se agregan
  // los realmente nuevos). Este contador ahora refleja cuántas filas se omitirán.
  const cleanKey = (val: string) => val.replace(/[\s\-_()]/g, '').toUpperCase();
  const newTrucksCount = previewTrucks.filter(
    (p) => !existingTrucks.some((e) => cleanKey(e.placa) === cleanKey(p.placa))
  ).length;
  const skippedTrucksCount = previewTrucks.length - newTrucksCount;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">Carga Masiva de Camiones (Excel)</h3>
              <p className="text-xs text-slate-500">
                Importa unidades vehiculares manteniendo las columnas: ID Camión, Placa, Agencia, Estatus, TON, Bahías y Capacidad
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              handleReset();
              onClose();
            }}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {previewTrucks.length === 0 ? (
            <div className="space-y-4">
              {/* Drag and Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files[0];
                  if (file) handleFile(file);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50/50 scale-[0.99]'
                    : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50/80 bg-slate-50/30'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
                <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-blue-100/80 text-blue-600 flex items-center justify-center shadow-inner">
                  <UploadCloud className="w-7 h-7" />
                </div>
                <h4 className="font-bold text-slate-800 text-sm mb-1">
                  Arrastra tu archivo Excel aquí o haz clic para seleccionarlo
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mb-3">
                  Formatos compatibles: <span className="font-semibold text-slate-700">.xlsx, .xls o .csv</span>
                </p>
                <span className="inline-flex items-center text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1 rounded-lg">
                  Examinar archivos
                </span>
              </div>

              {/* Template Download & Column Structure Guidance */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-bold text-slate-800 flex items-center gap-1.5 mb-1">
                    <span>Estructura de Columnas esperada:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px] font-mono font-semibold">
                    <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-700">ID Camión</span>
                    <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-700">Placa</span>
                    <span className="px-2 py-0.5 bg-white border border-blue-200 rounded text-blue-700 bg-blue-50">Agencia</span>
                    <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-700">Estatus</span>
                    <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-700">TON</span>
                    <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-700">Bahías</span>
                    <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-700">Capacidad</span>
                  </div>
                  {defaultAgencia && (
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      Si el archivo no incluye la columna Agencia, se asignará por defecto:{' '}
                      <strong className="text-slate-600">{defaultAgencia}</strong>
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={downloadTruckExcelTemplate}
                  className="inline-flex items-center px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-lg border border-slate-300 shadow-2xs transition cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                  Descargar Plantilla Excel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Sheet Selector and Stats */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">Hoja del archivo:</span>
                  {sheetNames.length > 1 ? (
                    <select
                      value={selectedSheet}
                      onChange={(e) => handleSheetChange(e.target.value)}
                      className="text-xs font-semibold border border-slate-300 bg-white rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                    >
                      {sheetNames.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {selectedSheet}
                    </span>
                  )}
                  {fileName && (
                    <span className="text-[11px] text-slate-500 font-medium truncate max-w-xs">
                      ({fileName})
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="inline-flex items-center px-2 py-0.5 rounded font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    {previewTrucks.length} en total
                  </span>
                  {newTrucksCount > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {newTrucksCount} nuevos
                    </span>
                  )}
                  {skippedTrucksCount > 0 && (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded font-semibold bg-amber-50 text-amber-800 border border-amber-200"
                      title="Estos camiones ya existen en el sistema (coinciden por Placa o ID Camión) y no se modificarán: la carga masiva solo agrega camiones nuevos."
                    >
                      {skippedTrucksCount} ya existen (se omitirán)
                    </span>
                  )}
                </div>
              </div>

              {/* Corrección: reporte de filas descartadas durante la lectura del Excel
                  (antes se descartaban en silencio, sin ningún aviso). */}
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

              {/* Table Preview maintaining exactly the 6 columns: ID Camión, Placa, Estatus, TON, Bahías, Capacidad */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="max-h-72 overflow-y-auto">
                  <table className="min-w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-600 font-bold uppercase sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">ID Camión</th>
                        <th className="py-2.5 px-3">Placa</th>
                        <th className="py-2.5 px-3">Agencia</th>
                        <th className="py-2.5 px-3">Estatus</th>
                        <th className="py-2.5 px-3">TON</th>
                        <th className="py-2.5 px-3">Bahías</th>
                        <th className="py-2.5 px-3">Capacidad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewTrucks.map((t, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2 px-3 font-mono text-slate-600">
                            {t.idCamion || '-'}
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-slate-800">
                            {t.placa}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {t.agencia || (
                              <span className="text-amber-600 italic">Sin Agencia</span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            {t.estado === 'Baja' ? (
                              <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-1.5 py-0.5 rounded border border-rose-200">
                                Baja
                              </span>
                            ) : t.estado === 'En Ruta' ? (
                              <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded border border-blue-200">
                                En Ruta
                              </span>
                            ) : (
                              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded border border-emerald-200">
                                Disponible
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {t.ton ?? '-'}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {t.bahias ?? '-'}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            {t.capacidad}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-slate-600 hover:text-slate-900 underline cursor-pointer"
                >
                  Cargar otro archivo diferente
                </button>
                <div className="text-[11px] text-slate-400">
                  {importReport ? (
                    <>
                      Filas leídas: <strong className="text-slate-700">{importReport.totalRows}</strong> · Importadas:{' '}
                      <strong className="text-slate-700">{importReport.imported}</strong>
                      {importReport.discarded > 0 && (
                        <>
                          {' '}
                          · Descartadas: <strong className="text-amber-700">{importReport.discarded}</strong>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      Total de unidades procesadas: <strong className="text-slate-700">{previewTrucks.length}</strong>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-slate-50/70">
          <button
            type="button"
            onClick={() => {
              handleReset();
              onClose();
            }}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition cursor-pointer"
          >
            Cancelar
          </button>

          <div className="flex items-center gap-2">
            {previewTrucks.length > 0 && (
              <button
                type="button"
                id="btn-confirmar-importacion-camiones"
                onClick={handleConfirm}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition cursor-pointer flex items-center"
              >
                <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                {skippedTrucksCount > 0
                  ? `Agregar ${newTrucksCount} Camiones Nuevos (${skippedTrucksCount} se omitirán)`
                  : `Cargar ${previewTrucks.length} Camiones al Sistema`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
