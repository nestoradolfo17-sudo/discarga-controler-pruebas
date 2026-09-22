import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Route, RouteClientEntry } from '../types';
import {
  parseClientesFromSheet,
  groupClientesByRuta,
  extractDayNumberFromSheetName,
  isClientesSheetName,
} from '../utils/excel';
import { formatDateToGuatemala } from '../utils/date';
import { getRouteKey } from '../utils/routeKey';
import { Users, UploadCloud, CheckCircle, X, AlertCircle, Calendar } from 'lucide-react';

interface ClientesImportViewProps {
  // Rutas donde se pueden emparejar los clientes: el tablero activo y el
  // histórico de liquidadas. No se crean rutas nuevas con esta carga — solo se
  // agrega/actualiza la lista de clientes de referencia de una ruta que YA
  // exista en alguno de los dos.
  routes: Route[];
  historicalRoutes: Route[];
  onCommitClientesRuta: (updates: { routeKey: string; clientesRuta: RouteClientEntry[] }[]) => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

interface DayResult {
  day: number;
  sheetName: string;
  fecha: string; // DD/MM/YYYY
  totalRutas: number;
  totalClientes: number;
  matched: { routeKey: string; clientesRuta: RouteClientEntry[] }[];
  unmatchedRutas: string[]; // rutas de esta hoja que no existen en el sistema para esa fecha
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export const ClientesImportView: React.FC<ClientesImportViewProps> = ({
  routes,
  historicalRoutes,
  onCommitClientesRuta,
  onShowToast,
}) => {
  const now = new Date();
  const [mes, setMes] = useState<number>(now.getMonth() + 1);
  const [anio, setAnio] = useState<number>(now.getFullYear());
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [dayResults, setDayResults] = useState<DayResult[] | null>(null);
  const [skippedSheets, setSkippedSheets] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingKeySet = React.useMemo(() => {
    const set = new Set<string>();
    routes.forEach((r) => set.add(getRouteKey(r)));
    historicalRoutes.forEach((r) => set.add(getRouteKey(r)));
    return set;
  }, [routes, historicalRoutes]);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: true, cellNF: true, cellText: true });

