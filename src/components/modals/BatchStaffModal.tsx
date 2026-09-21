import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Staff } from '../../types';
import { downloadStaffExcelTemplate, parseStaffFromSheet, ImportReport } from '../../utils/excel';
import { X, UploadCloud, FileSpreadsheet, Download, CheckCircle, AlertCircle } from 'lucide-react';

interface BatchStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingStaff: Staff[];
  defaultAgencia?: string;
  onCommitStaff: (importedStaff: Staff[]) => void;
  onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const BatchStaffModal: React.FC<BatchStaffModalProps> = ({
  isOpen,
  onClose,
  existingStaff,
  defaultAgencia,
  onCommitStaff,
  onShowToast,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [previewStaff, setPreviewStaff] = useState<Staff[]>([]);
  // Corrección: se guarda el reporte de la carga (filas leídas/importadas/
  // descartadas y sus motivos) para mostrarlo al usuario — antes se descartaban
  // filas sin nombre en silencio y "Total de filas procesadas" solo mostraba la
  // cantidad importada, dando a entender que se había leído el archivo completo.
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

        // Try to pick sheet named "Personal" or first sheet
        const personalSheet = wb.SheetNames.find((s) => /personal|staff|colaborador/i.test(s)) || wb.SheetNames[0];
        setSelectedSheet(personalSheet);
        parseAndSetStaff(wb, personalSheet);
      } catch (err) {
        console.error('Error procesando Excel de personal:', err);
        onShowToast?.('Error al leer el archivo Excel.', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const parseAndSetStaff = (wb: XLSX.WorkBook, sheetName: string) => {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) {
      onShowToast?.(`La pestaña "${sheetName}" está vacía`, 'error');
      setPreviewStaff([]);
      return;
    }

    const parsed = parseStaffFromSheet(ws, defaultAgencia);
    if (parsed.length === 0) {
      onShowToast?.(`No se encontraron registros de colaboradores en "${sheetName}". Verifica que tenga la columna Nombre.`, 'error');
      setPreviewStaff([]);
      setImportReport(parsed.importReport || null);
      return;
    }

    setPreviewStaff(parsed);
    setImportReport(parsed.importReport || null);
    const discardedMsg = parsed.importReport?.discarded ? ` (${parsed.importReport.discarded} fila(s) descartada(s), ver detalle)` : '';
    onShowToast?.(`Se extrajeron ${parsed.length} colaboradores de la hoja "${sheetName}"${discardedMsg}`, 'success');
  };

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    if (workbook) {
      parseAndSetStaff(workbook, sheetName);
    }
  };

  const handleReset = () => {
    setPreviewStaff([]);
    setImportReport(null);
    setWorkbook(null);
    setSheetNames([]);
    setSelectedSheet('');
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirm = () => {
    if (previewStaff.length === 0) return;
    onCommitStaff(previewStaff);
    handleReset();
    onClose();
  };

  // Stats
  // Corrección: la carga masiva ya NO sobrescribe colaboradores existentes — las
  // filas que coinciden con un colaborador ya cargado se omiten por completo (solo
  // se agregan los realmente nuevos). Este contador ahora refleja cuántas filas se
  // omitirán.
  const newStaffCount = previewStaff.filter(
    (p) =>
      !existingStaff.some(
        (e) =>
          (e.dpi !== 'N/A' && e.dpi && p.dpi !== 'N/A' && p.dpi && e.dpi.trim() === p.dpi.trim()) ||
          e.nombre.trim().toLowerCase() === p.nombre.trim().toLowerCase()
      )
  ).length;
  const skippedStaffCount = previewStaff.length - newStaffCount;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">Carga Masiva de Personal (Excel)</h3>
              <p className="text-xs text-slate-500">
                Importa colaboradores en lote manteniendo las columnas: DPI, Código, Nombre Completo, Agencia, Puesto, Código Corto y Estatus
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
          {previewStaff.length === 0 ? (
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
                    ? 'border-emerald-500 bg-emerald-50/50 scale-[0.99]'
                    : 'border-slate-300 hover:border-emerald-400 hover:bg-slate-50/80 bg-slate-50/30'
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
                <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-emerald-100/80 text-emerald-600 flex items-center justify-center shadow-inner">
                  <UploadCloud className="w-7 h-7" />
                </div>
                <h4 className="font-bold text-slate-800 text-sm mb-1">
                  Arrastra tu archivo Excel aquí o haz clic para seleccionarlo
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mb-3">
                  Formatos compatibles: <span className="font-semibold text-slate-700">.xlsx, .xls o .csv</span>
                </p>
                <span className="inline-flex items-center text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
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
                    <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-700">DPI</span>
                    <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-700">Código</span>
                    <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-700">Nombre Completo</span>
                    <span className="px-2 py-0.5 bg-white border border-blue-200 rounded text-blue-700 bg-blue-50">Agencia</span>
                    <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-700">Puesto (VPP, VPPB, APP)</span>
                    <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-700">Código Corto</span>
                    <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-700">Estatus (ALTA/BAJA)</span>
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
                  onClick={downloadStaffExcelTemplate}
                  className="inline-flex items-center px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-lg border border-slate-300 shadow-2xs transition cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
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
                      className="text-xs font-semibold border border-slate-300 bg-white rounded-md px-2 py-1 outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
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
                  <span className="inline-flex items-center px-2 py-0.5 rounded font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    {previewStaff.length} en total
                  </span>
                  {newStaffCount > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                      {newStaffCount} nuevos
                    </span>
                  )}
                  {skippedStaffCount > 0 && (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded font-semibold bg-amber-50 text-amber-800 border border-amber-200"
                      title="Estos colaboradores ya existen en el sistema (coinciden por DPI o Nombre) y no se modificarán: la carga masiva solo agrega colaboradores nuevos."
                    >
                      {skippedStaffCount} ya existen (se omitirán)
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

              {/* Table Preview maintaining exactly the 6 columns: DPI, Código, Nombre Completo, Puesto, Código Corto, Estatus */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="max-h-72 overflow-y-auto">
                  <table className="min-w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-600 font-bold uppercase sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">DPI</th>
                        <th className="py-2.5 px-3">Código</th>
                        <th className="py-2.5 px-3">Nombre Completo</th>
                        <th className="py-2.5 px-3">Agencia</th>
                        <th className="py-2.5 px-3">Puesto</th>
                        <th className="py-2.5 px-3">Código Corto</th>
                        <th className="py-2.5 px-3">Estatus</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewStaff.map((s, idx) => {
                        let puestoBadge = 'bg-slate-100 text-slate-700';
                        if (s.puesto === 'VPP') puestoBadge = 'bg-indigo-100 text-indigo-800 border border-indigo-200';
                        else if (s.puesto === 'VPPB') puestoBadge = 'bg-blue-100 text-blue-800 border border-blue-200';
                        else if (s.puesto === 'APP') puestoBadge = 'bg-amber-100 text-amber-800 border border-amber-200';

                        return (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="py-2 px-3 font-mono text-slate-700 font-semibold text-[11px]">
                              {s.dpi || '-'}
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-600 text-[11px]">
                              {s.codigo || '-'}
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-800">
                              {s.nombre}
                            </td>
                            <td className="py-2 px-3 text-slate-600">
                              {s.agencia || (
                                <span className="text-amber-600 italic">Sin Agencia</span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              <span className={`${puestoBadge} px-2 py-0.5 rounded text-[10px] font-bold font-mono`}>
                                {s.puesto}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-600 text-[11px]">
                              {s.codigoCorto || '-'}
                            </td>
                            <td className="py-2 px-3">
                              {s.estatus === 'BAJA' ? (
                                <span className="text-[10px] bg-rose-100 text-rose-800 font-bold px-1.5 py-0.5 rounded border border-rose-200">
                                  BAJA
                                </span>
                              ) : (
                                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded border border-emerald-200">
                                  ALTA
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
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
                      Total de filas procesadas: <strong className="text-slate-700">{previewStaff.length}</strong>
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
            {previewStaff.length > 0 && (
              <button
                type="button"
                id="btn-confirmar-importacion-personal"
                onClick={handleConfirm}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition cursor-pointer flex items-center"
              >
                <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                {skippedStaffCount > 0
                  ? `Agregar ${newStaffCount} Colaboradores Nuevos (${skippedStaffCount} se omitirán)`
                  : `Cargar ${previewStaff.length} Colaboradores al Sistema`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
