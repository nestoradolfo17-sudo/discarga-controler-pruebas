import React, { useEffect, useMemo, useState } from 'react';
import { Repeat, Search, UserRound, Users, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Recarga, Route, Staff, TipoRecarga } from '../../types';
import { Button, IconButton } from '../ui/Button';
import { ModalFooter } from '../ui/ModalFooter';
import { ACTION_ICONS } from '../ui/actionIcons';
import { ResourcePicker, PickerItem } from '../ResourcePicker';
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
  agencias: string[];
  agenciaPorDefecto: string;
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
  agencias,
  agenciaPorDefecto,
  existentes,
  guardando,
  avisoReautorizar = false,
  onGuardar,
}) => {
  const [fecha, setFecha] = useState('');
  const [rutaId, setRutaId] = useState('');
  const [agencia, setAgencia] = useState('');
  const [tipo, setTipo] = useState<TipoRecarga>('Simple');
  const [conductor, setConductor] = useState('');
  const [auxiliares, setAuxiliares] = useState<string[]>([]);
  const [comentario, setComentario] = useState('');
  const [picker, setPicker] = useState<'piloto' | 'aux' | null>(null);
  const [intentado, setIntentado] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFecha(inicial?.fecha || getGuatemalaDateForInput());
    setRutaId(inicial?.rutaId || '');
    setAgencia(inicial?.agencia || agenciaPorDefecto || (agencias.length === 1 ? agencias[0] : ''));
    setTipo(inicial?.tipo || 'Simple');
    setConductor(inicial?.conductor || '');
    setAuxiliares(inicial?.auxiliares || []);
    setComentario(inicial?.comentario || '');
    setPicker(null);
    setIntentado(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, inicial]);

  // Rutas de la fecha elegida (para sugerir números y completar datos).
  const rutasDelDia = useMemo(() => rutas.filter((r) => fechaRutaISO(r) === fecha), [rutas, fecha]);
  const coincidencias = useMemo(() => {
    const id = rutaId.trim();
    if (!id) return [] as Route[];
    return rutasDelDia.filter((r) => String(r.id).trim() === id);
  }, [rutasDelDia, rutaId]);
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

  const personalAgencia = useMemo(
    () =>
      staff
        .filter((s) => (!agencia || s.agencia === agencia) && s.estado !== 'Baja' && s.estatus !== 'BAJA')
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [staff, agencia]
  );
  const toItem = (s: Staff): PickerItem => ({
    id: s.nombre,
    title: s.nombre,
    subtitle: [s.puesto, s.codigoCorto || s.codigo].filter(Boolean).join(' · '),
    searchText: norm([s.nombre, s.codigo, s.codigoCorto, s.dpi].join(' ')),
    status: 'disponible',
    statusLabel: s.rol === 'Conductor' ? 'Piloto' : 'Auxiliar',
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

  const idLimpio = rutaId.trim();
  const duplicada = existentes.find(
    (x) => x.id !== inicial?.id && x.fecha === fecha && x.agencia === agencia && String(x.rutaId).trim() === idLimpio
  );
  const faltan: string[] = [];
  if (!fecha) faltan.push('fecha');
  if (!idLimpio) faltan.push('número de ruta');
  if (!agencia) faltan.push('agencia');
  if (!conductor) faltan.push('piloto');
  const valido = faltan.length === 0;

  const staffId = (nombre: string) => staff.find((s) => s.nombre === nombre && (!agencia || s.agencia === agencia))?.id;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (!valido || guardando) return;
    onGuardar({
      fecha,
      rutaId: idLimpio,
      agencia,
      segmento: rutaEncontrada?.segmento || inicial?.segmento,
      tipo,
      conductor,
      conductorId: staffId(conductor),
      auxiliares,
      auxiliarIds: auxiliares.map((n) => staffId(n) || null),
      camionPlaca: asig?.camionPlaca || inicial?.camionPlaca,
      comentario: comentario.trim() || undefined,
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
              <h3 className="font-bold text-sm">{inicial ? 'Editar recarga' : 'Nueva recarga'}</h3>
              <p className="text-[11px] text-slate-400">Ruta, tripulación que la sacó y fecha de la recarga</p>
            </div>
          </div>
          <IconButton icon={ACTION_ICONS.cerrar} label="Cerrar sin guardar" onClick={onClose} className="text-slate-300 hover:text-white hover:bg-slate-800" />
        </div>

        <form id="formRecarga" onSubmit={submit} className="p-6 space-y-5 text-xs overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="recFecha" className={label}>Fecha de la recarga *</label>
              <input id="recFecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={input} />
            </div>
            <div>
              <label htmlFor="recRuta" className={label}>Número de ruta *</label>
              <input
                id="recRuta"
                list="recRutasDia"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Ej. 2105"
                value={rutaId}
                onChange={(e) => setRutaId(e.target.value)}
                className={`${input} font-mono font-bold ${intentado && !idLimpio ? 'border-rose-400' : ''}`}
              />
              <datalist id="recRutasDia">
                {Array.from(new Set(rutasDelDia.filter((r) => !agencia || r.agencia === agencia).map((r) => String(r.id)))).map((id) => (
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className={label}>Piloto *</p>
              <button
                type="button"
                onClick={() => setPicker('piloto')}
                disabled={!agencia}
                className={`w-full min-h-[52px] px-3 rounded-xl border-2 border-dashed text-left flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
                  conductor ? 'border-indigo-300 bg-indigo-50' : intentado ? 'border-rose-300' : 'border-slate-300 hover:bg-slate-50'
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
                className="w-full min-h-[52px] px-3 rounded-xl border-2 border-dashed border-slate-300 text-left flex items-center gap-2 cursor-pointer hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
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
                Ya hay una recarga <b>{duplicada.tipo}</b> de la ruta {duplicada.rutaId} ese día ({duplicada.conductor || 'sin piloto'}). Si es la
                misma, mejor edítala y cambia el tipo a Doble o Triple.
              </span>
            </div>
          )}
          {intentado && !valido && (
            <p className="text-[11px] font-semibold text-rose-600">Falta: {faltan.join(', ')}.</p>
          )}

          <ModalFooter
            bleed="p-6"
            info={idLimpio ? `Ruta ${idLimpio} · ${tipo}${conductor ? ` · ${conductor}` : ''}` : undefined}
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