        if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
          onShowToast('El archivo no contiene hojas válidas', 'error');
          return;
        }

        const results: DayResult[] = [];
        const skipped: string[] = [];

        wb.SheetNames.forEach((sheetName) => {
          if (!isClientesSheetName(sheetName)) return; // ignora "Resumen N", "Hoja1", etc.

          const day = extractDayNumberFromSheetName(sheetName);
          if (day === null) {
            skipped.push(`${sheetName} (no se pudo determinar el día)`);
            return;
          }

          const ws = wb.Sheets[sheetName];
          if (!ws || !ws['!ref']) {
            skipped.push(`${sheetName} (hoja vacía)`);
            return;
          }

          const parsed = parseClientesFromSheet(ws);
          if (parsed.length === 0) {
            skipped.push(`${sheetName} (no se detectaron clientes con el formato esperado)`);
            return;
          }

          const fecha = formatDateToGuatemala(new Date(anio, mes - 1, day, 12));
          const byRuta = groupClientesByRuta(parsed);

          const matched: { routeKey: string; clientesRuta: RouteClientEntry[] }[] = [];
          const unmatchedRutas: string[] = [];
          let totalClientes = 0;

          byRuta.forEach((clientesRuta, ruta) => {
            totalClientes += clientesRuta.length;
            const routeKey = `${ruta}__${fecha}`;
            if (existingKeySet.has(routeKey)) {
              matched.push({ routeKey, clientesRuta });
            } else {
              unmatchedRutas.push(ruta);
            }
          });

          results.push({
            day,
            sheetName,
            fecha,
            totalRutas: byRuta.size,
            totalClientes,
            matched,
            unmatchedRutas: unmatchedRutas.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
          });
        });

        results.sort((a, b) => a.day - b.day);

        if (results.length === 0) {
          onShowToast('No se encontraron pestañas de tipo "Clientes N" en el archivo.', 'error');
          setDayResults(null);
          return;
        }

        setFileName(file.name);
        setDayResults(results);
        setSkippedSheets(skipped);
      } catch (err) {
        console.error('Error procesando archivo Excel de clientes:', err);
        onShowToast('Error al leer el archivo Excel.', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleCancel = () => {
    setDayResults(null);
    setSkippedSheets([]);
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const totals = React.useMemo(() => {
    if (!dayResults) return null;
    const totalMatched = dayResults.reduce((acc, d) => acc + d.matched.length, 0);
    const totalUnmatched = dayResults.reduce((acc, d) => acc + d.unmatchedRutas.length, 0);
    const totalClientes = dayResults.reduce(
      (acc, d) => acc + d.matched.reduce((a2, m) => a2 + m.clientesRuta.length, 0),
      0
    );
    return { totalMatched, totalUnmatched, totalClientes };
  }, [dayResults]);

  const handleCommit = () => {
    if (!dayResults || !totals) return;
    const allMatched = dayResults.flatMap((d) => d.matched);
    if (allMatched.length === 0) {
      onShowToast('Ninguna ruta del archivo coincide con rutas existentes en el sistema para esas fechas.', 'error');
      return;
    }
    onCommitClientesRuta(allMatched);
    onShowToast(
      `Se agregó el detalle de clientes a ${allMatched.length} ruta(s) (${totals.totalClientes} clientes en total).` +
        (totals.totalUnmatched > 0
          ? ` ${totals.totalUnmatched} ruta(s) del archivo no se encontraron en el sistema para esa fecha y se omitieron.`
          : ''),
      totals.totalUnmatched > 0 ? 'info' : 'success'
    );
    handleCancel();
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
      <div className="border-b border-slate-100 pb-4">
        <h3 className="font-bold text-slate-800 text-base flex items-center">
          <Users className="w-5 h-5 mr-2 text-blue-600" />
          Detalle de Clientes por Ruta (archivo del cliente)
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Sube el archivo con las pestañas <strong>"Clientes N"</strong> (N = día del mes) que envía el cliente. Se
          agrega la lista de clientes de cada ruta que ya exista en el sistema para esa fecha — de solo consulta,
          no crea rutas nuevas ni cambia cajas, paradas ni liquidaciones.
        </p>
      </div>

      {!dayResults && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div className="sm:col-span-2">
              <label htmlFor="clientesMes" className="block font-semibold text-slate-600 mb-1 flex items-center">
                <Calendar className="w-3.5 h-3.5 mr-1 text-slate-400" />
                Mes del archivo:
              </label>
              <select
                id="clientesMes"
                value={mes}
                onChange={(e) => setMes(parseInt(e.target.value))}
                className="w-full p-2 bg-white border border-slate-300 rounded-lg font-medium cursor-pointer outline-none"
              >
                {MESES.map((m, idx) => (
                  <option key={m} value={idx + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="clientesAnio" className="block font-semibold text-slate-600 mb-1">
                Año del archivo:
              </label>
              <input
                id="clientesAnio"
                type="number"
                value={anio}
                onChange={(e) => setAnio(parseInt(e.target.value) || now.getFullYear())}
                className="w-full p-2 bg-white border border-slate-300 rounded-lg font-medium outline-none"
              />
            </div>
          </div>

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
              accept=".xlsx, .xls"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFile(e.target.files[0]);
                }
              }}
              className="hidden"
            />
            <div className="w-14 h-14 bg-blue-100 text-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
              <UploadCloud className="w-7 h-7" />
            </div>
            <h4 className="font-bold text-slate-800 text-sm">
              Haz clic para seleccionar o arrastra el archivo Excel del cliente aquí
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              Se leerán automáticamente todas las pestañas "Clientes N" que traiga el archivo, usando el mes y año
              seleccionados arriba junto con el número de cada pestaña para calcular la fecha de cada ruta.
            </p>
          </div>
        </>
      )}

      {dayResults && totals && (
        <div className="space-y-3 pt-1">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              <h4 className="font-bold text-xs text-slate-800">
                Vista Previa — {dayResults.length} día(s) detectado(s) en "{fileName}"
              </h4>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-300 rounded-lg flex items-center cursor-pointer"
              >
                <X className="w-3 h-3 mr-1" />
                Cancelar
              </button>
              <button
                onClick={handleCommit}
                className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm flex items-center cursor-pointer"
              >
                <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                Confirmar e Importar Clientes
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
              <span className="text-emerald-700 font-semibold uppercase tracking-wider text-[10px]">
                Rutas que se actualizarán
              </span>
              <div className="text-xl font-extrabold text-emerald-700 mt-0.5">{totals.totalMatched}</div>
            </div>
            <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
              <span className="text-blue-700 font-semibold uppercase tracking-wider text-[10px]">
                Clientes en total
              </span>
              <div className="text-xl font-extrabold text-blue-700 mt-0.5">{totals.totalClientes}</div>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
              <span className="text-amber-700 font-semibold uppercase tracking-wider text-[10px]">
                Rutas del archivo sin coincidencia
              </span>
              <div className="text-xl font-extrabold text-amber-700 mt-0.5">{totals.totalUnmatched}</div>
            </div>
          </div>

          {totals.totalUnmatched > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>
                  {totals.totalUnmatched} ruta(s) del archivo no existen en el sistema para su fecha (revisa que el
                  mes/año elegido sea el correcto) y no se les podrá agregar el detalle de clientes:
                </span>
              </div>
              <div className="max-h-28 overflow-y-auto text-[11px] space-y-1">
                {dayResults
                  .filter((d) => d.unmatchedRutas.length > 0)
                  .map((d) => (
                    <div key={d.sheetName}>
                      <strong>{d.fecha}</strong> ({d.sheetName}): {d.unmatchedRutas.slice(0, 15).join(', ')}
                      {d.unmatchedRutas.length > 15 ? ` … (+${d.unmatchedRutas.length - 15} más)` : ''}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {skippedSheets.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600">
              <strong>Pestañas ignoradas:</strong> {skippedSheets.join(' · ')}
            </div>
          )}

          <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-72 overflow-y-auto">
            <table className="min-w-full text-xs text-left divide-y divide-slate-200 whitespace-nowrap">
              <thead className="bg-slate-100 text-slate-700 uppercase font-semibold sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">Pestaña</th>
                  <th className="py-2.5 px-3">Fecha calculada</th>
                  <th className="py-2.5 px-3 text-center">Rutas en el archivo</th>
                  <th className="py-2.5 px-3 text-center">Coinciden en el sistema</th>
                  <th className="py-2.5 px-3 text-center">Clientes totales</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white font-mono">
                {dayResults.map((d) => (
                  <tr key={d.sheetName} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-sans font-medium text-slate-800">{d.sheetName}</td>
                    <td className="py-2 px-3 font-sans text-slate-700">{d.fecha}</td>
                    <td className="py-2 px-3 text-center">{d.totalRutas}</td>
                    <td className="py-2 px-3 text-center text-emerald-700 font-bold">{d.matched.length}</td>
                    <td className="py-2 px-3 text-center text-blue-700 font-bold">{d.totalClientes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
