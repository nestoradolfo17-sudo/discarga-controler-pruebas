import React, { useState, useMemo, useEffect } from 'react';
import { Route, Staff, Truck } from '../../types';
import { parseFlexibleDate, formatDateToGuatemala, formatDateTimeToGuatemala } from '../../utils/date';
import {
  X,
  Truck as TruckIcon,
  Warehouse,
  RefreshCw,
  Clock,
  Building2,
  MapPin,
  Printer,
  Search,
  Layers,
  Sun,
  Moon,
  CheckCircle2,
  Package,
  PackageCheck,
  PackageX,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  Filter,
  TableProperties,
  BarChart3,
  FileDown,
  Navigation,
  Users,
  ClipboardCheck
} from 'lucide-react';
import { generateDailySummaryPdf } from '../../utils/dailySummaryPdf';

export type DailySummaryMode = 'inicio' | 'fin';
export type InicioFilter = 'todas' | 'pendientes' | 'transito' | 'en_tiempo' | 'atrasadas' | 'piso' | 'recargas';
export type FinFilter = 'todas' | 'liquidadas' | 'en_tiempo' | 'atrasadas' | 'pendientes' | 'piso';

interface DailySummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  routes: Route[];
  allLiquidatedRoutes: Route[];
  staff: Staff[];
  trucks: Truck[];
  selectedAgency: string;
  agencies: string[];
  fechaHoy: string;
  initialMode?: DailySummaryMode;
  // Abre el Acta de Cierre y Liquidación Total del Día (listado de liquidadas/no
  // liquidadas con espacio de firma), disponible desde la vista Fin de Día.
  onOpenClosingActa?: () => void;
}

// Estructura normalizada de cada fila del resumen diario (tanto para inicio como para fin de día)
export interface RouteSummaryMetric {
  id: string;
  route: Route;
  agencia: string;
  segmento: string;
  // 1. Fecha Planificada
  fechaPlanificadaStr: string;
  fechaPlanificadaDate: Date | null;
  // 2. Fecha Despachada
  fechaDespachadaStr: string;
  fechaDespachadaDate: Date | null;
  isDespachada: boolean;
  despachoLabel: string;
  // 3. Total de Horas desde la Fecha Planificada
  totalHorasDesdePlan: number;
  horasTexto: string;
  // 4. Indicador: En tiempo vs Atrasado
  estaAtrasado: boolean;
  indicadorLabel: 'En tiempo' | 'Atrasado';
  indicadorDetalle: string;
  // 5. Cajas Físicas
  cajasFisicasPlan: number;
  cajasFisicasEntregadas: number;
  cajasFisicasDevueltas: number;
  efectividadEntregaPorc: number;
  // 6. Paradas
  paradasPlan: number;
  guiasExitosas: number;
  guiasRechazadas: number;
  // Metadatos de ejecución
  isLiquidada: boolean;
  isFloor: boolean;
  isRecarga: boolean;
  isRezagadaAnterior: boolean;
  estado: string;
  horaSalida?: string;
  horaLiquidacion?: string;
  motivoPiso?: string;
}

// Obtiene la fecha base de referencia para una ruta
function getRouteBaseDate(r: Route): Date | null {
  if (r.fechaOriginalRuta) {
    const d = parseFlexibleDate(r.fechaOriginalRuta);
    if (d && !isNaN(d.getTime())) return d;
  }
  if (r.fecha) {
    const d = parseFlexibleDate(r.fecha);
    if (d && !isNaN(d.getTime())) return d;
  }
  if (r.fechaCarga) {
    const d = parseFlexibleDate(r.fechaCarga);
    if (d && !isNaN(d.getTime())) return d;
  }
  if (r.fechaCreacion) {
    const d = parseFlexibleDate(r.fechaCreacion);
    if (d && !isNaN(d.getTime())) return d;
  }
  if (r.fechaPiso) {
    const d = parseFlexibleDate(r.fechaPiso);
    if (d && !isNaN(d.getTime())) return d;
  }
  return null;
}

// Determina si una ruta proviene de días anteriores al día de operación actual
function isFromPreviousDays(r: Route, fechaHoyStr?: string): boolean {
  const today = parseFlexibleDate(fechaHoyStr) || new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);

  const rDate = getRouteBaseDate(r);
  if (!rDate || isNaN(rDate.getTime())) return false;

  const rDateMidnight = new Date(rDate.getFullYear(), rDate.getMonth(), rDate.getDate(), 0, 0, 0, 0);
  return rDateMidnight.getTime() < todayMidnight.getTime();
}

// Transforma una ruta en su métrica ejecutiva estructurada para el resumen
function buildRouteSummaryMetric(r: Route, fechaHoyStr?: string): RouteSummaryMetric {
  const isFloor = Boolean(
    r.aPiso ||
    r.tipoAsignacion === 'Ruta a Piso' ||
    r.asignacion?.tipoAsignacion === 'Ruta a Piso'
  );

  const isRecarga = Boolean(
    r.esRecarga ||
    r.tipoAsignacion === 'Recarga' ||
    r.asignacion?.tipoAsignacion === 'Recarga' ||
    r.ultimoDespacho?.tipoAsignacion === 'Recarga'
  );

  const isLiquidada = r.estado === 'Liquidada' || Boolean(r.liquidacion);
  const isRezagada = isFromPreviousDays(r, fechaHoyStr);

  // 1. FECHA PLANIFICADA
  const baseDate = getRouteBaseDate(r) || (parseFlexibleDate(fechaHoyStr) || new Date());
  const fechaPlanificadaStr = formatDateToGuatemala(baseDate);

  // Hora base planificada de salida (6:00 AM estándar en logística o la asignada)
  let plannedHour = 6;
  let plannedMin = 0;
  if (r.asignacion?.horaSalida && r.asignacion.horaSalida.includes(':')) {
    const [h, m] = r.asignacion.horaSalida.split(':');
    plannedHour = parseInt(h, 10) || 6;
    plannedMin = parseInt(m, 10) || 0;
  }
  const plannedDateTime = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    plannedHour,
    plannedMin,
    0
  );

  // 2. FECHA DESPACHADA
  let isDespachada = false;
  let fechaDespachadaStr = 'Sin despachar';
  let fechaDespachadaDate: Date | null = null;
  let despachoLabel = 'Pendiente';

  if (isFloor) {
    fechaDespachadaStr = 'En Bodega (A Piso)';
    despachoLabel = 'A Piso';
  } else if (
    (r.estado === 'En Tránsito' || r.estado === 'Liquidada') ||
    (r.estado !== 'Pendiente' && (
      Boolean(r.asignacion?.horaSalida) ||
      Boolean(r.asignacion?.fechaDespacho) ||
      Boolean(r.asignacion?.fechaAsignacion) ||
      Boolean(r.fechaAsignacion)
    ))
  ) {
    isDespachada = true;
    despachoLabel = 'Despachada';

    // Obtener fecha y hora real de despacho
    const rawDispatchDateStr =
      r.asignacion?.fechaDespacho ||
      r.asignacion?.fechaAsignacion ||
      r.fechaAsignacion ||
      r.fecha;

    const dispatchDateObj = parseFlexibleDate(rawDispatchDateStr) || baseDate;
    const horaSalida = r.asignacion?.horaSalida || '06:30';

    if (horaSalida && horaSalida.includes(':')) {
      const [dh, dm] = horaSalida.split(':');
      fechaDespachadaDate = new Date(
        dispatchDateObj.getFullYear(),
        dispatchDateObj.getMonth(),
        dispatchDateObj.getDate(),
        parseInt(dh, 10) || 6,
        parseInt(dm, 10) || 30,
        0
      );
    } else {
      fechaDespachadaDate = dispatchDateObj;
    }

    fechaDespachadaStr = `${formatDateToGuatemala(dispatchDateObj)} ${horaSalida}`;
  } else {
    fechaDespachadaStr = 'Pendiente de despacho';
    despachoLabel = 'Pendiente';
  }

  // 3. TOTAL DE HORAS DESDE LA FECHA PLANIFICADA
  const now = new Date();
  let elapsedMs = 0;

  if (isLiquidada && r.liquidacion) {
    // Si la ruta ya fue liquidada, calcular las horas que duró el ciclo operativo desde la fecha/hora planificada hasta la liquidación
    let liqDate: Date | null = null;
    if (r.fechaLiquidacion) {
      liqDate = parseFlexibleDate(r.fechaLiquidacion);
    } else if (r.liquidacion.fechaLiquidacion) {
      liqDate = parseFlexibleDate(r.liquidacion.fechaLiquidacion);
    } else {
      liqDate = getRouteBaseDate(r) || now;
    }

    let liqHour = 17;
    let liqMin = 0;
    if (r.liquidacion.horaLiquidacion && r.liquidacion.horaLiquidacion.includes(':')) {
      const [lh, lm] = r.liquidacion.horaLiquidacion.split(':');
      liqHour = parseInt(lh, 10) || 17;
      liqMin = parseInt(lm, 10) || 0;
    }

    if (liqDate && !isNaN(liqDate.getTime())) {
      const liqDateTime = new Date(
        liqDate.getFullYear(),
        liqDate.getMonth(),
        liqDate.getDate(),
        liqHour,
        liqMin,
        0
      );
      elapsedMs = Math.max(0, liqDateTime.getTime() - plannedDateTime.getTime());
    } else {
      elapsedMs = Math.max(0, now.getTime() - plannedDateTime.getTime());
    }
  } else {
    // Rutas activas, en tránsito o a piso: tiempo transcurrido desde la fecha/hora planificada hasta el momento actual
    elapsedMs = Math.max(0, now.getTime() - plannedDateTime.getTime());
  }

  const totalHorasDesdePlan = Math.floor(elapsedMs / (1000 * 60 * 60));
  const days = Math.floor(totalHorasDesdePlan / 24);
  const remainingHours = totalHorasDesdePlan % 24;

  let horasTexto = `${totalHorasDesdePlan}h`;
  if (days > 0) {
    horasTexto = `${totalHorasDesdePlan}h (${days}d ${remainingHours}h)`;
  } else if (totalHorasDesdePlan === 0) {
    horasTexto = '< 1h';
  }

  // 4. INDICADOR: ¿ATRASADO O EN TIEMPO?
  // Criterios de atraso:
  // - Proviene de días anteriores o supera las 24 horas transcurridas
  // - Está a piso o no despachada cuando ya han transcurrido más de 3 horas desde el horario planificado
  // - En tránsito con más de 10 horas sin concluir liquidación
  let estaAtrasado = false;
  let indicadorDetalle = 'En horario normal';

  if (isRezagada || totalHorasDesdePlan >= 24) {
    estaAtrasado = true;
    indicadorDetalle = `Rezagada (${horasTexto} acumuladas)`;
  } else if (isFloor) {
    estaAtrasado = true;
    indicadorDetalle = 'En resguardo / Bodega';
  } else if (!isDespachada && totalHorasDesdePlan >= 3) {
    estaAtrasado = true;
    indicadorDetalle = `Sin salir (+${totalHorasDesdePlan}h de atraso)`;
  } else if (isDespachada && totalHorasDesdePlan >= 10 && !isLiquidada) {
    estaAtrasado = true;
    indicadorDetalle = `En ruta demorada (+${totalHorasDesdePlan}h)`;
  } else {
    estaAtrasado = false;
    indicadorDetalle = isDespachada ? 'Despacho puntual' : 'En programación';
  }

  // 5. CAJAS FÍSICAS
  const cajasFisicasPlan = Number(r.cajasFisicas || r.cajasOriginales || 0);
  const cajasFisicasEntregadas = Number(r.liquidacion?.cajasEntregadas ?? (isLiquidada ? cajasFisicasPlan : 0));
  const cajasFisicasDevueltas = Number(r.liquidacion?.cajasDevueltas || 0);

  const totalLiquidadoCajas = cajasFisicasEntregadas + cajasFisicasDevueltas;
  const efectividadEntregaPorc =
    totalLiquidadoCajas > 0
      ? Number(((cajasFisicasEntregadas / totalLiquidadoCajas) * 100).toFixed(1))
      : 100.0;

  // 6. PARADAS
  const paradasPlan = Number(r.paradas || r.paradasOriginales || 0);
  const guiasExitosas = Number(r.liquidacion?.guiasExitosas ?? (isLiquidada ? paradasPlan : 0));
  const guiasRechazadas = Number(r.liquidacion?.guiasRechazadas || 0);

  return {
    id: String(r.id),
    route: r,
    agencia: r.agencia || 'Mercado Abierto',
    segmento: r.segmento || '-',
    fechaPlanificadaStr,
    fechaPlanificadaDate: baseDate,
    fechaDespachadaStr,
    fechaDespachadaDate,
    isDespachada,
    despachoLabel,
    totalHorasDesdePlan,
    horasTexto,
    estaAtrasado,
    indicadorLabel: estaAtrasado ? 'Atrasado' : 'En tiempo',
    indicadorDetalle,
    cajasFisicasPlan,
    cajasFisicasEntregadas,
    cajasFisicasDevueltas,
    efectividadEntregaPorc,
    paradasPlan,
    guiasExitosas,
    guiasRechazadas,
    isLiquidada,
    isFloor,
    isRecarga,
    isRezagadaAnterior: isRezagada,
    estado: r.estado,
    horaSalida: r.asignacion?.horaSalida,
    horaLiquidacion: r.fechaLiquidacion || r.liquidacion?.fechaLiquidacion,
    motivoPiso: r.motivoPiso,
  };
}

