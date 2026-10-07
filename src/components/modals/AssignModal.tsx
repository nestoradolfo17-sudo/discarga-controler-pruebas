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
  Trash2,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { Button, IconButton } from '../ui/Button';
import { ModalFooter } from '../ui/ModalFooter';
import { ACTION_ICONS } from '../ui/actionIcons';
import { formatDateToGuatemala, getTomorrowGuatemalaDate } from '../../utils/date';
import { ResourcePicker, PickerItem, PickerStatus } from '../ResourcePicker';
import { suggestCrewForRoute } from '../../utils/crewSuggestion';
import { mismaJornada, esJornadaFutura } from '../../utils/jornada';

// Recursos ocupados ahora mismo en OTRAS rutas en tránsito DE LA MISMA JORNADA
// (para no precargarlos como sugerencia por defecto). Las rutas del día
// siguiente no compiten con las de hoy: se pueden asignar sin liquidar hoy.
function busyNamesAndTrucks(routes: Route[], excludeKey: string, ref?: Route | null) {
  const people = new Set<string>();
  const trucksBusy = new Set<string>();
  routes.forEach((r) => {
    if (r.estado !== 'En Tránsito' || !r.asignacion || getRouteKey(r) === excludeKey) return;
    if (ref && !mismaJornada(r, ref)) return;
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
  // Ruta Bolsón: la ruta se envía a rechazo y no sale (sin camión ni tripulación).
  onMoveToBolson?: (routeId: string, fecha: string, motivo: string) => void;
  // Self Service: sin camión ni tripulación; queda marcada para liquidar.
  onMoveToSelfService?: (routeId: string, fecha: string, nota: string) => void;
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
  onMoveToBolson,
  onMoveToSelfService,
  onShowToast,
}) => {
  const [notaSelfService, setNotaSelfService] = useState('');
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
  const [motivoBolson, setMotivoBolson] = useState('');
  // Buscador táctil abierto: camión, piloto o auxiliares (ver ResourcePicker).
  const [pickerOpen, setPickerOpen] = useState<null | 'truck' | 'driver' | 'helpers'>(null);
  // Ventana de asignación a pantalla completa (se recuerda en este navegador).
  const [isMaximized, setIsMaximized] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dc_assign_maximized') === '1';
    } catch {
      return false;
    }
  });
  const toggleMaximized = () => {
    setIsMaximized((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('dc_assign_maximized', next ? '1' : '0');
      } catch {
        /* sin almacenamiento */
      }
      return next;
    });
  };
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
      setMotivoBolson('');

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
        // La tripulación recomendada NO se precarga: los campos quedan vacíos y
        // la sugerencia solo aparece en el panel "Tripulación más frecuente";
        // se coloca únicamente al pulsar "Usar sugerencia".
        setTruckId('');
        setDriverName('');
        setHelper1('');
        setHelper2('');
        setHelper3('');
        setHelper4('');
        setAllowPilotsAsHelpers(false);
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
  // Bolsón solo aplica si la ruta NO tiene camión/tripulación asignados en este momento.
  const canBolson = !!onMoveToBolson && !route.asignacion;
  const isBolson = assignmentType === 'Ruta Bolsón';
  // Self Service también se permite al REASIGNAR una ruta asignada por error:
  // se liberan camión y tripulación.
  const canSelfService = !!onMoveToSelfService && route.estado !== 'Liquidada';
  const isSelfService = assignmentType === 'Self Service';
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
    (r) => r.estado === 'En Tránsito' && getRouteKey(r) !== getRouteKey(route) && r.asignacion && mismaJornada(r, route)
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
    if (isSelfService) {
      if (!canSelfService || !onMoveToSelfService) return;
      onMoveToSelfService(route.id, getRouteKey(route), notaSelfService.trim());
      return;
    }
    if (isBolson) {
      if (!canBolson || !onMoveToBolson) return;
      onMoveToBolson(route.id, getRouteKey(route), motivoBolson.trim() || 'Ruta enviada a rechazo (Bolsón)');
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
    // Piloto y auxiliares son opcionales: se permite asignar solo el camión
    // (p. ej. la noche anterior) y completar la tripulación después.

    // Un camión o persona ya asignado a otra ruta en tránsito solo se puede usar
    // si viene de "Optimización de Carga" (tripulación copiada de esa ruta).
    if (isBusyTruck(truckId)) {
      onShowToast('Ese camión ya está asignado a otra ruta en tránsito. Para cargar dos rutas en el mismo camión usa "Optimización de Carga".', 'error');
      return;
    }
    const busyPeople = [driverName, helper1, helper2, helper3, helper4].filter((n) => n && isBusyPerson(n));
    if (busyPeople.length > 0) {
      onShowToast(`${busyPeople.join(', ')} ya está(n) asignado(s) a otra ruta en tránsito. Para compartir tripulación usa "Optimización de Carga".`, 'error');
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
  // Día de referencia para motivos de no asignación: hoy, o la fecha de la ruta si es futura.
  const todayStr = esJornadaFutura(route.fecha) ? formatDateToGuatemala(route.fecha) : formatDateToGuatemala(new Date());
  const suggestion = suggestCrewForRoute(route, [...activeRoutes, ...historyRoutes], trucks, staff);
  const helpersSelected = [helper1, helper2, helper3, helper4].filter(Boolean);
  const inTransitOthers = activeRoutes.filter(
    (ar) => ar.estado === 'En Tránsito' && getRouteKey(ar) !== getRouteKey(route) && ar.asignacion && mismaJornada(ar, route)
  );
  // Recursos ya asignados a OTRA ruta en tránsito: se quitan de los buscadores.
  // Para unir dos rutas en un mismo camión (carga compartida) la única vía es
  // "Optimización de Carga" / "Autocompletar con tripulación en ruta": los
  // recursos de la ruta elegida ahí son los únicos ocupados que se permiten.
  const busyNow = busyNamesAndTrucks(activeRoutes, getRouteKey(route), route);
  // Ruta de una fecha futura (p. ej. asignación de mañana a las 21:00): el estado
  // "En ruta" de hoy no la afecta; camión y tripulación quedan disponibles.
  const rutaFutura = esJornadaFutura(route.fecha);
  const sharedRoute = selectedActiveCrewRouteId
    ? activeRoutes.find((r) => getRouteKey(r) === selectedActiveCrewRouteId && r.asignacion)
    : undefined;
  const sharedAsig = sharedRoute?.asignacion || null;
  const sharedPeople = new Set(
    [sharedAsig?.conductor, sharedAsig?.auxiliar1, sharedAsig?.auxiliar2, sharedAsig?.auxiliar3, sharedAsig?.auxiliar4].filter(
      Boolean
    ) as string[]
  );
  const isBusyTruck = (id: string) => busyNow.trucks.has(id) && id !== sharedAsig?.camionId;
  const isBusyPerson = (name: string) => busyNow.people.has(name) && !sharedPeople.has(name);

  const isPilotStaff = (s: Staff) => s.puesto === 'VPP' || s.puesto === 'VPPB' || s.rol === 'Conductor';
  const outOfToday = (s: Staff) =>
    s.estatus === 'BAJA' || isNotAvailableToday(s.motivoNoAsignado, s.motivoNoAsignadoFecha, todayStr);

  const truckItems: PickerItem[] = availableTrucks.filter((t) => !isBusyTruck(t.id)).map((t) => {
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
    } else if (t.estado === 'En Ruta' && !rutaFutura) {
      status = 'enruta';
      label = 'En ruta';
    } else if (isSug) {
      status = 'sugerido';
      label = `Sugerido · ${suggestion!.truckCount} de ${suggestion!.samples}`;
    }
    return {
      id: t.id,
      title: t.idCamion ? `ID ${t.idCamion}` : t.placa,
      subtitle: `${t.idCamion ? `Placa ${t.placa}` : 'Sin ID de camión'} · Capacidad ${t.capacidad}${t.proveedor ? ` · ${t.proveedor}` : ''}`,
      searchText: `${t.placa} ${t.idCamion || ''} ${t.id} ${t.proveedor || ''} ${t.capacidad}`,
      status,
      statusLabel: label,
      disabled: isBaja,
      hidden: unavailable,
      extraBadge: isSug && status !== 'sugerido' ? 'Sugerido' : undefined,
    };
  });

  const driverItems: PickerItem[] = availableDrivers.filter((d) => !isBusyPerson(d.nombre)).map((d) => {
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
    } else if (d.estado === 'En Ruta' && !rutaFutura) {
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
    .filter((h) => h.nombre !== driverName && !isBusyPerson(h.nombre))
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
      } else if (h.estado === 'En Ruta' && !rutaFutura) {
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
    // No se cargan recursos que ya están asignados a otra ruta en tránsito.
    const skipped: string[] = [];
    if (suggestion.truckId) {
      if (isBusyTruck(suggestion.truckId)) skipped.push('camión');
      else setTruckId(suggestion.truckId);
    }
    if (suggestion.driverName) {
      if (isBusyPerson(suggestion.driverName)) skipped.push('piloto');
      else setDriverName(suggestion.driverName);
    }
    const helpersSug = suggestion.helpers.filter((h) => h !== suggestion.driverName);
    const helpersFree = helpersSug.filter((h) => !isBusyPerson(h));
    if (helpersFree.length < helpersSug.length) skipped.push(`${helpersSug.length - helpersFree.length} auxiliar(es)`);
    setHelpersList(helpersFree);
    if (staff.some((x) => helpersFree.includes(x.nombre) && isPilotStaff(x))) setAllowPilotsAsHelpers(true);
    onShowToast(
      skipped.length > 0
        ? `Se cargó la tripulación sugerida, excepto ${skipped.join(', ')} ya asignado(s) a otra ruta en tránsito.`
        : 'Se cargó la tripulación más frecuente de esta ruta. Revísala y confirma.',
      'info'
    );
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
    <div className={`fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center ${isMaximized ? 'p-0' : 'p-3 sm:p-5 md:p-6'}`}>
      <div
        className={`bg-white w-full shadow-2xl border border-slate-200 overflow-hidden transform transition-all flex flex-col ${
          isMaximized ? 'h-full max-h-full rounded-none' : 'rounded-2xl max-w-4xl lg:max-w-5xl max-h-[94vh]'
        }`}
      >
        {/* Header */}
        <div className="px-6 sm:px-8 py-4.5 bg-slate-900 text-white flex items-center justify-between flex-shrink-0 border-b border-slate-800">
          <div>
            <h3 className="font-bold text-base sm:text-lg flex items-center text-white">
              {isBolson ? (
                <Warehouse className="w-5 h-5 mr-2 text-rose-400 flex-shrink-0" />
              ) : isPiso ? (
                <Warehouse className="w-5 h-5 mr-2 text-amber-400 flex-shrink-0" />
              ) : isRecarga ? (
                <Repeat className="w-5 h-5 mr-2 text-purple-400 flex-shrink-0" />
              ) : isRevisita ? (
                <RotateCcw className="w-5 h-5 mr-2 text-amber-400 flex-shrink-0" />
              ) : (
                <Send className="w-5 h-5 mr-2 text-blue-400 flex-shrink-0" />
              )}
              {isSelfService
                ? 'Self Service: sin camión ni tripulación'
                : isBolson
                ? 'Ruta Bolsón: se envía a rechazo (no sale)'
                : isPiso
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
          <div className="flex items-center gap-1 flex-shrink-0">
          <IconButton
            icon={isMaximized ? ACTION_ICONS.restaurar : ACTION_ICONS.pantallaCompleta}
            label={isMaximized ? 'Restaurar tamaño de la ventana' : 'Ver a pantalla completa'}
            onClick={toggleMaximized}
            className="text-slate-300 hover:text-white hover:bg-slate-800"
          />
          <IconButton
            icon={ACTION_ICONS.cerrar}
            label="Cerrar ventana"
            onClick={onClose}
            className="text-slate-300 hover:text-white hover:bg-slate-800"
          />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-7 space-y-4 sm:space-y-5 text-xs sm:text-sm overflow-y-auto flex-1">
          {/* Selector de Modalidad: Primer Viaje | Recarga | Revisita | Ruta a Piso */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              Modalidad de Asignación / Destino de la Carga *
            </label>
            <div className={`grid grid-cols-2 gap-2 ${canBolson || canSelfService ? 'sm:grid-cols-3 lg:grid-cols-6' : 'sm:grid-cols-4'}`}>
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

              {/* Opción 6: Self Service (el cliente recoge; sin tripulación) */}
              {canSelfService && (
                <button
                  type="button"
                  id="optSelfService"
                  onClick={() => setAssignmentType('Self Service')}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    isSelfService
                      ? 'bg-teal-50 border-teal-400 ring-2 ring-teal-500/20 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-teal-900 flex items-center">
                      <Package className="w-3.5 h-3.5 mr-1 text-teal-700" />
                      Self Service
                    </span>
                    {isSelfService && <span className="w-2 h-2 rounded-full bg-teal-600"></span>}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-tight">
                    Sin tripulación.
                  </p>
                </button>
              )}

              {/* Opción 5: Ruta Bolsón (se envía a rechazo, no sale) */}
              {canBolson && (
                <button
                  type="button"
                  onClick={() => setAssignmentType('Ruta Bolsón')}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    isBolson
                      ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-500/20 shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-rose-900 flex items-center">
                      <Warehouse className="w-3.5 h-3.5 mr-1 text-rose-700" />
                      Bolsón
                    </span>
                    {isBolson && <span className="w-2 h-2 rounded-full bg-rose-600"></span>}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-tight">
                    A rechazo, no sale.
                  </p>
                </button>
              )}
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
                    className="w-full min-h-[44px] p-2 border border-purple-300 rounded-lg text-xs font-semibold bg-white text-purple-950 outline-none cursor-pointer"
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
          {!isRecarga && !isPiso && !isBolson && activeRoutesWithCrew.length > 0 && (
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
                  className="w-full min-h-[44px] p-2 border border-sky-300 rounded-lg text-xs font-semibold bg-white text-sky-950 outline-none cursor-pointer"
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

          {/* VISTA 6: SELF SERVICE (SIN TRIPULACIÓN) */}
          {isSelfService ? (
            <div className="space-y-4">
              <div className="p-4 bg-teal-50 border border-teal-300 rounded-xl text-teal-950 space-y-3">
                <div className="flex items-center font-bold text-sm text-teal-900">
                  <Package className="w-4 h-4 mr-2 text-teal-700" />
                  Self Service: el cliente recoge, no requiere camión ni tripulación
                </div>
                <p className="text-xs leading-relaxed text-teal-900">
                  {route.asignacion && (
                    <span className="block mb-1 font-bold text-amber-800">
                      Esta ruta tiene asignado el camión {route.asignacion.camionPlaca} con {route.asignacion.conductor}: al
                      confirmar se liberan camión y tripulación.
                    </span>
                  )}
                  La ruta queda en el tablero marcada como <strong>Self Service · por liquidar</strong>. Cuando se entregue,
                  se liquida con el botón “Liquidar Self Service” (formulario normal de liquidación). Si fue un error, se puede
                  quitar desde “⋯”.
                </p>
              </div>
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                <label htmlFor="notaSelfServiceInput" className="block font-bold text-slate-800 text-xs">
                  Observación (opcional):
                </label>
                <input
                  id="notaSelfServiceInput"
                  type="text"
                  value={notaSelfService}
                  onChange={(e) => setNotaSelfService(e.target.value)}
                  maxLength={160}
                  placeholder="Ej. Cliente recoge en bodega a las 10:00"
                  className="w-full min-h-[44px] p-2.5 border border-slate-300 rounded-lg text-xs font-medium bg-white text-slate-800 outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          ) : /* VISTA 5: RUTA BOLSÓN (A RECHAZO, NO SALE) */
          isBolson ? (
            <div className="space-y-4">
              <div className="p-4 bg-rose-50 border border-rose-300 rounded-xl text-rose-950 space-y-3">
                <div className="flex items-center font-bold text-sm text-rose-900">
                  <Warehouse className="w-4 h-4 mr-2 text-rose-700" />
                  Ruta Bolsón: se envía a rechazo y no sale a ruta
                </div>
                <p className="text-xs leading-relaxed text-rose-900">
                  No se asigna camión ni tripulación. La ruta queda en el tablero marcada como <strong>Bolsón · por liquidar</strong>,
                  con su fecha y su carga originales, y luego se liquida como <strong>rechazo</strong> con el botón “Liquidar bolsón”.
                  Si fue un error, se puede quitar del bolsón desde “⋯”.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  <div className="bg-white/80 p-2.5 rounded-lg border border-rose-200">
                    <div className="text-[10px] text-slate-500 font-semibold uppercase">Cajas físicas</div>
                    <div className="font-mono font-bold text-rose-800 text-xs mt-0.5">{route.cajasFisicas || 0} cajas</div>
                  </div>
                  <div className="bg-white/80 p-2.5 rounded-lg border border-rose-200">
                    <div className="text-[10px] text-slate-500 font-semibold uppercase">Paradas</div>
                    <div className="font-mono font-bold text-slate-800 text-xs mt-0.5">{route.paradas || 0}</div>
                  </div>
                  <div className="bg-white/80 p-2.5 rounded-lg border border-rose-200">
                    <div className="text-[10px] text-slate-500 font-semibold uppercase">Nuevo estado</div>
                    <div className="font-bold text-rose-800 text-xs mt-0.5">Bolsón · por liquidar</div>
                  </div>
                </div>
              </div>
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                <label htmlFor="motivoBolsonInput" className="block font-bold text-slate-800 text-xs">
                  Motivo / observación del rechazo (opcional):
                </label>
                <input
                  id="motivoBolsonInput"
                  type="text"
                  value={motivoBolson}
                  onChange={(e) => setMotivoBolson(e.target.value)}
                  maxLength={160}
                  placeholder="Ej. Cliente rechazó el pedido completo, pedido cancelado, etc."
                  className="w-full min-h-[44px] p-2.5 border border-slate-300 rounded-lg text-xs font-medium bg-white text-slate-800 outline-none focus:ring-2 focus:ring-rose-500"
                />
                <p className="text-[10px] text-slate-500">Queda registrado en la ruta y en su liquidación.</p>
              </div>
            </div>
          ) : /* VISTA 3: RUTA A PISO (SE QUEDA PARA MAÑANA) */
          isPiso ? (
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
                  className="w-full min-h-[44px] p-2.5 border border-slate-300 rounded-lg text-xs font-medium bg-white text-slate-800 outline-none focus:ring-2 focus:ring-amber-500"
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
                      className="min-h-[48px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm flex items-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <Sparkles className="w-4 h-4" />
                      Usar sugerencia
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div className="bg-white rounded-lg border border-violet-100 px-3 py-2">
                      <div className="text-[10px] font-bold uppercase text-violet-500">Camión</div>
                      <div className="font-bold text-slate-800 truncate">
                        {sugTruck ? (sugTruck.idCamion ? `ID ${sugTruck.idCamion}` : sugTruck.placa) : '—'}
                        {sugTruck && <span className="font-medium text-slate-500"> · {suggestion.truckCount} de {suggestion.samples}</span>}
                        {sugTruck && sugTruck.idCamion && <span className="block text-[11px] font-semibold text-slate-600">Placa {sugTruck.placa}</span>}
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

              <p className="text-[11px] text-slate-500 -mt-1">
                Las unidades, pilotos y auxiliares que ya están asignados a otra ruta en tránsito no aparecen en los buscadores.
                Para cargar dos rutas en un mismo camión usa <strong>Optimización de Carga</strong>.
              </p>
              <p id="hintSoloCamion" className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 -mt-1">
                Solo el <strong>camión</strong> es obligatorio. El piloto y los auxiliares son opcionales: puedes asignar solo la unidad
                (por ejemplo la noche anterior) y completar la tripulación después con <strong>Modificar / Reasignar</strong>.
              </p>

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
                        <div id="selTruckId" className="font-black text-slate-900 text-lg leading-tight truncate">
                          {selectedTruckObj.idCamion ? `ID ${selectedTruckObj.idCamion}` : selectedTruckObj.placa}
                        </div>
                        <div id="selTruckPlaca" className="text-sm font-bold text-blue-800 truncate">
                          {selectedTruckObj.idCamion ? `Placa ${selectedTruckObj.placa}` : 'Sin ID de camión'}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          Capacidad {selectedTruckObj.capacidad} · Carga ruta {route.cajasFisicas} cajas
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
                      2. Piloto Titular (VPP / VPPB) <span className="ml-1 font-normal text-slate-400 text-[11px]">(opcional)</span>
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
                        className="min-h-[44px] px-3 rounded-lg text-xs font-semibold text-slate-500 hover:text-red-600 border border-transparent hover:border-red-200 hover:bg-red-50 flex items-center cursor-pointer"
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
                        className="ml-1.5 min-w-[44px] min-h-[44px] rounded-lg flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                        title={`Quitar a ${h}`}
                        aria-label={`Quitar a ${h}`}
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
                    className="min-h-[44px] px-3.5 py-2.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs sm:text-sm font-semibold rounded-lg transition-colors cursor-pointer shadow-2xs active:scale-95"
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
                      {selectedTruckObj ? (selectedTruckObj.idCamion ? `ID ${selectedTruckObj.idCamion}` : selectedTruckObj.placa) : '—'}
                    </span>
                    <span className="text-slate-300 text-xs block">
                      {selectedTruckObj ? `${selectedTruckObj.idCamion ? `Placa ${selectedTruckObj.placa} · ` : ''}Capacidad ${selectedTruckObj.capacidad}` : ''}
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

          {/* Pie fijo: Cancelar a la izquierda, acción principal a la derecha
              con un verbo específico (ver ui/ModalFooter.tsx). */}
          <ModalFooter
            bleed="p-5 sm:p-7"
            secondary={
              <Button variant="secondary" size="lg" onClick={onClose}>
                Cancelar
              </Button>
            }
            info={
              <span className="hidden md:inline">
                Ruta <b className="text-slate-700">{route.id}</b> · {route.cajasFisicas || 0} cajas
              </span>
            }
          >
            {isSelfService ? (
              <Button type="submit" variant="success" size="lg" icon={ACTION_ICONS.liquidar}>
                Marcar como Self Service
              </Button>
            ) : isBolson ? (
              <Button type="submit" variant="danger" size="lg" icon={ACTION_ICONS.aPiso}>
                Enviar a Bolsón (rechazo)
              </Button>
            ) : isPiso ? (
              <Button type="submit" variant="warning" size="lg" icon={ACTION_ICONS.aPiso}>
                Enviar a Piso (mañana)
              </Button>
            ) : isRecarga ? (
              <Button type="submit" variant="primary" size="lg" icon={ACTION_ICONS.recarga}>
                Despachar recarga
              </Button>
            ) : isRevisita || isReassign ? (
              <Button type="submit" variant="primary" size="lg" icon={ACTION_ICONS.reasignar}>
                Despachar revisita
              </Button>
            ) : (
              <Button type="submit" variant="primary" size="lg" icon={ACTION_ICONS.asignar}>
                Asignar y despachar
              </Button>
            )}
          </ModalFooter>
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
