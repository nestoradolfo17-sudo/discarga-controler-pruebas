import React, { useState, useEffect } from 'react';
import { Route } from '../../types';
import { formatDateToGuatemala, formatDateTimeToGuatemala } from '../../utils/date';
import { X, Split, Check } from 'lucide-react';

interface SplitRouteModalProps {
  isOpen: boolean;
  onClose: () => void;
  route: Route | null;
  onConfirmSplit: (originalRoute: Route, childRoutes: Route[]) => void;
}

interface TripSplitInput {
  tripNumber: number;
  paradas: number;
  cajas: number;
}

export const SplitRouteModal: React.FC<SplitRouteModalProps> = ({
  isOpen,
  onClose,
  route,
  onConfirmSplit,
}) => {
  const [numTrips, setNumTrips] = useState<number>(3);
  const [tripInputs, setTripInputs] = useState<TripSplitInput[]>([]);

  useEffect(() => {
    if (isOpen && route) {
      const tripsCount = 3;
      setNumTrips(tripsCount);
      recalculateTripInputs(tripsCount, route);
    }
  }, [isOpen, route]);

  const recalculateTripInputs = (tripsCount: number, currentRoute: Route) => {
    const totalCajas = parseFloat(String(currentRoute.cajasFisicas)) || 0;
    const totalParadas = parseInt(String(currentRoute.paradas)) || 1;

    const cajasPorViaje = parseFloat((totalCajas / tripsCount).toFixed(3));
    const paradasPorViaje = Math.max(1, Math.floor(totalParadas / tripsCount));

    const inputs: TripSplitInput[] = [];
    let paradasAccum = 0;
    let cajasAccum = 0;

    for (let i = 1; i <= tripsCount; i++) {
      const isLast = i === tripsCount;
      const tripParadas = isLast ? Math.max(1, totalParadas - paradasAccum) : paradasPorViaje;
      const tripCajas = isLast
        ? parseFloat((totalCajas - cajasAccum).toFixed(3))
        : cajasPorViaje;

      paradasAccum += tripParadas;
      cajasAccum += tripCajas;

      inputs.push({
        tripNumber: i,
        paradas: tripParadas,
        cajas: tripCajas,
      });
    }

    setTripInputs(inputs);
  };

  if (!isOpen || !route) return null;

  const handleNumTripsChange = (newCount: number) => {
    const clamped = Math.min(Math.max(newCount, 2), 6);
    setNumTrips(clamped);
    recalculateTripInputs(clamped, route);
  };

  const handleInputChange = (index: number, field: 'paradas' | 'cajas', val: number) => {
    setTripInputs((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: val };
      return updated;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Corrección: antes se podía confirmar la partición aunque la suma de cajas o
    // paradas de los viajes no cuadrara con el total de la ruta original, y ese
    // descuadre quedaba permanente (la ruta original desaparece al confirmar).
    if (sumParadasMismatch || sumCajasMismatch) {
      return;
    }

    const childRoutes: Route[] = tripInputs.map((ti) => {
      return {
        id: `${route.id}.${ti.tripNumber}`,
        parentRouteId: String(route.id),
        originalRouteData: JSON.parse(JSON.stringify(route)),
        isSplitRoute: true,
        tripNumber: ti.tripNumber,
        totalTrips: numTrips,
        agencia: route.agencia,
        mercado: route.mercado || 'Mercado Abierto',
        fecha: formatDateToGuatemala(route.fecha),
        viaje: route.viaje || '01:00',
        servicio: route.servicio || '04:00',
        descanso: route.descanso || '00:30',
        total: route.total || '05:30',
        distancia: (parseFloat(String(route.distancia || 0)) / numTrips).toFixed(2),
        paradas: ti.paradas,
        equipoFrio: Math.round((parseInt(String(route.equipoFrio)) || 0) / numTrips),
        capacidadPorc: route.capacidadPorc || '100%',
        cajas12Oz: ((parseFloat(String(route.cajas12Oz)) || 0) / numTrips).toFixed(3),
        pesoKg: ((parseFloat(String(route.pesoKg)) || 0) / numTrips).toFixed(3),
        cajasFisicas: ti.cajas,
        estado: 'Pendiente',
        asignacion: null,
        liquidacion: null,
        fechaCarga: route.fechaCarga || formatDateTimeToGuatemala(new Date()),
        fechaCreacion: route.fechaCreacion || formatDateTimeToGuatemala(new Date()),
      };
    });

    onConfirmSplit(route, childRoutes);
  };

  const totalCajas = parseFloat(String(route.cajasFisicas)) || 0;
  const totalParadas = parseInt(String(route.paradas)) || 0;

  // Cuadre en vivo: antes no existía ninguna validación de que la suma de los
  // viajes coincidiera con el total original, y un descuadre aquí quedaba
  // permanente (silencioso) al confirmar, afectando cualquier KPI de cajas/paradas.
  const sumParadas = tripInputs.reduce((acc, t) => acc + (t.paradas || 0), 0);
  const sumCajas = parseFloat(tripInputs.reduce((acc, t) => acc + (t.cajas || 0), 0).toFixed(3));
  const sumParadasMismatch = sumParadas !== totalParadas;
  const sumCajasMismatch = Math.abs(sumCajas - totalCajas) > 0.01;
  const hasMismatch = sumParadasMismatch || sumCajasMismatch;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden transform transition-all flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Split className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Partir Ruta en Múltiples Viajes / Unidades</h3>
              <p className="text-[11px] text-slate-400">
                Ruta {route.id} | {route.agencia} | {route.paradas} Paradas | {route.cajasFisicas} Cajas
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
          <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-950 space-y-1">
            <p className="font-bold flex items-center">
              <span className="w-2 h-2 rounded-full bg-indigo-600 mr-1.5"></span>
              División Operativa en N Viajes
            </p>
            <p className="text-[11px] text-indigo-800 leading-relaxed">
              Divide la carga total de la ruta en líneas independientes (.1, .2, .3). Cada línea contará con su propio{' '}
              <strong>camión, piloto y hasta 3 auxiliares</strong>.
            </p>
          </div>

          <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
            <label className="font-bold text-slate-700">Cantidad de Viajes a Programar:</label>
            <div className="flex items-center space-x-2">
              <input
                type="number"
                min="2"
                max="6"
                value={numTrips}
                onChange={(e) => handleNumTripsChange(parseInt(e.target.value) || 2)}
                className="w-20 p-2 border border-slate-300 rounded-lg text-center font-bold text-sm text-blue-700 focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <span className="text-slate-500 font-medium">viajes</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center text-[11px] text-slate-500 font-semibold px-1">
              <span>Distribución de Carga por Viaje</span>
              <span>
                Total Base: {totalCajas} Cajas | {totalParadas} Paradas
              </span>
            </div>
            <div
              className={`flex justify-between items-center px-3 py-2 rounded-lg border text-[11px] font-bold ${
                hasMismatch
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              }`}
            >
              <span>
                Total ingresado: {sumCajas} Cajas | {sumParadas} Paradas
              </span>
              <span>{hasMismatch ? '⚠ No cuadra con el total original' : '✓ Cuadra con el total original'}</span>
            </div>
            <div className="space-y-2.5">
              {tripInputs.map((trip, idx) => (
                <div
                  key={trip.tripNumber}
                  className="bg-slate-50 p-3 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center"
                >
                  <div className="font-bold text-slate-800 text-xs flex items-center">
                    <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center mr-2 text-[11px]">
                      V{trip.tripNumber}
                    </span>
                    Viaje {trip.tripNumber} de {numTrips}
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">Paradas:</label>
                    <input
                      type="number"
                      min="1"
                      value={trip.paradas}
                      onChange={(e) =>
                        handleInputChange(idx, 'paradas', parseInt(e.target.value) || 1)
                      }
                      className="w-full p-1.5 border border-slate-300 rounded font-semibold text-xs outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">Cajas Físicas:</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={trip.cajas}
                      onChange={(e) =>
                        handleInputChange(idx, 'cajas', parseFloat(e.target.value) || 0)
                      }
                      className="w-full p-1.5 border border-slate-300 rounded font-mono font-bold text-xs text-blue-700 outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-2 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg font-semibold hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={hasMismatch}
              title={hasMismatch ? 'La suma de los viajes debe coincidir con el total de la ruta original' : undefined}
              className={`px-5 py-2 rounded-lg font-semibold shadow-sm flex items-center transition ${
                hasMismatch
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
              }`}
            >
              <Check className="w-4 h-4 mr-1.5" />
              Confirmar Partición de Ruta
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
