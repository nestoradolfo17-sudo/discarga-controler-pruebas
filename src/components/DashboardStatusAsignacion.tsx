import React, { useEffect, useMemo, useState } from 'react';
import { Route, Truck, Staff } from '../types';
import { formatDateToGuatemala } from '../utils/date';
import { getRouteKey } from '../utils/routeKey';
import { toNum } from '../utils/number';
import { asignadosEnFecha, camionesSinAsignar, personalSinAsignar, diaDe } from '../utils/recursosSinAsignar';
import { FileSpreadsheet, Truck as TruckIcon, ClipboardCheck, CheckCircle2, Clock, AlertTriangle, Search, Building2 } from 'lucide-react';
import type { ReportePdf } from '../utils/dashboardPdf';

// --- Status de Asignación (solo administradores) ---
// Seguimiento por agencia de los 3 pasos del día:
//   1. Carga de Excel: la agencia ya cargó sus rutas del día.
//   2. Asignación: todas sus rutas tienen camión y tripulación (o quedaron a
//      piso, en bolsón o son Self Service).
//   3. Fin de Asignación: todos sus camiones y personal que no salieron tienen
//      motivo registrado (misma regla que el botón "Fin de Asignación").
// Arriba, un semáforo por agencia (un foco por paso); abajo, el detalle.
// Solo LEE datos; no modifica nada.

const C = {
  marino: '#2C3790',
  azul: '#2f5fb8',
  cielo: '#5AACE4',
  verde: '#1a9e76',
  verdeTexto: '#13795b',
  oro: '#d9a521',
  oroTexto: '#9a6f00',
  rojo: '#c84448',
  rojoTexto: '#a8353a',
  pista: '#eef2f7',
};

type Paso = 'ok' | 'proceso' | 'pendiente' | 'espera';
type EstadoAg = 'completa' | 'falta_fin' | 'asignando' | 'sin_carga';

interface FilaAgencia {
  ag: string;
  // 1. Carga
  rutasCargadas: number;
  cjCargadas: number;
  horaCarga: string; // primera carga
  // 2. Asignación
  totalAsig: number;
  resueltas: number;
  despachadas: number;
  aPiso: number;
  pendientes: number;
  ultimaAsig: string;
  // 3. Fin de asignación
  camParados: number;
  camSinMotivo: number;
  perParados: number;
  perSinMotivo: number;
  horaFin: string;
  // Resultado
  p1: Paso;
  p2: Paso;
  p3: Paso;
  estado: EstadoAg;
}

interface Props {
  routes: Route[]; // tablero (todas las agencias)
  historicalRoutes: Route[];
  trucks: Truck[];
  staff: Staff[];
  // Filtro de agencias de la barra superior (vacío = todas).
  enFiltro?: (ag: string) => boolean;
  registrarReporte?: (armar: () => ReportePdf) => void;
}

// Nombres que NO son agencias operativas de asignación (proyectos, áreas o
// agencias que no cargan Excel diario): no entran al Status.
const normAg = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const NO_SEGUIR = new Set(
  ['CMI', 'Lif Brands', 'Mercadeo Operativo', 'Monte Maria', 'Otros Proyectos', 'Proyecto Huracan', 'SSO', 'Zona Pradera'].map(normAg)
);
const seSigue = (ag: string) => !NO_SEGUIR.has(normAg(ag));

