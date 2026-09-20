import React, { useMemo, useState } from 'react';
import { Route, Truck, Staff } from '../types';
import { formatDateToGuatemala } from '../utils/date';
import {
  AlertTriangle,
  Truck as TruckIcon,
  PackageX,
  CheckCircle2,
  Layers,
  Target,
} from 'lucide-react';

// Paleta fija de estado (según la guía de visualización de datos del proyecto):
// good = disponible/completado, info = en operación, warning = pendiente de acción,
// serious = requiere atención (devolución), critical = fuera de servicio.
const COLOR_GOOD = '#0ca30c';
const COLOR_INFO = '#2a78d6';
const COLOR_WARNING = '#fab219';
const COLOR_SERIOUS = '#ec835a';
const COLOR_CRITICAL = '#d03b3b';
// Paleta categórica (orden fijo validado) usada solo para el desglose de
// "Viajes por Tipo", donde cada categoría es una identidad, no un estado.
const COLOR_CAT_BLUE = '#2a78d6';
const COLOR_CAT_ORANGE = '#eb6834';
const COLOR_CAT_AQUA = '#1baf7a';
const COLOR_CAT_YELLOW = '#eda100';

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

interface DashboardViewProps {
  // Rutas del día (todos los estados) visibles para el usuario en sesión, respetando
  // la agencia seleccionada en la barra superior y los permisos de agencia del usuario.
  routes: Route[];
  // Rutas activas (no liquidadas) visibles para el usuario SIN aplicar el filtro de
  // agencia seleccionada arriba, para poder mostrar la distribución entre agencias.
  activeRoutesByAgency: Route[];
  // Rutas liquidadas visibles (respeta agencia seleccionada + permisos de agencia).
  liquidatedRoutes: Route[];
  trucks: Truck[];
  staff: Staff[];
  stats: DashboardStats;
  selectedAgency: string;
}

interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
}

const StatTile: React.FC<{
  label: string;
  value: string | number;
  accent: string;
  icon: React.ReactNode;
  sub?: string;
}> = ({ label, value, accent, icon, sub }) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-start gap-3">
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
      style={{ backgroundColor: `${accent}1A`, color: accent }}
    >
      {icon}
    </div>
    <div className="min-w-0">
      <p className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wide truncate">
        {label}
      </p>
      <p className="text-2xl font-bold text-slate-900 leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5 truncate">{sub}</p>}
    </div>
  </div>
);

