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

// --- Dashboard ejecutivo (propuesta nueva) ---
// Solo LEE los datos que ya existen (rutas del tablero, liquidadas, camiones y
// personal); no modifica ni guarda nada. Usa la misma paleta de estado que el
// dashboard clásico: good = completado, info = en operación, warning = pendiente,
// serious = devolución, critical = requiere atención.
const C_GOOD = '#0ca30c';
const C_INFO = '#2a78d6';
const C_WARN = '#fab219';
const C_SERIOUS = '#ec835a';
const C_CRIT = '#d03b3b';
const C_TRACK = '#e8eef5';

interface DashboardStats {
  pendientes: number;
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
}

const n0 = (v: number) => Math.round(v).toLocaleString('es-GT');
const n1 = (v: number) => v.toLocaleString('es-GT', { maximumFractionDigits: 1 });
const pctTxt = (v: number, t: number) => (t > 0 ? `${((v / t) * 100).toFixed(1)}%` : '—');
const liqDateOf = (r: Route) => {
  const raw = r.liquidacion?.fechaLiquidacion || r.fechaLiquidacion;
  return raw ? formatDateToGuatemala(raw) : null;
};
const isPiso = (r: Route) => !!(r.aPiso || r.tipoAsignacion === 'Ruta a Piso' || r.asignacion?.tipoAsignacion === 'Ruta a Piso');
const isBolson = (r: Route) => !!(r.esBolson || r.tipoAsignacion === 'Ruta Bolsón');
const hoursSince = (r: Route, now: number) => {
  const d = parseFlexibleDate(r.fechaOriginalRuta || r.fecha || '');
  return d && !isNaN(d.getTime()) ? Math.max(0, (now - d.getTime()) / 36e5) : 0;
};
const cajasPlan = (r: Route) => Number(r.cajasOriginales || r.cajasFisicas || 0);

// ---------- piezas visuales ----------
const Card: React.FC<{ title: string; sub?: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
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

const Kpi: React.FC<{
  label: string;
  value: string;
  sub: string;
  accent: string;
  icon: React.ReactNode;
  progress?: number; // 0..1
  status?: string;
}> = ({ label, value, sub, accent, icon, progress, status }) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-2 min-w-0">
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
const HBar: React.FC<{ label: string; value: number; max: number; color: string; display?: string; tip?: string }> = ({
  label,
  value,
  max,
  color,
  display,
  tip,
}) => (
  <div className="flex items-center gap-3 group" title={tip || `${label}: ${display ?? n0(value)}`}>
    <span className="w-32 sm:w-40 shrink-0 text-xs text-slate-700 truncate">{label}</span>
    <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ backgroundColor: C_TRACK }}>
      <div className="h-full rounded-full transition-all group-hover:opacity-80" style={{ width: `${max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0}%`, backgroundColor: color }} />
    </div>
    <span className="w-20 text-right text-xs font-bold text-slate-800 tabular-nums">{display ?? n0(value)}</span>
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

