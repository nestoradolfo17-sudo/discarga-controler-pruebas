import React, { useEffect, useMemo, useState } from 'react';
import { Truck as TruckIcon, UserRound, Users, X, AlertTriangle, Trash2 } from 'lucide-react';
import type { ApoyoRuta, MotivoApoyo, Prestamo, Route, Staff, Truck } from '../../types';
import { Button, IconButton } from '../ui/Button';
import { ModalFooter } from '../ui/ModalFooter';
import { ACTION_ICONS } from '../ui/actionIcons';
import { ResourcePicker, PickerItem, normalizeSearch } from '../ResourcePicker';
import { prestamosVigentes, fechaRutaISO } from '../../utils/prestamos';
import { MOTIVOS_APOYO, apoyosActivos, nuevoIdApoyo, viajeActual } from '../../utils/apoyos';
import { formatDateTimeToGuatemala } from '../../utils/date';

// --- Camión de apoyo ---
// Para rutas que salen en un camión, pero necesitan otro camión (más pequeño)
// que lleve la carga por caminos angostos o de acceso difícil. El apoyo queda
// registrado en la MISMA ruta (no se crea otra ruta ni se duplican cajas). El
// camión y la tripulación de apoyo quedan "En Ruta" hasta que se liquida la
// ruta principal; entonces quedan libres solos.

const MAX_AUX = 3;

