import React, { useEffect, useMemo, useState } from 'react';
import { Route, Truck, Staff, RouteAssignment } from '../types';
import { formatDateToGuatemala } from '../utils/date';
import { getRouteKey } from '../utils/routeKey';
import { toNum } from '../utils/number';
import { asignadosEnFecha, camionesSinAsignar, personalSinAsignar, diaDe } from '../utils/recursosSinAsignar';
import { FileSpreadsheet, Truck as TruckIcon, ClipboardCheck, CheckCircle2, Clock, AlertTriangle, Search, Building2, Users } from 'lucide-react';
import type { ReportePdf } from '../utils/dashboardPdf';

// --- Status de Asignación (solo administradores) ---
// Seguimiento por agencia de los 3 pasos del día:
//   1. Carga de rutas (Excel): la agencia ya cargó sus rutas del día.
//   2. Asignación de camión, piloto y auxiliares (APP): todas sus rutas
//      salieron (o quedaron a piso, en bolsón o son Self Service) y cada ruta
//      que salió lleva tripulación completa: camión + piloto + al menos 1 APP.
//      Se distingue lo que salió solo con camión, o con camión y piloto sin APP.
//   3. Fin de asignación: todos sus camiones, pilotos y auxiliares que no
//      salieron tienen motivo registrado (misma regla que el botón "Fin de
//      Asignación").
// Dos vistas: "Semáforo" (resumen por agencia) y "Detalle por agencia".
// Solo LEE datos; no modifica nada.

const C = {
  marino: '#2C3790',
  azul: '#2f5fb8',
  cielo: '#5AACE4',
  verde: '#1a9e76',
  verdeTexto: '#13795b',
  oro: '#d9a521',
  oroTexto: '#9a6f00',
  naranja: '#e5793b',
  rojo: '#c84448',
  rojoTexto: '#a8353a',
  pista: '#eef2f7',
  gris: '#cbd5e1',
};

type Paso = 'ok' | 'proceso' | 'pendiente' | 'espera';
type EstadoAg = 'completa' | 'trip_incompleta' | 'falta_fin' | 'asignando' | 'sin_carga';
type Luz = 'verde' | 'amarillo' | 'rojo' | 'gris';

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
  // Tripulación de las rutas que salieron (sin piso, bolsón ni Self Service)
  conTrip: number; // rutas evaluadas
  tripCompleta: number; // camión + piloto + ≥1 APP
  tripSinApp: number; // camión + piloto, sin APP
  tripSoloCamion: number; // camión sin piloto
  tripSinCamion: number; // salió sin camión registrado
  // 3. Fin de asignación
  camParados: number;
  camSinMotivo: number;
  pilParados: number;
  pilSinMotivo: number;
  appParados: number;
  appSinMotivo: number;
  horaFin: string;
  // Resultado
  p1: Paso;
  p2: Paso;
  p3: Paso;
  estado: EstadoAg;
  luz: Luz;
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
const normAg = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const NO_SEGUIR = new Set(
  ['CMI', 'Lif Brands', 'Mercadeo Operativo', 'Monte Maria', 'Otros Proyectos', 'Proyecto Huracan', 'SSO', 'Zona Pradera'].map(normAg)
);
const seSigue = (ag: string) => !NO_SEGUIR.has(normAg(ag));

const isPiso = (r: Route) => !!(r.aPiso || r.tipoAsignacion === 'Ruta a Piso' || r.asignacion?.tipoAsignacion === 'Ruta a Piso');
const isBolson = (r: Route) => !!(r.esBolson || r.tipoAsignacion === 'Ruta Bolsón');
const isSelf = (r: Route) => !!(r.esSelfService || r.tipoAsignacion === 'Self Service');
const despachada = (r: Route) => r.estado !== 'Pendiente' || !!r.liquidacion;
const esPiloto = (s: Staff) => s.puesto === 'VPP' || s.puesto === 'VPPB' || s.rol === 'Conductor';
const hhmm = (t?: string | null) => /(\d{1,2}):(\d{2})/.exec(String(t || ''))?.[0]?.padStart(5, '0') || '';
const n0 = (v: number) => Math.round(v).toLocaleString('en-US');
const pl = (n: number, uno: string, varios: string) => `${n0(n)} ${n === 1 ? uno : varios}`;

