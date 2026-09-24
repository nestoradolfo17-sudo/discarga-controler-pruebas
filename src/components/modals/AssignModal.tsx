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
import { ResourcePicker, PickerItem, PickerStatus } from '../ResourcePicker';
import { suggestCrewForRoute } from '../../utils/crewSuggestion';

// Recursos ocupados ahora mismo en OTRAS rutas en tránsito (para no
// precargarlos como sugerencia por defecto).
function busyNamesAndTrucks(routes: Route[], excludeKey: string) {
  const people = new Set<string>();
  const trucksBusy = new Set<string>();
  routes.forEach((r) => {
    if (r.estado !== 'En Tránsito' || !r.asignacion || getRouteKey(r) === excludeKey) return;
    const a = r.asignacion;
    if (a.camionId) trucksBusy.add(a.camionId);
    [a.conductor, a.auxiliar1, a.auxiliar2, a.auxiliar3, a.auxiliar4].forEach((n) => n && people.add(n));
  });
  return { people, trucks: trucksBusy };
}

// ¿Tiene un motivo de no asignación registrado HOY? (vacaciones, suspensión,
// etc.). Un motivo de un día anterior ya no cuenta.
function isNotAvailableToday(motivo?: string | null, fecha?: string | null, todayStr?: string): boolean {
  if (!motivo) return false;
  if (!fecha) return true;
  return String(fecha).slice(0, 10) === (todayStr || formatDateToGuatemala(new Date()));
}

