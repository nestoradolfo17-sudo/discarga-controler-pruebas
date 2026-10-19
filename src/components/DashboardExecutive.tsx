import React, { useMemo, useState } from 'react';
import { Route, Truck, Staff } from '../types';
import { formatDateToGuatemala, parseFlexibleDate } from '../utils/date';
import { getRouteKey } from '../utils/routeKey';
import {
  AlertTriangle,
  Truck as TruckIcon,
  PackageCheck,
  PackageX,
  CheckCircle2,
  Clock,
  Users,
  Target,
  Layers,
  Building2,
} from 'lucide-react';
import { toNum } from '../utils/number';

// --- Dashboard ejecutivo (propuesta nueva) ---
// Solo LEE los datos que ya existen (rutas del tablero, liquidadas, camiones y
// personal); no modifica ni guarda nada. Usa la misma paleta de estado que el
// dashboard clásico: good = completado, info = en operación, warning = pendiente,
// serious = devolución, critical = requiere atención.
export const C_GOOD = '#0ca30c';
export const C_INFO = '#2a78d6';
export const C_WARN = '#fab219';
export const C_SERIOUS = '#ec835a';
export const C_CRIT = '#d03b3b';
export const C_TRACK = '#e8eef5';

interface DashboardStats {
  pendientes: number;
  // Rutas Bolsón activas (no cuentan como pendientes de asignar).
  bolson?: number;
  transito: number;
  abiertas: number;
  liquidadas: number;
  liquidadasTotal: number;
  pisoHoy: number;
  fechaHoy: string;
  cajasFisicasHoy: number;
  cajasEntregadasHoy: number;
}

interface Props {
  routes: Route[];
  liquidatedRoutes: Route[];
  trucks: Truck[];
  staff: Staff[];
  stats: DashboardStats;
  selectedAgency: string;
  // Si solo se cargaron los últimos N días del historial (ver App.tsx).
  historyLimitedDays?: number;
  onLoadFullHistory?: () => void;
  isLoadingFullHistory?: boolean;
}

type PeriodKind = 'hoy' | 'ayer' | '7d' | 'rango' | 'mes';
const sod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};
const routeDayKey = (r: Route) => {
  const raw = r.fechaOriginalRuta || r.fecha;
  return raw ? formatDateToGuatemala(raw) : null;
};
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const n0 = (v: number) => Math.round(v).toLocaleString('en-US');
const n1 = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 });
const pctTxt = (v: number, t: number) => (t > 0 ? `${((v / t) * 100).toFixed(1)}%` : '—');
const isPiso = (r: Route) => !!(r.aPiso || r.tipoAsignacion === 'Ruta a Piso' || r.asignacion?.tipoAsignacion === 'Ruta a Piso');
const isBolson = (r: Route) => !!(r.esBolson || r.tipoAsignacion === 'Ruta Bolsón');
const hoursSince = (r: Route, now: number) => {
  const d = parseFlexibleDate(r.fechaOriginalRuta || r.fecha || '');
  return d && !isNaN(d.getTime()) ? Math.max(0, (now - d.getTime()) / 36e5) : 0;
};
const cajasPlan = (r: Route) => toNum(r.cajasOriginales || r.cajasFisicas);

// ---------- piezas visuales ----------
export const Card: React.FC<{ title: string; sub?: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  title,
  sub,
  icon,
  right,
  children,
  className = '',
}) => (
  <section className={`bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5 ${className}`}>
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          {icon}
          {title}
        </h3>
        {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
      </div>
      {right}
    </div>
    {children}
  </section>
);

export const Kpi: React.FC<{
  label: string;
  value: string;
  sub: string;
  accent: string;
  icon: React.ReactNode;
  progress?: number; // 0..1
  status?: string;
  // Detalle que aparece al pasar el cursor (o al tocar la tarjeta).
  detalle?: React.ReactNode;
}> = ({ label, value, sub, accent, icon, progress, status, detalle }) => (
  <div
    className={`bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-2 min-w-0 ${detalle ? 'relative group cursor-help focus:outline-none focus:ring-2 focus:ring-slate-300' : ''}`}
    tabIndex={detalle ? 0 : undefined}
  >
    {detalle && (
      <div
        data-no-pdf
        role="tooltip"
        className="hidden group-hover:block group-focus:block absolute right-0 top-full mt-2 z-30 w-[22rem] max-w-[90vw] bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-left"
      >
        {detalle}
      </div>
    )}
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wide truncate">{label}</span>
      <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}1A`, color: accent }}>
        {icon}
      </span>
    </div>
    <div className="text-3xl font-black text-slate-900 leading-none tabular-nums">{value}</div>
    {progress !== undefined && (
      <div className="h-2 w-full rounded-full overflow-hidden" style={{ backgroundColor: C_TRACK }} role="img" aria-label={`${Math.round(progress * 100)}%`}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%`, backgroundColor: accent }} />
      </div>
    )}
    <p className="text-[11px] text-slate-600 leading-snug">
      {status && <span className="font-bold mr-1" style={{ color: accent }}>{status}</span>}
      {sub}
    </p>
  </div>
);

