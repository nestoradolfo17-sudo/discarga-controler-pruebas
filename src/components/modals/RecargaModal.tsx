import React, { useEffect, useMemo, useState } from 'react';
import { Repeat, Search, UserRound, Users, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Prestamo, Recarga, Route, Staff, TipoRecarga, Truck } from '../../types';
import { Button, IconButton } from '../ui/Button';
import { ModalFooter } from '../ui/ModalFooter';
import { ACTION_ICONS } from '../ui/actionIcons';
import { ResourcePicker, PickerItem } from '../ResourcePicker';
import { formatoCorrelativo } from '../../services/recargas';
import { cubreFecha } from '../../utils/prestamos';
import { getGuatemalaDateForInput, parseFlexibleDate } from '../../utils/date';

// --- Nueva recarga / Editar recarga ---
// Pide número de ruta, fecha, tipo (Simple / Doble / Triple), piloto y
// auxiliares (de la lista de Personal de la agencia) y un comentario. Si la
// ruta existe en el sistema para esa fecha, se completan solos la agencia, el
// segmento y el camión, y se ofrece copiar su tripulación.

export const TIPOS_RECARGA: { tipo: TipoRecarga; desc: string; cls: string; on: string }[] = [
  { tipo: 'Simple', desc: '1 recarga', cls: 'border-sky-200 text-sky-800', on: 'bg-sky-600 border-sky-600 text-white' },
  { tipo: 'Doble', desc: '2 recargas', cls: 'border-violet-200 text-violet-800', on: 'bg-violet-600 border-violet-600 text-white' },
  { tipo: 'Triple', desc: '3 recargas', cls: 'border-amber-200 text-amber-800', on: 'bg-amber-500 border-amber-500 text-white' },
];

const MAX_AUX = 4;

/** Fecha de una ruta (DD/MM/AAAA u otros formatos) como AAAA-MM-DD. */
export const fechaRutaISO = (r: Route): string => {
  const d = parseFlexibleDate(r.fechaOriginalRuta || r.fecha);
  return d ? getGuatemalaDateForInput(d) : '';
};

interface RecargaModalProps {
  isOpen: boolean;
  onClose: () => void;
  inicial: Recarga | null; // null = nueva
  rutas: Route[]; // rutas activas + liquidadas que el usuario puede ver
  staff: Staff[];
  // Camiones (para buscar la ruta por ID de camión).
  trucks?: Truck[];
  prestamos?: Prestamo[];
  agencias: string[];
  agenciaPorDefecto: string;
  // Nombre que se propone como "Solicitado por" en una recarga nueva.
  solicitantePorDefecto?: string;
  existentes: Recarga[];
  guardando: boolean;
  // Quien edita no es administrador y la recarga ya fue revisada: al guardar
  // un cambio vuelve a Pendiente.
  avisoReautorizar?: boolean;
  onGuardar: (datos: Omit<Recarga, 'id' | 'origen' | 'creadoPor' | 'creadoEn'>) => void;
}

