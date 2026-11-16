import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Route, Truck } from '../types';
import { formatDateToGuatemala } from '../utils/date';
import {
  calcularSalidas,
  calcularStandby,
  resumirPorAgencia,
  AVISO_MENOS_T3,
  type Tarifario,
  type TarifarioDatos,
  type StandbyDia,
  type Salida,
  type StandbyCosto,
  type ResumenAgencia,
} from '../utils/costos';
import { TARIFARIO_BASE } from '../data/tarifarioBase';
import { cargarTarifarios, guardarTarifario, cargarManuales, guardarManual, cargarStandby } from '../services/costos';
import { TarifarioCostos } from './TarifarioCostos';
import type { ReportePdf } from '../utils/dashboardPdf';
import { AlertTriangle, Truck as TruckIcon, Users, Repeat, RefreshCw, TrendingUp, X } from 'lucide-react';

// --- TABLERO VENTAS y COSTOS (solo administradores generales) ---
// Para DISCARGA el costo de operación del cliente es su VENTA: venta estimada
// del mes = salidas ejecutadas (1er viaje, recargas, revisitas, camiones de
// apoyo) + standby de personal y camiones, con los valores del mes (COSTOS).
// modo 'ventas' = Tablero Ventas (Dashboard) · modo 'costos' = valores mes a
// mes (menú Otros › Costos).

interface Props {
  routes: Route[];
  historicalRoutes: Route[];
  trucks: Truck[];
  enFiltro?: (ag: string) => boolean;
  usuario: string;
  registrarReporte?: (armar: () => ReportePdf) => void;
  modo?: 'ventas' | 'costos';
}