const StackedBarRow: React.FC<{ title: string; segments: Segment[]; total: number }> = ({
  title,
  segments,
  total,
}) => {
  const [hovered, setHovered] = useState<string | null>(null);
  const visible = segments.filter((s) => s.value > 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-slate-600">{title}</span>
        <span className="text-[11px] text-slate-400 tabular-nums">{total} total</span>
      </div>
      {total === 0 ? (
        <div className="h-6 w-full rounded-lg bg-slate-100" />
      ) : (
        <div className="flex h-6 w-full rounded-lg overflow-hidden bg-slate-100 gap-[2px]">
          {visible.map((s) => {
            const pct = (s.value / total) * 100;
            return (
              <div
                key={s.key}
                tabIndex={0}
                onMouseEnter={() => setHovered(s.key)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(s.key)}
                onBlur={() => setHovered(null)}
                className="relative flex items-center justify-center outline-none"
                style={{ width: `${pct}%`, backgroundColor: s.color }}
              >
                {pct >= 12 && <span className="text-[10px] font-bold text-white">{s.value}</span>}
                {hovered === s.key && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[11px] font-semibold px-2 py-1 rounded-lg whitespace-nowrap z-10 shadow-lg pointer-events-none">
                    {s.label}: {s.value}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const Legend: React.FC<{ items: { label: string; color: string }[] }> = ({ items }) => (
  <div className="flex flex-wrap items-center gap-4">
    {items.map((it) => (
      <div key={it.label} className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: it.color }} />
        <span className="text-[11px] text-slate-500">{it.label}</span>
      </div>
    ))}
  </div>
);

const RankedBar: React.FC<{
  label: string;
  value: number;
  max: number;
  color?: string;
  unit?: string;
  unitPlural?: string;
}> = ({ label, value, max, color = COLOR_INFO, unit = 'ruta', unitPlural }) => {
  const [hover, setHover] = useState(false);
  const pct = max > 0 ? (value / max) * 100 : 0;
  const unitLabel = value === 1 ? unit : unitPlural || `${unit}s`;
  return (
    <div
      className="relative flex items-center gap-2"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      tabIndex={0}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <span className="w-28 shrink-0 text-[11px] text-slate-600 truncate" title={label}>
        {label}
      </span>
      <div className="flex-1 h-4 bg-slate-100 rounded-md overflow-hidden">
        <div
          className="h-full rounded-md"
          style={{ width: `${Math.max(pct, value > 0 ? 3 : 0)}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-7 text-right text-[11px] font-semibold text-slate-700 tabular-nums">
        {value}
      </span>
      {hover && (
        <div className="absolute -top-7 left-28 bg-slate-900 text-white text-[11px] font-semibold px-2 py-1 rounded-lg whitespace-nowrap z-10 shadow-lg pointer-events-none">
          {label}: {value} {unitLabel}
        </div>
      )}
    </div>
  );
};

const TrendColumns: React.FC<{ data: { key: string; label: string; value: number }[] }> = ({
  data,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-2 h-32 px-1">
      {data.map((d, i) => {
        const h = (d.value / max) * 100;
        return (
          <div
            key={d.key}
            className="relative flex-1 flex flex-col items-center justify-end h-full"
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            tabIndex={0}
            onFocus={() => setHoverIdx(i)}
            onBlur={() => setHoverIdx(null)}
          >
            {hoverIdx === i && (
              <div className="absolute -top-7 bg-slate-900 text-white text-[11px] font-semibold px-2 py-1 rounded-lg whitespace-nowrap z-10 shadow-lg pointer-events-none">
                {d.value} liquidada{d.value === 1 ? '' : 's'}
              </div>
            )}
            <span className="text-[10px] font-bold text-slate-600 mb-1 tabular-nums">
              {d.value > 0 ? d.value : ''}
            </span>
            <div
              className="w-full rounded-t-[4px]"
              style={{
                height: `${Math.max(h, d.value > 0 ? 4 : 2)}%`,
                backgroundColor: d.value > 0 ? COLOR_INFO : '#e1e0d9',
              }}
            />
            <span className="text-[10px] text-slate-400 mt-1 tabular-nums">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
};

const Meter: React.FC<{ label: string; value: number; total: number; caption: string }> = ({
  label,
  value,
  total,
  caption,
}) => {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-600">{label}</span>
        <span className="text-sm font-bold text-slate-800 tabular-nums">
          {value.toLocaleString()} / {total.toLocaleString()}
        </span>
      </div>
      <div className="h-3 w-full rounded-full overflow-hidden" style={{ backgroundColor: '#cde2fb' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: COLOR_INFO }}
        />
      </div>
      <p className="text-[11px] text-slate-400 mt-1.5">
        {pct.toFixed(0)}% {caption}
      </p>
    </div>
  );
};

const resourceSegments = (counts: { Disponible: number; 'En Ruta': number; Baja: number }): Segment[] => [
  { key: 'disponible', label: 'Disponible', value: counts.Disponible, color: COLOR_GOOD },
  { key: 'enruta', label: 'En Ruta', value: counts['En Ruta'], color: COLOR_INFO },
  { key: 'baja', label: 'Baja', value: counts.Baja, color: COLOR_CRITICAL },
];

export const DashboardView: React.FC<DashboardViewProps> = ({
  routes,
  activeRoutesByAgency,
  liquidatedRoutes,
  trucks,
  staff,
  stats,
  selectedAgency,
}) => {
  const estadoCounts = useMemo(() => {
    const c = { Pendiente: 0, 'En Tránsito': 0, Abierta: 0, Liquidada: 0 };
    routes.forEach((r) => {
      if (r.estado in c) (c as Record<string, number>)[r.estado] += 1;
    });
    return c;
  }, [routes]);
  const estadoTotal =
    estadoCounts.Pendiente + estadoCounts['En Tránsito'] + estadoCounts.Abierta + estadoCounts.Liquidada;
  const estadoSegments: Segment[] = [
    { key: 'pendiente', label: 'Pendiente', value: estadoCounts.Pendiente, color: COLOR_WARNING },
    { key: 'transito', label: 'En Tránsito', value: estadoCounts['En Tránsito'], color: COLOR_INFO },
    { key: 'abierta', label: 'Abierta (Devolución)', value: estadoCounts.Abierta, color: COLOR_SERIOUS },
    { key: 'liquidada', label: 'Liquidada', value: estadoCounts.Liquidada, color: COLOR_GOOD },
  ];

  const truckCounts = useMemo(() => {
    const c = { Disponible: 0, 'En Ruta': 0, Baja: 0 };
    trucks.forEach((t) => {
      if (t.estado in c) (c as Record<string, number>)[t.estado] += 1;
    });
    return c;
  }, [trucks]);
  const staffCounts = useMemo(() => {
    const c = { Disponible: 0, 'En Ruta': 0, Baja: 0 };
    staff.forEach((s) => {
      if (s.estado in c) (c as Record<string, number>)[s.estado] += 1;
    });
    return c;
  }, [staff]);
  const truckSegments = resourceSegments(truckCounts);
  const staffSegments = resourceSegments(staffCounts);

  const agencyRanking = useMemo(() => {
    const map = new Map<string, number>();
    activeRoutesByAgency.forEach((r) => {
      if (!r.agencia) return;
      map.set(r.agencia, (map.get(r.agencia) || 0) + 1);
    });
    const arr = Array.from(map.entries()).map(([label, value]) => ({ label, value }));
    arr.sort((a, b) => b.value - a.value);
    const top = arr.slice(0, 8);
    const restTotal = arr.slice(8).reduce((acc, x) => acc + x.value, 0);
    if (restTotal > 0) top.push({ label: 'Otras agencias', value: restTotal });
    return top;
  }, [activeRoutesByAgency]);
  const agencyMax = Math.max(1, ...agencyRanking.map((a) => a.value));

  const trend7d = useMemo(() => {
    const days: { key: string; label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push({
        key: formatDateToGuatemala(d),
        label: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
        value: 0,
      });
    }
    const byKey = new Map(days.map((d) => [d.key, d]));
    liquidatedRoutes.forEach((r) => {
      const raw = r.liquidacion?.fechaLiquidacion || r.fechaLiquidacion;
      if (!raw) return;
      const bucket = byKey.get(formatDateToGuatemala(raw));
      if (bucket) bucket.value += 1;
    });
    return days;
  }, [liquidatedRoutes]);

  // Corrección: el Cumplimiento del Dashboard excluía las rutas "En Piso" del
  // denominador, mientras que el mismo cálculo en el reporte de Fin de Día sí
  // las incluye (cuenta el total de rutas planificadas). Esto hacía que ambas
  // pantallas mostraran un % de cumplimiento distinto para el mismo día. Ahora
  // ambos usan el mismo criterio: total de rutas planificadas hoy (incluye Piso).
  const totalRutasHoy =
    stats.pendientes + stats.transito + stats.abiertas + stats.liquidadas + stats.pisoHoy;
  const cumplimiento = totalRutasHoy > 0 ? Math.round((stats.liquidadas / totalRutasHoy) * 100) : 0;

  // Análisis de viajes realizados: cada elemento de liquidatedRoutes representa un
  // viaje/despacho ya completado (incluye recargas y revisitas del mismo ID de ruta),
  // por lo que su conteo total es el total de viajes realizados, no solo de rutas.
  const totalViajes = liquidatedRoutes.length;
  const tripTypeCounts = useMemo(() => {
    const c: Record<string, number> = { 'Primer Viaje': 0, Recarga: 0, Revisita: 0, 'Ruta a Piso': 0 };
    liquidatedRoutes.forEach((r) => {
      const tipo = r.tipoAsignacion || r.asignacion?.tipoAsignacion || 'Primer Viaje';
      if (tipo in c) {
        c[tipo] += 1;
      } else {
        c['Primer Viaje'] += 1;
      }
    });
    return c;
  }, [liquidatedRoutes]);
  const tripTypeSegments: Segment[] = [
    { key: 'primer', label: 'Primer Viaje', value: tripTypeCounts['Primer Viaje'], color: COLOR_CAT_BLUE },
    { key: 'recarga', label: 'Recarga', value: tripTypeCounts.Recarga, color: COLOR_CAT_ORANGE },
    { key: 'revisita', label: 'Revisita', value: tripTypeCounts.Revisita, color: COLOR_CAT_AQUA },
    { key: 'piso', label: 'Ruta a Piso', value: tripTypeCounts['Ruta a Piso'], color: COLOR_CAT_YELLOW },
  ];

  // Recursos que quedaron sin asignar hoy (estado Disponible = no salieron a ruta),
  // agrupados por el motivo que el administrador les registró en "Fin de Asignación".
  // Los que aún no tienen motivo registrado se agrupan aparte para no perderlos de vista.
  const truckUnassignedByReason = useMemo(() => {
    const map = new Map<string, number>();
    let sinMotivo = 0;
    trucks.forEach((t) => {
      if (t.estado !== 'Disponible') return;
      if (t.motivoNoAsignado) {
        map.set(t.motivoNoAsignado, (map.get(t.motivoNoAsignado) || 0) + 1);
      } else {
        sinMotivo += 1;
      }
    });
    const arr = Array.from(map.entries()).map(([label, value]) => ({ label, value }));
    arr.sort((a, b) => b.value - a.value);
    if (sinMotivo > 0) arr.push({ label: 'Sin motivo registrado', value: sinMotivo });
    return arr;
  }, [trucks]);
  const truckUnassignedTotal = truckUnassignedByReason.reduce((acc, r) => acc + r.value, 0);
  const truckReasonMax = Math.max(1, ...truckUnassignedByReason.map((r) => r.value));

  const staffUnassignedByReason = useMemo(() => {
    const map = new Map<string, number>();
    let sinMotivo = 0;
    staff.forEach((s) => {
      if (s.estado !== 'Disponible') return;
      if (s.motivoNoAsignado) {
        map.set(s.motivoNoAsignado, (map.get(s.motivoNoAsignado) || 0) + 1);
      } else {
        sinMotivo += 1;
      }
    });
    const arr = Array.from(map.entries()).map(([label, value]) => ({ label, value }));
    arr.sort((a, b) => b.value - a.value);
    if (sinMotivo > 0) arr.push({ label: 'Sin motivo registrado', value: sinMotivo });
    return arr;
  }, [staff]);
  const staffUnassignedTotal = staffUnassignedByReason.reduce((acc, r) => acc + r.value, 0);
  const staffReasonMax = Math.max(1, ...staffUnassignedByReason.map((r) => r.value));

  // Corrección: types.ts ya anticipaba (comentario original) un desglose de
  // devoluciones por motivo, pero el Dashboard nunca lo mostraba — solo el total de
  // cajas devueltas, sin explicar por qué. Se cuenta por ruta liquidada con
  // devolución real (cajas devueltas o guías rechazadas > 0): se usa el catálogo de
  // motivosSeleccionados cuando existe (una ruta puede tener más de uno), y si no,
  // se usa el motivoDevolucion de texto libre como respaldo para liquidaciones
  // anteriores a que existiera el catálogo.
  const devolucionesByReason = useMemo(() => {
    const map = new Map<string, number>();
    liquidatedRoutes.forEach((r) => {
      const liq = r.liquidacion;
      if (!liq) return;
      const hasDevolucion = (liq.cajasDevueltas || 0) > 0 || (liq.guiasRechazadas || 0) > 0;
      if (!hasDevolucion) return;
      if (liq.motivosSeleccionados && liq.motivosSeleccionados.length > 0) {
        liq.motivosSeleccionados.forEach((m) => map.set(m, (map.get(m) || 0) + 1));
      } else {
        const fallback = liq.motivoDevolucion || r.motivoDevolucion;
        if (fallback) map.set(fallback, (map.get(fallback) || 0) + 1);
      }
    });
    const arr = Array.from(map.entries()).map(([label, value]) => ({ label, value }));
    arr.sort((a, b) => b.value - a.value);
    return arr;
  }, [liquidatedRoutes]);
  const devolucionesTotal = devolucionesByReason.reduce((acc, r) => acc + r.value, 0);
  const devolucionesMax = Math.max(1, ...devolucionesByReason.map((r) => r.value));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Dashboard</h2>
        <p className="text-xs text-slate-400">
          Resumen operativo — {stats.fechaHoy}
          {selectedAgency !== 'TODAS' && (
            <>
              {' '}
              · Agencia: <span className="font-semibold text-slate-500">{selectedAgency}</span>
            </>
          )}
        </p>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatTile
          label="Pendientes"
          value={stats.pendientes}
          accent={COLOR_WARNING}
          icon={<AlertTriangle className="w-4 h-4" />}
        />
        <StatTile
          label="En Tránsito"
          value={stats.transito}
          accent={COLOR_INFO}
          icon={<TruckIcon className="w-4 h-4" />}
        />
        <StatTile
          label="Con Devolución"
          value={stats.abiertas}
          accent={COLOR_SERIOUS}
          icon={<PackageX className="w-4 h-4" />}
        />
        <StatTile
          label="Liquidadas Hoy"
          value={stats.liquidadas}
          accent={COLOR_GOOD}
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <StatTile
          label="Rutas a Piso"
          value={stats.pisoHoy}
          accent="#4a3aa7"
          icon={<Layers className="w-4 h-4" />}
        />
        <StatTile
          label="Cumplimiento del Día"
          value={`${cumplimiento}%`}
          accent="#008300"
          icon={<Target className="w-4 h-4" />}
          sub={`${stats.liquidadas} de ${totalRutasHoy} rutas`}
        />
      </div>

      {/* Cajas del día + liquidadas totales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Meter
          label="Cajas Entregadas Hoy"
          value={stats.cajasEntregadasHoy}
          total={stats.cajasFisicasHoy}
          caption="de las cajas físicas de hoy ya fueron entregadas"
        />
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-center">
          <p className="text-xs font-semibold text-slate-600 mb-1">Rutas Liquidadas (Histórico Visible)</p>
          <p className="text-2xl font-bold text-slate-900">{stats.liquidadasTotal.toLocaleString()}</p>
          <p className="text-[11px] text-slate-400 mt-1">
            Total acumulado dentro del alcance de agencias visible para tu usuario
          </p>
        </div>
      </div>

      {/* Disponibilidad de recursos + estado de rutas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
            Disponibilidad de Recursos
          </p>
          <StackedBarRow title="Camiones" segments={truckSegments} total={trucks.length} />
          <StackedBarRow title="Personal" segments={staffSegments} total={staff.length} />
          <Legend
            items={[
              { label: 'Disponible', color: COLOR_GOOD },
              { label: 'En Ruta', color: COLOR_INFO },
              { label: 'Baja', color: COLOR_CRITICAL },
            ]}
          />
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
            Rutas por Estado (Hoy)
          </p>
          <StackedBarRow title="Rutas" segments={estadoSegments} total={estadoTotal} />
          <Legend items={estadoSegments.map((s) => ({ label: s.label, color: s.color }))} />
        </div>
      </div>

      {/* Rutas por agencia + tendencia de liquidaciones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">
            Rutas Activas por Agencia
          </p>
          {agencyRanking.length === 0 ? (
            <p className="text-xs text-slate-400">No hay rutas activas registradas.</p>
          ) : (
            <div className="space-y-2">
              {agencyRanking.map((a) => (
                <RankedBar key={a.label} label={a.label} value={a.value} max={agencyMax} />
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">
            Liquidaciones — Últimos 7 Días
          </p>
          <TrendColumns data={trend7d} />
        </div>
      </div>

      {/* Análisis de viajes realizados */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">
          Análisis de Viajes Realizados
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-[auto,1fr] gap-6 sm:items-center">
          <div className="text-center sm:text-left shrink-0">
            <p className="text-3xl font-bold text-slate-900 tabular-nums">
              {totalViajes.toLocaleString()}
            </p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-[160px] mx-auto sm:mx-0">
              viajes completados (incluye recargas y revisitas)
            </p>
          </div>
          <div className="w-full space-y-2">
            <StackedBarRow title="Por Tipo de Viaje" segments={tripTypeSegments} total={totalViajes} />
            <Legend items={tripTypeSegments.map((s) => ({ label: s.label, color: s.color }))} />
          </div>
        </div>
      </div>

      {/* Recursos sin asignar por motivo */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">
          Recursos sin Asignar por Motivo
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-600">Camiones</span>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {truckUnassignedTotal} sin asignar
              </span>
            </div>
            {truckUnassignedByReason.length === 0 ? (
              <p className="text-xs text-slate-400">
                No hay camiones disponibles sin asignar registrados hoy.
              </p>
            ) : (
              <div className="space-y-2">
                {truckUnassignedByReason.map((r) => (
                  <RankedBar
                    key={r.label}
                    label={r.label}
                    value={r.value}
                    max={truckReasonMax}
                    color={COLOR_WARNING}
                    unit="camión"
                    unitPlural="camiones"
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-600">Personal</span>
              <span className="text-[11px] text-slate-400 tabular-nums">
                {staffUnassignedTotal} sin asignar
              </span>
            </div>
            {staffUnassignedByReason.length === 0 ? (
              <p className="text-xs text-slate-400">
                No hay personal disponible sin asignar registrado hoy.
              </p>
            ) : (
              <div className="space-y-2">
                {staffUnassignedByReason.map((r) => (
                  <RankedBar
                    key={r.label}
                    label={r.label}
                    value={r.value}
                    max={staffReasonMax}
                    color={COLOR_WARNING}
                    unit="persona"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Devoluciones por Motivo */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
            Devoluciones por Motivo
          </p>
          <span className="text-[11px] text-slate-400 tabular-nums">
            {devolucionesTotal} liquidacion(es) con devolución
          </span>
        </div>
        {devolucionesByReason.length === 0 ? (
          <p className="text-xs text-slate-400">
            No hay devoluciones registradas en las rutas liquidadas del período.
          </p>
        ) : (
          <div className="space-y-2">
            {devolucionesByReason.map((r) => (
              <RankedBar
                key={r.label}
                label={r.label}
                value={r.value}
                max={devolucionesMax}
                color={COLOR_SERIOUS}
                unit="liquidación"
                unitPlural="liquidaciones"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
