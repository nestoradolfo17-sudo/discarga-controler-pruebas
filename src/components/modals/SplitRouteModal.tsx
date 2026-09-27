import React, { useState, useEffect } from 'react';
import { Route } from '../../types';
import { formatDateToGuatemala, formatDateTimeToGuatemala } from '../../utils/date';
import { X, Split, Check, Users, Search, Shuffle } from 'lucide-react';
import { Button, IconButton } from '../ui/Button';
import { ModalFooter } from '../ui/ModalFooter';
import { ACTION_ICONS } from '../ui/actionIcons';
import { useMaximized } from '../ui/useMaximized';

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
  const [isMaximized, toggleMaximized] = useMaximized('dc_split_maximized');
  const [numTrips, setNumTrips] = useState<number>(3);
  const [tripInputs, setTripInputs] = useState<TripSplitInput[]>([]);
  // Clientes por viaje (código de cliente -> número de viaje). Solo aplica si la
  // ruta trae su lista de clientes (Excel "Clientes N"): en ese caso las paradas
  // y cajas de cada viaje se calculan solas a partir de los clientes asignados,
  // y cada viaje hijo se lleva su propia lista de clientes.
  const [clientTrip, setClientTrip] = useState<Map<string, number>>(new Map());
  const [clientFilter, setClientFilter] = useState('');

  // Reparte los clientes en orden (secuencia del archivo) en partes iguales.
  const distributeClients = (tripsCount: number, currentRoute: Route) => {
    const list = currentRoute.clientesRuta || [];
    const per = Math.ceil(list.length / tripsCount) || 1;
    const map = new Map<string, number>();
    list.forEach((c, i) => map.set(c.codigo, Math.min(tripsCount, Math.floor(i / per) + 1)));
    setClientTrip(map);
  };

  useEffect(() => {
    if (isOpen && route) {
      const tripsCount = 3;
      setNumTrips(tripsCount);
      recalculateTripInputs(tripsCount, route);
      distributeClients(tripsCount, route);
      setClientFilter('');
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

  const clientes = route.clientesRuta || [];
  const hasClients = clientes.length > 0;

  const handleNumTripsChange = (newCount: number) => {
    const clamped = Math.min(Math.max(newCount, 2), 6);
    setNumTrips(clamped);
    recalculateTripInputs(clamped, route);
    if (hasClients) {
      // Se conserva lo ya asignado; los clientes de viajes que dejan de existir
      // pasan al último viaje.
      setClientTrip((prev) => {
        const next = new Map<string, number>();
        prev.forEach((t, k) => next.set(k, Math.min(t, clamped)));
        return next;
      });
    }
  };

  const setTripForClient = (codigo: string, trip: number) => {
    setClientTrip((prev) => {
      const next = new Map(prev);
      next.set(codigo, trip);
      return next;
    });
  };

  // Con lista de clientes, paradas y cajas de cada viaje salen de sus clientes.
  const effectiveTrips: TripSplitInput[] = hasClients
    ? Array.from({ length: numTrips }, (_, i) => {
        const n = i + 1;
        const own = clientes.filter((c) => (clientTrip.get(c.codigo) || 1) === n);
        return {
          tripNumber: n,
          paradas: own.length,
          cajas: parseFloat(own.reduce((acc, c) => acc + (Number(c.cajas) || 0), 0).toFixed(3)),
        };
      })
    : tripInputs;
  const emptyTrips = hasClients ? effectiveTrips.filter((t) => t.paradas === 0).map((t) => t.tripNumber) : [];

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
    if (sumParadasMismatch || sumCajasMismatch || emptyTrips.length > 0) {
      return;
    }

    const childRoutes: Route[] = effectiveTrips.map((ti) => {
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
        // Cada viaje se lleva solo los clientes que le tocan.
        ...(hasClients
          ? { clientesRuta: clientes.filter((c) => (clientTrip.get(c.codigo) || 1) === ti.tripNumber) }
          : {}),
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
  const sumParadas = effectiveTrips.reduce((acc, t) => acc + (t.paradas || 0), 0);
  const sumCajas = parseFloat(effectiveTrips.reduce((acc, t) => acc + (t.cajas || 0), 0).toFixed(3));
  // Con clientes, el total de referencia es la propia lista de clientes (paradas =
  // cantidad de clientes); así siempre cuadra aunque el resumen difiera un poco.
  const refParadas = hasClients ? clientes.length : totalParadas;
  const refCajas = hasClients
    ? parseFloat(clientes.reduce((acc, c) => acc + (Number(c.cajas) || 0), 0).toFixed(3))
    : totalCajas;
  const sumParadasMismatch = sumParadas !== refParadas;
  const sumCajasMismatch = Math.abs(sumCajas - refCajas) > 0.01;
  const hasMismatch = sumParadasMismatch || sumCajasMismatch || emptyTrips.length > 0;

  return (
    <div className={`fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center ${isMaximized ? 'p-0' : 'p-3 sm:p-4'}`}>
      <div
        className={`bg-white w-full shadow-2xl border border-slate-200 overflow-hidden transform transition-all flex flex-col ${
          isMaximized ? 'h-full max-h-full rounded-none' : `rounded-2xl ${hasClients ? 'max-w-3xl' : 'max-w-lg'} max-h-[92vh]`
        }`}
      >
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
          <div className="flex items-center gap-1 flex-shrink-0">
            <IconButton
              icon={isMaximized ? ACTION_ICONS.restaurar : ACTION_ICONS.pantallaCompleta}
              label={isMaximized ? 'Restaurar tamaño de la ventana' : 'Ver a pantalla completa'}
              onClick={toggleMaximized}
              className="text-slate-300 hover:text-white hover:bg-slate-800"
            />
            <IconButton
              icon={ACTION_ICONS.cerrar}
              label="Cerrar sin guardar"
              onClick={onClose}
              className="text-slate-300 hover:text-white hover:bg-slate-800"
            />
          </div>
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
            <span id="numTripsLabel" className="font-bold text-slate-700">Cantidad de viajes:</span>
            {/* Botones grandes (tablet) en lugar de un campo numérico. */}
            <div role="radiogroup" aria-labelledby="numTripsLabel" className="flex items-center gap-1.5">
              {[2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={numTrips === n}
                  aria-label={`${n} viajes`}
                  onClick={() => handleNumTripsChange(n)}
                  className={`min-w-[44px] min-h-[44px] rounded-xl border-2 text-sm font-bold cursor-pointer active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-blue-200 ${
                    numTrips === n ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-blue-300'
                  }`}
                >
                  {n}
                </button>
              ))}
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
              <span>
                {emptyTrips.length > 0
                  ? `⚠ Viaje ${emptyTrips.join(', ')} sin clientes`
                  : hasMismatch
                  ? '⚠ No cuadra con el total original'
                  : '✓ Cuadra con el total original'}
              </span>
            </div>
            <div className="space-y-2.5">
              {effectiveTrips.map((trip, idx) => (
                <div
                  key={trip.tripNumber}
                  className="bg-slate-50 p-3 rounded-xl border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center"
                >
                  <div className="font-bold text-slate-800 text-xs flex items-center">
                    <span className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center mr-2 text-[11px]">
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
                      readOnly={hasClients}
                      onChange={(e) =>
                        handleInputChange(idx, 'paradas', parseInt(e.target.value) || 1)
                      }
                      className={`w-full min-h-[40px] p-1.5 border border-slate-300 rounded-lg font-semibold text-sm outline-none ${hasClients ? 'bg-slate-100' : ''}`}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 font-semibold mb-0.5">Cajas Físicas:</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={trip.cajas}
                      readOnly={hasClients}
                      onChange={(e) =>
                        handleInputChange(idx, 'cajas', parseFloat(e.target.value) || 0)
                      }
                      className={`w-full min-h-[40px] p-1.5 border border-slate-300 rounded-lg font-mono font-bold text-sm text-blue-700 outline-none ${hasClients ? 'bg-slate-100' : ''}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {hasClients && (() => {
            const f = clientFilter.toLowerCase().trim();
            const visibles = clientes.filter(
              (c) => !f || c.codigo.toLowerCase().includes(f) || (c.nombre || '').toLowerCase().includes(f)
            );
            return (
              <div className="border border-slate-200 rounded-xl p-3 space-y-2 bg-white">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-bold text-slate-800 text-xs flex items-center">
                    <Users className="w-4 h-4 mr-1.5 text-indigo-600" />
                    Clientes por viaje ({clientes.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                      <input
                        type="search"
                        value={clientFilter}
                        onChange={(e) => setClientFilter(e.target.value)}
                        placeholder="Buscar cliente..."
                        aria-label="Buscar cliente"
                        className="pl-7 pr-2 min-h-[44px] w-44 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => distributeClients(numTrips, route)}
                      className="min-h-[44px] px-3 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 flex items-center gap-1 cursor-pointer hover:bg-slate-50"
                      title="Repartir los clientes en partes iguales, en el orden del archivo"
                    >
                      <Shuffle className="w-3.5 h-3.5" /> Repartir igual
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500">
                  Toca el viaje (V1, V2...) en el que se va cada cliente. Las paradas y cajas de cada viaje se calculan solas.
                </p>
                <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {visibles.map((c) => {
                    const t = clientTrip.get(c.codigo) || 1;
                    return (
                      <div key={c.codigo} className="flex items-center justify-between gap-2 px-2 py-1">
                        <div className="min-w-0 text-xs">
                          <span className="font-mono text-slate-500">{c.codigo}</span>{' '}
                          <span className="font-semibold text-slate-800">{c.nombre || '-'}</span>{' '}
                          <span className="text-slate-400">({Number(c.cajas || 0).toFixed(3)} cajas)</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {Array.from({ length: numTrips }, (_, i) => i + 1).map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setTripForClient(c.codigo, n)}
                              aria-pressed={t === n}
                              aria-label={`Cliente ${c.codigo} en viaje ${n}`}
                              className={`min-w-[44px] min-h-[44px] rounded-lg text-xs font-bold border cursor-pointer active:scale-95 ${
                                t === n
                                  ? 'bg-blue-600 border-blue-700 text-white'
                                  : 'bg-white border-slate-300 text-slate-500 hover:border-indigo-300'
                              }`}
                            >
                              V{n}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {visibles.length === 0 && (
                    <div className="py-3 text-center text-[11px] text-slate-400">Sin resultados</div>
                  )}
                </div>
              </div>
            );
          })()}

          <ModalFooter
            bleed="p-6"
            secondary={
              <Button variant="secondary" size="lg" onClick={onClose}>
                Cancelar
              </Button>
            }
            info={
              hasMismatch ? (
                <span className="text-rose-600 font-semibold">
                  {emptyTrips.length > 0 ? `Viaje ${emptyTrips.join(', ')} sin clientes` : 'No cuadra con el total original'}
                </span>
              ) : (
                <span className="text-emerald-700 font-semibold">✓ Cuadra: {sumCajas} cajas · {sumParadas} paradas</span>
              )
            }
          >
            <Button
              type="submit"
              variant="primary"
              size="lg"
              icon={ACTION_ICONS.partir}
              disabled={hasMismatch}
              title={hasMismatch ? 'La suma de los viajes debe coincidir con el total de la ruta original' : undefined}
            >
              Partir en {numTrips} viajes
            </Button>
          </ModalFooter>
        </form>
      </div>
    </div>
  );
};