export const DailySummaryModal: React.FC<DailySummaryModalProps> = ({
  isOpen,
  onClose,
  routes,
  allLiquidatedRoutes,
  staff,
  trucks,
  selectedAgency,
  agencies,
  fechaHoy,
  initialMode = 'inicio',
  onOpenClosingActa,
}) => {
  const [mode, setMode] = useState<DailySummaryMode>(initialMode);
  const [inicioFilter, setInicioFilter] = useState<InicioFilter>('todas');
  const [finFilter, setFinFilter] = useState<FinFilter>('todas');
  const [filterAgency, setFilterAgency] = useState<string>(selectedAgency || 'TODAS');
  const [searchTerm, setSearchTerm] = useState('');
  const [downloadFeedback, setDownloadFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode || 'inicio');
      setFilterAgency(selectedAgency || 'TODAS');
    }
  }, [isOpen, initialMode, selectedAgency]);

  // Consolidar todas las rutas de la jornada (activas y liquidadas)
  const allCurrentRoutes = useMemo(() => {
    const map = new Map<string, Route>();
    routes.forEach((r) => map.set(String(r.id), r));
    allLiquidatedRoutes.forEach((r) => {
      if (!map.has(String(r.id))) {
        map.set(String(r.id), r);
      }
    });
    return Array.from(map.values());
  }, [routes, allLiquidatedRoutes]);

  // Generar métricas estandarizadas para cada ruta
  const allRouteMetrics = useMemo(() => {
    return allCurrentRoutes.map((r) => buildRouteSummaryMetric(r, fechaHoy));
  }, [allCurrentRoutes, fechaHoy]);

  // Filtrado general por Agencia y Búsqueda
  const filteredMetrics = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return allRouteMetrics.filter((m) => {
      if (filterAgency !== 'TODAS' && m.agencia !== filterAgency) {
        return false;
      }
      if (!q) return true;
      return (
        m.id.toLowerCase().includes(q) ||
        m.agencia.toLowerCase().includes(q) ||
        m.segmento.toLowerCase().includes(q) ||
        m.fechaPlanificadaStr.toLowerCase().includes(q) ||
        m.fechaDespachadaStr.toLowerCase().includes(q) ||
        (m.motivoPiso && m.motivoPiso.toLowerCase().includes(q))
      );
    });
  }, [allRouteMetrics, filterAgency, searchTerm]);

  // ==========================================
  // VISTA 1: 🌅 INICIO DE DÍA (LO PLANIFICADO ANTES DE LIQUIDAR)
  // ==========================================
  // En Inicio de Día se muestra toda la planificación inicial del día (rutas programadas, a piso, recargas, rezagadas)
  const inicioFilteredList = useMemo(() => {
    switch (inicioFilter) {
      case 'pendientes':
        return filteredMetrics.filter((m) => !m.isFloor && m.estado === 'Pendiente');
      case 'transito':
        return filteredMetrics.filter((m) => !m.isFloor && m.estado === 'En Tránsito');
      case 'en_tiempo':
        return filteredMetrics.filter((m) => !m.estaAtrasado);
      case 'atrasadas':
        return filteredMetrics.filter((m) => m.estaAtrasado);
      case 'piso':
        return filteredMetrics.filter((m) => m.isFloor);
      case 'recargas':
        return filteredMetrics.filter((m) => m.isRecarga);
      case 'todas':
      default:
        return filteredMetrics;
    }
  }, [filteredMetrics, inicioFilter]);

  // KPIs Inicio de Día
  const inicioTotalRutas = filteredMetrics.length;
  const inicioPendientesCount = filteredMetrics.filter((m) => !m.isFloor && m.estado === 'Pendiente').length;
  const inicioTransitoCount = filteredMetrics.filter((m) => !m.isFloor && m.estado === 'En Tránsito').length;
  const inicioEnTiempoCount = filteredMetrics.filter((m) => !m.estaAtrasado).length;
  const inicioAtrasadasCount = filteredMetrics.filter((m) => m.estaAtrasado).length;
  const inicioTotalCajasPlan = filteredMetrics.reduce((acc, m) => acc + m.cajasFisicasPlan, 0);
  const inicioTotalParadasPlan = filteredMetrics.reduce((acc, m) => acc + m.paradasPlan, 0);
  const inicioPisoCount = filteredMetrics.filter((m) => m.isFloor).length;
  const inicioRecargasCount = filteredMetrics.filter((m) => m.isRecarga).length;
  const inicioMaxHorasAtraso = useMemo(() => {
    const atrasadas = filteredMetrics.filter((m) => m.estaAtrasado);
    if (atrasadas.length === 0) return 0;
    return Math.max(...atrasadas.map((m) => m.totalHorasDesdePlan));
  }, [filteredMetrics]);

  // ==========================================
  // VISTA 2: 🌙 FIN DE DÍA (CÓMO SE TERMINÓ DE EJECUTAR LO PLANIFICADO)
  // ==========================================
  // En Fin de Día se contrasta cómo concluyeron las rutas planificadas
  const finFilteredList = useMemo(() => {
    switch (finFilter) {
      case 'liquidadas':
        return filteredMetrics.filter((m) => m.isLiquidada);
      case 'en_tiempo':
        return filteredMetrics.filter((m) => !m.estaAtrasado);
      case 'atrasadas':
        return filteredMetrics.filter((m) => m.estaAtrasado);
      case 'pendientes':
        return filteredMetrics.filter((m) => !m.isLiquidada && !m.isFloor);
      case 'piso':
        return filteredMetrics.filter((m) => m.isFloor);
      case 'todas':
      default:
        return filteredMetrics;
    }
  }, [filteredMetrics, finFilter]);

  // KPIs Fin de Día
  const finTotalPlanificadas = filteredMetrics.length;
  const finLiquidadasCount = filteredMetrics.filter((m) => m.isLiquidada).length;
  const finCumplimientoPorc =
    finTotalPlanificadas > 0
      ? ((finLiquidadasCount / finTotalPlanificadas) * 100).toFixed(1)
      : '0.0';

  const finTotalCajasPlan = filteredMetrics.reduce((acc, m) => acc + m.cajasFisicasPlan, 0);
  const finTotalCajasEntregadas = filteredMetrics.reduce(
    (acc, m) => acc + (m.isLiquidada ? m.cajasFisicasEntregadas : 0),
    0
  );
  const finTotalCajasDevueltas = filteredMetrics.reduce(
    (acc, m) => acc + (m.isLiquidada ? m.cajasFisicasDevueltas : 0),
    0
  );

  const finTotalCajasLiquidadas = finTotalCajasEntregadas + finTotalCajasDevueltas;
  const finEfectividadEntregaPorc =
    finTotalCajasLiquidadas > 0
      ? ((finTotalCajasEntregadas / finTotalCajasLiquidadas) * 100).toFixed(1)
      : '100.0';

  const finTotalParadasRealizadas = filteredMetrics.reduce(
    (acc, m) => acc + (m.isLiquidada ? m.guiasExitosas : 0),
    0
  );
  const finEnTiempoCount = filteredMetrics.filter((m) => !m.estaAtrasado).length;
  const finAtrasadasCount = filteredMetrics.filter((m) => m.estaAtrasado).length;
  const finPisoCount = filteredMetrics.filter((m) => m.isFloor && !m.isLiquidada).length;

  // ==============================================================
  // TABLA RESUMEN DE TOTALES: EN TRÁNSITO, EN PISO, 24H, 72H, > 72H
  // (Cálculo consolidado para Inicio de Día y actualizado en Fin de Día)
  // ==============================================================
  const summaryTotals = useMemo(() => {
    // 1. Total Rutas en Tránsito (efectivamente despachadas a reparto hacia clientes)
    const enTransito = filteredMetrics.filter((m) => !m.isFloor && m.estado === 'En Tránsito');
    const enTransitoLiquidadas = enTransito.filter((m) => m.isLiquidada);
    const enTransitoPendientes = enTransito.filter((m) => !m.isLiquidada);

    // 2. Total Rutas Pendientes de Salida (programadas por asignar / despachar a clientes)
    const pendientes = filteredMetrics.filter(
      (m) => !m.isFloor && (m.estado === 'Pendiente' || (m.estado !== 'En Tránsito' && !m.isLiquidada))
    );
    const pendientesLiquidadas = pendientes.filter((m) => m.isLiquidada);
    const pendientesPendientes = pendientes.filter((m) => !m.isLiquidada);

    // Total Rutas Planificadas a Reparto (la suma de en tránsito + pendientes: todas las que van hacia clientes)
    const planReparto = filteredMetrics.filter((m) => !m.isFloor);

    // 3. Total Rutas en Piso (retenidas en bodega)
    const enPiso = filteredMetrics.filter((m) => m.isFloor);
    const enPisoQuedan = enPiso.filter((m) => !m.isLiquidada);
    const enPisoLiquidadas = enPiso.filter((m) => m.isLiquidada);

    // 4. Rutas de 24 Horas (tiempo transcurrido de 24h a 48h)
    const rutas24h = filteredMetrics.filter((m) => m.totalHorasDesdePlan >= 24 && m.totalHorasDesdePlan < 48);
    const rutas24hLiquidadas = rutas24h.filter((m) => m.isLiquidada);
    const rutas24hPendientes = rutas24h.filter((m) => !m.isLiquidada);

    // 5. Rutas de 72 Horas (tiempo transcurrido de 48h a 72h)
    const rutas72h = filteredMetrics.filter((m) => m.totalHorasDesdePlan >= 48 && m.totalHorasDesdePlan <= 72);
    const rutas72hLiquidadas = rutas72h.filter((m) => m.isLiquidada);
    const rutas72hPendientes = rutas72h.filter((m) => !m.isLiquidada);

    // 6. Rutas Mayores a 72 Horas (tiempo transcurrido mayor a 72h)
    const rutasMayor72h = filteredMetrics.filter((m) => m.totalHorasDesdePlan > 72);
    const rutasMayor72hLiquidadas = rutasMayor72h.filter((m) => m.isLiquidada);
    const rutasMayor72hPendientes = rutasMayor72h.filter((m) => !m.isLiquidada);

    const totalRutasPlan = filteredMetrics.length;
    const totalCajasPlan = filteredMetrics.reduce((acc, m) => acc + m.cajasFisicasPlan, 0);
    const totalParadasPlan = filteredMetrics.reduce((acc, m) => acc + m.paradasPlan, 0);
    const totalCajasEntregadas = filteredMetrics.reduce((acc, m) => acc + (m.isLiquidada ? m.cajasFisicasEntregadas : 0), 0);
    const totalCajasDevueltas = filteredMetrics.reduce((acc, m) => acc + (m.isLiquidada ? m.cajasFisicasDevueltas : 0), 0);
    const totalParadasRealizadas = filteredMetrics.reduce((acc, m) => acc + (m.isLiquidada ? m.guiasExitosas : 0), 0);
    const totalFinLiquidadas = filteredMetrics.filter((m) => m.isLiquidada).length;
    const totalFinPendientes = totalRutasPlan - totalFinLiquidadas;

    return {
      totalRutasPlan,
      totalCajasPlan,
      totalParadasPlan,
      totalCajasEntregadas,
      totalCajasDevueltas,
      totalParadasRealizadas,
      total: {
        finLiquidadasCount: totalFinLiquidadas,
        finPendientesCount: totalFinPendientes,
      },
      planReparto: {
        totalPlan: planReparto.length,
        cajasPlan: planReparto.reduce((acc, m) => acc + m.cajasFisicasPlan, 0),
        paradasPlan: planReparto.reduce((acc, m) => acc + m.paradasPlan, 0),
      },
      enTransito: {
        totalPlan: enTransito.length,
        cajasPlan: enTransito.reduce((acc, m) => acc + m.cajasFisicasPlan, 0),
        paradasPlan: enTransito.reduce((acc, m) => acc + m.paradasPlan, 0),
        finLiquidadas: enTransitoLiquidadas.length,
        finPendientes: enTransitoPendientes.length,
        finCajasEntregadas: enTransitoLiquidadas.reduce((acc, m) => acc + m.cajasFisicasEntregadas, 0),
        finCajasDevueltas: enTransitoLiquidadas.reduce((acc, m) => acc + m.cajasFisicasDevueltas, 0),
        finParadasRealizadas: enTransitoLiquidadas.reduce((acc, m) => acc + m.guiasExitosas, 0),
      },
      pendientes: {
        totalPlan: pendientes.length,
        cajasPlan: pendientes.reduce((acc, m) => acc + m.cajasFisicasPlan, 0),
        paradasPlan: pendientes.reduce((acc, m) => acc + m.paradasPlan, 0),
        finLiquidadas: pendientesLiquidadas.length,
        finPendientes: pendientesPendientes.length,
        finCajasEntregadas: pendientesLiquidadas.reduce((acc, m) => acc + m.cajasFisicasEntregadas, 0),
        finCajasDevueltas: pendientesLiquidadas.reduce((acc, m) => acc + m.cajasFisicasDevueltas, 0),
        finParadasRealizadas: pendientesLiquidadas.reduce((acc, m) => acc + m.guiasExitosas, 0),
      },
      enPiso: {
        totalPlan: enPiso.length,
        cajasPlan: enPiso.reduce((acc, m) => acc + m.cajasFisicasPlan, 0),
        paradasPlan: enPiso.reduce((acc, m) => acc + m.paradasPlan, 0),
        finQuedan: enPisoQuedan.length,
        finLiquidadas: enPisoLiquidadas.length,
        finCajasQuedan: enPisoQuedan.reduce((acc, m) => acc + m.cajasFisicasPlan, 0),
        finParadasQuedan: enPisoQuedan.reduce((acc, m) => acc + m.paradasPlan, 0),
      },
      rutas24h: {
        totalPlan: rutas24h.length,
        cajasPlan: rutas24h.reduce((acc, m) => acc + m.cajasFisicasPlan, 0),
        paradasPlan: rutas24h.reduce((acc, m) => acc + m.paradasPlan, 0),
        finLiquidadas: rutas24hLiquidadas.length,
        finPendientes: rutas24hPendientes.length,
        finCajasEntregadas: rutas24hLiquidadas.reduce((acc, m) => acc + m.cajasFisicasEntregadas, 0),
        finCajasDevueltas: rutas24hLiquidadas.reduce((acc, m) => acc + m.cajasFisicasDevueltas, 0),
        finParadasRealizadas: rutas24hLiquidadas.reduce((acc, m) => acc + m.guiasExitosas, 0),
      },
      rutas72h: {
        totalPlan: rutas72h.length,
        cajasPlan: rutas72h.reduce((acc, m) => acc + m.cajasFisicasPlan, 0),
        paradasPlan: rutas72h.reduce((acc, m) => acc + m.paradasPlan, 0),
        finLiquidadas: rutas72hLiquidadas.length,
        finPendientes: rutas72hPendientes.length,
        finCajasEntregadas: rutas72hLiquidadas.reduce((acc, m) => acc + m.cajasFisicasEntregadas, 0),
        finCajasDevueltas: rutas72hLiquidadas.reduce((acc, m) => acc + m.cajasFisicasDevueltas, 0),
        finParadasRealizadas: rutas72hLiquidadas.reduce((acc, m) => acc + m.guiasExitosas, 0),
      },
      rutasMayor72h: {
        totalPlan: rutasMayor72h.length,
        cajasPlan: rutasMayor72h.reduce((acc, m) => acc + m.cajasFisicasPlan, 0),
        paradasPlan: rutasMayor72h.reduce((acc, m) => acc + m.paradasPlan, 0),
        finLiquidadas: rutasMayor72hLiquidadas.length,
        finPendientes: rutasMayor72hPendientes.length,
        finCajasEntregadas: rutasMayor72hLiquidadas.reduce((acc, m) => acc + m.cajasFisicasEntregadas, 0),
        finCajasDevueltas: rutasMayor72hLiquidadas.reduce((acc, m) => acc + m.cajasFisicasDevueltas, 0),
        finParadasRealizadas: rutasMayor72hLiquidadas.reduce((acc, m) => acc + m.guiasExitosas, 0),
      },
    };
  }, [filteredMetrics]);

  // Camiones y personal disponibles que NO salieron a ruta hoy, con su motivo (Fin de Asignación)
  const unassignedTrucks = useMemo(
    () => (trucks || []).filter((t) => Boolean(t.motivoNoAsignado)),
    [trucks]
  );
  const unassignedStaff = useMemo(
    () => (staff || []).filter((s) => Boolean(s.motivoNoAsignado)),
    [staff]
  );
  const unassignedTrucksByReason = useMemo(() => {
    const map = new Map<string, number>();
    unassignedTrucks.forEach((t) => {
      const reason = t.motivoNoAsignado as string;
      map.set(reason, (map.get(reason) || 0) + 1);
    });
    return Array.from(map.entries()).map(([reason, count]) => ({ reason, count }));
  }, [unassignedTrucks]);
  const unassignedStaffByReason = useMemo(() => {
    const map = new Map<string, number>();
    unassignedStaff.forEach((s) => {
      const reason = s.motivoNoAsignado as string;
      map.set(reason, (map.get(reason) || 0) + 1);
    });
    return Array.from(map.entries()).map(([reason, count]) => ({ reason, count }));
  }, [unassignedStaff]);

  if (!isOpen) return null;

  const getPdfPayload = () => ({
    mode,
    fechaHoy: fechaHoy || formatDateToGuatemala(new Date()),
    filterAgency,
    stats: {
      totalRutas: mode === 'inicio' ? inicioTotalRutas : finTotalPlanificadas,
      enTiempo: mode === 'inicio' ? inicioEnTiempoCount : finEnTiempoCount,
      atrasadas: mode === 'inicio' ? inicioAtrasadasCount : finAtrasadasCount,
      piso: mode === 'inicio' ? inicioPisoCount : finPisoCount,
      recargas: inicioRecargasCount,
      cajasPlan: mode === 'inicio' ? inicioTotalCajasPlan : finTotalCajasPlan,
      paradasPlan: inicioTotalParadasPlan,
      maxHorasAtraso: inicioMaxHorasAtraso,
      cumplimientoPorc: finCumplimientoPorc,
      cajasEntregadas: finTotalCajasEntregadas,
      cajasDevueltas: finTotalCajasDevueltas,
      efectividadEntregaPorc: finEfectividadEntregaPorc,
      liquidadasCount: finLiquidadasCount,
      pendientesCount: finTotalPlanificadas - finLiquidadasCount,
    },
    summaryTotals,
    routesList: mode === 'inicio' ? inicioFilteredList : finFilteredList,
    unassignedTrucks,
    unassignedStaff,
    unassignedTrucksByReason,
    unassignedStaffByReason,
    // Corrección: se agrega al payload del PDF para que Inicio/Fin de Día reflejen
    // los mismos camiones/personal no asignados que ya se muestran en el modal.
    unassignedResources: {
      trucks: unassignedTrucks.map((t) => ({
        id: t.idCamion || t.id,
        placa: t.placa,
        motivo: t.motivoNoAsignado || '-',
      })),
      staff: unassignedStaff.map((s) => ({
        id: s.codigoCorto || s.codigo || s.id,
        nombre: s.nombre,
        puesto: s.puesto,
        motivo: s.motivoNoAsignado || '-',
      })),
      trucksByReason: unassignedTrucksByReason,
      staffByReason: unassignedStaffByReason,
    },
  });

  const handleSavePdf = () => {
    try {
      setDownloadFeedback('Generando PDF...');
      generateDailySummaryPdf(getPdfPayload(), 'save');
      setDownloadFeedback('✓ PDF guardado');
      setTimeout(() => setDownloadFeedback(null), 3000);
    } catch (err) {
      console.error('Error al generar PDF:', err);
      setDownloadFeedback('Error al exportar PDF');
      setTimeout(() => setDownloadFeedback(null), 3000);
    }
  };

  const handlePrint = () => {
    const originalTitle = document.title;
    const cleanFecha = (fechaHoy || formatDateToGuatemala(new Date())).replace(/\//g, '-');
    const agencyLabel = filterAgency === 'TODAS' ? 'Todas_Agencias' : filterAgency.replace(/\s+/g, '_');
    const titlePrefix = mode === 'inicio' ? 'Reporte_Inicio_de_Dia_DISCARGA' : 'Reporte_Fin_de_Dia_DISCARGA';

    document.title = `${titlePrefix}_${agencyLabel}_${cleanFecha}`;
    document.body.classList.add('printing-daily-summary');

    let printSucceeded = false;
    try {
      window.print();
      printSucceeded = true;
    } catch (err) {
      console.warn('window.print() interceptado en iframe o bloqueado:', err);
    }

    // Si el entorno iframe de vista previa bloquea el modal de window.print(),
    // o para garantizar siempre la entrega del documento en PDF al usuario:
    const isInIframe = window.self !== window.top;
    if (isInIframe || !printSucceeded) {
      setDownloadFeedback('Abriendo reporte / Descargando PDF...');
      try {
        generateDailySummaryPdf(getPdfPayload(), 'print');
        setDownloadFeedback('✓ PDF generado');
        setTimeout(() => setDownloadFeedback(null), 3000);
      } catch (err) {
        console.error('Error en impresión PDF:', err);
      }
    }

    setTimeout(() => {
      document.title = originalTitle;
      document.body.classList.remove('printing-daily-summary');
    }, 1200);
  };

  return (
    <div
      id="dailySummaryModal"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 print:p-0 print:static print:bg-white print:overflow-visible print:block print:w-full"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200 print:max-h-none print:h-auto print:shadow-none print:border-0 print:rounded-none print:overflow-visible print:block print:w-full">
        
        {/* ============================================================== */}
        {/* HEADER DEL MODAL CON SELECTOR DE INICIO vs FIN DE DÍA         */}
        {/* ============================================================== */}
        <div className="px-6 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 print:bg-white print:text-slate-900 print:border-b-2 print:border-slate-900 print:px-2 print:py-3">
          <div className="flex items-center space-x-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md transition-colors print:hidden ${
                mode === 'inicio'
                  ? 'bg-gradient-to-tr from-amber-500 to-orange-500'
                  : 'bg-gradient-to-tr from-indigo-600 to-blue-600'
              }`}
            >
              {mode === 'inicio' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <h2 className="text-lg font-bold tracking-tight text-white print:text-slate-900 print:text-xl">
                  {mode === 'inicio' ? 'Reporte Resumen Inicio de Día' : 'Reporte Resumen Fin de Día'}
                </h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                    mode === 'inicio'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-400/40 print:text-amber-900 print:bg-amber-100 print:border-amber-300'
                      : 'bg-indigo-500/25 text-indigo-200 border-indigo-400/40 print:text-indigo-900 print:bg-indigo-100 print:border-indigo-300'
                  }`}
                >
                  {mode === 'inicio' ? '🌅 Lo Planificado (Antes de Liquidar)' : '🌙 Ejecución Real de lo Planificado'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700 print:bg-slate-100 print:text-slate-800 print:border-slate-300">
                  {fechaHoy || formatDateToGuatemala(new Date())}
                </span>
                <span className="hidden print:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-300">
                  Agencia: {filterAgency}
                </span>
              </div>
              <p className="text-xs text-slate-400 print:text-slate-600 print:text-[11px] mt-0.5">
                {mode === 'inicio'
                  ? 'DISCARGA CONTROLER • Control de salida: No. Ruta, Fecha planificada, Fecha despachada, Horas transcurridas, Indicador de retraso, Cajas físicas, Paradas, Agencia y Segmento'
                  : 'DISCARGA CONTROLER • Cierre operativo: Comparativo de lo planificado vs ejecución real, efectividad de cajas entregadas, devoluciones y horas transcurridas'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 print:hidden">
            {/* BOTÓN SELECTOR DE MODO: INICIO DE DÍA vs FIN DE DÍA */}
            <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 shadow-inner">
              <button
                id="btnSummaryInicioDeDia"
                onClick={() => setMode('inicio')}
                title="Ver lo planificado antes de liquidar"
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center transition cursor-pointer ${
                  mode === 'inicio'
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Sun className="w-3.5 h-3.5 mr-1.5 text-amber-200" />
                Inicio de Día
              </button>
              <button
                id="btnSummaryFinDeDia"
                onClick={() => setMode('fin')}
                title="Ver cómo se terminó de ejecutar lo planificado"
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center transition cursor-pointer ${
                  mode === 'fin'
                    ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Moon className="w-3.5 h-3.5 mr-1.5 text-indigo-200" />
                Fin de Día (Real)
              </button>
            </div>

            {downloadFeedback && (
              <span className="text-[11px] font-bold text-emerald-300 bg-emerald-950/80 border border-emerald-700/60 px-2.5 py-1 rounded-lg animate-in fade-in">
                {downloadFeedback}
              </span>
            )}

            {mode === 'fin' && onOpenClosingActa && (
              <button
                id="btnOpenClosingActa"
                onClick={onOpenClosingActa}
                title="Generar Acta de Cierre y Liquidación Total del Día, con espacio de firma para el cliente"
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-lg text-xs font-bold flex items-center transition border border-emerald-500 cursor-pointer shadow-xs"
              >
                <ClipboardCheck className="w-3.5 h-3.5 mr-1.5 text-white" />
                Acta de Cierre para Firma
              </button>
            )}

            <button
              id="btnDailySummaryPrint"
              onClick={handlePrint}
              title="Imprimir resumen oficial (o generar copia impresa)"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white rounded-lg text-xs font-semibold flex items-center transition border border-slate-700 cursor-pointer shadow-xs"
            >
              <Printer className="w-3.5 h-3.5 mr-1.5 text-slate-300" />
              Imprimir
            </button>

            <button
              id="btnDailySummaryPdf"
              onClick={handleSavePdf}
              title="Descargar y guardar reporte como archivo PDF oficial"
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-lg text-xs font-bold flex items-center transition border border-indigo-500 cursor-pointer shadow-xs"
            >
              <FileDown className="w-3.5 h-3.5 mr-1.5 text-white" />
              Guardar en PDF
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ============================================================== */}
        {/* SECCIÓN DE KPIS SUPERIORES SEGÚN MODO                          */}
        {/* ============================================================== */}
        <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 space-y-4 print:bg-white print:p-2">
          {mode === 'inicio' ? (
            /* KPIs: INICIO DE DÍA (LO PLANIFICADO) */
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* KPI 1: Rutas Planificadas */}
              <div
                onClick={() => setInicioFilter('todas')}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  inicioFilter === 'todas'
                    ? 'bg-blue-50/90 border-blue-400 ring-2 ring-blue-300/50 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-2xs'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider flex items-center">
                    <TruckIcon className="w-3.5 h-3.5 mr-1 text-blue-600" />
                    Rutas Planificadas
                  </span>
                  <span className="w-6 h-6 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                    {inicioTotalRutas}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline space-x-1.5">
                  <span className="text-2xl font-black text-slate-900">{inicioTotalRutas}</span>
                  <span className="text-xs font-semibold text-slate-500">rutas programadas</span>
                </div>
                <p className="text-[11px] text-blue-700 font-medium mt-0.5">
                  {inicioTotalCajasPlan.toFixed(1)} cajas • {inicioTotalParadasPlan} paradas
                </p>
                <div className="mt-1.5 pt-1 border-t border-blue-100 flex items-center justify-between text-[10px] font-bold">
                  <span className="text-amber-800">{inicioPendientesCount} pendientes</span>
                  <span className="text-slate-300">•</span>
                  <span className="text-blue-800">{inicioTransitoCount} en tránsito</span>
                  <span className="text-slate-300">•</span>
                  <span className="text-amber-700">{inicioPisoCount} en piso</span>
                </div>
              </div>

              {/* KPI 2: Total Cajas Físicas del Día */}
              <div
                onClick={() => setInicioFilter('todas')}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  inicioFilter === 'todas'
                    ? 'bg-indigo-50/90 border-indigo-400 ring-2 ring-indigo-300/50 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-2xs'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider flex items-center">
                    <Package className="w-3.5 h-3.5 mr-1 text-indigo-600" />
                    Cajas Físicas del Día
                  </span>
                  <span className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                    <Package className="w-3.5 h-3.5" />
                  </span>
                </div>
                <div className="mt-1 flex items-baseline space-x-1.5">
                  <span className="text-2xl font-black text-indigo-900">
                    {inicioTotalCajasPlan.toLocaleString('es-GT', { maximumFractionDigits: 1 })}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">cajas programadas</span>
                </div>
                <p className="text-[11px] text-indigo-700 font-medium mt-0.5">
                  {inicioTotalParadasPlan} paradas • {inicioTotalRutas} rutas en total
                </p>
                <div className="mt-1.5 pt-1 border-t border-indigo-100 flex items-center justify-between text-[10px] font-bold">
                  <span className="text-indigo-800">100% volumen planificado</span>
                </div>
              </div>

              {/* KPI 3: Rutas En Tiempo */}
              <div
                onClick={() => setInicioFilter('en_tiempo')}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  inicioFilter === 'en_tiempo'
                    ? 'bg-emerald-50/90 border-emerald-400 ring-2 ring-emerald-300/50 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-emerald-300 hover:shadow-2xs'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                    En Tiempo
                  </span>
                  <span className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                    {inicioEnTiempoCount}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline space-x-1.5">
                  <span className="text-2xl font-black text-emerald-800">{inicioEnTiempoCount}</span>
                  <span className="text-xs font-semibold text-slate-500">en programación normal</span>
                </div>
                <p className="text-[11px] text-emerald-700 font-medium mt-0.5">
                  {inicioTotalRutas > 0 ? ((inicioEnTiempoCount / inicioTotalRutas) * 100).toFixed(1) : 0}% en horario puntual
                </p>
              </div>

              {/* KPI 4: Rutas Atrasadas */}
              <div
                onClick={() => setInicioFilter('atrasadas')}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  inicioFilter === 'atrasadas'
                    ? 'bg-rose-50/90 border-rose-400 ring-2 ring-rose-300/50 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-rose-300 hover:shadow-2xs'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider flex items-center">
                    <AlertCircle className="w-3.5 h-3.5 mr-1 text-rose-600" />
                    Rutas Atrasadas
                  </span>
                  <span
                    className={`w-6 h-6 rounded-md flex items-center justify-center font-bold text-xs ${
                      inicioAtrasadasCount > 0 ? 'bg-rose-100 text-rose-800 animate-pulse' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {inicioAtrasadasCount}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline space-x-1.5">
                  <span className="text-2xl font-black text-rose-700">{inicioAtrasadasCount}</span>
                  <span className="text-xs font-semibold text-slate-500">con retraso</span>
                </div>
                <p className="text-[11px] text-rose-600 font-bold mt-0.5">
                  {inicioAtrasadasCount > 0 ? `Hasta ${inicioMaxHorasAtraso}h transcurridas` : '0 atrasos registrados'}
                </p>
              </div>

              {/* KPI 5: A Piso / Resguardo */}
              <div
                onClick={() => setInicioFilter('piso')}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  inicioFilter === 'piso'
                    ? 'bg-amber-50/90 border-amber-400 ring-2 ring-amber-300/50 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-amber-300 hover:shadow-2xs'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center">
                    <Warehouse className="w-3.5 h-3.5 mr-1 text-amber-600" />
                    En Bodega / A Piso
                  </span>
                  <span className="w-6 h-6 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs">
                    {inicioPisoCount}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline space-x-1.5">
                  <span className="text-2xl font-black text-amber-800">{inicioPisoCount}</span>
                  <span className="text-xs font-semibold text-slate-500">rutas retenidas</span>
                </div>
                <p className="text-[11px] text-amber-700 font-medium mt-0.5">
                  {inicioRecargasCount} recargas programadas
                </p>
              </div>
            </div>
          ) : (
            /* KPIs: FIN DE DÍA (CÓMO SE TERMINÓ DE EJECUTAR) */
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* KPI 1: Rutas Liquidadas vs Planificadas */}
              <div
                onClick={() => setFinFilter('liquidadas')}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  finFilter === 'liquidadas'
                    ? 'bg-emerald-50/90 border-emerald-400 ring-2 ring-emerald-300/50 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-emerald-300 hover:shadow-2xs'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                    Rutas Liquidadas
                  </span>
                  <span className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                    {finLiquidadasCount}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline space-x-1.5">
                  <span className="text-2xl font-black text-emerald-800">{finLiquidadasCount}</span>
                  <span className="text-xs font-semibold text-slate-500">/ {finTotalPlanificadas} planificadas</span>
                </div>
                <p className="text-[11px] text-emerald-700 font-bold mt-0.5">
                  {finCumplimientoPorc}% cumplimiento de rutas
                </p>
              </div>

              {/* KPI 2: Total Cajas Físicas del Día */}
              <div
                onClick={() => setFinFilter('todas')}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  finFilter === 'todas'
                    ? 'bg-indigo-50/90 border-indigo-400 ring-2 ring-indigo-300/50 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-indigo-300 hover:shadow-2xs'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider flex items-center">
                    <Package className="w-3.5 h-3.5 mr-1 text-indigo-600" />
                    Cajas Físicas del Día
                  </span>
                  <span className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                    <Package className="w-3.5 h-3.5" />
                  </span>
                </div>
                <div className="mt-1 flex items-baseline space-x-1.5">
                  <span className="text-2xl font-black text-indigo-900">
                    {finTotalCajasPlan.toLocaleString('es-GT', { maximumFractionDigits: 1 })}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">cajas del día</span>
                </div>
                <p className="text-[11px] text-indigo-700 font-semibold mt-0.5 flex items-center">
                  <span className="text-emerald-700 font-bold mr-1.5">{finTotalCajasEntregadas.toLocaleString('es-GT', { maximumFractionDigits: 1 })} ent.</span>
                  <span className="text-rose-600">({finTotalCajasDevueltas.toLocaleString('es-GT', { maximumFractionDigits: 1 })} dev.)</span>
                </p>
                <div className="mt-1.5 pt-1 border-t border-indigo-100 flex items-center justify-between text-[10px] font-bold">
                  <span className="text-slate-600">Total planificado de la jornada</span>
                </div>
              </div>

              {/* KPI 3: Cajas Físicas Entregadas vs Devueltas */}
              <div
                onClick={() => setFinFilter('todas')}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  finFilter === 'todas'
                    ? 'bg-blue-50/90 border-blue-400 ring-2 ring-blue-300/50 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-2xs'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider flex items-center">
                    <PackageCheck className="w-3.5 h-3.5 mr-1 text-blue-600" />
                    Cajas Entregadas
                  </span>
                  <span className="w-6 h-6 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                    {finEfectividadEntregaPorc}%
                  </span>
                </div>
                <div className="mt-1 flex items-baseline space-x-1.5">
                  <span className="text-2xl font-black text-slate-900">{finTotalCajasEntregadas.toFixed(1)}</span>
                  <span className="text-xs font-semibold text-slate-500">entregadas</span>
                </div>
                <p className="text-[11px] text-blue-700 font-semibold mt-0.5 flex items-center">
                  <span className="text-emerald-700 font-bold mr-1.5">{finEfectividadEntregaPorc}% efectividad</span>
                  <span className="text-rose-600">({finTotalCajasDevueltas.toFixed(1)} devueltas)</span>
                </p>
              </div>

              {/* KPI 4: Rutas En Tiempo vs Atrasadas al Cierre */}
              <div
                onClick={() => setFinFilter('atrasadas')}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  finFilter === 'atrasadas'
                    ? 'bg-rose-50/90 border-rose-400 ring-2 ring-rose-300/50 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-rose-300 hover:shadow-2xs'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider flex items-center">
                    <Clock className="w-3.5 h-3.5 mr-1 text-rose-600" />
                    Cierre: En Tiempo vs Atraso
                  </span>
                  <span className="w-6 h-6 rounded-md bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-xs">
                    {finAtrasadasCount}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline space-x-1.5">
                  <span className="text-2xl font-black text-emerald-700">{finEnTiempoCount}</span>
                  <span className="text-xs font-bold text-slate-600">a tiempo</span>
                  <span className="text-slate-300">/</span>
                  <span className="text-xl font-black text-rose-600">{finAtrasadasCount}</span>
                  <span className="text-xs font-bold text-rose-600">atrasadas</span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  {finTotalParadasRealizadas} paradas completadas exitosas
                </p>
              </div>

              {/* KPI 5: Quedan en Bodega */}
              <div
                onClick={() => setFinFilter('piso')}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  finFilter === 'piso'
                    ? 'bg-amber-50/90 border-amber-400 ring-2 ring-amber-300/50 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-amber-300 hover:shadow-2xs'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center">
                    <Warehouse className="w-3.5 h-3.5 mr-1 text-amber-600" />
                    Quedan en Bodega
                  </span>
                  <span className="w-6 h-6 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs">
                    {finPisoCount}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline space-x-1.5">
                  <span className="text-2xl font-black text-amber-800">{finPisoCount}</span>
                  <span className="text-xs font-semibold text-slate-500">rutas en piso</span>
                </div>
                <p className="text-[11px] text-amber-700 font-medium mt-0.5">
                  No despachadas, se trasladan para mañana
                </p>
              </div>
            </div>
          )}

          {/* BARRA DE FILTROS RÁPIDOS Y BÚSQUEDA */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1 print:hidden">
            {/* Filtros rápidos según modo */}
            {mode === 'inicio' ? (
              <div className="flex flex-wrap gap-1 bg-slate-200/80 p-1 rounded-xl text-xs font-semibold w-full sm:w-auto">
                <button
                  onClick={() => setInicioFilter('todas')}
                  className={`px-3 py-1 rounded-lg transition flex items-center cursor-pointer ${
                    inicioFilter === 'todas'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 mr-1" />
                  Todas ({filteredMetrics.length})
                </button>
                <button
                  onClick={() => setInicioFilter('pendientes')}
                  className={`px-3 py-1 rounded-lg transition flex items-center cursor-pointer ${
                    inicioFilter === 'pendientes'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-amber-800'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 mr-1" />
                  Pendientes ({inicioPendientesCount})
                </button>
                <button
                  onClick={() => setInicioFilter('transito')}
                  className={`px-3 py-1 rounded-lg transition flex items-center cursor-pointer ${
                    inicioFilter === 'transito'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-blue-800'
                  }`}
                >
                  <Navigation className="w-3.5 h-3.5 mr-1" />
                  En Tránsito ({inicioTransitoCount})
                </button>
                <button
                  onClick={() => setInicioFilter('en_tiempo')}
                  className={`px-3 py-1 rounded-lg transition flex items-center cursor-pointer ${
                    inicioFilter === 'en_tiempo'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-emerald-700'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  En Tiempo ({inicioEnTiempoCount})
                </button>
                <button
                  onClick={() => setInicioFilter('atrasadas')}
                  className={`px-3 py-1 rounded-lg transition flex items-center cursor-pointer ${
                    inicioFilter === 'atrasadas'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-rose-700'
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5 mr-1" />
                  Atrasadas ({inicioAtrasadasCount})
                </button>
                <button
                  onClick={() => setInicioFilter('piso')}
                  className={`px-3 py-1 rounded-lg transition flex items-center cursor-pointer ${
                    inicioFilter === 'piso'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-amber-700'
                  }`}
                >
                  <Warehouse className="w-3.5 h-3.5 mr-1" />
                  En Bodega / Piso ({inicioPisoCount})
                </button>
                <button
                  onClick={() => setInicioFilter('recargas')}
                  className={`px-3 py-1 rounded-lg transition flex items-center cursor-pointer ${
                    inicioFilter === 'recargas'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-purple-700'
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  Recargas ({inicioRecargasCount})
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1 bg-slate-200/80 p-1 rounded-xl text-xs font-semibold w-full sm:w-auto">
                <button
                  onClick={() => setFinFilter('todas')}
                  className={`px-3 py-1 rounded-lg transition flex items-center cursor-pointer ${
                    finFilter === 'todas'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 mr-1" />
                  Todas ({filteredMetrics.length})
                </button>
                <button
                  onClick={() => setFinFilter('liquidadas')}
                  className={`px-3 py-1 rounded-lg transition flex items-center cursor-pointer ${
                    finFilter === 'liquidadas'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-emerald-700'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                  Liquidadas ({finLiquidadasCount})
                </button>
                <button
                  onClick={() => setFinFilter('en_tiempo')}
                  className={`px-3 py-1 rounded-lg transition flex items-center cursor-pointer ${
                    finFilter === 'en_tiempo'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-emerald-700'
                  }`}
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-1" />
                  En Tiempo ({finEnTiempoCount})
                </button>
                <button
                  onClick={() => setFinFilter('atrasadas')}
                  className={`px-3 py-1 rounded-lg transition flex items-center cursor-pointer ${
                    finFilter === 'atrasadas'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-rose-700'
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5 mr-1" />
                  Atrasadas ({finAtrasadasCount})
                </button>
                <button
                  onClick={() => setFinFilter('pendientes')}
                  className={`px-3 py-1 rounded-lg transition flex items-center cursor-pointer ${
                    finFilter === 'pendientes'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-blue-700'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 mr-1" />
                  No Concluidas ({filteredMetrics.filter((m) => !m.isLiquidada && !m.isFloor).length})
                </button>
                <button
                  onClick={() => setFinFilter('piso')}
                  className={`px-3 py-1 rounded-lg transition flex items-center cursor-pointer ${
                    finFilter === 'piso'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-amber-700'
                  }`}
                >
                  <Warehouse className="w-3.5 h-3.5 mr-1" />
                  En Bodega ({finPisoCount})
                </button>
              </div>
            )}

            {/* Selector de Agencia y Barra de búsqueda */}
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <div className="flex items-center bg-white border border-slate-300 rounded-lg px-2 py-1 shadow-2xs">
                <Building2 className="w-3.5 h-3.5 text-slate-400 mr-1" />
                <select
                  value={filterAgency}
                  onChange={(e) => setFilterAgency(e.target.value)}
                  className="text-xs font-semibold text-slate-700 bg-transparent border-0 outline-none cursor-pointer"
                >
                  <option value="TODAS">-- Todas las Agencias --</option>
                  {agencies.map((ag) => (
                    <option key={ag} value={ag}>
                      {ag}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative flex-1 sm:w-56">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar ruta, agencia, segmento..."
                  className="w-full pl-8 pr-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium shadow-2xs"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* TABLA PRINCIPAL DEL RESUMEN DIARIO                            */}
        {/* Columnas requeridas:                                          */}
        {/* 1. No. Ruta                                                   */}
        {/* 2. Fecha planificada                                          */}
        {/* 3. Fecha despachada                                           */}
        {/* 4. Total de horas desde la fecha planificada                  */}
        {/* 5. Indicador (Atrasado o En tiempo)                           */}
        {/* 6. CAJAS FÍSICAS (Planificadas en inicio / Ejecutadas en fin)  */}
        {/* 7. PARADAS (Planificadas en inicio / Ejecutadas en fin)       */}
        {/* 8. Agencia                                                    */}
        {/* 9. Segmento                                                   */}
        {/* ============================================================== */}
        {/* ============================================================== */}
        {/* CONTENEDOR PRINCIPAL: RESUMEN DE TOTALES Y TABLA DETALLADA    */}
        {/* ============================================================== */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 print:p-0 print:overflow-visible print:h-auto print:max-h-none print:block space-y-6 print:space-y-4">

          {/* ============================================================== */}
          {/* TABLA RESUMEN DE TOTALES (SOLO TOTALES, NO A DETALLE)          */}
          {/* Categorías:                                                   */}
          {/* 1. Total de rutas en tránsito                                 */}
          {/* 2. Total de rutas en piso                                     */}
          {/* 3. Rutas de 24 horas                                          */}
          {/* 4. Rutas de 72 horas                                          */}
          {/* 5. Rutas mayores a 72 horas                                   */}
          {/* Disponible tanto al inicio de día como actualizado en fin     */}
          {/* ============================================================== */}
          <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden print:border print:border-slate-400 print:shadow-none print:rounded-lg print:break-inside-avoid">
            {/* Header de la Tabla Resumen de Totales */}
            <div className="px-4 py-3 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 print:bg-slate-100 print:text-slate-900 print:border-b print:border-slate-300">
              <div className="flex items-center space-x-2.5">
                <div className="p-1.5 rounded-lg bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 print:bg-slate-200 print:border-slate-300 print:text-slate-700">
                  <TableProperties className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-100 print:text-slate-900 flex items-center gap-1.5">
                    Tabla Resumen de Totales
                    <span className="text-[11px] font-bold text-indigo-300 print:text-slate-700 normal-case px-2 py-0.5 rounded-md bg-indigo-950/70 print:bg-slate-200 border border-indigo-800/60 print:border-slate-300">
                      {mode === 'inicio' ? '🌅 Inicio de Día (Planificado)' : '🌙 Fin de Día (Ejecutado al Cierre)'}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-300 print:text-slate-600 font-medium">
                    {mode === 'inicio'
                      ? 'Consolidado de rutas planificadas en tránsito, en bodega (piso) y antigüedad por horas de retraso'
                      : 'Balance de cierre: cómo terminaron de ejecutarse las rutas en tránsito, retenidas en bodega y rezagadas'}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 text-xs">
                <span className="px-2.5 py-1 rounded-lg bg-slate-800 print:bg-slate-200 text-indigo-200 print:text-slate-800 border border-slate-700 print:border-slate-300 font-bold">
                  {summaryTotals.totalRutasPlan} rutas analizadas
                </span>
              </div>
            </div>

            {/* Tabla de Solo Totales */}
            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full text-left text-xs text-slate-700 border-collapse print:text-[10px]">
                <thead className="bg-slate-100/95 text-slate-800 font-bold border-b border-slate-300 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 whitespace-nowrap">Categoría / Clasificación</th>
                    <th className="px-3.5 py-3 text-center whitespace-nowrap">
                      {mode === 'inicio' ? 'Total Rutas Plan' : 'Planificado (Inicio)'}
                    </th>
                    <th className="px-3.5 py-3 text-center whitespace-nowrap">
                      {mode === 'inicio' ? '% Distribución' : 'Balance al Cierre (Fin de Día)'}
                    </th>
                    <th className="px-3.5 py-3 text-right whitespace-nowrap font-black">
                      {mode === 'inicio' ? 'Cajas Físicas Plan' : 'Cajas Físicas (Entregadas / Dev)'}
                    </th>
                    <th className="px-3.5 py-3 text-center whitespace-nowrap font-black">
                      {mode === 'inicio' ? 'Paradas Plan' : 'Paradas / Guías'}
                    </th>
                    <th className="px-3.5 py-3 text-center whitespace-nowrap">
                      {mode === 'inicio' ? 'Estatus Operativo' : 'Resultado de Cierre'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-medium">
                  {/* Corrección: las filas de esta tabla combinaban dos clasificaciones que
                      NO son mutuamente excluyentes — Estado de Despacho (En Tránsito /
                      Pendientes / En Piso, que sí suman el total) y Antigüedad desde lo
                      planificado (24h/72h/>72h, calculada sin importar el estado, por lo
                      que una misma ruta puede aparecer en ambos bloques). Antes se
                      numeraban 1-6 en una sola lista con un total general al final, dando
                      a entender que las 6 filas sumaban 100%. Se agregan encabezados de
                      sección para dejar claro que son dos vistas distintas del mismo
                      conjunto de rutas, sin cambiar ningún cálculo. */}
                  <tr className="bg-slate-200/70 print:bg-slate-200">
                    <td colSpan={6} className="px-4 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-600">
                      Por Estado de Despacho <span className="font-normal normal-case text-slate-500">(categorías mutuamente excluyentes — suman el total de rutas)</span>
                    </td>
                  </tr>
                  {/* FILA 1: TOTAL DE RUTAS EN TRÁNSITO */}
                  <tr className="hover:bg-blue-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 border border-blue-200">
                          <Navigation className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-black text-slate-900 text-xs">Total Rutas en Tránsito</p>
                          <p className="text-[11px] text-slate-500 font-normal">
                            Rutas despachadas hacia clientes en ruta activa
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Rutas: Inicio o Plan */}
                    <td className="px-3.5 py-3 text-center">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-black bg-blue-100 text-blue-800 border border-blue-200 shadow-2xs">
                        {summaryTotals.enTransito.totalPlan}
                      </span>
                    </td>

                    {/* % en Inicio / Al Cierre en Fin */}
                    <td className="px-3.5 py-3 text-center">
                      {mode === 'inicio' ? (
                        <span className="text-xs font-bold text-slate-700">
                          {summaryTotals.totalRutasPlan > 0
                            ? ((summaryTotals.enTransito.totalPlan / summaryTotals.totalRutasPlan) * 100).toFixed(1)
                            : '0.0'}%
                        </span>
                      ) : (
                        <div className="inline-flex flex-col items-center">
                          <div className="flex items-center space-x-1.5">
                            <span className="px-2 py-0.5 rounded-md text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                              {summaryTotals.enTransito.finLiquidadas} liquidadas
                            </span>
                            {summaryTotals.enTransito.finPendientes > 0 && (
                              <span className="px-2 py-0.5 rounded-md text-xs font-black bg-blue-100 text-blue-800 border border-blue-300">
                                {summaryTotals.enTransito.finPendientes} en ruta
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Cajas Físicas */}
                    <td className="px-3.5 py-3 text-right">
                      {mode === 'inicio' ? (
                        <div>
                          <span className="text-xs font-black text-slate-900">
                            {summaryTotals.enTransito.cajasPlan.toFixed(1)}
                          </span>
                          <span className="text-[10px] text-slate-500 ml-1">cajas</span>
                        </div>
                      ) : (
                        <div>
                          <div className="text-xs font-black text-emerald-800">
                            {summaryTotals.enTransito.finCajasEntregadas.toFixed(1)} ent.
                          </div>
                          {summaryTotals.enTransito.finCajasDevueltas > 0 && (
                            <div className="text-[10px] font-bold text-rose-600">
                              ({summaryTotals.enTransito.finCajasDevueltas.toFixed(1)} dev.)
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Paradas */}
                    <td className="px-3.5 py-3 text-center">
                      <span className="text-xs font-bold text-slate-800">
                        {mode === 'inicio'
                          ? summaryTotals.enTransito.paradasPlan
                          : summaryTotals.enTransito.finParadasRealizadas}
                      </span>
                    </td>

                    {/* Estatus / Resultado */}
                    <td className="px-3.5 py-3 text-center">
                      {mode === 'inicio' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          En Tránsito (Despachadas)
                        </span>
                      ) : summaryTotals.enTransito.finPendientes === 0 ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          100% Liquidadas
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-100 text-blue-800 border border-blue-300">
                          <Clock className="w-3.5 h-3.5 mr-1" />
                          {summaryTotals.enTransito.finPendientes} En Ruta Sin Liquidar
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* FILA 2: TOTAL DE RUTAS PENDIENTES DE SALIDA */}
                  <tr className="hover:bg-amber-50/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 border border-amber-200">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-black text-slate-900 text-xs">Total Rutas Pendientes de Salida</p>
                          <p className="text-[11px] text-slate-500 font-normal">
                            Rutas programadas pendientes de asignación y despacho a clientes
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Rutas: Inicio o Plan */}
                    <td className="px-3.5 py-3 text-center">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-black bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                        {summaryTotals.pendientes.totalPlan}
                      </span>
                    </td>

                    {/* % en Inicio / Al Cierre en Fin */}
                    <td className="px-3.5 py-3 text-center">
                      {mode === 'inicio' ? (
                        <span className="text-xs font-bold text-slate-700">
                          {summaryTotals.totalRutasPlan > 0
                            ? ((summaryTotals.pendientes.totalPlan / summaryTotals.totalRutasPlan) * 100).toFixed(1)
                            : '0.0'}%
                        </span>
                      ) : (
                        <div className="inline-flex flex-col items-center">
                          <div className="flex items-center space-x-1.5">
                            <span className="px-2 py-0.5 rounded-md text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                              {summaryTotals.pendientes.finLiquidadas} liq.
                            </span>
                            {summaryTotals.pendientes.finPendientes > 0 && (
                              <span className="px-2 py-0.5 rounded-md text-xs font-black bg-amber-100 text-amber-900 border border-amber-300">
                                {summaryTotals.pendientes.finPendientes} sin despachar
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Cajas Físicas */}
                    <td className="px-3.5 py-3 text-right">
                      {mode === 'inicio' ? (
                        <div>
                          <span className="text-xs font-black text-slate-900">
                            {summaryTotals.pendientes.cajasPlan.toFixed(1)}
                          </span>
                          <span className="text-[10px] text-slate-500 ml-1">cajas</span>
                        </div>
                      ) : (
                        <div>
                          <div className="text-xs font-black text-emerald-800">
                            {summaryTotals.pendientes.finCajasEntregadas.toFixed(1)} ent.
                          </div>
                          {summaryTotals.pendientes.finCajasDevueltas > 0 && (
                            <div className="text-[10px] font-bold text-rose-600">
                              ({summaryTotals.pendientes.finCajasDevueltas.toFixed(1)} dev.)
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Paradas */}
                    <td className="px-3.5 py-3 text-center">
                      <span className="text-xs font-bold text-slate-800">
                        {mode === 'inicio'
                          ? summaryTotals.pendientes.paradasPlan
                          : summaryTotals.pendientes.finParadasRealizadas}
                      </span>
                    </td>

                    {/* Estatus / Resultado */}
                    <td className="px-3.5 py-3 text-center">
                      {mode === 'inicio' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          Pendientes de Salida
                        </span>
                      ) : summaryTotals.pendientes.finPendientes === 0 ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Evacuadas al Cierre
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                          <Clock className="w-3.5 h-3.5 mr-1" />
                          {summaryTotals.pendientes.finPendientes} Sin Despachar
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* FILA 3: TOTAL DE RUTAS EN PISO */}
                  <tr className="hover:bg-amber-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200">
                          <Warehouse className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-black text-slate-900 text-xs">Total Rutas en Piso</p>
                          <p className="text-[11px] text-slate-500 font-normal">
                            Rutas no despachadas, resguardadas o retenidas en bodega
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Rutas: Inicio o Plan */}
                    <td className="px-3.5 py-3 text-center">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-black bg-amber-100 text-amber-800 border border-amber-200 shadow-2xs">
                        {summaryTotals.enPiso.totalPlan}
                      </span>
                    </td>

                    {/* % en Inicio / Al Cierre en Fin */}
                    <td className="px-3.5 py-3 text-center">
                      {mode === 'inicio' ? (
                        <span className="text-xs font-bold text-slate-700">
                          {summaryTotals.totalRutasPlan > 0
                            ? ((summaryTotals.enPiso.totalPlan / summaryTotals.totalRutasPlan) * 100).toFixed(1)
                            : '0.0'}%
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-black bg-amber-100 text-amber-800 border border-amber-300">
                          {summaryTotals.enPiso.finQuedan} en bodega al cierre
                        </span>
                      )}
                    </td>

                    {/* Cajas Físicas */}
                    <td className="px-3.5 py-3 text-right">
                      {mode === 'inicio' ? (
                        <div>
                          <span className="text-xs font-black text-slate-900">
                            {summaryTotals.enPiso.cajasPlan.toFixed(1)}
                          </span>
                          <span className="text-[10px] text-slate-500 ml-1">cajas</span>
                        </div>
                      ) : (
                        <div>
                          <span className="text-xs font-black text-amber-900">
                            {summaryTotals.enPiso.finCajasQuedan.toFixed(1)}
                          </span>
                          <span className="text-[10px] text-amber-700 font-semibold ml-1">en bodega</span>
                        </div>
                      )}
                    </td>

                    {/* Paradas */}
                    <td className="px-3.5 py-3 text-center">
                      <span className="text-xs font-bold text-slate-800">
                        {mode === 'inicio'
                          ? summaryTotals.enPiso.paradasPlan
                          : summaryTotals.enPiso.finParadasQuedan}
                      </span>
                    </td>

                    {/* Estatus / Resultado */}
                    <td className="px-3.5 py-3 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        {mode === 'inicio' ? 'En Resguardo Bodega' : 'Trasladadas a Mañana'}
                      </span>
                    </td>
                  </tr>

                  <tr className="bg-slate-200/70 print:bg-slate-200">
                    <td colSpan={6} className="px-4 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-600">
                      Por Antigüedad desde lo Planificado <span className="font-normal normal-case text-slate-500">(todas las rutas sin importar su estado — se solapan con el bloque anterior)</span>
                    </td>
                  </tr>

                  {/* FILA 4: RUTAS DE 24 HORAS */}
                  <tr className="hover:bg-orange-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-7 h-7 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center shrink-0 border border-orange-200">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <p className="font-black text-slate-900 text-xs">Rutas de 24 Horas</p>
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-orange-100 text-orange-800 border border-orange-200">
                              24h - 48h
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-normal">
                            Rutas con 1 día de antigüedad desde su fecha planificada
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Rutas: Inicio o Plan */}
                    <td className="px-3.5 py-3 text-center">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-black bg-orange-100 text-orange-800 border border-orange-200 shadow-2xs">
                        {summaryTotals.rutas24h.totalPlan}
                      </span>
                    </td>

                    {/* % en Inicio / Al Cierre en Fin */}
                    <td className="px-3.5 py-3 text-center">
                      {mode === 'inicio' ? (
                        <span className="text-xs font-bold text-slate-700">
                          {summaryTotals.totalRutasPlan > 0
                            ? ((summaryTotals.rutas24h.totalPlan / summaryTotals.totalRutasPlan) * 100).toFixed(1)
                            : '0.0'}%
                        </span>
                      ) : (
                        <div className="inline-flex items-center space-x-1">
                          <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800">
                            {summaryTotals.rutas24h.finLiquidadas} liq.
                          </span>
                          <span className="text-slate-400">/</span>
                          <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                            summaryTotals.rutas24h.finPendientes > 0
                              ? 'bg-rose-100 text-rose-800 font-black'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {summaryTotals.rutas24h.finPendientes} pend.
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Cajas Físicas */}
                    <td className="px-3.5 py-3 text-right">
                      {mode === 'inicio' ? (
                        <div>
                          <span className="text-xs font-black text-slate-900">
                            {summaryTotals.rutas24h.cajasPlan.toFixed(1)}
                          </span>
                          <span className="text-[10px] text-slate-500 ml-1">cajas</span>
                        </div>
                      ) : (
                        <div>
                          <div className="text-xs font-black text-slate-900">
                            {summaryTotals.rutas24h.finCajasEntregadas.toFixed(1)} ent.
                          </div>
                          {summaryTotals.rutas24h.finCajasDevueltas > 0 && (
                            <div className="text-[10px] font-bold text-rose-600">
                              ({summaryTotals.rutas24h.finCajasDevueltas.toFixed(1)} dev.)
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Paradas */}
                    <td className="px-3.5 py-3 text-center">
                      <span className="text-xs font-bold text-slate-800">
                        {mode === 'inicio'
                          ? summaryTotals.rutas24h.paradasPlan
                          : summaryTotals.rutas24h.finParadasRealizadas}
                      </span>
                    </td>

                    {/* Estatus / Resultado */}
                    <td className="px-3.5 py-3 text-center">
                      {mode === 'inicio' ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          summaryTotals.rutas24h.totalPlan > 0
                            ? 'bg-orange-50 text-orange-700 border border-orange-200'
                            : 'bg-slate-50 text-slate-500 border border-slate-200'
                        }`}>
                          {summaryTotals.rutas24h.totalPlan > 0 ? 'Rezago 24 Horas' : 'Sin Rezagos 24h'}
                        </span>
                      ) : summaryTotals.rutas24h.finPendientes === 0 ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Evacuadas 100%
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                          <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                          {summaryTotals.rutas24h.finPendientes} Pendientes
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* FILA 5: RUTAS DE 72 HORAS */}
                  <tr className="hover:bg-rose-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 border border-rose-200">
                          <AlertTriangle className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <p className="font-black text-slate-900 text-xs">Rutas de 72 Horas</p>
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 border border-rose-200">
                              48h - 72h
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-normal">
                            Rutas con 2 a 3 días acumulados sin liquidar/despachar
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Rutas: Inicio o Plan */}
                    <td className="px-3.5 py-3 text-center">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-black bg-rose-100 text-rose-800 border border-rose-200 shadow-2xs">
                        {summaryTotals.rutas72h.totalPlan}
                      </span>
                    </td>

                    {/* % en Inicio / Al Cierre en Fin */}
                    <td className="px-3.5 py-3 text-center">
                      {mode === 'inicio' ? (
                        <span className="text-xs font-bold text-slate-700">
                          {summaryTotals.totalRutasPlan > 0
                            ? ((summaryTotals.rutas72h.totalPlan / summaryTotals.totalRutasPlan) * 100).toFixed(1)
                            : '0.0'}%
                        </span>
                      ) : (
                        <div className="inline-flex items-center space-x-1">
                          <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800">
                            {summaryTotals.rutas72h.finLiquidadas} liq.
                          </span>
                          <span className="text-slate-400">/</span>
                          <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                            summaryTotals.rutas72h.finPendientes > 0
                              ? 'bg-rose-100 text-rose-800 font-black'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {summaryTotals.rutas72h.finPendientes} pend.
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Cajas Físicas */}
                    <td className="px-3.5 py-3 text-right">
                      {mode === 'inicio' ? (
                        <div>
                          <span className="text-xs font-black text-slate-900">
                            {summaryTotals.rutas72h.cajasPlan.toFixed(1)}
                          </span>
                          <span className="text-[10px] text-slate-500 ml-1">cajas</span>
                        </div>
                      ) : (
                        <div>
                          <div className="text-xs font-black text-slate-900">
                            {summaryTotals.rutas72h.finCajasEntregadas.toFixed(1)} ent.
                          </div>
                          {summaryTotals.rutas72h.finCajasDevueltas > 0 && (
                            <div className="text-[10px] font-bold text-rose-600">
                              ({summaryTotals.rutas72h.finCajasDevueltas.toFixed(1)} dev.)
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Paradas */}
                    <td className="px-3.5 py-3 text-center">
                      <span className="text-xs font-bold text-slate-800">
                        {mode === 'inicio'
                          ? summaryTotals.rutas72h.paradasPlan
                          : summaryTotals.rutas72h.finParadasRealizadas}
                      </span>
                    </td>

                    {/* Estatus / Resultado */}
                    <td className="px-3.5 py-3 text-center">
                      {mode === 'inicio' ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          summaryTotals.rutas72h.totalPlan > 0
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-slate-50 text-slate-500 border border-slate-200'
                        }`}>
                          {summaryTotals.rutas72h.totalPlan > 0 ? 'Alerta 72 Horas' : 'Sin Rezagos 72h'}
                        </span>
                      ) : summaryTotals.rutas72h.finPendientes === 0 ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Evacuadas 100%
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                          <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                          {summaryTotals.rutas72h.finPendientes} Pendientes
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* FILA 6: RUTAS MAYORES A 72 HORAS */}
                  <tr className="hover:bg-red-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-7 h-7 rounded-lg bg-red-100 text-red-700 flex items-center justify-center shrink-0 border border-red-200">
                          <AlertCircle className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-1.5">
                            <p className="font-black text-slate-900 text-xs">Rutas Mayores a 72 Horas</p>
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-red-100 text-red-800 border border-red-200">
                              &gt; 72h
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-normal">
                            Rutas críticas con más de 3 días acumulados de atraso
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Rutas: Inicio o Plan */}
                    <td className="px-3.5 py-3 text-center">
                      <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-md text-xs font-black bg-red-100 text-red-800 border border-red-200 shadow-2xs">
                        {summaryTotals.rutasMayor72h.totalPlan}
                      </span>
                    </td>

                    {/* % en Inicio / Al Cierre en Fin */}
                    <td className="px-3.5 py-3 text-center">
                      {mode === 'inicio' ? (
                        <span className="text-xs font-bold text-slate-700">
                          {summaryTotals.totalRutasPlan > 0
                            ? ((summaryTotals.rutasMayor72h.totalPlan / summaryTotals.totalRutasPlan) * 100).toFixed(1)
                            : '0.0'}%
                        </span>
                      ) : (
                        <div className="inline-flex items-center space-x-1">
                          <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800">
                            {summaryTotals.rutasMayor72h.finLiquidadas} liq.
                          </span>
                          <span className="text-slate-400">/</span>
                          <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                            summaryTotals.rutasMayor72h.finPendientes > 0
                              ? 'bg-red-100 text-red-800 font-black'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {summaryTotals.rutasMayor72h.finPendientes} pend.
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Cajas Físicas */}
                    <td className="px-3.5 py-3 text-right">
                      {mode === 'inicio' ? (
                        <div>
                          <span className="text-xs font-black text-slate-900">
                            {summaryTotals.rutasMayor72h.cajasPlan.toFixed(1)}
                          </span>
                          <span className="text-[10px] text-slate-500 ml-1">cajas</span>
                        </div>
                      ) : (
                        <div>
                          <div className="text-xs font-black text-slate-900">
                            {summaryTotals.rutasMayor72h.finCajasEntregadas.toFixed(1)} ent.
                          </div>
                          {summaryTotals.rutasMayor72h.finCajasDevueltas > 0 && (
                            <div className="text-[10px] font-bold text-rose-600">
                              ({summaryTotals.rutasMayor72h.finCajasDevueltas.toFixed(1)} dev.)
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Paradas */}
                    <td className="px-3.5 py-3 text-center">
                      <span className="text-xs font-bold text-slate-800">
                        {mode === 'inicio'
                          ? summaryTotals.rutasMayor72h.paradasPlan
                          : summaryTotals.rutasMayor72h.finParadasRealizadas}
                      </span>
                    </td>

                    {/* Estatus / Resultado */}
                    <td className="px-3.5 py-3 text-center">
                      {mode === 'inicio' ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                          summaryTotals.rutasMayor72h.totalPlan > 0
                            ? 'bg-red-100 text-red-800 border border-red-200'
                            : 'bg-slate-50 text-slate-500 border border-slate-200'
                        }`}>
                          {summaryTotals.rutasMayor72h.totalPlan > 0 ? 'Crítico >72 Horas' : 'Sin Rezagos >72h'}
                        </span>
                      ) : summaryTotals.rutasMayor72h.finPendientes === 0 ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Evacuadas 100%
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-black bg-red-100 text-red-800 border border-red-200">
                          <AlertCircle className="w-3.5 h-3.5 mr-1" />
                          {summaryTotals.rutasMayor72h.finPendientes} Críticas Pendientes
                        </span>
                      )}
                    </td>
                  </tr>
                </tbody>

                {/* PIE DE TABLA: TOTALES GENERALES CONSOLIDADOS */}
                <tfoot className="bg-slate-900 text-white font-bold border-t-2 border-slate-800 text-xs print:bg-slate-200 print:text-slate-900">
                  <tr>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        <div>
                          <span className="uppercase tracking-wider text-[11px]">Total General Planificado</span>
                          <p className="text-[9px] font-normal normal-case text-slate-400 mt-0.5">
                            Universo total de rutas — no es la suma de las 6 filas (los bloques se solapan)
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3.5 py-3 text-center">
                      <span className="text-sm font-black text-white print:text-slate-900">
                        {summaryTotals.totalRutasPlan}
                      </span>
                    </td>
                    <td className="px-3.5 py-3 text-center">
                      {mode === 'inicio' ? (
                        <span className="text-xs font-bold text-slate-300 print:text-slate-700">100.0%</span>
                      ) : (
                        <span className="text-xs font-bold text-emerald-300 print:text-emerald-800">
                          {summaryTotals.total?.finLiquidadasCount ?? 0} liq. / {summaryTotals.total?.finPendientesCount ?? 0} pend.
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-3 text-right">
                      {mode === 'inicio' ? (
                        <span className="text-xs font-black text-white print:text-slate-900">
                          {summaryTotals.totalCajasPlan.toFixed(1)}
                        </span>
                      ) : (
                        <div>
                          <div className="text-xs font-black text-emerald-400 print:text-emerald-800">
                            {summaryTotals.totalCajasEntregadas.toFixed(1)} ent.
                          </div>
                          {summaryTotals.totalCajasDevueltas > 0 && (
                            <div className="text-[10px] text-rose-300 print:text-rose-700">
                              {summaryTotals.totalCajasDevueltas.toFixed(1)} dev.
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3.5 py-3 text-center">
                      <span className="text-xs font-black text-white print:text-slate-900">
                        {mode === 'inicio'
                          ? summaryTotals.totalParadasPlan
                          : summaryTotals.totalParadasRealizadas}
                      </span>
                    </td>
                    <td className="px-3.5 py-3 text-center text-[11px] text-slate-300 print:text-slate-700">
                      {mode === 'inicio' ? 'Plan Inicial de Carga' : 'Balance Final Consolidado'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ============================================================== */}
          {/* RECURSOS NO ASIGNADOS (Fin de Asignación) — Solo en Inicio de Día */}
          {/* ============================================================== */}
          {mode === 'inicio' && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden print:border print:border-slate-400 print:shadow-none print:rounded-lg">
              <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 print:bg-slate-100 print:text-slate-900">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 print:text-amber-600" />
                  <h3 className="text-xs font-bold uppercase tracking-wider">
                    Recursos No Asignados (Fin de Asignación)
                  </h3>
                </div>
                <span className="text-xs font-bold bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded-full border border-slate-700 print:bg-slate-200 print:text-slate-800">
                  {unassignedTrucks.length + unassignedStaff.length} registros
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">
                {/* Camiones no asignados */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center">
                      <TruckIcon className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                      Camiones sin Asignar
                    </h4>
                    <span className="text-xs font-black text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                      {unassignedTrucks.length}
                    </span>
                  </div>

                  {unassignedTrucks.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Todos los camiones disponibles fueron asignados.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {unassignedTrucksByReason.map(({ reason, count }) => (
                          <span
                            key={reason}
                            className="text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full"
                          >
                            {reason}: {count}
                          </span>
                        ))}
                      </div>
                      <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                        {unassignedTrucks.map((t) => (
                          <li
                            key={t.id}
                            className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                          >
                            <span className="font-semibold text-slate-700">
                              {t.idCamion ? `#${t.idCamion} — ` : ''}
                              {t.placa}
                            </span>
                            <span className="text-amber-700 font-medium">{t.motivoNoAsignado}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>

                {/* Personal no asignado */}
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center">
                      <Users className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                      Personal sin Asignar
                    </h4>
                    <span className="text-xs font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                      {unassignedStaff.length}
                    </span>
                  </div>

                  {unassignedStaff.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">Todo el personal disponible fue asignado.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {unassignedStaffByReason.map(({ reason, count }) => (
                          <span
                            key={reason}
                            className="text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full"
                          >
                            {reason}: {count}
                          </span>
                        ))}
                      </div>
                      <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                        {unassignedStaff.map((s) => (
                          <li
                            key={s.id}
                            className="flex items-center justify-between text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                          >
                            <span className="font-semibold text-slate-700">{s.nombre}</span>
                            <span className="text-amber-700 font-medium">{s.motivoNoAsignado}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TABLA DETALLADA DE RUTAS (El resto se mantiene exactamente igual) */}
          {/* ============================================================== */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden print:border print:border-slate-400 print:shadow-none print:rounded-lg">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800 print:bg-slate-100 print:text-slate-900">
              <div className="flex items-center space-x-2">
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse print:hidden"></div>
                <h3 className="text-xs font-bold uppercase tracking-wider">
                  {mode === 'inicio'
                    ? 'Detalle de Rutas Planificadas al Inicio del Día'
                    : 'Balance y Ejecución Final de Rutas Planificadas'}
                </h3>
              </div>
              <span className="text-xs font-bold bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded-full border border-slate-700 print:bg-slate-200 print:text-slate-800">
                {mode === 'inicio' ? inicioFilteredList.length : finFilteredList.length} registros
              </span>
            </div>

            {(mode === 'inicio' ? inicioFilteredList.length === 0 : finFilteredList.length === 0) ? (
              <div className="p-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center space-y-2">
                <Filter className="w-8 h-8 text-slate-300" />
                <p className="font-bold text-slate-700 text-sm">No se encontraron rutas que coincidan con los filtros</p>
                <p className="text-slate-400 text-xs">Intente seleccionando "Todas" o cambiando la agencia seleccionada.</p>
              </div>
            ) : (
              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full text-left text-xs text-slate-700 border-collapse print:text-[10px]">
                  <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300 text-[11px] uppercase tracking-wider print:bg-slate-200 print:text-slate-900 print:table-header-group">
                    <tr>
                      {/* 1. No. Ruta */}
                      <th className="px-3.5 py-3 whitespace-nowrap">No. Ruta</th>

                      {/* 2. Fecha Planificada */}
                      <th className="px-3.5 py-3 text-center whitespace-nowrap">Fecha Planificada</th>

                      {/* 3. Fecha Despachada */}
                      <th className="px-3.5 py-3 text-center whitespace-nowrap">Fecha Despachada</th>

                      {/* 4. Total de Horas desde la Fecha Planificada */}
                      <th className="px-3.5 py-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center">
                          <Clock className="w-3.5 h-3.5 mr-1 text-indigo-600" />
                          Total Horas Plan
                        </span>
                      </th>

                      {/* 5. Indicador para verificar si es atrasado o está en tiempo */}
                      <th className="px-3.5 py-3 text-center whitespace-nowrap">Indicador / Estado</th>

                      {/* 6. CAJAS FÍSICAS */}
                      <th className="px-3.5 py-3 text-right whitespace-nowrap font-black">
                        {mode === 'inicio' ? 'Cajas Físicas' : 'Cajas Físicas (Plan / Ent / Dev)'}
                      </th>

                      {/* 7. PARADAS */}
                      <th className="px-3.5 py-3 text-center whitespace-nowrap font-black">
                        {mode === 'inicio' ? 'Paradas' : 'Paradas / Guías'}
                      </th>

                      {/* 8. Agencia */}
                      <th className="px-3.5 py-3 whitespace-nowrap">Agencia</th>

                      {/* 9. Segmento */}
                      <th className="px-3.5 py-3 whitespace-nowrap">Segmento</th>

                      {/* Columna de estado en Fin de Día */}
                      {mode === 'fin' && (
                        <th className="px-3.5 py-3 text-center whitespace-nowrap">Resultado Final</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-medium">
                    {(mode === 'inicio' ? inicioFilteredList : finFilteredList).map((item) => {
                      const isAtrasado = item.estaAtrasado;

                      return (
                        <tr
                          key={item.id}
                          className={`transition ${
                            isAtrasado
                              ? 'bg-rose-50/30 hover:bg-rose-50/60'
                              : 'hover:bg-slate-50/80'
                          }`}
                        >
                          {/* 1. NO. RUTA */}
                          <td className="px-3.5 py-3 font-black text-slate-900 whitespace-nowrap">
                            <div className="flex items-center space-x-1.5">
                              <span className="text-indigo-900 font-bold">#{item.id}</span>
                              {item.isRecarga && (
                                <span className="text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-300 px-1.5 py-0.5 rounded">
                                  Recarga
                                </span>
                              )}
                              {item.isFloor && (
                                <span className="text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded">
                                  Piso
                                </span>
                              )}
                              {item.isRezagadaAnterior && (
                                <span className="text-[9px] font-bold bg-rose-100 text-rose-800 border border-rose-300 px-1.5 py-0.5 rounded">
                                  Rezagada
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 2. FECHA PLANIFICADA */}
                          <td className="px-3.5 py-3 text-center text-slate-800 font-semibold whitespace-nowrap">
                            <span className="inline-flex items-center">
                              {item.fechaPlanificadaStr}
                            </span>
                          </td>

                          {/* 3. FECHA DESPACHADA */}
                          <td className="px-3.5 py-3 text-center whitespace-nowrap">
                            {item.isDespachada ? (
                              <span className="font-semibold text-slate-800 inline-flex items-center bg-slate-100 px-2 py-0.5 rounded text-xs border border-slate-200">
                                <TruckIcon className="w-3 h-3 mr-1 text-slate-500" />
                                {item.fechaDespachadaStr}
                              </span>
                            ) : item.isFloor ? (
                              <span className="font-bold text-amber-800 inline-flex items-center bg-amber-50 px-2 py-0.5 rounded text-xs border border-amber-200">
                                <Warehouse className="w-3 h-3 mr-1 text-amber-600" />
                                En Bodega (A Piso)
                              </span>
                            ) : (
                              <span className="font-bold text-slate-600 inline-flex items-center bg-slate-100 px-2 py-0.5 rounded text-xs border border-slate-200">
                                <Clock className="w-3 h-3 mr-1 text-slate-400" />
                                Pendiente de Despacho
                              </span>
                            )}
                          </td>

                          {/* 4. TOTAL DE HORAS DESDE LA FECHA PLANIFICADA */}
                          <td className="px-3.5 py-3 text-center whitespace-nowrap font-bold">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-black border ${
                                item.totalHorasDesdePlan >= 24
                                  ? 'bg-rose-100 text-rose-900 border-rose-300'
                                  : item.totalHorasDesdePlan >= 4
                                  ? 'bg-orange-100 text-orange-900 border-orange-300'
                                  : 'bg-slate-100 text-slate-800 border-slate-300'
                              }`}
                              title={`Horas transcurridas desde el inicio planificado: ${item.totalHorasDesdePlan}h`}
                            >
                              <Clock className="w-3 h-3 mr-1 text-current" />
                              {item.horasTexto}
                            </span>
                          </td>

                          {/* 5. INDICADOR PARA VERIFICAR SI ES ATRASADO O ESTÁ EN TIEMPO */}
                          <td className="px-3.5 py-3 text-center whitespace-nowrap">
                            {isAtrasado ? (
                              <span
                                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs"
                                title={item.indicadorDetalle}
                              >
                                <AlertCircle className="w-3.5 h-3.5 mr-1 text-rose-600" />
                                Atrasado
                                <span className="ml-1 text-[10px] font-bold text-rose-700">
                                  ({item.horasTexto})
                                </span>
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs"
                                title={item.indicadorDetalle}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                                En tiempo
                              </span>
                            )}
                          </td>

                          {/* 6. CAJAS FÍSICAS */}
                          <td className="px-3.5 py-3 text-right whitespace-nowrap font-black text-slate-900">
                            {mode === 'inicio' ? (
                              <span className="text-sm font-black text-slate-900">
                                {item.cajasFisicasPlan.toFixed(1)}
                              </span>
                            ) : (
                              <div className="flex flex-col items-end">
                                <div className="flex items-center space-x-1.5 text-xs font-black">
                                  <span className="text-slate-500 font-semibold" title="Planificadas">
                                    P: {item.cajasFisicasPlan.toFixed(1)}
                                  </span>
                                  <span className="text-slate-300">|</span>
                                  <span className="text-emerald-700 font-black" title="Entregadas">
                                    E: {item.isLiquidada ? item.cajasFisicasEntregadas.toFixed(1) : '-'}
                                  </span>
                                  {item.cajasFisicasDevueltas > 0 && (
                                    <>
                                      <span className="text-slate-300">|</span>
                                      <span className="text-rose-700 font-black" title="Devueltas">
                                        D: {item.cajasFisicasDevueltas.toFixed(1)}
                                      </span>
                                    </>
                                  )}
                                </div>
                                {item.isLiquidada && (
                                  <span className="text-[10px] font-bold text-emerald-700 mt-0.5">
                                    {item.efectividadEntregaPorc}% efectividad
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* 7. PARADAS */}
                          <td className="px-3.5 py-3 text-center whitespace-nowrap font-bold text-slate-800">
                            {mode === 'inicio' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-xs">
                                {item.paradasPlan} paradas
                              </span>
                            ) : (
                              <div className="flex flex-col items-center">
                                <span className="text-xs font-bold text-slate-800">
                                  {item.isLiquidada ? `${item.guiasExitosas} / ${item.paradasPlan}` : `${item.paradasPlan} prog.`}
                                </span>
                                {item.isLiquidada && item.guiasRechazadas > 0 && (
                                  <span className="text-[10px] font-bold text-rose-600">
                                    {item.guiasRechazadas} rechazos
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          {/* 8. AGENCIA */}
                          <td className="px-3.5 py-3 whitespace-nowrap font-semibold text-slate-900">
                            <span className="inline-flex items-center">
                              <Building2 className="w-3.5 h-3.5 mr-1 text-slate-400" />
                              {item.agencia}
                            </span>
                          </td>

                          {/* 9. SEGMENTO */}
                          <td className="px-3.5 py-3 whitespace-nowrap text-slate-700 font-medium">
                            <span className="inline-flex items-center">
                              <MapPin className="w-3.5 h-3.5 mr-1 text-slate-400" />
                              {item.segmento}
                            </span>
                          </td>

                          {/* RESULTADO FINAL (FIN DE DÍA) */}
                          {mode === 'fin' && (
                            <td className="px-3.5 py-3 text-center whitespace-nowrap">
                              {item.isLiquidada ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
                                  Liquidada
                                </span>
                              ) : item.isFloor ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                                  <Warehouse className="w-3 h-3 mr-1 text-amber-600" />
                                  En Bodega
                                </span>
                              ) : item.estado === 'En Tránsito' ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-800 border border-blue-300">
                                  <TruckIcon className="w-3 h-3 mr-1 text-blue-600" />
                                  En Tránsito
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                                  No Concluida
                                </span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pie de página oficial visible solo en impresión */}
          <div className="hidden print:flex items-center justify-between pt-3 mt-4 border-t border-slate-300 text-[9px] text-slate-500">
            <div className="flex items-center space-x-2">
              <span className="font-bold text-slate-800">DISCARGA CONTROLER</span>
              <span>•</span>
              <span>Sistema de Asignación, Segmentación y Liquidación Operativa</span>
            </div>
            <div>
              <span>Agencia: <strong className="text-slate-800">{filterAgency}</strong> • Fecha: <strong className="text-slate-800">{fechaHoy || formatDateToGuatemala(new Date())}</strong></span>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* FOOTER DEL MODAL                                               */}
        {/* ============================================================== */}
        <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 print:hidden">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-slate-700">
              Vista activa:{' '}
              <strong className="text-slate-900">
                {mode === 'inicio' ? '🌅 Inicio de Día (Lo Planificado antes de Liquidar)' : '🌙 Fin de Día (Ejecución Real de lo Planificado)'}
              </strong>
            </span>
            <span>•</span>
            <span>Agencia: <strong className="text-slate-800">{filterAgency}</strong></span>
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              onClick={handlePrint}
              title="Imprimir resumen oficial"
              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center transition cursor-pointer shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
              Imprimir
            </button>
            <button
              onClick={handleSavePdf}
              title="Guardar o descargar como PDF"
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold flex items-center transition cursor-pointer shadow-2xs"
            >
              <FileDown className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
              Guardar en PDF
            </button>
            <button
              onClick={() => setMode(mode === 'inicio' ? 'fin' : 'inicio')}
              className="text-xs font-bold text-indigo-700 hover:text-indigo-900 flex items-center transition cursor-pointer ml-1"
            >
              {mode === 'inicio' ? (
                <>Ver cómo se terminó de ejecutar en Fin de Día &rarr;</>
              ) : (
                <>&larr; Volver a lo planificado en Inicio de Día</>
              )}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold transition cursor-pointer"
            >
              Cerrar Resumen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