interface AssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  route: Route | null;
  trucks: Truck[];
  staff: Staff[];
  activeRoutes?: Route[];
  // Histórico de rutas liquidadas: junto con activeRoutes se usa para sugerir
  // la tripulación más frecuente de esta misma ruta (ver utils/crewSuggestion).
  historyRoutes?: Route[];
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
  historyRoutes = [],
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
  // Buscador táctil abierto: camión, piloto o auxiliares (ver ResourcePicker).
  const [pickerOpen, setPickerOpen] = useState<null | 'truck' | 'driver' | 'helpers'>(null);
  const routeKeyStr = route ? getRouteKey(route) : '';

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
        // Corrección: antes se preseleccionaba el PRIMER camión y el PRIMER piloto
        // "Disponible" de toda la lista (incluso de otra agencia). Ahora se
        // precarga la tripulación MÁS FRECUENTE de esta misma ruta (mismo número
        // y agencia en días anteriores), omitiendo a quien hoy esté en tránsito
        // en otra ruta o marcado como no disponible. Si no hay historial, los
        // campos quedan vacíos para elegirlos con el buscador.
        const sug = suggestCrewForRoute(route, [...activeRoutes, ...historyRoutes], trucks, staff);
        const busy = busyNamesAndTrucks(activeRoutes, getRouteKey(route));
        const todayStr = formatDateToGuatemala(new Date());
        const unavailableToday = (name: string) => {
          const st = staff.find((x) => x.nombre === name);
          return !!st && isNotAvailableToday(st.motivoNoAsignado, st.motivoNoAsignadoFecha, todayStr);
        };
        const okTruck = sug?.truckId && !busy.trucks.has(sug.truckId) ? sug.truckId : '';
        const okDriver =
          sug?.driverName && !busy.people.has(sug.driverName) && !unavailableToday(sug.driverName)
            ? sug.driverName
            : '';
        const okHelpers = (sug?.helpers || []).filter((h) => !busy.people.has(h) && !unavailableToday(h));
        setTruckId(okTruck);
        setDriverName(okDriver);
        setHelper1(okHelpers[0] || '');
        setHelper2(okHelpers[1] || '');
        setHelper3(okHelpers[2] || '');
        setHelper4(okHelpers[3] || '');
        const hasPilotHelper = staff.some(
          (x) => okHelpers.includes(x.nombre) && (x.puesto === 'VPP' || x.puesto === 'VPPB' || x.rol === 'Conductor')
        );
        setAllowPilotsAsHelpers(hasPilotHelper);
      }
      setPickerOpen(null);
    }
    // Corrección: solo se reinicia el formulario al ABRIR el modal o cambiar de
    // ruta. Antes también se reiniciaba cada vez que llegaba un cambio de
    // camiones/personal por tiempo real, borrando lo que el usuario estaba
    // eligiendo en la tablet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, routeKeyStr]);

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

  // Exclusión mutua dentro de la misma ruta:
  // Al asignar un piloto o auxiliar no debe aparecer si ya está asignado dentro de la misma ruta
  const isAssignedInRoute = (name: string, ...otherAssigned: (string | undefined | null)[]) => {
    if (!name) return false;
    const cleanName = name.trim().toLowerCase();
    return otherAssigned.some((other) => other && other.trim().toLowerCase() === cleanName);
  };

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

  // --- Buscador táctil: listas de camiones, pilotos y auxiliares ---
  const todayStr = formatDateToGuatemala(new Date());
  const suggestion = suggestCrewForRoute(route, [...activeRoutes, ...historyRoutes], trucks, staff);
  const helpersSelected = [helper1, helper2, helper3, helper4].filter(Boolean);
  const inTransitOthers = activeRoutes.filter(
    (ar) => ar.estado === 'En Tránsito' && getRouteKey(ar) !== getRouteKey(route) && ar.asignacion
  );
  const isPilotStaff = (s: Staff) => s.puesto === 'VPP' || s.puesto === 'VPPB' || s.rol === 'Conductor';
  const outOfToday = (s: Staff) =>
    s.estatus === 'BAJA' || isNotAvailableToday(s.motivoNoAsignado, s.motivoNoAsignadoFecha, todayStr);

  const truckItems: PickerItem[] = availableTrucks.map((t) => {
    const routesOnTruck = inTransitOthers.filter((ar) => ar.asignacion?.camionId === t.id);
    const isCurrent = t.id === route.asignacion?.camionId;
    const isBaja = t.estado === 'Baja' && !isCurrent;
    const isSug = suggestion?.truckId === t.id;
    const unavailable = !isCurrent && !isBaja && isNotAvailableToday(t.motivoNoAsignado, t.motivoNoAsignadoFecha, todayStr);
    let status: PickerStatus = 'disponible';
    let label = 'Disponible';
    if (isBaja) {
      status = 'baja';
      label = 'Baja';
    } else if (unavailable) {
      status = 'no_disponible';
      label = `No disponible: ${t.motivoNoAsignado}`;
    } else if (routesOnTruck.length > 0) {
      status = 'compartida';
      label = `Carga compartida: ${routesOnTruck.map((r) => r.id).join(', ')}`;
    } else if (t.estado === 'En Ruta') {
      status = 'enruta';
      label = 'En ruta';
    } else if (isSug) {
      status = 'sugerido';
      label = `Sugerido · ${suggestion!.truckCount} de ${suggestion!.samples}`;
    }
    return {
      id: t.id,
      title: t.placa,
      subtitle: `ID ${t.idCamion || t.id} · Capacidad ${t.capacidad}${t.proveedor ? ` · ${t.proveedor}` : ''}`,
      searchText: `${t.placa} ${t.idCamion || ''} ${t.id} ${t.proveedor || ''} ${t.capacidad}`,
      status,
      statusLabel: label,
      disabled: isBaja,
      hidden: unavailable,
      extraBadge: isSug && status !== 'sugerido' ? 'Sugerido' : undefined,
    };
  });

  const driverItems: PickerItem[] = availableDrivers.map((d) => {
    const routesOnDriver = inTransitOthers.filter((ar) => ar.asignacion?.conductor === d.nombre);
    const sameTruck = routesOnDriver.filter((ar) => truckId && ar.asignacion?.camionId === truckId);
    const otherTruck = routesOnDriver.filter((ar) => !truckId || ar.asignacion?.camionId !== truckId);
    const isSug = suggestion?.driverName === d.nombre;
    const unavailable = d.nombre !== driverName && outOfToday(d);
    let status: PickerStatus = 'disponible';
    let label = 'Disponible';
    if (unavailable) {
      status = 'no_disponible';
      label = d.estatus === 'BAJA' ? 'Estatus BAJA' : `No disponible: ${d.motivoNoAsignado}`;
    } else if (otherTruck.length > 0) {
      status = 'conflicto';
      label = `Conflicto: en ruta ${otherTruck.map((r) => r.id).join(', ')} con otro camión`;
    } else if (sameTruck.length > 0) {
      status = 'compartida';
      label = `Carga compartida: ${sameTruck.map((r) => r.id).join(', ')}`;
    } else if (d.estado === 'En Ruta') {
      status = 'enruta';
      label = 'En ruta';
    } else if (isSug) {
      status = 'sugerido';
      label = `Sugerido · ${suggestion!.driverCount} de ${suggestion!.samples}`;
    }
    return {
      id: d.nombre,
      title: d.nombre,
      subtitle: `${d.puesto || 'VPP'} · Cód. ${d.codigoCorto || d.codigo || '—'} · DPI ${d.dpi || 'N/A'}`,
      searchText: `${d.nombre} ${d.codigoCorto || ''} ${d.codigo || ''} ${d.dpi || ''} ${String(d.dpi || '').replace(/\s+/g, '')} ${d.puesto || ''}`,
      status,
      statusLabel: label,
      hidden: unavailable,
      extraBadge: isSug && status !== 'sugerido' ? 'Sugerido' : undefined,
    };
  });

  const helperItems: PickerItem[] = availableHelpers
    .filter((h) => h.nombre !== driverName)
    .map((h) => {
      const routesOnHelper = inTransitOthers.filter((ar) =>
        [ar.asignacion?.auxiliar1, ar.asignacion?.auxiliar2, ar.asignacion?.auxiliar3, ar.asignacion?.auxiliar4].includes(h.nombre)
      );
      const isSug = !!suggestion?.helpers.includes(h.nombre);
      const unavailable = !helpersSelected.includes(h.nombre) && outOfToday(h);
      let status: PickerStatus = 'disponible';
      let label = 'Disponible';
      if (unavailable) {
        status = 'no_disponible';
        label = h.estatus === 'BAJA' ? 'Estatus BAJA' : `No disponible: ${h.motivoNoAsignado}`;
      } else if (routesOnHelper.length > 0) {
        status = 'compartida';
        label = `En ruta ${routesOnHelper.map((r) => r.id).join(', ')}`;
      } else if (h.estado === 'En Ruta') {
        status = 'enruta';
        label = 'En ruta';
      } else if (isSug) {
        status = 'sugerido';
        label = `Sugerido · ${suggestion!.helperCounts[h.nombre] || 0} de ${suggestion!.samples}`;
      }
      return {
        id: h.nombre,
        title: h.nombre,
        subtitle: `${h.puesto || 'APP'} · Cód. ${h.codigoCorto || h.codigo || '—'} · DPI ${h.dpi || 'N/A'}`,
        searchText: `${h.nombre} ${h.codigoCorto || ''} ${h.codigo || ''} ${h.dpi || ''} ${String(h.dpi || '').replace(/\s+/g, '')} ${h.puesto || ''}`,
        status,
        statusLabel: label,
        hidden: unavailable,
        extraBadge: isPilotStaff(h) ? 'Piloto como auxiliar' : isSug && status !== 'sugerido' ? 'Sugerido' : undefined,
      };
    });

  const setHelpersList = (list: string[]) => {
    setHelper1(list[0] || '');
    setHelper2(list[1] || '');
    setHelper3(list[2] || '');
    setHelper4(list[3] || '');
  };

  const handlePickTruck = (id: string) => {
    setTruckId(id);
    // Flujo guiado: si falta el piloto, se abre de una vez su buscador.
    setPickerOpen(driverName ? null : 'driver');
  };

  const handlePickDriver = (name: string) => {
    setDriverName(name);
    const clean = name.trim().toLowerCase();
    const remaining = helpersSelected.filter((h) => h.trim().toLowerCase() !== clean);
    if (remaining.length !== helpersSelected.length) setHelpersList(remaining);
    setPickerOpen(remaining.length === 0 ? 'helpers' : null);
  };

  const handleAddHelper = (name: string) => {
    if (helpersSelected.includes(name) || helpersSelected.length >= 4) return;
    if (driverName.trim().toLowerCase() === name.trim().toLowerCase()) setDriverName('');
    setHelpersList([...helpersSelected, name]);
  };

  const handleRemoveHelper = (name: string) => {
    setHelpersList(helpersSelected.filter((h) => h !== name));
  };

  const applySuggestion = () => {
    if (!suggestion) return;
    if (suggestion.truckId) setTruckId(suggestion.truckId);
    if (suggestion.driverName) setDriverName(suggestion.driverName);
    const helpersSug = suggestion.helpers.filter((h) => h !== suggestion.driverName);
    setHelpersList(helpersSug);
    if (staff.some((x) => helpersSug.includes(x.nombre) && isPilotStaff(x))) setAllowPilotsAsHelpers(true);
    onShowToast('Se cargó la tripulación más frecuente de esta ruta. Revísala y confirma.', 'info');
  };

  const sugTruck = suggestion?.truckId ? trucks.find((t) => t.id === suggestion.truckId) : undefined;

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

              {/* Tripulación sugerida: la más frecuente de esta misma ruta */}
              {suggestion && (
                <div className="p-3.5 sm:p-4 bg-violet-50 border border-violet-200 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="font-bold text-xs sm:text-sm text-violet-900 flex items-center">
                      <Sparkles className="w-4 h-4 mr-1.5 text-violet-600 flex-shrink-0" />
                      Tripulación más frecuente de la ruta {route.id}
                      <span className="ml-1.5 font-medium text-violet-700">
                        ({suggestion.samples} salida{suggestion.samples === 1 ? '' : 's'} anterior{suggestion.samples === 1 ? '' : 'es'})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={applySuggestion}
                      className="min-h-[44px] px-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-semibold text-sm flex items-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <Sparkles className="w-4 h-4" />
                      Usar sugerencia
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div className="bg-white rounded-lg border border-violet-100 px-3 py-2">
                      <div className="text-[10px] font-bold uppercase text-violet-500">Camión</div>
                      <div className="font-bold text-slate-800 truncate">
                        {sugTruck ? sugTruck.placa : '—'}
                        {sugTruck && <span className="font-medium text-slate-500"> · {suggestion.truckCount} de {suggestion.samples}</span>}
                      </div>
                    </div>
                    <div className="bg-white rounded-lg border border-violet-100 px-3 py-2">
                      <div className="text-[10px] font-bold uppercase text-violet-500">Piloto</div>
                      <div className="font-bold text-slate-800 truncate">
                        {suggestion.driverName || '—'}
                        {suggestion.driverName && <span className="font-medium text-slate-500"> · {suggestion.driverCount} de {suggestion.samples}</span>}
                      </div>
                    </div>
                    <div className="bg-white rounded-lg border border-violet-100 px-3 py-2">
                      <div className="text-[10px] font-bold uppercase text-violet-500">Auxiliares</div>
                      <div className="font-bold text-slate-800 truncate">
                        {suggestion.helpers.length > 0 ? suggestion.helpers.join(', ') : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Camión y Piloto: botones grandes que abren el buscador táctil */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-xs sm:text-sm flex items-center">
                      <TruckIcon className="w-4 h-4 mr-1.5 text-blue-600" />
                      1. Camión / Unidad *
                    </span>
                    {isRecarga && (
                      <span className="text-xs font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">Modo Recarga</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPickerOpen('truck')}
                    className={`w-full min-h-[64px] text-left px-4 py-3 rounded-xl border-2 flex items-center justify-between gap-3 cursor-pointer active:scale-[0.99] transition ${
                      selectedTruckObj ? 'border-blue-300 bg-blue-50/60' : 'border-dashed border-slate-300 bg-slate-50 hover:border-blue-400'
                    }`}
                  >
                    {selectedTruckObj ? (
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-base truncate">{selectedTruckObj.placa}</div>
                        <div className="text-xs text-slate-500 truncate">
                          ID {selectedTruckObj.idCamion || selectedTruckObj.id} · Capacidad {selectedTruckObj.capacidad} · Carga ruta {route.cajasFisicas} cajas
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm font-semibold text-slate-500">Tocar para buscar camión (placa o ID)</span>
                    )}
                    <span className="text-xs font-bold text-blue-700 flex-shrink-0">{selectedTruckObj ? 'Cambiar' : 'Elegir'}</span>
                  </button>
                  {selectedTruckObj && (() => {
                    const routesOnTruck = inTransitOthers.filter((ar) => ar.asignacion?.camionId === selectedTruckObj.id);
                    if (routesOnTruck.length === 0) return null;
                    const otherBoxes = routesOnTruck.reduce((acc, r) => acc + (parseFloat(String(r.cajasFisicas || 0)) || 0), 0);
                    const combined = (otherBoxes + (parseFloat(String(route.cajasFisicas || 0)) || 0)).toFixed(1);
                    return (
                      <div className="text-[11px] bg-sky-50 border border-sky-200 rounded-lg px-2.5 py-1.5 text-sky-900">
                        <strong>Carga compartida</strong> con {routesOnTruck.map((r) => `Ruta ${r.id}`).join(', ')} ({otherBoxes.toFixed(1)} cajas) · Total camión: <strong>{combined} cajas</strong>
                      </div>
                    );
                  })()}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-xs sm:text-sm flex items-center">
                      <User className="w-4 h-4 mr-1.5 text-indigo-600" />
                      2. Piloto Titular (VPP / VPPB) *
                    </span>
                    {isRecarga && (
                      <span className="text-xs font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">Segundo Viaje</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPickerOpen('driver')}
                    className={`w-full min-h-[64px] text-left px-4 py-3 rounded-xl border-2 flex items-center justify-between gap-3 cursor-pointer active:scale-[0.99] transition ${
                      selectedDriverObj ? 'border-indigo-300 bg-indigo-50/60' : 'border-dashed border-slate-300 bg-slate-50 hover:border-indigo-400'
                    }`}
                  >
                    {selectedDriverObj ? (
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 text-base truncate">{selectedDriverObj.nombre}</div>
                        <div className="text-xs text-slate-500 truncate">
                          {selectedDriverObj.puesto || 'VPP'} · Cód. {selectedDriverObj.codigoCorto || selectedDriverObj.codigo || '—'} · DPI {selectedDriverObj.dpi || 'N/A'}
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm font-semibold text-slate-500">Tocar para buscar piloto (nombre, código o DPI)</span>
                    )}
                    <span className="text-xs font-bold text-indigo-700 flex-shrink-0">{selectedDriverObj ? 'Cambiar' : 'Elegir'}</span>
                  </button>
                  {selectedDriverObj && (() => {
                    const routesOnDriver = inTransitOthers.filter((ar) => ar.asignacion?.conductor === selectedDriverObj.nombre);
                    const sameTruckRoutes = routesOnDriver.filter((ar) => truckId && ar.asignacion?.camionId === truckId);
                    const differentTruckRoutes = routesOnDriver.filter((ar) => !truckId || ar.asignacion?.camionId !== truckId);
                    return (
                      <>
                        {sameTruckRoutes.length > 0 && (
                          <div className="text-[11px] bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5 text-indigo-900">
                            Asignado también en: <strong>{sameTruckRoutes.map((r) => `Ruta ${r.id}`).join(', ')}</strong> (Carga Compartida)
                          </div>
                        )}
                        {differentTruckRoutes.length > 0 && (
                          <div className="text-[11px] bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5 text-rose-800 font-semibold">
                            ⚠ Conflicto: ya está En Tránsito en <strong>{differentTruckRoutes.map((r) => `Ruta ${r.id}`).join(', ')}</strong> con otro camión.
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Auxiliares: etiquetas táctiles + un solo botón para agregar */}
              <div className="bg-indigo-50/40 p-4 rounded-xl border border-indigo-100 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="font-bold text-indigo-950 text-xs sm:text-sm flex items-center">
                    <Users className="w-4 h-4 mr-1.5 text-indigo-700" />
                    3. Auxiliares de Reparto (hasta 4)
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <label
                      className={`inline-flex items-center min-h-[40px] px-3 rounded-lg border text-xs font-semibold cursor-pointer select-none ${
                        allowPilotsAsHelpers ? 'bg-indigo-600 border-indigo-700 text-white' : 'bg-white border-slate-300 text-slate-700'
                      }`}
                      title="Permite elegir pilotos (VPP/VPPB) como auxiliares en esta ruta"
                    >
                      <input
                        type="checkbox"
                        checked={allowPilotsAsHelpers}
                        onChange={(e) => setAllowPilotsAsHelpers(e.target.checked)}
                        className="w-4 h-4 mr-2 accent-indigo-600 cursor-pointer"
                      />
                      Permitir piloto como auxiliar
                    </label>
                    {helpersSelected.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setHelpersList([])}
                        className="min-h-[40px] px-3 rounded-lg text-xs font-semibold text-slate-500 hover:text-red-600 border border-transparent hover:border-red-200 hover:bg-red-50 flex items-center cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Quitar todos
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {helpersSelected.map((h) => (
                    <span
                      key={h}
                      className={`inline-flex items-center min-h-[48px] pl-4 pr-1.5 rounded-xl border-2 text-sm font-semibold ${
                        getIsPilot(h) ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-white border-indigo-200 text-slate-800'
                      }`}
                    >
                      {h}
                      {getIsPilot(h) && <span className="ml-1.5 text-[10px] font-bold text-amber-700">(Piloto)</span>}
                      <button
                        type="button"
                        onClick={() => handleRemoveHelper(h)}
                        className="ml-1.5 w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                        title={`Quitar a ${h}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </span>
                  ))}
                  {helpersSelected.length < 4 && (
                    <button
                      type="button"
                      onClick={() => setPickerOpen('helpers')}
                      className="min-h-[48px] px-4 rounded-xl border-2 border-dashed border-indigo-300 text-indigo-700 font-semibold text-sm hover:bg-indigo-50 cursor-pointer active:scale-95"
                    >
                      + Agregar auxiliar
                    </button>
                  )}
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
          <div className="sticky bottom-0 -mx-5 sm:-mx-7 -mb-5 sm:-mb-7 px-5 sm:px-7 py-3 sm:py-4 bg-white/95 backdrop-blur border-t border-slate-200 flex items-center justify-end space-x-3 z-10">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] px-5 border border-slate-300 text-slate-600 rounded-xl font-semibold hover:bg-slate-50 cursor-pointer text-xs sm:text-sm transition"
            >
              Cancelar
            </button>

            {isPiso ? (
              <button
                type="submit"
                className="min-h-[48px] px-5 sm:px-6 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold shadow-sm flex items-center cursor-pointer text-xs sm:text-sm transition"
              >
                <Warehouse className="w-4 h-4 mr-2" />
                Confirmar y Pasar a Ruta de Mañana (A Piso)
              </button>
            ) : isRecarga ? (
              <button
                type="submit"
                className="min-h-[48px] px-5 sm:px-6 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold shadow-sm flex items-center cursor-pointer text-xs sm:text-sm transition"
              >
                <Repeat className="w-4 h-4 mr-2" />
                Confirmar Despacho como Recarga (2do Viaje)
              </button>
            ) : isRevisita || isReassign ? (
              <button
                type="submit"
                className="min-h-[48px] px-5 sm:px-6 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold shadow-sm flex items-center cursor-pointer text-xs sm:text-sm transition"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Confirmar Despacho como Revisita
              </button>
            ) : (
              <button
                type="submit"
                className="min-h-[48px] px-5 sm:px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold shadow-sm flex items-center cursor-pointer text-xs sm:text-sm transition"
              >
                <Send className="w-4 h-4 mr-2" />
                Confirmar Despacho (Primer Viaje)
              </button>
            )}
          </div>
        </form>

        {/* Buscadores táctiles (camión, piloto, auxiliares) */}
        <ResourcePicker
          isOpen={pickerOpen === 'truck'}
          title={`Camión · Agencia ${route.agencia}`}
          placeholder="Buscar por placa, ID o proveedor..."
          items={truckItems}
          selectedIds={truckId ? [truckId] : []}
          onSelect={handlePickTruck}
          onClose={() => setPickerOpen(null)}
        />
        <ResourcePicker
          isOpen={pickerOpen === 'driver'}
          title="Piloto titular"
          placeholder="Buscar por nombre, código corto o DPI..."
          items={driverItems}
          selectedIds={driverName ? [driverName] : []}
          onSelect={handlePickDriver}
          onClose={() => setPickerOpen(null)}
        />
        <ResourcePicker
          isOpen={pickerOpen === 'helpers'}
          title="Auxiliares de reparto"
          placeholder="Buscar por nombre, código corto o DPI..."
          items={helperItems}
          selectedIds={helpersSelected}
          multi
          maxSelect={4}
          onSelect={handleAddHelper}
          onRemove={handleRemoveHelper}
          onClose={() => setPickerOpen(null)}
          headerExtra={
            <label className="min-h-[36px] px-3 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allowPilotsAsHelpers}
                onChange={(e) => setAllowPilotsAsHelpers(e.target.checked)}
                className="w-4 h-4 accent-indigo-600"
              />
              Incluir pilotos
            </label>
          }
        />
      </div>
    </div>
  );
};