interface Props {
  route: Route | null;
  trucks: Truck[];
  staff: Staff[];
  prestamos?: Prestamo[];
  usuario: string;
  onGuardar: (route: Route, apoyos: ApoyoRuta[]) => void;
  onClose: () => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const horaGT = () =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

export const ApoyoModal: React.FC<Props> = ({ route, trucks, staff, prestamos = [], usuario, onGuardar, onClose, onShowToast }) => {
  const [camionId, setCamionId] = useState('');
  const [conductor, setConductor] = useState('');
  const [auxiliares, setAuxiliares] = useState<string[]>([]);
  const [motivo, setMotivo] = useState<MotivoApoyo>('Camino angosto');
  const [detalle, setDetalle] = useState('');
  const [cajas, setCajas] = useState('');
  const [hora, setHora] = useState(horaGT);
  const [picker, setPicker] = useState<'camion' | 'piloto' | 'aux' | null>(null);
  const [intentado, setIntentado] = useState(false);
  const [porQuitar, setPorQuitar] = useState<string | null>(null);

  const routeKey = route ? `${route.id}|${route.fecha}|${route.agencia}` : '';
  // Al abrir para otra ruta, el formulario empieza limpio.
  useEffect(() => {
    setCamionId('');
    setConductor('');
    setAuxiliares([]);
    setMotivo('Camino angosto');
    setDetalle('');
    setCajas('');
    setHora(horaGT());
    setPicker(null);
    setIntentado(false);
    setPorQuitar(null);
  }, [routeKey]);

  const prestamosRuta = useMemo(() => (route ? prestamosVigentes(prestamos, fechaRutaISO(route)) : new Map<string, Prestamo>()), [prestamos, route]);
  const agenciaDeTruck = (t: Truck) => prestamosRuta.get(`t:${t.id}`)?.agenciaDestino || t.agencia;
  const agenciaDeStaff = (s: Staff) => prestamosRuta.get(`s:${s.id}`)?.agenciaDestino || s.agencia;
  const prestadoDe = (tipo: 't' | 's', id: string) => {
    const p = prestamosRuta.get(`${tipo}:${id}`);
    return p && route && p.agenciaDestino === route.agencia ? `Prestado de ${p.agenciaOrigen}` : undefined;
  };

  const activos = route ? apoyosActivos(route) : [];
  const usadosCamion = new Set([route?.asignacion?.camionId, ...activos.map((a) => a.camionId)].filter(Boolean) as string[]);
  const a0 = route?.asignacion;
  const usadosPersona = new Set(
    [a0?.conductor, a0?.auxiliar1, a0?.auxiliar2, a0?.auxiliar3, a0?.auxiliar4, ...activos.flatMap((a) => [a.conductor, ...a.auxiliares])].filter(Boolean) as string[]
  );

  const camionItems = useMemo<PickerItem[]>(
    () =>
      !route
        ? []
        : trucks
            .filter((t) => agenciaDeTruck(t) === route.agencia && t.estado !== 'Baja' && !usadosCamion.has(t.id))
            .map((t) => {
              const libre = t.estado === 'Disponible';
              return {
                id: t.id,
                title: t.idCamion ? `ID ${t.idCamion} · ${t.placa}` : t.placa,
                subtitle: [t.capacidad, t.ton ? `${t.ton} ton` : '', t.proveedor].filter(Boolean).join(' · '),
                searchText: normalizeSearch([t.placa, t.idCamion, t.capacidad, t.proveedor].join(' ')),
                status: libre ? 'disponible' : 'enruta',
                statusLabel: libre ? 'Disponible' : t.estado,
                hidden: !libre,
                extraBadge: prestadoDe('t', t.id),
              } as PickerItem;
            }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [route, trucks, prestamosRuta, activos.length]
  );
  const personaItem = (s: Staff): PickerItem => {
    const libre = s.estado !== 'En Ruta';
    return {
      id: s.nombre,
      title: s.nombre,
      subtitle: [s.puesto, s.codigoCorto || s.codigo].filter(Boolean).join(' · '),
      searchText: normalizeSearch([s.nombre, s.codigo, s.codigoCorto, s.dpi].join(' ')),
      status: libre ? 'disponible' : 'enruta',
      statusLabel: libre ? (s.rol === 'Conductor' ? 'Piloto' : 'Auxiliar') : 'En Ruta',
      hidden: !libre,
      extraBadge: prestadoDe('s', s.id),
    };
  };
  const personal = useMemo(
    () =>
      !route
        ? []
        : staff
            .filter((s) => agenciaDeStaff(s) === route.agencia && s.estado !== 'Baja' && s.estatus !== 'BAJA' && !usadosPersona.has(s.nombre))
            .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [route, staff, prestamosRuta, activos.length]
  );
  const pilotoItems = useMemo(
    () => personal.filter((s) => s.rol === 'Conductor' || s.puesto === 'VPP' || s.puesto === 'VPPB').map(personaItem),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [personal]
  );
  const auxItems = useMemo(
    () => personal.filter((s) => s.nombre !== conductor).map(personaItem),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [personal, conductor]
  );

  if (!route) return null;

  const camion = trucks.find((t) => t.id === camionId);
  const staffId = (nombre: string) => staff.find((s) => s.nombre === nombre && agenciaDeStaff(s) === route.agencia)?.id;
  const cajasNum = cajas.trim() ? Number(cajas.replace(/,/g, '')) : undefined;
  const faltan: string[] = [];
  if (!camion) faltan.push('camión de apoyo');
  if (!conductor) faltan.push('piloto');
  if (motivo === 'Otro' && !detalle.trim()) faltan.push('detalle del motivo');
  if (cajasNum !== undefined && (!Number.isFinite(cajasNum) || cajasNum < 0)) faltan.push('cajas (número válido)');
  const enTransito = route.estado === 'En Tránsito';

  const agregar = (e: React.FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    if (!enTransito) return onShowToast('Solo se agrega camión de apoyo a una ruta en tránsito.', 'error');
    if (faltan.length || !camion) return;
    const nuevo: ApoyoRuta = {
      id: nuevoIdApoyo(),
      intento: viajeActual(route),
      camionId: camion.id,
      camionPlaca: camion.placa,
      conductor,
      conductorId: staffId(conductor),
      auxiliares,
      auxiliarIds: auxiliares.map((n) => staffId(n) || null),
      motivo,
      detalle: detalle.trim() || undefined,
      cajas: cajasNum,
      horaSalida: hora || undefined,
      registradoPor: usuario,
      registradoEn: formatDateTimeToGuatemala(new Date()),
    };
    onGuardar(route, [...(route.apoyos || []), nuevo]);
    onShowToast(`Camión de apoyo ${camion.idCamion ? `ID ${camion.idCamion}` : camion.placa} agregado a la ruta ${route.id}. Queda En Ruta hasta liquidar la ruta.`, 'success');
    setCamionId('');
    setConductor('');
    setAuxiliares([]);
    setDetalle('');
    setCajas('');
    setHora(horaGT());
    setIntentado(false);
  };

  const quitar = (id: string) => {
    onGuardar(route, (route.apoyos || []).filter((a) => a.id !== id));
    setPorQuitar(null);
    onShowToast('Camión de apoyo quitado de la ruta. Camión y tripulación quedan libres.', 'info');
  };

  const input = 'w-full min-h-[44px] px-3 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-300 bg-white';
  const label = 'block text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1';
  const nombreCamion = (id: string, placa: string) => {
    const t = trucks.find((x) => x.id === id);
    return t?.idCamion ? `ID ${t.idCamion} · ${placa}` : placa;
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-3 sm:p-4">
      <div role="dialog" aria-label="Camión de apoyo" className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-sky-600 flex items-center justify-center">
              <TruckIcon className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-bold text-sm">Camión de apoyo · Ruta {route.id}</h3>
              <p className="text-[11px] text-slate-400">
                {route.agencia} · Camión principal: {a0 ? `${nombreCamion(a0.camionId, a0.camionPlaca)}${a0.conductor ? ` · ${a0.conductor}` : ''}` : 'sin asignar'}
              </p>
            </div>
          </div>
          <IconButton icon={ACTION_ICONS.cerrar} label="Cerrar" onClick={onClose} className="text-slate-300 hover:text-white hover:bg-slate-800" />
        </div>

        <form id="formApoyo" onSubmit={agregar} className="p-6 space-y-5 text-xs overflow-y-auto flex-1">
          {activos.length > 0 && (
            <div>
              <p className={label}>Apoyos en esta ruta ({activos.length})</p>
              <div className="space-y-2">
                {activos.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-start gap-2 px-3 py-2 rounded-xl border border-sky-200 bg-sky-50">
                    <TruckIcon className="w-4 h-4 text-sky-700 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-[180px]">
                      <p className="font-bold text-slate-800">
                        {nombreCamion(a.camionId, a.camionPlaca)} · {a.conductor}
                      </p>
                      <p className="text-[11px] text-slate-600">
                        {a.motivo}
                        {a.detalle ? ` (${a.detalle})` : ''}
                        {a.cajas !== undefined ? ` · ${a.cajas.toLocaleString('en-US')} cj` : ''}
                        {a.horaSalida ? ` · salió ${a.horaSalida}` : ''}
                        {a.auxiliares.length ? ` · Aux: ${a.auxiliares.join(', ')}` : ''}
                      </p>
                      <p className="text-[10px] text-slate-400">Registró {a.registradoPor} · {a.registradoEn}</p>
                    </div>
                    {porQuitar === a.id ? (
                      <span className="flex items-center gap-1">
                        <span className="text-[11px] font-semibold text-rose-700">¿Quitar?</span>
                        <button type="button" onClick={() => quitar(a.id)} className="min-h-[36px] px-2.5 rounded-lg bg-rose-600 text-white text-[11px] font-bold cursor-pointer">
                          Sí, quitar
                        </button>
                        <button type="button" onClick={() => setPorQuitar(null)} className="min-h-[36px] px-2.5 rounded-lg border border-slate-300 bg-white text-[11px] font-bold cursor-pointer">
                          No
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPorQuitar(a.id)}
                        aria-label={`Quitar apoyo ${a.camionPlaca}`}
                        className="min-h-[36px] px-2.5 rounded-lg border border-rose-200 bg-white text-rose-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer hover:bg-rose-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Quitar
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[10.5px] text-slate-400">Al liquidar la ruta, los apoyos se cierran solos y el camión y la tripulación quedan libres.</p>
            </div>
          )}

          {!enTransito ? (
            <p className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px]">
              <AlertTriangle className="w-4 h-4 shrink-0" /> Solo se agrega camión de apoyo a una ruta en tránsito (ya asignada).
            </p>
          ) : (
            <>
              <p className="text-[11px] font-bold text-sky-800 uppercase tracking-wide">{activos.length ? 'Agregar otro camión de apoyo' : 'Agregar camión de apoyo'}</p>
              <div>
                <p className={label}>Camión de apoyo *</p>
                <button
                  type="button"
                  onClick={() => setPicker('camion')}
                  className={`w-full min-h-[52px] px-3 rounded-xl border-2 border-dashed text-left flex items-center gap-2 cursor-pointer ${
                    camion ? 'border-sky-300 bg-sky-50' : intentado ? 'border-rose-300' : 'border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <TruckIcon className="w-4 h-4 text-sky-700 shrink-0" />
                  <span className={`flex-1 text-sm ${camion ? 'font-bold text-slate-800' : 'text-slate-400'}`}>
                    {camion ? nombreCamion(camion.id, camion.placa) : 'Tocar para buscar camión'}
                  </span>
                  <span className="text-[11px] font-bold text-blue-700">{camion ? 'Cambiar' : 'Elegir'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className={label}>Piloto *</p>
                  <button
                    type="button"
                    onClick={() => setPicker('piloto')}
                    className={`w-full min-h-[52px] px-3 rounded-xl border-2 border-dashed text-left flex items-center gap-2 cursor-pointer ${
                      conductor ? 'border-indigo-300 bg-indigo-50' : intentado ? 'border-rose-300' : 'border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <UserRound className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span className={`flex-1 text-sm ${conductor ? 'font-bold text-slate-800' : 'text-slate-400'}`}>{conductor || 'Tocar para buscar piloto'}</span>
                    <span className="text-[11px] font-bold text-blue-700">{conductor ? 'Cambiar' : 'Elegir'}</span>
                  </button>
                </div>
                <div>
                  <p className={label}>Auxiliares (hasta {MAX_AUX})</p>
                  <button
                    type="button"
                    onClick={() => setPicker('aux')}
                    className={`w-full min-h-[52px] px-3 rounded-xl border-2 border-dashed text-left flex items-center gap-2 cursor-pointer hover:bg-slate-50 ${
                      auxiliares.length ? 'border-indigo-300 bg-indigo-50' : 'border-slate-300'
                    }`}
                  >
                    <Users className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span className={`flex-1 text-sm ${auxiliares.length ? 'font-bold text-slate-800' : 'text-slate-400'}`}>
                      {auxiliares.length ? `${auxiliares.length} auxiliar(es)` : 'Opcional'}
                    </span>
                    <span className="text-[11px] font-bold text-blue-700">Agregar</span>
                  </button>
                  {auxiliares.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {auxiliares.map((n) => (
                        <span key={n} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-slate-100 border border-slate-200 font-semibold text-slate-700">
                          {n}
                          <button
                            type="button"
                            aria-label={`Quitar a ${n}`}
                            onClick={() => setAuxiliares((p) => p.filter((x) => x !== n))}
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
                <p className={label}>Motivo *</p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Motivo del apoyo">
                  {MOTIVOS_APOYO.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={motivo === m}
                      onClick={() => setMotivo(m)}
                      className={`min-h-[40px] px-3 rounded-lg border text-xs font-bold cursor-pointer ${
                        motivo === m ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-3">
                  <label htmlFor="apDetalle" className={label}>Detalle {motivo === 'Otro' ? '*' : '(opcional)'}</label>
                  <input
                    id="apDetalle"
                    value={detalle}
                    maxLength={200}
                    onChange={(e) => setDetalle(e.target.value)}
                    placeholder="Ej. Calle de terracería, aldea El Rosario"
                    className={`${input} ${intentado && motivo === 'Otro' && !detalle.trim() ? 'border-rose-400' : ''}`}
                  />
                </div>
                <div>
                  <label htmlFor="apCajas" className={label}>Cajas al apoyo (opcional)</label>
                  <input id="apCajas" inputMode="decimal" value={cajas} onChange={(e) => setCajas(e.target.value)} placeholder="Ej. 150" className={input} />
                </div>
                <div>
                  <label htmlFor="apHora" className={label}>Hora de salida</label>
                  <input id="apHora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={input} />
                </div>
              </div>

              {intentado && faltan.length > 0 && <p className="text-[11px] font-semibold text-rose-600">Falta: {faltan.join(', ')}.</p>}
            </>
          )}

          <ModalFooter
            bleed="p-6"
            secondary={
              <Button variant="secondary" size="lg" onClick={onClose}>
                Cerrar
              </Button>
            }
          >
            {enTransito && (
              <Button id="btnAgregarApoyo" type="submit" variant="primary" size="lg" icon={ACTION_ICONS.apoyo}>
                Agregar apoyo
              </Button>
            )}
          </ModalFooter>
        </form>

        <ResourcePicker
          isOpen={picker === 'camion'}
          title={`Camión de apoyo · Agencia ${route.agencia}`}
          placeholder="Buscar por placa o ID de camión..."
          items={camionItems}
          selectedIds={camionId ? [camionId] : []}
          onSelect={(id) => {
            setCamionId(id);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
        <ResourcePicker
          isOpen={picker === 'piloto'}
          title={`Piloto del apoyo · Agencia ${route.agencia}`}
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
          title={`Auxiliares del apoyo · Agencia ${route.agencia}`}
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
