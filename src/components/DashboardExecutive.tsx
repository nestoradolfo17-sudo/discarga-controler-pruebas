import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { DashboardDevoluciones } from './DashboardDevoluciones';
import type { ReportePdf } from '../utils/dashboardPdf';

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
  // Nombre del filtro cuando no es una sola agencia ("Todas" o "Xela, Escuintla").
  etiquetaTodas?: string;
  // Si solo se cargaron los últimos N días del historial (ver App.tsx).
  historyLimitedDays?: number;
  onLoadFullHistory?: () => void;
  isLoadingFullHistory?: boolean;
  // PDF del dashboard: entrega cómo armar el reporte con los datos que se ven.
  registrarReporte?: (armar: () => ReportePdf) => void;
  // 'despacho' = cómo arranca y sale el día (planificado, asignado, por asignar).
  // 'liquidacion' = cómo se cerraron las rutas (cumplimiento, entregas, devoluciones).
  modo?: 'despacho' | 'liquidacion';
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

// ---------- Detalle de un motivo de devolución (al pasar el cursor) ----------
interface DetalleMotivo {
  r: Route;
  cajas: number; // CJ devueltas atribuidas a este motivo
  devRuta: number; // CJ devueltas totales de la ruta
  pctDev: number; // % de devolución de la ruta
  compartido: boolean; // la ruta tiene varios motivos (sus CJ se reparten)
  clientes: { codigo: string; nombre: string; motivo: string; cajas?: number }[];
}

// ---------- Piezas del tablero de Despacho ----------
// Paleta del tablero de Despacho: tonos sobrios alineados al azul DISCARGA.
// Validada para daltonismo (ΔE ≥ 8 entre colores vecinos del anillo); como
// amarillo y naranja tienen poco contraste, siempre van con su leyenda y número.
export const PD = {
  azul: '#2f5fb8',
  marino: '#2C3790',
  cielo: '#5AACE4',
  cieloSuave: '#c9dcf2',
  verde: '#1a9e76',
  naranja: '#e5793b',
  violeta: '#8a63cf',
  oro: '#d9a521',
  oroTexto: '#9a6f00',
  rojo: '#c84448',
  pista: '#eef2f7',
};

// Anillo (dona) con 2 px de separación entre tramos y el total al centro.
// Con `onActivo` el tramo bajo el cursor se resalta y avisa cuál es (para
// mostrar su detalle al centro y en la tabla).
const Dona: React.FC<{
  segs: { label: string; value: number; color: string }[];
  size?: number;
  grosor?: number;
  centro: React.ReactNode;
  unidad?: string;
  activo?: string | null;
  onActivo?: (label: string | null) => void;
}> = ({ segs, size = 168, grosor = 22, centro, unidad = '', activo = null, onActivo }) => {
  const total = segs.reduce((a, s) => a + s.value, 0);
  const r = (size - grosor - 8) / 2;
  const circ = 2 * Math.PI * r;
  const vis = segs.filter((s) => s.value > 0);
  const gap = vis.length > 1 ? 2 : 0;
  let acum = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={segs.map((s) => `${s.label} ${n0(s.value)}`).join(', ')}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={PD.pista} strokeWidth={grosor} />
        {total > 0 &&
          vis.map((s) => {
            const largo = (s.value / total) * circ;
            const dash = Math.max(0.5, largo - gap);
            const offset = -acum;
            acum += largo;
            return (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={activo === s.label ? grosor + 7 : grosor}
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ opacity: activo && activo !== s.label ? 0.4 : 1, transition: 'opacity .15s, stroke-width .15s', cursor: onActivo ? 'pointer' : undefined }}
                onMouseEnter={onActivo ? () => onActivo(s.label) : undefined}
                onMouseLeave={onActivo ? () => onActivo(null) : undefined}
                onClick={onActivo ? () => onActivo(activo === s.label ? null : s.label) : undefined}
              >
                {!onActivo && <title>{`${s.label}: ${n0(s.value)}${unidad} (${pctTxt(s.value, total)})`}</title>}
              </circle>
            );
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">{centro}</div>
    </div>
  );
};
// Fila de avance: la pista es lo planificado y el relleno lo despachado.
const AvanceFila: React.FC<{ label: string; sub?: string; plan: number; hecho: number; maxPlan: number; color?: string; nativo?: boolean }> = ({ label, sub, plan, hecho, maxPlan, color = PD.azul, nativo = true }) => {
  const anchoPista = maxPlan > 0 ? Math.max(6, (plan / maxPlan) * 100) : 0;
  const p = plan > 0 ? hecho / plan : 0;
  return (
    <div className="grid items-center gap-3 py-1.5" style={{ gridTemplateColumns: 'minmax(0, 11rem) 1fr auto' }} title={nativo ? `${label}: ${n0(hecho)} de ${n0(plan)} CJ despachadas (${pctTxt(hecho, plan)})` : undefined}>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-slate-800 truncate">{label}</div>
        {sub && <div className="text-[10.5px] text-slate-400 truncate">{sub}</div>}
      </div>
      <div className="h-3" style={{ width: `${anchoPista}%` }}>
        <div className="h-full w-full rounded-full overflow-hidden" style={{ backgroundColor: PD.pista }}>
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, p * 100)}%`, backgroundColor: color }} />
        </div>
      </div>
      <div className="text-right tabular-nums whitespace-nowrap">
        <span className="text-xs font-bold text-slate-900">{n0(plan)}</span>
        <span className="ml-1.5 text-[11px] font-semibold" style={{ color: p >= 0.9 ? PD.verde : p >= 0.6 ? PD.azul : PD.oroTexto }}>{Math.round(p * 100)}%</span>
      </div>
    </div>
  );
};

// Anillo de avance para el encabezado.
const Anillo: React.FC<{ p: number; size?: number }> = ({ p, size = 84 }) => {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(p * 100)}% despachado`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="8" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={PD.cielo}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${c * Math.min(1, Math.max(0, p))} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="800">
        {Math.round(p * 100)}%
      </text>
    </svg>
  );
};

// ---------- Detalle al pasar el cursor (o al tocar en tablet/celular) ----------
type Lineas = [string, string][];
const TipBox: React.FC<{ titulo: string; lineas: Lineas; className?: string; style?: React.CSSProperties }> = ({ titulo, lineas, className = '', style }) => (
  <div
    data-no-pdf
    role="tooltip"
    className={`absolute z-40 w-max min-w-[12.5rem] max-w-[min(20rem,85vw)] bg-slate-900 text-white rounded-xl shadow-xl px-3 py-2.5 text-[11.5px] leading-relaxed pointer-events-none text-left font-normal ${className}`}
    style={style}
  >
    <div className="font-bold text-[12px] mb-1">{titulo}</div>
    {lineas.map(([k, v], i) => (
      <div key={`${k}${i}`} className="flex justify-between gap-4">
        <span className="text-slate-300">{k}</span>
        <span className="font-semibold tabular-nums text-right">{v}</span>
      </div>
    ))}
  </div>
);
const POS_TIP = {
  abajo: { izq: 'top-full mt-1.5 left-0', der: 'top-full mt-1.5 right-0', centro: 'top-full mt-1.5 left-1/2 -translate-x-1/2' },
  arriba: { izq: 'bottom-full mb-1.5 left-0', der: 'bottom-full mb-1.5 right-0', centro: 'bottom-full mb-1.5 left-1/2 -translate-x-1/2' },
};
const ConTip: React.FC<{
  titulo: string;
  lineas: Lineas;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  lado?: 'abajo' | 'arriba';
  alinear?: 'izq' | 'der' | 'centro';
}> = ({ titulo, lineas, children, className = '', style, lado = 'abajo', alinear = 'izq' }) => {
  const [ver, setVer] = useState(false);
  return (
    <div
      className={`relative outline-none ${className}`}
      style={style}
      tabIndex={0}
      onMouseEnter={() => setVer(true)}
      onMouseLeave={() => setVer(false)}
      onFocus={() => setVer(true)}
      onBlur={() => setVer(false)}
    >
      {children}
      {ver && <TipBox titulo={titulo} lineas={lineas} className={POS_TIP[lado][alinear]} />}
    </div>
  );
};

// Mini tendencia para las tarjetas.
const Spark: React.FC<{ valores: number[]; color: string }> = ({ valores, color }) => {
  if (valores.length < 2) return null;
  const max = Math.max(1, ...valores);
  const pts = valores.map((v, i) => `${((i / (valores.length - 1)) * 100).toFixed(1)},${(30 - (v / max) * 28).toFixed(1)}`);
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="w-20 sm:w-24 h-8 shrink-0 overflow-visible" aria-hidden="true">
      <polygon points={`0,32 ${pts.join(' ')} 100,32`} fill={color} opacity="0.12" />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
};