const C = {
  marino: '#2C3790',
  viaje: '#2C3790',
  recarga: '#5AACE4',
  apoyo: '#8a63cf',
  stbPer: '#d9a521',
  stbCam: '#e5793b',
  verde: '#1a9e76',
  rojo: '#c84448',
  pista: '#eef2f7',
};
const Q = (v: number) => `Q${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const Qk = (v: number) =>
  Math.abs(v) >= 1e6 ? `Q${(v / 1e6).toFixed(2)} M` : Math.abs(v) >= 1e5 ? `Q${(v / 1e3).toFixed(0)} k` : Math.abs(v) >= 1e4 ? `Q${(v / 1e3).toFixed(1)} k` : Q(v);
const n0 = (v: number) => Math.round(v).toLocaleString('en-US');
const pct = (v: number, t: number) => (t > 0 ? `${((v / t) * 100).toFixed(1)}%` : '—');
const mesActual = () => {
  const d = formatDateToGuatemala(new Date());
  return `${d.slice(6, 10)}-${d.slice(3, 5)}`;
};
const mesAnterior = (mes: string) => {
  const [y, m] = mes.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};
const nombreMes = (mes: string) => {
  const [y, m] = mes.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const vigenteDe = (tarifarios: Map<string, Tarifario>, mes: string): { t: TarifarioDatos; origen: string } => {
  const t = tarifarios.get(mes);
  if (t) return { t, origen: `Valores de COSTOS de ${nombreMes(mes)}` };
  const ult = [...tarifarios.keys()].filter((k) => k < mes).sort().pop();
  if (ult) return { t: tarifarios.get(ult) as TarifarioDatos, origen: `Valores de COSTOS de ${nombreMes(ult)} (el mes no tiene propios)` };
  return { t: TARIFARIO_BASE, origen: 'Valores de COSTOS del Excel base' };
};

type Comp = 'viajesQ' | 'recargasQ' | 'apoyosQ' | 'stbPerQ' | 'stbCamQ';
const COMPONENTES: { k: Comp; l: string; c: string }[] = [
  { k: 'viajesQ', l: '1er viaje', c: C.viaje },
  { k: 'recargasQ', l: 'Recargas / revisitas', c: C.recarga },
  { k: 'apoyosQ', l: 'Camiones de apoyo', c: C.apoyo },
  { k: 'stbPerQ', l: 'Standby personal', c: C.stbPer },
  { k: 'stbCamQ', l: 'Standby camiones', c: C.stbCam },
];
type Totales = Record<Comp, number> & { total: number; viajesN: number; recargasN: number; apoyosN: number; stbPerN: number; stbCamN: number; pendientes: number };
const vacio = (): Totales => ({ viajesQ: 0, recargasQ: 0, apoyosQ: 0, stbPerQ: 0, stbCamQ: 0, total: 0, viajesN: 0, recargasN: 0, apoyosN: 0, stbPerN: 0, stbCamN: 0, pendientes: 0 });
const sumar = (filas: ResumenAgencia[]): Totales =>
  filas.reduce((a, r) => {
    (Object.keys(a) as (keyof Totales)[]).forEach((k) => ((a[k] as number) += (r as unknown as Record<string, number>)[k] || 0));
    return a;
  }, vacio());
const diaNum = (dia: string) => Number(dia.slice(0, 2));

// Globo de detalle (al pasar el cursor o tocar).
const Globo: React.FC<{ titulo: string; lineas: [string, string][]; className?: string; style?: React.CSSProperties }> = ({ titulo, lineas, className = '', style }) => (
  <div role="tooltip" data-no-pdf className={`absolute z-40 w-max min-w-[13rem] max-w-[min(20rem,85vw)] bg-slate-900 text-white rounded-xl shadow-xl px-3 py-2.5 text-[11.5px] leading-relaxed pointer-events-none ${className}`} style={style}>
    <div className="font-bold text-[12px] mb-1">{titulo}</div>
    {lineas.map(([k, v], i) => (
      <div key={`${k}${i}`} className={`flex justify-between gap-4 ${k.startsWith('Total') ? 'border-t border-white/20 mt-1 pt-1 font-bold' : ''}`}>
        <span className={k.startsWith('Total') ? '' : 'text-slate-300'}>{k}</span>
        <span className="font-semibold tabular-nums text-right">{v}</span>
      </div>
    ))}
  </div>
);

// Dona de composición con resaltado al pasar el cursor.
const DonaVenta: React.FC<{ tot: Totales; activo: Comp | null; onActivo: (k: Comp | null) => void }> = ({ tot, activo, onActivo }) => {
  const size = 176, grosor = 24, r = (size - grosor - 8) / 2, circ = 2 * Math.PI * r;
  let acum = 0;
  const act = COMPONENTES.find((c) => c.k === activo);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label="Composición de la venta">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.pista} strokeWidth={grosor} />
        {tot.total > 0 &&
          COMPONENTES.map((c) => {
            const v = tot[c.k];
            if (v <= 0) return null;
            const largo = (v / tot.total) * circ;
            const dash = Math.max(0.5, largo - 2);
            const off = -acum;
            acum += largo;
            return (
              <circle
                key={c.k}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={c.c}
                strokeWidth={activo === c.k ? grosor + 7 : grosor}
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={off}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                style={{ opacity: activo && activo !== c.k ? 0.35 : 1, transition: 'opacity .15s, stroke-width .15s', cursor: 'pointer' }}
                onMouseEnter={() => onActivo(c.k)}
                onMouseLeave={() => onActivo(null)}
                onClick={() => onActivo(activo === c.k ? null : c.k)}
              />
            );
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-6">
        {act ? (
          <>
            <div className="text-2xl font-black text-slate-900 leading-none tabular-nums">{pct(tot[act.k], tot.total)}</div>
            <div className="text-[11px] font-semibold text-slate-700 mt-1 leading-tight">{act.l}</div>
            <div className="text-[10.5px] text-slate-500 tabular-nums">{Qk(tot[act.k])}</div>
          </>
        ) : (
          <>
            <div className="text-xl font-black text-slate-900 leading-none tabular-nums">{Qk(tot.total)}</div>
            <div className="text-[10.5px] text-slate-500 mt-1">venta del mes</div>
          </>
        )}
      </div>
    </div>
  );
};

// Columnas de venta por día + línea acumulada y línea de proyección.
const VentaDiaria: React.FC<{ dias: { dia: number; t: Totales }[]; diasMes: number; hoy: number | null; total: number; proyeccion: number }> = ({ dias, diasMes, hoy, total, proyeccion }) => {
  const [h, setH] = useState<number | null>(null);
  const porDia = new Map<number, Totales>(dias.map((d: { dia: number; t: Totales }) => [d.dia, d.t] as [number, Totales]));
  const serie: Totales[] = Array.from({ length: diasMes }, (_, i) => porDia.get(i + 1) || vacio());
  const max = Math.max(1, ...serie.map((s) => s.total));
  const tope = Math.max(total, proyeccion, 1);
  let acum = 0;
  const acumulado = serie.map((s, i) => (hoy != null && i + 1 > hoy ? null : (acum += s.total)));
  const X = (i: number) => ((i + 0.5) / diasMes) * 100;
  const Y = (v: number) => 100 - (v / tope) * 92;
  const lAcum = acumulado.map((v, i) => (v == null ? null : `${X(i).toFixed(2)},${Y(v).toFixed(2)}`)).filter(Boolean).join(' ');
  const lProy = hoy != null ? `${X(0).toFixed(2)},${Y(0)} ${X(diasMes - 1).toFixed(2)},${Y(proyeccion).toFixed(2)}` : '';
  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 mb-2">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: C.recarga }} />Venta del día</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-[3px] rounded" style={{ backgroundColor: C.marino }} />Acumulado del mes (eje derecho)</span>
        {lProy && <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed" style={{ borderColor: C.verde }} />Ritmo para la proyección</span>}
      </div>
      <div className="relative h-52 pr-12">
        <div className="absolute right-0 top-0 bottom-0 w-12 whitespace-nowrap flex flex-col justify-between text-[10px] text-slate-400 tabular-nums text-right" style={{ top: 'calc(8% - 6px)', bottom: -6 }}>
          <span>{Qk(tope)}</span>
          <span>{Qk(tope / 2)}</span>
          <span>0</span>
        </div>
        <div className="relative h-full border-b border-slate-200">
          <div className="absolute inset-0 flex items-end">
            {serie.map((s, i) => {
              const fut = hoy != null && i + 1 > hoy;
              return (
                <div
                  key={i}
                  tabIndex={0}
                  onMouseEnter={() => setH(i)}
                  onMouseLeave={() => setH(null)}
                  onFocus={() => setH(i)}
                  onBlur={() => setH(null)}
                  className={`relative flex-1 h-full flex flex-col justify-end items-center rounded outline-none cursor-default ${h === i ? 'bg-slate-50' : ''}`}
                >
                  <div className="w-[62%] rounded-t-[3px]" style={{ height: `${(s.total / max) * 70}%`, backgroundColor: fut ? '#e2e8f0' : h === i ? C.marino : C.recarga }} />
                  {h === i && (
                    <Globo
                      titulo={`Día ${String(i + 1).padStart(2, '0')}${fut ? ' · aún no llega' : ''}`}
                      className={`top-0 ${i < 4 ? 'left-0' : i > diasMes - 5 ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}
                      lineas={[
                        ...COMPONENTES.filter((c) => s[c.k] > 0).map((c) => [c.l, Q(s[c.k])] as [string, string]),
                        ['Total del día', Q(s.total)],
                        ...(acumulado[i] != null ? ([['Acumulado', `${Q(acumulado[i] as number)} · ${pct(acumulado[i] as number, total)} del mes`]] as [string, string][]) : []),
                      ]}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" aria-hidden="true">
            {lProy && <polyline points={lProy} fill="none" stroke={C.verde} strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />}
            {lAcum && <polyline points={lAcum} fill="none" stroke={C.marino} strokeWidth="2.75" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
          </svg>
        </div>
      </div>
      <div className="flex pr-12 mt-1 text-[10px] text-slate-500 tabular-nums">
        {serie.map((_, i) => (
          <span key={i} className="flex-1 text-center">
            {i === 0 || (i + 1) % 5 === 0 ? i + 1 : ''}
          </span>
        ))}
      </div>
    </div>
  );
};