const isPiso = (r: Route) => !!(r.aPiso || r.tipoAsignacion === 'Ruta a Piso' || r.asignacion?.tipoAsignacion === 'Ruta a Piso');
const isBolson = (r: Route) => !!(r.esBolson || r.tipoAsignacion === 'Ruta Bolsón');
const isSelf = (r: Route) => !!(r.esSelfService || r.tipoAsignacion === 'Self Service');
const despachada = (r: Route) => r.estado !== 'Pendiente' || !!r.liquidacion;
const hhmm = (t?: string | null) => /(\d{1,2}):(\d{2})/.exec(String(t || ''))?.[0]?.padStart(5, '0') || '';
const n0 = (v: number) => Math.round(v).toLocaleString('en-US');
// "dd/mm/aaaa hh:mm" → número ordenable.
const orden = (t?: string | null) => {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D+(\d{1,2}):(\d{2}))?/.exec(String(t || ''));
  return m ? Number(m[3]) * 1e8 + Number(m[2]) * 1e6 + Number(m[1]) * 1e4 + Number(m[4] || 0) * 100 + Number(m[5] || 0) : 0;
};
// Día "dd/mm/aaaa" (de cualquier texto) → milisegundos (para ventanas de días).
const msDia = (t?: string | null) => {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(t || ''));
  return m ? Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : 0;
};
const isoADia = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
};
const diaAIso = (dia: string) => {
  const [d, m, y] = dia.split('/');
  return `${y}-${m}-${d}`;
};

const ESTADO_INFO: Record<EstadoAg, { t: string; bg: string; fg: string; rank: number }> = {
  sin_carga: { t: 'Falta cargar Excel', bg: '#fbe5e6', fg: C.rojoTexto, rank: 0 },
  asignando: { t: 'Falta asignar', bg: '#fbf1d9', fg: C.oroTexto, rank: 1 },
  falta_fin: { t: 'Falta fin de asignación', bg: '#e7eefa', fg: C.marino, rank: 2 },
  completa: { t: 'Completa', bg: '#e3f4ee', fg: C.verdeTexto, rank: 3 },
};

const PasoIcono: React.FC<{ p: Paso; n: number }> = ({ p, n }) => {
  const st =
    p === 'ok'
      ? { bg: C.verde, fg: '#fff', bd: C.verde }
      : p === 'proceso'
      ? { bg: '#fff', fg: C.oroTexto, bd: C.oro }
      : p === 'pendiente'
      ? { bg: '#fff', fg: C.rojoTexto, bd: C.rojo }
      : { bg: C.pista, fg: '#94a3b8', bd: '#cbd5e1' };
  return (
    <span
      className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 border-2"
      style={{ backgroundColor: st.bg, color: st.fg, borderColor: st.bd }}
      aria-hidden="true"
    >
      {p === 'ok' ? '✓' : n}
    </span>
  );
};

// Semáforo de cada paso: verde = listo, amarillo = en proceso,
// rojo = pendiente, gris = en espera del paso anterior.
const LUZ: Record<Paso, { c: string; t: string }> = {
  ok: { c: C.verde, t: 'Listo' },
  proceso: { c: C.oro, t: 'En proceso' },
  pendiente: { c: C.rojo, t: 'Pendiente' },
  espera: { c: '#cbd5e1', t: 'En espera' },
};
const Foco: React.FC<{ p: Paso; size?: number }> = ({ p, size = 14 }) => (
  <span
    className="inline-block rounded-full shrink-0"
    style={{ width: size, height: size, backgroundColor: LUZ[p].c, boxShadow: p === 'espera' ? 'none' : `0 0 0 3px ${LUZ[p].c}2E` }}
    aria-label={LUZ[p].t}
    title={LUZ[p].t}
  />
);