type Tripulacion = 'completa' | 'sin_app' | 'solo_camion' | 'sin_camion';
/** Tripulación con la que salió la ruta (asignación vigente o último despacho). */
const tripulacionDe = (r: Route): Tripulacion => {
  const a: RouteAssignment | null | undefined = r.asignacion || r.ultimoDespacho;
  const camion = !!(a && (a.camionId || a.camionPlaca));
  const piloto = !!(a && a.conductor && a.conductor.trim() && a.conductor !== 'Sin piloto');
  const app = a ? [a.auxiliar1, a.auxiliar2, a.auxiliar3, a.auxiliar4].filter((x) => x && String(x).trim()).length : 0;
  if (!camion) return 'sin_camion';
  if (!piloto) return 'solo_camion';
  return app > 0 ? 'completa' : 'sin_app';
};

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

// Títulos de los pasos (mismos en encabezado, tarjetas, semáforo, tabla y PDF).
const PASO1 = 'Carga de rutas (Excel del día)';
const PASO2 = 'Asignación: camión, piloto y APP';
const PASO3 = 'Fin de asignación (motivo de lo que no salió)';

const ESTADO_INFO: Record<EstadoAg, { t: string; bg: string; fg: string; rank: number }> = {
  sin_carga: { t: 'Falta cargar Excel', bg: '#fbe5e6', fg: C.rojoTexto, rank: 0 },
  asignando: { t: 'Faltan rutas por asignar', bg: '#fbf1d9', fg: C.oroTexto, rank: 1 },
  falta_fin: { t: 'Falta fin de asignación', bg: '#e7eefa', fg: C.marino, rank: 2 },
  trip_incompleta: { t: 'Cerrada · tripulación incompleta', bg: '#fdecdf', fg: '#a4521f', rank: 3 },
  completa: { t: 'Completa', bg: '#e3f4ee', fg: C.verdeTexto, rank: 4 },
};

const LUZ: Record<Luz, { c: string; t: string; rank: number }> = {
  rojo: { c: C.rojo, t: 'Sin avance', rank: 0 },
  amarillo: { c: C.oro, t: 'En proceso / con observación', rank: 1 },
  verde: { c: C.verde, t: 'Completa', rank: 2 },
  gris: { c: C.gris, t: 'En espera', rank: 3 },
};
const luzDePaso = (p: Paso): Luz => (p === 'ok' ? 'verde' : p === 'proceso' ? 'amarillo' : p === 'pendiente' ? 'rojo' : 'gris');

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

const Foco: React.FC<{ luz: Luz; size?: number }> = ({ luz, size = 12 }) => (
  <span
    className="inline-block rounded-full shrink-0"
    style={{ width: size, height: size, backgroundColor: LUZ[luz].c, boxShadow: luz === 'gris' ? 'none' : `0 0 0 3px ${LUZ[luz].c}26` }}
    aria-label={LUZ[luz].t}
  />
);

/** Barra apilada de tripulación (completa / sin APP / solo camión / sin camión). */
const BarraTrip: React.FC<{ f: Pick<FilaAgencia, 'conTrip' | 'tripCompleta' | 'tripSinApp' | 'tripSoloCamion' | 'tripSinCamion'>; alto?: number }> = ({ f, alto = 6 }) => {
  const segs = [
    { v: f.tripCompleta, c: C.verde, t: 'Completa' },
    { v: f.tripSinApp, c: C.oro, t: 'Camión + piloto sin APP' },
    { v: f.tripSoloCamion, c: C.naranja, t: 'Solo camión (sin piloto)' },
    { v: f.tripSinCamion, c: C.rojo, t: 'Sin camión' },
  ];
  return (
    <div className="flex rounded-full overflow-hidden" style={{ height: alto, backgroundColor: C.pista }}>
      {f.conTrip > 0 &&
        segs.map((s) =>
          s.v > 0 ? <div key={s.t} title={`${s.t}: ${s.v}`} style={{ width: `${(s.v / f.conTrip) * 100}%`, backgroundColor: s.c }} /> : null
        )}
    </div>
  );
};

