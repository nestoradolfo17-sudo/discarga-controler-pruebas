import React, { useState, useEffect } from 'react';
import { Route } from '../../types';
import { getGuatemalaDateForInput, formatDateToGuatemala } from '../../utils/date';
import { AGENCIA_LOCATION_OPTIONS } from '../../data/agencies';
import { X, PlusCircle, Lock, ArrowLeftRight } from 'lucide-react';

interface NewTrasladoRouteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (route: Partial<Route>) => void;
  nextSuggestedId: string;
  agencia: string;
}

// NOTA: las 3 opciones de "Razón" siguen siendo genéricas (el usuario indicó que
// proporcionará las categorías definitivas más adelante), pero ya no llevan una
// etiqueta que se vea como texto de desarrollo interno («Razón 1», «Razón 2»...)
// visible para operadores reales. Para actualizarlas con las categorías definitivas,
// basta con editar este arreglo (label + fieldLabel por opción).
const RAZON_OPTIONS: { key: string; label: string; fieldLabel: string }[] = [
  { key: 'razon1', label: 'Motivo Operativo 1', fieldLabel: 'Detalle del motivo' },
  { key: 'razon2', label: 'Motivo Operativo 2', fieldLabel: 'Detalle del motivo' },
  { key: 'razon3', label: 'Motivo Operativo 3', fieldLabel: 'Detalle del motivo' },
];

// Opciones de Origen / Destino (agencias/plantas disponibles para traslado).
// Este arreglo vive ahora en '../../data/agencies' porque también se reutiliza
// en el apartado de Usuarios para el control de acceso por agencia.

export const NewTrasladoRouteModal: React.FC<NewTrasladoRouteModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  nextSuggestedId,
  agencia,
}) => {
  const [fecha, setFecha] = useState('');
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [razon, setRazon] = useState<string>('');
  const [razonDetalle, setRazonDetalle] = useState('');
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
      setOrigen('');
      setDestino('');
      setRazon('');
      setRazonDetalle('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedRazon = RAZON_OPTIONS.find((r) => r.key === razon);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Corrección: antes no se validaba que Origen y Destino fueran distintos,
    // así que era posible registrar un "traslado" de una agencia hacia sí misma.
    if (origen && destino && origen === destino) {
      setError('El Origen y el Destino no pueden ser la misma agencia.');
      return;
    }
    setError('');
    onSubmit({
      id: nextSuggestedId.trim(),
      agencia: agencia.trim() || 'Mercado Abierto',
      mercado: agencia.trim() || 'Mercado Abierto',
      fecha: formatDateToGuatemala(fecha),
      paradas: Number(paradas) || 1,
      cajasFisicas: Number(cajasFisicas) || 0,
      pesoKg: Number(peso) || 0,
      equipoFrio: Number(equipoFrio) || 0,
      capacidadPorc: capacidad.trim() || '100%',
      distancia: Number(distancia) || 0,
      viaje: '02:00',
      servicio: '08:00',
      descanso: '00:45',
      total: '10:45',
      cajas12Oz: 0,
      tipoRuta: 'Traslado',
      origen: origen.trim(),
      destino: destino.trim(),
      razonTraslado: selectedRazon?.label,
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
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-1 font-semibold text-slate-700 mb-1">
                Agencia / Sucursal
                <Lock className="w-3 h-3 text-slate-400" />
              </label>
              <div className="w-full p-2.5 border border-slate-200 bg-slate-50 rounded-lg font-medium text-slate-600">
                {agencia}
              </div>
            </div>
            <div>
              <label className="flex items-center gap-1 font-semibold text-slate-700 mb-1">
                ID de Ruta
                <Lock className="w-3 h-3 text-slate-400" />
              </label>
              <div className="w-full p-2.5 border border-slate-200 bg-slate-50 rounded-lg uppercase font-mono font-semibold text-slate-600">
                {nextSuggestedId}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Origen *</label>
              <select
                value={origen}
                onChange={(e) => setOrigen(e.target.value)}
                required
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-medium outline-none bg-white"
              >
                <option value="" disabled>
                  Selecciona un origen
                </option>
                {AGENCIA_LOCATION_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Destino *</label>
              <select
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                required
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-medium outline-none bg-white"
              >
                <option value="" disabled>
                  Selecciona un destino
                </option>
                {AGENCIA_LOCATION_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-semibold text-[11px]">
              {error}
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Fecha Operación</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-2">Razón del Traslado</label>
            <div className="grid grid-cols-3 gap-2">
              {RAZON_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setRazon(opt.key)}
                  className={`px-2 py-2.5 rounded-lg border-2 font-semibold text-[11px] transition-all cursor-pointer ${
                    razon === opt.key
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {selectedRazon && (
              <div className="mt-3">
                <label className="block font-semibold text-slate-700 mb-1">{selectedRazon.fieldLabel}</label>
                <input
                  type="text"
                  value={razonDetalle}
                  onChange={(e) => setRazonDetalle(e.target.value)}
                  placeholder="Detalle adicional (opcional)"
                  className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-medium outline-none"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Cantidad de Paradas</label>
              <input
                type="number"
                min="1"
                value={paradas}
                onChange={(e) => setParadas(parseInt(e.target.value) || 1)}
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-semibold outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Cajas Físicas</label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={cajasFisicas}
                onChange={(e) => setCajasFisicas(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono outline-none"
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
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono outline-none"
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
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">% Capacidad</label>
              <input
                type="text"
                value={capacidad}
                onChange={(e) => setCapacidad(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg font-mono outline-none"
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
                className="w-full p-2.5 border border-slate-300 rounded-lg font-mono outline-none"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg font-semibold hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-sm flex items-center cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 mr-1.5" />
              Crear Ruta de Traslado
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
