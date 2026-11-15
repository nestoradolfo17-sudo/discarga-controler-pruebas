import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Route, Truck } from '../types';
import { formatDateToGuatemala } from '../utils/date';
import {
  calcularSalidas,
  calcularStandby,
  resumirPorAgencia,
  type Tarifario,
  type TarifarioDatos,
  type StandbyDia,
  type Salida,
  type ResumenAgencia,
} from '../utils/costos';
import { TARIFARIO_BASE } from '../data/tarifarioBase';
import { cargarTarifarios, guardarTarifario, cargarManuales, guardarManual, cargarStandby } from '../services/costos';
import { TarifarioCostos } from './TarifarioCostos';
import type { ReportePdf } from '../utils/dashboardPdf';
import { AlertTriangle, Truck as TruckIcon, Users, Repeat, Building2, Search, RefreshCw } from 'lucide-react';

// --- Costos de operación por agencia (solo administradores) ---
// Costo del mes = salidas ejecutadas (1er viaje, recargas, revisitas, camiones
// de apoyo) + standby de personal y camiones, con el tarifario del mes.

interface Props {
  routes: Route[];
  historicalRoutes: Route[];
  trucks: Truck[];
  enFiltro?: (ag: string) => boolean;
  usuario: string;
  registrarReporte?: (armar: () => ReportePdf) => void;
}