export const DashboardExecutive: React.FC<Props> = ({ routes, liquidatedRoutes, trucks, staff, stats, selectedAgency }) => {
  const now = Date.now();
  const today = formatDateToGuatemala(new Date());
  const opDate = stats.fechaHoy || today;

  // Universo del día: rutas del tablero + liquidadas hoy (sin repetir).
  const liqHoy = useMemo(
    () => liquidatedRoutes.filter((r) => {
      const d = liqDateOf(r);
      return d === today || d === opDate;
    }),
    [liquidatedRoutes, today, opDate]
  );
  const dayRoutes = useMemo(() => {
    const m = new Map<string, Route>();
    routes.forEach((r) => m.set(getRouteKey(r), r));
    liqHoy.forEach((r) => {
      const k = getRouteKey(r);
      if (!m.has(k)) m.set(k, r);
    });
    return Array.from(m.values());
  }, [routes, liqHoy]);

  // ---------- KPIs principales ----------
  const totalPlan = stats.pendientes + stats.transito + stats.abiertas + stats.liquidadas + stats.pisoHoy;
  const cumplimiento = totalPlan > 0 ? stats.liquidadas / totalPlan : 0;
  const cjEnt = liqHoy.reduce((a, r) => a + Number(r.liquidacion?.cajasEntregadas || 0), 0);
  const cjDev = liqHoy.reduce((a, r) => a + Number(r.liquidacion?.cajasDevueltas || 0), 0);
  const efectividad = cjEnt + cjDev > 0 ? cjEnt / (cjEnt + cjDev) : 1;
  const activas = routes.filter((r) => r.estado !== 'Liquidada');
  const enOperacion = activas.filter((r) => r.estado === 'En Tránsito' || r.estado === 'Abierta').length;
  const bolsonCount = activas.filter(isBolson).length;
  const atrasadas = useMemo(
    () => activas.map((r) => ({ r, h: hoursSince(r, now) })).filter((x) => x.h >= 24).sort((a, b) => b.h - a.h),
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
  const despachadas = dayRoutes.filter((r) => r.estado !== 'Pendiente').length;
  const funnel = [
    { label: 'Planificadas', value: totalPlan, color: C_INFO },
    { label: 'Despachadas', value: despachadas, color: C_INFO },
    { label: 'Liquidadas', value: stats.liquidadas, color: C_GOOD },
  ];

  // ---------- Tendencia 7 días ----------
  const trend = useMemo(() => {
    const days: { key: string; label: string; rutas: number; ent: number; dev: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({ key: formatDateToGuatemala(d), label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, rutas: 0, ent: 0, dev: 0 });
    }
    const by = new Map(days.map((d) => [d.key, d]));
    liquidatedRoutes.forEach((r) => {
      const b = by.get(liqDateOf(r) || '');
      if (!b) return;
      b.rutas += 1;
      b.ent += Number(r.liquidacion?.cajasEntregadas || 0);
      b.dev += Number(r.liquidacion?.cajasDevueltas || 0);
    });
    return days;
  }, [liquidatedRoutes]);
  const trendRutas = trend.map((d) => ({ key: d.key, label: d.label, value: d.rutas, tip: `${d.label}: ${d.rutas} ruta${d.rutas !== 1 ? 's' : ''} liquidada${d.rutas !== 1 ? 's' : ''}` }));
  const trendEfect = trend.map((d) => {
    const v = d.ent + d.dev > 0 ? (d.ent / (d.ent + d.dev)) * 100 : 0;
    return { key: d.key, label: d.label, value: v, tip: d.ent + d.dev > 0 ? `${d.label}: ${v.toFixed(1)}% efectividad (${n1(d.ent)} ent. / ${n1(d.dev)} dev.)` : `${d.label}: sin liquidaciones` };
  });
  const sem = trend.reduce((a, d) => ({ rutas: a.rutas + d.rutas, ent: a.ent + d.ent, dev: a.dev + d.dev }), { rutas: 0, ent: 0, dev: 0 });

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
  const segMaxCj = Math.max(1, ...porSegmento.map((s) => s.cj));

  // ---------- Devoluciones (últimos 7 días) ----------
  const motivos = useMemo(() => {
    const keys = new Set(trend.map((d) => d.key));
    const m = new Map<string, { rutas: number; cajas: number }>();
    liquidatedRoutes.forEach((r) => {
      if (!keys.has(liqDateOf(r) || '')) return;
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
    return Array.from(m.entries()).map(([motivo, v]) => ({ motivo, ...v })).sort((a, b) => b.cajas - a.cajas).slice(0, 6);
  }, [liquidatedRoutes, trend]);
  const motMax = Math.max(1, ...motivos.map((m) => m.cajas));

  // ---------- Alertas ----------
  const cajasAbiertas = liquidatedRoutes.filter((r) => r.liquidacion?.cajaAbierta && !r.liquidacion?.cajaAbiertaResuelta).length;
  const truckSinMotivo = trucks.filter((t) => t.estado === 'Disponible' && !t.motivoNoAsignado).length;
  const truckConMotivo = trucks.filter((t) => !!t.motivoNoAsignado).length;

  const cumplStatus = cumplimiento >= 0.9 ? { c: C_GOOD, t: 'En meta' } : cumplimiento >= 0.7 ? { c: C_WARN, t: 'En curso' } : { c: C_CRIT, t: 'Bajo' };
  const efStatus = efectividad >= 0.97 ? { c: C_GOOD, t: 'Óptima' } : efectividad >= 0.9 ? { c: C_WARN, t: 'Vigilar' } : { c: C_SERIOUS, t: 'Alta devolución' };

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Dashboard ejecutivo</h2>
          <p className="text-xs text-slate-500">
            Jornada {opDate} · Agencia: <span className="font-semibold text-slate-700">{selectedAgency === 'TODAS' ? 'Todas' : selectedAgency}</span> · {n0(totalPlan)} rutas planificadas
          </p>
        </div>
        <span className="text-[11px] text-slate-400">Se actualiza solo con cada cambio del tablero</span>
      </div>

      {/* 1. KPIs principales */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi
          label="Cumplimiento del día"
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
          label="Cajas del día (CJ)"
          value={n0(stats.cajasFisicasHoy)}
          progress={stats.cajasFisicasHoy > 0 ? Math.min(1, stats.cajasEntregadasHoy / stats.cajasFisicasHoy) : undefined}
          accent={C_INFO}
          sub={`${pctTxt(stats.cajasEntregadasHoy, stats.cajasFisicasHoy)} ya entregadas`}
          icon={<Layers className="w-4 h-4" />}
        />
        <Kpi
          label="En operación"
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
          sub="Rutas sin liquidar desde su fecha"
          icon={<AlertTriangle className="w-4 h-4" />}
        />
      </div>

      {/* 2. Embudo + recursos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Avance de la jornada" sub="De lo planificado a lo liquidado" icon={<CheckCircle2 className="w-4 h-4 text-slate-500" />} className="lg:col-span-2">
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

      {/* 3. Tendencia 7 días (dos gráficos, una medida cada uno) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Rutas liquidadas · últimos 7 días" sub={`${n0(sem.rutas)} rutas en la semana · promedio ${n1(sem.rutas / 7)} por día`}>
          <Columns data={trendRutas} color={C_INFO} />
        </Card>
        <Card
          title="Efectividad de entrega · últimos 7 días"
          sub={`Semana: ${sem.ent + sem.dev > 0 ? ((sem.ent / (sem.ent + sem.dev)) * 100).toFixed(1) + '%' : '—'} (${n1(sem.ent)} CJ entregadas / ${n1(sem.dev)} devueltas)`}
        >
          <Columns data={trendEfect} color={C_GOOD} fmt={(v) => `${Math.round(v)}%`} maxValue={100} />
        </Card>
      </div>

      {/* 4. Agencias + segmentos */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <Card title="Desempeño por agencia" sub="Jornada actual" icon={<Building2 className="w-4 h-4 text-slate-500" />} className="xl:col-span-3">
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
                    <td colSpan={7} className="py-6 text-center text-slate-400">Sin rutas en la jornada.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Por segmento · Rutas y CJ" sub={`${n0(segTotRutas)} rutas · ${n0(segTotCj)} CJ`} icon={<Layers className="w-4 h-4 text-slate-500" />} className="xl:col-span-2">
          <div className="space-y-2.5">
            {porSegmento.map((s) => (
              <HBar
                key={s.seg}
                label={s.seg}
                value={s.cj}
                max={segMaxCj}
                color={C_INFO}
                display={`${n0(s.cj)} CJ`}
                tip={`${s.seg}: ${s.rutas} rutas (${pctTxt(s.rutas, segTotRutas)}) · ${n0(s.cj)} CJ (${pctTxt(s.cj, segTotCj)})`}
              />
            ))}
            {porSegmento.length === 0 && <p className="text-xs text-slate-400">Sin datos.</p>}
          </div>
          {porSegmento.length > 0 && (
            <p className="text-[11px] text-slate-500 mt-3">
              Mayor volumen: <b className="text-slate-700">{porSegmento[0].seg}</b> con {pctTxt(porSegmento[0].cj, segTotCj)} de las cajas y {porSegmento[0].rutas} rutas.
            </p>
          )}
        </Card>
      </div>

      {/* 5. Devoluciones + alertas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Principales motivos de devolución" sub="Cajas devueltas, últimos 7 días" icon={<PackageX className="w-4 h-4 text-slate-500" />}>
          <div className="space-y-2.5">
            {motivos.map((m) => (
              <HBar key={m.motivo} label={m.motivo} value={m.cajas} max={motMax} color={C_SERIOUS} display={`${n1(m.cajas)} CJ`} tip={`${m.motivo}: ${n1(m.cajas)} CJ en ${m.rutas} ruta(s)`} />
            ))}
            {motivos.length === 0 && <p className="text-xs text-slate-500">Sin devoluciones en los últimos 7 días. 👍</p>}
          </div>
        </Card>
        <Card title="Alertas para atender" sub="Lo que requiere acción hoy" icon={<AlertTriangle className="w-4 h-4" style={{ color: C_CRIT }} />}>
          <ul className="space-y-2 text-xs">
            <li className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2">
              <span className="text-slate-700">Rutas sin liquidar con más de 72 h</span>
              <b className="tabular-nums" style={{ color: crit72 ? C_CRIT : C_GOOD }}>{crit72}</b>
            </li>
            <li className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2">
              <span className="text-slate-700">Cajas abiertas pendientes de validar</span>
              <b className="tabular-nums" style={{ color: cajasAbiertas ? C_WARN : C_GOOD }}>{cajasAbiertas}</b>
            </li>
            <li className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2">
              <span className="text-slate-700">Rutas en bolsón por liquidar</span>
              <b className="tabular-nums" style={{ color: bolsonCount ? C_WARN : C_GOOD }}>{bolsonCount}</b>
            </li>
          </ul>
          {atrasadas.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Más antiguas sin liquidar</p>
              <div className="divide-y divide-slate-100">
                {atrasadas.slice(0, 5).map(({ r, h }) => (
                  <div key={getRouteKey(r)} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                    <span className="font-mono font-bold text-slate-800">{r.id}</span>
                    <span className="text-slate-500 truncate flex-1">{r.agencia} · {r.estado}</span>
                    <span className="font-bold tabular-nums" style={{ color: h > 72 ? C_CRIT : C_SERIOUS }}>{Math.floor(h)} h</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