// Barra horizontal con etiqueta, valor y tooltip al pasar el dedo/mouse.
export const HBar: React.FC<{ label: string; value: number; max: number; color: string; display?: string; tip?: string; valueWidth?: string }> = ({
  label,
  value,
  max,
  color,
  display,
  tip,
  valueWidth = 'w-20',
}) => (
  <div className="flex items-center gap-3 group" title={tip || `${label}: ${display ?? n0(value)}`}>
    <span className="w-32 sm:w-40 shrink-0 text-xs text-slate-700 truncate">{label}</span>
    <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ backgroundColor: C_TRACK }}>
      <div className="h-full rounded-full transition-all group-hover:opacity-80" style={{ width: `${max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0}%`, backgroundColor: color }} />
    </div>
    <span className={`${valueWidth} text-right text-xs font-bold text-slate-800 tabular-nums whitespace-nowrap`}>{display ?? n0(value)}</span>
  </div>
);

// Columnas de 7 días (una sola medida por gráfico; sin doble eje).
const Columns: React.FC<{ data: { key: string; label: string; value: number; tip: string }[]; color: string; fmt?: (v: number) => string; maxValue?: number }> = ({
  data,
  color,
  fmt = n0,
  maxValue,
}) => {
  const [hover, setHover] = useState<number | null>(null);
  const max = maxValue ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-2 h-32 px-1">
      {data.map((d, i) => (
        <div
          key={d.key}
          className="relative flex-1 flex flex-col items-center justify-end h-full cursor-default"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
          onFocus={() => setHover(i)}
          onBlur={() => setHover(null)}
          tabIndex={0}
        >
          {hover === i && (
            <div className="absolute -top-8 bg-slate-900 text-white text-[11px] font-semibold px-2 py-1 rounded-lg whitespace-nowrap z-10 shadow-lg pointer-events-none">
              {d.tip}
            </div>
          )}
          <span className="text-[10px] font-bold text-slate-600 mb-1 tabular-nums">{d.value > 0 ? fmt(d.value) : ''}</span>
          <div className="w-full rounded-t-[4px]" style={{ height: `${Math.max((d.value / max) * 100, d.value > 0 ? 4 : 2)}%`, backgroundColor: d.value > 0 ? color : '#e1e0d9' }} />
          <span className="text-[10px] text-slate-500 mt-1 tabular-nums">{d.label}</span>
        </div>
      ))}
    </div>
  );
};