const C = {
  viaje: '#2C3790',
  recarga: '#5AACE4',
  apoyo: '#8a63cf',
  stbPer: '#d9a521',
  stbCam: '#e5793b',
  pista: '#eef2f7',
};
const Q = (v: number) => `Q${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const Qk = (v: number) => (Math.abs(v) >= 1e6 ? `Q${(v / 1e6).toFixed(2)} M` : Math.abs(v) >= 1e4 ? `Q${(v / 1e3).toFixed(1)} k` : Q(v));
const n0 = (v: number) => Math.round(v).toLocaleString('en-US');
const mesActual = () => {
  const d = formatDateToGuatemala(new Date());
  return `${d.slice(6, 10)}-${d.slice(3, 5)}`;
};
const nombreMes = (mes: string) => {
  const [y, m] = mes.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const COMPONENTES: { k: keyof ResumenAgencia; l: string; c: string }[] = [
  { k: 'viajesQ', l: '1er viaje', c: C.viaje },
  { k: 'recargasQ', l: 'Recargas / revisitas', c: C.recarga },
  { k: 'apoyosQ', l: 'Camiones de apoyo', c: C.apoyo },
  { k: 'stbPerQ', l: 'Standby personal', c: C.stbPer },
  { k: 'stbCamQ', l: 'Standby camiones', c: C.stbCam },
];

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
        aria-label="Costo del viaje"
        onChange={(e) => setTxt(e.target.value)}
        onBlur={async () => {
          const limpio = txt.replace(/[Q,\s]/g, '');
          const v = limpio === '' ? null : parseFloat(limpio);
          if (v != null && !Number.isFinite(v)) {
            setEstado('error');
            return;
          }
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
        className={`w-28 min-h-[34px] px-2 rounded-md border text-right tabular-nums text-xs outline-none focus:ring-2 focus:ring-slate-200 ${
          valor == null ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'
        }`}
      />
      <span className="w-4 text-[11px]" aria-live="polite">
        {estado === 'guardando' ? '…' : estado === 'ok' ? '✓' : estado === 'error' ? '!' : ''}
      </span>
    </div>
  );
};

export const DashboardCostos: React.FC<Props> = ({ routes, historicalRoutes, trucks, enFiltro, usuario, registrarReporte }) => {
  const [vista, setVista] = useState<'tablero' | 'tarifario'>('tablero');
  const [mes, setMes] = useState(mesActual());
  const [tarifarios, setTarifarios] = useState<Map<string, Tarifario>>(new Map());
  const [manuales, setManuales] = useState<Map<string, number>>(new Map());
  const [standby, setStandby] = useState<StandbyDia[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [agDetalle, setAgDetalle] = useState('');
  const [buscar, setBuscar] = useState('');
  const [limite, setLimite] = useState(80);
  const [hover, setHover] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const [t, m, s] = await Promise.all([cargarTarifarios(), cargarManuales(mes), cargarStandby(mes)]);
      setTarifarios(t);
      setManuales(m);
      setStandby(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, [mes]);
  useEffect(() => {
    void recargar();
  }, [recargar]);

  // Tarifario vigente: el del mes; si no hay, el último guardado antes; si no, el base del Excel.
  const { tarifario, origen, propio } = useMemo(() => {
    const t = tarifarios.get(mes);
    const fecha = (x?: string) => (x ? new Date(x).toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' }) : '');
    if (t) return { tarifario: t as TarifarioDatos, origen: `Guardado${t.actualizadoPor ? ` por ${t.actualizadoPor}` : ''}${t.actualizadoEl ? ` el ${fecha(t.actualizadoEl)}` : ''}`, propio: true };
    const previos = [...tarifarios.keys()].filter((k) => k < mes).sort();
    const ult = previos[previos.length - 1];
    if (ult) return { tarifario: tarifarios.get(ult) as TarifarioDatos, origen: `Usando el tarifario de ${nombreMes(ult)} (aún no hay uno guardado para este mes)`, propio: false };
    return { tarifario: TARIFARIO_BASE, origen: 'Usando el tarifario base del Excel (aún no se ha guardado ninguno)', propio: false };
  }, [tarifarios, mes]);

  const rutas = useMemo(() => [...routes, ...historicalRoutes].filter((r) => !enFiltro || enFiltro(r.agencia || '')), [routes, historicalRoutes, enFiltro]);
  const salidas = useMemo(() => calcularSalidas(rutas, trucks, mes, tarifario, manuales), [rutas, trucks, mes, tarifario, manuales]);
  const stb = useMemo(() => calcularStandby(standby.filter((d) => !enFiltro || enFiltro(d.agencia)), mes, tarifario), [standby, mes, tarifario, enFiltro]);
  const resumen = useMemo(() => resumirPorAgencia(salidas, stb), [salidas, stb]);

  const tot = resumen.reduce(
    (a, r) => ({
      viajesN: a.viajesN + r.viajesN,
      viajesQ: a.viajesQ + r.viajesQ,
      recargasN: a.recargasN + r.recargasN,
      recargasQ: a.recargasQ + r.recargasQ,
      apoyosN: a.apoyosN + r.apoyosN,
      apoyosQ: a.apoyosQ + r.apoyosQ,
      stbPerN: a.stbPerN + r.stbPerN,
      stbPerQ: a.stbPerQ + r.stbPerQ,
      stbCamN: a.stbCamN + r.stbCamN,
      stbCamQ: a.stbCamQ + r.stbCamQ,
      pendientes: a.pendientes + r.pendientes,
      total: a.total + r.total,
    }),
    { viajesN: 0, viajesQ: 0, recargasN: 0, recargasQ: 0, apoyosN: 0, apoyosQ: 0, stbPerN: 0, stbPerQ: 0, stbCamN: 0, stbCamQ: 0, pendientes: 0, total: 0 }
  );
  const rentadas = salidas.filter((s) => s.rentado && s.tipo !== 'sin_costo');
  const rentadasSinValor = rentadas.filter((s) => s.costo == null).length;
  const avisos = useMemo(() => {
    const m = new Map<string, number>();
    [...salidas.filter((s) => s.tipo !== 'sin_costo' && !s.rentado), ...stb].forEach((s) => s.aviso && m.set(s.aviso, (m.get(s.aviso) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [salidas, stb]);
  const diasStandby = new Set(standby.map((d) => d.fecha)).size;
  const primerDiaStandby = [...standby.map((d) => d.fecha)].sort((a, b) => a.split('/').reverse().join('').localeCompare(b.split('/').reverse().join('')))[0];
  const maxAg = Math.max(1, ...resumen.map((r) => r.total));
  const sinCosto = salidas.filter((s) => s.tipo === 'sin_costo').length;

  const detalle = useMemo(() => {
    const b = buscar.trim().toLowerCase();
    return salidas
      .filter((s) => s.tipo !== 'sin_costo' && (!agDetalle || s.agencia === agDetalle))
      .filter((s) => !b || [s.ruta, s.placa, s.conductor, s.tipoAsignacion].some((x) => x.toLowerCase().includes(b)))
      .sort((a, b2) => b2.dia.split('/').reverse().join('').localeCompare(a.dia.split('/').reverse().join('')) || a.ruta.localeCompare(b2.ruta));
  }, [salidas, agDetalle, buscar]);

  const guardarMontoManual = async (s: Salida, v: number | null) => {
    await guardarManual(s.id, mes, v, usuario);
    setManuales((prev) => {
      const m = new Map(prev);
      if (v == null) m.delete(s.id);
      else m.set(s.id, v);
      return m;
    });
  };

  // PDF
  useEffect(() => {
    registrarReporte?.(() => ({
      titulo: 'Costos de operación',
      periodo: nombreMes(mes),
      agencia: `${resumen.length} agencias`,
      kpis: [
        { label: 'Costo total del mes', valor: Qk(tot.total), sub: tot.pendientes ? `${n0(tot.pendientes)} viaje(s) sin valor asignado` : 'Todo con valor', tono: 'info' },
        { label: '1er viaje', valor: Qk(tot.viajesQ), sub: `${n0(tot.viajesN)} viajes`, tono: 'info' },
        { label: 'Recargas / revisitas', valor: Qk(tot.recargasQ), sub: `${n0(tot.recargasN)} salidas`, tono: 'info' },
        { label: 'Camiones de apoyo', valor: Qk(tot.apoyosQ), sub: `${n0(tot.apoyosN)} apoyos`, tono: 'info' },
        { label: 'Standby personal', valor: Qk(tot.stbPerQ), sub: `${n0(tot.stbPerN)} días-persona`, tono: 'warn' },
        { label: 'Standby camiones', valor: Qk(tot.stbCamQ), sub: `${n0(tot.stbCamN)} días-camión`, tono: 'warn' },
      ],
      tablas: [
        {
          titulo: 'Costo por agencia',
          sub: `${nombreMes(mes)} · de mayor a menor`,
          columnas: [
            { t: 'Agencia' },
            { t: 'Viajes', num: true },
            { t: '1er viaje', num: true },
            { t: 'Recargas', num: true },
            { t: 'Q recargas', num: true },
            { t: 'Apoyos', num: true },
            { t: 'Standby pers.', num: true },
            { t: 'Standby cam.', num: true },
            { t: 'Total', num: true },
            { t: '%', num: true },
          ],
          filas: resumen.map((r) => [r.agencia, n0(r.viajesN), Q(r.viajesQ), n0(r.recargasN), Q(r.recargasQ), Q(r.apoyosQ), Q(r.stbPerQ), Q(r.stbCamQ), Q(r.total), tot.total ? `${((r.total / tot.total) * 100).toFixed(1)}%` : '—']),
          total: ['Total', n0(tot.viajesN), Q(tot.viajesQ), n0(tot.recargasN), Q(tot.recargasQ), Q(tot.apoyosQ), Q(tot.stbPerQ), Q(tot.stbCamQ), Q(tot.total), '100%'],
          vacio: 'Sin costos en el mes.',
        },
      ],
      notas: [
        `Tarifario: ${origen}.`,
        '1er viaje: tarifa T3/T4/T5 según tripulación (piloto + auxiliares). Recarga y revisita: camión + VPP + APP por auxiliar. Apoyo propio: igual que un viaje. Camiones rentados: valor asignado por un administrador. Ruta a piso, bolsón y Self Service no generan costo.',
        `Standby: días con registro en el mes (${diasStandby}). El registro diario empezó a guardarse al activar este módulo.`,
      ],
    }));
  });

  const kpi = (l: string, v: string, s: string, c: string, icono: React.ReactNode) => (
    <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 shadow-sm min-w-0">
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${c}1A`, color: c }}>
          {icono}
        </span>
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500 truncate">{l}</span>
      </div>
      <div className="mt-2 text-xl sm:text-2xl font-black text-slate-900 leading-none tabular-nums">{v}</div>
      <div className="mt-1.5 text-[11px] text-slate-500">{s}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <section className="rounded-2xl shadow-sm text-white overflow-hidden" style={{ background: 'linear-gradient(135deg, #2C3790 0%, #1E2768 100%)' }}>
        <div className="p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-200">Costos de operación · solo administradores</div>
              <h2 className="text-xl sm:text-2xl font-black leading-tight">{nombreMes(mes)}</h2>
              <p className="text-xs text-sky-100/80 mt-0.5">{origen}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-sky-100 [color-scheme:dark]">
                Mes
                <input type="month" value={mes} max={mesActual()} onChange={(e) => e.target.value && setMes(e.target.value)} className="min-h-[38px] px-2 rounded-lg bg-white/10 border border-white/20 text-white" />
              </label>
              <div role="tablist" aria-label="Vista de costos" className="flex gap-1 bg-white/10 rounded-xl p-1">
                {(
                  [
                    ['tablero', 'Tablero'],
                    ['tarifario', 'Tarifario'],
                  ] as const
                ).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={vista === k}
                    onClick={() => setVista(k)}
                    className={`min-h-[34px] px-3 rounded-lg text-xs sm:text-sm font-semibold cursor-pointer ${vista === k ? 'bg-white text-[#2C3790] shadow-sm' : 'text-sky-100 hover:bg-white/10'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => void recargar()} title="Volver a leer tarifario, costos asignados y standby" aria-label="Actualizar" className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer">
                <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
          {vista === 'tablero' && (
            <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 sm:gap-8 items-center">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-sky-200">Costo total del mes</div>
                <div className="text-4xl font-black leading-none tabular-nums mt-1">{Q(tot.total)}</div>
                <div className="text-[11px] text-sky-100/80 mt-1">
                  {n0(tot.viajesN + tot.recargasN + tot.apoyosN)} salidas · {n0(tot.stbPerN)} días-persona y {n0(tot.stbCamN)} días-camión en standby
                </div>
              </div>
              {/* Composición del costo */}
              <div className="min-w-0">
                <div className="flex h-4 rounded-full overflow-hidden bg-white/10">
                  {COMPONENTES.map((c) => {
                    const v = tot[c.k as keyof typeof tot] as number;
                    return v > 0 ? <div key={c.k} title={`${c.l}: ${Q(v)}`} style={{ width: `${(v / Math.max(1, tot.total)) * 100}%`, backgroundColor: c.c === C.viaje ? '#8fa7ff' : c.c }} /> : null;
                  })}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-sky-100">
                  {COMPONENTES.map((c) => {
                    const v = tot[c.k as keyof typeof tot] as number;
                    return (
                      <span key={c.k} className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: c.c === C.viaje ? '#8fa7ff' : c.c }} />
                        {c.l} <strong className="text-white tabular-nums">{tot.total ? `${((v / tot.total) * 100).toFixed(0)}%` : '0%'}</strong>
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {vista === 'tarifario' ? (
        <TarifarioCostos
          mes={mes}
          tarifario={tarifario}
          origen={origen}
          propio={propio}
          onGuardar={async (t) => {
            const g = await guardarTarifario(t, usuario);
            setTarifarios((prev) => new Map(prev).set(g.mes, g));
          }}
        />
      ) : (
        <>
          {/* Indicadores */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {kpi('1er viaje', Qk(tot.viajesQ), `${n0(tot.viajesN)} viajes`, C.viaje, <TruckIcon className="w-4 h-4" />)}
            {kpi('Recargas / revisitas', Qk(tot.recargasQ), `${n0(tot.recargasN)} salidas`, '#2f86c4', <Repeat className="w-4 h-4" />)}
            {kpi('Camiones de apoyo', Qk(tot.apoyosQ), `${n0(tot.apoyosN)} apoyos`, C.apoyo, <TruckIcon className="w-4 h-4" />)}
            {kpi('Standby personal', Qk(tot.stbPerQ), `${n0(tot.stbPerN)} días-persona`, '#9a6f00', <Users className="w-4 h-4" />)}
            {kpi('Standby camiones', Qk(tot.stbCamQ), `${n0(tot.stbCamN)} días-camión`, C.stbCam, <TruckIcon className="w-4 h-4" />)}
          </div>

          {(rentadasSinValor > 0 || avisos.length > 0 || diasStandby === 0) && (
            <section className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 space-y-1.5 text-xs text-amber-900">
              <div className="font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                Revisar antes de cerrar el mes
              </div>
              {rentadasSinValor > 0 && <div>• {n0(rentadasSinValor)} viaje(s) con camión rentado sin costo asignado (ver abajo). No suman al total hasta tener valor.</div>}
              {diasStandby === 0 && <div>• Aún no hay registro diario de standby en este mes: se empieza a guardar solo mientras se usa la app (desde que se activó este módulo).</div>}
              {avisos.slice(0, 6).map(([a, n]) => (
                <div key={a}>
                  • {a} ({n0(n)})
                </div>
              ))}
            </section>
          )}

          {/* Costo por agencia: barras apiladas */}
          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-500" />
                  Costo del mes por agencia
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">De mayor a menor · pasa el cursor para ver el desglose · toca una agencia para ver sus viajes</p>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                {COMPONENTES.map((c) => (
                  <span key={c.k} className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-[3px]" style={{ backgroundColor: c.c }} />
                    {c.l}
                  </span>
                ))}
              </div>
            </div>
            {cargando && resumen.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">Cargando…</p>
            ) : resumen.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">Sin costos en {nombreMes(mes)}.</p>
            ) : (
              <div className="space-y-1">
                {resumen.map((r) => (
                  <button
                    key={r.agencia}
                    type="button"
                    onClick={() => setAgDetalle((a) => (a === r.agencia ? '' : r.agencia))}
                    onMouseEnter={() => setHover(r.agencia)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(r.agencia)}
                    onBlur={() => setHover(null)}
                    className={`relative w-full grid items-center gap-3 py-1.5 px-1.5 rounded-lg text-left cursor-pointer ${agDetalle === r.agencia ? 'bg-sky-50 ring-1 ring-sky-200' : 'hover:bg-slate-50'}`}
                    style={{ gridTemplateColumns: 'minmax(0, 9.5rem) 1fr 7.5rem' }}
                  >
                    <span className="text-xs font-semibold text-slate-800 truncate">{r.agencia}</span>
                    <span className="h-4 flex rounded-md overflow-hidden" style={{ width: `${Math.max(2, (r.total / maxAg) * 100)}%`, backgroundColor: C.pista }}>
                      {COMPONENTES.map((c) => {
                        const v = r[c.k] as number;
                        return v > 0 ? <span key={c.k} style={{ width: `${(v / r.total) * 100}%`, backgroundColor: c.c }} /> : null;
                      })}
                    </span>
                    <span className="text-right text-xs font-bold text-slate-900 tabular-nums">
                      {Q(r.total)}
                      {r.pendientes > 0 && <span className="block text-[10px] font-semibold text-amber-700">{r.pendientes} sin valor</span>}
                    </span>
                    {hover === r.agencia && (
                      <span role="tooltip" className="absolute z-30 left-40 top-full mt-1 w-max min-w-[14rem] bg-slate-900 text-white rounded-xl shadow-xl px-3 py-2.5 text-[11.5px] pointer-events-none">
                        <span className="block font-bold text-[12px] mb-1">{r.agencia}</span>
                        {[
                          [`1er viaje (${n0(r.viajesN)})`, r.viajesQ],
                          [`Recargas (${n0(r.recargasN)})`, r.recargasQ],
                          [`Apoyos (${n0(r.apoyosN)})`, r.apoyosQ],
                          [`Standby personal (${n0(r.stbPerN)} días)`, r.stbPerQ],
                          [`Standby camiones (${n0(r.stbCamN)} días)`, r.stbCamQ],
                        ].map(([k, v]) => (
                          <span key={String(k)} className="flex justify-between gap-4">
                            <span className="text-slate-300">{k}</span>
                            <span className="font-semibold tabular-nums">{Q(Number(v))}</span>
                          </span>
                        ))}
                        <span className="flex justify-between gap-4 border-t border-white/20 mt-1 pt-1 font-bold">
                          <span>Total · {tot.total ? ((r.total / tot.total) * 100).toFixed(1) : 0}%</span>
                          <span className="tabular-nums">{Q(r.total)}</span>
                        </span>
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Tabla por agencia */}
          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5">
            <h3 className="text-sm font-bold text-slate-800 mb-3">Detalle de costos por agencia</h3>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs min-w-[980px]">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    <th className="text-left py-2 px-2">Agencia</th>
                    <th className="text-right py-2 px-2">Viajes</th>
                    <th className="text-right py-2 px-2">Q 1er viaje</th>
                    <th className="text-right py-2 px-2">Recargas</th>
                    <th className="text-right py-2 px-2">Q recargas</th>
                    <th className="text-right py-2 px-2">Q apoyos</th>
                    <th className="text-right py-2 px-2">Standby pers.</th>
                    <th className="text-right py-2 px-2">Standby cam.</th>
                    <th className="text-right py-2 px-2">Total</th>
                    <th className="text-right py-2 px-2">%</th>
                    <th className="text-right py-2 px-2">Costo / salida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resumen.map((r) => {
                    const sal = r.viajesN + r.recargasN + r.apoyosN - r.pendientes;
                    return (
                      <tr key={r.agencia} className={`hover:bg-slate-50 cursor-pointer ${agDetalle === r.agencia ? 'bg-sky-50' : ''}`} onClick={() => setAgDetalle((a) => (a === r.agencia ? '' : r.agencia))}>
                        <td className="py-2 px-2 font-semibold text-slate-800 whitespace-nowrap">{r.agencia}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{n0(r.viajesN)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{Q(r.viajesQ)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{n0(r.recargasN)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{Q(r.recargasQ)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{Q(r.apoyosQ)}</td>
                        <td className="py-2 px-2 text-right tabular-nums" title={`${n0(r.stbPerN)} días-persona`}>
                          {Q(r.stbPerQ)}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums" title={`${n0(r.stbCamN)} días-camión`}>
                          {Q(r.stbCamQ)}
                        </td>
                        <td className="py-2 px-2 text-right tabular-nums font-black text-slate-900">{Q(r.total)}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-slate-500">{tot.total ? `${((r.total / tot.total) * 100).toFixed(1)}%` : '—'}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-slate-600">{sal ? Q((r.viajesQ + r.recargasQ + r.apoyosQ) / sal) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {resumen.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 font-black text-slate-900">
                      <td className="py-2 px-2">Total</td>
                      <td className="py-2 px-2 text-right tabular-nums">{n0(tot.viajesN)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{Q(tot.viajesQ)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{n0(tot.recargasN)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{Q(tot.recargasQ)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{Q(tot.apoyosQ)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{Q(tot.stbPerQ)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{Q(tot.stbCamQ)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{Q(tot.total)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">100%</td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {tot.viajesN + tot.recargasN + tot.apoyosN - tot.pendientes > 0 ? Q((tot.viajesQ + tot.recargasQ + tot.apoyosQ) / (tot.viajesN + tot.recargasN + tot.apoyosN - tot.pendientes)) : '—'}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {sinCosto > 0 && <p className="mt-2 text-[11px] text-slate-500">{n0(sinCosto)} salida(s) de ruta a piso, bolsón o Self Service no generan costo.</p>}
          </section>

          {/* Camiones rentados: costo a asignar */}
          {rentadas.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <TruckIcon className="w-4 h-4 text-slate-500" />
                Viajes con camión rentado
                {rentadasSinValor > 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">{rentadasSinValor} sin valor</span>}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5 mb-3">Escribe el costo de cada viaje; se guarda al salir del campo. Déjalo vacío si aún no lo sabes.</p>
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs min-w-[760px]">
                  <thead>
                    <tr className="text-[10.5px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                      <th className="text-left py-2 px-2">Día</th>
                      <th className="text-left py-2 px-2">Ruta</th>
                      <th className="text-left py-2 px-2">Agencia</th>
                      <th className="text-left py-2 px-2">Tipo</th>
                      <th className="text-left py-2 px-2">Camión</th>
                      <th className="text-left py-2 px-2">Tripulación</th>
                      <th className="text-right py-2 px-2">Costo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rentadas.map((s) => (
                      <tr key={s.id}>
                        <td className="py-1.5 px-2 tabular-nums whitespace-nowrap">{s.dia.slice(0, 5)}</td>
                        <td className="py-1.5 px-2 font-mono font-semibold">{s.ruta}</td>
                        <td className="py-1.5 px-2">{s.agencia}</td>
                        <td className="py-1.5 px-2">{s.tipoAsignacion}</td>
                        <td className="py-1.5 px-2 font-mono">{s.placa || '—'}</td>
                        <td className="py-1.5 px-2">{s.tripulacion} pers.</td>
                        <td className="py-1.5 px-2">
                          <MontoManual valor={s.costo} onGuardar={(v) => guardarMontoManual(s, v)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Salidas del mes */}
          <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Viajes del mes{agDetalle ? ` · ${agDetalle}` : ''}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">{n0(detalle.length)} salida(s) con costo · cómo se calculó cada una</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select value={agDetalle} onChange={(e) => setAgDetalle(e.target.value)} aria-label="Agencia" className="min-h-[36px] px-2 rounded-lg border border-slate-200 text-xs bg-white">
                  <option value="">Todas las agencias</option>
                  {resumen.map((r) => (
                    <option key={r.agencia} value={r.agencia}>
                      {r.agencia}
                    </option>
                  ))}
                </select>
                <label className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={buscar}
                    onChange={(e) => {
                      setBuscar(e.target.value);
                      setLimite(80);
                    }}
                    placeholder="Ruta, placa o piloto"
                    aria-label="Buscar viaje"
                    className="min-h-[36px] pl-8 pr-3 rounded-lg border border-slate-200 text-xs w-48 outline-none focus:border-slate-400"
                  />
                </label>
              </div>
            </div>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs min-w-[900px]">
                <thead>
                  <tr className="text-[10.5px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                    <th className="text-left py-2 px-2">Día</th>
                    <th className="text-left py-2 px-2">Ruta</th>
                    <th className="text-left py-2 px-2">Agencia · segmento</th>
                    <th className="text-left py-2 px-2">Tipo</th>
                    <th className="text-left py-2 px-2">Camión</th>
                    <th className="text-left py-2 px-2">Cálculo</th>
                    <th className="text-right py-2 px-2">Costo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detalle.slice(0, limite).map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="py-1.5 px-2 tabular-nums whitespace-nowrap">{s.dia.slice(0, 5)}</td>
                      <td className="py-1.5 px-2 font-mono font-semibold">{s.ruta}</td>
                      <td className="py-1.5 px-2">
                        {s.agencia}
                        {s.segmento && <span className="text-slate-400"> · {s.segmento}</span>}
                      </td>
                      <td className="py-1.5 px-2 whitespace-nowrap">{s.tipoAsignacion}</td>
                      <td className="py-1.5 px-2 font-mono whitespace-nowrap">
                        {s.placa || '—'}
                        {s.rentado && <span className="ml-1 font-sans text-[10px] font-bold text-violet-700">RENTADO</span>}
                      </td>
                      <td className="py-1.5 px-2 text-slate-600">
                        {s.detalle}
                        {s.tarifaUsada && !s.rentado && <span className="text-slate-400"> · {s.tarifaUsada}</span>}
                        {s.aviso && <span className="block text-[10.5px] text-amber-700">{s.aviso}</span>}
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{s.costo == null ? <span className="text-amber-700">Sin valor</span> : Q(s.costo)}</td>
                    </tr>
                  ))}
                  {detalle.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-400">
                        Sin viajes con costo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {detalle.length > limite && (
              <button type="button" onClick={() => setLimite((l) => l + 200)} className="mt-2 text-xs font-semibold text-sky-700 hover:underline cursor-pointer">
                Mostrar más ({n0(detalle.length - limite)} restantes)
              </button>
            )}
            <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
              Standby: {diasStandby ? `${diasStandby} día(s) con registro en el mes${primerDiaStandby ? `, desde el ${primerDiaStandby}` : ''}` : 'sin registro en el mes'}. Se cobra por día a cada camión y persona que no salió con un motivo que remunera.
            </p>
          </section>
        </>
      )}
    </div>
  );
};