// Columnas (rutas asignadas por hora) + líneas de % acumulado (periodo y comparación).
type BarraHora = { key: string; label: string; n: number; pct: number | null; prevPct: number | null; titulo: string; lineas: Lineas };
const ComboHoras: React.FC<{ data: BarraHora[]; nombrePrev: string; color?: string }> = ({ data, nombrePrev, color = PD.azul }) => {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.n));
  const N = data.length;
  const X = (i: number) => ((i + 0.5) / N) * 100;
  const Y = (p: number) => 100 - Math.min(100, Math.max(0, p));
  const linea = (k: 'pct' | 'prevPct') =>
    data
      .map((d, i) => (d[k] == null ? null : `${X(i).toFixed(2)},${Y(d[k] as number).toFixed(2)}`))
      .filter(Boolean)
      .join(' ');
  const lHoy = linea('pct');
  const lPrev = linea('prevPct');
  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 mb-2">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: color }} />Rutas asignadas en la hora</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-[3px] rounded" style={{ backgroundColor: PD.marino }} />% acumulado del periodo</span>
        {lPrev && <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed" style={{ borderColor: PD.cielo }} />{nombrePrev}</span>}
      </div>
      <div className="relative h-48 pr-9">
        <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-between text-[10px] text-slate-400 tabular-nums">
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>
        <div className="relative h-full border-b border-slate-200">
          <div className="absolute inset-x-0 top-0 border-t border-dashed border-slate-100" />
          <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-100" />
          <div className="absolute inset-0 flex items-end">
            {data.map((d, i) => (
              <div
                key={d.key}
                className={`relative flex-1 h-full flex flex-col items-center justify-end rounded-md cursor-default outline-none ${hover === i ? 'bg-slate-50' : ''}`}
                tabIndex={0}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              >
                <span className="text-[10px] font-bold text-slate-600 mb-0.5 tabular-nums">{d.n > 0 ? n0(d.n) : ''}</span>
                <div className="w-[58%] rounded-t-[4px]" style={{ height: `${d.n > 0 ? Math.max(3, (d.n / max) * 78) : 0}%`, backgroundColor: hover === i ? PD.marino : color }} />
                {hover === i && (
                  <TipBox
                    titulo={d.titulo}
                    lineas={d.lineas}
                    className={`top-0 ${i < 2 ? 'left-0' : i > N - 3 ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}
                  />
                )}
              </div>
            ))}
          </div>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" aria-hidden="true">
            {lPrev && <polyline points={lPrev} fill="none" stroke={PD.cielo} strokeWidth="2.25" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
            {lHoy && <polyline points={lHoy} fill="none" stroke={PD.marino} strokeWidth="2.75" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
          </svg>
        </div>
      </div>
      <div className="flex pr-9 mt-1">
        {data.map((d) => (
          <span key={d.key} className="flex-1 text-center text-[10px] text-slate-500 tabular-nums truncate">{d.label}</span>
        ))}
      </div>
    </div>
  );
};

// Columnas apiladas por día: despachadas (abajo) y pendientes (arriba).
type ColDia = { key: string; label: string; total: number; hecho: number; titulo: string; lineas: Lineas; porAsig?: number };
const ColApiladas: React.FC<{ data: ColDia[]; fmt?: (v: number) => string }> = ({ data, fmt = n0 }) => {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.total));
  const N = data.length;
  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 mb-2">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: PD.azul }} />Despachadas</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: '#f1d58c' }} />Por despachar</span>
      </div>
      <div className="flex items-end gap-1 h-48 border-b border-slate-200">
        {data.map((d, i) => (
          <div
            key={d.key}
            className={`relative flex-1 min-w-0 h-full flex flex-col items-center justify-end rounded-md cursor-default outline-none ${hover === i ? 'bg-slate-50' : ''}`}
            tabIndex={0}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          >
            <span className="text-[9.5px] font-bold text-slate-600 mb-0.5 tabular-nums">{d.total > 0 && N <= 16 ? fmt(d.total) : ''}</span>
            <div className="w-[64%] rounded-t-[4px]" style={{ height: `${(Math.max(0, d.total - d.hecho) / max) * 82}%`, backgroundColor: '#f1d58c' }} />
            <div className={`w-[64%] ${d.total - d.hecho > 0 ? '' : 'rounded-t-[4px]'}`} style={{ height: `${(d.hecho / max) * 82}%`, backgroundColor: hover === i ? PD.marino : PD.azul }} />
            {hover === i && <TipBox titulo={d.titulo} lineas={d.lineas} className={`top-0 ${i < 2 ? 'left-0' : i > N - 3 ? 'right-0' : 'left-1/2 -translate-x-1/2'}`} />}
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-1">
        {data.map((d, i) => (
          <span key={d.key} className="flex-1 min-w-0 text-center text-[10px] text-slate-500 tabular-nums truncate">{N > 16 && i % 2 ? '' : d.label}</span>
        ))}
      </div>
    </div>
  );
};

// Barra apilada: despachado + pendiente; el largo total es lo planificado.
const ApiladaFila: React.FC<{ label: string; sub?: string; plan: number; hecho: number; maxPlan: number; fmt?: (v: number) => string; titulo: string; lineas: Lineas; punto?: string }> = ({
  label,
  punto,
  sub,
  plan,
  hecho,
  maxPlan,
  fmt = n0,
  titulo,
  lineas,
}) => {
  const p = plan > 0 ? hecho / plan : 0;
  const ancho = maxPlan > 0 ? Math.max(4, (plan / maxPlan) * 100) : 0;
  return (
    <ConTip titulo={titulo} lineas={lineas} className="rounded-lg hover:bg-slate-50 focus:bg-slate-50 px-1 -mx-1">
      <div className="grid items-center gap-3 py-1.5" style={{ gridTemplateColumns: 'minmax(0, 11rem) 1fr auto' }}>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-800 truncate flex items-center gap-1.5">
            {punto && <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ backgroundColor: punto }} />}
            <span className="truncate">{label}</span>
          </div>
          {sub && <div className="text-[10.5px] text-slate-400 truncate">{sub}</div>}
        </div>
        <div className="h-3 flex rounded-full overflow-hidden" style={{ width: `${ancho}%`, backgroundColor: PD.pista }}>
          <div className="h-full" style={{ width: `${Math.min(100, p * 100)}%`, backgroundColor: PD.azul }} />
          <div className="h-full" style={{ width: `${Math.max(0, 100 - p * 100)}%`, backgroundColor: '#f1d58c' }} />
        </div>
        <div className="text-right tabular-nums whitespace-nowrap">
          <span className="text-xs font-bold text-slate-900">{fmt(plan)}</span>
          <span className="ml-1.5 text-[11px] font-semibold" style={{ color: p >= 0.9 ? PD.verde : p >= 0.6 ? PD.azul : PD.oroTexto }}>{Math.round(p * 100)}%</span>
        </div>
      </div>
    </ConTip>
  );
};

// Fecha y hora de un texto ("dd/mm/aaaa hh:mm", "aaaa-mm-dd hh:mm" o ISO con
// zona) en minutos, en hora de Guatemala. Sin hora = medianoche.
const minutosDe = (s: string): number | null => {
  const t = String(s || '').trim();
  if (!t) return null;
  if (/T\d{2}:\d{2}.*(Z|[+-]\d{2}:?\d{2})$/.test(t)) {
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 60000) - 360; // Guatemala = UTC-6, sin horario de verano
  }
  let y = 0, mo = 0, da = 0;
  const a = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(t);
  const b = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (a) [da, mo, y] = [Number(a[1]), Number(a[2]), Number(a[3])];
  else if (b) [y, mo, da] = [Number(b[1]), Number(b[2]), Number(b[3])];
  else return null;
  const h = /(?:\s|T|,)(\d{1,2}):(\d{2})/.exec(t);
  return Math.floor(Date.UTC(y, mo - 1, da, h ? Number(h[1]) : 0, h ? Number(h[2]) : 0) / 60000);
};
const textoAsignacion = (r: Route) => String(r.fechaAsignacion || r.asignacion?.fechaAsignacion || r.ultimoDespacho?.fechaAsignacion || '');
// Minutos desde el inicio del día de la ruta hasta que se le asignó camión
// (negativo = se asignó el día anterior). Null si no hay hora registrada.
const minutosAsignacion = (r: Route): number | null => {
  const txt = textoAsignacion(r);
  if (!/\d{1,2}:\d{2}/.test(txt)) return null;
  const a = minutosDe(txt);
  const d = minutosDe(routeDayKey(r) || '');
  return a == null || d == null ? null : a - d;
};
const etiquetaHora = (h: number) => (h < 0 ? 'Día ant.' : h >= 24 ? 'Día sig.' : `${String(h).padStart(2, '0')}:00`);

const top3 = (pares: Map<string, number>) =>
  Array.from(pares.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

const DetalleMotivoPanel: React.FC<{ motivo: string; cajas: number; detalle: DetalleMotivo[] }> = ({ motivo, cajas, detalle }) => {
  const porAgencia = new Map<string, number>();
  const porPiloto = new Map<string, number>();
  const porSegmento = new Map<string, number>();
  detalle.forEach((d) => {
    porAgencia.set(d.r.agencia || 'Sin agencia', (porAgencia.get(d.r.agencia || 'Sin agencia') || 0) + d.cajas);
    const p = d.r.asignacion?.conductor;
    if (p) porPiloto.set(p, (porPiloto.get(p) || 0) + 1);
    const sg = (d.r.segmento || '').trim().toUpperCase() || 'SIN SEGMENTO';
    porSegmento.set(sg, (porSegmento.get(sg) || 0) + d.cajas);
  });
  const clientes = detalle.flatMap((d) => d.clientes.map((c) => ({ ...c, ruta: d.r.id })));
  const pilotosRepetidos = top3(porPiloto).filter(([, n]) => n > 1);
  return (
    <div className="space-y-3 text-xs">
      <div>
        <p className="font-black text-slate-900 text-sm">{motivo}</p>
        <p className="text-slate-500">
          {n1(cajas)} CJ devueltas en {n0(detalle.length)} ruta(s)
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Por agencia (CJ)</p>
          {top3(porAgencia).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2">
              <span className="truncate">{k}</span>
              <b className="tabular-nums">{n1(v)}</b>
            </div>
          ))}
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Por segmento (CJ)</p>
          {top3(porSegmento).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2">
              <span className="truncate">{k}</span>
              <b className="tabular-nums">{n1(v)}</b>
            </div>
          ))}
        </div>
      </div>
      {pilotosRepetidos.length > 0 && (
        <p className="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-2 py-1.5">
          Se repite con: {pilotosRepetidos.map(([p, n]) => `${p} (${n} rutas)`).join(' · ')}
        </p>
      )}
      <div>
        <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Rutas</p>
        <table className="w-full">
          <thead>
            <tr className="text-[10px] text-slate-500 border-b border-slate-200">
              <th className="text-left py-1 pr-1">Ruta</th>
              <th className="text-left py-1 px-1">Fecha</th>
              <th className="text-left py-1 px-1">Agencia · piloto</th>
              <th className="text-right py-1 px-1">CJ dev.</th>
              <th className="text-right py-1 pl-1">% dev.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {detalle.map((d) => (
              <tr key={getRouteKey(d.r) + '|' + (d.r.tripNumber || 1)} className="align-top">
                <td className="py-1 pr-1 font-mono font-bold text-slate-800 whitespace-nowrap">
                  {d.r.id}
                  {(d.r.tripNumber || 1) > 1 ? <span className="text-slate-400 font-normal"> V{d.r.tripNumber}</span> : null}
                </td>
                <td className="py-1 px-1 whitespace-nowrap text-slate-600">{routeDayKey(d.r)?.slice(0, 5) || '—'}</td>
                <td className="py-1 px-1 text-slate-600">
                  <span className="font-semibold text-slate-700">{d.r.agencia}</span>
                  {d.r.asignacion?.conductor ? ` · ${d.r.asignacion.conductor}` : ''}
                  {d.r.liquidacion?.motivoDetalle ? <span className="block text-[10.5px] text-slate-500 italic">“{d.r.liquidacion.motivoDetalle}”</span> : null}
                </td>
                <td className="py-1 px-1 text-right tabular-nums font-semibold" title={d.compartido ? `La ruta devolvió ${n1(d.devRuta)} CJ por varios motivos; se reparten entre ellos.` : undefined}>
                  {n1(d.cajas)}
                  {d.compartido ? '*' : ''}
                </td>
                <td className="py-1 pl-1 text-right tabular-nums font-bold" style={{ color: d.pctDev >= 0.2 ? C_CRIT : d.pctDev >= 0.1 ? C_SERIOUS : undefined }}>
                  {(d.pctDev * 100).toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {detalle.some((d) => d.compartido) && <p className="text-[10px] text-slate-400 mt-1">* Ruta con varios motivos: sus CJ se reparten entre ellos.</p>}
      </div>
      {clientes.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Clientes marcados con este motivo ({n0(clientes.length)})</p>
          <div className="divide-y divide-slate-100">
            {clientes.slice(0, 40).map((c, i) => (
              <div key={c.ruta + c.codigo + i} className="flex justify-between gap-2 py-1">
                <span className="truncate">
                  <span className="font-mono text-slate-500">{c.codigo}</span> {c.nombre}
                </span>
                <span className="text-slate-500 whitespace-nowrap">
                  Ruta {c.ruta}
                  {c.cajas ? ` · ${n1(c.cajas)} CJ` : ''}
                </span>
              </div>
            ))}
          </div>
          {clientes.length > 40 && <p className="text-[10px] text-slate-400 mt-1">… y {n0(clientes.length - 40)} más.</p>}
        </div>
      )}
    </div>
  );
};

export const DashboardExecutive: React.FC<Props> = ({ routes, liquidatedRoutes, trucks, staff, stats: statsHoy, selectedAgency, etiquetaTodas = 'Todas', historyLimitedDays, onLoadFullHistory, isLoadingFullHistory, registrarReporte, modo = 'despacho' }) => {
  const esLiq = modo === 'liquidacion';
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
  const esDespachada = (r: Route) => r.estado !== 'Pendiente' || !!r.liquidacion;
  const despachadas = dayRoutes.filter(esDespachada).length;
  const cjDesp = dayRoutes.filter(esDespachada).reduce((a, r) => a + cajasPlan(r), 0);
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
  // Despacho: CJ planificadas por día (fecha de ruta).
  const trendPlan = useMemo(() => {
    type Cubeta = { key: string; label: string; cj: number; n: number };
    const byDay = new Map<string, Cubeta>((trend as { key: string; label: string }[]).map((b) => [b.key, { key: b.key, label: b.label, cj: 0, n: 0 }] as [string, Cubeta]));
    const keys = trendDays.map((d) => formatDateToGuatemala(d));
    const bucketOf = new Map<string, string>();
    let actual = '';
    keys.forEach((k, i) => {
      if (!porSemana || i % 7 === 0) actual = k;
      bucketOf.set(k, actual);
    });
    dayRoutes.forEach((r) => {
      const b = byDay.get(bucketOf.get(routeDayKey(r) || '') || '');
      if (!b) return;
      b.cj += cajasPlan(r);
      b.n += 1;
    });
    return [...byDay.values()].map((b: Cubeta) => ({ key: b.key, label: b.label, value: b.cj, tip: `${b.label}: ${n0(b.n)} rutas · ${n0(b.cj)} CJ planificadas` }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trend, dayRoutes]);
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
          dev,
          efect: ent + dev > 0 ? ent / (ent + dev) : null,
          desp: L.filter((r) => r.estado !== 'Pendiente' || !!r.liquidacion).length,
          cjDesp: L.filter((r) => r.estado !== 'Pendiente' || !!r.liquidacion).reduce((a, r) => a + cajasPlan(r), 0),
          porAsig: L.filter((r) => !r.liquidacion && r.estado === 'Pendiente' && !isPiso(r) && !isBolson(r)).length,
          piso: L.filter((r) => !r.liquidacion && r.estado === 'Pendiente' && isPiso(r)).length,
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

  // ---------- Participación por agencia (rutas y CJ) ----------
  // Qué % de las rutas y de las cajas del periodo es de cada agencia, de mayor a
  // menor (por CJ). Se muestra cuando se ven todas las agencias.
  const participacion = useMemo(
    () => [...porAgencia].sort((a, b) => b.cj - a.cj || b.rutas - a.rutas),
    [porAgencia]
  );
  const partTotRutas = participacion.reduce((a, x) => a + x.rutas, 0);
  const partTotCj = participacion.reduce((a, x) => a + x.cj, 0);

  // ---------- Rutas parciales (entregadas en parte, con cajas por entregar) ----------
  // 1) Ruta Abierta / Revisita: regresó con clientes pendientes. Lo entregado está
  //    en su historial de despachos; lo pendiente son las cajas que le quedan.
  // 2) Ruta partida en viajes: unos viajes ya liquidados y otros no.
  // Solo se cuentan las que aún tienen cajas por entregar.
  const parciales = useMemo(() => {
    type Fila = { key: string; id: string; ag: string; seg: string; tipo: string; estado: string; viajes: number; total: number; ent: number; pend: number };
    // Cada viaje ya liquidado (incluye los retornos de una Ruta Abierta, que la
    // app registra como viajes liquidados) y cada fila activa del tablero se
    // agrupan por ruta: misma ruta (o ruta madre si se partió), agencia y fecha.
    const grupos = new Map<string, { split: boolean; liq: Route[]; act: Route[] }>();
    dayRoutes.forEach((r) => {
      const padre = r.parentRouteId || (r.isSplitRoute ? String(r.id).split('.')[0] : '');
      const gk = `${padre || r.id}|${r.agencia || ''}|${routeDayKey(r) || ''}`;
      const g = grupos.get(gk) || { split: false, liq: [], act: [] };
      if (padre) g.split = true;
      (esLiquidada(r) ? g.liq : g.act).push(r);
      grupos.set(gk, g);
    });
    const out: Fila[] = [];
    grupos.forEach((g, gk) => {
      if (!g.liq.length || !g.act.length) return;
      // Sin partir: solo cuenta si lo activo es lo que quedó pendiente de una
      // entrega parcial (Ruta Abierta / Revisita), no una Recarga nueva.
      const act = g.split
        ? g.act
        : g.act.filter((r) => r.estado === 'Abierta' || r.esReasignacion || r.tipoAsignacion === 'Revisita' || (r.historialDespachos || []).length > 0);
      const ent = g.liq.reduce((a, r) => a + Number(r.liquidacion?.cajasEntregadas || 0), 0);
      const pend = act.reduce((a, r) => a + toNum(r.cajasFisicas), 0);
      if (ent <= 0 || pend <= 0) return;
      const dev = g.liq.reduce((a, r) => a + Number(r.liquidacion?.cajasDevueltas || 0), 0);
      const r0 = act[0];
      out.push({
        key: gk,
        id: gk.split('|')[0],
        ag: r0.agencia || 'Sin agencia',
        seg: r0.segmento || '-',
        tipo: g.split ? 'Partida en viajes' : 'Ruta abierta / revisita',
        estado: g.split
          ? `${g.liq.length} de ${g.liq.length + act.length} viajes liquidados`
          : `${r0.estado === 'Abierta' ? 'Por reasignar' : r0.estado} · ${g.liq.length} retorno(s)`,
        viajes: g.liq.length + act.length,
        // Total = lo entregado + lo que falta (lo devuelto en un retorno vuelve a
        // salir como pendiente, por eso no se suma aparte salvo en rutas partidas).
        total: g.split ? ent + pend + dev : Math.max(toNum(r0.cajasOriginales), ent + pend),
        ent,
        pend,
      });
    });
    return out.sort((a, b) => b.pend - a.pend);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayRoutes]);
  const parcEnt = parciales.reduce((a, x) => a + x.ent, 0);
  const parcPend = parciales.reduce((a, x) => a + x.pend, 0);

  // ---------- Devoluciones del periodo ----------
  const motivos = useMemo(() => {
    const m = new Map<string, { rutas: number; cajas: number; detalle: DetalleMotivo[] }>();
    liqPeriodo.forEach((r) => {
      const dev = Number(r.liquidacion?.cajasDevueltas || 0);
      if (dev <= 0) return;
      const ent = Number(r.liquidacion?.cajasEntregadas || 0);
      const sel = r.liquidacion?.motivosSeleccionados?.length ? r.liquidacion.motivosSeleccionados : [r.liquidacion?.motivoDevolucion || r.motivoDevolucion || 'Sin motivo registrado'];
      sel.forEach((mo) => {
        const k = String(mo || 'Sin motivo registrado');
        const x = m.get(k) || { rutas: 0, cajas: 0, detalle: [] };
        x.rutas += 1;
        x.cajas += dev / sel.length;
        // Detalle para revisar (se ve al pasar el cursor por el motivo).
        x.detalle.push({
          r,
          cajas: dev / sel.length,
          devRuta: dev,
          pctDev: ent + dev > 0 ? dev / (ent + dev) : 0,
          compartido: sel.length > 1,
          clientes: (r.liquidacion?.clientesPendientes || []).filter((c) => String(c.motivo || '') === k || (sel.length === 1 && !c.motivo)),
        });
        m.set(k, x);
      });
    });
    m.forEach((x) => x.detalle.sort((a, b) => b.cajas - a.cajas));
    return Array.from(m.entries()).map(([motivo, v]) => ({ motivo, ...v })).sort((a, b) => b.cajas - a.cajas);
  }, [liqPeriodo]);
  const motTotCj = motivos.reduce((a, m) => a + m.cajas, 0);
  // Camiones de apoyo del periodo (por agencia y por motivo). Cada apoyo se
  // cuenta una vez aunque la ruta aparezca en varios viajes.
  const apoyosPeriodo = useMemo(() => {
    const vistos = new Set<string>();
    const porAg = new Map<string, { rutas: Set<string>; apoyos: number; cajas: number }>();
    const porMotivo = new Map<string, number>();
    dayRoutes.forEach((r) => {
      (r.apoyos || []).forEach((a) => {
        if (vistos.has(a.id)) return;
        vistos.add(a.id);
        const ag = r.agencia || 'Sin agencia';
        const x = porAg.get(ag) || { rutas: new Set<string>(), apoyos: 0, cajas: 0 };
        x.rutas.add(getRouteKey(r));
        x.apoyos += 1;
        x.cajas += Number(a.cajas || 0);
        porAg.set(ag, x);
        porMotivo.set(a.motivo, (porMotivo.get(a.motivo) || 0) + 1);
      });
    });
    const rutasDe = (ag: string) => new Set(dayRoutes.filter((r) => (r.agencia || 'Sin agencia') === ag && (r.asignacion || r.liquidacion)).map(getRouteKey)).size;
    return {
      total: vistos.size,
      filas: [...porAg.entries()].map(([ag, x]) => ({ ag, rutas: x.rutas.size, apoyos: x.apoyos, cajas: x.cajas, despachadas: rutasDe(ag) })).sort((a, b) => b.apoyos - a.apoyos),
      motivos: [...porMotivo.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [dayRoutes]);
  const motTotRutas = liqPeriodo.filter((r) => Number(r.liquidacion?.cajasDevueltas || 0) > 0).length;

  // ---------- Recursos ----------
  const truckSinMotivo = trucks.filter((t) => t.estado === 'Disponible' && !t.motivoNoAsignado).length;
  const truckConMotivo = trucks.filter((t) => !!t.motivoNoAsignado).length;

  // Detalle del motivo bajo el cursor: se muestra en una ventana flotante fija
  // (la tabla tiene scroll horizontal y cortaría un globo normal). Tocar la
  // fila en una tablet también la abre o la cierra.
  const [motivoAbierto, setMotivoAbierto] = useState<{ motivo: string; top: number; left: number; arriba: boolean } | null>(null);
  const cierre = useRef<number | undefined>(undefined);
  const abrirMotivo = (motivo: string, el: HTMLElement) => {
    window.clearTimeout(cierre.current);
    const b = el.getBoundingClientRect();
    const ancho = Math.min(560, window.innerWidth - 24);
    const arriba = b.bottom > window.innerHeight * 0.55;
    setMotivoAbierto({ motivo, left: Math.max(12, Math.min(b.left + 24, window.innerWidth - ancho - 12)), top: arriba ? b.top - 6 : b.bottom + 6, arriba });
  };
  const cerrarMotivo = () => {
    window.clearTimeout(cierre.current);
    cierre.current = window.setTimeout(() => setMotivoAbierto(null), 180);
  };
  // Al desplazar la página la ventana quedaría fuera de lugar: se cierra.
  useEffect(() => {
    if (!motivoAbierto) return;
    const cerrar = (e: Event) => {
      if (e.target instanceof Element && e.target.closest('[role=dialog]')) return;
      setMotivoAbierto(null);
    };
    window.addEventListener('scroll', cerrar, true);
    return () => window.removeEventListener('scroll', cerrar, true);
  }, [motivoAbierto]);
  const motivoSel = motivoAbierto ? motivos.find((m) => m.motivo === motivoAbierto.motivo) : undefined;

  // ---------- Reporte PDF (los mismos datos de la pantalla, con formato) ----------
  const armarReporte = (): ReportePdf => {
    const pct = (v: number, t: number) => (t > 0 ? `${((v / t) * 100).toFixed(1)}%` : '—');
    const tono = (c: string) => (c === C_GOOD ? 'ok' : c === C_WARN ? 'warn' : c === C_INFO ? 'info' : 'crit') as 'ok' | 'warn' | 'info' | 'crit';
    // Rutas con mayor devolución (top 15 por CJ devueltas)
    const porRuta = new Map<string, { id: string; ag: string; seg: string; viajes: number; sal: number; dev: number; motivos: Map<string, number>; pilotos: Set<string> }>();
    liqPeriodo.forEach((r) => {
      const dev = Number(r.liquidacion?.cajasDevueltas || 0);
      if (dev <= 0) return;
      const k = `${r.id}|${r.agencia || ''}`;
      const x = porRuta.get(k) || { id: String(r.id), ag: r.agencia || '-', seg: r.segmento || '-', viajes: 0, sal: 0, dev: 0, motivos: new Map(), pilotos: new Set<string>() };
      x.viajes += 1;
      x.dev += dev;
      x.sal += dev + Number(r.liquidacion?.cajasEntregadas || 0);
      const mo = r.liquidacion?.motivosSeleccionados?.[0] || r.liquidacion?.motivoDevolucion || r.motivoDevolucion || 'Sin motivo';
      x.motivos.set(mo, (x.motivos.get(mo) || 0) + dev);
      const p = (r.asignacion || r.ultimoDespacho)?.conductor;
      if (p) x.pilotos.add(p);
      porRuta.set(k, x);
    });
    const topDev = [...porRuta.values()].sort((a, b) => b.dev - a.dev).slice(0, 15);
    const agencia = selectedAgency === 'TODAS' ? etiquetaTodas : selectedAgency;
    const varias = participacion.length > 1;
    const tablaSegmento = {
      titulo: 'Rutas y cajas por segmento',
      sub: `${periodLabel} · % sobre el total del filtro`,
      columnas: [{ t: 'Segmento' }, { t: 'Rutas', num: true }, { t: '% rutas', num: true }, { t: 'CJ', num: true }, { t: '% CJ', num: true }],
      filas: porSegmento.map((s) => [s.seg, n0(s.rutas), pct(s.rutas, segTotRutas), n0(s.cj), pct(s.cj, segTotCj)]),
      total: porSegmento.length ? ['Total', n0(segTotRutas), '100%', n0(segTotCj), '100%'] : undefined,
    };
    if (!esLiq) {
      const pend = Math.max(0, stats.cajasFisicasHoy - cjDesp);
      const rgbDe = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)] as [number, number, number];
      const topAg = participacion[0];
      const conPend = participacion.filter((x) => x.porAsig > 0).sort((x, y) => y.porAsig - x.porAsig);
      const resumen = [
        `Se planificaron ${n0(totalPlan)} rutas con ${n0(stats.cajasFisicasHoy)} CJ; ya salieron ${n0(despachadas)} rutas (${pct(despachadas, totalPlan)}) y ${n0(cjDesp)} CJ (${pct(cjDesp, stats.cajasFisicasHoy)}).`,
        stats.pendientes
          ? `Quedan ${n0(stats.pendientes)} rutas por asignar${conPend.length ? `, principalmente en ${conPend.slice(0, 3).map((x) => `${x.ag} (${x.porAsig})`).join(', ')}` : ''}; ${n0(pend)} CJ por despachar.`
          : 'Todas las rutas planificadas ya tienen camión y tripulación asignados.',
        ...(varias && topAg ? [`${topAg.ag} concentra la mayor carga: ${pct(topAg.cj, partTotCj)} de las CJ (${n0(topAg.cj)}) y ${pct(topAg.rutas, partTotRutas)} de las rutas.`] : []),
        ...(salidasPorHora.length && horaPico ? [`La mayor parte de las asignaciones se hizo entre ${horaPico.label} y ${horaPico.label.replace(':00', ':59')} (${n0(horaPico.value)} rutas).`] : []),
        `Flota en ruta: ${Math.round(utilFlota * 100)}% (${n0(truckEnRuta)} de ${n0(truckActivos.length)} camiones).${atrasadas.length ? ` Hay ${n0(atrasadas.length)} ruta(s) con más de 24 h sin cerrar.` : ''}`,
      ];
      return {
        titulo: 'Dashboard de Despacho',
        periodo: periodLabel,
        agencia,
        resumen,
        barra: {
          titulo: 'Estado de las rutas',
          sub: `${n0(totalEstados)} rutas planificadas, cada una en su estado actual`,
          segmentos: estadosDona.map((e) => ({ label: e.label, valor: e.value, color: rgbDe(e.color) })),
        },
        kpis: [
          { label: 'Rutas planificadas', valor: n0(totalPlan), sub: `${n0(stats.cajasFisicasHoy)} CJ planificadas`, tono: 'info' },
          { label: 'Despachadas', valor: n0(despachadas), sub: `${pct(despachadas, totalPlan)} de las planificadas`, tono: 'ok' },
          { label: 'Por asignar', valor: n0(stats.pendientes), sub: `${n0(stats.pisoHoy)} a piso${bolsonCount ? ` · ${n0(bolsonCount)} en bolsón` : ''}`, tono: stats.pendientes ? 'warn' : 'ok' },
          { label: 'CJ despachadas', valor: n0(cjDesp), sub: `${pct(cjDesp, stats.cajasFisicasHoy)} · ${n0(pend)} CJ por despachar`, tono: 'info' },
          { label: 'En ruta', valor: n0(enOperacion), sub: `${n0(stats.transito)} en tránsito · ${n0(stats.abiertas)} abiertas`, tono: 'info' },
          { label: 'Flota en ruta', valor: `${Math.round(utilFlota * 100)}%`, sub: `${n0(truckEnRuta)} de ${n0(truckActivos.length)} camiones · ${n0(staffEnRuta)} de ${n0(staffActivos.length)} personas`, tono: 'info' },
        ],
        tablas: [
          {
            titulo: 'Resumen por agencia',
            sub: `${periodLabel}${varias ? ' · de mayor a menor por CJ' : ''}`,
            columnas: [{ t: 'Agencia' }, { t: 'Rutas', num: true }, { t: '% rutas', num: true }, { t: 'CJ planificadas', num: true }, { t: '% CJ', num: true }, { t: 'Despachadas', num: true }, { t: '% despachadas', num: true }, { t: 'CJ despachadas', num: true }, { t: 'Por asignar', num: true }, { t: 'A piso', num: true }],
            filas: participacion.map((a) => [a.ag, n0(a.rutas), pct(a.rutas, partTotRutas), n0(a.cj), pct(a.cj, partTotCj), n0(a.desp), pct(a.desp, a.rutas), n0(a.cjDesp), n0(a.porAsig), n0(a.piso)]),
            total: varias
              ? ['Total', n0(partTotRutas), '100%', n0(partTotCj), '100%', n0(despachadas), pct(despachadas, totalPlan), n0(cjDesp), n0(participacion.reduce((s, a) => s + a.porAsig, 0)), n0(participacion.reduce((s, a) => s + a.piso, 0))]
              : undefined,
            vacio: 'Sin rutas en el periodo.',
          },
          tablaSegmento,
          ...(salidasPorHora.length
            ? [
                {
                  titulo: 'Hora de asignación',
                  sub: `${periodLabel} · rutas según la hora en que se les asignó camión y tripulación`,
                  columnas: [{ t: 'Hora' }, { t: 'Rutas asignadas', num: true }, { t: '% de las asignadas', num: true }],
                  filas: salidasPorHora.filter((h) => h.value > 0).map((h) => [h.label, n0(h.value), pct(h.value, salidasPorHora.reduce((a, x) => a + x.value, 0))]),
                },
              ]
            : []),
          ...(!unDia
            ? [
                {
                  titulo: `Planificación ${porSemana ? 'por semana' : 'por día'}`,
                  sub: `${periodLabel} · por fecha de ruta`,
                  columnas: [{ t: porSemana ? 'Semana' : 'Día' }, { t: 'CJ planificadas', num: true }],
                  filas: trendPlan.filter((d) => d.value > 0).map((d) => [d.label, n0(d.value)]),
                  total: ['Total', n0(stats.cajasFisicasHoy)],
                },
              ]
            : []),
          {
            titulo: 'Rutas parciales · entregadas en parte',
            sub: `${periodLabel} · ${n0(parciales.length)} ruta(s) · ${n0(parcEnt)} CJ entregadas · ${n0(parcPend)} CJ pendientes de entregar`,
            columnas: [{ t: 'Ruta' }, { t: 'Agencia' }, { t: 'Segmento' }, { t: 'Tipo' }, { t: 'Estado' }, { t: 'CJ total', num: true }, { t: 'CJ entregadas', num: true }, { t: 'CJ pendientes', num: true }, { t: '% avance', num: true }],
            filas: parciales.map((x) => [x.id, x.ag, x.seg, x.tipo, x.estado, n0(x.total), n0(x.ent), n0(x.pend), pct(x.ent, x.ent + x.pend)]),
            total: parciales.length ? ['Total', '', '', '', '', n0(parciales.reduce((a, x) => a + x.total, 0)), n0(parcEnt), n0(parcPend), pct(parcEnt, parcEnt + parcPend)] : undefined,
          },
          {
            titulo: 'Camiones de apoyo',
            sub: periodLabel,
            columnas: [{ t: 'Agencia' }, { t: 'Rutas con apoyo', num: true }, { t: 'Camiones de apoyo', num: true }, { t: 'CJ al apoyo', num: true }, { t: '% de rutas despachadas', num: true }],
            filas: apoyosPeriodo.filas.map((f) => [f.ag, n0(f.rutas), n0(f.apoyos), f.cajas ? n0(f.cajas) : '—', pct(f.rutas, f.despachadas)]),
          },
        ],
        notas: [
          'Se analizan las rutas cuya fecha de ruta cae en el periodo. Despachadas: rutas que ya salieron con camión y tripulación (incluye las liquidadas). Camiones y personal muestran el estado actual del tablero.',
          ...(fueraDeHistorial ? [`Solo están cargados los últimos ${historyLimitedDays} días del historial: el periodo puede estar incompleto.`] : []),
        ],
      };
    }
    return {
      titulo: 'Dashboard de Liquidación',
      periodo: periodLabel,
      agencia,
      kpis: [
        { label: 'Rutas liquidadas', valor: n0(stats.liquidadas), sub: `de ${n0(totalPlan)} planificadas`, tono: 'ok' },
        { label: 'Cumplimiento', valor: `${Math.round(cumplimiento * 100)}%`, sub: 'rutas liquidadas / planificadas', tono: tono(cumplStatus.c) },
        { label: 'CJ entregadas', valor: n0(cjEnt), sub: `${pct(cjEnt, stats.cajasFisicasHoy)} de ${n0(stats.cajasFisicasHoy)} CJ planificadas`, tono: 'ok' },
        { label: 'CJ devueltas', valor: n0(cjDev), sub: `${n0(motTotRutas)} ruta(s) con devolución`, tono: cjDev ? 'crit' : 'ok' },
        { label: 'Efectividad', valor: cjEnt + cjDev > 0 ? `${(efectividad * 100).toFixed(1)}%` : '—', sub: 'CJ entregadas / (entregadas + devueltas)', tono: cjEnt + cjDev > 0 ? tono(efStatus.c) : 'info' },
        { label: 'Por liquidar', valor: n0(enOperacion), sub: `${n0(stats.transito)} en tránsito · ${n0(stats.abiertas)} abiertas`, tono: enOperacion ? 'warn' : 'ok' },
      ],
      tablas: [
        {
          titulo: 'Resumen por agencia',
          sub: `${periodLabel}${varias ? ' · de mayor a menor por CJ' : ''}`,
          columnas: [{ t: 'Agencia' }, { t: 'Rutas', num: true }, { t: '% rutas', num: true }, { t: 'CJ planificadas', num: true }, { t: '% CJ', num: true }, { t: 'Liquidadas', num: true }, { t: 'Cumplimiento', num: true }, { t: 'CJ entregadas', num: true }, { t: 'CJ devueltas', num: true }, { t: 'Efectividad', num: true }],
          filas: participacion.map((a) => [a.ag, n0(a.rutas), pct(a.rutas, partTotRutas), n1(a.cj), pct(a.cj, partTotCj), n0(a.liq), `${Math.round(a.cumpl * 100)}%`, n1(a.ent), n1(a.dev), a.efect === null ? '—' : `${(a.efect * 100).toFixed(1)}%`]),
          total: varias
            ? ['Total', n0(partTotRutas), '100%', n1(partTotCj), '100%', n0(stats.liquidadas), pct(stats.liquidadas, totalPlan), n1(cjEnt), n1(cjDev), cjEnt + cjDev > 0 ? `${(efectividad * 100).toFixed(1)}%` : '—']
            : undefined,
          vacio: 'Sin rutas en el periodo.',
        },
        ...(!unDia
          ? [
              {
                titulo: `Efectividad de entrega ${porSemana ? 'por semana' : 'por día'}`,
                sub: periodLabel,
                columnas: [{ t: porSemana ? 'Semana' : 'Día' }, { t: 'Rutas liquidadas', num: true }, { t: 'CJ entregadas', num: true }, { t: 'CJ devueltas', num: true }, { t: 'Efectividad', num: true }],
                filas: trend.filter((d) => d.rutas > 0).map((d) => [d.label, n0(d.rutas), n1(d.ent), n1(d.dev), pct(d.ent, d.ent + d.dev)]),
                total: ['Total', n0(sem.rutas), n1(sem.ent), n1(sem.dev), pct(sem.ent, sem.ent + sem.dev)],
              },
            ]
          : []),
        {
          titulo: 'Principales motivos de devolución',
          sub: `Cajas devueltas · ${periodLabel}`,
          columnas: [{ t: 'Motivo' }, { t: 'Rutas', num: true }, { t: 'CJ devueltas', num: true }, { t: '% CJ devueltas', num: true }],
          filas: motivos.map((m) => [m.motivo, n0(m.rutas), n1(m.cajas), pct(m.cajas, motTotCj)]),
          total: motivos.length ? ['Total', n0(motTotRutas), n1(motTotCj), '100%'] : undefined,
          vacio: 'Sin devoluciones en el periodo.',
        },
        {
          titulo: 'Rutas con mayor devolución',
          sub: `${periodLabel} · las 15 con más cajas devueltas`,
          columnas: [{ t: 'Ruta' }, { t: 'Agencia' }, { t: 'Segmento' }, { t: 'Viajes con dev.', num: true }, { t: 'CJ salida', num: true }, { t: 'CJ devueltas', num: true }, { t: '% dev.', num: true }, { t: 'Motivo principal' }, { t: 'Piloto(s)' }],
          filas: topDev.map((x) => [x.id, x.ag, x.seg, n0(x.viajes), n1(x.sal), n1(x.dev), pct(x.dev, x.sal), [...x.motivos.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '-', [...x.pilotos].join(', ')]),
        },
      ],
      notas: [
        'Se analizan las rutas cuya fecha de ruta cae en el periodo. Efectividad = CJ entregadas / (entregadas + devueltas) de las rutas liquidadas.',
        ...(fueraDeHistorial ? [`Solo están cargados los últimos ${historyLimitedDays} días del historial: el periodo puede estar incompleto.`] : []),
      ],
    };
  };
  useEffect(() => {
    registrarReporte?.(armarReporte);
  });

  const cumplStatus = cumplimiento >= 0.9 ? { c: C_GOOD, t: 'En meta' } : cumplimiento >= 0.7 ? { c: C_WARN, t: 'En curso' } : { c: C_CRIT, t: 'Bajo' };
  const efStatus = efectividad >= 0.97 ? { c: C_GOOD, t: 'Óptima' } : efectividad >= 0.9 ? { c: C_WARN, t: 'Vigilar' } : { c: C_SERIOUS, t: 'Alta devolución' };

  // Resumen por agencia: una sola tabla (participación, cumplimiento y
  // efectividad), de mayor a menor por CJ.
  const resumenAg = participacion;
  const variasAg = resumenAg.length > 1;
  const pendParc = parciales.reduce((a, x) => a + x.pend, 0);
  const estadoChips = [
    { l: 'Por asignar', v: stats.pendientes, c: C_WARN },
    { l: 'En tránsito', v: stats.transito, c: C_INFO },
    { l: 'Abiertas', v: stats.abiertas, c: C_SERIOUS },
    { l: 'A piso', v: stats.pisoHoy, c: C_WARN },
    ...(stats.bolson ? [{ l: 'Bolsón', v: stats.bolson, c: C_CRIT }] : []),
    { l: 'Liquidadas', v: stats.liquidadas, c: C_GOOD },
  ];
  const alertas: { k: string; n: number; t: string; d: string; c: string }[] = [
    { k: 'atr', n: atrasadas.length, t: 'Rutas con más de 24 h', d: atrasadas.length ? `${crit72} con más de 72 h · todo el tablero` : 'Todo el tablero al día', c: atrasadas.length ? PD.rojo : PD.verde },
    { k: 'parc', n: parciales.length, t: 'Rutas parciales', d: parciales.length ? `${n0(pendParc)} CJ pendientes de entregar` : 'Sin entregas parciales pendientes', c: parciales.length ? PD.oroTexto : PD.verde },
    { k: 'asig', n: stats.pendientes, t: 'Rutas por asignar', d: `${n0(stats.pisoHoy)} a piso${bolsonCount ? ` · ${n0(bolsonCount)} en bolsón` : ''}`, c: stats.pendientes ? PD.oroTexto : PD.verde },
    { k: 'flota', n: truckSinMotivo, t: 'Camiones disponibles sin motivo', d: `${n0(truckConMotivo)} sin salir con motivo registrado`, c: truckSinMotivo ? PD.naranja : PD.verde },
  ];

  // ---------- Datos propios del tablero de Despacho ----------
  const segDespacho = useMemo(() => {
    const m = new Map<string, { rutas: number; cj: number; cjDesp: number; desp: number }>();
    dayRoutes.forEach((r) => {
      const k = (r.segmento || '').trim().toUpperCase() || 'SIN SEGMENTO';
      const x = m.get(k) || { rutas: 0, cj: 0, cjDesp: 0, desp: 0 };
      x.rutas += 1;
      x.cj += cajasPlan(r);
      if (r.estado !== 'Pendiente' || !!r.liquidacion) {
        x.desp += 1;
        x.cjDesp += cajasPlan(r);
      }
      m.set(k, x);
    });
    return [...m.entries()].map(([seg, v]) => ({ seg, ...v })).sort((a, b) => b.cj - a.cj);
  }, [dayRoutes]);
  // Hora de asignación: cuándo se le asignó camión y tripulación a cada ruta
  // (fecha y hora que registra el sistema al asignar, "dd/mm/aaaa hh:mm").
  const salidasPorHora = useMemo(() => {
    // Hora contada desde el inicio del día de la ruta (igual que la gráfica):
    // "Día ant." = se asignó el día anterior; "Día sig." = después del día de la ruta.
    const cuenta = new Map<number, { n: number; cj: number }>();
    dayRoutes.forEach((r) => {
      if (!(r.estado !== 'Pendiente' || !!r.liquidacion)) return;
      const m = minutosAsignacion(r);
      if (m == null) return;
      const hr = m < 0 ? -1 : m >= 1440 ? 24 : Math.floor(m / 60);
      const x = cuenta.get(hr) || { n: 0, cj: 0 };
      x.n += 1;
      x.cj += cajasPlan(r);
      cuenta.set(hr, x);
    });
    if (!cuenta.size) return [];
    const enDia = [...cuenta.keys()].filter((h) => h >= 0 && h < 24);
    const lista: number[] = [];
    if (cuenta.has(-1)) lista.push(-1);
    const desde = Math.min(5, ...enDia);
    const hasta = Math.max(10, ...enDia);
    for (let h = desde; h <= hasta; h++) lista.push(h);
    if (cuenta.has(24)) lista.push(24);
    return lista.map((h) => {
      const x = cuenta.get(h) || { n: 0, cj: 0 };
      const l = etiquetaHora(h);
      return { key: String(h), label: l, value: x.n, tip: `${l} · ${n0(x.n)} ruta(s) asignada(s) · ${n0(x.cj)} CJ` };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayRoutes]);
  const horaPico = salidasPorHora.reduce<{ label: string; value: number } | null>((a, x) => (!a || x.value > a.value ? x : a), null);
  const cjPorDespachar = Math.max(0, stats.cajasFisicasHoy - cjDesp);
  // Rutas y CJ por estado (las mismas rutas del periodo que los indicadores).
  const porEstado = useMemo(() => {
    const base = { liq: { n: 0, cj: 0 }, tran: { n: 0, cj: 0 }, abierta: { n: 0, cj: 0 }, piso: { n: 0, cj: 0 }, asig: { n: 0, cj: 0 }, bolson: { n: 0, cj: 0 } };
    dayRoutes.forEach((r) => {
      const k: keyof typeof base = esLiquidada(r)
        ? 'liq'
        : isBolson(r)
        ? 'bolson'
        : r.estado === 'Pendiente'
        ? isPiso(r)
          ? 'piso'
          : 'asig'
        : r.estado === 'Abierta'
        ? 'abierta'
        : 'tran';
      base[k].n += 1;
      base[k].cj += cajasPlan(r);
    });
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayRoutes]);
  const estadosDona = [
    { k: 'liq', label: 'Liquidadas', color: PD.verde },
    { k: 'tran', label: 'En tránsito', color: PD.azul },
    { k: 'abierta', label: 'Abiertas', color: PD.naranja },
    { k: 'piso', label: 'A piso', color: PD.violeta },
    { k: 'asig', label: 'Por asignar', color: PD.oro },
    { k: 'bolson', label: 'Bolsón', color: PD.rojo },
  ]
    .filter((e) => e.k !== 'bolson' || porEstado.bolson.n > 0)
    .map((e) => ({ ...e, value: porEstado[e.k as keyof typeof porEstado].n, cj: porEstado[e.k as keyof typeof porEstado].cj }));
  const totalEstados = estadosDona.reduce((a, e) => a + e.value, 0);
  const totalCjEstados = estadosDona.reduce((a, e) => a + e.cj, 0);
  const pDesp = totalPlan > 0 ? despachadas / totalPlan : 0;
  const maxCjAg = Math.max(1, ...resumenAg.map((a) => a.cj));
  const maxCjSeg = Math.max(1, ...segDespacho.map((s) => s.cj));
  const [verTablaAg, setVerTablaAg] = useState(false);
  const agenciaTxt = selectedAgency === 'TODAS' ? etiquetaTodas : selectedAgency;

  // ---------- Despacho: comparación con el periodo anterior ----------
  // Hoy → ayer · Ayer → anteayer · 7 días / rango → los mismos días justo antes ·
  // Mes → el mes anterior completo. Mismas reglas que el periodo elegido.
  const prevDays = useMemo(() => {
    if (!periodDays.length) return [] as Date[];
    const a = periodDays[0];
    let ini: Date, fin: Date;
    if (kind === 'mes') {
      ini = new Date(a.getFullYear(), a.getMonth() - 1, 1);
      fin = new Date(a.getFullYear(), a.getMonth(), 0);
    } else {
      fin = new Date(a.getFullYear(), a.getMonth(), a.getDate() - 1);
      ini = new Date(a.getFullYear(), a.getMonth(), a.getDate() - periodDays.length);
    }
    const out: Date[] = [];
    for (let d = new Date(ini); d <= fin && out.length < 400; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) out.push(d);
    return out;
  }, [periodDays, kind]);
  const prevRoutes = useMemo(() => {
    const keys = new Set(prevDays.map((d) => formatDateToGuatemala(d)));
    const m = new Map<string, Route>();
    [...liquidatedRoutes, ...routes].forEach((r) => {
      const k = routeDayKey(r);
      if (k && keys.has(k)) m.set(getRouteKey(r) + '|' + (r.tripNumber || 1) + '|' + (r.liquidacion?.fechaLiquidacion || ''), r);
    });
    return Array.from(m.values());
  }, [routes, liquidatedRoutes, prevDays]);
  // Rutas planificadas con la misma fórmula del encabezado (estado de cada ruta).
  const planDe = (L: Route[]) => {
    const noLiq = L.filter((r) => !esLiquidada(r));
    return (
      noLiq.filter((r) => r.estado === 'Pendiente' && !isPiso(r) && !isBolson(r)).length +
      noLiq.filter(isBolson).length +
      noLiq.filter((r) => r.estado === 'En Tránsito').length +
      noLiq.filter((r) => r.estado === 'Abierta').length +
      noLiq.filter((r) => r.estado === 'Pendiente' && isPiso(r)).length +
      (L.length - noLiq.length)
    );
  };
  const prevPlan = planDe(prevRoutes);
  const prevDesp = prevRoutes.filter(esDespachada).length;
  const nombrePrev = kind === 'hoy' ? 'Ayer' : kind === 'ayer' ? 'Anteayer' : kind === 'mes' ? 'Mes anterior' : `${prevDays.length} días anteriores`;
  // Minuto actual del día en Guatemala (para comparar "a esta hora").
  const ahoraMin = (() => {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    const g = (t: string) => Number(p.find((x) => x.type === t)?.value || 0);
    return (g('hour') % 24) * 60 + g('minute');
  })();

  // ---------- Despacho: asignaciones por hora (periodo y comparación) ----------
  // Cada ruta despachada cae en la hora en que se le asignó camión, contada
  // desde el inicio del día de la ruta ("Día ant." = asignada el día anterior).
  const asignHoras = useMemo(() => {
    const leer = (L: Route[]) => {
      const mins: { r: Route; m: number }[] = [];
      let sinHora = 0;
      L.filter(esDespachada).forEach((r) => {
        const m = minutosAsignacion(r);
        if (m == null) sinHora += 1;
        else mins.push({ r, m });
      });
      return { mins, sinHora };
    };
    const act = leer(dayRoutes);
    const prev = leer(prevRoutes);
    const hora = (m: number) => (m < 0 ? -1 : m >= 1440 ? 24 : Math.floor(m / 60));
    const presentes = new Set(act.mins.map((x) => hora(x.m)));
    const enDia = [...presentes].filter((h) => h >= 0 && h < 24);
    const lista: number[] = [];
    if (presentes.has(-1)) lista.push(-1);
    if (enDia.length || presentes.size) {
      const desde = Math.min(5, ...enDia);
      const hasta = Math.max(10, ...enDia);
      for (let h = desde; h <= hasta; h++) lista.push(h);
    }
    if (presentes.has(24)) lista.push(24);
    return { act, prev, hora, lista };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayRoutes, prevRoutes]);
  // Hasta qué minuto del día se acumula "hoy" (las horas que aún no llegan no se dibujan).
  const limiteHoy = isHoy ? ahoraMin : Infinity;
  const barrasHora: BarraHora[] = useMemo(() => {
    const { act, prev, hora, lista } = asignHoras;
    const prevConHora = prev.mins.length;
    return lista.map((h) => {
      const enHora = act.mins.filter((x) => hora(x.m) === h);
      const finBloque = h < 0 ? 0 : h >= 24 ? Infinity : (h + 1) * 60;
      const acum = act.mins.filter((x) => x.m < finBloque).length;
      const acumPrev = prev.mins.filter((x) => x.m < finBloque).length;
      const futura = isHoy && h >= 0 && h < 24 && h * 60 > limiteHoy;
      const pct = futura || !totalPlan ? null : (acum / totalPlan) * 100;
      const prevPct = prevPlan && prevConHora ? (acumPrev / prevPlan) * 100 : null;
      const cj = enHora.reduce((a, x) => a + cajasPlan(x.r), 0);
      const porAg = new Map<string, number>();
      enHora.forEach((x) => porAg.set(x.r.agencia || 'Sin agencia', (porAg.get(x.r.agencia || 'Sin agencia') || 0) + 1));
      const masAsig = [...porAg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([ag, n]) => `${ag} (${n})`).join(', ');
      const lbl = etiquetaHora(h);
      const lineas: Lineas = futura
        ? [[`${nombrePrev} acumulado`, prevPct == null ? '—' : `${prevPct.toFixed(1)}%`]]
        : [
            ['Rutas asignadas', n0(enHora.length)],
            ['CJ de esas rutas', n0(cj)],
            ['Acumulado del periodo', `${n0(acum)} de ${n0(totalPlan)} (${pct == null ? '—' : pct.toFixed(1) + '%'})`],
            [`${nombrePrev} acumulado`, prevPct == null ? 'sin datos' : `${prevPct.toFixed(1)}%`],
            ...(pct != null && prevPct != null ? ([['Diferencia', `${pct - prevPct >= 0 ? '+' : ''}${(pct - prevPct).toFixed(1)} pts`]] as Lineas) : []),
            ...(masAsig && variasAg ? ([['Más asignaron', masAsig]] as Lineas) : []),
          ];
      return {
        key: String(h),
        label: lbl,
        n: enHora.length,
        pct,
        prevPct,
        titulo: h < 0 ? 'Asignadas el día anterior' : h >= 24 ? 'Asignadas después del día de la ruta' : `${lbl} – ${lbl.replace(':00', ':59')}${futura ? ' · aún no llega' : ''}`,
        lineas,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asignHoras, totalPlan, prevPlan, isHoy, limiteHoy, nombrePrev, variasAg]);
  // % despachado del periodo anterior para comparar en el encabezado. Con
  // "Hoy" se compara contra ayer a la misma hora (rutas con hora registrada).
  const comparacion = useMemo(() => {
    if (!prevPlan || !totalPlan) return null;
    if (isHoy) {
      const hoyA = asignHoras.act.mins.filter((x) => x.m <= ahoraMin).length / totalPlan;
      const ayerA = asignHoras.prev.mins.filter((x) => x.m <= ahoraMin).length / prevPlan;
      if (!asignHoras.prev.mins.length) return null;
      return { dif: (hoyA - ayerA) * 100, txt: `vs ayer a esta hora (${(ayerA * 100).toFixed(1)}%)` };
    }
    const p = prevDesp / prevPlan;
    return { dif: (pDesp - p) * 100, txt: `vs ${nombrePrev.toLowerCase()} (${(p * 100).toFixed(1)}%)` };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asignHoras, prevPlan, prevDesp, totalPlan, isHoy, pDesp, nombrePrev]);

  // ---------- Despacho: CJ por día (7 días, rango, mes) ----------
  const colsDia: ColDia[] = useMemo(() => {
    if (unDia) return [];
    const keys = trendDays.map((d) => formatDateToGuatemala(d));
    const bucketOf = new Map<string, number>();
    const cubetas: { key: string; label: string; cj: number; cjD: number; n: number; d: number; porAsig: number }[] = [];
    keys.forEach((k, i) => {
      if (!porSemana || i % 7 === 0) {
        const d = trendDays[i];
        cubetas.push({ key: k, label: `${porSemana ? 'Sem ' : ''}${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`, cj: 0, cjD: 0, n: 0, d: 0, porAsig: 0 });
      }
      bucketOf.set(k, cubetas.length - 1);
    });
    dayRoutes.forEach((r) => {
      const i = bucketOf.get(routeDayKey(r) || '');
      if (i == null) return;
      const c = cubetas[i];
      c.cj += cajasPlan(r);
      c.n += 1;
      if (esDespachada(r)) {
        c.d += 1;
        c.cjD += cajasPlan(r);
      } else if (!esLiquidada(r) && r.estado === 'Pendiente' && !isPiso(r) && !isBolson(r)) c.porAsig += 1;
    });
    const hoyK = formatDateToGuatemala(hoyD);
    return cubetas.map((c) => ({
      key: c.key,
      label: c.label,
      total: c.cj,
      hecho: c.cjD,
      porAsig: c.porAsig,
      titulo: `${porSemana ? 'Semana del ' : ''}${c.label}${!porSemana && c.key === hoyK ? ' · hoy, en curso' : ''}`,
      lineas: [
        ['CJ planificadas', n0(c.cj)],
        ['CJ despachadas', `${n0(c.cjD)} (${pctTxt(c.cjD, c.cj)})`],
        ['CJ por despachar', n0(c.cj - c.cjD)],
        ['Rutas', `${n0(c.d)} de ${n0(c.n)} despachadas`],
        ['Por asignar', n0(c.porAsig)],
      ] as Lineas,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayRoutes, trendDays, porSemana, unDia]);

  // ---------- Despacho: asignación por agencia y hora (mapa de calor) ----------
  const mapaAg = useMemo(() => {
    const { act, hora, lista } = asignHoras;
    const porAg = new Map<string, Map<number, { n: number; cj: number }>>();
    act.mins.forEach(({ r, m }) => {
      const ag = r.agencia || 'Sin agencia';
      const x = porAg.get(ag) || new Map<number, { n: number; cj: number }>();
      const c = x.get(hora(m)) || { n: 0, cj: 0 };
      c.n += 1;
      c.cj += cajasPlan(r);
      x.set(hora(m), c);
      porAg.set(ag, x);
    });
    const totHora = new Map<number, number>();
    act.mins.forEach(({ m }) => totHora.set(hora(m), (totHora.get(hora(m)) || 0) + 1));
    const max = Math.max(1, ...[...porAg.values()].flatMap((x) => [...x.values()].map((c) => c.n)));
    const filas = resumenAg.map((a) => {
      const x = porAg.get(a.ag) || new Map<number, { n: number; cj: number }>();
      let acum = 0;
      const celdas = lista.map((h) => {
        const c = x.get(h) || { n: 0, cj: 0 };
        acum += c.n;
        return { h, n: c.n, cj: c.cj, acum };
      });
      let pico = -99, picoN = 0;
      x.forEach((c, h) => {
        if (c.n > picoN) [pico, picoN] = [h, c.n];
      });
      return { ag: a.ag, rutas: a.rutas, desp: a.desp, celdas, pico: picoN ? etiquetaHora(pico) : '—' };
    });
    filas.sort((a, b) => a.desp / Math.max(1, a.rutas) - b.desp / Math.max(1, b.rutas) || b.rutas - a.rutas);
    return { filas, max, totHora, lista };
  }, [asignHoras, resumenAg]);
  const picoAg = useMemo(() => new Map(mapaAg.filas.map((f) => [f.ag, f.pico])), [mapaAg]);

  // ---------- Despacho: piezas con detalle ----------
  const [estadoActivo, setEstadoActivo] = useState<string | null>(null);
  const [segActivo, setSegActivo] = useState<string | null>(null);
  const [medidaAg, setMedidaAg] = useState<'cj' | 'rutas'>('cj');
  const masAtrasadas = resumenAg
    .filter((a) => a.rutas > 0 && a.desp < a.rutas)
    .sort((a, b) => a.desp / a.rutas - b.desp / b.rutas || b.rutas - a.rutas)
    .slice(0, 3);

  if (!esLiq) {
    const tile = (label: string, value: string, sub: string, color: string, icon: React.ReactNode, lineas: Lineas, spark: number[] = [], alinear: 'izq' | 'der' = 'izq') => (
      <ConTip titulo={label} lineas={lineas} alinear={alinear} className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-sm min-w-0 hover:border-slate-300 focus:border-slate-300 cursor-default">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1A`, color }}>
            {icon}
          </span>
          <span className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 truncate">{label}</span>
        </div>
        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="text-2xl sm:text-[28px] font-black text-slate-900 leading-none tabular-nums">{value}</div>
          <Spark valores={spark} color={color} />
        </div>
        <div className="mt-1.5 text-[11px] text-slate-500 leading-snug">{sub}</div>
      </ConTip>
    );
    // Mini tendencias: por hora con un solo día, por día con varios días.
    const sparkDesp = unDia ? barrasHora.filter((b) => b.pct != null).map((b) => b.pct as number) : colsDia.map((c) => (c.total ? (c.hecho / c.total) * 100 : 0));
    const sparkPorAsig = unDia
      ? barrasHora.filter((b) => b.pct != null).map((b) => Math.max(0, totalPlan - ((b.pct as number) / 100) * totalPlan))
      : colsDia.map((c) => c.porAsig || 0);
    const cjEnRuta = porEstado.tran.cj + porEstado.abierta.cj;
    const truckDisp = trucks.filter((t) => t.estado === 'Disponible').length;
    const staffDisp = staff.filter((s) => s.estado === 'Disponible').length;
    const sinHoraAct = asignHoras.act.sinHora;
    const estAct = estadosDona.find((e) => e.label === estadoActivo);
    const segColores = [PD.marino, PD.cielo, PD.verde, PD.violeta, PD.oro, PD.naranja, PD.azul, PD.rojo];
    const segDona = segDespacho.map((s, i) => ({ label: s.seg, value: s.cj, color: segColores[i % segColores.length] }));
    const segAct = segDespacho.find((s) => s.seg === segActivo);
    const maxAg = Math.max(1, ...resumenAg.map((a) => (medidaAg === 'cj' ? a.cj : a.rutas)));
    const tonoCelda = (n: number) => {
      const f = n / mapaAg.max;
      return n === 0 ? PD.pista : f < 0.25 ? PD.cieloSuave : f < 0.5 ? '#8fb3e6' : f < 0.75 ? PD.azul : PD.marino;
    };
    const flotaPartes = (lista: { l: string; n: number; c: string; txt: string; extra: Lineas }[], nombre: string) => {
      const tot = lista.reduce((a, x) => a + x.n, 0);
      return { nombre, tot, partes: lista.filter((x) => x.n > 0).map((x) => ({ ...x, p: tot ? x.n / tot : 0 })) };
    };
    const truckDispSin = trucks.filter((t) => t.estado === 'Disponible' && !t.motivoNoAsignado).length;
    const flota = [
      flotaPartes(
        [
          { l: 'En ruta', n: truckEnRuta, c: PD.azul, txt: '#fff', extra: [] },
          { l: 'Disponibles sin motivo', n: truckDispSin, c: PD.oro, txt: '#3b2c00', extra: [] },
          { l: 'Disponibles con motivo', n: truckDisp - truckDispSin, c: PD.cieloSuave, txt: '#0f172a', extra: [] },
        ],
        'Camiones'
      ),
      flotaPartes(
        [
          { l: 'En ruta', n: staffEnRuta, c: PD.violeta, txt: '#fff', extra: [] },
          { l: 'Disponibles', n: staffDisp, c: '#ddd3f3', txt: '#0f172a', extra: [] },
        ],
        'Personal (pilotos y auxiliares)'
      ),
    ];
    return (
      <div className="space-y-4">
        {/* Encabezado con lo esencial del día */}
        <section className="rounded-2xl shadow-sm text-white overflow-hidden" style={{ background: 'linear-gradient(135deg, #2C3790 0%, #1E2768 100%)' }}>
          <div className="p-4 sm:p-5 flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-200">Tablero de Despacho</div>
                <h2 className="text-xl sm:text-2xl font-black leading-tight">{periodLabel}</h2>
                <p className="text-xs text-sky-100/80 mt-0.5">
                  Agencia: <span className="font-semibold text-white">{agenciaTxt}</span>
                </p>
              </div>
              <div role="tablist" aria-label="Periodo del dashboard" className="flex flex-wrap gap-1 bg-white/10 rounded-xl p-1">
                {([
                  ['hoy', 'Hoy'],
                  ['ayer', 'Ayer'],
                  ['7d', '7 días'],
                  ['rango', 'Rango'],
                  ['mes', 'Mes'],
                ] as [PeriodKind, string][]).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={kind === k}
                    onClick={() => setKind(k)}
                    className={`min-h-[36px] px-3 rounded-lg text-xs sm:text-sm font-semibold cursor-pointer ${kind === k ? 'bg-white text-[#2C3790] shadow-sm' : 'text-sky-100 hover:bg-white/10'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {(kind === 'rango' || kind === 'mes') && (
              <div className="flex flex-wrap items-center gap-2 text-xs [color-scheme:dark]">
                {kind === 'rango' ? (
                  <>
                    <label className="flex items-center gap-1 font-semibold text-sky-100">
                      Desde
                      <input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} className="min-h-[36px] px-2 rounded-lg bg-white/10 border border-white/20 text-white" />
                    </label>
                    <label className="flex items-center gap-1 font-semibold text-sky-100">
                      Hasta
                      <input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} className="min-h-[36px] px-2 rounded-lg bg-white/10 border border-white/20 text-white" />
                    </label>
                  </>
                ) : (
                  <label className="flex items-center gap-1 font-semibold text-sky-100">
                    Mes
                    <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="min-h-[36px] px-2 rounded-lg bg-white/10 border border-white/20 text-white" />
                  </label>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_1fr] gap-4 sm:gap-6 items-center">
              <div className="flex items-center gap-3">
                <Anillo p={pDesp} />
                <div>
                  <div className="text-sm font-bold">Despachado</div>
                  <div className="text-[11px] text-sky-100/80">{n0(despachadas)} de {n0(totalPlan)} rutas</div>
                  {comparacion && (
                    <div className="text-[11px] font-bold mt-0.5" style={{ color: comparacion.dif >= 0 ? '#8fe3c4' : '#ffc2c4' }} title="Diferencia en puntos porcentuales de rutas despachadas">
                      {comparacion.dif >= 0 ? '▲' : '▼'} {Math.abs(comparacion.dif).toFixed(1)} pts <span className="font-medium text-sky-100/80">{comparacion.txt}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="sm:border-l sm:border-white/15 sm:pl-6">
                <div className="text-[11px] font-bold uppercase tracking-wide text-sky-200">Rutas planificadas</div>
                <div className="text-4xl font-black leading-none tabular-nums mt-1">{n0(totalPlan)}</div>
                <div className="text-[11px] text-sky-100/80 mt-1">{n0(stats.pendientes)} por asignar · {n0(stats.pisoHoy)} a piso</div>
              </div>
              <div className="sm:border-l sm:border-white/15 sm:pl-6">
                <div className="text-[11px] font-bold uppercase tracking-wide text-sky-200">Cajas planificadas (CJ)</div>
                <div className="text-4xl font-black leading-none tabular-nums mt-1">{n0(stats.cajasFisicasHoy)}</div>
                <div className="text-[11px] text-sky-100/80 mt-1">
                  {n0(cjDesp)} despachadas ({pctTxt(cjDesp, stats.cajasFisicasHoy)}) · {n0(cjPorDespachar)} por despachar
                </div>
              </div>
            </div>
          </div>
          {fueraDeHistorial && (
            <div className="px-4 sm:px-5 py-2 bg-amber-400/20 text-[11px] text-amber-100 flex flex-wrap items-center gap-2">
              Solo están cargados los últimos {historyLimitedDays} días del historial; el periodo puede salir incompleto.
              {onLoadFullHistory && (
                <button type="button" onClick={onLoadFullHistory} disabled={isLoadingFullHistory} className="font-bold underline cursor-pointer disabled:opacity-50">
                  {isLoadingFullHistory ? 'Cargando historial…' : 'Cargar historial completo'}
                </button>
              )}
            </div>
          )}
        </section>

        {/* Indicadores de operación */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {tile(
            'Despachadas',
            n0(despachadas),
            `${pctTxt(despachadas, totalPlan)} de las rutas planificadas`,
            PD.verde,
            <CheckCircle2 className="w-4 h-4" />,
            [
              ['Rutas despachadas', `${n0(despachadas)} de ${n0(totalPlan)}`],
              ['CJ despachadas', `${n0(cjDesp)} (${pctTxt(cjDesp, stats.cajasFisicasHoy)})`],
              ['Ya liquidadas', n0(stats.liquidadas)],
              [nombrePrev, prevPlan ? `${pctTxt(prevDesp, prevPlan)} (${n0(prevDesp)} de ${n0(prevPlan)})` : 'sin datos'],
              ...(sinHoraAct ? ([['Sin hora de asignación', n0(sinHoraAct)]] as Lineas) : []),
            ],
            sparkDesp
          )}
          {tile(
            'Por asignar',
            n0(stats.pendientes),
            `${n0(stats.pisoHoy)} a piso${bolsonCount ? ` · ${n0(bolsonCount)} en bolsón` : ''}`,
            PD.oro,
            <Clock className="w-4 h-4" />,
            [
              ['Sin camión asignado', n0(stats.pendientes)],
              ['A piso', n0(stats.pisoHoy)],
              ...(stats.bolson ? ([['En bolsón', n0(stats.bolson)]] as Lineas) : []),
              ['CJ por despachar', n0(cjPorDespachar)],
              ...(variasAg && resumenAg.some((a) => a.porAsig > 0)
                ? ([['Más por asignar', [...resumenAg].sort((a, b) => b.porAsig - a.porAsig).filter((a) => a.porAsig > 0).slice(0, 2).map((a) => `${a.ag} (${a.porAsig})`).join(', ')]] as Lineas)
                : []),
            ],
            sparkPorAsig,
            'der'
          )}
          {tile(
            'En ruta',
            n0(enOperacion),
            `${n0(stats.transito)} en tránsito · ${n0(stats.abiertas)} abiertas`,
            PD.azul,
            <TruckIcon className="w-4 h-4" />,
            [
              ['En tránsito', n0(stats.transito)],
              ['Abiertas', n0(stats.abiertas)],
              ['CJ en ruta', n0(cjEnRuta)],
              ['Ya liquidadas', n0(stats.liquidadas)],
            ]
          )}
          {tile(
            'Flota en ruta',
            `${Math.round(utilFlota * 100)}%`,
            `${n0(truckEnRuta)}/${n0(truckActivos.length)} camiones · ${n0(staffEnRuta)} personas`,
            PD.violeta,
            <Users className="w-4 h-4" />,
            [
              ['Camiones en ruta', `${n0(truckEnRuta)} de ${n0(truckActivos.length)}`],
              ['Camiones disponibles', n0(truckDisp)],
              ['Disponibles sin motivo', n0(truckSinMotivo)],
              ['Personal en ruta', `${n0(staffEnRuta)} de ${n0(staffActivos.length)}`],
              ['Dato', 'estado actual del tablero'],
            ],
            [],
            'der'
          )}
        </div>

        {/* Estado de las rutas + atención */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card title="Estado de las rutas" sub={`Rutas planificadas del periodo, cada una en su estado actual`} icon={<Layers className="w-4 h-4 text-slate-500" />} className="lg:col-span-2">
            <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-5 md:gap-7 items-center">
              <div className="flex justify-center">
                <Dona
                  segs={estadosDona}
                  activo={estadoActivo}
                  onActivo={setEstadoActivo}
                  centro={
                    estAct ? (
                      <>
                        <div className="text-3xl font-black leading-none tabular-nums" style={{ color: estAct.color === PD.oro ? PD.oroTexto : estAct.color }}>{n0(estAct.value)}</div>
                        <div className="text-[11px] font-semibold text-slate-700 mt-1">{estAct.label}</div>
                        <div className="text-[10.5px] text-slate-500">{pctTxt(estAct.value, totalEstados)} · {n0(estAct.cj)} CJ</div>
                      </>
                    ) : (
                      <>
                        <div className="text-3xl font-black text-slate-900 leading-none tabular-nums">{n0(totalEstados)}</div>
                        <div className="text-[11px] text-slate-500 mt-1">rutas</div>
                      </>
                    )
                  }
                />
              </div>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10.5px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                      <th className="text-left py-2 px-1.5">Estado</th>
                      <th className="text-right py-2 px-1.5">Rutas</th>
                      <th className="text-right py-2 px-1.5">%</th>
                      <th className="text-right py-2 px-1.5">CJ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {estadosDona.map((e) => (
                      <tr
                        key={e.k}
                        className={`transition-opacity ${e.value ? '' : 'text-slate-400'} ${estadoActivo === e.label ? 'bg-slate-50' : ''}`}
                        style={{ opacity: estadoActivo && estadoActivo !== e.label ? 0.5 : 1 }}
                        onMouseEnter={() => e.value && setEstadoActivo(e.label)}
                        onMouseLeave={() => setEstadoActivo(null)}
                      >
                        <td className="py-2 px-1.5">
                          <span className="inline-flex items-center gap-2 font-semibold" style={{ color: e.value ? '#1f2937' : undefined }}>
                            <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ backgroundColor: e.color, opacity: e.value ? 1 : 0.35 }} />
                            {e.label}
                          </span>
                        </td>
                        <td className="py-2 px-1.5 text-right tabular-nums font-bold">{n0(e.value)}</td>
                        <td className="py-2 px-1.5 text-right tabular-nums">{pctTxt(e.value, totalEstados)}</td>
                        <td className="py-2 px-1.5 text-right tabular-nums">{n0(e.cj)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 font-black text-slate-900">
                      <td className="py-2 px-1.5">Total</td>
                      <td className="py-2 px-1.5 text-right tabular-nums">{n0(totalEstados)}</td>
                      <td className="py-2 px-1.5 text-right tabular-nums">100%</td>
                      <td className="py-2 px-1.5 text-right tabular-nums">{n0(totalCjEstados)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 sm:gap-6 items-center">
              <div className="flex justify-center">
                <Dona
                  size={112}
                  grosor={14}
                  unidad=" CJ"
                  segs={[
                    { label: 'Despachadas', value: cjDesp, color: PD.marino },
                    { label: 'Por despachar', value: cjPorDespachar, color: PD.cieloSuave },
                  ]}
                  centro={
                    <>
                      <div className="text-xl font-black text-slate-900 leading-none tabular-nums">{pctTxt(cjDesp, stats.cajasFisicasHoy)}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">despachado</div>
                    </>
                  }
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { l: 'CJ planificadas', v: stats.cajasFisicasHoy, c: '#94a3b8' },
                  { l: 'Despachadas', v: cjDesp, c: PD.marino },
                  { l: 'Por despachar', v: cjPorDespachar, c: PD.cieloSuave },
                ].map((x) => (
                  <div key={x.l} className="rounded-xl border border-slate-200 p-2.5 min-w-0">
                    <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-500 truncate">
                      <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ backgroundColor: x.c }} />
                      {x.l}
                    </div>
                    <div className="text-lg sm:text-xl font-black text-slate-900 tabular-nums mt-1">{n0(x.v)}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
          <Card title="Requiere atención" sub="Lo que hay que resolver ahora" icon={<AlertTriangle className="w-4 h-4 text-slate-500" />}>
            <ul className="divide-y divide-slate-100 -my-1">
              {alertas.map((a) => (
                <li key={a.k} className="flex items-center gap-3 py-2.5" title={a.k === 'atr' && atrasadas.length ? atrasadas.slice(0, 15).map(({ r, h }) => `${r.id} · ${r.agencia} · ${Math.floor(h)} h`).join('\n') : undefined}>
                  <span className="min-w-[2.75rem] h-9 px-2 rounded-xl flex items-center justify-center text-base font-black tabular-nums" style={{ backgroundColor: `${a.c}1A`, color: a.c }}>
                    {n0(a.n)}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-800 leading-tight">{a.t}</div>
                    <div className="text-[11px] text-slate-500 truncate">{a.d}</div>
                  </div>
                </li>
              ))}
            </ul>
            {variasAg && masAtrasadas.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 mb-2">Agencias con menor avance</div>
                <div className="space-y-1">
                  {masAtrasadas.map((a) => {
                    const p = a.desp / a.rutas;
                    return (
                      <ConTip
                        key={a.ag}
                        titulo={a.ag}
                        alinear="der"
                        lineas={[
                          ['Rutas despachadas', `${n0(a.desp)} de ${n0(a.rutas)}`],
                          ['Por asignar', n0(a.porAsig)],
                          ['A piso', n0(a.piso)],
                          ['CJ por despachar', n0(a.cj - a.cjDesp)],
                        ]}
                        className="grid items-center gap-2 rounded-lg px-1 py-1 hover:bg-slate-50 cursor-default"
                        style={{ gridTemplateColumns: 'minmax(0, 7rem) 1fr 2.75rem' }}
                      >
                        <span className="text-xs font-semibold text-slate-800 truncate">{a.ag}</span>
                        <span className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: PD.pista }}>
                          <span className="block h-full rounded-full" style={{ width: `${p * 100}%`, backgroundColor: p < 0.6 ? PD.rojo : PD.oro }} />
                        </span>
                        <span className="text-right text-xs font-bold tabular-nums" style={{ color: p < 0.6 ? PD.rojo : PD.oroTexto }}>{Math.round(p * 100)}%</span>
                      </ConTip>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Hora de asignación + planificación por día */}
        <div className={`grid grid-cols-1 gap-4 ${!unDia ? 'lg:grid-cols-2' : ''}`}>
          <Card
            title="Hora de asignación"
            sub={
              barrasHora.length
                ? `Rutas según la hora en que se les asignó camión y tripulación${unDia ? '' : ` · suma de los ${n0(periodDays.length)} días`}${horaPico ? ` · pico ${horaPico.label} (${n0(horaPico.value)} rutas)` : ''}${sinHoraAct ? ` · ${n0(sinHoraAct)} despachada(s) sin hora registrada` : ''}`
                : 'Aún no hay rutas asignadas en el periodo'
            }
            icon={<Clock className="w-4 h-4 text-slate-500" />}
          >
            {barrasHora.length ? <ComboHoras data={barrasHora} nombrePrev={nombrePrev} /> : <p className="py-6 text-center text-xs text-slate-400">Sin asignaciones registradas en el periodo.</p>}
          </Card>
          {!unDia && (
            <Card
              title={`CJ ${porSemana ? 'por semana' : 'por día'}`}
              sub={`${n0(stats.cajasFisicasHoy)} CJ planificadas en ${n0(totalPlan)} rutas · ${n0(cjDesp)} despachadas (${pctTxt(cjDesp, stats.cajasFisicasHoy)}) · por fecha de ruta`}
              icon={<Layers className="w-4 h-4 text-slate-500" />}
            >
              <ColApiladas data={colsDia} fmt={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : n0(v))} />
            </Card>
          )}
        </div>

        {/* Asignación por agencia y hora */}
        {variasAg && mapaAg.lista.length > 0 && asignHoras.act.mins.length > 0 && (
          <Card
            title="Asignación por agencia y hora"
            sub={`Rutas asignadas en cada hora${unDia ? '' : ` (suma de los ${n0(periodDays.length)} días)`} · más oscuro = más rutas · ordenadas de menor a mayor avance`}
            icon={<Clock className="w-4 h-4 text-slate-500" />}
            right={
              <div className="hidden sm:flex items-center gap-1 text-[10px] text-slate-500 shrink-0">
                <span>0</span>
                {[PD.pista, PD.cieloSuave, '#8fb3e6', PD.azul, PD.marino].map((c) => (
                  <span key={c} className="w-4 h-2.5 rounded-[3px]" style={{ backgroundColor: c }} />
                ))}
                <span>más</span>
              </div>
            }
          >
            <div className="space-y-1">
              <div className="grid gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500" style={{ gridTemplateColumns: `minmax(4.5rem, 9rem) repeat(${mapaAg.lista.length}, minmax(0, 1fr)) 2.75rem` }}>
                <span>Agencia</span>
                {mapaAg.lista.map((h) => (
                  <span key={h} className="text-center truncate">{etiquetaHora(h).replace(':00', '')}</span>
                ))}
                <span className="text-right">Avance</span>
              </div>
              {mapaAg.filas.map((f) => {
                const p = f.rutas ? f.desp / f.rutas : 0;
                const N = mapaAg.lista.length;
                return (
                  <div key={f.ag} className="grid gap-1 items-center" style={{ gridTemplateColumns: `minmax(4.5rem, 9rem) repeat(${N}, minmax(0, 1fr)) 2.75rem` }}>
                    <span className="text-xs font-semibold text-slate-800 truncate">{f.ag}</span>
                    {f.celdas.map((c, i) => (
                      <ConTip
                        key={c.h}
                        titulo={`${f.ag} · ${c.h < 0 ? 'asignadas el día anterior' : c.h >= 24 ? 'asignadas después' : `${etiquetaHora(c.h)} – ${etiquetaHora(c.h).replace(':00', ':59')}`}`}
                        alinear={i > N / 2 ? 'der' : 'izq'}
                        lineas={[
                          ['Rutas asignadas', n0(c.n)],
                          ['CJ de esas rutas', n0(c.cj)],
                          ['Acumulado de la agencia', `${n0(c.acum)} de ${n0(f.rutas)} (${pctTxt(c.acum, f.rutas)})`],
                          ['Todas las agencias en esa hora', `${n0(mapaAg.totHora.get(c.h) || 0)} rutas`],
                        ]}
                        className="cursor-default"
                      >
                        <div
                          className="h-7 rounded-md flex items-center justify-center text-[10.5px] font-bold tabular-nums hover:ring-2 hover:ring-slate-800 hover:ring-inset"
                          style={{ backgroundColor: tonoCelda(c.n), color: c.n / mapaAg.max >= 0.5 ? '#fff' : '#0f172a' }}
                        >
                          {c.n || ''}
                        </div>
                      </ConTip>
                    ))}
                    <span className="text-right text-xs font-bold tabular-nums" style={{ color: p >= 0.9 ? PD.verde : p >= 0.6 ? PD.oroTexto : PD.rojo }}>{Math.round(p * 100)}%</span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Agencias y segmentos: largo de la barra = CJ planificadas; relleno = despachado */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card
            title="Avance por agencia"
            sub={`Largo = ${medidaAg === 'cj' ? 'CJ planificadas' : 'rutas planificadas'} · azul = despachado · ámbar = pendiente`}
            icon={<Building2 className="w-4 h-4 text-slate-500" />}
            right={
              <div className="flex items-center gap-1.5 shrink-0">
                {!verTablaAg && (
                  <div className="flex rounded-lg bg-slate-100 p-0.5" role="tablist" aria-label="Medida">
                    {(['cj', 'rutas'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="tab"
                        aria-selected={medidaAg === m}
                        onClick={() => setMedidaAg(m)}
                        className={`min-h-[28px] px-2.5 rounded-md text-[11px] font-semibold cursor-pointer ${medidaAg === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                      >
                        {m === 'cj' ? 'CJ' : 'Rutas'}
                      </button>
                    ))}
                  </div>
                )}
                <button type="button" onClick={() => setVerTablaAg((v) => !v)} className="min-h-[32px] px-2.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">
                  {verTablaAg ? 'Ver gráfica' : 'Ver tabla'}
                </button>
              </div>
            }
          >
            {resumenAg.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">Sin rutas en el periodo.</p>
            ) : !verTablaAg ? (
              <div className="divide-y divide-slate-50">
                {resumenAg.map((a) => (
                  <ApiladaFila
                    key={a.ag}
                    label={a.ag}
                    sub={`${n0(a.rutas)} rutas${variasAg ? ` · ${pctTxt(a.cj, partTotCj)} de las CJ` : ''}${a.porAsig ? ` · ${a.porAsig} por asignar` : ''}`}
                    plan={medidaAg === 'cj' ? a.cj : a.rutas}
                    hecho={medidaAg === 'cj' ? a.cjDesp : a.desp}
                    maxPlan={maxAg}
                    titulo={`${a.ag} · ${a.rutas ? (a.desp / a.rutas >= 0.9 ? 'al día' : a.desp / a.rutas >= 0.6 ? 'en curso' : 'atrasada') : ''}`}
                    lineas={[
                      ['Rutas despachadas', `${n0(a.desp)} de ${n0(a.rutas)} (${pctTxt(a.desp, a.rutas)})`],
                      ['CJ despachadas', `${n0(a.cjDesp)} de ${n0(a.cj)} (${pctTxt(a.cjDesp, a.cj)})`],
                      ['CJ por despachar', n0(a.cj - a.cjDesp)],
                      ...(variasAg ? ([['Participación', `${pctTxt(a.rutas, partTotRutas)} rutas · ${pctTxt(a.cj, partTotCj)} CJ`]] as Lineas) : []),
                      ['Por asignar · a piso', `${n0(a.porAsig)} · ${n0(a.piso)}`],
                      ['Hora pico de asignación', picoAg.get(a.ag) || '—'],
                      ...(a.atras ? ([['Con más de 24 h', n0(a.atras)]] as Lineas) : []),
                    ]}
                  />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs min-w-[560px]">
                  <thead>
                    <tr className="text-[10.5px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                      <th className="text-left py-2 px-2">Agencia</th>
                      <th className="text-right py-2 px-2">Rutas</th>
                      {variasAg && <th className="text-right py-2 px-2">% CJ</th>}
                      <th className="text-right py-2 px-2">CJ plan</th>
                      <th className="text-right py-2 px-2">Despachadas</th>
                      <th className="text-right py-2 px-2">CJ desp.</th>
                      <th className="text-right py-2 px-2">Por asignar</th>
                      <th className="text-right py-2 px-2">A piso</th>
                      <th className="text-right py-2 px-2">+24 h</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resumenAg.map((a) => (
                      <tr key={a.ag} className="hover:bg-slate-50">
                        <td className="py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">{a.ag}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{n0(a.rutas)}</td>
                        {variasAg && <td className="py-2 px-2 text-right tabular-nums text-slate-500">{pctTxt(a.cj, partTotCj)}</td>}
                        <td className="py-2 px-2 text-right tabular-nums font-semibold">{n0(a.cj)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{n0(a.desp)} <span className="text-slate-400">({pctTxt(a.desp, a.rutas)})</span></td>
                        <td className="py-2 px-2 text-right tabular-nums">{n0(a.cjDesp)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{a.porAsig || '—'}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{a.piso || '—'}</td>
                        <td className="py-2 px-2 text-right tabular-nums font-bold" style={{ color: a.atras ? PD.rojo : undefined }}>{a.atras || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  {variasAg && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 font-black text-slate-900">
                        <td className="py-2 px-2">Total</td>
                        <td className="py-2 px-2 text-right tabular-nums">{n0(partTotRutas)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">100%</td>
                        <td className="py-2 px-2 text-right tabular-nums">{n0(partTotCj)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{n0(despachadas)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{n0(cjDesp)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{resumenAg.reduce((s, a) => s + a.porAsig, 0) || '—'}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{resumenAg.reduce((s, a) => s + a.piso, 0) || '—'}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{resumenAg.reduce((s, a) => s + a.atras, 0) || '—'}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </Card>
          <Card title="Avance por segmento" sub="Dona = parte de las CJ de cada segmento · barras: azul = despachado, ámbar = pendiente" icon={<Layers className="w-4 h-4 text-slate-500" />}>
            {segDespacho.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">Sin rutas en el periodo.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 sm:gap-5 items-center">
                <div className="flex justify-center">
                  <Dona
                    size={150}
                    grosor={20}
                    unidad=" CJ"
                    segs={segDona}
                    activo={segActivo}
                    onActivo={setSegActivo}
                    centro={
                      segAct ? (
                        <>
                          <div className="text-xl font-black text-slate-900 leading-none tabular-nums">{pctTxt(segAct.cj, segTotCj)}</div>
                          <div className="text-[10.5px] font-semibold text-slate-600 mt-1 max-w-[6.5rem] truncate">{segAct.seg}</div>
                          <div className="text-[10px] text-slate-500">{n0(segAct.cj)} CJ</div>
                        </>
                      ) : (
                        <>
                          <div className="text-xl font-black text-slate-900 leading-none tabular-nums">{n0(segTotCj)}</div>
                          <div className="text-[10.5px] text-slate-500 mt-1">CJ planificadas</div>
                        </>
                      )
                    }
                  />
                </div>
                <div className="divide-y divide-slate-50 min-w-0">
                  {segDespacho.map((s, i) => (
                    <div
                      key={s.seg}
                      className="transition-opacity"
                      style={{ opacity: segActivo && segActivo !== s.seg ? 0.45 : 1 }}
                      onMouseEnter={() => setSegActivo(s.seg)}
                      onMouseLeave={() => setSegActivo(null)}
                    >
                      <ApiladaFila
                        label={s.seg}
                        sub={`${n0(s.rutas)} rutas · ${pctTxt(s.cj, segTotCj)} de las CJ`}
                        plan={s.cj}
                        hecho={s.cjDesp}
                        maxPlan={maxCjSeg}
                        titulo={s.seg}
                        punto={segColores[i % segColores.length]}
                        lineas={[
                          ['CJ planificadas', `${n0(s.cj)} (${pctTxt(s.cj, segTotCj)} del total)`],
                          ['CJ despachadas', `${n0(s.cjDesp)} (${pctTxt(s.cjDesp, s.cj)})`],
                          ['CJ por despachar', n0(s.cj - s.cjDesp)],
                          ['Rutas despachadas', `${n0(s.desp)} de ${n0(s.rutas)}`],
                        ]}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Rutas parciales y camiones de apoyo */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card title="Flota del día" sub="Camiones y personal · estado actual del tablero" icon={<TruckIcon className="w-4 h-4 text-slate-500" />}>
            <div className="space-y-4">
              {flota.map((f) => (
                <div key={f.nombre}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-semibold text-slate-800">{f.nombre}</span>
                    <span className="text-slate-500 tabular-nums">{n0(f.tot)} activos</span>
                  </div>
                  {f.tot === 0 ? (
                    <p className="text-[11px] text-slate-400">Sin registros.</p>
                  ) : (
                    <div className="flex h-7 rounded-lg" style={{ backgroundColor: PD.pista }}>
                      {f.partes.map((x, i) => (
                        <ConTip
                          key={x.l}
                          titulo={`${f.nombre} · ${x.l}`}
                          alinear={i === 0 ? 'izq' : i === f.partes.length - 1 ? 'der' : 'centro'}
                          lineas={[
                            ['Cantidad', n0(x.n)],
                            ['% de los activos', pctTxt(x.n, f.tot)],
                            ...x.extra,
                          ]}
                          className={`h-full flex items-center justify-center text-[11px] font-bold tabular-nums cursor-default hover:brightness-95 ${i === 0 ? 'rounded-l-lg' : ''} ${i === f.partes.length - 1 ? 'rounded-r-lg' : ''}`}
                          style={{ width: `${x.p * 100}%`, backgroundColor: x.c, color: x.txt, minWidth: 6 }}
                        >
                          {x.p >= 0.08 ? n0(x.n) : ''}
                        </ConTip>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[10.5px] text-slate-500">
                    {f.partes.map((x) => (
                      <span key={x.l} className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-[2px]" style={{ backgroundColor: x.c }} />
                        {x.l} {n0(x.n)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card
            title="Rutas parciales"
            sub="Entregadas en parte, con cajas aún por entregar"
            icon={<PackageCheck className="w-4 h-4 text-slate-500" />}
            right={
              <div className="flex items-center gap-4 text-right shrink-0">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: PD.verde }}>Entregadas</div>
                  <div className="text-lg font-black tabular-nums" style={{ color: PD.verde }}>{n0(parcEnt)}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Pendientes</div>
                  <div className="text-lg font-black tabular-nums text-amber-700">{n0(parcPend)}</div>
                </div>
              </div>
            }
          >
            {parciales.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">Sin rutas parciales pendientes en el periodo.</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {parciales.slice(0, 12).map((x) => (
                  <ConTip
                    key={x.key}
                    titulo={`Ruta ${x.id} · ${x.ag}`}
                    alinear="der"
                    lineas={[
                      ['Tipo', x.tipo],
                      ['Estado', x.estado],
                      ['CJ entregadas', n0(x.ent)],
                      ['CJ pendientes', n0(x.pend)],
                      ['Avance', pctTxt(x.ent, x.ent + x.pend)],
                    ]}
                    className="rounded-lg hover:bg-slate-50 px-1 -mx-1 cursor-default"
                  >
                    <AvanceFila
                      label={`Ruta ${x.id}`}
                      sub={`${x.ag} · ${x.tipo} · ${n0(x.pend)} CJ pendientes`}
                      plan={x.ent + x.pend}
                      hecho={x.ent}
                      maxPlan={Math.max(1, ...parciales.map((y) => y.ent + y.pend))}
                      color={PD.verde}
                      nativo={false}
                    />
                  </ConTip>
                ))}
                {parciales.length > 12 && <p className="pt-2 text-[11px] text-slate-400">y {parciales.length - 12} más (todas salen en el PDF).</p>}
              </div>
            )}
          </Card>
          {apoyosPeriodo.total > 0 && (
            <Card title="Camiones de apoyo" sub={`${n0(apoyosPeriodo.total)} apoyo(s) · rutas que necesitaron un segundo camión`} icon={<TruckIcon className="w-4 h-4 text-slate-500" />}>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10.5px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                      <th className="text-left py-2 px-1">Agencia</th>
                      <th className="text-right py-2 px-1">Rutas</th>
                      <th className="text-right py-2 px-1">Apoyos</th>
                      <th className="text-right py-2 px-1">CJ</th>
                      <th className="text-right py-2 px-1">% desp.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {apoyosPeriodo.filas.map((f) => (
                      <tr key={f.ag}>
                        <td className="py-2 px-1 font-semibold text-slate-800">{f.ag}</td>
                        <td className="py-2 px-1 text-right tabular-nums">{n0(f.rutas)}</td>
                        <td className="py-2 px-1 text-right tabular-nums font-semibold">{n0(f.apoyos)}</td>
                        <td className="py-2 px-1 text-right tabular-nums">{f.cajas ? n1(f.cajas) : '—'}</td>
                        <td className="py-2 px-1 text-right tabular-nums font-bold">{pctTxt(f.rutas, f.despachadas)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">Por motivo: {apoyosPeriodo.motivos.map(([m, n]) => `${m} ${n0(n)}`).join(' · ')}</p>
            </Card>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Encabezado + periodo en una sola barra */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 leading-tight">{esLiq ? 'Liquidación de rutas' : 'Dashboard de Despacho'}</h2>
            <p className="text-xs text-slate-500 mt-0.5" title="Se analizan las rutas cuya fecha de ruta cae en el periodo (liquidadas y pendientes). Camiones y personal muestran el estado actual.">
              <span className="font-semibold text-slate-700">{periodLabel}</span> · Agencia:{' '}
              <span className="font-semibold text-slate-700">{selectedAgency === 'TODAS' ? etiquetaTodas : selectedAgency}</span> · {n0(totalPlan)} rutas planificadas
            </p>
          </div>
          <div role="tablist" aria-label="Periodo del dashboard" className="inline-flex flex-wrap gap-1 bg-slate-100 rounded-xl p-1">
            {([
              ['hoy', 'Hoy'],
              ['ayer', 'Ayer'],
              ['7d', '7 días'],
              ['rango', 'Rango'],
              ['mes', 'Mes'],
            ] as [PeriodKind, string][]).map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={kind === k}
                onClick={() => setKind(k)}
                className={`min-h-[36px] px-3 rounded-lg text-xs sm:text-sm font-semibold cursor-pointer ${kind === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        {(kind === 'rango' || kind === 'mes') && (
          <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
            {kind === 'rango' ? (
              <>
                <label className="flex items-center gap-1 font-semibold text-slate-600">
                  Desde
                  <input type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} className="min-h-[36px] px-2 border border-slate-300 rounded-lg bg-white" />
                </label>
                <label className="flex items-center gap-1 font-semibold text-slate-600">
                  Hasta
                  <input type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} className="min-h-[36px] px-2 border border-slate-300 rounded-lg bg-white" />
                </label>
              </>
            ) : (
              <label className="flex items-center gap-1 font-semibold text-slate-600">
                Mes
                <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="min-h-[36px] px-2 border border-slate-300 rounded-lg bg-white" />
              </label>
            )}
          </div>
        )}
        {fueraDeHistorial && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            Solo están cargados los últimos {historyLimitedDays} días del historial; el periodo elegido puede salir incompleto.
            {onLoadFullHistory && (
              <button type="button" onClick={onLoadFullHistory} disabled={isLoadingFullHistory} className="font-bold underline cursor-pointer disabled:opacity-50">
                {isLoadingFullHistory ? 'Cargando historial…' : 'Cargar historial completo'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 1. Seis indicadores clave */}
      {!esLiq ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi
            label="Rutas planificadas"
            value={n0(totalPlan)}
            accent={C_INFO}
            sub={`${n0(stats.cajasFisicasHoy)} CJ planificadas`}
            icon={<TruckIcon className="w-4 h-4" />}
          />
          <Kpi
            label="Despachadas"
            value={n0(despachadas)}
            progress={totalPlan > 0 ? despachadas / totalPlan : undefined}
            accent={C_GOOD}
            sub={`${pctTxt(despachadas, totalPlan)} de las planificadas`}
            icon={<CheckCircle2 className="w-4 h-4" />}
          />
          <Kpi
            label="Por asignar"
            value={n0(stats.pendientes)}
            accent={stats.pendientes ? C_WARN : C_GOOD}
            sub={`${n0(stats.pisoHoy)} a piso${bolsonCount ? ` · ${n0(bolsonCount)} en bolsón` : ''}`}
            icon={<Clock className="w-4 h-4" />}
          />
          <Kpi
            label="CJ despachadas"
            value={n0(cjDesp)}
            progress={stats.cajasFisicasHoy > 0 ? Math.min(1, cjDesp / stats.cajasFisicasHoy) : undefined}
            accent={C_INFO}
            sub={`${pctTxt(cjDesp, stats.cajasFisicasHoy)} de ${n0(stats.cajasFisicasHoy)} CJ`}
            icon={<Layers className="w-4 h-4" />}
          />
          <Kpi
            label="En ruta"
            value={n0(enOperacion)}
            accent={C_INFO}
            sub={`${n0(stats.transito)} en tránsito · ${n0(stats.abiertas)} abiertas`}
            icon={<TruckIcon className="w-4 h-4" />}
          />
          <Kpi
            label="Flota en ruta"
            value={`${Math.round(utilFlota * 100)}%`}
            progress={utilFlota}
            accent={C_INFO}
            sub={`${n0(truckEnRuta)} de ${n0(truckActivos.length)} camiones · ${n0(staffEnRuta)} personas`}
            icon={<Users className="w-4 h-4" />}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi
            label="Rutas liquidadas"
            value={n0(stats.liquidadas)}
            accent={C_GOOD}
            sub={`de ${n0(totalPlan)} planificadas`}
            icon={<CheckCircle2 className="w-4 h-4" />}
          />
          <Kpi
            label="Cumplimiento"
            value={`${Math.round(cumplimiento * 100)}%`}
            progress={cumplimiento}
            accent={cumplStatus.c}
            status={cumplStatus.t}
            sub="rutas liquidadas / planificadas"
            icon={<Target className="w-4 h-4" />}
          />
          <Kpi
            label="CJ entregadas"
            value={n0(cjEnt)}
            accent={C_GOOD}
            sub={`${pctTxt(cjEnt, stats.cajasFisicasHoy)} de ${n0(stats.cajasFisicasHoy)} CJ planificadas`}
            icon={<PackageCheck className="w-4 h-4" />}
          />
          <Kpi
            label="CJ devueltas"
            value={n0(cjDev)}
            accent={cjDev ? C_SERIOUS : C_GOOD}
            sub={`${n0(motTotRutas)} ruta(s) con devolución`}
            icon={<PackageX className="w-4 h-4" />}
          />
          <Kpi
            label="Efectividad"
            value={cjEnt + cjDev > 0 ? `${(efectividad * 100).toFixed(1)}%` : '—'}
            progress={cjEnt + cjDev > 0 ? efectividad : undefined}
            accent={cjEnt + cjDev > 0 ? efStatus.c : C_INFO}
            status={cjEnt + cjDev > 0 ? efStatus.t : undefined}
            sub="CJ entregadas / (entregadas + devueltas)"
            icon={<Target className="w-4 h-4" />}
          />
          <Kpi
            label="Por liquidar"
            value={n0(enOperacion)}
            accent={enOperacion ? C_WARN : C_GOOD}
            sub={`${n0(stats.transito)} en tránsito · ${n0(stats.abiertas)} abiertas`}
            icon={<Clock className="w-4 h-4" />}
          />
        </div>
      )}

      {/* 2. Avance + lo que requiere atención */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card
          title={esLiq ? (isHoy ? 'Cierre del día' : 'Cierre del periodo') : isHoy ? 'Salida del día' : 'Salida del periodo'}
          sub={esLiq ? 'Rutas liquidadas y cajas entregadas' : 'Rutas y cajas planificadas que ya salieron'}
          icon={<CheckCircle2 className="w-4 h-4 text-slate-500" />}
          className="lg:col-span-2"
        >
          <div className="space-y-2.5">
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Rutas</div>
            <HBar label="Planificadas" value={totalPlan} max={Math.max(1, totalPlan)} color={C_INFO} display={n0(totalPlan)} valueWidth="w-24" />
            {esLiq ? (
              <HBar label="Liquidadas" value={stats.liquidadas} max={Math.max(1, totalPlan)} color={C_GOOD} display={`${n0(stats.liquidadas)} · ${pctTxt(stats.liquidadas, totalPlan)}`} valueWidth="w-24" />
            ) : (
              <>
                <HBar label="Despachadas" value={despachadas} max={Math.max(1, totalPlan)} color={C_GOOD} display={`${n0(despachadas)} · ${pctTxt(despachadas, totalPlan)}`} valueWidth="w-24" />
                <HBar label="Por asignar" value={stats.pendientes} max={Math.max(1, totalPlan)} color={C_WARN} display={`${n0(stats.pendientes)} · ${pctTxt(stats.pendientes, totalPlan)}`} valueWidth="w-24" />
              </>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 space-y-2.5">
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Cajas (CJ)</div>
            <HBar label="Planificadas" value={stats.cajasFisicasHoy} max={Math.max(1, stats.cajasFisicasHoy)} color={C_INFO} display={n0(stats.cajasFisicasHoy)} valueWidth="w-24" />
            {esLiq ? (
              <>
                <HBar label="Entregadas" value={cjEnt} max={Math.max(1, stats.cajasFisicasHoy)} color={C_GOOD} display={`${n0(cjEnt)} · ${pctTxt(cjEnt, stats.cajasFisicasHoy)}`} valueWidth="w-24" />
                <HBar label="Devueltas" value={cjDev} max={Math.max(1, stats.cajasFisicasHoy)} color={C_SERIOUS} display={`${n0(cjDev)} · ${pctTxt(cjDev, stats.cajasFisicasHoy)}`} valueWidth="w-24" />
              </>
            ) : (
              <>
                <HBar label="Despachadas" value={cjDesp} max={Math.max(1, stats.cajasFisicasHoy)} color={C_GOOD} display={`${n0(cjDesp)} · ${pctTxt(cjDesp, stats.cajasFisicasHoy)}`} valueWidth="w-24" />
                <HBar label="Por despachar" value={Math.max(0, stats.cajasFisicasHoy - cjDesp)} max={Math.max(1, stats.cajasFisicasHoy)} color={C_WARN} display={`${n0(Math.max(0, stats.cajasFisicasHoy - cjDesp))} · ${pctTxt(Math.max(0, stats.cajasFisicasHoy - cjDesp), stats.cajasFisicasHoy)}`} valueWidth="w-24" />
              </>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-x-5 gap-y-2">
            {estadoChips.map((x) => (
              <div key={x.l} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: x.c }} />
                <span className="text-slate-500">{x.l}</span>
                <span className="font-black text-slate-900 tabular-nums">{n0(x.v)}</span>
              </div>
            ))}
          </div>
        </Card>
        {esLiq ? (
          <Card title={unDia ? 'Efectividad por agencia' : `Efectividad · ${tendTxt}`} sub={`${cjEnt + cjDev > 0 ? `${(efectividad * 100).toFixed(1)}%` : '—'} en el periodo`} icon={<PackageCheck className="w-4 h-4 text-slate-500" />}>
            {unDia ? (
              <div className="space-y-2.5">
                {porAgencia
                  .filter((a) => a.efect !== null)
                  .map((a) => (
                    <HBar key={a.ag} label={a.ag} value={(a.efect || 0) * 100} max={100} color={C_GOOD} display={`${((a.efect || 0) * 100).toFixed(1)}%`} />
                  ))}
                {porAgencia.every((a) => a.efect === null) && <p className="text-xs text-slate-400">Sin liquidaciones en el periodo.</p>}
              </div>
            ) : (
              <Columns data={trendEfect} color={C_GOOD} fmt={(v) => `${Math.round(v)}%`} maxValue={100} />
            )}
          </Card>
        ) : (
          <Card title="Requiere atención" sub="Lo que hay que resolver ahora" icon={<AlertTriangle className="w-4 h-4 text-slate-500" />}>
            <ul className="divide-y divide-slate-100 -my-1">
              {alertas.map((a) => (
                <li key={a.k} className="flex items-center gap-3 py-2.5" title={a.k === 'atr' && atrasadas.length ? atrasadas.slice(0, 15).map(({ r, h }) => `${r.id} · ${r.agencia} · ${Math.floor(h)} h`).join('\n') : undefined}>
                  <span className="min-w-[2.75rem] h-9 px-2 rounded-xl flex items-center justify-center text-base font-black tabular-nums" style={{ backgroundColor: `${a.c}1A`, color: a.c }}>
                    {n0(a.n)}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-800 leading-tight">{a.t}</div>
                    <div className="text-[11px] text-slate-500 truncate">{a.d}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {/* 3. Planificación por día (despacho, varios días) */}
      {!esLiq && !unDia && (
        <Card title={`CJ planificadas ${porSemana ? 'por semana' : 'por día'}`} sub={`${n0(stats.cajasFisicasHoy)} CJ en ${n0(totalPlan)} rutas · por fecha de ruta`} icon={<Layers className="w-4 h-4 text-slate-500" />}>
          <Columns data={trendPlan} color={C_INFO} fmt={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : n0(v))} />
        </Card>
      )}

      {/* 4. Resumen por agencia (una sola tabla) */}
      <Card
        title="Resumen por agencia"
        sub={`${periodLabel}${variasAg ? ' · % del total y de mayor a menor por CJ' : ''}`}
        icon={<Building2 className="w-4 h-4 text-slate-500" />}
      >
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="text-left py-2 px-2">Agencia</th>
                <th className="text-right py-2 px-2">Rutas</th>
                {variasAg && <th className="text-right py-2 px-2">% rutas</th>}
                <th className="text-right py-2 px-2">CJ plan</th>
                {variasAg && <th className="text-left py-2 px-2 w-36">% CJ</th>}
                {esLiq ? (
                  <>
                    <th className="text-left py-2 px-2 w-40">Cumplimiento</th>
                    <th className="text-right py-2 px-2">CJ entregadas</th>
                    <th className="text-right py-2 px-2">CJ devueltas</th>
                    <th className="text-right py-2 px-2">Efectividad</th>
                  </>
                ) : (
                  <>
                    <th className="text-left py-2 px-2 w-40">Despachadas</th>
                    <th className="text-right py-2 px-2">CJ despachadas</th>
                    <th className="text-right py-2 px-2">Por asignar</th>
                    <th className="text-right py-2 px-2">A piso</th>
                    <th className="text-right py-2 px-2" title="Rutas sin liquidar con más de 24 h">+24 h</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {resumenAg.map((a) => {
                const pDesp = a.rutas ? a.desp / a.rutas : 0;
                return (
                  <tr key={a.ag} className="hover:bg-slate-50">
                    <td className="py-2.5 px-2 font-semibold text-slate-800 whitespace-nowrap">{a.ag}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">{n0(a.rutas)}</td>
                    {variasAg && <td className="py-2.5 px-2 text-right tabular-nums text-slate-500">{pctTxt(a.rutas, partTotRutas)}</td>}
                    <td className="py-2.5 px-2 text-right tabular-nums font-semibold">{n0(a.cj)}</td>
                    {variasAg && (
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: C_TRACK }}>
                            <div className="h-full rounded-full" style={{ width: `${partTotCj > 0 ? (a.cj / partTotCj) * 100 : 0}%`, backgroundColor: C_INFO }} />
                          </div>
                          <span className="w-11 text-right font-bold tabular-nums" style={{ color: C_INFO }}>{pctTxt(a.cj, partTotCj)}</span>
                        </div>
                      </td>
                    )}
                    {esLiq ? (
                      <>
                        <td className="py-2.5 px-2">
                          <div className="flex items-center gap-2" title={`${a.liq} de ${a.rutas} liquidadas`}>
                            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: C_TRACK }}>
                              <div className="h-full rounded-full" style={{ width: `${a.cumpl * 100}%`, backgroundColor: a.cumpl >= 0.9 ? C_GOOD : a.cumpl >= 0.7 ? C_WARN : C_INFO }} />
                            </div>
                            <span className="w-9 text-right font-bold tabular-nums">{Math.round(a.cumpl * 100)}%</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums">{n0(a.ent)}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums" style={{ color: a.dev ? C_SERIOUS : undefined }}>{a.dev ? n0(a.dev) : '—'}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums font-semibold" style={{ color: a.efect === null ? undefined : a.efect >= 0.97 ? C_GOOD : a.efect >= 0.9 ? '#b7791f' : C_SERIOUS }}>
                          {a.efect === null ? '—' : `${(a.efect * 100).toFixed(1)}%`}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2.5 px-2">
                          <div className="flex items-center gap-2" title={`${a.desp} de ${a.rutas} despachadas`}>
                            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: C_TRACK }}>
                              <div className="h-full rounded-full" style={{ width: `${pDesp * 100}%`, backgroundColor: pDesp >= 0.9 ? C_GOOD : pDesp >= 0.6 ? C_INFO : C_WARN }} />
                            </div>
                            <span className="w-9 text-right font-bold tabular-nums">{Math.round(pDesp * 100)}%</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right tabular-nums">{n0(a.cjDesp)}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums font-semibold" style={{ color: a.porAsig ? '#b7791f' : undefined }}>{a.porAsig || '—'}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums">{a.piso || '—'}</td>
                        <td className="py-2.5 px-2 text-right tabular-nums font-bold" style={{ color: a.atras ? C_CRIT : undefined }}>{a.atras || '—'}</td>
                      </>
                    )}
                  </tr>
                );
              })}
              {resumenAg.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-6 text-center text-slate-400">Sin rutas en el periodo.</td>
                </tr>
              )}
            </tbody>
            {variasAg && (
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-black text-slate-900">
                  <td className="py-2.5 px-2">Total</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{n0(partTotRutas)}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">100%</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{n0(partTotCj)}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">100%</td>
                  {esLiq ? (
                    <>
                      <td className="py-2.5 px-2 text-right tabular-nums">{pctTxt(stats.liquidadas, totalPlan)}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums">{n0(cjEnt)}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums">{n0(cjDev)}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums">{cjEnt + cjDev > 0 ? `${(efectividad * 100).toFixed(1)}%` : '—'}</td>
                    </>
                  ) : (
                    <>
                      <td className="py-2.5 px-2 text-right tabular-nums">{pctTxt(despachadas, totalPlan)}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums">{n0(cjDesp)}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums">{resumenAg.reduce((s, a) => s + a.porAsig, 0) || '—'}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums">{resumenAg.reduce((s, a) => s + a.piso, 0) || '—'}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums">{resumenAg.reduce((s, a) => s + a.atras, 0) || '—'}</td>
                    </>
                  )}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* 5. Segmentos + rutas parciales (despacho) */}
      {!esLiq && (
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <Card title="Por segmento" sub={`${periodLabel} · % del total`} icon={<Layers className="w-4 h-4 text-slate-500" />} className="xl:col-span-2">
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
        <Card
          title="Rutas parciales"
          sub="Entregadas en parte, con cajas aún por entregar"
          icon={<PackageCheck className="w-4 h-4 text-slate-500" />}
          className="xl:col-span-3"
          right={
            <div className="flex items-center gap-4 text-right shrink-0">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: C_GOOD }}>Entregadas</div>
                <div className="text-lg font-black tabular-nums" style={{ color: C_GOOD }}>{n0(parcEnt)}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Pendientes</div>
                <div className="text-lg font-black tabular-nums text-amber-700">{n0(parcPend)}</div>
              </div>
            </div>
          }
        >
          {parciales.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">Sin rutas parciales pendientes en el periodo.</p>
          ) : (
            <div className="overflow-x-auto -mx-1 max-h-[340px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-[10.5px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    <th className="text-left py-2 px-1">Ruta</th>
                    <th className="text-left py-2 px-1">Agencia</th>
                    <th className="text-left py-2 px-1">Tipo</th>
                    <th className="text-right py-2 px-1">Entregadas</th>
                    <th className="text-right py-2 px-1">Pendientes</th>
                    <th className="text-left py-2 px-1 w-32">Avance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parciales.map((x) => {
                    const av = x.ent + x.pend > 0 ? x.ent / (x.ent + x.pend) : 0;
                    return (
                      <tr key={x.key} className="hover:bg-slate-50">
                        <td className="py-2 px-1 font-mono font-bold text-slate-800">{x.id}</td>
                        <td className="py-2 px-1 whitespace-nowrap">
                          <div className="font-semibold text-slate-800">{x.ag}</div>
                          <div className="text-[10.5px] text-slate-500">{x.seg}</div>
                        </td>
                        <td className="py-2 px-1">
                          <div className="text-slate-700">{x.tipo}</div>
                          <div className="text-[10.5px] text-slate-500">{x.estado}</div>
                        </td>
                        <td className="py-2 px-1 text-right tabular-nums font-semibold" style={{ color: C_GOOD }}>{n0(x.ent)}</td>
                        <td className="py-2 px-1 text-right tabular-nums font-bold text-amber-700">{n0(x.pend)}</td>
                        <td className="py-2 px-1">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: C_TRACK }}>
                              <div className="h-full rounded-full" style={{ width: `${av * 100}%`, backgroundColor: C_GOOD }} />
                            </div>
                            <span className="w-9 text-right font-bold tabular-nums">{Math.round(av * 100)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      )}

      {/* 6. Motivos de devolución y rutas con mayor devolución (liquidación) */}
      {esLiq && (
      <>
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
                <tr
                  key={m.motivo}
                  className={`cursor-help ${motivoAbierto?.motivo === m.motivo ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                  tabIndex={0}
                  onMouseEnter={(e) => abrirMotivo(m.motivo, e.currentTarget)}
                  onMouseLeave={cerrarMotivo}
                  onFocus={(e) => abrirMotivo(m.motivo, e.currentTarget)}
                  onBlur={cerrarMotivo}
                  onClick={(e) => (motivoAbierto?.motivo === m.motivo ? setMotivoAbierto(null) : abrirMotivo(m.motivo, e.currentTarget))}
                >
                  <td className="py-2 px-1 font-semibold text-slate-800">
                    {m.motivo}
                    <span className="ml-1.5 text-[10px] font-normal text-slate-400" data-no-pdf>
                      ver detalle
                    </span>
                  </td>
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
      {/* 6. Rutas con mayor devolución (doble clic = detalle, descarga a Excel) */}
      <DashboardDevoluciones liquidadas={liqPeriodo} periodLabel={periodLabel} />
      </>
      )}

      {/* 7. Camiones de apoyo (caminos angostos) */}
      {!esLiq && apoyosPeriodo.total > 0 && (
        <Card title="Camiones de apoyo" sub={`${periodLabel} · rutas que necesitaron un segundo camión`} icon={<TruckIcon className="w-4 h-4 text-slate-500" />}>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="text-left py-2 px-1">Agencia</th>
                  <th className="text-right py-2 px-1">Rutas con apoyo</th>
                  <th className="text-right py-2 px-1">Camiones de apoyo</th>
                  <th className="text-right py-2 px-1">CJ al apoyo</th>
                  <th className="text-right py-2 px-1">% de rutas despachadas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {apoyosPeriodo.filas.map((f) => (
                  <tr key={f.ag}>
                    <td className="py-2 px-1 font-semibold text-slate-800">{f.ag}</td>
                    <td className="py-2 px-1 text-right tabular-nums">{n0(f.rutas)}</td>
                    <td className="py-2 px-1 text-right tabular-nums font-semibold">{n0(f.apoyos)}</td>
                    <td className="py-2 px-1 text-right tabular-nums">{f.cajas ? n1(f.cajas) : '—'}</td>
                    <td className="py-2 px-1 text-right tabular-nums font-bold">{pctTxt(f.rutas, f.despachadas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Por motivo: {apoyosPeriodo.motivos.map(([m, n]) => `${m} ${n0(n)}`).join(' · ')}
          </p>
        </Card>
      )}

      {motivoAbierto && motivoSel && (
        <div
          data-no-pdf
          role="dialog"
          aria-label={`Detalle: ${motivoSel.motivo}`}
          onMouseEnter={() => window.clearTimeout(cierre.current)}
          onMouseLeave={cerrarMotivo}
          className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-2xl p-3 overflow-y-auto"
          style={{
            left: motivoAbierto.left,
            width: Math.min(560, window.innerWidth - 24),
            maxHeight: motivoAbierto.arriba ? Math.max(200, motivoAbierto.top - 12) : Math.max(200, window.innerHeight - motivoAbierto.top - 12),
            ...(motivoAbierto.arriba ? { bottom: window.innerHeight - motivoAbierto.top } : { top: motivoAbierto.top }),
          }}
        >
          <DetalleMotivoPanel motivo={motivoSel.motivo} cajas={motivoSel.cajas} detalle={motivoSel.detalle} />
        </div>
      )}
    </div>
  );
};
