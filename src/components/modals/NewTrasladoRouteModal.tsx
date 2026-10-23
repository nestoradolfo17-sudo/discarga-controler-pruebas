import React, { useState, useEffect, useRef } from 'react';
import { Route } from '../../types';
import { getGuatemalaDateForInput, formatDateToGuatemala } from '../../utils/date';
import { AGENCIA_LOCATION_OPTIONS } from '../../data/agencies';
import { MOTIVOS_TRASLADO, MOTIVO_TRASLADO_OTRAS } from '../../data/motivosTraslado';
import { Lock, ArrowLeftRight, ChevronDown, Search, Check } from 'lucide-react';
import { Button, IconButton } from '../ui/Button';
import { ACTION_ICONS } from '../ui/actionIcons';

interface NewTrasladoRouteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (route: Partial<Route>) => void;
  nextSuggestedId: string;
  agencia: string;
  // Agencias de origen posibles: las del usuario. Si hay una sola (o el
  // usuario eligió una agencia arriba), el origen queda fijo en esa.
  agenciasOrigen?: string[];
}

// Opciones de Origen / Destino (agencias/plantas disponibles para traslado).
// Este arreglo vive ahora en '../../data/agencies' porque también se reutiliza
// en el apartado de Usuarios para el control de acceso por agencia.