// Monto de un viaje con camión rentado: se guarda al salir del campo.
const MontoManual: React.FC<{ valor: number | null; onGuardar: (v: number | null) => Promise<void> }> = ({ valor, onGuardar }) => {
  const [txt, setTxt] = useState(valor == null ? '' : valor.toFixed(2));
  const [estado, setEstado] = useState<'' | 'guardando' | 'ok' | 'error'>('');
  useEffect(() => setTxt(valor == null ? '' : valor.toFixed(2)), [valor]);
  return (
    <div className="flex items-center gap-1.5 justify-end">
      <span className="text-slate-400 text-xs">Q</span>
      <input
        type="text"
        inputMode="decimal"
        value={txt}
        placeholder="Asignar"
        aria-label="Valor del viaje"
        onChange={(e) => setTxt(e.target.value)}
        onBlur={async () => {
          const limpio = txt.replace(/[Q,\s]/g, '');
          const v = limpio === '' ? null : parseFloat(limpio);
          if (v != null && !Number.isFinite(v)) return setEstado('error');
          if (v === valor) return;
          setEstado('guardando');
          try {
            await onGuardar(v);
            setEstado('ok');
          } catch {
            setEstado('error');
          }
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className={`w-28 min-h-[36px] px-2 rounded-md border text-right tabular-nums text-xs outline-none focus:ring-2 focus:ring-slate-200 ${valor == null ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'}`}
      />
      <span className="w-4 text-[11px]" aria-live="polite">
        {estado === 'guardando' ? '…' : estado === 'ok' ? '✓' : estado === 'error' ? '!' : ''}
      </span>
    </div>
  );
};

export const DashboardCostos: React.FC<Props> = ({ routes, historicalRoutes, trucks, enFiltro, usuario, registrarReporte, modo = 'ventas' }) => {
  const [mes, setMes] = useState(mesActual());
  const [tarifarios, setTarifarios] = useState<Map<string, Tarifario>>(new Map());
  const [manuales, setManuales] = useState<Map<string, number>>(new Map());
  const [manualesPrev, setManualesPrev] = useState<Map<string, number>>(new Map());
  const [standby, setStandby] = useState<StandbyDia[]>([]);
  const [standbyPrev, setStandbyPrev] = useState<StandbyDia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [verMenosT3, setVerMenosT3] = useState(false);
  const [actualizado, setActualizado] = useState('');
  const [compActivo, setCompActivo] = useState<Comp | null>(null);
  const [agHover, setAgHover] = useState<string | null>(null);
  const [agSel, setAgSel] = useState('');
  const [verTodas, setVerTodas] = useState(false);
  const [verRentados, setVerRentados] = useState(false);
  const prev = mesAnterior(mes);

  const recargar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCargando(true);
      setError('');
      try {
        const [t, m, mp, s, sp] = await Promise.all([cargarTarifarios(), cargarManuales(mes), cargarManuales(prev), cargarStandby(mes), cargarStandby(prev)]);
        setTarifarios(t);
        setManuales(m);
        setManualesPrev(mp);
        setStandby(s);
        setStandbyPrev(sp);
        setActualizado(new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setCargando(false);
      }
    },
    [mes, prev]
  );
  useEffect(() => {
    void recargar();
  }, [recargar]);
  // Datos al día: se vuelven a leer cada minuto y al regresar a la pestaña.
  useEffect(() => {
    if (modo !== 'ventas') return;
    const id = window.setInterval(() => void recargar(true), 60000);
    const alVolver = () => document.visibilityState === 'visible' && void recargar(true);
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [recargar, modo]);

  const { t: tarifario, origen } = useMemo(() => vigenteDe(tarifarios, mes), [tarifarios, mes]);
  const tarifPrev = useMemo(() => vigenteDe(tarifarios, prev).t, [tarifarios, prev]);
  const rutas = useMemo(() => [...routes, ...historicalRoutes].filter((r) => !enFiltro || enFiltro(r.agencia || '')), [routes, historicalRoutes, enFiltro]);
  const filtroStb = useCallback((d: StandbyDia[]) => d.filter((x) => !enFiltro || enFiltro(x.agencia)), [enFiltro]);
  const salidas = useMemo(() => calcularSalidas(rutas, trucks, mes, tarifario, manuales), [rutas, trucks, mes, tarifario, manuales]);
  const stb = useMemo(() => calcularStandby(filtroStb(standby), mes, tarifario), [standby, mes, tarifario, filtroStb]);
  const salidasPrev = useMemo(() => calcularSalidas(rutas, trucks, prev, tarifPrev, manualesPrev), [rutas, trucks, prev, tarifPrev, manualesPrev]);
  const stbPrev = useMemo(() => calcularStandby(filtroStb(standbyPrev), prev, tarifPrev), [standbyPrev, prev, tarifPrev, filtroStb]);

  const resumen = useMemo(() => resumirPorAgencia(salidas, stb), [salidas, stb]);
  const tot = useMemo(() => sumar(resumen), [resumen]);

  // Mes en curso: hasta hoy; proyección = ritmo diario × días del mes.
  const hoyDia = formatDateToGuatemala(new Date());
  const esMesActual = mes === mesActual();
  const diasMes = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
  const diaHoy = esMesActual ? Number(hoyDia.slice(0, 2)) : diasMes;
  const ritmo = tot.total / Math.max(1, diaHoy);
  const proyeccion = esMesActual ? ritmo * diasMes : tot.total;

  // Mes anterior a la misma fecha (para comparar a ritmo igual).
  const totPrev = useMemo(() => {
    const corte = (dia: string) => diaNum(dia) <= diaHoy;
    return sumar(resumirPorAgencia(salidasPrev.filter((s) => corte(s.dia)), stbPrev.filter((s) => corte(s.dia))));
  }, [salidasPrev, stbPrev, diaHoy]);
  const variacion = totPrev.total > 0 ? (tot.total - totPrev.total) / totPrev.total : null;

  // Venta por día
  const porDia = useMemo(() => {
    const m = new Map<number, ResumenAgencia[]>();
    const add = (dia: string, s: Salida[], st: StandbyCosto[]) => {
      const d = diaNum(dia);
      m.set(d, resumirPorAgencia(s, st));
    };
    const dias = new Set([...salidas.map((s) => s.dia), ...stb.map((s) => s.dia)]);
    dias.forEach((dia) => add(dia, salidas.filter((s) => s.dia === dia), stb.filter((s) => s.dia === dia)));
    return [...m.entries()].map(([dia, filas]) => ({ dia, t: sumar(filas) }));
  }, [salidas, stb]);
  const mejorDia = porDia.reduce<{ dia: number; t: Totales } | null>((a, d) => (!a || d.t.total > a.t.total ? d : a), null);

  // Mezcla de salidas
  const mezcla = useMemo(() => {
    const con = salidas.filter((s) => s.tipo !== 'sin_costo');
    const grupo = (f: (s: Salida) => boolean) => {
      const l = con.filter(f);
      return { n: l.length, q: l.reduce((a, s) => a + (s.costo || 0), 0) };
    };
    return [
      { l: '1er viaje T3', c: '#2C3790', ...grupo((s) => s.tipo === 'viaje' && s.clase === 'T3') },
      { l: '1er viaje T4', c: '#4b5bc4', ...grupo((s) => s.tipo === 'viaje' && s.clase === 'T4') },
      { l: '1er viaje T5', c: '#8fa0e6', ...grupo((s) => s.tipo === 'viaje' && s.clase === 'T5') },
      { l: 'Rentados (1er viaje)', c: '#94a3b8', ...grupo((s) => s.tipo === 'viaje' && s.rentado) },
      { l: 'Recargas / revisitas', c: C.recarga, ...grupo((s) => s.tipo === 'recarga') },
      { l: 'Camiones de apoyo', c: C.apoyo, ...grupo((s) => s.tipo === 'apoyo') },
    ].filter((x) => x.n > 0);
  }, [salidas]);
  const totSalidas = mezcla.reduce((a, x) => a + x.n, 0);

  const rentadas = salidas.filter((s) => s.rentado && s.tipo !== 'sin_costo');
  const rentadasSinValor = rentadas.filter((s) => s.costo == null).length;
  const avisos = useMemo(() => {
    const m = new Map<string, number>();
    [...salidas.filter((s) => s.tipo !== 'sin_costo' && !s.rentado), ...stb].forEach(
      (s) => s.aviso && s.aviso !== AVISO_MENOS_T3 && m.set(s.aviso, (m.get(s.aviso) || 0) + 1)
    );
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [salidas, stb]);
  // Viajes con 2 personas o menos: se costean como T3 (por ahora la única clase en uso) y se avisan aparte.
  const menosT3 = useMemo(
    () => salidas.filter((s) => s.aviso === AVISO_MENOS_T3 && !s.rentado).sort((a, b) => a.dia.localeCompare(b.dia) || a.agencia.localeCompare(b.agencia, 'es')),
    [salidas]
  );
  const diasStandby = new Set(standby.map((d) => d.fecha)).size;

  const TOP = 8;
  const visibles = verTodas ? resumen : resumen.slice(0, TOP);
  const otras = resumen.slice(TOP);
  const otrasTot = sumar(otras);
  const maxAg = Math.max(1, ...visibles.map((r) => r.total), verTodas ? 0 : otrasTot.total);
  const top3 = resumen.slice(0, 3).reduce((a, r) => a + r.total, 0);
  const sel = resumen.find((r) => r.agencia === agSel);

  const guardarMontoManual = async (s: Salida, v: number | null) => {
    await guardarManual(s.id, mes, v, usuario);
    setManuales((p) => {
      const m = new Map(p);
      if (v == null) m.delete(s.id);
      else m.set(s.id, v);
      return m;
    });
  };

  // PDF (resumido)
  useEffect(() => {
    if (modo !== 'ventas') return;
    registrarReporte?.(() => ({
      titulo: 'Tablero Ventas',
      periodo: `${nombreMes(mes)}${esMesActual ? ` · al día ${diaHoy}` : ''}`,
      agencia: `${resumen.length} agencias`,
      kpis: [
        { label: 'Venta estimada', valor: Qk(tot.total), sub: tot.pendientes ? `${n0(tot.pendientes)} viaje(s) rentado(s) sin valor` : 'Todo con valor', tono: 'info' },
        ...(esMesActual ? [{ label: 'Proyección al cierre', valor: Qk(proyeccion), sub: `Ritmo ${Qk(ritmo)} por día`, tono: 'info' as const }] : []),
        { label: 'Vs mes anterior', valor: variacion == null ? '—' : `${variacion >= 0 ? '+' : ''}${(variacion * 100).toFixed(1)}%`, sub: `${nombreMes(prev)}${esMesActual ? ` al día ${diaHoy}` : ''}: ${Qk(totPrev.total)}`, tono: variacion == null ? 'info' : variacion >= 0 ? 'ok' : 'warn' },
        ...COMPONENTES.map((c) => ({ label: c.l, valor: Qk(tot[c.k]), sub: `${pct(tot[c.k], tot.total)} de la venta`, tono: 'info' as const })),
      ],
      tablas: [
        {
          titulo: 'Venta por agencia',
          sub: `${nombreMes(mes)} · % sobre la venta total`,
          columnas: [{ t: 'Agencia' }, { t: 'Venta', num: true }, { t: '% del total', num: true }, { t: 'Salidas', num: true }, { t: 'Venta / salida', num: true }, { t: '% standby', num: true }],
          filas: resumen.map((r) => {
            const sal = r.viajesN + r.recargasN + r.apoyosN - r.pendientes;
            return [r.agencia, Q(r.total), pct(r.total, tot.total), n0(r.viajesN + r.recargasN + r.apoyosN), sal ? Q((r.viajesQ + r.recargasQ + r.apoyosQ) / sal) : '—', pct(r.stbPerQ + r.stbCamQ, r.total)];
          }),
          total: ['Total', Q(tot.total), '100%', n0(tot.viajesN + tot.recargasN + tot.apoyosN), '', pct(tot.stbPerQ + tot.stbCamQ, tot.total)],
          vacio: 'Sin ventas en el mes.',
        },
      ],
      notas: [`${origen}.`, '1er viaje por tripulación (T3/T4/T5); recarga = camión + VPP + APP; apoyo propio = viaje; rentados con valor asignado; piso, bolsón y Self Service sin venta.'],
    }));
  });

  // ---------- COSTOS (Otros › Costos) ----------
  if (modo === 'costos') {
    return (
      <div className="space-y-4">
        <section className="rounded-2xl shadow-sm text-white overflow-hidden" style={{ background: 'linear-gradient(135deg, #2C3790 0%, #1E2768 100%)' }}>
          <div className="p-4 sm:p-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-200">COSTOS · solo administradores generales</div>
              <h2 className="text-xl sm:text-2xl font-black leading-tight">Valores mes a mes</h2>
              <p className="text-xs text-sky-100/80 mt-0.5">Los usa el Tablero Ventas (Dashboard) para calcular la venta estimada de cada mes.</p>
            </div>
            <button type="button" onClick={() => void recargar()} aria-label="Actualizar" title="Volver a leer los valores guardados" className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer">
              <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </section>
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
        <TarifarioCostos
          tarifarios={tarifarios}
          base={TARIFARIO_BASE}
          mesInicial={mesActual()}
          onGuardar={async (ts) => {
            for (const x of ts) {
              const g = await guardarTarifario(x, usuario);
              setTarifarios((p) => new Map(p).set(g.mes, g));
            }
          }}
        />
      </div>
    );
  }

  // ---------- TABLERO VENTAS ----------
  const tarjeta = (l: string, k: Comp, n: string, icono: React.ReactNode) => {
    const c = COMPONENTES.find((x) => x.k === k)!;
    const p = tot.total ? tot[k] / tot.total : 0;
    return (
      <button
        type="button"
        onMouseEnter={() => setCompActivo(k)}
        onMouseLeave={() => setCompActivo(null)}
        onClick={() => setCompActivo((a) => (a === k ? null : k))}
        className={`text-left bg-white border rounded-2xl p-3.5 sm:p-4 shadow-sm min-w-0 cursor-pointer transition ${compActivo === k ? 'border-slate-400 ring-2 ring-slate-200' : 'border-slate-200 hover:border-slate-300'}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 min-w-0">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${c.c}1F`, color: c.c }}>
              {icono}
            </span>
            <span className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 truncate">{l}</span>
          </span>
          <span className="text-xs font-black tabular-nums" style={{ color: c.c }}>
            {(p * 100).toFixed(1)}%
          </span>
        </div>
        <div className="mt-2 text-xl sm:text-2xl font-black text-slate-900 leading-none tabular-nums">{Qk(tot[k])}</div>
        <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: C.pista }}>
          <div className="h-full rounded-full" style={{ width: `${p * 100}%`, backgroundColor: c.c }} />
        </div>
        <div className="mt-1.5 text-[11px] text-slate-500">{n}</div>
      </button>
    );
  };

  const barraAgencia = (r: ResumenAgencia | (Totales & { agencia: string }), etiqueta?: string) => {
    const ag = r.agencia;
    const sal = r.viajesN + r.recargasN + r.apoyosN;
    const salConValor = sal - r.pendientes;
    return (
      <button
        key={ag}
        type="button"
        onClick={() => !etiqueta && setAgSel((a) => (a === ag ? '' : ag))}
        onMouseEnter={() => setAgHover(ag)}
        onMouseLeave={() => setAgHover(null)}
        onFocus={() => setAgHover(ag)}
        onBlur={() => setAgHover(null)}
        className={`relative w-full grid items-center gap-3 py-1.5 px-1.5 rounded-lg text-left ${etiqueta ? 'cursor-default' : 'cursor-pointer'} ${agSel === ag ? 'bg-sky-50 ring-1 ring-sky-200' : 'hover:bg-slate-50'}`}
        style={{ gridTemplateColumns: 'minmax(0, 8.5rem) 1fr 4.5rem 3.5rem' }}
      >
        <span className="text-xs font-semibold text-slate-800 truncate">{etiqueta || ag}</span>
        <span className="h-3.5 flex rounded-md overflow-hidden" style={{ width: `${Math.max(2, (r.total / maxAg) * 100)}%`, backgroundColor: C.pista }}>
          {COMPONENTES.map((c) => (r[c.k] > 0 ? <span key={c.k} style={{ width: `${(r[c.k] / r.total) * 100}%`, backgroundColor: c.c, opacity: compActivo && compActivo !== c.k ? 0.25 : 1 }} /> : null))}
        </span>
        <span className="text-right text-xs font-bold text-slate-900 tabular-nums">{Qk(r.total)}</span>
        <span className="text-right text-[11px] font-semibold text-slate-500 tabular-nums">{pct(r.total, tot.total)}</span>
        {agHover === ag && (
          <Globo
            titulo={`${etiqueta || ag} · ${pct(r.total, tot.total)} de la venta`}
            className="left-36 top-full mt-1"
            lineas={[
              ...COMPONENTES.map((c) => [`${c.l}`, `${Q(r[c.k])} · ${pct(r[c.k], r.total)}`] as [string, string]),
              ['Salidas', `${n0(sal)}${r.pendientes ? ` (${r.pendientes} sin valor)` : ''}`],
              ['Venta por salida', salConValor ? Q((r.viajesQ + r.recargasQ + r.apoyosQ) / salConValor) : '—'],
              ['Total', Q(r.total)],
            ]}
          />
        )}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <section className="rounded-2xl shadow-sm text-white overflow-hidden" style={{ background: 'linear-gradient(135deg, #2C3790 0%, #1E2768 100%)' }}>
        <div className="p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-200">TABLERO VENTAS · proyección de ventas</div>
              <h2 className="text-xl sm:text-2xl font-black leading-tight">{nombreMes(mes)}</h2>
              <p className="text-xs text-sky-100/80 mt-0.5">
                {origen} · actualizado {actualizado || '…'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-sky-100 [color-scheme:dark]">
                Mes
                <input type="month" value={mes} max={mesActual()} onChange={(e) => e.target.value && setMes(e.target.value)} className="min-h-[38px] px-2 rounded-lg bg-white/10 border border-white/20 text-white" />
              </label>
              <button type="button" onClick={() => void recargar()} aria-label="Actualizar" title="Se actualiza solo cada minuto" className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer">
                <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-0 sm:divide-x sm:divide-white/15">
            <div className="sm:pr-6">
              <div className="text-[11px] font-bold uppercase tracking-wide text-sky-200">Venta estimada{esMesActual ? ' a la fecha' : ' del mes'}</div>
              <div className="text-3xl sm:text-4xl font-black leading-none tabular-nums mt-1">{Q(tot.total)}</div>
              <div className="text-[11px] text-sky-100/80 mt-1">
                {n0(tot.viajesN + tot.recargasN + tot.apoyosN)} salidas · {esMesActual ? `día ${diaHoy} de ${diasMes}` : `${diasMes} días`}
              </div>
            </div>
            <div className="sm:px-6">
              <div className="text-[11px] font-bold uppercase tracking-wide text-sky-200">{esMesActual ? 'Proyección al cierre' : 'Venta promedio por día'}</div>
              <div className="text-3xl font-black leading-none tabular-nums mt-1">{esMesActual ? Qk(proyeccion) : Qk(ritmo)}</div>
              <div className="text-[11px] text-sky-100/80 mt-1">{esMesActual ? `Ritmo de ${Qk(ritmo)} por día × ${diasMes} días` : `${diasMes} días del mes`}</div>
            </div>
            <div className="sm:pl-6">
              <div className="text-[11px] font-bold uppercase tracking-wide text-sky-200">Vs {nombreMes(prev).toLowerCase()}{esMesActual ? ` al día ${diaHoy}` : ''}</div>
              <div className="text-3xl font-black leading-none tabular-nums mt-1" style={{ color: variacion == null ? '#fff' : variacion >= 0 ? '#8fe3c4' : '#ffc2c4' }}>
                {variacion == null ? '—' : `${variacion >= 0 ? '▲' : '▼'} ${Math.abs(variacion * 100).toFixed(1)}%`}
              </div>
              <div className="text-[11px] text-sky-100/80 mt-1">{totPrev.total ? `${Qk(totPrev.total)} en el mismo periodo` : 'Sin datos del mes anterior'}</div>
            </div>
          </div>
        </div>
      </section>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      {/* Composición en tarjetas */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {tarjeta('1er viaje', 'viajesQ', `${n0(tot.viajesN)} viajes`, <TruckIcon className="w-4 h-4" />)}
        {tarjeta('Recargas / revisitas', 'recargasQ', `${n0(tot.recargasN)} salidas`, <Repeat className="w-4 h-4" />)}
        {tarjeta('Camiones de apoyo', 'apoyosQ', `${n0(tot.apoyosN)} apoyos`, <TruckIcon className="w-4 h-4" />)}
        {tarjeta('Standby personal', 'stbPerQ', `${n0(tot.stbPerN)} días-persona`, <Users className="w-4 h-4" />)}
        {tarjeta('Standby camiones', 'stbCamQ', `${n0(tot.stbCamN)} días-camión`, <TruckIcon className="w-4 h-4" />)}
      </div>

      {/* Tendencia + composición */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-slate-500" />
                Venta por día y acumulado
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Pasa el cursor sobre un día para ver su desglose</p>
            </div>
            {mejorDia && (
              <div className="text-right">
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Mejor día</div>
                <div className="text-sm font-black text-slate-900 tabular-nums">
                  Día {mejorDia.dia} · {Qk(mejorDia.t.total)}
                </div>
              </div>
            )}
          </div>
          <VentaDiaria dias={porDia} diasMes={diasMes} hoy={esMesActual ? diaHoy : null} total={tot.total} proyeccion={proyeccion} />
        </section>
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5">
          <h3 className="text-sm font-bold text-slate-800">Composición de la venta</h3>
          <p className="text-[11px] text-slate-500 mt-0.5 mb-3">% de cada concepto · pasa el cursor</p>
          <div className="flex flex-col items-center gap-3">
            <DonaVenta tot={tot} activo={compActivo} onActivo={setCompActivo} />
            <div className="w-full space-y-1">
              {COMPONENTES.map((c) => (
                <div
                  key={c.k}
                  onMouseEnter={() => setCompActivo(c.k)}
                  onMouseLeave={() => setCompActivo(null)}
                  className={`flex items-center gap-2 text-xs px-2 py-1 rounded-md transition ${compActivo === c.k ? 'bg-slate-100' : ''}`}
                  style={{ opacity: compActivo && compActivo !== c.k ? 0.5 : 1 }}
                >
                  <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ backgroundColor: c.c }} />
                  <span className="flex-1 text-slate-700">{c.l}</span>
                  <span className="font-bold tabular-nums">{pct(tot[c.k], tot.total)}</span>
                  <span className="w-20 text-right text-slate-500 tabular-nums">{Qk(tot[c.k])}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Agencias + mezcla */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Venta por agencia</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {resumen.length} agencias · las 3 primeras concentran {pct(top3, tot.total)} · toca una para ver su resumen
              </p>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-slate-500">
              {COMPONENTES.map((c) => (
                <span key={c.k} className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-[2px]" style={{ backgroundColor: c.c }} />
                  {c.l}
                </span>
              ))}
            </div>
          </div>
          {resumen.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">{cargando ? 'Cargando…' : `Sin ventas en ${nombreMes(mes)}.`}</p>
          ) : (
            <div className="space-y-0.5">
              {visibles.map((r) => barraAgencia(r))}
              {!verTodas && otras.length > 0 && barraAgencia({ ...otrasTot, agencia: '__otras' }, `Otras ${otras.length} agencias`)}
              {otras.length > 0 && (
                <button type="button" onClick={() => setVerTodas((v) => !v)} className="mt-1 text-xs font-semibold text-sky-700 hover:underline cursor-pointer">
                  {verTodas ? 'Ver solo las principales' : `Ver las ${resumen.length} agencias`}
                </button>
              )}
            </div>
          )}
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5">
          {sel ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">Resumen de agencia</div>
                  <h3 className="text-lg font-black text-slate-900">{sel.agencia}</h3>
                </div>
                <button type="button" onClick={() => setAgSel('')} aria-label="Cerrar resumen" className="w-8 h-8 rounded-md text-slate-400 hover:bg-slate-100 flex items-center justify-center cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                {[
                  ['Venta', Qk(sel.total)],
                  ['% del total', pct(sel.total, tot.total)],
                  ['Salidas', n0(sel.viajesN + sel.recargasN + sel.apoyosN)],
                  ['Venta / salida', sel.viajesN + sel.recargasN + sel.apoyosN - sel.pendientes > 0 ? Qk((sel.viajesQ + sel.recargasQ + sel.apoyosQ) / (sel.viajesN + sel.recargasN + sel.apoyosN - sel.pendientes)) : '—'],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-xl bg-slate-50 p-2.5">
                    <div className="text-[10.5px] text-slate-500">{l}</div>
                    <div className="text-lg font-black text-slate-900 tabular-nums">{v}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-1.5">
                {COMPONENTES.map((c) => (
                  <div key={c.k} className="text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-600">{c.l}</span>
                      <span className="font-semibold tabular-nums">
                        {pct(sel[c.k], sel.total)} <span className="text-slate-400 font-normal">· {Qk(sel[c.k])}</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden mt-0.5" style={{ backgroundColor: C.pista }}>
                      <div className="h-full rounded-full" style={{ width: `${sel.total ? (sel[c.k] / sel.total) * 100 : 0}%`, backgroundColor: c.c }} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <h3 className="text-sm font-bold text-slate-800">Mezcla de salidas</h3>
              <p className="text-[11px] text-slate-500 mt-0.5 mb-3">{n0(totSalidas)} salidas · % por tipo y su venta</p>
              <div className="flex h-4 rounded-full overflow-hidden mb-3" style={{ backgroundColor: C.pista }}>
                {mezcla.map((x) => (
                  <span key={x.l} title={`${x.l}: ${n0(x.n)} · ${pct(x.n, totSalidas)}`} style={{ width: `${(x.n / Math.max(1, totSalidas)) * 100}%`, backgroundColor: x.c }} />
                ))}
              </div>
              <div className="space-y-1.5">
                {mezcla.map((x) => (
                  <div key={x.l} className="grid items-center gap-2 text-xs" style={{ gridTemplateColumns: '0.75rem 1fr 3rem 4.5rem' }}>
                    <span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: x.c }} />
                    <span className="text-slate-700">{x.l}</span>
                    <span className="text-right font-bold tabular-nums">{pct(x.n, totSalidas)}</span>
                    <span className="text-right text-slate-500 tabular-nums" title={x.n ? `Promedio ${Q(x.q / x.n)} por salida` : ''}>
                      {Qk(x.q)}
                    </span>
                  </div>
                ))}
                {mezcla.length === 0 && <p className="text-xs text-slate-400">Sin salidas en el mes.</p>}
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-[10.5px] text-slate-500">Venta por salida</div>
                  <div className="font-black text-slate-900 tabular-nums">{totSalidas - tot.pendientes > 0 ? Q((tot.viajesQ + tot.recargasQ + tot.apoyosQ) / (totSalidas - tot.pendientes)) : '—'}</div>
                </div>
                <div>
                  <div className="text-[10.5px] text-slate-500">Peso del standby</div>
                  <div className="font-black text-slate-900 tabular-nums">{pct(tot.stbPerQ + tot.stbCamQ, tot.total)}</div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Puntos de atención */}
      {(rentadas.length > 0 || avisos.length > 0 || diasStandby === 0 || menosT3.length > 0) && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Para tener la venta completa
            </div>
            {rentadas.length > 0 && (
              <button type="button" onClick={() => setVerRentados(true)} className="min-h-[34px] px-3 rounded-lg bg-white border border-amber-300 font-semibold text-amber-900 hover:bg-amber-100 cursor-pointer">
                Valorar viajes rentados ({rentadasSinValor} pendiente{rentadasSinValor === 1 ? '' : 's'})
              </button>
            )}
          </div>
          <ul className="mt-1.5 space-y-0.5">
            {rentadasSinValor > 0 && <li>• {n0(rentadasSinValor)} viaje(s) con camión rentado sin valor: no suman a la venta hasta asignarlo.</li>}
            {diasStandby === 0 && <li>• Aún no hay registro diario de standby este mes (se guarda solo desde que se activó el módulo).</li>}
            {menosT3.length > 0 && (
              <li>
                • <strong>{n0(menosT3.length)} viaje(s) salieron con menos de 3 personas</strong> y se costearon como T3 ({Q(menosT3.reduce((a, s) => a + (s.costo || 0), 0))}).{' '}
                <button type="button" onClick={() => setVerMenosT3((v) => !v)} className="underline font-semibold cursor-pointer">
                  {verMenosT3 ? 'Ocultar detalle' : 'Ver detalle'}
                </button>
                {verMenosT3 && (
                  <div className="mt-2 mb-1 rounded-lg bg-white border border-amber-200 overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-[11px] text-slate-700 min-w-[560px]">
                      <thead className="sticky top-0 bg-amber-50 text-amber-900">
                        <tr>
                          <th className="text-left px-2 py-1.5">Fecha</th>
                          <th className="text-left px-2 py-1.5">Agencia</th>
                          <th className="text-left px-2 py-1.5">Ruta</th>
                          <th className="text-left px-2 py-1.5">Camión</th>
                          <th className="text-left px-2 py-1.5">Tripulación</th>
                          <th className="text-right px-2 py-1.5">Costo T3</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100">
                        {menosT3.map((s) => (
                          <tr key={s.id}>
                            <td className="px-2 py-1 whitespace-nowrap">{s.dia.slice(0, 5)}</td>
                            <td className="px-2 py-1">{s.agencia}</td>
                            <td className="px-2 py-1">
                              {s.ruta}
                              {s.tipo === 'apoyo' ? ' (apoyo)' : ''}
                            </td>
                            <td className="px-2 py-1">{s.placa || '—'}</td>
                            <td className="px-2 py-1">
                              {s.tripulacion} persona(s): {s.conductor ? 'piloto' : <strong className="text-red-700">sin piloto</strong>} + {s.auxiliares} APP
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums">{s.costo == null ? '—' : Q(s.costo)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </li>
            )}
            {avisos.slice(0, 4).map(([a, n]) => (
              <li key={a}>
                • {a} ({n0(n)})
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Ventana: valorar viajes con camión rentado */}
      {verRentados && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3" onClick={() => setVerRentados(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="titRentados" className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl p-5 max-h-[85vh] flex flex-col gap-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="titRentados" className="font-bold text-slate-800">Viajes con camión rentado · {nombreMes(mes)}</h3>
                <p className="text-[11px] text-slate-500">Escribe el valor de cada viaje; se guarda al salir del campo.</p>
              </div>
              <button type="button" onClick={() => setVerRentados(false)} aria-label="Cerrar" className="w-8 h-8 rounded-md text-slate-400 hover:bg-slate-100 flex items-center justify-center cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto divide-y divide-slate-100">
              {rentadas.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800">
                      Ruta <span className="font-mono">{s.ruta}</span> · {s.agencia}
                    </div>
                    <div className="text-slate-500">
                      {s.dia.slice(0, 5)} · {s.tipoAsignacion} · <span className="font-mono">{s.placa || '—'}</span> · {s.tripulacion} personas
                    </div>
                  </div>
                  <MontoManual valor={s.costo} onGuardar={(v) => guardarMontoManual(s, v)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
