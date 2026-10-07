import React, { useMemo, useRef, useState } from 'react';
import { ShieldAlert, Download, UploadCloud, CheckCircle, AlertTriangle, AlertCircle, X, FileSpreadsheet } from 'lucide-react';
import { ContParsed, ContPlan, ContResultado, parseContingenciaWorkbook } from '../utils/contingencia';
import { loadXLSX } from '../utils/excel';

// --- Carga de Contingencia (solo ADMINISTRADORES) ---
// Sube los formatos de Excel de contingencia (Asignación y/o Liquidación) que
// se llenaron mientras la app no estuvo disponible. Primero muestra una
// revisión fila por fila (no guarda nada); al confirmar, aplica solo las filas
// válidas con las mismas reglas de Asignar y Liquidar.

interface Props {
  onPreview: (parsed: ContParsed) => ContPlan;
  onApply: (parsed: ContParsed) => ContPlan;
  onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

type Filtro = 'todos' | 'error' | 'aviso' | 'ok';

const PLANTILLAS = [
  { href: '/plantillas/Contingencia_Asignacion.xlsx', label: 'Formato de Asignación' },
  { href: '/plantillas/Contingencia_Liquidacion.xlsx', label: 'Formato de Liquidación' },
];

const estadoChip: Record<ContResultado['estado'], string> = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  aviso: 'bg-amber-50 text-amber-800 border-amber-200',
  error: 'bg-rose-50 text-rose-700 border-rose-200',
};
const estadoTxt: Record<ContResultado['estado'], string> = { ok: 'Lista', aviso: 'Aviso', error: 'Error' };