export const DashboardStatusAsignacion: React.FC<Props> = ({ routes, historicalRoutes, trucks, staff, enFiltro, registrarReporte }) => {
  const hoyDia = formatDateToGuatemala(new Date());
  const [dia, setDia] = useState(hoyDia);
  const [filtro, setFiltro] = useState<'todas' | 'pendientes' | 'completas'>('todas');
  const [buscar, setBuscar] = useState('');
  const esHoy = dia === hoyDia;
  const ahora = new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

  // Todas las rutas (tablero + historial) sin duplicar.
  const todas = useMemo(() => {
    const m = new Map<string, Route>();
    [...historicalRoutes, ...routes].forEach((r) => m.set(`${getRouteKey(r)}|${r.tripNumber || 1}|${r.liquidacion?.fechaLiquidacion || ''}`, r));
    return [...m.values()];
  }, [routes, historicalRoutes]);

  // Agencias que se esperan cada día: las que tienen camiones o personal
  // activos, o rutas en los últimos 14 días.
  const agenciasEsperadas = useMemo(() => {
    const set = new Set<string>();
    trucks.forEach((t) => t.agencia && t.estado !== 'Baja' && set.add(t.agencia));
    staff.forEach((s) => s.agencia && s.estado !== 'Baja' && s.estatus !== 'BAJA' && set.add(s.agencia));
    const fin = msDia(dia);
    const ini = fin - 14 * 864e5;
    todas.forEach((r) => {
      const d = msDia(r.fecha);
      if (r.agencia && d && d >= ini && d <= fin) set.add(r.agencia);
    });
    return [...set].filter((ag) => ag && ag !== 'Sin agencia' && seSigue(ag) && (!enFiltro || enFiltro(ag))).sort((a, b) => a.localeCompare(b, 'es'));
  }, [trucks, staff, todas, dia, enFiltro]);

  const asignados = useMemo(() => asignadosEnFecha(todas, dia), [todas, dia]);

  const filas: FilaAgencia[] = useMemo(() => {
    const mismaFecha = (t?: string) => diaDe(t) === dia;
    return agenciasEsperadas.map((ag) => {
      const delAg = todas.filter((r) => r.agencia === ag);
      // 1. Carga: rutas cuya fecha original es el día elegido.
      const cargadas = delAg.filter((r) => mismaFecha(r.fechaOriginalRuta || r.fecha));
      const primera = cargadas.map((r) => r.fechaCarga || r.fechaCreacion || '').filter(Boolean).sort((a, b) => orden(a) - orden(b))[0] || '';
      // 2. Asignación: rutas que operan ese día (incluye las que vienen a piso de
      //    días anteriores) + las del día que se mandaron a piso para mañana.
      const operan = delAg.filter((r) => mismaFecha(r.fecha) || (mismaFecha(r.fechaOriginalRuta) && !mismaFecha(r.fecha) && isPiso(r)));
      const desp = operan.filter(despachada);
      const piso = operan.filter((r) => !despachada(r) && isPiso(r));
      const pend = operan.filter((r) => !despachada(r) && !isPiso(r) && !isBolson(r) && !isSelf(r));
      const ultima = desp
        .map((r) => r.fechaAsignacion || r.asignacion?.fechaAsignacion || r.ultimoDespacho?.fechaAsignacion || '')
        .filter((t) => mismaFecha(t) || diaDe(t) === '')
        .sort((a, b) => orden(b) - orden(a))[0];
      // 3. Fin de asignación: recursos de la agencia que no salieron ese día.
      const cam = camionesSinAsignar(trucks.filter((t) => t.agencia === ag), asignados);
      const per = personalSinAsignar(staff.filter((s) => s.agencia === ag), asignados);
      const camSin = cam.filter((t) => !t.motivoNoAsignado).length;
      const perSin = per.filter((s) => !s.motivoNoAsignado).length;
      const horaFin = [...cam, ...per]
        .map((x) => x.motivoNoAsignadoFecha || '')
        .filter((t) => mismaFecha(t))
        .sort((a, b) => orden(b) - orden(a))[0];

      const hayCarga = cargadas.length > 0 || operan.length > 0;
      const asigCompleta = hayCarga && pend.length === 0;
      const finCompleto = camSin + perSin === 0;
      const p1: Paso = hayCarga ? 'ok' : 'pendiente';
      const p2: Paso = !hayCarga ? 'espera' : asigCompleta ? 'ok' : desp.length > 0 ? 'proceso' : 'pendiente';
      const p3: Paso = !asigCompleta ? 'espera' : finCompleto ? 'ok' : 'pendiente';
      const estado: EstadoAg = !hayCarga ? 'sin_carga' : !asigCompleta ? 'asignando' : !finCompleto ? 'falta_fin' : 'completa';
      return {
        ag,
        rutasCargadas: cargadas.length,
        cjCargadas: cargadas.reduce((a, r) => a + toNum(r.cajasOriginales || r.cajasFisicas), 0),
        horaCarga: primera,
        totalAsig: operan.length,
        resueltas: operan.length - pend.length,
        despachadas: desp.length,
        aPiso: piso.length,
        pendientes: pend.length,
        ultimaAsig: ultima || '',
        camParados: cam.length,
        camSinMotivo: camSin,
        perParados: per.length,
        perSinMotivo: perSin,
        horaFin: horaFin || '',
        p1,
        p2,
        p3,
        estado,
      };
    });
  }, [agenciasEsperadas, todas, dia, trucks, staff, asignados]);

  const N = filas.length;
  const conCarga = filas.filter((f) => f.p1 === 'ok').length;
  const conAsig = filas.filter((f) => f.p2 === 'ok').length;
  const conFin = filas.filter((f) => f.p3 === 'ok').length;
  const completas = filas.filter((f) => f.estado === 'completa').length;
  const faltanCarga = filas.filter((f) => f.p1 !== 'ok');
  const faltanAsig = filas.filter((f) => f.p1 === 'ok' && f.p2 !== 'ok');
  const faltanFin = filas.filter((f) => f.p2 === 'ok' && f.p3 !== 'ok');
  const rutasPend = faltanAsig.reduce((a, f) => a + f.pendientes, 0);
  const motivosPend = faltanFin.reduce((a, f) => a + f.camSinMotivo + f.perSinMotivo, 0);

  const visibles = filas
    .filter((f) => (filtro === 'todas' ? true : filtro === 'completas' ? f.estado === 'completa' : f.estado !== 'completa'))
    .filter((f) => !buscar.trim() || f.ag.toLowerCase().includes(buscar.trim().toLowerCase()))
    .sort((a, b) => ESTADO_INFO[a.estado].rank - ESTADO_INFO[b.estado].rank || a.ag.localeCompare(b.ag, 'es'));

  const fechaHora = (t: string) => (t ? `${diaDe(t) && diaDe(t) !== dia ? `${diaDe(t).slice(0, 5)} ` : ''}${hhmm(t)}` : '');

  // PDF con los mismos datos.
  useEffect(() => {
    registrarReporte?.(() => ({
      titulo: 'Status de Asignación',
      periodo: `${esHoy ? 'Hoy ' : ''}${dia}${esHoy ? ` · corte ${ahora}` : ''}`,
      agencia: `${N} agencias`,
      kpis: [
        { label: 'Excel cargado', valor: `${conCarga}/${N}`, sub: faltanCarga.length ? `Faltan: ${faltanCarga.map((f) => f.ag).join(', ')}` : 'Todas cargaron', tono: faltanCarga.length ? 'crit' : 'ok' },
        { label: 'Asignación completa', valor: `${conAsig}/${N}`, sub: faltanAsig.length ? `${n0(rutasPend)} rutas por asignar` : 'Sin rutas pendientes', tono: faltanAsig.length ? 'warn' : 'ok' },
        { label: 'Fin de asignación', valor: `${conFin}/${N}`, sub: faltanFin.length ? `${n0(motivosPend)} recursos sin motivo` : 'Sin pendientes', tono: faltanFin.length ? 'warn' : 'ok' },
        { label: 'Agencias completas', valor: `${completas}/${N}`, sub: 'Los 3 pasos listos', tono: completas === N ? 'ok' : 'info' },
      ],
      tablas: [
        {
          titulo: 'Status por agencia',
          sub: `${dia} · ordenadas por lo que falta`,
          columnas: [
            { t: 'Agencia' },
            { t: 'Excel (hora)' },
            { t: 'Rutas', num: true },
            { t: 'CJ', num: true },
            { t: 'Asignadas', num: true },
            { t: 'Por asignar', num: true },
            { t: 'Última asig.' },
            { t: 'Sin motivo (cam/pers)' },
            { t: 'Estado' },
          ],
          filas: [...filas]
            .sort((a, b) => ESTADO_INFO[a.estado].rank - ESTADO_INFO[b.estado].rank || a.ag.localeCompare(b.ag, 'es'))
            .map((f) => [
              f.ag,
              f.p1 === 'ok' ? fechaHora(f.horaCarga) || 'Sí' : 'No',
              n0(f.rutasCargadas),
              n0(f.cjCargadas),
              `${n0(f.resueltas)}/${n0(f.totalAsig)}`,
              n0(f.pendientes),
              fechaHora(f.ultimaAsig) || '—',
              `${f.camSinMotivo}/${f.perSinMotivo}`,
              ESTADO_INFO[f.estado].t,
            ]),
          vacio: 'Sin agencias.',
        },
      ],
      notas: [
        'Excel cargado: la agencia tiene rutas con fecha del día. Asignación completa: todas sus rutas salieron con camión y tripulación, o quedaron a piso, en bolsón o son Self Service. Fin de asignación: todos sus camiones y personal que no salieron tienen motivo.',
        ...(esHoy ? [] : ['Para días anteriores, el fin de asignación usa el estado y los motivos actuales de camiones y personal.']),
      ],
    }));
  });

  const tarjeta = (titulo: string, icono: React.ReactNode, hechos: number, faltan: FilaAgencia[], sub: string, color: string) => {
    const p = N ? hechos / N : 0;
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm min-w-0 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1A`, color }}>
            {icono}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{titulo}</span>
        </div>
        <div className="flex items-end justify-between gap-2">
          <div className="text-3xl font-black text-slate-900 leading-none tabular-nums">
            {hechos}
            <span className="text-lg text-slate-400 font-bold">/{N}</span>
          </div>
          <span className="text-sm font-bold tabular-nums" style={{ color: p === 1 ? C.verdeTexto : color }}>
            {Math.round(p * 100)}%
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: C.pista }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${p * 100}%`, backgroundColor: p === 1 ? C.verde : color }} />
        </div>
        <div className="text-[11px] text-slate-500 leading-snug min-h-[2.5em]">
          {faltan.length === 0 ? <span className="font-semibold" style={{ color: C.verdeTexto }}>Todas listas</span> : sub}
        </div>
      </div>
    );
  };

  const listaFaltan = (titulo: string, color: string, items: { ag: string; det: string }[], vacio: string) => (
    <div className="min-w-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color }}>
          {titulo}
        </span>
        <span className="text-xs font-black tabular-nums px-2 py-0.5 rounded-full" style={{ backgroundColor: `${color}1A`, color }}>
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs font-semibold" style={{ color: C.verdeTexto }}>
          {vacio}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((x) => (
            <li key={x.ag} className="text-xs rounded-lg border px-2 py-1 bg-white" style={{ borderColor: `${color}55` }}>
              <span className="font-semibold text-slate-800">{x.ag}</span>
              {x.det && <span className="text-slate-500"> · {x.det}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <section className="rounded-2xl shadow-sm text-white overflow-hidden" style={{ background: 'linear-gradient(135deg, #2C3790 0%, #1E2768 100%)' }}>
        <div className="p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-200">Status de asignación · solo administradores</div>
              <h2 className="text-xl sm:text-2xl font-black leading-tight">
                {esHoy ? 'Hoy ' : ''}
                {dia}
              </h2>
              <p className="text-xs text-sky-100/80 mt-0.5">
                {esHoy ? `Datos en vivo · corte ${ahora}` : 'Día anterior'} · {N} agencias en seguimiento
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-sky-100 [color-scheme:dark]">
              Fecha
              <input
                type="date"
                value={diaAIso(dia)}
                max={diaAIso(hoyDia)}
                onChange={(e) => e.target.value && setDia(isoADia(e.target.value))}
                className="min-h-[38px] px-2 rounded-lg bg-white/10 border border-white/20 text-white"
              />
              {!esHoy && (
                <button type="button" onClick={() => setDia(hoyDia)} className="min-h-[38px] px-3 rounded-lg bg-white text-[#2C3790] font-bold cursor-pointer">
                  Hoy
                </button>
              )}
            </label>
          </div>
          {/* Embudo de los 3 pasos */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 sm:gap-3">
            {[
              ['1', 'Excel cargado', conCarga],
              ['2', 'Asignación completa', conAsig],
              ['3', 'Fin de asignación', conFin],
            ].map(([n, t, v], i) => (
              <React.Fragment key={String(n)}>
                {i > 0 && <span className="hidden sm:block text-sky-200/60 text-xl">›</span>}
                <div className="rounded-xl bg-white/10 px-3 py-2.5 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-sm font-black">{n}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-sky-100/90 font-semibold">{t}</div>
                    <div className="h-1.5 rounded-full bg-white/15 overflow-hidden mt-1">
                      <div className="h-full rounded-full" style={{ width: `${N ? (Number(v) / N) * 100 : 0}%`, backgroundColor: Number(v) === N ? '#8fe3c4' : C.cielo }} />
                    </div>
                  </div>
                  <span className="text-lg font-black tabular-nums">
                    {v}/{N}
                  </span>
                </div>
              </React.Fragment>
            ))}
          </div>
          {!esHoy && (
            <p className="text-[11px] text-amber-100 bg-amber-400/20 rounded-lg px-3 py-1.5">
              Para días anteriores, el fin de asignación se calcula con el estado y los motivos actuales de camiones y personal.
            </p>
          )}
        </div>
      </section>

      {/* Semáforo por agencia */}
      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-500" />
            Semáforo por agencia
          </h3>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
            {(['ok', 'proceso', 'pendiente', 'espera'] as Paso[]).map((p) => (
              <span key={p} className="inline-flex items-center gap-1.5">
                <Foco p={p} size={10} />
                {LUZ[p].t}
              </span>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="text-left py-2 px-2">Agencia</th>
                <th className="text-center py-2 px-2">1 · Excel cargado</th>
                <th className="text-center py-2 px-2">2 · Asignación</th>
                <th className="text-center py-2 px-2">3 · Fin de asignación</th>
                <th className="text-left py-2 px-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {N === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    Sin agencias para mostrar.
                  </td>
                </tr>
              )}
              {[...filas]
                .sort((a, b) => ESTADO_INFO[a.estado].rank - ESTADO_INFO[b.estado].rank || a.ag.localeCompare(b.ag, 'es'))
                .map((f) => {
                  const info = ESTADO_INFO[f.estado];
                  const celda = (p: Paso, txt: string) => (
                    <td className="py-2.5 px-2">
                      <div className="flex items-center justify-center gap-2">
                        <Foco p={p} />
                        <span className="text-[11px] text-slate-500 whitespace-nowrap">{txt}</span>
                      </div>
                    </td>
                  );
                  return (
                    <tr key={f.ag} className="hover:bg-slate-50">
                      <td className="py-2.5 px-2 font-bold text-slate-800 whitespace-nowrap">{f.ag}</td>
                      {celda(f.p1, f.p1 === 'ok' ? `${n0(f.rutasCargadas)} rutas` : 'Sin cargar')}
                      {celda(f.p2, f.p2 === 'espera' ? 'En espera' : `${n0(f.resueltas)}/${n0(f.totalAsig)}`)}
                      {celda(
                        f.p3,
                        f.p3 === 'espera' ? 'En espera' : f.p3 === 'ok' ? 'Listo' : `${f.camSinMotivo + f.perSinMotivo} sin motivo`
                      )}
                      <td className="py-2.5 px-2">
                        <span className="inline-block whitespace-nowrap text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: info.bg, color: info.fg }}>
                          {info.t}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tarjeta('Excel cargado', <FileSpreadsheet className="w-4 h-4" />, conCarga, faltanCarga, `Faltan ${faltanCarga.length} agencia(s) por cargar`, C.azul)}
        {tarjeta('Asignación completa', <TruckIcon className="w-4 h-4" />, conAsig, filas.filter((f) => f.p2 !== 'ok'), `${n0(rutasPend)} ruta(s) por asignar en ${faltanAsig.length} agencia(s)`, C.oro)}
        {tarjeta('Fin de asignación', <ClipboardCheck className="w-4 h-4" />, conFin, filas.filter((f) => f.p3 !== 'ok'), `${n0(motivosPend)} recurso(s) sin motivo en ${faltanFin.length} agencia(s)`, C.marino)}
        {tarjeta('Agencias completas', <CheckCircle2 className="w-4 h-4" />, completas, filas.filter((f) => f.estado !== 'completa'), `${N - completas} agencia(s) con pasos pendientes`, C.verde)}
      </div>

      {/* Qué falta */}
      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-slate-500" />
          Qué falta por agencia
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
          {listaFaltan('Falta cargar Excel', C.rojo, faltanCarga.map((f) => ({ ag: f.ag, det: '' })), 'Todas cargaron su Excel.')}
          {listaFaltan(
            'Falta asignar',
            C.oroTexto,
            faltanAsig.map((f) => ({ ag: f.ag, det: `${n0(f.pendientes)} ruta(s)` })),
            faltanCarga.length ? 'Las que cargaron ya asignaron todo.' : 'Todas asignaron sus rutas.'
          )}
          {listaFaltan(
            'Falta fin de asignación',
            C.marino,
            faltanFin.map((f) => ({ ag: f.ag, det: [f.camSinMotivo ? `${f.camSinMotivo} cam.` : '', f.perSinMotivo ? `${f.perSinMotivo} pers.` : ''].filter(Boolean).join(' · ') })),
            faltanAsig.length || faltanCarga.length ? 'Las que terminaron de asignar ya cerraron.' : 'Todas dieron fin de asignación.'
          )}
        </div>
      </section>

      {/* Detalle por agencia */}
      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-500" />
              Detalle por agencia
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Ordenadas por lo que falta: primero sin Excel, luego por asignar, luego sin fin de asignación.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="Filtro" className="flex rounded-lg bg-slate-100 p-0.5">
              {(
                [
                  ['todas', `Todas (${N})`],
                  ['pendientes', `Pendientes (${N - completas})`],
                  ['completas', `Completas (${completas})`],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={filtro === k}
                  onClick={() => setFiltro(k)}
                  className={`min-h-[34px] px-3 rounded-md text-xs font-semibold cursor-pointer ${filtro === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <label className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Buscar agencia"
                aria-label="Buscar agencia"
                className="min-h-[36px] pl-8 pr-3 rounded-lg border border-slate-200 text-xs w-44 outline-none focus:border-slate-400"
              />
            </label>
          </div>
        </div>

        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs min-w-[860px]">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="text-left py-2 px-2">Agencia</th>
                <th className="text-left py-2 px-2">1 · Carga de Excel</th>
                <th className="text-left py-2 px-2">2 · Asignación</th>
                <th className="text-left py-2 px-2">3 · Fin de asignación</th>
                <th className="text-left py-2 px-2">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    Sin agencias para mostrar.
                  </td>
                </tr>
              )}
              {visibles.map((f) => {
                const pA = f.totalAsig ? f.resueltas / f.totalAsig : 0;
                const info = ESTADO_INFO[f.estado];
                return (
                  <tr key={f.ag} className="hover:bg-slate-50 align-top">
                    <td className="py-3 px-2 font-bold text-slate-800 whitespace-nowrap">{f.ag}</td>
                    <td className="py-3 px-2">
                      <div className="flex items-start gap-2">
                        <PasoIcono p={f.p1} n={1} />
                        {f.p1 === 'ok' ? (
                          <div>
                            <div className="font-semibold text-slate-800">
                              {n0(f.rutasCargadas)} rutas · {n0(f.cjCargadas)} CJ
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {f.horaCarga ? `Cargado ${fechaHora(f.horaCarga)}` : 'Hora no registrada'}
                            </div>
                          </div>
                        ) : (
                          <div className="font-semibold" style={{ color: C.rojoTexto }}>
                            Sin rutas cargadas
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-2 min-w-[220px]">
                      <div className="flex items-start gap-2">
                        <PasoIcono p={f.p2} n={2} />
                        {f.p2 === 'espera' ? (
                          <span className="text-slate-400">Espera la carga</span>
                        ) : (
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between gap-2">
                              <span className="font-semibold text-slate-800 tabular-nums">
                                {n0(f.resueltas)}/{n0(f.totalAsig)} rutas
                              </span>
                              <span className="font-bold tabular-nums" style={{ color: pA === 1 ? C.verdeTexto : C.oroTexto }}>
                                {Math.round(pA * 100)}%
                              </span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ backgroundColor: C.pista }}>
                              <div className="h-full rounded-full" style={{ width: `${pA * 100}%`, backgroundColor: pA === 1 ? C.verde : C.oro }} />
                            </div>
                            <div className="text-[11px] text-slate-500 mt-1">
                              {f.pendientes ? (
                                <span className="font-semibold" style={{ color: C.oroTexto }}>
                                  {n0(f.pendientes)} por asignar
                                </span>
                              ) : (
                                'Todas resueltas'
                              )}
                              {f.aPiso ? ` · ${n0(f.aPiso)} a piso` : ''}
                              {f.ultimaAsig ? ` · última ${fechaHora(f.ultimaAsig)}` : ''}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-start gap-2">
                        <PasoIcono p={f.p3} n={3} />
                        {f.p3 === 'espera' ? (
                          <div>
                            <span className="text-slate-400">Espera la asignación</span>
                            {f.camSinMotivo + f.perSinMotivo > 0 && f.p1 === 'ok' && (
                              <div className="text-[11px] text-slate-400">
                                {f.camSinMotivo} cam. y {f.perSinMotivo} pers. sin motivo
                              </div>
                            )}
                          </div>
                        ) : f.p3 === 'ok' ? (
                          <div>
                            <div className="font-semibold text-slate-800">
                              {f.camParados + f.perParados ? `${f.camParados} cam. · ${f.perParados} pers. con motivo` : 'Sin recursos parados'}
                            </div>
                            {f.horaFin && (
                              <div className="text-[11px] text-slate-500 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Último motivo {fechaHora(f.horaFin)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <div className="font-semibold" style={{ color: C.rojoTexto }}>
                              Faltan {f.camSinMotivo + f.perSinMotivo} motivo(s)
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {f.camSinMotivo} de {f.camParados} camiones · {f.perSinMotivo} de {f.perParados} personas
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <span className="inline-block whitespace-nowrap text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: info.bg, color: info.fg }}>
                        {info.t}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
          <strong>Carga de Excel:</strong> la agencia tiene rutas con fecha del día. <strong>Asignación:</strong> rutas que ya salieron con camión y tripulación, o que
          quedaron a piso, en bolsón o son Self Service. <strong>Fin de asignación:</strong> todos los camiones y el personal de la agencia que no salieron ese día
          tienen motivo (la misma regla del botón "Fin de Asignación"). Se siguen las agencias con camiones o personal activos, o con rutas en los últimos 14 días (no se incluyen CMI, Lif Brands, Mercadeo Operativo, Monte María, Otros Proyectos, Proyecto Huracán, SSO ni Zona Pradera).
        </p>
      </section>
    </div>
  );
};