const textoTrip = (f: FilaAgencia) =>
  [
    f.tripCompleta ? `${n0(f.tripCompleta)} completas` : '',
    f.tripSinApp ? `${n0(f.tripSinApp)} sin APP` : '',
    f.tripSoloCamion ? `${n0(f.tripSoloCamion)} solo camión` : '',
    f.tripSinCamion ? `${n0(f.tripSinCamion)} sin camión` : '',
  ]
    .filter(Boolean)
    .join(' · ');

const textoFin = (f: FilaAgencia) =>
  [
    f.camSinMotivo ? pl(f.camSinMotivo, 'camión', 'camiones') : '',
    f.pilSinMotivo ? pl(f.pilSinMotivo, 'piloto', 'pilotos') : '',
    f.appSinMotivo ? pl(f.appSinMotivo, 'APP', 'APP') : '',
  ]
    .filter(Boolean)
    .join(' · ');

export const DashboardStatusAsignacion: React.FC<Props> = ({ routes, historicalRoutes, trucks, staff, enFiltro, registrarReporte }) => {
  const hoyDia = formatDateToGuatemala(new Date());
  const [dia, setDia] = useState(hoyDia);
  const [vista, setVista] = useState<'semaforo' | 'detalle'>('semaforo');
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
      // Tripulación de lo que salió (piso, bolsón y Self Service no llevan).
      const trip = { completa: 0, sin_app: 0, solo_camion: 0, sin_camion: 0 } as Record<Tripulacion, number>;
      const evaluadas = desp.filter((r) => !isPiso(r) && !isBolson(r) && !isSelf(r));
      evaluadas.forEach((r) => (trip[tripulacionDe(r)] += 1));
      const tripIncompletas = evaluadas.length - trip.completa;
      // 3. Fin de asignación: recursos de la agencia que no salieron ese día.
      const cam = camionesSinAsignar(trucks.filter((t) => t.agencia === ag), asignados);
      const per = personalSinAsignar(staff.filter((s) => s.agencia === ag), asignados);
      const pil = per.filter(esPiloto);
      const app = per.filter((s) => !esPiloto(s));
      const camSin = cam.filter((t) => !t.motivoNoAsignado).length;
      const pilSin = pil.filter((s) => !s.motivoNoAsignado).length;
      const appSin = app.filter((s) => !s.motivoNoAsignado).length;
      const horaFin = [...cam, ...per]
        .map((x) => x.motivoNoAsignadoFecha || '')
        .filter((t) => mismaFecha(t))
        .sort((a, b) => orden(b) - orden(a))[0];

      const hayCarga = cargadas.length > 0 || operan.length > 0;
      const sinPendientes = hayCarga && pend.length === 0;
      const finCompleto = camSin + pilSin + appSin === 0;
      const p1: Paso = hayCarga ? 'ok' : 'pendiente';
      // Paso 2 en verde solo si no quedan rutas por asignar Y todo lo que salió
      // llevó camión + piloto + APP. Con tripulación incompleta queda en amarillo.
      const p2: Paso = !hayCarga
        ? 'espera'
        : sinPendientes && tripIncompletas === 0
        ? 'ok'
        : desp.length > 0 || sinPendientes
        ? 'proceso'
        : 'pendiente';
      const p3: Paso = !sinPendientes ? 'espera' : finCompleto ? 'ok' : 'pendiente';
      const estado: EstadoAg = !hayCarga
        ? 'sin_carga'
        : !sinPendientes
        ? 'asignando'
        : !finCompleto
        ? 'falta_fin'
        : tripIncompletas > 0
        ? 'trip_incompleta'
        : 'completa';
      const luz: Luz = estado === 'completa' ? 'verde' : estado === 'sin_carga' || p2 === 'pendiente' ? 'rojo' : 'amarillo';
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
        conTrip: evaluadas.length,
        tripCompleta: trip.completa,
        tripSinApp: trip.sin_app,
        tripSoloCamion: trip.solo_camion,
        tripSinCamion: trip.sin_camion,
        camParados: cam.length,
        camSinMotivo: camSin,
        pilParados: pil.length,
        pilSinMotivo: pilSin,
        appParados: app.length,
        appSinMotivo: appSin,
        horaFin: horaFin || '',
        p1,
        p2,
        p3,
        estado,
        luz,
      };
    });
  }, [agenciasEsperadas, todas, dia, trucks, staff, asignados]);

  const N = filas.length;
  const conCarga = filas.filter((f) => f.p1 === 'ok').length;
  const conAsig = filas.filter((f) => f.p2 === 'ok').length;
  const conFin = filas.filter((f) => f.p3 === 'ok').length;
  const completas = filas.filter((f) => f.estado === 'completa').length;
  const faltanCarga = filas.filter((f) => f.p1 !== 'ok');
  const faltanAsig = filas.filter((f) => f.p1 === 'ok' && f.pendientes > 0);
  const conTripInc = filas.filter((f) => f.conTrip > f.tripCompleta);
  const faltanFin = filas.filter((f) => f.p3 === 'pendiente');
  const rutasPend = faltanAsig.reduce((a, f) => a + f.pendientes, 0);
  const motivosPend = faltanFin.reduce((a, f) => a + f.camSinMotivo + f.pilSinMotivo + f.appSinMotivo, 0);
  const luces = { verde: 0, amarillo: 0, rojo: 0, gris: 0 } as Record<Luz, number>;
  filas.forEach((f) => (luces[f.luz] += 1));
  const tot = filas.reduce(
    (a, f) => ({
      conTrip: a.conTrip + f.conTrip,
      tripCompleta: a.tripCompleta + f.tripCompleta,
      tripSinApp: a.tripSinApp + f.tripSinApp,
      tripSoloCamion: a.tripSoloCamion + f.tripSoloCamion,
      tripSinCamion: a.tripSinCamion + f.tripSinCamion,
      // Recursos sin motivo solo de las agencias que ya deben dar fin de asignación.
      cam: a.cam + (f.p3 === 'pendiente' ? f.camSinMotivo : 0),
      pil: a.pil + (f.p3 === 'pendiente' ? f.pilSinMotivo : 0),
      app: a.app + (f.p3 === 'pendiente' ? f.appSinMotivo : 0),
    }),
    { conTrip: 0, tripCompleta: 0, tripSinApp: 0, tripSoloCamion: 0, tripSinCamion: 0, cam: 0, pil: 0, app: 0 }
  );
  const pctTrip = tot.conTrip ? tot.tripCompleta / tot.conTrip : 0;

  const ordenar = (a: FilaAgencia, b: FilaAgencia) => ESTADO_INFO[a.estado].rank - ESTADO_INFO[b.estado].rank || a.ag.localeCompare(b.ag, 'es');
  const visibles = filas
    .filter((f) => (filtro === 'todas' ? true : filtro === 'completas' ? f.estado === 'completa' : f.estado !== 'completa'))
    .filter((f) => !buscar.trim() || f.ag.toLowerCase().includes(buscar.trim().toLowerCase()))
    .sort(ordenar);

  const fechaHora = (t: string) => (t ? `${diaDe(t) && diaDe(t) !== dia ? `${diaDe(t).slice(0, 5)} ` : ''}${hhmm(t)}` : '');

  // PDF con los mismos datos.
  useEffect(() => {
    registrarReporte?.(() => ({
      titulo: 'Status de Asignación',
      periodo: `${esHoy ? 'Hoy ' : ''}${dia}${esHoy ? ` · corte ${ahora}` : ''}`,
      agencia: `${N} agencias`,
      kpis: [
        { label: '1 · Excel cargado', valor: `${conCarga}/${N}`, sub: faltanCarga.length ? `Faltan: ${faltanCarga.map((f) => f.ag).join(', ')}` : 'Todas cargaron', tono: faltanCarga.length ? 'crit' : 'ok' },
        {
          label: '2 · Asignación con tripulación completa',
          valor: `${conAsig}/${N}`,
          sub: `${n0(rutasPend)} rutas por asignar · ${Math.round(pctTrip * 100)}% salieron con camión + piloto + APP`,
          tono: conAsig === N ? 'ok' : 'warn',
        },
        {
          label: '3 · Fin de asignación',
          valor: `${conFin}/${N}`,
          sub: motivosPend ? `Sin motivo: ${tot.cam} camiones · ${tot.pil} pilotos · ${tot.app} APP` : 'Sin pendientes',
          tono: faltanFin.length ? 'warn' : 'ok',
        },
        { label: 'Semáforo', valor: `${luces.verde} · ${luces.amarillo} · ${luces.rojo}`, sub: 'Verde · amarillo · rojo', tono: completas === N ? 'ok' : 'info' },
      ],
      tablas: [
        {
          titulo: 'Status por agencia',
          sub: `${dia} · ordenadas por lo que falta`,
          columnas: [
            { t: 'Agencia' },
            { t: 'Excel (hora)' },
            { t: 'Rutas', num: true },
            { t: 'Asignadas', num: true },
            { t: 'Por asignar', num: true },
            { t: 'Completas (cam+pil+APP)', num: true },
            { t: 'Sin APP', num: true },
            { t: 'Solo camión', num: true },
            { t: 'Sin motivo (cam/pil/APP)' },
            { t: 'Estado' },
          ],
          filas: [...filas].sort(ordenar).map((f) => [
            f.ag,
            f.p1 === 'ok' ? fechaHora(f.horaCarga) || 'Sí' : 'No',
            n0(f.rutasCargadas),
            `${n0(f.resueltas)}/${n0(f.totalAsig)}`,
            n0(f.pendientes),
            `${n0(f.tripCompleta)}/${n0(f.conTrip)}`,
            n0(f.tripSinApp),
            n0(f.tripSoloCamion + f.tripSinCamion),
            `${f.camSinMotivo}/${f.pilSinMotivo}/${f.appSinMotivo}`,
            ESTADO_INFO[f.estado].t,
          ]),
          vacio: 'Sin agencias.',
        },
      ],
      notas: [
        '1 · Excel cargado: la agencia tiene rutas con fecha del día. 2 · Asignación: todas sus rutas salieron (o quedaron a piso, en bolsón o son Self Service) y cada ruta que salió llevó camión + piloto + al menos 1 APP; "sin APP" = salió con camión y piloto pero sin auxiliar; "solo camión" = salió sin piloto. 3 · Fin de asignación: todos sus camiones, pilotos y APP que no salieron tienen motivo.',
        ...(esHoy ? [] : ['Para días anteriores, el fin de asignación usa el estado y los motivos actuales de camiones y personal.']),
      ],
    }));
  });

  const tarjeta = (titulo: string, icono: React.ReactNode, hechos: number, listo: boolean, sub: React.ReactNode, color: string) => {
    const p = N ? hechos / N : 0;
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm min-w-0 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1A`, color }}>
            {icono}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 leading-tight">{titulo}</span>
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
          {listo ? <span className="font-semibold" style={{ color: C.verdeTexto }}>Todas listas</span> : sub}
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

  // Línea del semáforo (un paso dentro de la tarjeta de una agencia).
  const lineaPaso = (n: number, titulo: string, p: Paso, texto: React.ReactNode) => (
    <div className="flex items-start gap-2">
      <span className="mt-0.5">
        <Foco luz={luzDePaso(p)} size={10} />
      </span>
      <div className="min-w-0 text-[11.5px] leading-snug">
        <span className="font-bold text-slate-700">
          {n} · {titulo}
        </span>
        <div className="text-slate-500">{texto}</div>
      </div>
    </div>
  );

  const vistaSemaforo = (
    <div className="space-y-4">
      {/* Resumen del semáforo */}
      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-5 items-center">
          <div className="flex items-center gap-3">
            {(['verde', 'amarillo', 'rojo'] as Luz[]).map((l) => (
              <div key={l} className="rounded-xl border border-slate-200 px-4 py-3 min-w-[104px] text-center">
                <div className="flex items-center justify-center gap-2">
                  <Foco luz={l} size={14} />
                  <span className="text-2xl font-black tabular-nums text-slate-900">{luces[l]}</span>
                </div>
                <div className="text-[10.5px] font-semibold text-slate-500 mt-1 leading-tight">
                  {l === 'verde' ? 'Completas' : l === 'amarillo' ? 'En proceso u observación' : 'Sin Excel o sin asignar'}
                </div>
              </div>
            ))}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1.5">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-slate-500" />
                Tripulación de las rutas que salieron
              </span>
              <span className="text-xs font-bold tabular-nums" style={{ color: pctTrip === 1 ? C.verdeTexto : C.oroTexto }}>
                {Math.round(pctTrip * 100)}% completas · {n0(tot.tripCompleta)}/{n0(tot.conTrip)}
              </span>
            </div>
            <BarraTrip f={tot} alto={10} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-600">
              {[
                [C.verde, 'Camión + piloto + APP', tot.tripCompleta],
                [C.oro, 'Camión + piloto, sin APP', tot.tripSinApp],
                [C.naranja, 'Solo camión (sin piloto)', tot.tripSoloCamion],
                ...(tot.tripSinCamion ? [[C.rojo, 'Sin camión', tot.tripSinCamion]] : []),
              ].map(([c, t, v]) => (
                <span key={String(t)} className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: String(c) }} />
                  {t}: <strong className="tabular-nums">{n0(Number(v))}</strong>
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Tarjetas por agencia */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {[...filas]
          .sort((a, b) => LUZ[a.luz].rank - LUZ[b.luz].rank || ordenar(a, b))
          .map((f) => {
            const info = ESTADO_INFO[f.estado];
            return (
              <article key={f.ag} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 flex flex-col gap-3 min-w-0" style={{ borderTop: `4px solid ${LUZ[f.luz].c}` }}>
                <header className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Foco luz={f.luz} size={16} />
                    <h4 className="font-black text-slate-900 truncate">{f.ag}</h4>
                  </div>
                  <span className="whitespace-nowrap text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: info.bg, color: info.fg }}>
                    {info.t}
                  </span>
                </header>
                {lineaPaso(
                  1,
                  'Excel',
                  f.p1,
                  f.p1 === 'ok' ? `${n0(f.rutasCargadas)} rutas · ${n0(f.cjCargadas)} CJ${f.horaCarga ? ` · ${fechaHora(f.horaCarga)}` : ''}` : <span style={{ color: C.rojoTexto }}>No ha cargado rutas</span>
                )}
                {lineaPaso(
                  2,
                  'Asignación',
                  f.p2,
                  f.p2 === 'espera' ? (
                    'Espera la carga'
                  ) : (
                    <>
                      <span className={f.pendientes ? 'font-semibold' : ''} style={f.pendientes ? { color: C.oroTexto } : undefined}>
                        {n0(f.resueltas)}/{n0(f.totalAsig)} rutas{f.pendientes ? ` · faltan ${n0(f.pendientes)}` : ''}
                      </span>
                      {f.conTrip > 0 && (
                        <>
                          <div className="my-1">
                            <BarraTrip f={f} />
                          </div>
                          <span>
                            Tripulación: {textoTrip(f)}
                          </span>
                        </>
                      )}
                    </>
                  )
                )}
                {lineaPaso(
                  3,
                  'Fin de asignación',
                  f.p3,
                  f.p3 === 'espera' ? (
                    'Espera que terminen de asignar'
                  ) : f.p3 === 'ok' ? (
                    f.camParados + f.pilParados + f.appParados ? 'Todos los que no salieron tienen motivo' : 'Sin recursos parados'
                  ) : (
                    <span style={{ color: C.rojoTexto }}>Sin motivo: {textoFin(f)}</span>
                  )
                )}
              </article>
            );
          })}
        {N === 0 && <p className="text-sm text-slate-400 py-6">Sin agencias para mostrar.</p>}
      </div>
      <p className="text-[11px] text-slate-500 leading-relaxed flex flex-wrap gap-x-4 gap-y-1">
        <span className="inline-flex items-center gap-1.5">
          <Foco luz="verde" size={9} /> Los 3 pasos completos y todo salió con camión + piloto + APP
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Foco luz="amarillo" size={9} /> Asignando, falta fin de asignación o hay rutas sin APP / sin piloto
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Foco luz="rojo" size={9} /> No ha cargado Excel o no ha asignado ninguna ruta
        </span>
      </p>
    </div>
  );

  const vistaDetalle = (
    <div className="space-y-4">
      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tarjeta(`1 · ${PASO1}`, <FileSpreadsheet className="w-4 h-4" />, conCarga, faltanCarga.length === 0, `Faltan ${faltanCarga.length} agencia(s) por cargar`, C.azul)}
        {tarjeta(
          `2 · ${PASO2}`,
          <TruckIcon className="w-4 h-4" />,
          conAsig,
          conAsig === N,
          <>
            {rutasPend ? `${n0(rutasPend)} ruta(s) por asignar · ` : ''}
            {Math.round(pctTrip * 100)}% salió con tripulación completa
          </>,
          C.oro
        )}
        {tarjeta(`3 · ${PASO3}`, <ClipboardCheck className="w-4 h-4" />, conFin, faltanFin.length === 0, `Sin motivo: ${tot.cam} camiones · ${tot.pil} pilotos · ${tot.app} APP`, C.marino)}
        {tarjeta('Agencias completas', <CheckCircle2 className="w-4 h-4" />, completas, completas === N, `${N - completas} agencia(s) con pasos pendientes u observación`, C.verde)}
      </div>

      {/* Qué falta */}
      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-slate-500" />
          Qué falta por agencia
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6">
          {listaFaltan('1 · Falta cargar Excel', C.rojo, faltanCarga.map((f) => ({ ag: f.ag, det: '' })), 'Todas cargaron su Excel.')}
          {listaFaltan(
            '2 · Rutas sin asignar',
            C.oroTexto,
            faltanAsig.map((f) => ({ ag: f.ag, det: pl(f.pendientes, 'ruta', 'rutas') })),
            'Sin rutas pendientes de asignar.'
          )}
          {listaFaltan(
            '2 · Salieron sin tripulación completa',
            '#a4521f',
            conTripInc.map((f) => ({ ag: f.ag, det: [f.tripSinApp ? `${f.tripSinApp} sin APP` : '', f.tripSoloCamion + f.tripSinCamion ? `${f.tripSoloCamion + f.tripSinCamion} sin piloto` : ''].filter(Boolean).join(' · ') })),
            'Todo salió con camión + piloto + APP.'
          )}
          {listaFaltan(
            '3 · Falta fin de asignación',
            C.marino,
            faltanFin.map((f) => ({ ag: f.ag, det: textoFin(f) })),
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
            <p className="text-[11px] text-slate-500 mt-0.5">Ordenadas por lo que falta: sin Excel, por asignar, sin fin de asignación y con tripulación incompleta.</p>
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
          <table className="w-full text-xs min-w-[960px]">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="text-left py-2 px-2">Agencia</th>
                <th className="text-left py-2 px-2">1 · {PASO1}</th>
                <th className="text-left py-2 px-2">2 · {PASO2}</th>
                <th className="text-left py-2 px-2">3 · {PASO3}</th>
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
                    <td className="py-3 px-2 font-bold text-slate-800 whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <Foco luz={f.luz} size={10} />
                        {f.ag}
                      </span>
                    </td>
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
                    <td className="py-3 px-2 min-w-[260px]">
                      <div className="flex items-start gap-2">
                        <PasoIcono p={f.p2} n={2} />
                        {f.p2 === 'espera' ? (
                          <span className="text-slate-400">Espera la carga</span>
                        ) : (
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between gap-2">
                              <span className="font-semibold text-slate-800 tabular-nums">
                                {n0(f.resueltas)}/{n0(f.totalAsig)} rutas resueltas
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
                            {f.conTrip > 0 && (
                              <div className="mt-2 pt-2 border-t border-slate-100">
                                <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400 mb-1">Tripulación de {pl(f.conTrip, 'ruta que salió', 'rutas que salieron')}</div>
                                <BarraTrip f={f} />
                                <div className="grid grid-cols-3 gap-1 mt-1.5 text-[11px]">
                                  <span>
                                    <strong className="tabular-nums" style={{ color: C.verdeTexto }}>{n0(f.tripCompleta)}</strong> completas
                                  </span>
                                  <span>
                                    <strong className="tabular-nums" style={{ color: f.tripSinApp ? C.oroTexto : '#94a3b8' }}>{n0(f.tripSinApp)}</strong> sin APP
                                  </span>
                                  <span>
                                    <strong className="tabular-nums" style={{ color: f.tripSoloCamion + f.tripSinCamion ? '#a4521f' : '#94a3b8' }}>{n0(f.tripSoloCamion + f.tripSinCamion)}</strong> solo camión
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-2 min-w-[200px]">
                      <div className="flex items-start gap-2">
                        <PasoIcono p={f.p3} n={3} />
                        {f.p3 === 'espera' ? (
                          <div>
                            <span className="text-slate-400">Espera que terminen de asignar</span>
                            {f.camSinMotivo + f.pilSinMotivo + f.appSinMotivo > 0 && f.p1 === 'ok' && <div className="text-[11px] text-slate-400">Sin motivo hoy: {textoFin(f)}</div>}
                          </div>
                        ) : f.p3 === 'ok' ? (
                          <div>
                            <div className="font-semibold text-slate-800">
                              {f.camParados + f.pilParados + f.appParados
                                ? `Con motivo: ${f.camParados} cam. · ${f.pilParados} pil. · ${f.appParados} APP`
                                : 'Sin recursos parados'}
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
                              Faltan {f.camSinMotivo + f.pilSinMotivo + f.appSinMotivo} motivo(s)
                            </div>
                            <div className="text-[11px] text-slate-500 leading-snug">
                              Camiones {f.camSinMotivo}/{f.camParados} · Pilotos {f.pilSinMotivo}/{f.pilParados} · APP {f.appSinMotivo}/{f.appParados}
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
      </section>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <section className="rounded-2xl shadow-sm text-white overflow-hidden" style={{ background: 'linear-gradient(135deg, #2C3790 0%, #1E2768 100%)' }}>
        <div className="p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-200">Status de asignación por agencia · solo administradores</div>
              <h2 className="text-xl sm:text-2xl font-black leading-tight">
                {esHoy ? 'Hoy ' : ''}
                {dia}
              </h2>
              <p className="text-xs text-sky-100/80 mt-0.5 max-w-2xl">
                {esHoy ? `Datos en vivo · corte ${ahora}` : 'Día anterior'} · {N} agencias · ¿Cargó su Excel, asignó cada ruta con camión, piloto y APP, y registró el motivo de lo
                que no salió?
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
              ['1', PASO1, conCarga],
              ['2', `${PASO2} completos`, conAsig],
              ['3', PASO3, conFin],
            ].map(([n, t, v], i) => (
              <React.Fragment key={String(n)}>
                {i > 0 && <span className="hidden sm:block text-sky-200/60 text-xl">›</span>}
                <div className="rounded-xl bg-white/10 px-3 py-2.5 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center text-sm font-black shrink-0">{n}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-sky-100/90 font-semibold leading-tight">{t}</div>
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

      {/* Vista: semáforo o detalle */}
      <div role="tablist" aria-label="Vista" className="inline-flex rounded-xl bg-slate-100 p-1">
        {(
          [
            ['semaforo', 'Semáforo por agencia'],
            ['detalle', 'Detalle por agencia'],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={vista === k}
            onClick={() => setVista(k)}
            className={`min-h-[38px] px-4 rounded-lg text-sm font-bold cursor-pointer ${vista === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {l}
          </button>
        ))}
      </div>

      {vista === 'semaforo' ? vistaSemaforo : vistaDetalle}

      <p className="text-[11px] text-slate-500 leading-relaxed">
        <strong>1 · Carga de rutas:</strong> la agencia tiene rutas con fecha del día. <strong>2 · Asignación:</strong> todas sus rutas salieron (o quedaron a piso, en
        bolsón o son Self Service) y cada ruta que salió llevó <strong>camión + piloto + al menos 1 APP</strong>; se marca aparte lo que salió con camión y piloto sin
        APP, y lo que salió solo con camión (sin piloto). <strong>3 · Fin de asignación:</strong> todos los camiones, pilotos (VPP/VPPB) y auxiliares (APP) de la agencia
        que no salieron ese día tienen motivo (la misma regla del botón "Fin de Asignación"). Se siguen las agencias con camiones o personal activos, o con rutas en los
        últimos 14 días (no se incluyen CMI, Lif Brands, Mercadeo Operativo, Monte María, Otros Proyectos, Proyecto Huracán, SSO ni Zona Pradera).
      </p>
    </div>
  );
};
