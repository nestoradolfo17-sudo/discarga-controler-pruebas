import { getRouteKey } from '../../utils/routeKey';
import React, { useState, useEffect } from 'react';
import { Route, Truck, Staff, AssignmentType } from '../../types';
import {
  X,
  Send,
  Truck as TruckIcon,
  User,
  Users,
  RotateCcw,
  Repeat,
  Calendar,
  Package,
  Clock,
  ArrowRight,
  Warehouse,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Trash2
} from 'lucide-react';
import { formatDateToGuatemala, getTomorrowGuatemalaDate } from '../../utils/date';

interface AssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  route: Route | null;
  trucks: Truck[];
  staff: Staff[];
  activeRoutes?: Route[];
  // Corrección: se agrega "fecha" a ambos callbacks porque el mismo ID de ruta
  // puede repetirse en fechas distintas (ver src/utils/routeKey.ts) — sin esto, la
  // asignación o el envío a piso podían terminar aplicándose también a otra fila
  // con el mismo ID pero de otra fecha.
  onConfirmAssignment: (
    routeId: string,
    fecha: string,
    assignment: {
      truckId: string;
      truckPlaca: string;
      driverName: string;
      helper1?: string;
      helper2?: string;
      helper3?: string;
      helper4?: string;
      horaSalida: string;
      tipoAsignacion: AssignmentType;
    }
  ) => void;
  onMoveToFloor: (
    routeId: string,
    fecha: string,
    tomorrowDate: string,
    motivo?: string
  ) => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const AssignModal: React.FC<AssignModalProps> = ({
  isOpen,
  onClose,
  route,
  trucks,
  staff,
  activeRoutes = [],
  onConfirmAssignment,
  onMoveToFloor,
  onShowToast,
}) => {
  const [assignmentType, setAssignmentType] = useState<AssignmentType>('Primer Viaje');
  const [truckId, setTruckId] = useState('');
  const [driverName, setDriverName] = useState('');
  const [helper1, setHelper1] = useState('');
  const [helper2, setHelper2] = useState('');
  const [helper3, setHelper3] = useState('');
  const [helper4, setHelper4] = useState('');
  const [horaSalida, setHoraSalida] = useState('');
  const [allowPilotsAsHelpers, setAllowPilotsAsHelpers] = useState(false);
  const [selectedActiveCrewRouteId, setSelectedActiveCrewRouteId] = useState('');
  const [motivoPiso, setMotivoPiso] = useState('Capacidad de flota / Reprogramación a piso para mañana');

  useEffect(() => {
    if (isOpen && route) {
      const now = new Date();
      const currentH = String(now.getHours()).padStart(2, '0');
      const currentM = String(now.getMinutes()).padStart(2, '0');
      setHoraSalida(`${currentH}:${currentM}`);
      const lastDispatch = route.historialDespachos && route.historialDespachos.length > 0
        ? route.historialDespachos[route.historialDespachos.length - 1]
        : null;

      const canRevisita = Boolean(
        route.asignacion ||
        route.ultimoDespacho ||
        ((route.historialDespachos?.length || 0) > 0) ||
        route.estado === 'Abierta' ||
        route.estado === 'En Tránsito' ||
        route.esReasignacion ||
        ((route.retornosCount || 0) > 0) ||
        Boolean(route.fechaAsignacion) ||
        route.tipoAsignacion === 'Revisita'
      );

      const isRouteReassign =
        route.estado === 'Abierta' ||
        ((route.historialDespachos?.length || 0) > 0) ||
        route.esReasignacion === true;

      let defaultType: AssignmentType = 'Primer Viaje';
      if (
        route.tipoAsignacion === 'Recarga' ||
        route.esRecarga ||
        lastDispatch?.tipoAsignacion === 'Recarga' ||
        route.ultimoDespacho?.tipoAsignacion === 'Recarga'
      ) {
        defaultType = 'Recarga';
      } else if (isRouteReassign && canRevisita) {
        defaultType = 'Revisita';
      }

      setAssignmentType(defaultType);
      setSelectedActiveCrewRouteId('');
      setMotivoPiso('Capacidad de flota / Reprogramación a piso para mañana');

      // If already assigned or reassigning
      const curAsig = route.asignacion;
      if (curAsig) {
        setTruckId(curAsig.camionId || '');
        setDriverName(curAsig.conductor || '');
        setHelper1(curAsig.auxiliar1 || '');
        setHelper2(curAsig.auxiliar2 || '');
        setHelper3(curAsig.auxiliar3 || '');
        setHelper4(curAsig.auxiliar4 || '');
        if (curAsig.horaSalida) {
          setHoraSalida(curAsig.horaSalida);
        }
        if (curAsig.tipoAsignacion) {
          if (curAsig.tipoAsignacion === 'Revisita' && !canRevisita) {
            setAssignmentType('Primer Viaje');
          } else {
            setAssignmentType(curAsig.tipoAsignacion);
          }
        }
        // Auto-enable option if any existing assigned helper is a pilot
        const curHelpers = [curAsig.auxiliar1, curAsig.auxiliar2, curAsig.auxiliar3, curAsig.auxiliar4].filter(Boolean);
        const hasPilotHelper = staff.some(
          (s) =>
            curHelpers.includes(s.nombre) &&
            (s.puesto === 'VPP' || s.puesto === 'VPPB' || s.rol === 'Conductor')
        );
        setAllowPilotsAsHelpers(hasPilotHelper);
      } else {
        // default select first available truck and driver
        const firstAvailTruck = trucks.find((t) => t.estado === 'Disponible');
        setTruckId(firstAvailTruck ? firstAvailTruck.id : '');

        const firstAvailDriver = staff.find(
          (s) =>
            (s.puesto === 'VPP' || s.puesto === 'VPPB' || s.rol === 'Conductor') &&
            s.estado === 'Disponible'
        );
        setDriverName(firstAvailDriver ? firstAvailDriver.nombre : '');
        setHelper1('');
        setHelper2('');
        setHelper3('');
        setHelper4('');
        setAllowPilotsAsHelpers(false);
      }
    }
  }, [isOpen, route, trucks, staff]);

  if (!isOpen || !route) return null;

  const tomorrowDate = getTomorrowGuatemalaDate(route.fecha);

  const canAssignRevisita = Boolean(
    route.asignacion ||
    route.ultimoDespacho ||
    ((route.historialDespachos?.length || 0) > 0) ||
    route.estado === 'Abierta' ||
    route.estado === 'En Tránsito' ||
    route.esReasignacion ||
    ((route.retornosCount || 0) > 0) ||
    Boolean(route.fechaAsignacion) ||
    route.tipoAsignacion === 'Revisita'
  );

  // Available lists based on modality
  // Permite asignar el mismo camión y tripulación a dos o más rutas por optimización de carga
  // Se muestran SIEMPRE todos los camiones registrados (para que el listado del
  // selector coincida con el total que aparece en la pestaña de Camiones).
  // Los que están en estado "Baja" se muestran con una etiqueta y quedan
  // deshabilitados (no seleccionables), salvo que ya sea el camión actualmente
  // asignado a esta ruta.
  const isRecarga = assignmentType === 'Recarga';
  const isPiso = assignmentType === 'Ruta a Piso';
  const isRevisita = assignmentType === 'Revisita';

  // Segmentación por agencia: solo se pueden asignar camiones y personal que
  // pertenezcan a la misma agencia de la ruta. Un camión/colaborador que todavía
  // no tenga agencia asignada (registros antiguos) no aparece aquí hasta que se
  // corrija por Carga Masiva de Excel (Camiones / Personal).
  const availableTrucks = trucks.filter((t) => t.agencia === route.agencia);

  const availableDrivers = staff.filter((s) => {
    if (s.agencia !== route.agencia) return false;
    if (s.estado === 'Baja') return false;
    const isDriverRole = s.puesto === 'VPP' || s.puesto === 'VPPB' || s.rol === 'Conductor';
    if (!isDriverRole) return false;
    return true; // Permite asignar a dos o más rutas si se optimiza la carga
  });

  const availableHelpers = staff.filter((s) => {
    if (s.agencia !== route.agencia) return false;
    if (s.estado === 'Baja') return false;
    const isStandardHelper = s.puesto === 'APP' || s.rol === 'Auxiliar';
    const isPilot = s.puesto === 'VPP' || s.puesto === 'VPPB' || s.rol === 'Conductor';
    const isCurrentlyAssignedHelper =
      s.nombre === helper1 ||
      s.nombre === helper2 ||
      s.nombre === helper3 ||
      s.nombre === helper4 ||
      s.nombre === route.asignacion?.auxiliar1 ||
      s.nombre === route.asignacion?.auxiliar2 ||
      s.nombre === route.asignacion?.auxiliar3 ||
      s.nombre === route.asignacion?.auxiliar4;

    const isPilotAllowed = allowPilotsAsHelpers && isPilot;

    if (!isStandardHelper && !isPilotAllowed && !isCurrentlyAssignedHelper) return false;
    return true; // Permite asignar a dos o más rutas si se optimiza la carga
  });

  const getIsPilot = (name: string) => {
    if (!name) return false;
    const st = staff.find((s) => s.nombre === name);
    return st?.puesto === 'VPP' || st?.puesto === 'VPPB' || st?.rol === 'Conductor';
  };

  const selectedTruckObj = trucks.find((t) => t.id === truckId);
  const selectedDriverObj = staff.find((s) => s.nombre === driverName);
  const helper1IsPilot = getIsPilot(helper1);
  const helper2IsPilot = getIsPilot(helper2);
  const helper3IsPilot = getIsPilot(helper3);
  const helper4IsPilot = getIsPilot(helper4);

  // Exclusión mutua dentro de la misma ruta:
  // Al asignar un piloto o auxiliar no debe aparecer si ya está asignado dentro de la misma ruta
  const isAssignedInRoute = (name: string, ...otherAssigned: (string | undefined | null)[]) => {
    if (!name) return false;
    const cleanName = name.trim().toLowerCase();
    return otherAssigned.some((other) => other && other.trim().toLowerCase() === cleanName);
  };

  const selectableDrivers = availableDrivers.filter(
    (d) => !isAssignedInRoute(d.nombre, helper1, helper2, helper3, helper4)
  );

  const selectableHelpers1 = availableHelpers.filter(
    (h) => !isAssignedInRoute(h.nombre, driverName, helper2, helper3, helper4)
  );

  const selectableHelpers2 = availableHelpers.filter(
    (h) => !isAssignedInRoute(h.nombre, driverName, helper1, helper3, helper4)
  );

  const selectableHelpers3 = availableHelpers.filter(
    (h) => !isAssignedInRoute(h.nombre, driverName, helper1, helper2, helper4)
  );

  const selectableHelpers4 = availableHelpers.filter(
    (h) => !isAssignedInRoute(h.nombre, driverName, helper1, helper2, helper3)
  );

  // Active routes with assigned crews for quick reload autofill
  const activeRoutesWithCrew = activeRoutes.filter(
    (r) => r.estado === 'En Tránsito' && getRouteKey(r) !== getRouteKey(route) && r.asignacion
  );

  const handleActiveCrewSelect = (routeId: string) => {
    setSelectedActiveCrewRouteId(routeId);
    // routeId aquí es la clave completa de la ruta (id + fecha + agencia).
    const targetRoute = activeRoutes.find((r) => getRouteKey(r) === routeId);
    if (targetRoute?.asignacion) {
      const asig = targetRoute.asignacion;
      setTruckId(asig.camionId || '');
      setDriverName(asig.conductor || '');
      setHelper1(asig.auxiliar1 || '');
      setHelper2(asig.auxiliar2 || '');
      setHelper3(asig.auxiliar3 || '');
      setHelper4(asig.auxiliar4 || '');

      const crewHelpers = [asig.auxiliar1, asig.auxiliar2, asig.auxiliar3, asig.auxiliar4].filter(Boolean);
      const hasPilotHelper = staff.some(
        (s) =>
          crewHelpers.includes(s.nombre) &&
          (s.puesto === 'VPP' || s.puesto === 'VPPB' || s.rol === 'Conductor')
      );
      if (hasPilotHelper) {
        setAllowPilotsAsHelpers(true);
      }

      onShowToast(
        `Cargada tripulación de ruta ${routeId}: Camión ${asig.camionPlaca} y piloto ${asig.conductor}`,
        'info'
      );
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (isPiso) {
      onMoveToFloor(route.id, getRouteKey(route), tomorrowDate, motivoPiso);
      return;
    }

    if (assignmentType === 'Revisita' && !canAssignRevisita) {
      onShowToast(
        'La opción Revisita solo puede ser asignada si la ruta fue asignada previamente.',
        'error'
      );
      return;
    }

    if (!truckId) {
      onShowToast('Debes seleccionar un camión por su placa', 'error');
      return;
    }
    if (!driverName) {
      onShowToast('Debes seleccionar un piloto titular', 'error');
      return;
    }

    const allAssigned = [driverName, helper1, helper2, helper3, helper4].filter(Boolean);
    const uniqueStaff = new Set(allAssigned.map((s) => s.trim().toLowerCase()));
    if (allAssigned.length !== uniqueStaff.size) {
      onShowToast('Un piloto o auxiliar no puede estar asignado más de una vez en la misma ruta', 'error');
      return;
    }

    const selectedTruck = trucks.find((t) => t.id === truckId);
    if (!selectedTruck) return;

    onConfirmAssignment(route.id, getRouteKey(route), {
      truckId: selectedTruck.id,
      truckPlaca: selectedTruck.placa,
      driverName,
      helper1: helper1 || undefined,
      helper2: helper2 || undefined,
      helper3: helper3 || undefined,
      helper4: helper4 || undefined,
      horaSalida,
      tipoAsignacion: isPiso ? 'Ruta a Piso' : assignmentType,
    });
  };

  const isReassign =
    route.estado === 'Abierta' ||
    ((route.historialDespachos?.length || 0) > 0) ||
    route.esReasignacion === true;
  const dispatchNum = (route.historialDespachos?.length || 0) + 1;
  const dispatchNotice = dispatchNum > 1
    ? ` [Salida #${dispatchNum} - ${assignmentType === 'Recarga' ? 'RECARGA' : assignmentType === 'Revisita' ? 'REVISITA' : assignmentType.toUpperCase()}]`
    : '';
  const splitInfo = route.isSplitRoute ? ` [Viaje ${route.tripNumber} de ${route.totalTrips}]` : '';

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-5 md:p-6">
      <div className="bg-white rounded-2xl max-w-4xl lg:max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden transform transition-all max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="px-6 sm:px-8 py-4.5 bg-slate-900 text-white flex items-center justify-between flex-shrink-0 border-b border-slate-800">
          <div>
            <h3 className="font-bold text-base sm:text-lg flex items-center text-white">
              {isPiso ? (
                <Warehouse className="w-5 h-5 mr-2 text-amber-400 flex-shrink-0" />
              ) : isRecarga ? (
                <Repeat className="w-5 h-5 mr-2 text-purple-400 flex-shrink-0" />
              ) : isRevisita ? (
                <RotateCcw className="w-5 h-5 mr-2 text-amber-400 flex-shrink-0" />
              ) : (
                <Send className="w-5 h-5 mr-2 text-blue-400 flex-shrink-0" />
              )}
              {isPiso
                ? 'Ruta a Piso: Reprogramación Automática para Mañana'
                : isRecarga
                ? `Asignación de Recarga ${dispatchNum > 1 ? `(Salida #${dispatchNum})` : '(Segundo Viaje de Tripulación)'}`
                : isRevisita
                ? `Revisita: Reasignación de Salida Previa (Salida #${dispatchNum})`
                : 'Asignación y Despacho de Ruta'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>
                Ruta: <span className="font-mono font-bold text-white bg-slate-800 px-1.5 py-0.5 rounded">{route.id}</span>
                {splitInfo}
                {dispatchNotice}
              </span>
              <span className="text-slate-500">•</span>
              <span>Agencia: <strong className="text-slate-200">{route.agencia}</strong></span>
              <span className="text-slate-500">•</span>
              <span><strong className="text-slate-200">{route.paradas}</strong> Paradas</span>
              <span className="text-slate-500">•</span>
              <span className="text-blue-300 font-semibold">{route.cajasFisicas || 0} Cajas Físicas</span>
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
            title="Cerrar ventana"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-7 space-y-4 sm:space-y-5 text-xs sm:text-sm overflow-y-auto flex-1">
          {/* Selector de Modalidad: Primer Viaje | Recarga | Revisita | Ruta a Piso */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Modalidad de Asignación / Destino de la Carga *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* Opción 1: Primer Viaje */}
              <button
                type="button"
                onClick={() => setAssignmentType('Primer Viaje')}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  assignmentType === 'Primer Viaje'
                    ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-500/20 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-blue-900 flex items-center">
                    <Send className="w-3.5 h-3.5 mr-1 text-blue-600" />
                    Primer Viaje
                  </span>
                  {assignmentType === 'Primer Viaje' && (
                    <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  Despacho ordinario de la jornada.
                </p>
              </button>

              {/* Opción 2: Recarga (Segundo Viaje) */}
              <button
                type="button"
                onClick={() => setAssignmentType('Recarga')}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  assignmentType === 'Recarga'
                    ? 'bg-purple-50 border-purple-400 ring-2 ring-purple-500/20 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-purple-900 flex items-center">
                    <Repeat className="w-3.5 h-3.5 mr-1 text-purple-600" />
                    Recarga
                  </span>
                  {assignmentType === 'Recarga' && (
                    <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  2° viaje de tripulación.
                </p>
              </button>

              {/* Opción 3: Revisita (Reasignación de salida previa) */}
              <button
                type="button"
                disabled={!canAssignRevisita}
                onClick={() => {
                  if (canAssignRevisita) {
                    setAssignmentType('Revisita');
                  }
                }}
                title={
                  !canAssignRevisita
                    ? 'La opción Revisita solo puede ser asignada si la ruta ha sido asignada previamente'
                    : 'Reasignación de salida previa o por tiempo'
                }
                className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  !canAssignRevisita
                    ? 'opacity-40 bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed select-none'
                    : assignmentType === 'Revisita'
                    ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-500/20 shadow-xs cursor-pointer'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700 cursor-pointer'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`font-bold text-xs flex items-center ${
                      !canAssignRevisita ? 'text-slate-400' : 'text-amber-900'
                    }`}
                  >
                    <RotateCcw
                      className={`w-3.5 h-3.5 mr-1 ${
                        !canAssignRevisita ? 'text-slate-400' : 'text-amber-700'
                      }`}
                    />
                    Revisita
                  </span>
                  {assignmentType === 'Revisita' && canAssignRevisita && (
                    <span className="w-2 h-2 rounded-full bg-amber-600"></span>
                  )}
                  {!canAssignRevisita && (
                    <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-tighter bg-slate-200 px-1 py-0.5 rounded">
                      Inactiva
                    </span>
                  )}
                </div>
                <p
                  className={`text-[10px] leading-tight ${
                    !canAssignRevisita ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  {!canAssignRevisita
                    ? 'Requiere asignación previa.'
                    : 'Reasignación previa o por tiempo.'}
                </p>
              </button>

              {/* Opción 4: Ruta a Piso */}
              <button
                type="button"
                onClick={() => setAssignmentType('Ruta a Piso')}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  assignmentType === 'Ruta a Piso'
                    ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-500/20 shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-amber-900 flex items-center">
                    <Warehouse className="w-3.5 h-3.5 mr-1 text-amber-700" />
                    A Piso
                  </span>
                  {assignmentType === 'Ruta a Piso' && (
                    <span className="w-2 h-2 rounded-full bg-amber-600"></span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">
                  Queda para mañana.
                </p>
              </button>
            </div>
          </div>

          {/* VISTA AVISO REVISITA */}
          {isRevisita && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-950 space-y-1">
              <div className="flex items-center font-bold text-xs text-amber-900">
                <RotateCcw className="w-3.5 h-3.5 mr-1.5 text-amber-700" />
                Modalidad Revisita (Reasignación de Ruta Previa)
              </div>
              <p className="text-[11px] leading-relaxed text-amber-800">
                Esta ruta corresponde a una salida previa que volvió a salir (usualmente por falta de tiempo de entrega o reprogramación). En las boletas y descargas de Excel quedará registrada como <strong>Revisita</strong>.
              </p>
              {route.motivoDevolucion && (
                <div className="text-[10px] bg-white/80 p-1.5 rounded border border-amber-300 text-amber-900 font-medium">
                  Motivo de retorno previo: {route.motivoDevolucion}
                </div>
              )}
            </div>
          )}

          {/* VISTA 1 & 2: RECARGA NOTICE / QUICK PICKER */}
          {isRecarga && (
            <div className="p-3.5 bg-purple-50 border border-purple-200 rounded-xl text-purple-950 space-y-2">
              <div className="flex items-center font-bold text-xs text-purple-900">
                <Repeat className="w-3.5 h-3.5 mr-1.5 text-purple-700" />
                Asignación como Recarga (2do Viaje)
              </div>
              <p className="text-[11px] leading-relaxed text-purple-800">
                Esta ruta se asigna como segundo viaje a una tripulación y camión. Puedes seleccionarla de las tripulaciones actualmente en ruta o elegir libremente la unidad y personal.
              </p>

              {activeRoutesWithCrew.length > 0 && (
                <div className="pt-1.5 border-t border-purple-200/70">
                  <label htmlFor="quickCrewSelect" className="block text-[11px] font-bold text-purple-900 mb-1 flex items-center">
                    <Sparkles className="w-3 h-3 mr-1 text-purple-600" />
                    Autocompletar con tripulación de camión en ruta activa:
                  </label>
                  <select
                    id="quickCrewSelect"
                    value={selectedActiveCrewRouteId}
                    onChange={(e) => handleActiveCrewSelect(e.target.value)}
                    className="w-full p-2 border border-purple-300 rounded-lg text-xs font-semibold bg-white text-purple-950 outline-none cursor-pointer"
                  >
                    <option value="">-- Seleccionar tripulación en tránsito --</option>
                    {activeRoutesWithCrew.map((ar) => (
                      <option key={getRouteKey(ar)} value={getRouteKey(ar)}>
                        Ruta {ar.id} → Unidad {ar.asignacion?.camionPlaca} | Piloto: {ar.asignacion?.conductor}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* VISTA OPTIMIZACIÓN: CARGA COMPARTIDA EN EL MISMO CAMIÓN Y TRIPULACIÓN */}
          {!isRecarga && !isPiso && activeRoutesWithCrew.length > 0 && (
            <div className="p-3.5 bg-sky-50/80 border border-sky-200 rounded-xl text-sky-950 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center font-bold text-xs text-sky-900">
                  <TruckIcon className="w-3.5 h-3.5 mr-1.5 text-sky-700" />
                  Optimización de Carga (Mismo camión y tripulación para 2 o más rutas)
                </div>
                <span className="text-[10px] font-bold bg-sky-100 text-sky-800 px-2 py-0.5 rounded border border-sky-200">
                  Carga Compartida
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-sky-800">
                Es posible cargar dos o más rutas al mismo camión y tripulación para optimizar el transporte. Puedes autocompletar con una ruta en tránsito o seleccionarlos directamente en los campos inferiores.
              </p>

              <div className="pt-1.5 border-t border-sky-200/70">
                <label htmlFor="quickSharedCrewSelect" className="block text-[11px] font-bold text-sky-900 mb-1 flex items-center">
                  <Sparkles className="w-3 h-3 mr-1 text-sky-600" />
                  Cargar mismo camión y tripulación de ruta en tránsito:
                </label>
                <select
                  id="quickSharedCrewSelect"
                  value={selectedActiveCrewRouteId}
                  onChange={(e) => handleActiveCrewSelect(e.target.value)}
                  className="w-full p-2 border border-sky-300 rounded-lg text-xs font-semibold bg-white text-sky-950 outline-none cursor-pointer"
                >
                  <option value="">-- Seleccionar ruta activa para combinar carga --</option>
                  {activeRoutesWithCrew.map((ar) => (
                    <option key={getRouteKey(ar)} value={getRouteKey(ar)}>
                      Ruta {ar.id} ({ar.cajasFisicas} cajas) → Unidad {ar.asignacion?.camionPlaca} | Piloto: {ar.asignacion?.conductor}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* VISTA 3: RUTA A PISO (SE QUEDA PARA MAÑANA) */}
          {isPiso ? (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-amber-950 space-y-3">
                <div className="flex items-center font-bold text-sm text-amber-900">
                  <Warehouse className="w-4 h-4 mr-2 text-amber-700" />
                  Ruta a Piso: Queda en bodega para despacho de mañana
                </div>
                <p className="text-xs leading-relaxed text-amber-900">
                  La carga física de esta ruta se quedará en bodega/piso de la agencia.
                  <strong> La fecha de ruta original ({formatDateToGuatemala(route.fechaOriginalRuta || route.fecha)}) permanecerá siempre intacta</strong> para conservar la trazabilidad y métricas exactas, quedando programada para el día de mañana ({tomorrowDate}) en estado{' '}
                  <strong className="text-blue-900 font-semibold uppercase">Pendiente de ser asignada</strong>.
                </p>

                {/* Métricas visuales de reprogramación */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                  <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200">
                    <div className="text-[10px] text-slate-500 font-semibold uppercase">Fecha Original</div>
                    <div className="font-mono font-bold text-slate-800 text-xs mt-0.5">
                      {formatDateToGuatemala(route.fechaOriginalRuta || route.fecha) || 'Hoy'}
                    </div>
                  </div>

                  <div className="bg-emerald-50/90 p-2.5 rounded-lg border border-emerald-300 shadow-xs">
                    <div className="text-[10px] text-emerald-800 font-bold uppercase flex items-center">
                      <Calendar className="w-3 h-3 mr-1 text-emerald-700" />
                      Programada Mañana
                    </div>
                    <div className="font-mono font-extrabold text-emerald-800 text-xs mt-0.5">
                      {tomorrowDate}
                    </div>
                  </div>

                  <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200">
                    <div className="text-[10px] text-slate-500 font-semibold uppercase">Nuevo Estado</div>
                    <div className="font-bold text-amber-800 text-xs mt-0.5 flex items-center">
                      <Clock className="w-3 h-3 mr-1 text-amber-600" />
                      Pendiente
                    </div>
                  </div>

                  <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200">
                    <div className="text-[10px] text-slate-500 font-semibold uppercase">Carga en Piso</div>
                    <div className="font-mono font-bold text-blue-700 text-xs mt-0.5">
                      {route.cajasFisicas} cajas
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                <label htmlFor="motivoPisoInput" className="block font-bold text-slate-800 text-xs">
                  Motivo / Observación de Traslado a Piso:
                </label>
                <input
                  id="motivoPisoInput"
                  type="text"
                  value={motivoPiso}
                  onChange={(e) => setMotivoPiso(e.target.value)}
                  placeholder="Ej. Capacidad de flota copada, corte operativo, etc."
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-xs font-medium bg-white text-slate-800 outline-none focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-[10px] text-slate-500">
                  Esta observación quedará registrada en el historial de la ruta.
                </p>
              </div>
            </div>
          ) : (
            /* VISTA DE ASIGNACIÓN (PRIMER VIAJE O RECARGA) */
            <div className="space-y-3.5">
              {isReassign && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-950 space-y-1">
                  <div className="flex items-center font-bold text-xs text-amber-900">
                    <RotateCcw className="w-3.5 h-3.5 mr-1 text-amber-700" />
                    Ruta Abierta Previa (Despacho #{(route.historialDespachos?.length || 0) + 1})
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-900">
                    Esta ruta ya salió previamente y retornó. Los recursos anteriores fueron liberados.
                    {route.ultimoDespacho && (
                      <span className="block mt-0.5">
                        <strong>Salida previa:</strong> {route.ultimoDespacho.camionPlaca} | Piloto: {route.ultimoDespacho.conductor}
                      </span>
                    )}
                  </p>
                </div>
              )}

              {/* Aviso: existen camiones/personal en el sistema pero ninguno tiene
                  asignada la agencia de esta ruta (o todavía no tienen agencia) */}
              {(availableTrucks.length === 0 && trucks.length > 0) ||
              (availableDrivers.length === 0 && staff.length > 0) ? (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 space-y-1">
                  <div className="flex items-center font-bold text-xs text-rose-800">
                    <AlertCircle className="w-3.5 h-3.5 mr-1.5 text-rose-600" />
                    Sin camiones/personal registrados para la agencia "{route.agencia}"
                  </div>
                  <p className="text-[11px] leading-relaxed text-rose-800">
                    Los camiones y colaboradores solo pueden asignarse a rutas de su misma agencia.
                    Verifica en las pestañas Camiones y Personal que tengan la Agencia "{route.agencia}"
                    asignada (puedes corregirlo con Carga Masiva de Excel).
                  </p>
                </div>
              ) : null}

              {/* Camión y Piloto en cuadrícula práctica */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Camión / Unidad */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between space-y-2.5">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="assignTruckSelect" className="font-bold text-slate-800 text-xs sm:text-sm flex items-center">
                        <TruckIcon className="w-4 h-4 mr-1.5 text-blue-600" />
                        Camión / Unidad Asignada *
                      </label>
                      {isRecarga && (
                        <span className="text-xs font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                          Modo Recarga
                        </span>
                      )}
                    </div>
                    <select
                      id="assignTruckSelect"
                      value={truckId}
                      onChange={(e) => setTruckId(e.target.value)}
                      required
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-semibold bg-white text-slate-800 outline-none text-xs sm:text-sm cursor-pointer shadow-2xs"
                    >
                      {availableTrucks.length === 0 ? (
                        <option value="">-- No hay camiones disponibles --</option>
                      ) : (
                        <>
                          <option value="">-- Seleccionar Camión --</option>
                          {availableTrucks.map((t) => {
                            const routesOnTruck = activeRoutes.filter(
                              (ar) =>
                                ar.estado === 'En Tránsito' &&
                                getRouteKey(ar) !== getRouteKey(route) &&
                                ar.asignacion?.camionId === t.id
                            );
                            const isCurrentlyAssignedHere = t.id === route.asignacion?.camionId;
                            const isBaja = t.estado === 'Baja' && !isCurrentlyAssignedHere;
                            let tag = '[Disponible]';
                            if (isBaja) {
                              tag = '[Baja - No disponible]';
                            } else if (routesOnTruck.length > 0) {
                              tag = `[En Ruta: ${routesOnTruck.map((r) => `Ruta ${r.id}`).join(', ')} - Optimización Carga Compartida]`;
                            } else if (t.estado === 'En Ruta') {
                              tag = '[En Ruta]';
                            }
                            return (
                              <option key={t.id} value={t.id} disabled={isBaja}>
                                ID: {t.idCamion || t.id} - Placa: {t.placa} ({t.capacidad}) {tag}
                              </option>
                            );
                          })}
                        </>
                      )}
                    </select>
                  </div>

                  {selectedTruckObj && (() => {
                    const routesOnTruck = activeRoutes.filter(
                      (ar) =>
                        ar.estado === 'En Tránsito' &&
                        getRouteKey(ar) !== getRouteKey(route) &&
                        ar.asignacion?.camionId === selectedTruckObj.id
                    );
                    const otherBoxes = routesOnTruck.reduce(
                      (acc, r) => acc + (parseFloat(String(r.cajasFisicas || 0)) || 0),
                      0
                    );
                    const currentBoxes = parseFloat(String(route.cajasFisicas || 0)) || 0;
                    const combinedBoxes = (currentBoxes + otherBoxes).toFixed(1);

                    return (
                      <div className="pt-2.5 border-t border-slate-200/80 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between text-slate-600">
                          <span className="flex items-center font-medium">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-1.5"></span>
                            Capacidad: <strong className="ml-1 text-slate-800">{selectedTruckObj.capacidad}</strong>
                          </span>
                          <span className="text-xs font-mono bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-200 font-semibold">
                            Carga ruta: {route.cajasFisicas} cajas
                          </span>
                        </div>
                        {routesOnTruck.length > 0 && (
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-sky-50 border border-sky-200 rounded px-2.5 py-1.5 text-sky-900 gap-1">
                            <span className="text-[11px]">
                              <strong>Carga compartida</strong> con {routesOnTruck.map((r) => `Ruta ${r.id}`).join(', ')} ({otherBoxes.toFixed(1)} cajas)
                            </span>
                            <span className="text-[11px] font-bold font-mono text-sky-950">
                              Total camión: {combinedBoxes} cajas
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Piloto Titular */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col justify-between space-y-2.5">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="assignDriverSelect" className="font-bold text-slate-800 text-xs sm:text-sm flex items-center">
                        <User className="w-4 h-4 mr-1.5 text-indigo-600" />
                        Piloto Titular (VPP / VPPB) *
                      </label>
                      {isRecarga && (
                        <span className="text-xs font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                          Segundo Viaje
                        </span>
                      )}
                    </div>
                    <select
                      id="assignDriverSelect"
                      value={driverName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDriverName(val);
                        if (val) {
                          const clean = val.trim().toLowerCase();
                          if (helper1.trim().toLowerCase() === clean) setHelper1('');
                          if (helper2.trim().toLowerCase() === clean) setHelper2('');
                          if (helper3.trim().toLowerCase() === clean) setHelper3('');
                          if (helper4.trim().toLowerCase() === clean) setHelper4('');
                        }
                      }}
                      required
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-medium text-slate-800 outline-none text-xs sm:text-sm cursor-pointer shadow-2xs"
                    >
                      {selectableDrivers.length === 0 ? (
                        <option value="">-- No hay pilotos disponibles (VPP / VPPB) --</option>
                      ) : (
                        <>
                          <option value="">-- Seleccionar Piloto Titular --</option>
                          {selectableDrivers.map((d) => {
                            const routesOnDriver = activeRoutes.filter(
                              (ar) =>
                                ar.estado === 'En Tránsito' &&
                                getRouteKey(ar) !== getRouteKey(route) &&
                                ar.asignacion?.conductor === d.nombre
                            );
                            // Corrección: "Carga Compartida" solo aplica cuando las otras
                            // rutas activas del piloto usan el MISMO camión (es la misma
                            // salida física). Si usan un camión distinto, el piloto no puede
                            // estar físicamente en dos camiones a la vez — es un conflicto de
                            // agenda, no una optimización de carga.
                            const sameTruckRoutes = routesOnDriver.filter(
                              (ar) => truckId && ar.asignacion?.camionId === truckId
                            );
                            const differentTruckRoutes = routesOnDriver.filter(
                              (ar) => !truckId || ar.asignacion?.camionId !== truckId
                            );
                            let tag = '[Disponible]';
                            if (differentTruckRoutes.length > 0) {
                              tag = `[⚠ CONFLICTO - Ya asignado en: ${differentTruckRoutes.map((r) => `Ruta ${r.id}`).join(', ')} con otro camión]`;
                            } else if (sameTruckRoutes.length > 0) {
                              tag = `[En Ruta: ${sameTruckRoutes.map((r) => `Ruta ${r.id}`).join(', ')} - Carga Compartida]`;
                            } else if (d.estado === 'En Ruta') {
                              tag = '[En Ruta]';
                            }
                            return (
                              <option key={d.id} value={d.nombre}>
                                {d.nombre} [{d.puesto || 'VPP'}] {tag} (DPI: {d.dpi || 'N/A'})
                              </option>
                            );
                          })}
                        </>
                      )}
                    </select>
                  </div>

                  {selectedDriverObj && (() => {
                    const routesOnDriver = activeRoutes.filter(
                      (ar) =>
                        ar.estado === 'En Tránsito' &&
                        getRouteKey(ar) !== getRouteKey(route) &&
                        ar.asignacion?.conductor === selectedDriverObj.nombre
                    );
                    // Corrección: distinguir entre Carga Compartida real (mismo camión)
                    // y un conflicto de agenda (camión distinto, mismo piloto en tránsito).
                    const sameTruckRoutes = routesOnDriver.filter(
                      (ar) => truckId && ar.asignacion?.camionId === truckId
                    );
                    const differentTruckRoutes = routesOnDriver.filter(
                      (ar) => !truckId || ar.asignacion?.camionId !== truckId
                    );
                    return (
                      <div className="pt-2.5 border-t border-slate-200/80 space-y-1 text-xs text-slate-600">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-indigo-900 truncate">
                            Puesto: {selectedDriverObj.puesto || 'VPP'}
                          </span>
                          <span className="text-xs font-mono text-slate-500">
                            DPI: {selectedDriverObj.dpi || 'N/A'}
                          </span>
                        </div>
                        {sameTruckRoutes.length > 0 && (
                          <div className="text-[11px] bg-indigo-50 border border-indigo-200 rounded px-2 py-0.5 text-indigo-900">
                            Asignado también en: <strong>{sameTruckRoutes.map((r) => `Ruta ${r.id}`).join(', ')}</strong> (Carga Compartida)
                          </div>
                        )}
                        {differentTruckRoutes.length > 0 && (
                          <div className="text-[11px] bg-rose-50 border border-rose-200 rounded px-2 py-0.5 text-rose-800 font-semibold">
                            ⚠ Conflicto: ya está En Tránsito en <strong>{differentTruckRoutes.map((r) => `Ruta ${r.id}`).join(', ')}</strong> con otro camión.
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Auxiliares de Reparto con opción de asignar pilotos */}
              <div className="bg-indigo-50/40 p-4 sm:p-5 rounded-xl border border-indigo-100 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    <label className="font-bold text-indigo-950 text-xs sm:text-sm flex items-center">
                      <Users className="w-4 h-4 mr-1.5 text-indigo-700" />
                      Auxiliares de Reparto (Máximo 3)
                    </label>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Selecciona los peones o ayudantes para la descarga y entrega
                    </p>
                  </div>

                  <div className="flex items-center space-x-2.5 flex-wrap gap-y-1.5">
                    {/* Switch/Checkbox: Permitir pilotos como auxiliares */}
                    <label
                      className={`inline-flex items-center px-3 py-1.5 rounded-lg border text-xs sm:text-sm font-semibold cursor-pointer transition-all select-none ${
                        allowPilotsAsHelpers
                          ? 'bg-indigo-600 border-indigo-700 text-white shadow-2xs'
                          : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400'
                      }`}
                      title="Habilitar para poder seleccionar pilotos (VPP/VPPB) disponibles como auxiliares en esta ruta"
                    >
                      <input
                        type="checkbox"
                        checked={allowPilotsAsHelpers}
                        onChange={(e) => setAllowPilotsAsHelpers(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 accent-indigo-600 focus:ring-0 mr-2 cursor-pointer"
                      />
                      <span>Permitir piloto como auxiliar</span>
                      {allowPilotsAsHelpers && (
                        <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold bg-white/25 text-white rounded">
                          Habilitado
                        </span>
                      )}
                    </label>

                    {/* Botón rápido para limpiar auxiliares */}
                    {(helper1 || helper2 || helper3 || helper4) && (
                      <button
                        type="button"
                        onClick={() => {
                          setHelper1('');
                          setHelper2('');
                          setHelper3('');
                          setHelper4('');
                        }}
                        className="text-xs text-slate-500 hover:text-red-600 font-semibold px-2.5 py-1.5 rounded-lg border border-transparent hover:border-red-200 hover:bg-red-50 flex items-center transition-colors cursor-pointer"
                        title="Quitar todos los auxiliares seleccionados"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1 text-slate-400 hover:text-red-500" />
                        Limpiar auxiliares
                      </button>
                    )}
                  </div>
                </div>

                {/* Notificación cuando la opción de pilotos de auxiliar está habilitada */}
                {allowPilotsAsHelpers && (
                  <div className="px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center text-xs text-indigo-900">
                    <Sparkles className="w-4 h-4 mr-2 text-indigo-600 flex-shrink-0" />
                    <span>
                      <strong>Opción habilitada:</strong> Los pilotos disponibles (VPP/VPPB) ahora están incluidos en los selectores de auxiliar identificados con etiqueta especial.
                    </span>
                  </div>
                )}

                {/* Grid de 4 selectores de auxiliares */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Auxiliar 1 */}
                  <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="helperSelect1" className="text-xs sm:text-sm font-bold text-slate-700">
                        Auxiliar 1 (Principal):
                      </label>
                      {helper1 && (
                        <button
                          type="button"
                          onClick={() => setHelper1('')}
                          className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-slate-100 transition cursor-pointer"
                          title="Quitar Auxiliar 1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <select
                      id="helperSelect1"
                      value={helper1}
                      onChange={(e) => {
                        const val = e.target.value;
                        setHelper1(val);
                        if (val) {
                          const clean = val.trim().toLowerCase();
                          if (driverName.trim().toLowerCase() === clean) setDriverName('');
                          if (helper2.trim().toLowerCase() === clean) setHelper2('');
                          if (helper3.trim().toLowerCase() === clean) setHelper3('');
                          if (helper4.trim().toLowerCase() === clean) setHelper4('');
                        }
                      }}
                      className="w-full p-2.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 bg-white font-medium text-xs sm:text-sm text-slate-800 outline-none cursor-pointer"
                    >
                      <option value="">-- Sin Auxiliar 1 --</option>
                      {selectableHelpers1.map((h) => {
                        const isPilot = h.puesto === 'VPP' || h.puesto === 'VPPB' || h.rol === 'Conductor';
                        const routesOnHelper = activeRoutes.filter(
                          (ar) =>
                            ar.estado === 'En Tránsito' &&
                            getRouteKey(ar) !== getRouteKey(route) &&
                            (ar.asignacion?.auxiliar1 === h.nombre ||
                              ar.asignacion?.auxiliar2 === h.nombre ||
                              ar.asignacion?.auxiliar3 === h.nombre ||
                              ar.asignacion?.auxiliar4 === h.nombre)
                        );
                        let helperTag = '';
                        if (routesOnHelper.length > 0) {
                          helperTag = `(En Ruta: ${routesOnHelper.map((r) => `Ruta ${r.id}`).join(', ')})`;
                        } else if (h.estado === 'En Ruta') {
                          helperTag = '(En Ruta)';
                        }
                        return (
                          <option key={h.id} value={h.nombre}>
                            {h.nombre} {isPilot ? `[PILOTO ${h.puesto || 'VPP'} como Auxiliar]` : `[${h.puesto || 'APP'}]`} {helperTag}
                          </option>
                        );
                      })}
                    </select>
                    {helper1 && helper1IsPilot && (
                      <div className="mt-1.5 flex items-center text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                        <User className="w-3 h-3 mr-1 text-amber-600" />
                        Piloto como Auxiliar
                      </div>
                    )}
                  </div>

                  {/* Auxiliar 2 */}
                  <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="helperSelect2" className="text-xs sm:text-sm font-bold text-slate-700">
                        Auxiliar 2 (Opcional):
                      </label>
                      {helper2 && (
                        <button
                          type="button"
                          onClick={() => setHelper2('')}
                          className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-slate-100 transition cursor-pointer"
                          title="Quitar Auxiliar 2"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <select
                      id="helperSelect2"
                      value={helper2}
                      onChange={(e) => {
                        const val = e.target.value;
                        setHelper2(val);
                        if (val) {
                          const clean = val.trim().toLowerCase();
                          if (driverName.trim().toLowerCase() === clean) setDriverName('');
                          if (helper1.trim().toLowerCase() === clean) setHelper1('');
                          if (helper3.trim().toLowerCase() === clean) setHelper3('');
                          if (helper4.trim().toLowerCase() === clean) setHelper4('');
                        }
                      }}
                      className="w-full p-2.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 bg-white font-medium text-xs sm:text-sm text-slate-800 outline-none cursor-pointer"
                    >
                      <option value="">-- Sin Auxiliar 2 --</option>
                      {selectableHelpers2.map((h) => {
                        const isPilot = h.puesto === 'VPP' || h.puesto === 'VPPB' || h.rol === 'Conductor';
                        const routesOnHelper = activeRoutes.filter(
                          (ar) =>
                            ar.estado === 'En Tránsito' &&
                            getRouteKey(ar) !== getRouteKey(route) &&
                            (ar.asignacion?.auxiliar1 === h.nombre ||
                              ar.asignacion?.auxiliar2 === h.nombre ||
                              ar.asignacion?.auxiliar3 === h.nombre ||
                              ar.asignacion?.auxiliar4 === h.nombre)
                        );
                        let helperTag = '';
                        if (routesOnHelper.length > 0) {
                          helperTag = `(En Ruta: ${routesOnHelper.map((r) => `Ruta ${r.id}`).join(', ')})`;
                        } else if (h.estado === 'En Ruta') {
                          helperTag = '(En Ruta)';
                        }
                        return (
                          <option key={h.id} value={h.nombre}>
                            {h.nombre} {isPilot ? `[PILOTO ${h.puesto || 'VPP'} como Auxiliar]` : `[${h.puesto || 'APP'}]`} {helperTag}
                          </option>
                        );
                      })}
                    </select>
                    {helper2 && helper2IsPilot && (
                      <div className="mt-1.5 flex items-center text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                        <User className="w-3 h-3 mr-1 text-amber-600" />
                        Piloto como Auxiliar
                      </div>
                    )}
                  </div>

                  {/* Auxiliar 3 */}
                  <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="helperSelect3" className="text-xs sm:text-sm font-bold text-slate-700">
                        Auxiliar 3 (Opcional):
                      </label>
                      {helper3 && (
                        <button
                          type="button"
                          onClick={() => setHelper3('')}
                          className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-slate-100 transition cursor-pointer"
                          title="Quitar Auxiliar 3"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <select
                      id="helperSelect3"
                      value={helper3}
                      onChange={(e) => {
                        const val = e.target.value;
                        setHelper3(val);
                        if (val) {
                          const clean = val.trim().toLowerCase();
                          if (driverName.trim().toLowerCase() === clean) setDriverName('');
                          if (helper1.trim().toLowerCase() === clean) setHelper1('');
                          if (helper2.trim().toLowerCase() === clean) setHelper2('');
                          if (helper4.trim().toLowerCase() === clean) setHelper4('');
                        }
                      }}
                      className="w-full p-2.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 bg-white font-medium text-xs sm:text-sm text-slate-800 outline-none cursor-pointer"
                    >
                      <option value="">-- Sin Auxiliar 3 --</option>
                      {selectableHelpers3.map((h) => {
                        const isPilot = h.puesto === 'VPP' || h.puesto === 'VPPB' || h.rol === 'Conductor';
                        const routesOnHelper = activeRoutes.filter(
                          (ar) =>
                            ar.estado === 'En Tránsito' &&
                            getRouteKey(ar) !== getRouteKey(route) &&
                            (ar.asignacion?.auxiliar1 === h.nombre ||
                              ar.asignacion?.auxiliar2 === h.nombre ||
                              ar.asignacion?.auxiliar3 === h.nombre ||
                              ar.asignacion?.auxiliar4 === h.nombre)
                        );
                        let helperTag = '';
                        if (routesOnHelper.length > 0) {
                          helperTag = `(En Ruta: ${routesOnHelper.map((r) => `Ruta ${r.id}`).join(', ')})`;
                        } else if (h.estado === 'En Ruta') {
                          helperTag = '(En Ruta)';
                        }
                        return (
                          <option key={h.id} value={h.nombre}>
                            {h.nombre} {isPilot ? `[PILOTO ${h.puesto || 'VPP'} como Auxiliar]` : `[${h.puesto || 'APP'}]`} {helperTag}
                          </option>
                        );
                      })}
                    </select>
                    {helper3 && helper3IsPilot && (
                      <div className="mt-1.5 flex items-center text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                        <User className="w-3 h-3 mr-1 text-amber-600" />
                        Piloto como Auxiliar
                      </div>
                    )}
                  </div>

                  {/* Auxiliar 4 */}
                  <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="helperSelect4" className="text-xs sm:text-sm font-bold text-slate-700">
                        Auxiliar 4 (Opcional):
                      </label>
                      {helper4 && (
                        <button
                          type="button"
                          onClick={() => setHelper4('')}
                          className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-slate-100 transition cursor-pointer"
                          title="Quitar Auxiliar 4"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <select
                      id="helperSelect4"
                      value={helper4}
                      onChange={(e) => {
                        const val = e.target.value;
                        setHelper4(val);
                        if (val) {
                          const clean = val.trim().toLowerCase();
                          if (driverName.trim().toLowerCase() === clean) setDriverName('');
                          if (helper1.trim().toLowerCase() === clean) setHelper1('');
                          if (helper2.trim().toLowerCase() === clean) setHelper2('');
                          if (helper3.trim().toLowerCase() === clean) setHelper3('');
                        }
                      }}
                      className="w-full p-2.5 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500 bg-white font-medium text-xs sm:text-sm text-slate-800 outline-none cursor-pointer"
                    >
                      <option value="">-- Sin Auxiliar 4 --</option>
                      {selectableHelpers4.map((h) => {
                        const isPilot = h.puesto === 'VPP' || h.puesto === 'VPPB' || h.rol === 'Conductor';
                        const routesOnHelper = activeRoutes.filter(
                          (ar) =>
                            ar.estado === 'En Tránsito' &&
                            getRouteKey(ar) !== getRouteKey(route) &&
                            (ar.asignacion?.auxiliar1 === h.nombre ||
                              ar.asignacion?.auxiliar2 === h.nombre ||
                              ar.asignacion?.auxiliar3 === h.nombre ||
                              ar.asignacion?.auxiliar4 === h.nombre)
                        );
                        let helperTag = '';
                        if (routesOnHelper.length > 0) {
                          helperTag = `(En Ruta: ${routesOnHelper.map((r) => `Ruta ${r.id}`).join(', ')})`;
                        } else if (h.estado === 'En Ruta') {
                          helperTag = '(En Ruta)';
                        }
                        return (
                          <option key={h.id} value={h.nombre}>
                            {h.nombre} {isPilot ? `[PILOTO ${h.puesto || 'VPP'} como Auxiliar]` : `[${h.puesto || 'APP'}]`} {helperTag}
                          </option>
                        );
                      })}
                    </select>
                    {helper4 && helper4IsPilot && (
                      <div className="mt-1.5 flex items-center text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                        <User className="w-3 h-3 mr-1 text-amber-600" />
                        Piloto como Auxiliar
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Hora Estimada de Salida con botón rápido de hora actual */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <label htmlFor="horaSalidaInput" className="font-bold text-slate-800 text-xs sm:text-sm flex items-center">
                    <Clock className="w-4 h-4 mr-1.5 text-slate-600" />
                    Hora Estimada de Salida *
                  </label>
                  <p className="text-xs text-slate-500 mt-0.5">Hora de inicio de viaje para control de tiempos de entrega</p>
                </div>
                <div className="flex items-center space-x-2.5">
                  <input
                    id="horaSalidaInput"
                    type="time"
                    value={horaSalida}
                    onChange={(e) => setHoraSalida(e.target.value)}
                    required
                    className="p-2.5 border border-slate-300 rounded-lg font-mono font-bold text-sm bg-white text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-2xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const n = new Date();
                      setHoraSalida(`${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`);
                    }}
                    className="px-3.5 py-2.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs sm:text-sm font-semibold rounded-lg transition-colors cursor-pointer shadow-2xs active:scale-95"
                    title="Asignar hora actual del sistema"
                  >
                    Hora Actual
                  </button>
                </div>
              </div>

              {/* Resumen Operativo de Tripulación */}
              <div className="p-4 sm:p-5 bg-slate-900 text-slate-100 rounded-xl shadow-xs space-y-2">
                <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-slate-300 border-b border-slate-800 pb-2">
                  <span className="flex items-center uppercase tracking-wider text-xs">
                    <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-400" />
                    Resumen de Tripulación a Despachar
                  </span>
                  <span className="font-mono text-emerald-400 text-xs sm:text-sm font-bold">
                    {horaSalida ? `Salida Programada: ${horaSalida}` : 'Hora pendiente'}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <span className="text-slate-400 text-xs block">Unidad / Camión:</span>
                    <span className="font-bold text-white text-sm truncate block mt-0.5">
                      {selectedTruckObj ? `${selectedTruckObj.placa} (${selectedTruckObj.capacidad})` : '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs block">Piloto Titular:</span>
                    <span className="font-bold text-white text-sm truncate block mt-0.5">
                      {driverName || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs block">
                      Auxiliares ({[helper1, helper2, helper3, helper4].filter(Boolean).length}):
                    </span>
                    <span className="font-medium text-slate-200 truncate block text-xs sm:text-sm mt-0.5">
                      {[helper1, helper2, helper3, helper4].filter(Boolean).length > 0
                        ? [helper1, helper2, helper3, helper4].filter(Boolean).join(', ')
                        : 'Sin auxiliares'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer Buttons */}
          <div className="pt-4 sm:pt-5 border-t border-slate-100 flex items-center justify-end space-x-3 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4.5 py-2.5 border border-slate-300 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 cursor-pointer text-xs sm:text-sm transition"
            >
              Cancelar
            </button>

            {isPiso ? (
              <button
                type="submit"
                className="px-5 sm:px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold shadow-sm flex items-center cursor-pointer text-xs sm:text-sm transition"
              >
                <Warehouse className="w-4 h-4 mr-2" />
                Confirmar y Pasar a Ruta de Mañana (A Piso)
              </button>
            ) : isRecarga ? (
              <button
                type="submit"
                className="px-5 sm:px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold shadow-sm flex items-center cursor-pointer text-xs sm:text-sm transition"
              >
                <Repeat className="w-4 h-4 mr-2" />
                Confirmar Despacho como Recarga (2do Viaje)
              </button>
            ) : isRevisita || isReassign ? (
              <button
                type="submit"
                className="px-5 sm:px-6 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold shadow-sm flex items-center cursor-pointer text-xs sm:text-sm transition"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Confirmar Despacho como Revisita
              </button>
            ) : (
              <button
                type="submit"
                className="px-5 sm:px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold shadow-sm flex items-center cursor-pointer text-xs sm:text-sm transition"
              >
                <Send className="w-4 h-4 mr-2" />
                Confirmar Despacho (Primer Viaje)
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
