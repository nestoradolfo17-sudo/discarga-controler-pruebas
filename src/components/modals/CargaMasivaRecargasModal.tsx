import React, { useMemo, useState } from 'react';
import { Upload, Download, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { Recarga, Staff, TipoRecarga, Truck, EstadoRecarga } from '../../types';
import { loadXLSX } from '../../utils/excel';
import { getGuatemalaDateForInput } from '../../utils/date';
import { Button } from '../ui/Button';
import { fmtNum } from '../../utils/number';

// --- Carga masiva de recargas por Excel (solo administradores) ---
// Formato del "Reporte de Recargas" (hoja "base datos"):
//   No. | RUTA | No Unidad | TRASPORTE No. | Codio VPP | Nombre | Codigo APP1 | Nombre |
//   Codigo APP2 | Nombre | Codigo APP3 | Nombre | Cantidad
// Columnas opcionales: Fecha, Agencia, Tipo (Simple / Doble / Triple). Si no
// vienen en el archivo, se usan las que se eligen en esta ventana.
// Cada fila crea "Cantidad" recargas (normalmente 1). Una fila que ya se cargó
// antes (misma agencia, fecha, ruta, transporte y piloto) no se vuelve a crear.

const TIPOS: TipoRecarga[] = ['Simple', 'Doble', 'Triple'];

const norm = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
const limpio = (v: unknown) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return !s || /^#n\/?a$/i.test(s) || s === '-' ? '' : s;
};
const codigoTxt = (v: unknown) => {
  const s = limpio(v);
  return /^\d+(\.0+)?$/.test(s) ? String(parseInt(s, 10)) : s;
};

// Fecha de una celda: fecha de Excel, número de serie o texto dd/mm/aaaa → AAAA-MM-DD.
const fechaISO = (v: unknown): string => {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  const s = limpio(v);
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
};

interface FilaLeida {
  fila: number;
  ruta: string;
  unidad: string;
  transporte: string;
  piloto: { codigo: string; nombre: string };
  auxiliares: { codigo: string; nombre: string }[];
  cantidad: number;
  fecha?: string;
  agencia?: string;
  tipo?: TipoRecarga;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  agencias: string[];
  agenciaSugerida?: string;
  staff: Staff[];
  trucks: Truck[];
  usuario: string;
  idsExistentes: Set<string>;
  onImportar: (list: Recarga[]) => Promise<boolean>;
}

