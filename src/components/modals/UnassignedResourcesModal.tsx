import React, { useMemo } from 'react';
import { Truck, Staff, Route, TruckUnavailableReason, StaffUnavailableReason } from '../../types';
import {
  TRUCK_REASON_OPTIONS,
  TRUCK_REASON_REMUNERA,
  STAFF_REASON_OPTIONS,
  STAFF_REASON_REMUNERA,
} from '../../data/unavailableReasons';
import { X, AlertTriangle, Truck as TruckIcon, Users, CheckCircle2 } from 'lucide-react';

const TRUCK_REASONS = TRUCK_REASON_OPTIONS;
const STAFF_REASONS = STAFF_REASON_OPTIONS;

// Insignia de solo lectura que muestra la clasificación de Remunera calculada
// automáticamente a partir del motivo seleccionado (para el futuro reporte de costos).
const RemuneraBadge: React.FC<{ value?: string | null }> = ({ value }) => {
  if (!value) {
    return <span className="text-slate-300 italic">—</span>;
  }
  const isPago = value === 'Remunera' || value === 'Remunera (StandBy)';
  const isNA = value === 'N/A';
  const cls = isNA
    ? 'bg-slate-100 text-slate-500 border-slate-200'
    : isPago
    ? 'bg-amber-50 text-amber-800 border-amber-200'
    : 'bg-slate-50 text-slate-600 border-slate-200';
  return (
    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap ${cls}`}>
      {value}
    </span>
  );
};

interface UnassignedResourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
  trucks: Truck[];
  staff: Staff[];
  routes?: Route[];
  onSetTruckReason: (truckId: string, reason: TruckUnavailableReason | null) => void;
  onSetStaffReason: (staffId: string, reason: StaffUnavailableReason | null) => void;
}

export const UnassignedResourcesModal: React.FC<UnassignedResourcesModalProps> = ({
  isOpen,
  onClose,
  trucks,
  staff,
  routes = [],
  onSetTruckReason,
  onSetStaffReason,
}) => {
  // Verificación cruzada contra las rutas activas: además del campo "estado" del
  // camión/persona, se confirma que no aparezcan realmente asignados en ninguna
  // ruta En Tránsito (por si el estado quedara desincronizado por algún caso borde).
  const { assignedTruckIds, assignedStaffNames } = useMemo(() => {
    const truckIds = new Set<string>();
    const staffNames = new Set<string>();
    routes.forEach((r) => {
      if (r.estado === 'En Tránsito' && r.asignacion) {
        if (r.asignacion.camionId) truckIds.add(String(r.asignacion.camionId));
        [
          r.asignacion.conductor,
          r.asignacion.auxiliar1,
          r.asignacion.auxiliar2,
          r.asignacion.auxiliar3,
          r.asignacion.auxiliar4,
        ].forEach((name) => {
          if (name) staffNames.add(name);
        });
      }
    });
    return { assignedTruckIds: truckIds, assignedStaffNames: staffNames };
  }, [routes]);

  if (!isOpen) return null;

  const idleTrucks = trucks.filter(
    (t) => t.estado === 'Disponible' && !assignedTruckIds.has(String(t.id))
  );
  const idleStaff = staff.filter(
    (s) => s.estado === 'Disponible' && !assignedStaffNames.has(s.nombre)
  );

  const pendingTrucks = idleTrucks.filter((t) => !t.motivoNoAsignado).length;
  const pendingStaff = idleStaff.filter((s) => !s.motivoNoAsignado).length;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl p-6 space-y-4 text-xs max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-sm text-slate-800 flex items-center">
              <AlertTriangle className="w-4 h-4 mr-1.5 text-amber-600" />
              Motivos de Recursos Sin Asignar
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Paso 2 de la asignación: indica por qué las unidades y el personal disponibles no
              salieron a ruta hoy.
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 space-y-5 pr-1">
          {/* Camiones */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-bold text-slate-700 text-[11px] flex items-center uppercase tracking-wide">
                <TruckIcon className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                Camiones Disponibles Sin Ruta ({idleTrucks.length})
              </h4>
              {pendingTrucks === 0 && idleTrucks.length > 0 && (
                <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold flex items-center">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Todos con motivo
                </span>
              )}
            </div>

            {idleTrucks.length === 0 ? (
              <p className="text-slate-400 italic px-1">
                No hay camiones disponibles sin asignar en este momento.
              </p>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="min-w-full text-left">
                  <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="py-2 px-3">Placa / Código</th>
                      <th className="py-2 px-3">Capacidad</th>
                      <th className="py-2 px-3">Motivo</th>
                      <th className="py-2 px-3">Remunera</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {idleTrucks.map((t) => (
                      <tr
                        key={t.id}
                        className={!t.motivoNoAsignado ? 'bg-amber-50/40' : 'bg-white'}
                      >
                        <td className="py-2 px-3 font-mono font-bold text-slate-800">{t.placa}</td>
                        <td className="py-2 px-3 text-slate-600">{t.capacidad}</td>
                        <td className="py-2 px-3">
                          <select
                            value={t.motivoNoAsignado || ''}
                            onChange={(e) =>
                              onSetTruckReason(
                                t.id,
                                (e.target.value || null) as TruckUnavailableReason | null
                              )
                            }
                            className={`w-full max-w-[220px] p-1.5 rounded-lg border font-semibold outline-none cursor-pointer ${
                              t.motivoNoAsignado
                                ? 'bg-white border-slate-300 text-slate-700'
                                : 'bg-amber-50 border-amber-300 text-amber-800'
                            }`}
                          >
                            <option value="">-- Sin motivo --</option>
                            {TRUCK_REASONS.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <RemuneraBadge
                            value={t.motivoNoAsignado ? TRUCK_REASON_REMUNERA[t.motivoNoAsignado] : null}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Personal */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-bold text-slate-700 text-[11px] flex items-center uppercase tracking-wide">
                <Users className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                Personal Disponible Sin Asignar ({idleStaff.length})
              </h4>
              {pendingStaff === 0 && idleStaff.length > 0 && (
                <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold flex items-center">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Todos con motivo
                </span>
              )}
            </div>

            {idleStaff.length === 0 ? (
              <p className="text-slate-400 italic px-1">
                No hay personal disponible sin asignar en este momento.
              </p>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="min-w-full text-left">
                  <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="py-2 px-3">Nombre</th>
                      <th className="py-2 px-3">Puesto</th>
                      <th className="py-2 px-3">Motivo</th>
                      <th className="py-2 px-3">Remunera</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {idleStaff.map((s) => (
                      <tr
                        key={s.id}
                        className={!s.motivoNoAsignado ? 'bg-amber-50/40' : 'bg-white'}
                      >
                        <td className="py-2 px-3 font-semibold text-slate-800">{s.nombre}</td>
                        <td className="py-2 px-3 text-slate-500 font-mono">{s.puesto}</td>
                        <td className="py-2 px-3">
                          <select
                            value={s.motivoNoAsignado || ''}
                            onChange={(e) =>
                              onSetStaffReason(
                                s.id,
                                (e.target.value || null) as StaffUnavailableReason | null
                              )
                            }
                            className={`w-full max-w-[300px] p-1.5 rounded-lg border font-semibold outline-none cursor-pointer ${
                              s.motivoNoAsignado
                                ? 'bg-white border-slate-300 text-slate-700'
                                : 'bg-amber-50 border-amber-300 text-amber-800'
                            }`}
                          >
                            <option value="">-- Sin motivo --</option>
                            {STAFF_REASONS.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <RemuneraBadge
                            value={s.motivoNoAsignado ? STAFF_REASON_REMUNERA[s.motivoNoAsignado] : null}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
