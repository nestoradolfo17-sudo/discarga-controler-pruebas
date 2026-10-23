import type { RouteSummaryMetric } from '../components/modals/DailySummaryModal';

// --- Cierre del día: cálculo de indicadores ---
//
// Cada ruta del reporte cae en UN solo estado final, así los grupos siempre
// suman el total planificado (antes la tabla mezclaba "estado" y "antigüedad"
// y contaba rutas dos veces).
//
//   Liquidadas · En ruta (en tránsito o abierta) · Sin despachar · A piso · Bolsón
//
// Correcciones respecto a los indicadores anteriores:
//   • Cumplimiento: sobre las rutas DESPACHABLES (sin piso ni bolsón, que no
//     salen ese día por decisión).
//   • Efectividad: solo si hay cajas liquidadas; sin liquidaciones es "—"
//     (antes marcaba 100%).
//   • Cajas: se separan las despachadas de las que quedaron en bodega.
//   • Atraso: solo rutas SIN liquidar con 1 día o más desde su fecha planificada.

export type EstadoCierre = 'liquidada' | 'en_ruta' | 'abierta' | 'sin_despachar' | 'piso' | 'bolson';

export const ETIQUETA_CIERRE: Record<EstadoCierre, string> = {
  liquidada: 'Liquidada',
  en_ruta: 'En ruta',
  abierta: 'Ruta abierta',
  sin_despachar: 'Sin despachar',
  piso: 'A piso (mañana)',
  bolson: 'Bolsón',
};

export const estadoCierre = (m: RouteSummaryMetric): EstadoCierre => {
  if (m.isLiquidada) return 'liquidada';
  if (m.isBolson) return 'bolson';
  if (m.isFloor) return 'piso';
  if (m.estado === 'En Tránsito') return 'en_ruta';
  if (m.estado === 'Abierta') return 'abierta';
  return 'sin_despachar';
};

export interface PendienteCierre {
  m: RouteSummaryMetric;
  estado: EstadoCierre;
  dias: number;
  piloto: string;
  camion: string;
}

export interface CierreDatos {
  total: number;
  conteo: Record<EstadoCierre, number>;
  despachables: number;
  cumplimiento: number | null; // 0..1
  cajasPlan: number;
  cajasDespachadas: number;
  cajasBodega: number;
  cajasBolson: number;
  cajasSinDespachar: number;
  cjEnt: number;
  cjDev: number;
  efectividad: number | null; // 0..1
  paradasExitosas: number;
  atrasadas: { total: number; d1: number; d2: number; d3: number };
  enPlazo: number;
  pendientes: PendienteCierre[];
  devoluciones: { motivo: string; rutas: number; cajas: number }[];
  cajasAbiertas: number;
}

const ORDEN_PEND: EstadoCierre[] = ['en_ruta', 'abierta', 'sin_despachar', 'piso'];

export function calcularCierre(metrics: RouteSummaryMetric[]): CierreDatos {
  const conteo: Record<EstadoCierre, number> = { liquidada: 0, en_ruta: 0, abierta: 0, sin_despachar: 0, piso: 0, bolson: 0 };
  let cajasPlan = 0;
  let cajasBodega = 0;
  let cajasBolson = 0;
  let cajasSinDespachar = 0;
  let cjEnt = 0;
  let cjDev = 0;
  let paradasExitosas = 0;
  let cajasAbiertas = 0;
  const atrasadas = { total: 0, d1: 0, d2: 0, d3: 0 };
  let enPlazo = 0;
  const pendientes: PendienteCierre[] = [];
  const dev = new Map<string, { rutas: number; cajas: number }>();

  metrics.forEach((m) => {
    const e = estadoCierre(m);
    conteo[e] += 1;
    cajasPlan += m.cajasFisicasPlan;
    if (e === 'piso') cajasBodega += m.cajasFisicasPlan;
    if (e === 'bolson') cajasBolson += m.cajasFisicasPlan;
    if (e === 'sin_despachar') cajasSinDespachar += m.cajasFisicasPlan;
    if (e === 'liquidada') {
      cjEnt += m.cajasFisicasEntregadas;
      cjDev += m.cajasFisicasDevueltas;
      paradasExitosas += m.guiasExitosas;
      if (m.route.liquidacion?.cajaAbierta && !m.route.liquidacion?.cajaAbiertaResuelta) cajasAbiertas += 1;
      const d = m.cajasFisicasDevueltas;
      if (d > 0) {
        const l = m.route.liquidacion;
        const sel = l?.motivosSeleccionados?.length ? l.motivosSeleccionados : [l?.motivoDevolucion || m.route.motivoDevolucion || 'Sin motivo registrado'];
        sel.forEach((mo) => {
          const k = String(mo || 'Sin motivo registrado');
          const x = dev.get(k) || { rutas: 0, cajas: 0 };
          x.rutas += 1;
          x.cajas += d / sel.length;
          dev.set(k, x);
        });
      }
      return;
    }
    if (e === 'bolson') return;
    const dias = Math.round(m.totalHorasDesdePlan / 24);
    if (m.estaAtrasado) {
      atrasadas.total += 1;
      if (dias <= 1) atrasadas.d1 += 1;
      else if (dias <= 3) atrasadas.d2 += 1;
      else atrasadas.d3 += 1;
    } else enPlazo += 1;
    const a = m.route.asignacion || m.route.ultimoDespacho;
    pendientes.push({ m, estado: e, dias, piloto: a?.conductor || '—', camion: a?.camionPlaca || '—' });
  });

  // Primero las más atrasadas; con el mismo atraso, por estado y número de ruta.
  pendientes.sort(
    (a, b) =>
      b.dias - a.dias ||
      ORDEN_PEND.indexOf(a.estado) - ORDEN_PEND.indexOf(b.estado) ||
      String(a.m.id).localeCompare(String(b.m.id), 'es', { numeric: true })
  );

  const despachables = metrics.length - conteo.piso - conteo.bolson;
  return {
    total: metrics.length,
    conteo,
    despachables,
    cumplimiento: despachables > 0 ? conteo.liquidada / despachables : null,
    cajasPlan,
    cajasDespachadas: Math.max(0, cajasPlan - cajasBodega - cajasBolson - cajasSinDespachar),
    cajasBodega,
    cajasBolson,
    cajasSinDespachar,
    cjEnt,
    cjDev,
    efectividad: cjEnt + cjDev > 0 ? cjEnt / (cjEnt + cjDev) : null,
    paradasExitosas,
    atrasadas,
    enPlazo,
    pendientes,
    devoluciones: [...dev.entries()].map(([motivo, v]) => ({ motivo, ...v })).sort((a, b) => b.cajas - a.cajas),
    cajasAbiertas,
  };
}

/** Texto de antigüedad: "Del día", "1 día", "5 días". */
export const textoDias = (d: number) => (d <= 0 ? 'Del día' : d === 1 ? '1 día' : `${d} días`);