const ordenAZ = (l: string[]) => [...l].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
const normTxt = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Un solo botón que muestra lo elegido; al tocarlo abre la lista ordenada en
// cuadrícula pareja (con buscador si son muchas opciones).
const BotonLista: React.FC<{
  id: string;
  titulo: string;
  placeholder: string;
  valor: string;
  opciones: string[];
  onElegir: (v: string) => void;
  tono: 'indigo' | 'teal';
  buscador?: boolean;
  dosColumnas?: boolean;
}> = ({ id, titulo, placeholder, valor, opciones, onElegir, tono, buscador, dosColumnas }) => {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', esc);
    };
  }, [abierto]);
  const lista = q.trim() ? opciones.filter((o) => normTxt(o).includes(normTxt(q.trim()))) : opciones;
  const sel = tono === 'teal' ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-indigo-500 bg-indigo-50 text-indigo-800';
  return (
    <div ref={caja} className="relative">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => {
          setAbierto((v) => !v);
          setQ('');
        }}
        className={`w-full min-h-[44px] px-3 rounded-lg border-2 font-semibold flex items-center justify-between gap-2 cursor-pointer transition ${
          valor ? sel : 'border-slate-300 text-slate-400 hover:border-slate-400 bg-white'
        }`}
      >
        <span className="truncate">{valor || placeholder}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl p-2 space-y-2" role="listbox" aria-label={titulo}>
          {buscador && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                autoFocus
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (lista.length === 1) {
                      onElegir(lista[0]);
                      setAbierto(false);
                    }
                  }
                }}
                placeholder="Buscar…"
                aria-label={`Buscar ${titulo.toLowerCase()}`}
                className="w-full min-h-[38px] pl-8 pr-2 border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          )}
          <div className={`grid grid-cols-2 ${dosColumnas ? '' : 'sm:grid-cols-3'} gap-1.5 max-h-64 overflow-y-auto`}>
            {lista.map((o) => (
              <button
                key={o}
                type="button"
                role="option"
                aria-selected={valor === o}
                onClick={() => {
                  onElegir(o);
                  setAbierto(false);
                }}
                className={`min-h-[40px] px-2 rounded-lg border text-[11px] font-semibold text-left flex items-center justify-between gap-1 cursor-pointer ${
                  valor === o ? sel : 'border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <span className="truncate" title={o}>{o}</span>
                {valor === o && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            ))}
            {lista.length === 0 && <p className="col-span-full px-2 py-3 text-[11px] text-slate-500">Sin coincidencias.</p>}
          </div>
        </div>
      )}
    </div>
  );
};

export const NewTrasladoRouteModal: React.FC<NewTrasladoRouteModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  nextSuggestedId,
  agencia,
  agenciasOrigen = [] as string[],
}) => {
  const origenFijo = agenciasOrigen.length <= 1;
  const [fecha, setFecha] = useState('');
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [razon, setRazon] = useState<string>('');
  const [razonDetalle, setRazonDetalle] = useState('');
  // Volumen, paradas y demás datos de carga: opcionales (se activan con el check).
  const [conCarga, setConCarga] = useState(false);
  const [paradas, setParadas] = useState(1);
  const [cajasFisicas, setCajasFisicas] = useState<number | string>(0);
  const [peso, setPeso] = useState<number | string>(0);
  const [equipoFrio, setEquipoFrio] = useState(0);
  const [capacidad, setCapacidad] = useState('100%');
  const [distancia, setDistancia] = useState<number | string>(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setFecha(getGuatemalaDateForInput(new Date()));
      setOrigen(
        agenciasOrigen.length === 0 ? agencia : agenciasOrigen.length === 1 ? agenciasOrigen[0] : agenciasOrigen.includes(agencia) ? agencia : ''
      );
      setDestino('');
      setRazon('');
      setRazonDetalle('');
      setConCarga(false);
      setParadas(1);
      setCajasFisicas(0);
      setPeso(0);
      setEquipoFrio(0);
      setCapacidad('100%');
      setDistancia(0);
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const destinos = ordenAZ(AGENCIA_LOCATION_OPTIONS.filter((ag) => ag !== origen));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!origen) {
      setError('Selecciona la agencia de origen.');
      return;
    }
    if (!destino) {
      setError('Selecciona la agencia de destino.');
      return;
    }
    if (!razon) {
      setError('Selecciona el motivo del traslado.');
      return;
    }
    if (razon === MOTIVO_TRASLADO_OTRAS && !razonDetalle.trim()) {
      setError('Escribe cuál es el motivo (opción "Otras").');
      return;
    }
    // Corrección: antes no se validaba que Origen y Destino fueran distintos,
    // así que era posible registrar un "traslado" de una agencia hacia sí misma.
    if (origen && destino && origen === destino) {
      setError('El Origen y el Destino no pueden ser la misma agencia.');
      return;
    }
    setError('');
    onSubmit({
      id: nextSuggestedId.trim(),
      // La ruta pertenece a la agencia de ORIGEN.
      agencia: origen.trim(),
      mercado: origen.trim(),
      fecha: formatDateToGuatemala(fecha),
      paradas: conCarga ? Number(paradas) || 1 : 1,
      cajasFisicas: conCarga ? Number(cajasFisicas) || 0 : 0,
      pesoKg: conCarga ? Number(peso) || 0 : 0,
      equipoFrio: conCarga ? Number(equipoFrio) || 0 : 0,
      capacidadPorc: conCarga ? capacidad.trim() || '100%' : '100%',
      distancia: conCarga ? Number(distancia) || 0 : 0,
      viaje: '02:00',
      servicio: '08:00',
      descanso: '00:45',
      total: '10:45',
      cajas12Oz: 0,
      tipoRuta: 'Traslado',
      origen: origen.trim(),
      destino: destino.trim(),
      razonTraslado: razon,
      razonTrasladoDetalle: razonDetalle.trim(),
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden transform transition-all max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <ArrowLeftRight className="w-4 h-4 text-indigo-400" />
            <h3 className="font-bold text-sm">Registrar Nueva Ruta de Traslado</h3>
          </div>
          <IconButton icon={ACTION_ICONS.cerrar} label="Cerrar" onClick={onClose} className="text-slate-400 hover:text-white hover:bg-white/10" />
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-1 font-semibold text-slate-700 mb-1">
                ID de Ruta
                <Lock className="w-3 h-3 text-slate-400" />
              </label>
              <div className="w-full min-h-[44px] p-2.5 border border-slate-200 bg-slate-50 rounded-lg uppercase font-mono font-semibold text-slate-600">
                {nextSuggestedId}
              </div>
            </div>
            <div>
              <label htmlFor="trasladoFecha" className="block font-semibold text-slate-700 mb-1">Fecha Operación</label>
              <input
                id="trasladoFecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full min-h-[44px] p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          {/* Origen: siempre la agencia del usuario; botones solo si tiene más de una. */}
          <div>
            <p className="flex items-center gap-1 font-semibold text-slate-700 mb-1.5">
              Origen *{origenFijo && <Lock className="w-3 h-3 text-slate-400" aria-hidden />}
            </p>
            {origenFijo ? (
              <div className="w-full min-h-[44px] p-2.5 border border-slate-200 bg-slate-50 rounded-lg font-semibold text-slate-700">
                {origen || agencia}
              </div>
            ) : (
              <BotonLista
                id="trasladoOrigen"
                titulo="Agencia de origen"
                placeholder="Elegir agencia de origen"
                valor={origen}
                opciones={ordenAZ(agenciasOrigen)}
                tono="indigo"
                buscador={agenciasOrigen.length > 8}
                onElegir={(ag) => {
                  setOrigen(ag);
                  if (destino === ag) setDestino('');
                }}
              />
            )}
          </div>

          <div>
            <p className="font-semibold text-slate-700 mb-1.5">Destino *</p>
            <BotonLista
              id="trasladoDestino"
              titulo="Agencia de destino"
              placeholder="Elegir agencia de destino"
              valor={destino}
              opciones={destinos}
              tono="teal"
              buscador
              onElegir={setDestino}
            />
          </div>

          <div>
            <p className="font-semibold text-slate-700 mb-1.5">Motivo del traslado *</p>
            <BotonLista
              id="trasladoMotivo"
              titulo="Motivo del traslado"
              placeholder="Elegir motivo del traslado"
              valor={razon}
              opciones={MOTIVOS_TRASLADO}
              tono="indigo"
              dosColumnas
              onElegir={setRazon}
            />
            {razon && (
              <input
                type="text"
                value={razonDetalle}
                onChange={(e) => setRazonDetalle(e.target.value)}
                placeholder={razon === MOTIVO_TRASLADO_OTRAS ? 'Escribe el motivo *' : 'Detalle adicional (opcional)'}
                aria-label="Detalle del motivo"
                className="mt-2 w-full min-h-[44px] p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-medium outline-none"
              />
            )}
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-semibold text-[11px]">
              {error}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 p-3 space-y-3">
            <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer w-fit">
              <input
                id="trasladoConCarga"
                type="checkbox"
                checked={conCarga}
                onChange={(e) => setConCarga(e.target.checked)}
                className="w-5 h-5 cursor-pointer"
              />
              Registrar volumen y paradas (opcional)
            </label>
            {conCarga && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Cantidad de Paradas</label>
                    <input
                      type="number"
                      min="1"
                      value={paradas}
                      onChange={(e) => setParadas(parseInt(e.target.value) || 1)}
                      className="w-full min-h-[44px] p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-semibold outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Volumen (Cajas)</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={cajasFisicas}
                      onChange={(e) => setCajasFisicas(e.target.value)}
                      className="w-full min-h-[44px] p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Peso Total (Kg)</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={peso}
                      onChange={(e) => setPeso(e.target.value)}
                      className="w-full min-h-[44px] p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono outline-none"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Equipo Frío</label>
                    <input
                      type="number"
                      min="0"
                      value={equipoFrio}
                      onChange={(e) => setEquipoFrio(parseInt(e.target.value) || 0)}
                      className="w-full min-h-[44px] p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">% Capacidad</label>
                    <input
                      type="text"
                      value={capacidad}
                      onChange={(e) => setCapacidad(e.target.value)}
                      className="w-full min-h-[44px] p-2.5 border border-slate-300 rounded-lg font-mono outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Distancia (Km)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={distancia}
                      onChange={(e) => setDistancia(e.target.value)}
                      className="w-full min-h-[44px] p-2.5 border border-slate-300 rounded-lg font-mono outline-none"
                    />
                  </div>
                </div>
              </>
            )}
          </div>

<div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
            <Button variant="secondary" size="lg" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="lg" icon={ACTION_ICONS.nuevo}>
              Crear ruta de traslado
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
