import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Truck as TruckIcon, UserRound, Users, X, AlertTriangle } from 'lucide-react';
import { Prestamo, RecursoPrestamo, Staff, Truck, TipoRecursoPrestamo } from '../../types';
import { Button, IconButton } from '../ui/Button';
import { ModalFooter } from '../ui/ModalFooter';
import { ACTION_ICONS } from '../ui/actionIcons';
import { ResourcePicker, PickerItem } from '../ResourcePicker';
import { getGuatemalaDateForInput } from '../../utils/date';
import { estadoPrestamo, fechaDevolucionISO, fmtFecha, formatoCorrelativoPrestamo, diasEntre } from '../../utils/prestamos';

// --- Nuevo préstamo / Editar préstamo ---
// Agencia que presta (origen), agencia que recibe (destino), rango de fechas,
// pilotos, auxiliares y camiones de la agencia origen, y el motivo. "Solicitado
// por" es automático (usuario en sesión).

interface PrestamoModalProps {
  isOpen: boolean;
  onClose: () => void;
  inicial: Prestamo | null;
  staff: Staff[];
  trucks: Truck[];
  agenciasOrigen: string[];
  agenciasDestino: string[];
  agenciaPorDefecto: string;
  existentes: Prestamo[];
  usuario: string;
  guardando: boolean;
  avisoReautorizar?: boolean;
  onGuardar: (datos: Pick<Prestamo, 'agenciaOrigen' | 'agenciaDestino' | 'fechaInicio' | 'fechaFin' | 'recursos' | 'motivo'>) => void;
}

const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const esPiloto = (s: Staff) => s.puesto === 'VPP' || s.puesto === 'VPPB' || s.rol === 'Conductor';

/** Último día que cubre un préstamo (si se devolvió antes, el día de la devolución). */
const finReal = (p: Prestamo) => {
  const dev = fechaDevolucionISO(p);
  return dev && dev < p.fechaFin ? dev : p.fechaFin;
};