const norm = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export const RecargaModal: React.FC<RecargaModalProps> = ({
  isOpen,
  onClose,
  inicial,
  rutas,
  staff,
  trucks = [] as Truck[],
  prestamos = [] as Prestamo[],
  agencias,
  agenciaPorDefecto,
  solicitantePorDefecto = '',
  existentes,
  guardando,
  avisoReautorizar = false,
  onGuardar,
}) => {
  const [fecha, setFecha] = useState('');
  const [rutaId, setRutaId] = useState('');
  const [sinRuta, setSinRuta] = useState(false);
  const [agencia, setAgencia] = useState('');
  const [tipo, setTipo] = useState<TipoRecarga>('Simple');
  const [conductor, setConductor] = useState('');
  const [auxiliares, setAuxiliares] = useState<string[]>([]);
  const [comentario, setComentario] = useState('');
  const [solicitadoPor, setSolicitadoPor] = useState('');
  const [picker, setPicker] = useState<'piloto' | 'aux' | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setFecha(inicial?.fecha || getGuatemalaDateForInput());
    setRutaId(inicial?.rutaId || '');
    setSinRuta(!!inicial?.sinRuta);
    setAgencia(inicial?.agencia || agenciaPorDefecto || (agencias.length === 1 ? agencias[0] : ''));
    setTipo(inicial?.tipo || 'Simple');
    setConductor(inicial?.conductor || '');
    setAuxiliares(inicial?.auxiliares || []);
    setComentario(inicial?.comentario || '');
    setSolicitadoPor(inicial ? inicial.solicitadoPor || inicial.creadoPor || '' : solicitantePorDefecto);
    setPicker(null);
    setIntentado(false);
    setBusca('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, inicial]);

  // --- Buscar ruta del Tablero (igual que en Optimización de Carga) ---
  // Solo rutas ACTIVAS del tablero de asignación (no liquidadas) y de las
  // agencias que el usuario tiene permitidas. Se busca por número de ruta,
  // piloto, ID de camión o placa.
  const idCamionDe = (r: Route) => {
    const id = (r.asignacion || r.ultimoDespacho)?.camionId;
    const t = id ? trucks.find((x) => x.id === id) : undefined;
    return t?.idCamion ? String(t.idCamion) : '';
  };
  const rutasActivas = useMemo(
    () => rutas.filter((r) => r.estado !== 'Liquidada' && !!r.agencia && agencias.includes(r.agencia)),
    [rutas, agencias]
  );
  const resultados = useMemo(() => {
    const q = norm(busca);
    if (!q) return [] as Route[];
    return rutasActivas
      .filter((r) => {
        const a = r.asignacion || r.ultimoDespacho;
        return [r.id, a?.conductor, a?.camionPlaca, idCamionDe(r)].some((v) => norm(String(v ?? '')).includes(q));
      })
      .sort((a, b) => Number(!norm(String(a.id)).startsWith(q)) - Number(!norm(String(b.id)).startsWith(q)))
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, rutasActivas, trucks]);
  const elegirRuta = (r: Route) => {
    const a = r.asignacion || r.ultimoDespacho;
    setSinRuta(false);
    setRutaId(String(r.id));
    const f = fechaRutaISO(r);
    if (f) setFecha(f);
    if (r.agencia) setAgencia(r.agencia);
    if (a && (a.conductor || a.auxiliar1)) {
      setConductor(a.conductor || '');
      setAuxiliares(([a.auxiliar1, a.auxiliar2, a.auxiliar3, a.auxiliar4].filter(Boolean) as string[]).slice(0, MAX_AUX));
    }
    setBusca('');
  };

  // Rutas de la fecha elegida (para sugerir números y completar datos).
  const rutasDelDia = useMemo(() => rutas.filter((r) => fechaRutaISO(r) === fecha), [rutas, fecha]);
  const coincidencias = useMemo(() => {
    const id = rutaId.trim();
    if (!id || sinRuta) return [] as Route[];
    return rutasDelDia.filter((r) => String(r.id).trim() === id);
  }, [rutasDelDia, rutaId, sinRuta]);
  const rutaEncontrada = useMemo(
    () => coincidencias.find((r) => !agencia || r.agencia === agencia) || (coincidencias.length === 1 ? coincidencias[0] : undefined),
    [coincidencias, agencia]
  );

  // Al encontrar la ruta, la agencia se toma de ella.
  useEffect(() => {
    if (rutaEncontrada?.agencia && rutaEncontrada.agencia !== agencia && coincidencias.length === 1) {
      setAgencia(rutaEncontrada.agencia);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rutaEncontrada]);

  const asig = rutaEncontrada?.asignacion || rutaEncontrada?.ultimoDespacho;
  const tripulacionRuta = asig
    ? {
        conductor: asig.conductor || '',
        auxiliares: [asig.auxiliar1, asig.auxiliar2, asig.auxiliar3, asig.auxiliar4].filter(Boolean) as string[],
      }
    : null;

  // Préstamos que cubren la fecha de la recarga: la persona cuenta para la
  // agencia que la recibió (y no para la suya) ese día.
  const prestadoEnFecha = useMemo(() => {
    const m = new Map<string, Prestamo>();
    prestamos.forEach((p) => {
      if (cubreFecha(p, fecha)) p.recursos.forEach((r) => r.tipo !== 'camion' && m.set(r.id, p));
    });
    return m;
  }, [prestamos, fecha]);
  const agenciaDe = (s: Staff) => prestadoEnFecha.get(s.id)?.agenciaDestino || s.agencia;
  const personalAgencia = useMemo(
    () =>
      staff
        .filter((s) => (!agencia || agenciaDe(s) === agencia) && s.estado !== 'Baja' && s.estatus !== 'BAJA')
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [staff, agencia, prestadoEnFecha] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const toItem = (s: Staff): PickerItem => ({
    id: s.nombre,
    title: s.nombre,
    subtitle: [s.puesto, s.codigoCorto || s.codigo].filter(Boolean).join(' · '),
    searchText: norm([s.nombre, s.codigo, s.codigoCorto, s.dpi].join(' ')),
    status: 'disponible',
    statusLabel: s.rol === 'Conductor' ? 'Piloto' : 'Auxiliar',
    extraBadge: prestadoEnFecha.get(s.id) && prestadoEnFecha.get(s.id)!.agenciaDestino === agencia ? `Prestado de ${prestadoEnFecha.get(s.id)!.agenciaOrigen}` : undefined,
  });
  const pilotoItems = useMemo(
    () => personalAgencia.filter((s) => s.rol === 'Conductor' || s.puesto === 'VPP' || s.puesto === 'VPPB').map(toItem),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [personalAgencia]
  );
  const auxItems = useMemo(
    () => personalAgencia.filter((s) => s.nombre !== conductor).map(toItem),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [personalAgencia, conductor]
  );

  if (!isOpen) return null;

  const idLimpio = sinRuta ? '' : rutaId.trim();
  const duplicada = !idLimpio ? undefined : existentes.find(
    (x) => x.id !== inicial?.id && x.fecha === fecha && x.agencia === agencia && String(x.rutaId).trim() === idLimpio
  );
  const faltan: string[] = [];
  if (!fecha) faltan.push('fecha');
  if (!idLimpio && !sinRuta) faltan.push('número de ruta (o marca "Sin ruta")');
  if (!agencia) faltan.push('agencia');
  // Basta con piloto O al menos un auxiliar (puede ir solo uno de los dos).
  if (!conductor && auxiliares.length === 0) faltan.push('piloto o al menos un auxiliar');
  const sinTripulacion = intentado && !conductor && auxiliares.length === 0;
  const valido = faltan.length === 0;

  const staffId = (nombre: string) => staff.find((s) => s.nombre === nombre && (!agencia || s.agencia === agencia))?.id;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (!valido || guardando) return;
    onGuardar({
      fecha,
      rutaId: idLimpio,
      sinRuta: sinRuta || undefined,
      agencia,
      segmento: rutaEncontrada?.segmento || inicial?.segmento,
      tipo,
      conductor,
      conductorId: staffId(conductor),
      auxiliares,
      auxiliarIds: auxiliares.map((n) => staffId(n) || null),
      camionPlaca: sinRuta ? inicial?.camionPlaca : asig?.camionPlaca || inicial?.camionPlaca,
      comentario: comentario.trim() || undefined,
      // Automático: el usuario que registra (en una edición se conserva el original).
      solicitadoPor: (solicitadoPor || solicitantePorDefecto).trim(),
    });
  };

  const input = 'w-full min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-300 bg-white';
  const label = 'block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1';

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-3 sm:p-4">
      <div
        role="dialog"
        aria-label={inicial ? 'Editar recarga' : 'Nueva recarga'}
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]"
      >
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center">
              <Repeat className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-bold text-sm">
                {inicial ? 'Editar recarga' : 'Nueva recarga'}
                {inicial?.correlativo ? <span className="ml-2 font-mono text-violet-300">{formatoCorrelativo(inicial.correlativo)}</span> : null}
              </h3>
              <p className="text-[11px] text-slate-400">Ruta, tripulación que la sacó y fecha de la recarga</p>
            </div>
          </div>
          <IconButton icon={ACTION_ICONS.cerrar} label="Cerrar sin guardar" onClick={onClose} className="text-slate-300 hover:text-white hover:bg-slate-800" />
        </div>

        <form id="formRecarga" onSubmit={submit} className="p-6 space-y-5 text-xs overflow-y-auto flex-1">
          {!sinRuta && (
            <div className="relative">
              <label htmlFor="recBuscaRuta" className={label}>Buscar ruta activa del tablero</label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="recBuscaRuta"
                  type="search"
                  autoComplete="off"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    const exacta = resultados.find((r) => norm(String(r.id)) === norm(busca));
                    const elegida = exacta || (resultados.length === 1 ? resultados[0] : null);
                    if (elegida) elegirRuta(elegida);
                  }}
                  placeholder="No. de ruta, piloto o ID camión…"
                  aria-label="Buscar ruta activa por número de ruta, piloto, ID de camión o placa"
                  className={`${input} pl-9`}
                />
              </div>
              {busca.trim() && (
                <div className="mt-1 border border-slate-200 rounded-xl bg-white shadow-sm divide-y divide-slate-100 max-h-64 overflow-y-auto" role="listbox" aria-label="Rutas encontradas">
                  {resultados.length === 0 ? (
                    <p className="px-3 py-2.5 text-[11px] text-slate-500">
                      Ninguna ruta activa de tus agencias coincide con "{busca.trim()}".
                    </p>
                  ) : (
                    resultados.map((r) => {
                      const a = r.asignacion || r.ultimoDespacho;
                      const idc = idCamionDe(r);
                      return (
                        <button
                          key={`${r.id}|${r.fecha}|${r.agencia}`}
                          type="button"
                          role="option"
                          aria-selected={false}
                          onClick={() => elegirRuta(r)}
                          className="w-full text-left px-3 py-2 min-h-[44px] hover:bg-violet-50 cursor-pointer flex flex-wrap items-center gap-x-2 gap-y-0.5"
                        >
                          <span className="font-mono font-black text-slate-900">Ruta {r.id}</span>
                          <span className="text-[10.5px] px-1.5 rounded bg-slate-100 border border-slate-200 font-semibold text-slate-600">{r.estado}</span>
                          <span className="text-[11px] text-blue-700 font-semibold">{r.agencia}</span>
                          <span className="w-full text-[11px] text-slate-600">
                            {a?.conductor || 'Sin piloto'}
                            {idc ? ` · ID ${idc}` : ''}
                            {a?.camionPlaca ? ` · ${a.camionPlaca}` : ''}
                            {r.fecha ? ` · ${r.fecha}` : ''}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
              <p className="mt-1 text-[10.5px] text-slate-400">Solo rutas activas del tablero de tus agencias. Al elegirla se llenan ruta, fecha, agencia y tripulación.</p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="recFecha" className={label}>Fecha de la recarga *</label>
              <input id="recFecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={input} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="recRuta" className={label.replace('mb-1', 'mb-0')}>Número de ruta {sinRuta ? '' : '*'}</label>
                <label className="flex items-center gap-1 text-[11px] font-bold text-violet-700 cursor-pointer select-none">
                  <input
                    id="recSinRuta"
                    type="checkbox"
                    checked={sinRuta}
                    onChange={(e) => setSinRuta(e.target.checked)}
                    className="w-4 h-4 cursor-pointer accent-violet-600"
                  />
                  Sin ruta
                </label>
              </div>
              <input
                id="recRuta"
                list="recRutasDia"
                inputMode="numeric"
                autoComplete="off"
                placeholder={sinRuta ? 'Recarga sin ruta' : 'Ej. 2105'}
                disabled={sinRuta}
                value={sinRuta ? '' : rutaId}
                onChange={(e) => setRutaId(e.target.value)}
                className={`${input} font-mono font-bold disabled:bg-slate-100 disabled:text-slate-400 ${intentado && !idLimpio && !sinRuta ? 'border-rose-400' : ''}`}
              />
              <datalist id="recRutasDia">
                {Array.from(new Set(rutasDelDia.filter((r) => r.estado !== 'Liquidada' && !!r.agencia && agencias.includes(r.agencia) && (!agencia || r.agencia === agencia)).map((r) => String(r.id)))).map((id) => (
                  <option key={id} value={id} />
                ))}
              </datalist>
            </div>
            <div>
              <label htmlFor="recAgencia" className={label}>Agencia *</label>
              <select
                id="recAgencia"
                value={agencia}
                onChange={(e) => {
                  setAgencia(e.target.value);
                  setConductor('');
                  setAuxiliares([]);
                }}
                className={`${input} ${intentado && !agencia ? 'border-rose-400' : ''}`}
              >
                <option value="">— Elige —</option>
                {agencias.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {idLimpio && (
            <div
              className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-[11px] ${
                rutaEncontrada ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              {rutaEncontrada ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <Search className="w-4 h-4 shrink-0" />}
              <div className="flex-1">
                {rutaEncontrada ? (
                  <>
                    <b>Ruta {rutaEncontrada.id} encontrada</b> · {rutaEncontrada.agencia} · {rutaEncontrada.segmento || 'Sin segmento'} ·{' '}
                    {rutaEncontrada.estado}
                    {asig?.camionPlaca ? ` · Camión ${asig.camionPlaca}` : ''}
                  </>
                ) : (
                  <>No hay una ruta {idLimpio} en el sistema para esa fecha. Puedes registrarla igual.</>
                )}
              </div>
              {tripulacionRuta?.conductor && (tripulacionRuta.conductor !== conductor || tripulacionRuta.auxiliares.join('|') !== auxiliares.join('|')) && (
                <button
                  type="button"
                  onClick={() => {
                    setConductor(tripulacionRuta.conductor);
                    setAuxiliares(tripulacionRuta.auxiliares.slice(0, MAX_AUX));
                  }}
                  className="shrink-0 px-2.5 py-1 rounded-lg bg-white border border-emerald-300 font-bold text-emerald-800 cursor-pointer hover:bg-emerald-100"
                >
                  Usar tripulación de la ruta
                </button>
              )}
            </div>
          )}

          <div>
            <p className={label}>Tipo de recarga *</p>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo de recarga">
              {TIPOS_RECARGA.map((t) => {
                const on = tipo === t.tipo;
                return (
                  <button
                    key={t.tipo}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setTipo(t.tipo)}
                    className={`min-h-[64px] rounded-xl border-2 font-bold flex flex-col items-center justify-center cursor-pointer transition ${
                      on ? t.on : `bg-white hover:bg-slate-50 ${t.cls}`
                    }`}
                  >
                    <span className="text-base">{t.tipo}</span>
                    <span className={`text-[10px] font-semibold ${on ? 'text-white/85' : 'text-slate-500'}`}>{t.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
          <p className={`text-[11px] ${sinTripulacion ? 'font-bold text-rose-600' : 'text-slate-500'}`}>
            Tripulación: elige el piloto, los auxiliares o ambos (al menos uno).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between">
                <p className={label}>Piloto</p>
                {conductor && (
                  <button
                    type="button"
                    onClick={() => setConductor('')}
                    className="mb-1 text-[11px] font-bold text-slate-500 hover:text-rose-600 cursor-pointer"
                  >
                    Quitar piloto
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setPicker('piloto')}
                disabled={!agencia}
                className={`w-full min-h-[52px] px-3 rounded-xl border-2 border-dashed text-left flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
                  conductor ? 'border-indigo-300 bg-indigo-50' : sinTripulacion ? 'border-rose-300' : 'border-slate-300 hover:bg-slate-50'
                }`}
              >
                <UserRound className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className={`flex-1 text-sm ${conductor ? 'font-bold text-slate-800' : 'text-slate-400'}`}>
                  {conductor || (agencia ? 'Tocar para buscar piloto' : 'Elige primero la agencia')}
                </span>
                <span className="text-[11px] font-bold text-blue-700">{conductor ? 'Cambiar' : 'Elegir'}</span>
              </button>
            </div>
            <div>
              <p className={label}>Auxiliares (hasta {MAX_AUX})</p>
              <button
                type="button"
                onClick={() => setPicker('aux')}
                disabled={!agencia}
                className={`w-full min-h-[52px] px-3 rounded-xl border-2 border-dashed text-left flex items-center gap-2 cursor-pointer hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 ${
                  auxiliares.length ? 'border-indigo-300 bg-indigo-50' : sinTripulacion ? 'border-rose-300' : 'border-slate-300'
                }`}
              >
                <Users className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className={`flex-1 text-sm ${auxiliares.length ? 'font-bold text-slate-800' : 'text-slate-400'}`}>
                  {auxiliares.length ? `${auxiliares.length} auxiliar(es)` : 'Tocar para agregar auxiliares'}
                </span>
                <span className="text-[11px] font-bold text-blue-700">Agregar</span>
              </button>
              {auxiliares.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {auxiliares.map((a) => (
                    <span key={a} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-slate-100 border border-slate-200 font-semibold text-slate-700">
                      {a}
                      <button
                        type="button"
                        aria-label={`Quitar a ${a}`}
                        onClick={() => setAuxiliares((p) => p.filter((x) => x !== a))}
                        className="w-5 h-5 rounded-full hover:bg-slate-300 flex items-center justify-center cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          </div>

          <div>
            <p className={label}>Solicitado por</p>
            <div
              id="recSolicitadoPor"
              aria-readonly="true"
              className="w-full min-h-[44px] px-3 border border-slate-200 bg-slate-100 rounded-lg text-sm font-bold text-slate-700 flex items-center"
            >
              {solicitadoPor || solicitantePorDefecto || '-'}
            </div>
            <p className="mt-1 text-[10.5px] text-slate-400">Automático: usuario que registra la recarga. Firma en la boleta junto con la tripulación.</p>
          </div>

          <div>
            <label htmlFor="recComentario" className={label}>Comentarios</label>
            <textarea
              id="recComentario"
              rows={3}
              maxLength={500}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Ej. Recarga por pedido adicional del cliente, cambio de bodega…"
              className="w-full p-3 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-300 resize-y"
            />
          </div>

          {!inicial && (
            <p className="flex items-start gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-[11px]">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
              La recarga queda <b className="mx-1">Pendiente</b> hasta que un administrador la autorice. Solo las autorizadas cuentan para pago.
            </p>
          )}
          {avisoReautorizar && inicial && (
            <p className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px]">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Esta recarga ya está <b>{inicial.estado}</b>. Si cambias algo, vuelve a <b>Pendiente</b> y necesita nueva autorización del
                administrador.
              </span>
            </p>
          )}
          {duplicada && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px]">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Ya hay una recarga <b>{duplicada.tipo}</b> de la ruta {duplicada.rutaId} ese día ({duplicada.conductor || duplicada.auxiliares?.join(', ') || 'sin tripulación'}). Si es la
                misma, mejor edítala y cambia el tipo a Doble o Triple.
              </span>
            </div>
          )}
          {intentado && !valido && (
            <p className="text-[11px] font-semibold text-rose-600">Falta: {faltan.join(', ')}.</p>
          )}

          <ModalFooter
            bleed="p-6"
            info={idLimpio || sinRuta ? `${sinRuta ? 'Sin ruta' : `Ruta ${idLimpio}`} · ${tipo}${conductor ? ` · ${conductor}` : auxiliares.length ? ` · ${auxiliares[0]}${auxiliares.length > 1 ? ` +${auxiliares.length - 1}` : ''}` : ''}` : undefined}
            secondary={
              <Button variant="secondary" size="lg" onClick={onClose}>
                Cancelar
              </Button>
            }
          >
            <Button id="btnGuardarRecarga" type="submit" variant="primary" size="lg" icon={ACTION_ICONS.recarga} disabled={guardando}>
              {guardando ? 'Guardando…' : inicial ? 'Guardar cambios' : 'Registrar recarga'}
            </Button>
          </ModalFooter>
        </form>

        <ResourcePicker
          isOpen={picker === 'piloto'}
          title={`Piloto · Agencia ${agencia}`}
          placeholder="Buscar por nombre, código o DPI..."
          items={pilotoItems}
          selectedIds={conductor ? [conductor] : []}
          onSelect={(id) => {
            setConductor(id);
            setAuxiliares((p) => p.filter((x) => x !== id));
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
        <ResourcePicker
          isOpen={picker === 'aux'}
          title={`Auxiliares · Agencia ${agencia}`}
          placeholder="Buscar por nombre, código o DPI..."
          items={auxItems}
          selectedIds={auxiliares}
          multi
          maxSelect={MAX_AUX}
          onSelect={(id) => setAuxiliares((p) => (p.includes(id) || p.length >= MAX_AUX ? p : [...p, id]))}
          onRemove={(id) => setAuxiliares((p) => p.filter((x) => x !== id))}
          onClose={() => setPicker(null)}
        />
      </div>
    </div>
  );
};
