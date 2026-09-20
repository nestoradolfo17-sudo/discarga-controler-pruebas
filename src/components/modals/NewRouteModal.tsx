import React, { useState, useEffect } from 'react';
import { Route } from '../../types';
import { getGuatemalaDateForInput, formatDateToGuatemala } from '../../utils/date';
import { X, PlusCircle, Lock } from 'lucide-react';

interface NewRouteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (route: Partial<Route>) => void;
  nextSuggestedId: string;
  agencia: string;
}

export const NewRouteModal: React.FC<NewRouteModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  nextSuggestedId,
  agencia,
}) => {
  // Corrección: estos valores eran datos de una ruta real dejados como "ejemplo"
  // durante el desarrollo. Si un operador con prisa solo llenaba Fecha y daba clic
  // en "Crear Ruta", el sistema guardaba una ruta ficticia de 74 paradas y 398.48
  // cajas. Ahora todos arrancan en blanco/cero y los campos clave son obligatorios.
  const [mercado, setMercado] = useState('Mercado Abierto');
  const [fecha, setFecha] = useState('');
  const [paradas, setParadas] = useState(0);
  const [cajasFisicas, setCajasFisicas] = useState<number | string>('');
  const [peso, setPeso] = useState<number | string>('');
  const [equipoFrio, setEquipoFrio] = useState(0);
  const [capacidad, setCapacidad] = useState('');
  const [distancia, setDistancia] = useState<number | string>('');

  useEffect(() => {
    if (isOpen) {
      setFecha(getGuatemalaDateForInput(new Date()));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      id: nextSuggestedId.trim(),
      agencia: agencia.trim() || 'Mercado Abierto',
      mercado: mercado.trim() || 'Mercado Abierto',
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
      tipoRuta: 'Entrega',
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden transform transition-all">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span>
            <h3 className="font-bold text-sm">Registrar Nueva Ruta de Entrega</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
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
              <label className="block font-semibold text-slate-700 mb-1">Canal / Mercado</label>
              <input
                type="text"
                value={mercado}
                onChange={(e) => setMercado(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-medium outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Fecha Operación</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Cantidad de Paradas *</label>
              <input
                type="number"
                min="1"
                value={paradas}
                onChange={(e) => setParadas(parseInt(e.target.value) || 1)}
                required
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-semibold outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Cajas Físicas *</label>
              <input
                type="number"
                step="0.001"
                min="0"
                required
                value={cajasFisicas}
                onChange={(e) => setCajasFisicas(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono outline-none"
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
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono outline-none"
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
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">% Capacidad</label>
              <input
                type="text"
                value={capacidad}
                onChange={(e) => setCapacidad(e.target.value)}
                placeholder="Ej. 100%"
                className="w-full p-2.5 border border-slate-300 rounded-lg font-mono outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Distancia (Km) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
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
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-sm flex items-center cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 mr-1.5" />
              Crear Ruta
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