export const CargaMasivaRecargasModal: React.FC<Props> = ({
  isOpen,
  onClose,
  agencias,
  agenciaSugerida,
  staff,
  trucks,
  usuario,
  idsExistentes,
  onImportar,
}) => {
  const [archivo, setArchivo] = useState('');
  const [filas, setFilas] = useState<FilaLeida[]>([]);
  const [error, setError] = useState('');
  const [agencia, setAgencia] = useState(agenciaSugerida && agenciaSugerida !== 'TODAS' ? agenciaSugerida : '');
  const [fecha, setFecha] = useState(getGuatemalaDateForInput());
  const [tipo, setTipo] = useState<TipoRecarga>('Doble');
  const [estado, setEstado] = useState<EstadoRecarga | ''>('');
  const [guardando, setGuardando] = useState(false);

  const reiniciar = () => {
    setArchivo('');
    setFilas([]);
    setError('');
    setEstado('');
    setGuardando(false);
  };

  const leerArchivo = async (file: File) => {
    setError('');
    setFilas([]);
    setArchivo(file.name);
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      let encontrado: FilaLeida[] | null = null;
      for (const nombreHoja of wb.SheetNames) {
        const filasHoja = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nombreHoja], { header: 1, raw: true, defval: '' });
        // Fila de encabezados: la que tiene RUTA y VPP.
        const hi = filasHoja.findIndex((f) => {
          const t = (f || []).map(norm);
          return t.some((x) => x === 'ruta') && t.some((x) => x.includes('vpp'));
        });
        if (hi === -1) continue;
        const enc = (filasHoja[hi] || []).map(norm);
        const col = (pred: (x: string) => boolean) => enc.findIndex(pred);
        const cRuta = col((x) => x === 'ruta');
        const cUnidad = col((x) => x.includes('unidad'));
        const cTransp = col((x) => x.includes('trasporte') || x.includes('transporte'));
        const cVpp = col((x) => x.includes('vpp'));
        const cApp = [1, 2, 3].map((n) => col((x) => x.replace(/\s/g, '').includes(`app${n}`)));
        const cCant = col((x) => x.startsWith('cantidad'));
        const cFecha = col((x) => x === 'fecha' || x.startsWith('fecha '));
        const cAgencia = col((x) => x === 'agencia');
        const cTipo = col((x) => x === 'tipo' || x.includes('tp recarga') || x === 'tipo recarga');
        const out: FilaLeida[] = [];
        filasHoja.slice(hi + 1).forEach((f, i) => {
          const row = f || [];
          const ruta = cRuta >= 0 ? codigoTxt(row[cRuta]) : '';
          const vpp = cVpp >= 0 ? codigoTxt(row[cVpp]) : '';
          const nVpp = cVpp >= 0 ? limpio(row[cVpp + 1]) : '';
          if (!ruta && !vpp && !nVpp) return; // fila vacía
          const tipoTxt = cTipo >= 0 ? norm(row[cTipo]) : '';
          out.push({
            fila: hi + 2 + i,
            ruta,
            unidad: cUnidad >= 0 ? codigoTxt(row[cUnidad]) : '',
            transporte: cTransp >= 0 ? codigoTxt(row[cTransp]) : '',
            piloto: { codigo: vpp, nombre: nVpp },
            auxiliares: cApp
              .filter((c) => c >= 0)
              .map((c) => ({ codigo: codigoTxt(row[c]), nombre: limpio(row[c + 1]) }))
              .filter((a) => a.codigo || a.nombre),
            cantidad: Math.max(1, Math.round(Number(cCant >= 0 ? row[cCant] : 1) || 1)),
            fecha: cFecha >= 0 ? fechaISO(row[cFecha]) || undefined : undefined,
            agencia: cAgencia >= 0 ? limpio(row[cAgencia]) || undefined : undefined,
            tipo: TIPOS.find((t) => norm(t) === tipoTxt),
          });
        });
        encontrado = out;
        break;
      }
      if (!encontrado) {
        setError('No se encontró la hoja con el formato (columnas RUTA, Codio VPP, Codigo APP1…, Cantidad).');
        return;
      }
      if (encontrado.length === 0) {
        setError('El archivo no tiene filas con datos.');
        return;
      }
      setFilas(encontrado);
    } catch (e) {
      setError(`No se pudo leer el archivo: ${(e as Error).message}`);
    }
  };

  // Personal por código (código corto o código completo) y por nombre.
  const buscarPersona = useMemo(() => {
    const porCodigo = new Map<string, Staff>();
    const porNombre = new Map<string, Staff>();
    staff.forEach((s) => {
      [s.codigoCorto, s.codigo].forEach((c) => c && porCodigo.set(codigoTxt(c), s));
      porNombre.set(norm(s.nombre), s);
    });
    return (codigo: string, nombre: string) => (codigo && porCodigo.get(codigo)) || (nombre && porNombre.get(norm(nombre))) || null;
  }, [staff]);

  const placaDe = (unidad: string) => {
    if (!unidad) return '';
    const t = trucks.find((x) => codigoTxt(x.idCamion) === unidad || norm(x.placa) === norm(unidad));
    return t ? t.placa : `Unidad ${unidad}`;
  };

  // Recargas que se van a crear (con validación por fila).
  const plan = useMemo(() => {
    const ahora = new Date().toISOString();
    const nuevas: Recarga[] = [];
    const avisos: { fila: number; texto: string }[] = [];
    let repetidas = 0;
    filas.forEach((f) => {
      const agArchivo = f.agencia ? agencias.find((a) => norm(a) === norm(f.agencia)) : undefined;
      const ag = agArchivo || (f.agencia ? '' : agencia);
      const fe = f.fecha || fecha;
      if (f.agencia && !agArchivo) {
        avisos.push({ fila: f.fila, texto: `La agencia "${f.agencia}" no está en tu lista de agencias.` });
        return;
      }
      if (!ag) {
        avisos.push({ fila: f.fila, texto: 'Sin agencia: elige la agencia arriba o agrega la columna Agencia.' });
        return;
      }
      if (!fe) {
        avisos.push({ fila: f.fila, texto: 'Sin fecha.' });
        return;
      }
      if (!f.piloto.codigo && !f.piloto.nombre) {
        avisos.push({ fila: f.fila, texto: 'Sin piloto (Codio VPP).' });
        return;
      }
      const piloto = buscarPersona(f.piloto.codigo, f.piloto.nombre);
      const auxs = f.auxiliares.map((a) => ({ a, s: buscarPersona(a.codigo, a.nombre) }));
      const noEncontrados = [
        ...(piloto ? [] : [f.piloto.codigo || f.piloto.nombre]),
        ...auxs.filter((x) => !x.s).map((x) => x.a.codigo || x.a.nombre),
      ];
      if (noEncontrados.length) {
        avisos.push({ fila: f.fila, texto: `No está en Personal (se carga con el nombre del archivo): ${noEncontrados.join(', ')}` });
      }
      for (let n = 1; n <= f.cantidad; n++) {
        const id = `IMP__${ag}__${fe}__${f.ruta || 'SR'}__${f.transporte || 'ST'}__${f.piloto.codigo || norm(f.piloto.nombre)}__${n}`.replace(/\s+/g, '_');
        if (idsExistentes.has(id) || nuevas.some((x) => x.id === id)) {
          repetidas++;
          continue;
        }
        nuevas.push({
          id,
          fecha: fe,
          rutaId: f.ruta,
          sinRuta: !f.ruta,
          agencia: ag,
          tipo: f.tipo || tipo,
          conductor: piloto?.nombre || f.piloto.nombre || f.piloto.codigo,
          conductorId: piloto?.id,
          auxiliares: auxs.map((x) => x.s?.nombre || x.a.nombre || x.a.codigo),
          auxiliarIds: auxs.map((x) => x.s?.id || null),
          camionPlaca: placaDe(f.unidad) || undefined,
          comentario: [
            'Carga masiva',
            f.transporte ? `Transporte No. ${f.transporte}` : '',
            f.unidad ? `Unidad ${f.unidad}` : '',
            archivo ? `Archivo ${archivo} (fila ${f.fila})` : '',
          ]
            .filter(Boolean)
            .join(' · '),
          origen: 'manual',
          solicitadoPor: usuario,
          creadoPor: usuario,
          creadoEn: ahora,
          estado: estado || 'Pendiente',
          ...(estado === 'Autorizada' ? { autorizadoPor: usuario, autorizadoEn: ahora } : {}),
        });
      }
    });
    return { nuevas, avisos, repetidas };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, agencia, fecha, tipo, estado, buscarPersona, trucks, usuario, archivo, idsExistentes, agencias]);

  const bloqueadas = plan.avisos.filter((a) => !a.texto.startsWith('No está en Personal')).length;
  const puedeGuardar = !!estado && plan.nuevas.length > 0 && !guardando;

  const descargarPlantilla = async () => {
    const XLSX = await loadXLSX();
    const ws = XLSX.utils.aoa_to_sheet([
      ['No.', 'RUTA ', 'No Unidad', 'TRASPORTE No.', 'Codio VPP', 'Nombre ', 'Codigo APP1', 'Nombre ', 'Codigo APP2', 'Nombre ', 'Codigo APP3', 'Nombre ', 'Cantidad ', 'Fecha', 'Agencia', 'Tipo'],
      [1, 158202, 49, 911046, 125, 'NOMBRE DEL PILOTO', 178, 'NOMBRE AUXILIAR 1', 1138, 'NOMBRE AUXILIAR 2', '', '', 1, '', '', 'Doble'],
    ]);
    ws['!cols'] = [6, 10, 10, 14, 10, 32, 12, 32, 12, 32, 12, 32, 10, 12, 16, 10].map((w) => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'base datos');
    XLSX.writeFile(wb, 'Plantilla_Carga_Masiva_Recargas.xlsx');
  };

  const confirmar = async () => {
    if (!puedeGuardar) return;
    setGuardando(true);
    const ok = await onImportar(plan.nuevas);
    setGuardando(false);
    if (ok) {
      reiniciar();
      onClose();
    }
  };

  if (!isOpen) return null;

  const sel = 'w-full min-h-[44px] px-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold outline-none focus:ring-2 focus:ring-violet-400';

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm">Carga masiva de recargas (Excel)</h3>
            <p className="text-[11px] text-slate-400">Solo administradores · formato del Reporte de Recargas (hoja "base datos")</p>
          </div>
          <button type="button" onClick={() => { reiniciar(); onClose(); }} aria-label="Cerrar" className="w-10 h-10 rounded-lg hover:bg-slate-800 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <label className="min-h-[44px] px-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold flex items-center gap-2 cursor-pointer">
              <Upload className="w-4 h-4" /> {archivo ? 'Cambiar archivo' : 'Elegir archivo Excel'}
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void leerArchivo(f);
                  e.target.value = '';
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => void descargarPlantilla()}
              className="min-h-[44px] px-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer hover:bg-slate-50"
            >
              <Download className="w-4 h-4" /> Plantilla
            </button>
            {archivo && <span className="text-slate-600 font-semibold truncate">{archivo} · {fmtNum(filas.length)} fila(s)</span>}
          </div>

          {error && <p className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-semibold">{error}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label htmlFor="cmrAgencia" className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Agencia *</label>
              <select id="cmrAgencia" value={agencia} onChange={(e) => setAgencia(e.target.value)} className={sel}>
                <option value="">Elige la agencia…</option>
                {agencias.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cmrFecha" className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Fecha de las recargas *</label>
              <input id="cmrFecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={sel} />
            </div>
            <div>
              <label htmlFor="cmrTipo" className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Tipo de recarga</label>
              <select id="cmrTipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoRecarga)} className={sel}>
                {TIPOS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="cmrEstado" className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Cargar como *</label>
              <select id="cmrEstado" value={estado} onChange={(e) => setEstado(e.target.value as EstadoRecarga)} className={`${sel} ${!estado ? 'border-amber-400' : ''}`}>
                <option value="">Elige…</option>
                <option value="Pendiente">Pendiente (por autorizar)</option>
                <option value="Autorizada">Autorizada</option>
              </select>
            </div>
          </div>
          <p className="text-[10.5px] text-slate-500">
            Agencia, fecha y tipo se usan para las filas que no traen esas columnas en el archivo. Cada fila crea tantas recargas como diga "Cantidad".
          </p>

          {filas.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50">
                  <span className="block text-[10px] font-bold uppercase text-emerald-700">Se crearán</span>
                  <span className="block text-xl font-black text-emerald-800">{fmtNum(plan.nuevas.length)}</span>
                </div>
                <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                  <span className="block text-[10px] font-bold uppercase text-slate-600">Ya cargadas (se omiten)</span>
                  <span className="block text-xl font-black text-slate-700">{fmtNum(plan.repetidas)}</span>
                </div>
                <div className={`p-3 rounded-xl border ${bloqueadas ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}>
                  <span className={`block text-[10px] font-bold uppercase ${bloqueadas ? 'text-rose-700' : 'text-amber-700'}`}>Filas con aviso</span>
                  <span className={`block text-xl font-black ${bloqueadas ? 'text-rose-800' : 'text-amber-800'}`}>{fmtNum(plan.avisos.length)}</span>
                </div>
              </div>

              {plan.avisos.length > 0 && (
                <div className="max-h-32 overflow-y-auto border border-amber-200 rounded-lg bg-amber-50/50 p-2 space-y-1">
                  {plan.avisos.map((a, i) => (
                    <p key={i} className="text-[11px] text-amber-900 flex gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Fila {a.fila}: {a.texto}
                    </p>
                  ))}
                </div>
              )}

              <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-72">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-100 text-slate-600 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left">Fecha</th>
                      <th className="px-2 py-1.5 text-left">Agencia</th>
                      <th className="px-2 py-1.5 text-left">Ruta</th>
                      <th className="px-2 py-1.5 text-left">Camión</th>
                      <th className="px-2 py-1.5 text-left">Piloto</th>
                      <th className="px-2 py-1.5 text-left">Auxiliares</th>
                      <th className="px-2 py-1.5 text-left">Tipo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {plan.nuevas.slice(0, 200).map((r) => (
                      <tr key={r.id}>
                        <td className="px-2 py-1 whitespace-nowrap">{r.fecha.split('-').reverse().join('/')}</td>
                        <td className="px-2 py-1">{r.agencia}</td>
                        <td className="px-2 py-1 font-mono">{r.rutaId || 'Sin ruta'}</td>
                        <td className="px-2 py-1">{r.camionPlaca || '-'}</td>
                        <td className="px-2 py-1">{r.conductor}{!r.conductorId && <span className="text-amber-600"> *</span>}</td>
                        <td className="px-2 py-1">{r.auxiliares.join(', ') || '-'}</td>
                        <td className="px-2 py-1">{r.tipo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {plan.nuevas.length > 200 && <p className="text-[10.5px] text-slate-500">Se muestran 200 de {fmtNum(plan.nuevas.length)}.</p>}
              <p className="text-[10.5px] text-slate-500">* No se encontró en Personal: se guarda con el nombre del archivo.</p>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50">
          <span className="text-[11px] text-slate-600 flex items-center gap-1.5">
            {plan.nuevas.length > 0 && estado ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {fmtNum(plan.nuevas.length)} recarga(s) quedarán {estado === 'Autorizada' ? 'autorizadas' : 'por autorizar'}
              </>
            ) : filas.length > 0 && !estado ? (
              'Elige cómo se cargan (Pendiente o Autorizada).'
            ) : (
              ''
            )}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="lg" onClick={() => { reiniciar(); onClose(); }}>
              Cancelar
            </Button>
            <Button variant="primary" size="lg" icon={Upload} disabled={!puedeGuardar} onClick={() => void confirmar()}>
              {guardando ? 'Cargando…' : `Cargar ${fmtNum(plan.nuevas.length)} recarga(s)`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
