import React from 'react';
import { Route, Truck, Staff } from '../../types';
import {
  X,
  Truck as TruckIcon,
  Users,
  Clock,
  Calendar,
  Layers,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Phone,
  UserCheck,
  ChevronRight,
  Repeat,
  RotateCcw,
  ArrowRight,
} from 'lucide-react';
import { formatDateToGuatemala } from '../../utils/date';

interface AssignmentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  route: Route | null;
  allRoutes?: Route[];
  trucks?: Truck[];
  staff?: Staff[];
  onOpenAssignModal?: (routeId: string) => void;
}

export const AssignmentDetailModal: React.FC<AssignmentDetailModalProps> = ({
  isOpen,
  onClose,
  route,
  allRoutes = [],
  trucks = [],
  staff = [],
  onOpenAssignModal,
}) => {
  if (!isOpen || !route) return null;

  const asig = route.asignacion;
  const ultimoDespacho = route.ultimoDespacho;

  // Buscar información ampliada del camión
  const truckData = asig?.camionPlaca
    ? trucks.find((t) => t.placa.toLowerCase() === asig.camionPlaca.toLowerCase())
    : null;

  // Buscar información ampliada del piloto
  const driverData = asig?.conductor
    ? staff.find((s) => s.nombre.toLowerCase() === asig.conductor.toLowerCase())
    : null;

  // Auxiliares
  const rawHelpers = [asig?.auxiliar1, asig?.auxiliar2, asig?.auxiliar3, asig?.auxiliar4].filter(Boolean) as string[];
  const helpersData = rawHelpers.map((name) => {
    const sObj = staff.find((s) => s.nombre.toLowerCase() === name.toLowerCase());
    return { name, staffObj: sObj };
  });

  // Rutas compartidas (en tránsito con la misma unidad)
  const sharedRoutes = asig?.camionPlaca
    ? allRoutes.filter(
        (r) =>
          String(r.id) !== String(route.id) &&
          r.estado === 'En Tránsito' &&
          r.asignacion?.camionPlaca &&
          r.asignacion.camionPlaca.toLowerCase() === asig.camionPlaca.toLowerCase()
      )
    : [];

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden transform transition-all flex flex-col max-h-[90vh] text-xs">
        {/* Header */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 shadow-2xs">
              <TruckIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-800 text-sm sm:text-base font-mono">
                  Ruta {route.id}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                    route.estado === 'En Tránsito'
                      ? 'bg-blue-100 text-blue-800 border border-blue-200'
                      : route.estado === 'Abierta'
                      ? 'bg-rose-100 text-rose-800 border border-rose-200'
                      : route.estado === 'Liquidada'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}
                >
                  {route.estado}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                <MapPin className="w-3 h-3 text-slate-400" />
                <span>{route.agencia}</span>
                <span>•</span>
                <span>{route.segmento || '-'}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition cursor-pointer"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Si tiene asignación activa */}
          {asig ? (
            <>
              {/* Tarjeta de Camión */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-200/70 pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <TruckIcon className="w-4 h-4 text-blue-600" />
                    <span>Unidad de Transporte</span>
                  </div>
                  {asig.tipoAsignacion && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
                      {asig.tipoAsignacion}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                      Placa
                    </span>
                    <span className="text-sm font-bold font-mono text-slate-900 block mt-0.5">
                      {asig.camionPlaca}
                    </span>
                  </div>

                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                      Capacidad
                    </span>
                    <span className="text-xs font-semibold text-slate-800 block mt-0.5">
                      {truckData?.capacidad || route.capacidadPorc || 'Estándar'}
                    </span>
                  </div>

                  <div className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs col-span-2 sm:col-span-1">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      Hora Salida
                    </span>
                    <span className="text-xs font-semibold text-slate-800 block mt-0.5 font-mono">
                      {asig.horaSalida || 'No especificada'}
                    </span>
                  </div>
                </div>

                {asig.fechaAsignacion && (
                  <div className="text-[11px] text-slate-500 flex items-center gap-1 pt-1 font-mono">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <span>Fecha Despacho: {asig.fechaAsignacion}</span>
                  </div>
                )}

                {/* Aviso si la unidad tiene carga compartida con otras rutas */}
                {sharedRoutes.length > 0 && (
                  <div className="bg-sky-50 border border-sky-200 rounded-lg p-2.5 text-sky-950 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-[11px] text-sky-900">
                      <Layers className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                      <span>Optimización: Unidad con Carga Compartida</span>
                    </div>
                    <p className="text-[11px] text-sky-800 leading-relaxed">
                      Este camión también transporta:{' '}
                      <span className="font-semibold font-mono">
                        {sharedRoutes.map((r) => `Ruta ${r.id} (${r.cajasFisicas} cjs)`).join(', ')}
                      </span>
                    </p>
                  </div>
                )}
              </div>

              {/* Tarjeta de Tripulación */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200/70 pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Users className="w-4 h-4 text-indigo-600" />
                    <span>Tripulación Asignada</span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-medium">
                    {1 + rawHelpers.length} persona{rawHelpers.length > 0 ? 's' : ''} en cabina
                  </span>
                </div>

                {/* Piloto / Conductor */}
                <div className="bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5" />
                      Piloto / Conductor
                    </span>
                    {driverData?.puesto && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {driverData.puesto}
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-slate-900 text-xs sm:text-sm">{asig.conductor}</div>
                  {driverData?.telefono && (
                    <div className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-400" />
                      <span>{driverData.telefono}</span>
                      {driverData.dpi && <span className="text-slate-400">· DPI: {driverData.dpi}</span>}
                    </div>
                  )}
                </div>

                {/* Auxiliares */}
                <div>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1.5">
                    Auxiliares de Reparto ({rawHelpers.length})
                  </span>
                  {rawHelpers.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {helpersData.map((h, i) => (
                        <div
                          key={i}
                          className="bg-white p-2.5 rounded-lg border border-slate-200/80 shadow-2xs space-y-0.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-400 font-bold">
                              Auxiliar #{i + 1}
                            </span>
                            {h.staffObj?.puesto && (
                              <span className="px-1 py-0.2 rounded text-[9px] font-medium bg-slate-100 text-slate-600">
                                {h.staffObj.puesto}
                              </span>
                            )}
                          </div>
                          <div className="font-semibold text-slate-800 text-xs truncate">
                            {h.name}
                          </div>
                          {h.staffObj?.telefono && (
                            <div className="text-[10px] text-slate-500 flex items-center gap-1 truncate">
                              <Phone className="w-2.5 h-2.5 text-slate-400" />
                              <span>{h.staffObj.telefono}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white p-2.5 rounded-lg border border-dashed border-slate-200 text-slate-400 text-center italic text-xs">
                      Sin auxiliares asignados para esta ruta
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : route.estado === 'Abierta' ? (
            /* Caso Ruta Abierta con retorno pendiente de reasignación */
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-amber-950 space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-xs text-amber-900">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Ruta Abierta (Cierre Parcial / Pendiente de Reasignar)</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  La unidad y la tripulación previa fueron liberadas al retornar a agencia. La ruta se
                  encuentra en espera de reasignar una nueva unidad/tripulación o liquidar definitivamente.
                </p>
              </div>

              {ultimoDespacho && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                    Último Despacho Realizado
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 block">Camión anterior</span>
                      <span className="font-bold font-mono text-slate-800">{ultimoDespacho.camionPlaca}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 block">Piloto anterior</span>
                      <span className="font-bold text-slate-800 truncate block">{ultimoDespacho.conductor}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Caso Sin Asignación */
            <div className="text-center py-6 px-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-200/70 text-slate-400 flex items-center justify-center mx-auto">
                <TruckIcon className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-slate-700 text-sm">Sin Asignación Registrada</h4>
                <p className="text-slate-500 text-xs max-w-xs mx-auto">
                  Esta ruta está en estado{' '}
                  <span className="font-semibold text-slate-700">{route.estado}</span> y aún no tiene
                  un camión ni tripulación asignados para salir a reparto.
                </p>
              </div>
              {onOpenAssignModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAssignModal(route.id);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <TruckIcon className="w-3.5 h-3.5" />
                  <span>Asignar Camión y Tripulación</span>
                </button>
              )}
            </div>
          )}

          {/* Historial de despachos anteriores si existen */}
          {route.historialDespachos && route.historialDespachos.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block flex items-center gap-1">
                <RotateCcw className="w-3 h-3 text-slate-400" />
                Historial de Salidas / Intentos ({route.historialDespachos.length})
              </span>
              <div className="space-y-2">
                {route.historialDespachos.map((d, idx) => (
                  <div
                    key={idx}
                    className="bg-white p-2.5 rounded-lg border border-slate-200/80 text-xs space-y-1 shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">
                        Intento #{d.intento} ({d.tipoAsignacion || 'Viaje'})
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">{d.fechaRetorno}</span>
                    </div>
                    <div className="text-[11px] text-slate-600 flex items-center justify-between">
                      <span>
                        Unidad: <b className="font-mono text-slate-800">{d.camionPlaca}</b> · Piloto:{' '}
                        <b className="text-slate-800">{d.conductor}</b>
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      Entregadas: <b className="text-emerald-700">{d.cajasEntregadas}</b> | Devueltas:{' '}
                      <b className="text-rose-700">{d.cajasDevueltas}</b>
                    </div>
                    {d.motivoDevolucion && (
                      <div className="text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60">
                        Motivo: {d.motivoDevolucion}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-500">
            Carga: <b className="text-slate-800">{route.cajasFisicas} cjs</b> · Paradas:{' '}
            <b className="text-slate-800">{route.paradas}</b>
          </div>
          <div className="flex items-center gap-2">
            {onOpenAssignModal && (route.estado === 'Pendiente' || route.estado === 'Abierta') && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAssignModal(route.id);
                }}
                className="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold transition cursor-pointer text-xs border border-blue-200"
              >
                {asig ? 'Modificar Asignación' : 'Asignar Ahora'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold transition cursor-pointer text-xs"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