export const DashboardExecutive: React.FC<Props> = ({ routes, liquidatedRoutes, trucks, staff, stats: statsHoy, selectedAgency, historyLimitedDays, onLoadFullHistory, isLoadingFullHistory }) => {
  const now = Date.now();

  // ---------- Filtro de fechas: Hoy · Ayer · Últimos 7 días · Rango (varios días) · Mes ----------
  // "Hoy" según la hora de Guatemala (no la del equipo).
  const hoyD = fromIso(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date())) || sod(new Date());
  const [kind, setKind] = useState<PeriodKind>('hoy');
  const [desde, setDesde] = useState(isoDay(new Date(+hoyD - 6 * 864e5)));
  const [hasta, setHasta] = useState(isoDay(hoyD));
  const [mes, setMes] = useState(isoDay(hoyD).slice(0, 7));
  const periodDays = useMemo(() => {
    let a = hoyD, b = hoyD;
    if (kind === 'ayer') a = b = new Date(+hoyD - 864e5);
    else if (kind === '7d') a = new Date(+hoyD - 6 * 864e5);
    else if (kind === 'rango') {
      const x = fromIso(desde), y = fromIso(hasta);
      if (x && y) [a, b] = x <= y ? [x, y] : [y, x];
    } else if (kind === 'mes') {
      const [yy, mm] = mes.split('-').map(Number);
      if (yy && mm) {
        a = new Date(yy, mm - 1, 1);
        b = new Date(yy, mm, 0);
      }
    }
    const out: Date[] = [];
    for (let d = new Date(a); d <= b && out.length < 400; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) out.push(d);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, desde, hasta, mes]);
  const periodKeys = useMemo(() => new Set(periodDays.map((d) => formatDateToGuatemala(d))), [periodDays]);
  const isHoy = kind === 'hoy';
  const fmtD = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const periodLabel = isHoy
    ? `Hoy ${fmtD(hoyD)}`
    : kind === 'mes' && periodDays.length
    ? `Mes de ${MESES[periodDays[0].getMonth()]} ${periodDays[0].getFullYear()}`
    : periodDays.length === 1
    ? `Día ${fmtD(periodDays[0])}`
    : periodDays.length
    ? `Del ${fmtD(periodDays[0])} al ${fmtD(periodDays[periodDays.length - 1])} (${periodDays.length} días)`
    : 'Periodo sin días';
  const firstDay = periodDays[0];
  const fueraDeHistorial = !!historyLimitedDays && !!firstDay && (+hoyD - +firstDay) / 864e5 > historyLimitedDays;

  // Universo del periodo (la MISMA regla para Hoy, Ayer, 7 días, rango y mes):
  // rutas del tablero + historial cuya FECHA DE RUTA cae en los días elegidos.
  // Antes "Hoy" tomaba todo el tablero (que puede tener rutas de varios días)
  // y las gráficas de tendencia y devoluciones mostraban los últimos 7 días.
  const dayRoutes = useMemo(() => {
    const m = new Map<string, Route>();
    // primero el historial (liquidadas) y luego el tablero, que tiene el estado más reciente
    [...liquidatedRoutes, ...routes].forEach((r) => {
      const k = routeDayKey(r);
      if (k && periodKeys.has(k)) m.set(getRouteKey(r) + '|' + (r.tripNumber || 1) + '|' + (r.liquidacion?.fechaLiquidacion || ''), r);
    });
    return Array.from(m.values());
  }, [routes, liquidatedRoutes, periodKeys]);
  const esLiquidada = (r: Route) => !!r.liquidacion || r.estado === 'Liquidada';
  const liqPeriodo = useMemo(() => dayRoutes.filter(esLiquidada), [dayRoutes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Indicadores del periodo.
  const stats = useMemo(() => {
    const noLiq = dayRoutes.filter((r) => !esLiquidada(r));
    return {
      ...statsHoy,
      pendientes: noLiq.filter((r) => r.estado === 'Pendiente' && !isPiso(r) && !isBolson(r)).length,
      bolson: noLiq.filter(isBolson).length,
      transito: noLiq.filter((r) => r.estado === 'En Tránsito').length,
      abiertas: noLiq.filter((r) => r.estado === 'Abierta').length,
      pisoHoy: noLiq.filter((r) => r.estado === 'Pendiente' && isPiso(r)).length,
      liquidadas: dayRoutes.length - noLiq.length,
      cajasFisicasHoy: dayRoutes.reduce((a, r) => a + cajasPlan(r), 0),
      cajasEntregadasHoy: liqPeriodo.reduce((a, r) => a + Number(r.liquidacion?.cajasEntregadas || 0), 0),
    };
  }, [statsHoy, dayRoutes, liqPeriodo]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- KPIs principales ----------
  const totalPlan = stats.pendientes + (stats.bolson || 0) + stats.transito + stats.abiertas + stats.liquidadas + stats.pisoHoy;
  const cumplimiento = totalPlan > 0 ? stats.liquidadas / totalPlan : 0;
  const cjEnt = liqPeriodo.reduce((a, r) => a + Number(r.liquidacion?.cajasEntregadas || 0), 0);
  const cjDev = liqPeriodo.reduce((a, r) => a + Number(r.liquidacion?.cajasDevueltas || 0), 0);
  const efectividad = cjEnt + cjDev > 0 ? cjEnt / (cjEnt + cjDev) : 1;
  const activas = dayRoutes.filter((r) => !esLiquidada(r));
  const enOperacion = activas.filter((r) => r.estado === 'En Tránsito' || r.estado === 'Abierta').length;
  // Alertas: siempre sobre el tablero ACTUAL (lo que hay que atender ahora),
  // sin importar el periodo elegido.
  const activasTablero = routes.filter((r) => !esLiquidada(r));
  const bolsonCount = activasTablero.filter(isBolson).length;
  const atrasadas = useMemo(
    () => activasTablero.map((r) => ({ r, h: hoursSince(r, now) })).filter((x) => x.h >= 24).sort((a, b) => b.h - a.h),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routes]
  );
  const crit72 = atrasadas.filter((x) => x.h > 72).length;
  const truckActivos = trucks.filter((t) => t.estado !== 'Baja');
  const truckEnRuta = trucks.filter((t) => t.estado === 'En Ruta').length;
  const staffActivos = staff.filter((s) => s.estado !== 'Baja');
  const staffEnRuta = staff.filter((s) => s.estado === 'En Ruta').length;
  const utilFlota = truckActivos.length ? truckEnRuta / truckActivos.length : 0;

  // ---------- Embudo del día ----------
  const despachadas = dayRoutes.filter((r) => r.estado !== 'Pendiente' || !!r.liquidacion).length;
  const funnel = [
    { label: 'Planificadas', value: totalPlan, color: C_INFO },
    { label: 'Despachadas', value: despachadas, color: C_INFO },
    { label: 'Liquidadas', value: stats.liquidadas, color: C_GOOD },
  ];

  // ---------- Tendencia del periodo ----------
  // Un punto por día del periodo (por semana si son más de 31 días). Se cuenta
  // por FECHA DE RUTA, igual que los indicadores, para que los totales cuadren.
  // Con un solo día (Hoy / Ayer) se muestra por agencia.
  const trendDays = periodDays;
  const unDia = trendDays.length <= 1;
  const porSemana = trendDays.length > 31;
  const trend = useMemo(() => {
    const buckets: { key: string; label: string; rutas: number; ent: number; dev: number }[] = [];
    const byDay = new Map<string, (typeof buckets)[number]>();
    trendDays.forEach((d, i) => {
      if (!porSemana || i % 7 === 0) {
        buckets.push({ key: formatDateToGuatemala(d), label: `${porSemana ? 'Sem ' : ''}${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, rutas: 0, ent: 0, dev: 0 });
      }
      byDay.set(formatDateToGuatemala(d), buckets[buckets.length - 1]);
    });
    liqPeriodo.forEach((r) => {
      const b = byDay.get(routeDayKey(r) || '');
      if (!b) return;
      b.rutas += 1;
      b.ent += Number(r.liquidacion?.cajasEntregadas || 0);
      b.dev += Number(r.liquidacion?.cajasDevueltas || 0);
    });
    return buckets;
  }, [liqPeriodo, trendDays, porSemana]);
  const trendEfect = trend.map((d) => {
    const v = d.ent + d.dev > 0 ? (d.ent / (d.ent + d.dev)) * 100 : 0;
    return { key: d.key, label: d.label, value: v, tip: d.ent + d.dev > 0 ? `${d.label}: ${v.toFixed(1)}% efectividad (${n1(d.ent)} ent. / ${n1(d.dev)} dev.)` : `${d.label}: sin liquidaciones` };
  });
  const sem = trend.reduce((a, d) => ({ rutas: a.rutas + d.rutas, ent: a.ent + d.ent, dev: a.dev + d.dev }), { rutas: 0, ent: 0, dev: 0 });
  const tendTxt = unDia ? 'por agencia' : porSemana ? 'por semana' : 'por día';

  // ---------- Por agencia ----------
  const porAgencia = useMemo(() => {
    const m = new Map<string, Route[]>();
    dayRoutes.forEach((r) => {
      const k = r.agencia || 'Sin agencia';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    });
    return Array.from(m.entries())
      .map(([ag, L]) => {
        const liq = L.filter((r) => r.estado === 'Liquidada' || !!r.liquidacion);
        const ent = liq.reduce((a, r) => a + Number(r.liquidacion?.cajasEntregadas || 0), 0);
        const dev = liq.reduce((a, r) => a + Number(r.liquidacion?.cajasDevueltas || 0), 0);
        return {
          ag,
          rutas: L.length,
          liq: liq.length,
          cumpl: L.length ? liq.length / L.length : 0,
          cj: L.reduce((a, r) => a + cajasPlan(r), 0),
          ent,
          efect: ent + dev > 0 ? ent / (ent + dev) : null,
          atras: L.filter((r) => !r.liquidacion && hoursSince(r, now) >= 24).length,
        };
      })
      .sort((a, b) => b.rutas - a.rutas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayRoutes]);

  // ---------- Por segmento (rutas y CJ) ----------
  const porSegmento = useMemo(() => {
    const m = new Map<string, { rutas: number; cj: number }>();
    dayRoutes.forEach((r) => {
      const k = (r.segmento || '').trim().toUpperCase() || 'SIN SEGMENTO';
      const x = m.get(k) || { rutas: 0, cj: 0 };
      x.rutas += 1;
      x.cj += cajasPlan(r);
      m.set(k, x);
    });
    return Array.from(m.entries()).map(([seg, v]) => ({ seg, ...v })).sort((a, b) => b.cj - a.cj);
  }, [dayRoutes]);
  const segTotRutas = porSegmento.reduce((a, s) => a + s.rutas, 0);
  const segTotCj = porSegmento.reduce((a, s) => a + s.cj, 0);

  // ---------- Devoluciones del periodo ----------
  const motivos = useMemo(() => {
    const m = new Map<string, { rutas: number; cajas: number }>();
    liqPeriodo.forEach((r) => {
      const dev = Number(r.liquidacion?.cajasDevueltas || 0);
      if (dev <= 0) return;
      const sel = r.liquidacion?.motivosSeleccionados?.length ? r.liquidacion.motivosSeleccionados : [r.liquidacion?.motivoDevolucion || r.motivoDevolucion || 'Sin motivo registrado'];
      sel.forEach((mo) => {
        const k = String(mo || 'Sin motivo registrado');
        const x = m.get(k) || { rutas: 0, cajas: 0 };
        x.rutas += 1;
        x.cajas += dev / sel.length;
        m.set(k, x);
      });
    });
    return Array.from(m.entries()).map(([motivo, v]) => ({ motivo, ...v })).sort((a, b) => b.cajas - a.cajas);
  }, [liqPeriodo]);
  const motTotCj = motivos.reduce((a, m) => a + m.cajas, 0);
  const motTotRutas = liqPeriodo.filter((r) => Number(r.liquidacion?.cajasDevueltas || 0) > 0).length;

  // ---------- Recursos ----------
  const truckSinMotivo = trucks.filter((t) => t.estado === 'Disponible' && !t.motivoNoAsignado).length;
  const truckConMotivo = trucks.filter((t) => !!t.motivoNoAsignado).length;

  const cumplStatus = cumplimiento >= 0.9 ? { c: C_GOOD, t: 'En meta' } : cumplimiento >= 0.7 ? { c: C_WARN, t: 'En curso' } : { c: C_CRIT, t: 'Bajo' };
  const efStatus = efectividad >= 0.97 ? { c: C_GOOD, t: 'Óptima' } : efectividad >= 0.9 ? { c: C_WARN, t: 'Vigilar' } : { c: C_SERIOUS, t: 'Alta devolución' };

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Dashboard de Despacho</h2>
          <p className="text-xs text-slate-500">
            {periodLabel} · Agencia: <span className="font-semibold text-slate-700">{selectedAgency === 'TODAS' ? 'Todas' : selectedAgency}</span> · {n0(totalPlan)} rutas planificadas
          </p>
        </div>
        <span className="text-[11px] text-slate-400">Se actualiza solo con cada cambio del tablero</span>
      </div>

      {/* Filtro de periodo */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mr-1">Periodo</span>
        <div role="tablist" aria-label="Periodo del dashboard" className="inline-flex flex-wrap gap-1 bg-slate-100 rounded-xl p-1">
          {([
            ['hoy', 'Hoy'],
            ['ayer', 'Ayer'],
            ['7d', 'Últimos 7 días'],
            ['rango', 'Rango de días'],
            ['mes', 'Mes'],
          ] as [PeriodKind, string][]).map(([k, l]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={`min-h-[40px] px-3 rounded-lg text-xs sm:text-sm font-semibold cursor-pointer ${kind === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {l}
            </button>
          ))}
        </div>
        {kind === 'rango' && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1 font-semibold text-slate-600">
              Desde
              <input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} className="min-h-[40px] px-2 border border-slate-300 rounded-lg bg-white" />
            </label>
            <label className="flex items-center gap-1 font-semibold text-slate-600">
              Hasta
              <input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} className="min-h-[40px] px-2 border border-slate-300 rounded-lg bg-white" />
            </label>
          </div>
        )}
        {kind === 'mes' && (
          <label className="flex items-center gap-1 text-xs font-semibold text-slate-600">
            Mes
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="min-h-[40px] px-2 border border-slate-300 rounded-lg bg-white" />
          </label>
        )}
        <span className="text-xs font-semibold text-slate-700 ml-auto">{periodLabel}</span>
        {(
          <p className="basis-full text-[11px] text-slate-500">
            Se analizan las rutas cuya <b>fecha de ruta</b> cae en el periodo (liquidadas y pendientes). Camiones y personal muestran el estado actual.
          </p>
        )}
        {fueraDeHistorial && (
          <div className="basis-full flex flex-wrap items-center gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            ⚠ Solo están cargados los últimos {historyLimitedDays} días del historial; el periodo elegido puede salir incompleto.
            {onLoadFullHistory && (
              <button type="button" onClick={onLoadFullHistory} disabled={isLoadingFullHistory} className="font-bold underline cursor-pointer disabled:opacity-50">
                {isLoadingFullHistory ? 'Cargando historial…' : 'Cargar historial completo'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 1. KPIs principales */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi
          label={isHoy ? 'Cumplimiento del día' : 'Cumplimiento del periodo'}
          value={`${Math.round(cumplimiento * 100)}%`}
          progress={cumplimiento}
          accent={cumplStatus.c}
          status={cumplStatus.t}
          sub={`${n0(stats.liquidadas)} de ${n0(totalPlan)} rutas liquidadas`}
          icon={<Target className="w-4 h-4" />}
        />
        <Kpi
          label="Efectividad de entrega"
          value={cjEnt + cjDev > 0 ? `${(efectividad * 100).toFixed(1)}%` : '—'}
          progress={cjEnt + cjDev > 0 ? efectividad : undefined}
          accent={efStatus.c}
          status={cjEnt + cjDev > 0 ? efStatus.t : undefined}
          sub={`${n1(cjEnt)} CJ entregadas · ${n1(cjDev)} devueltas`}
          icon={<PackageCheck className="w-4 h-4" />}
        />
        <Kpi
          label={isHoy ? 'Cajas del día (CJ)' : 'Cajas del periodo (CJ)'}
          value={n0(stats.cajasFisicasHoy)}
          progress={stats.cajasFisicasHoy > 0 ? Math.min(1, stats.cajasEntregadasHoy / stats.cajasFisicasHoy) : undefined}
          accent={C_INFO}
          sub={`${pctTxt(stats.cajasEntregadasHoy, stats.cajasFisicasHoy)} ya entregadas`}
          icon={<Layers className="w-4 h-4" />}
        />
        <Kpi
          label={isHoy ? 'En operación' : 'Aún en operación'}
          value={n0(enOperacion)}
          accent={C_INFO}
          sub={`${n0(stats.transito)} en tránsito · ${n0(stats.abiertas)} abiertas`}
          icon={<TruckIcon className="w-4 h-4" />}
        />
        <Kpi
          label="Por asignar"
          value={n0(stats.pendientes)}
          accent={C_WARN}
          sub={`${n0(stats.pisoHoy)} a piso${bolsonCount ? ` · ${n0(bolsonCount)} en bolsón` : ''}`}
          icon={<Clock className="w-4 h-4" />}
        />
        <Kpi
          label="Atrasadas +24 h"
          value={n0(atrasadas.length)}
          accent={atrasadas.length ? C_CRIT : C_GOOD}
          status={atrasadas.length ? (crit72 ? `${crit72} > 72 h` : 'Revisar') : 'Al día'}
          sub="Todo el tablero · pasa el cursor para ver cuáles"
          icon={<AlertTriangle className="w-4 h-4" />}
          detalle={
            atrasadas.length === 0 ? (
              <p className="text-xs text-slate-500">No hay rutas con más de 24 h sin entregar ni liquidar. 👍</p>
            ) : (
              <>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                  {n0(atrasadas.length)} ruta(s) con más de 24 h sin entregar ni liquidar
                </p>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 pr-1">
                  {atrasadas.map(({ r, h }) => (
                    <div key={getRouteKey(r) + '|' + (r.tripNumber || 1)} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                      <span className="font-mono font-bold text-slate-800 shrink-0">{r.id}</span>
                      <span className="text-slate-500 truncate flex-1">
                        {r.agencia} · {r.estado}
                        {r.asignacion?.camionPlaca ? ` · ${r.asignacion.camionPlaca}` : ''}
                      </span>
                      <span className="font-bold tabular-nums shrink-0" style={{ color: h > 72 ? C_CRIT : C_SERIOUS }}>
                        {h >= 48 ? `${Math.floor(h / 24)} d ${Math.floor(h % 24)} h` : `${Math.floor(h)} h`}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )
          }
        />
      </div>

      {/* 2. Embudo + recursos: solo cuando se filtra UN día */}
      {unDia && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Avance del día" sub="De lo planificado a lo liquidado" icon={<CheckCircle2 className="w-4 h-4 text-slate-500" />} className="lg:col-span-2">
          <div className="space-y-2.5">
            {funnel.map((f) => (
              <HBar key={f.label} label={f.label} value={f.value} max={Math.max(1, totalPlan)} color={f.color} display={`${n0(f.value)} · ${pctTxt(f.value, totalPlan)}`} />
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 text-center">
            {[
              { l: 'Pendientes', v: stats.pendientes, c: C_WARN },
              { l: 'En tránsito', v: stats.transito, c: C_INFO },
              { l: 'Abiertas', v: stats.abiertas, c: C_SERIOUS },
              { l: 'A piso', v: stats.pisoHoy, c: C_WARN },
            ].map((x) => (
              <div key={x.l} className="rounded-xl border border-slate-200 p-2">
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 font-semibold">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: x.c }} />
                  {x.l}
                </div>
                <div className="text-lg font-black text-slate-900 tabular-nums">{n0(x.v)}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Recursos" sub="Uso de flota y personal ahora" icon={<Users className="w-4 h-4 text-slate-500" />}>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-slate-700">Camiones en ruta</span>
                <span className="font-bold text-slate-900 tabular-nums">{truckEnRuta} / {truckActivos.length}</span>
              </div>
              <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: C_TRACK }}>
                <div className="h-full rounded-full" style={{ width: `${utilFlota * 100}%`, backgroundColor: C_INFO }} />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">{Math.round(utilFlota * 100)}% de la flota activa</p>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-slate-700">Personal en ruta</span>
                <span className="font-bold text-slate-900 tabular-nums">{staffEnRuta} / {staffActivos.length}</span>
              </div>
              <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: C_TRACK }}>
                <div className="h-full rounded-full" style={{ width: `${staffActivos.length ? (staffEnRuta / staffActivos.length) * 100 : 0}%`, backgroundColor: C_INFO }} />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">{pctTxt(staffEnRuta, staffActivos.length)} del personal activo</p>
            </div>
            <div className="text-[11px] text-slate-600 border-t border-slate-100 pt-2 space-y-0.5">
              <div>🚚 {truckConMotivo} camión(es) sin salir con motivo registrado</div>
              {truckSinMotivo > 0 && <div style={{ color: C_SERIOUS }} className="font-semibold">⚠ {truckSinMotivo} disponible(s) sin motivo de no asignación</div>}
            </div>
          </div>
        </Card>
      </div>
      )}

      {/* 3. Efectividad de entrega del periodo */}
      <div className="grid grid-cols-1 gap-4">
        <Card
          title={`Efectividad de entrega · ${tendTxt}`}
          sub={`${isHoy ? 'Hoy' : 'Periodo'}: ${sem.ent + sem.dev > 0 ? ((sem.ent / (sem.ent + sem.dev)) * 100).toFixed(1) + '%' : '—'} (${n1(sem.ent)} CJ entregadas / ${n1(sem.dev)} devueltas)`}
        >
          {unDia ? (
            <div className="space-y-2.5">
              {porAgencia
                .filter((a) => a.efect !== null)
                .map((a) => (
                  <HBar key={a.ag} label={a.ag} value={(a.efect || 0) * 100} max={100} color={C_GOOD} display={`${((a.efect || 0) * 100).toFixed(1)}%`} />
                ))}
              {porAgencia.every((a) => a.efect === null) && <p className="text-xs text-slate-400">Sin liquidaciones {isHoy ? 'hoy' : 'en el día'}.</p>}
            </div>
          ) : (
            <Columns data={trendEfect} color={C_GOOD} fmt={(v) => `${Math.round(v)}%`} maxValue={100} />
          )}
        </Card>
      </div>

      {/* 4. Agencias + segmentos */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <Card title="Desempeño por agencia" sub={periodLabel} icon={<Building2 className="w-4 h-4 text-slate-500" />} className="xl:col-span-3">
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="text-left py-2 px-1">Agencia</th>
                  <th className="text-right py-2 px-1">Rutas</th>
                  <th className="text-left py-2 px-1 w-40">Cumplimiento</th>
                  <th className="text-right py-2 px-1">CJ plan</th>
                  <th className="text-right py-2 px-1">CJ entreg.</th>
                  <th className="text-right py-2 px-1">Efectividad</th>
                  <th className="text-right py-2 px-1">+24 h</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {porAgencia.map((a) => (
                  <tr key={a.ag} className="hover:bg-slate-50">
                    <td className="py-2 px-1 font-semibold text-slate-800 whitespace-nowrap">{a.ag}</td>
                    <td className="py-2 px-1 text-right tabular-nums">{a.rutas}</td>
                    <td className="py-2 px-1">
                      <div className="flex items-center gap-2" title={`${a.liq} de ${a.rutas} liquidadas`}>
                        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: C_TRACK }}>
                          <div className="h-full rounded-full" style={{ width: `${a.cumpl * 100}%`, backgroundColor: a.cumpl >= 0.9 ? C_GOOD : a.cumpl >= 0.7 ? C_WARN : C_INFO }} />
                        </div>
                        <span className="w-9 text-right font-bold tabular-nums">{Math.round(a.cumpl * 100)}%</span>
                      </div>
                    </td>
                    <td className="py-2 px-1 text-right tabular-nums">{n0(a.cj)}</td>
                    <td className="py-2 px-1 text-right tabular-nums">{n0(a.ent)}</td>
                    <td className="py-2 px-1 text-right tabular-nums">{a.efect === null ? '—' : `${(a.efect * 100).toFixed(1)}%`}</td>
                    <td className="py-2 px-1 text-right tabular-nums font-bold" style={{ color: a.atras ? C_CRIT : undefined }}>{a.atras || '—'}</td>
                  </tr>
                ))}
                {porAgencia.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-400">Sin rutas en el periodo.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Por segmento · Rutas y CJ" sub={`${periodLabel} · % sobre el total del filtro`} icon={<Layers className="w-4 h-4 text-slate-500" />} className="xl:col-span-2">
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="text-left py-2 px-1">Segmento</th>
                  <th className="text-right py-2 px-1">Rutas</th>
                  <th className="text-right py-2 px-1">% rutas</th>
                  <th className="text-right py-2 px-1">CJ</th>
                  <th className="text-right py-2 px-1">% CJ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {porSegmento.map((s) => (
                  <tr key={s.seg} className="hover:bg-slate-50">
                    <td className="py-2 px-1 font-semibold text-slate-800">{s.seg}</td>
                    <td className="py-2 px-1 text-right tabular-nums">{n0(s.rutas)}</td>
                    <td className="py-2 px-1 text-right tabular-nums text-slate-500">{pctTxt(s.rutas, segTotRutas)}</td>
                    <td className="py-2 px-1 text-right tabular-nums font-semibold">{n0(s.cj)}</td>
                    <td className="py-2 px-1 text-right tabular-nums font-bold" style={{ color: C_INFO }}>{pctTxt(s.cj, segTotCj)}</td>
                  </tr>
                ))}
                {porSegmento.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">Sin rutas en el periodo.</td>
                  </tr>
                )}
              </tbody>
              {porSegmento.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 font-black text-slate-900">
                    <td className="py-2 px-1">Total</td>
                    <td className="py-2 px-1 text-right tabular-nums">{n0(segTotRutas)}</td>
                    <td className="py-2 px-1 text-right tabular-nums">100%</td>
                    <td className="py-2 px-1 text-right tabular-nums">{n0(segTotCj)}</td>
                    <td className="py-2 px-1 text-right tabular-nums">100%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      </div>

      {/* 5. Motivos de devolución */}
      <Card title="Principales motivos de devolución" sub={`Cajas devueltas · ${periodLabel} · % sobre el total del filtro`} icon={<PackageX className="w-4 h-4 text-slate-500" />}>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="text-left py-2 px-1">Motivo</th>
                <th className="text-right py-2 px-1">Rutas</th>
                <th className="text-right py-2 px-1">CJ devueltas</th>
                <th className="text-right py-2 px-1">% CJ devueltas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {motivos.map((m) => (
                <tr key={m.motivo} className="hover:bg-slate-50">
                  <td className="py-2 px-1 font-semibold text-slate-800">{m.motivo}</td>
                  <td className="py-2 px-1 text-right tabular-nums">{n0(m.rutas)}</td>
                  <td className="py-2 px-1 text-right tabular-nums font-semibold">{n1(m.cajas)}</td>
                  <td className="py-2 px-1 text-right tabular-nums font-bold" style={{ color: C_SERIOUS }}>{pctTxt(m.cajas, motTotCj)}</td>
                </tr>
              ))}
              {motivos.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-500">Sin devoluciones {isHoy ? 'hoy' : 'en el periodo'}. 👍</td>
                </tr>
              )}
            </tbody>
            {motivos.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-black text-slate-900">
                  <td className="py-2 px-1">Total</td>
                  <td className="py-2 px-1 text-right tabular-nums" title="Una ruta con varios motivos cuenta en cada uno">{n0(motTotRutas)}</td>
                  <td className="py-2 px-1 text-right tabular-nums">{n1(motTotCj)}</td>
                  <td className="py-2 px-1 text-right tabular-nums">100%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
};