export const ContingenciaImportView: React.FC<Props> = ({ onPreview, onApply, onShowToast }) => {
  const [archivos, setArchivos] = useState<string[]>([]);
  const [parsed, setParsed] = useState<ContParsed | null>(null);
  const [plan, setPlan] = useState<ContPlan | null>(null);
  const [aplicado, setAplicado] = useState<ContPlan | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [confirmar, setConfirmar] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const limpiar = () => {
    setArchivos([]);
    setParsed(null);
    setPlan(null);
    setConfirmar(false);
    setFiltro('todos');
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setLeyendo(true);
    setAplicado(null);
    setConfirmar(false);
    try {
      const XLSX = await loadXLSX();
      const total: ContParsed = { asignaciones: [], liquidaciones: [], resultados: [] };
      const nombres: string[] = [];
      for (const f of Array.from(files)) {
        const buf = new Uint8Array(await f.arrayBuffer());
        // cellDates: false → fechas y horas llegan como número de Excel y se
        // convierten sin desfases de zona horaria (ver utils/contingencia).
        const wb = XLSX.read(buf, { type: 'array', cellDates: false });
        const p = parseContingenciaWorkbook(XLSX, wb, f.name);
        total.asignaciones.push(...p.asignaciones);
        total.liquidaciones.push(...p.liquidaciones);
        total.resultados.push(...p.resultados);
        nombres.push(f.name);
      }
      setArchivos(nombres);
      setParsed(total);
      setPlan(onPreview(total));
      setFiltro('todos');
    } catch (e) {
      onShowToast(`No se pudo leer el archivo: ${String((e as Error)?.message || e)}`, 'error');
      limpiar();
    } finally {
      setLeyendo(false);
    }
  };

  const aplicar = () => {
    if (!parsed) return;
    const res = onApply(parsed);
    setAplicado(res);
    limpiar();
  };

  const descargarResultado = async (p: ContPlan) => {
    const XLSX = await loadXLSX();
    const rows = p.resultados.map((r) => ({
      Archivo: r.archivo,
      Hoja: r.hoja,
      Fila: r.fila || '',
      'No. Ruta': r.ruta,
      Agencia: r.agencia,
      'Fecha Ruta': r.fecha,
      Estado: estadoTxt[r.estado],
      Detalle: r.mensaje,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 6 }, { wch: 10 }, { wch: 16 }, { wch: 12 }, { wch: 8 }, { wch: 90 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Resultado');
    XLSX.writeFile(wb, 'Resultado_Carga_Contingencia.xlsx');
  };

  const visibles = useMemo(
    () => (plan ? plan.resultados.filter((r) => filtro === 'todos' || r.estado === filtro) : []),
    [plan, filtro]
  );
  const aplicables = plan ? plan.resumen.asignaciones + plan.resumen.liquidaciones : 0;

  return (
    <div id="cargaContingencia" className="bg-white border-2 border-amber-200 rounded-2xl p-6 shadow-sm space-y-5">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h3 className="font-bold text-slate-800 text-base flex items-center">
            <ShieldAlert className="w-5 h-5 mr-2 text-amber-600" />
            Carga de Contingencia (Asignación y Liquidación)
            <span className="ml-2 text-[10px] font-bold uppercase tracking-wide bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
              Solo administradores
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl">
            Para cuando la app no estuvo disponible. Sube los formatos llenados durante la falla; primero verás la revisión de cada
            fila y <strong>nada se guarda hasta que confirmes</strong>. Se aplican las mismas reglas de Asignar y Liquidar, y cada
            ruta queda marcada con el archivo y la fila de origen.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          {PLANTILLAS.map((p) => (
            <a
              key={p.href}
              href={p.href}
              download
              className="inline-flex items-center justify-center min-h-[44px] px-4 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-sm font-semibold transition"
            >
              <Download className="w-4 h-4 mr-1.5 text-amber-600" />
              {p.label}
            </a>
          ))}
        </div>
      </div>

      <ol className="text-xs text-slate-600 list-decimal pl-5 space-y-0.5">
        <li>Antes de cargar, descarga un respaldo (menú de usuario → Descargar respaldo).</li>
        <li>
          Sube juntos los archivos de <strong>Asignación</strong> y <strong>Liquidación</strong> del mismo día: la app aplica primero la
          salida y luego el regreso de cada ruta.
        </li>
        <li>Revisa las filas con error, corrígelas en el Excel y vuelve a subirlo; las filas ya aplicadas no se duplican.</li>
      </ol>

      {aplicado && (
        <div id="contingenciaAplicada" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 space-y-2">
          <p className="font-bold flex items-center">
            <CheckCircle className="w-4 h-4 mr-1.5" /> Carga de contingencia aplicada
          </p>
          <p>
            {aplicado.resumen.creadas} ruta(s) creada(s) · {aplicado.resumen.asignaciones} asignación(es) ·{' '}
            {aplicado.resumen.liquidaciones} liquidación(es) aplicadas
            {aplicado.resumen.errores > 0 ? ` · ${aplicado.resumen.errores} fila(s) con error no se aplicaron` : ''}.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => descargarResultado(aplicado)}
              className="min-h-[40px] px-3 rounded-lg border border-emerald-300 bg-white text-emerald-800 text-xs font-semibold"
            >
              Descargar resultado (.xlsx)
            </button>
            <button type="button" onClick={() => setAplicado(null)} className="min-h-[40px] px-3 rounded-lg text-xs font-semibold text-emerald-800">
              Cerrar
            </button>
          </div>
        </div>
      )}

      <label
        className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-amber-300 rounded-2xl p-6 bg-amber-50/40 hover:bg-amber-50 cursor-pointer text-center"
      >
        <UploadCloud className="w-8 h-8 text-amber-600" />
        <span className="text-sm font-semibold text-slate-700">
          {leyendo ? 'Leyendo archivos…' : 'Toca para elegir los Excel de contingencia (puedes elegir varios)'}
        </span>
        <span className="text-xs text-slate-500">.xlsx o .xls con los formatos de esta pantalla</span>
        <input
          id="contingenciaFile"
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </label>

      {plan && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-600 flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              {archivos.join(' · ')}
            </p>
            <button type="button" onClick={limpiar} className="text-xs font-semibold text-slate-500 flex items-center">
              <X className="w-3.5 h-3.5 mr-1" /> Quitar archivos
            </button>
          </div>

          <div id="contingenciaResumen" className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
            {[
              { k: 'Rutas a crear', v: plan.resumen.creadas, c: 'border-slate-200' },
              { k: 'Asignaciones', v: plan.resumen.asignaciones, c: 'border-blue-200 bg-blue-50' },
              { k: 'Liquidaciones', v: plan.resumen.liquidaciones, c: 'border-emerald-200 bg-emerald-50' },
              { k: 'Avisos', v: plan.resumen.avisos, c: 'border-amber-200 bg-amber-50' },
              { k: 'Errores', v: plan.resumen.errores, c: 'border-rose-200 bg-rose-50' },
            ].map((x) => (
              <div key={x.k} className={`rounded-xl border p-2 ${x.c}`}>
                <p className="text-[10px] uppercase font-bold text-slate-500">{x.k}</p>
                <p className="text-lg font-black text-slate-900">{x.v}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(['todos', 'error', 'aviso', 'ok'] as Filtro[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                className={`min-h-[36px] px-3 rounded-full border text-xs font-semibold ${
                  filtro === f ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300'
                }`}
              >
                {f === 'todos' ? 'Todas' : f === 'error' ? 'Con error' : f === 'aviso' ? 'Avisos' : 'Listas'}
              </button>
            ))}
            <button
              type="button"
              onClick={() => descargarResultado(plan)}
              className="min-h-[36px] px-3 rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-600"
            >
              Descargar revisión (.xlsx)
            </button>
          </div>

          <div className="overflow-x-auto max-h-[420px] overflow-y-auto border border-slate-200 rounded-xl">
            <table id="contingenciaTabla" className="w-full text-xs">
              <thead className="bg-slate-100 text-slate-600 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-2">Hoja</th>
                  <th className="text-left px-2 py-2">Fila</th>
                  <th className="text-left px-2 py-2">Ruta</th>
                  <th className="text-left px-2 py-2">Agencia</th>
                  <th className="text-left px-2 py-2">Fecha</th>
                  <th className="text-left px-2 py-2">Estado</th>
                  <th className="text-left px-2 py-2">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-4 text-center text-slate-400 italic">
                      Sin filas en este filtro.
                    </td>
                  </tr>
                ) : (
                  visibles.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100 align-top">
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.hoja}</td>
                      <td className="px-2 py-1.5">{r.fila || '—'}</td>
                      <td className="px-2 py-1.5 font-semibold">{r.ruta || '—'}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.agencia || '—'}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.fecha || '—'}</td>
                      <td className="px-2 py-1.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded border font-semibold ${estadoChip[r.estado]}`}>
                          {r.estado === 'error' ? (
                            <AlertCircle className="w-3 h-3 mr-1" />
                          ) : r.estado === 'aviso' ? (
                            <AlertTriangle className="w-3 h-3 mr-1" />
                          ) : (
                            <CheckCircle className="w-3 h-3 mr-1" />
                          )}
                          {estadoTxt[r.estado]}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-slate-700">{r.mensaje}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!confirmar ? (
            <button
              id="btnAplicarContingencia"
              type="button"
              disabled={aplicables === 0}
              onClick={() => setConfirmar(true)}
              className="w-full sm:w-auto min-h-[48px] px-5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-sm"
            >
              Aplicar {aplicables} fila(s) válida(s)
            </button>
          ) : (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
              <p className="text-sm text-amber-900">
                Se guardarán <strong>{plan.resumen.asignaciones}</strong> asignación(es) y <strong>{plan.resumen.liquidaciones}</strong>{' '}
                liquidación(es){plan.resumen.creadas ? ` y se crearán ${plan.resumen.creadas} ruta(s)` : ''} para todos los usuarios.
                {plan.resumen.errores > 0 ? ` Las ${plan.resumen.errores} fila(s) con error NO se aplican.` : ''} ¿Confirmas?
              </p>
              <div className="flex gap-2">
                <button
                  id="btnConfirmarContingencia"
                  type="button"
                  onClick={aplicar}
                  className="min-h-[44px] px-5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm"
                >
                  Sí, aplicar
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmar(false)}
                  className="min-h-[44px] px-5 rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold text-sm"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