export const PrestamoModal: React.FC<PrestamoModalProps> = ({
  isOpen,
  onClose,
  inicial,
  staff,
  trucks,
  agenciasOrigen,
  agenciasDestino,
  agenciaPorDefecto,
  existentes,
  usuario,
  guardando,
  avisoReautorizar = false,
  onGuardar,
}) => {
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [recursos, setRecursos] = useState<RecursoPrestamo[]>([]);
  const [motivo, setMotivo] = useState('');
  const [picker, setPicker] = useState<TipoRecursoPrestamo | null>(null);
  const [intentado, setIntentado] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const hoy = getGuatemalaDateForInput();
    setOrigen(inicial?.agenciaOrigen || agenciaPorDefecto || '');
    setDestino(inicial?.agenciaDestino || '');
    setDesde(inicial?.fechaInicio || hoy);
    setHasta(inicial?.fechaFin || hoy);
    setRecursos(inicial?.recursos || []);
    setMotivo(inicial?.motivo || '');
    setPicker(null);
    setIntentado(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, inicial]);

  // Préstamos que se cruzan con este rango (para no prestar dos veces lo mismo).
  const ocupados = useMemo(() => {
    const m = new Map<string, Prestamo>();
    if (!desde || !hasta) return m;
    existentes.forEach((p) => {
      if (p.id === inicial?.id || estadoPrestamo(p) === 'Rechazado') return;
      if (p.fechaInicio > hasta || finReal(p) < desde) return;
      p.recursos.forEach((r) => m.set(`${r.tipo === 'camion' ? 't' : 's'}:${r.id}`, p));
    });
    return m;
  }, [existentes, inicial, desde, hasta]);

  const etiquetaOcupado = (p: Prestamo) =>
    `Ya prestado a ${p.agenciaDestino} (${formatoCorrelativoPrestamo(p.correlativo) || 'préstamo'} · ${fmtFecha(p.fechaInicio)}–${fmtFecha(p.fechaFin)})`;

  const staffOrigen = useMemo(
    () => staff.filter((s) => s.agencia === origen && s.estado !== 'Baja' && s.estatus !== 'BAJA').sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [staff, origen]
  );
  const trucksOrigen = useMemo(
    () => trucks.filter((t) => t.agencia === origen && t.estado !== 'Baja').sort((a, b) => a.placa.localeCompare(b.placa)),
    [trucks, origen]
  );

  const itemPersona = (s: Staff): PickerItem => {
    const p = ocupados.get(`s:${s.id}`);
    return {
      id: s.id,
      title: s.nombre,
      subtitle: `${s.puesto || (esPiloto(s) ? 'VPP' : 'APP')} · Cód. ${s.codigoCorto || s.codigo || '—'} · DPI ${s.dpi || 'N/A'}`,
      searchText: norm([s.nombre, s.codigo, s.codigoCorto, s.dpi, s.puesto].join(' ')),
      status: p ? 'conflicto' : s.estado === 'En Ruta' ? 'enruta' : 'disponible',
      statusLabel: p ? etiquetaOcupado(p) : s.estado === 'En Ruta' ? 'En ruta hoy en su agencia' : 'Disponible',
      disabled: !!p,
    };
  };
  const pilotoItems = useMemo(() => staffOrigen.filter(esPiloto).map(itemPersona), [staffOrigen, ocupados]); // eslint-disable-line react-hooks/exhaustive-deps
  const auxItems = useMemo(() => staffOrigen.filter((s) => !esPiloto(s)).map(itemPersona), [staffOrigen, ocupados]); // eslint-disable-line react-hooks/exhaustive-deps
  const camionItems = useMemo(
    () =>
      trucksOrigen.map((t): PickerItem => {
        const p = ocupados.get(`t:${t.id}`);
        return {
          id: t.id,
          title: t.idCamion ? `ID ${t.idCamion}` : t.placa,
          subtitle: `Placa ${t.placa} · Capacidad ${t.capacidad}${t.proveedor ? ` · ${t.proveedor}` : ''}`,
          searchText: norm([t.placa, t.idCamion, t.proveedor, t.capacidad].join(' ')),
          status: p ? 'conflicto' : t.estado === 'En Ruta' ? 'enruta' : 'disponible',
          statusLabel: p ? etiquetaOcupado(p) : t.estado === 'En Ruta' ? 'En ruta hoy en su agencia' : 'Disponible',
          disabled: !!p,
        };
      }),
    [trucksOrigen, ocupados]
  );

  if (!isOpen) return null;

  const idsDe = (tipo: TipoRecursoPrestamo) => recursos.filter((r) => r.tipo === tipo).map((r) => r.id);
  const agregar = (tipo: TipoRecursoPrestamo, id: string) => {
    if (recursos.some((r) => r.tipo === tipo && r.id === id)) return;
    if (tipo === 'camion') {
      const t = trucks.find((x) => x.id === id);
      if (t) setRecursos((p) => [...p, { tipo, id, nombre: t.placa, detalle: t.idCamion ? `ID ${t.idCamion}` : undefined }]);
    } else {
      const s = staff.find((x) => x.id === id);
      if (s) setRecursos((p) => [...p, { tipo, id, nombre: s.nombre, detalle: s.puesto || (tipo === 'piloto' ? 'VPP' : 'APP') }]);
    }
  };
  const quitar = (tipo: TipoRecursoPrestamo, id: string) => setRecursos((p) => p.filter((r) => !(r.tipo === tipo && r.id === id)));

  // Recursos elegidos que ya están prestados en esas fechas (por si cambió el rango).
  const conflictos = recursos.filter((r) => ocupados.has(`${r.tipo === 'camion' ? 't' : 's'}:${r.id}`));
  const fueraDeOrigen = recursos.filter((r) =>
    r.tipo === 'camion' ? trucks.find((t) => t.id === r.id)?.agencia !== origen : staff.find((s) => s.id === r.id)?.agencia !== origen
  );

  const faltan: string[] = [];
  if (!origen) faltan.push('agencia que presta');
  if (!destino) faltan.push('agencia que recibe');
  if (origen && destino && origen === destino) faltan.push('agencias distintas');
  if (!desde || !hasta) faltan.push('fechas');
  if (desde && hasta && hasta < desde) faltan.push('"Hasta" no puede ser antes de "Desde"');
  if (recursos.length === 0) faltan.push('al menos un piloto, auxiliar o camión');
  if (motivo.trim().length < 5) faltan.push('motivo (mínimo 5 letras)');
  if (conflictos.length) faltan.push(`${conflictos.map((c) => c.nombre).join(', ')} ya está(n) prestado(s) en esas fechas`);
  if (fueraDeOrigen.length) faltan.push(`${fueraDeOrigen.map((c) => c.nombre).join(', ')} no es de ${origen}`);
  const valido = faltan.length === 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (!valido || guardando) return;
    onGuardar({ agenciaOrigen: origen, agenciaDestino: destino, fechaInicio: desde, fechaFin: hasta, recursos, motivo: motivo.trim() });
  };

  const input = 'w-full min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-300 bg-white';
  const label = 'block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1';
  const dias = desde && hasta && hasta >= desde ? diasEntre(desde, hasta) : 0;

  const bloqueRecursos = (tipo: TipoRecursoPrestamo, titulo: string, Icono: React.ComponentType<{ className?: string }>, texto: string) => {
    const lista = recursos.filter((r) => r.tipo === tipo);
    return (
      <div>
        <p className={label}>{titulo}</p>
        <button
          type="button"
          onClick={() => setPicker(tipo)}
          disabled={!origen}
          className={`w-full min-h-[48px] px-3 rounded-xl border-2 border-dashed text-left flex items-center gap-2 cursor-pointer hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 ${
            lista.length ? 'border-indigo-300 bg-indigo-50' : 'border-slate-300'
          }`}
        >
          <Icono className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className={`flex-1 text-sm ${lista.length ? 'font-bold text-slate-800' : 'text-slate-400'}`}>
            {lista.length ? `${lista.length} elegido(s)` : origen ? texto : 'Elige primero la agencia que presta'}
          </span>
          <span className="text-[11px] font-bold text-blue-700">Agregar</span>
        </button>
        {lista.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {lista.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-700">
                {r.nombre}
                {r.detalle && <span className="text-slate-400 font-normal">{r.detalle}</span>}
                <button
                  type="button"
                  aria-label={`Quitar ${r.nombre}`}
                  onClick={() => quitar(tipo, r.id)}
                  className="w-5 h-5 rounded-full hover:bg-slate-300 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-3 sm:p-4">
      <div
        role="dialog"
        aria-label={inicial ? 'Editar préstamo' : 'Nuevo préstamo'}
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]"
      >
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center">
              <ArrowLeftRight className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-bold text-sm">
                {inicial ? 'Editar préstamo' : 'Nuevo préstamo a otra agencia'}
                {inicial?.correlativo ? <span className="ml-2 font-mono text-teal-300">{formatoCorrelativoPrestamo(inicial.correlativo)}</span> : null}
              </h3>
              <p className="text-[11px] text-slate-400">Pilotos, auxiliares y camiones que trabajan por unos días en otra agencia</p>
            </div>
          </div>
          <IconButton icon={ACTION_ICONS.cerrar} label="Cerrar sin guardar" onClick={onClose} className="text-slate-300 hover:text-white hover:bg-slate-800" />
        </div>

        <form id="formPrestamo" onSubmit={submit} className="p-6 space-y-5 text-xs overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="preOrigen" className={label}>Agencia que presta *</label>
              <select
                id="preOrigen"
                value={origen}
                onChange={(e) => {
                  setOrigen(e.target.value);
                  setRecursos([]);
                }}
                className={`${input} ${intentado && !origen ? 'border-rose-400' : ''}`}
              >
                <option value="">— Elige —</option>
                {agenciasOrigen.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="preDestino" className={label}>Agencia que recibe *</label>
              <select
                id="preDestino"
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                className={`${input} ${intentado && (!destino || destino === origen) ? 'border-rose-400' : ''}`}
              >
                <option value="">— Elige —</option>
                {agenciasDestino
                  .filter((a) => a !== origen)
                  .map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label htmlFor="preDesde" className={label}>Desde *</label>
              <input id="preDesde" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} className={input} />
            </div>
            <div>
              <label htmlFor="preHasta" className={label}>Hasta *</label>
              <input id="preHasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} className={input} />
            </div>
          </div>
          {dias > 0 && (
            <p className="-mt-2 text-[11px] text-slate-500">
              {dias} día(s): del {fmtFecha(desde)} al {fmtFecha(hasta)}. En esas fechas {destino || 'la agencia que recibe'} podrá asignarlos y{' '}
              {origen || 'la agencia que presta'} no.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {bloqueRecursos('piloto', 'Pilotos', UserRound, 'Agregar pilotos')}
            {bloqueRecursos('auxiliar', 'Auxiliares', Users, 'Agregar auxiliares')}
            {bloqueRecursos('camion', 'Camiones', TruckIcon, 'Agregar camiones')}
          </div>

          <div>
            <label htmlFor="preMotivo" className={label}>Motivo *</label>
            <textarea
              id="preMotivo"
              rows={2}
              maxLength={300}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. Apoyo por temporada alta, falta de pilotos en la agencia…"
              className={`w-full p-3 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-300 resize-y ${
                intentado && motivo.trim().length < 5 ? 'border-rose-400' : 'border-slate-300'
              }`}
            />
          </div>

          <div>
            <p className={label}>Solicitado por</p>
            <div id="preSolicitadoPor" className="w-full min-h-[44px] px-3 border border-slate-200 bg-slate-100 rounded-lg text-sm font-bold text-slate-700 flex items-center">
              {inicial?.solicitadoPor || usuario}
            </div>
            <p className="mt-1 text-[10.5px] text-slate-400">Automático: usuario que registra el préstamo.</p>
          </div>

          {!inicial && (
            <p className="flex items-start gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-[11px]">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
              <span>
                El préstamo aplica desde que se registra. Queda <b>Pendiente</b> de autorización del administrador; las recargas hechas en préstamo
                solo se pagan cuando el préstamo está <b>autorizado y devuelto</b>.
              </span>
            </p>
          )}
          {avisoReautorizar && (
            <p className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px]">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Si cambias algo, el préstamo vuelve a <b className="mx-1">Pendiente</b> y necesita nueva autorización.
            </p>
          )}
          {intentado && !valido && <p className="text-[11px] font-semibold text-rose-600">Falta / revisar: {faltan.join('; ')}.</p>}

          <ModalFooter
            bleed="p-6"
            info={origen && destino ? `${origen} → ${destino} · ${recursos.length} recurso(s)` : undefined}
            secondary={
              <Button variant="secondary" size="lg" onClick={onClose}>
                Cancelar
              </Button>
            }
          >
            <Button id="btnGuardarPrestamo" type="submit" variant="primary" size="lg" icon={ArrowLeftRight} disabled={guardando}>
              {guardando ? 'Guardando…' : inicial ? 'Guardar cambios' : 'Registrar préstamo'}
            </Button>
          </ModalFooter>
        </form>

        {(['piloto', 'auxiliar', 'camion'] as TipoRecursoPrestamo[]).map((tipo) => (
          <ResourcePicker
            key={tipo}
            isOpen={picker === tipo}
            title={`${tipo === 'piloto' ? 'Pilotos' : tipo === 'auxiliar' ? 'Auxiliares' : 'Camiones'} · ${origen}`}
            placeholder={tipo === 'camion' ? 'Buscar por placa o ID...' : 'Buscar por nombre, código o DPI...'}
            items={tipo === 'piloto' ? pilotoItems : tipo === 'auxiliar' ? auxItems : camionItems}
            selectedIds={idsDe(tipo)}
            multi
            maxSelect={50}
            onSelect={(id) => agregar(tipo, id)}
            onRemove={(id) => quitar(tipo, id)}
            onClose={() => setPicker(null)}
          />
        ))}
      </div>
    </div>
  );
};
