import type * as XLSXTypes from 'xlsx';
import {
  Route,
  Truck,
  Staff,
  AssignmentType,
  MotivoDevolucionReason,
  CajaAbiertaReason,
  RouteDispatchRecord,
  ContingenciaLogEntry,
} from '../types';
import { formatDateTimeToGuatemala, formatDateToGuatemala } from './date';
import { getRouteKey } from './routeKey';
import { jornadaDeRuta } from './jornada';
import { AGENCIA_LOCATION_OPTIONS } from '../data/agencies';
import { ALL_MOTIVO_DEVOLUCION_REASONS, MOTIVO_REVISITA } from '../data/motivosDevolucion';
import { CAJA_ABIERTA_OPTIONS } from '../data/motivosCajaAbierta';

// --- Plan de contingencia: carga de los formatos de Excel ---
// Cuando la app no estuvo disponible, la operación registra en papel/Excel
// las ASIGNACIONES y LIQUIDACIONES con los formatos de contingencia
// (public/plantillas/Contingencia_*.xlsx). Al regresar, un ADMINISTRADOR
// carga esos archivos y este módulo:
//   1) lee y valida cada fila (sin tocar nada),
//   2) arma un "plan" aplicando, ruta por ruta y en orden, las salidas y los
//      regresos con las MISMAS reglas que usan Asignar y Liquidar en la app,
//   3) revisa que ningún camión/persona quede en dos rutas en tránsito
//      (misma regla que la base de datos) y
//   4) devuelve solo las rutas, camiones y personas que cambian.
// Nunca borra nada. Las filas con error no se aplican y se reportan.

export const MOTIVO_BOLSON_LIQ = 'Ruta Bolsón (Rechazo)';
const TIPOS_VIAJE: AssignmentType[] = ['Primer Viaje', 'Recarga', 'Revisita'];

export type ContHoja = 'Asignación' | 'Liquidación';

export interface ContAsigRow {
  archivo: string;
  fila: number;
  fecha: string;
  ruta: string;
  agencia: string;
  segmento: string;
  cajas: number | null;
  paradas: number | null;
  tipo: string;
  camion: string;
  piloto: string;
  auxiliares: string[];
  hora: string;
  nota: string;
  responsable: string;
}

export interface ContLiqRow {
  archivo: string;
  fila: number;
  fecha: string;
  ruta: string;
  agencia: string;
  modalidad: string;
  entregadas: number | null;
  devueltas: number | null;
  paradasEntregadas: number | null;
  paradasNoEntregadas: number | null;
  motivos: string[];
  motivoCaja: string;
  monto: number | null;
  auditor: string;
  fechaLiq: string;
  horaLiq: string;
  comentario: string;
}

export interface ContResultado {
  hoja: ContHoja | 'Archivo';
  archivo: string;
  fila: number;
  ruta: string;
  agencia: string;
  fecha: string;
  estado: 'ok' | 'aviso' | 'error';
  mensaje: string;
}

export interface ContParsed {
  asignaciones: ContAsigRow[];
  liquidaciones: ContLiqRow[];
  resultados: ContResultado[]; // errores de lectura (archivo/fila)
}

export interface ContPlan {
  // Rutas nuevas o modificadas (versión final). beforeKey = clave que tenía la
  // fila antes de la carga (null si la ruta se creó en esta carga).
  routeUpdates: { beforeKey: string | null; route: Route }[];
  changedRoutes: Route[]; // rutas nuevas o modificadas (versión final)
  changedHistorical: Route[]; // rutas que se agregan/actualizan en el historial
  changedTrucks: Truck[];
  changedStaff: Staff[];
  resultados: ContResultado[];
  resumen: { creadas: number; asignaciones: number; liquidaciones: number; errores: number; avisos: number };
}

// ---------------------------------------------------------------- lectura

export const normTxt = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
const normHeader = (s: unknown) => normTxt(s).replace(/[^a-z0-9]/g, '');

const ASIG_COLS: Record<string, string[]> = {
  fecha: ['fecharuta', 'fecha'],
  ruta: ['noruta', 'ruta', 'numeroruta'],
  agencia: ['agencia'],
  segmento: ['segmento'],
  cajas: ['cajasfisicas', 'cajas'],
  paradas: ['paradas'],
  tipo: ['tipoasignacion', 'tipo'],
  camion: ['idcamionoplaca', 'idcamion', 'placa', 'camion'],
  piloto: ['piloto', 'pilototitular', 'conductor'],
  aux1: ['auxiliar1'],
  aux2: ['auxiliar2'],
  aux3: ['auxiliar3'],
  aux4: ['auxiliar4'],
  hora: ['horasalida', 'hora'],
  nota: ['nota', 'comentario'],
  responsable: ['responsable'],
};
const LIQ_COLS: Record<string, string[]> = {
  fecha: ['fecharuta', 'fecha'],
  ruta: ['noruta', 'ruta', 'numeroruta'],
  agencia: ['agencia'],
  modalidad: ['modalidad'],
  entregadas: ['cajasentregadas'],
  devueltas: ['cajasdevueltas'],
  pEnt: ['paradasentregadas', 'guiasexitosas'],
  pNo: ['paradasnoentregadas', 'guiasrechazadas'],
  motivo: ['motivodevolucion'],
  motivoCaja: ['motivocajaabierta'],
  monto: ['montodiferenciacajaq', 'montodiferenciacaja', 'monto'],
  auditor: ['auditor'],
  fechaLiq: ['fechaliquidacion'],
  horaLiq: ['horaliquidacion'],
  comentario: ['comentario'],
};

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Fecha de Excel (número de serie, Date o texto) → DD/MM/AAAA, o '' si no es válida. */
export function cellToFecha(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) return `${pad2(v.getDate())}/${pad2(v.getMonth() + 1)}/${v.getFullYear()}`;
  if (typeof v === 'number' && isFinite(v) && v > 20000 && v < 80000) {
    const d = new Date(Math.round((Math.floor(v) - 25569) * 86400000));
    return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  }
  const s = String(v).trim();
  let m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/.exec(s);
  if (m) {
    const d = +m[1], mo = +m[2];
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return `${pad2(d)}/${pad2(mo)}/${m[3]}`;
    return '';
  }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${pad2(+m[3])}/${pad2(+m[2])}/${m[1]}`;
  return '';
}

/** Hora de Excel (fracción de día, Date o texto H:MM) → HH:MM, o '' si no es válida. */
export function cellToHora(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date && !isNaN(v.getTime())) return `${pad2(v.getHours())}:${pad2(v.getMinutes())}`;
  if (typeof v === 'number' && isFinite(v)) {
    const frac = v - Math.floor(v);
    const mins = Math.round(frac * 1440) % 1440;
    return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
  }
  const s = String(v).trim().toLowerCase();
  const m = /^(\d{1,2})[:.](\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/.exec(s);
  if (!m) return '';
  let h = +m[1];
  const mi = +m[2];
  if (m[3]?.startsWith('p') && h < 12) h += 12;
  if (m[3]?.startsWith('a') && h === 12) h = 0;
  if (h > 23 || mi > 59) return '';
  return `${pad2(h)}:${pad2(mi)}`;
}

const cellToNum = (v: unknown): number | null => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  const n = Number(String(v).replace(/[Qq\s,]/g, (c) => (c === ',' ? '.' : '')).trim());
  return isFinite(n) ? n : NaN;
};
const cellToTxt = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const cellToId = (v: unknown): string => {
  if (typeof v === 'number' && Number.isInteger(v)) return String(v);
  return cellToTxt(v);
};

function findHeader(rows: unknown[][], required: string[]): { idx: number; map: Map<string, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const map = new Map<string, number>();
    (rows[i] || []).forEach((c, j) => {
      const h = normHeader(c);
      if (h && !map.has(h)) map.set(h, j);
    });
    if (required.every((k) => map.has(k))) return { idx: i, map };
  }
  return null;
}

function colIndex(map: Map<string, number>, aliases: string[]): number {
  for (const a of aliases) if (map.has(a)) return map.get(a)!;
  return -1;
}

/**
 * Lee un libro de Excel de contingencia (Asignación y/o Liquidación). Detecta
 * las hojas por sus encabezados (ignora "Instrucciones" y "Catalogos").
 */
export function parseContingenciaWorkbook(XLSX: typeof XLSXTypes, wb: XLSXTypes.WorkBook, archivo: string): ContParsed {
  const out: ContParsed = { asignaciones: [], liquidaciones: [], resultados: [] };
  let found = false;
  for (const name of wb.SheetNames) {
    const n = normHeader(name);
    if (n.startsWith('instruc') || n.startsWith('catalog')) continue;
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' });
    const hA = findHeader(rows, ['noruta', 'tipoasignacion']);
    const hL = !hA ? findHeader(rows, ['noruta', 'modalidad']) : null;
    if (!hA && !hL) continue;
    found = true;
    const h = (hA || hL)!;
    const cols = hA ? ASIG_COLS : LIQ_COLS;
    const idx: Record<string, number> = {};
    Object.entries(cols).forEach(([k, al]) => (idx[k] = colIndex(h.map, al)));
    const get = (row: unknown[], k: string) => (idx[k] >= 0 ? row[idx[k]] : '');
    for (let i = h.idx + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      if (!row.some((c) => String(c ?? '').trim() !== '')) continue;
      const fila = i + 1;
      if (hA) {
        out.asignaciones.push({
          archivo,
          fila,
          fecha: cellToFecha(get(row, 'fecha')),
          ruta: cellToId(get(row, 'ruta')),
          agencia: cellToTxt(get(row, 'agencia')),
          segmento: cellToTxt(get(row, 'segmento')).toUpperCase(),
          cajas: cellToNum(get(row, 'cajas')),
          paradas: cellToNum(get(row, 'paradas')),
          tipo: cellToTxt(get(row, 'tipo')),
          camion: cellToId(get(row, 'camion')),
          piloto: cellToId(get(row, 'piloto')),
          auxiliares: ['aux1', 'aux2', 'aux3', 'aux4'].map((k) => cellToId(get(row, k))).filter(Boolean),
          hora: cellToHora(get(row, 'hora')),
          nota: cellToTxt(get(row, 'nota')),
          responsable: cellToTxt(get(row, 'responsable')),
        });
      } else {
        out.liquidaciones.push({
          archivo,
          fila,
          fecha: cellToFecha(get(row, 'fecha')),
          ruta: cellToId(get(row, 'ruta')),
          agencia: cellToTxt(get(row, 'agencia')),
          modalidad: cellToTxt(get(row, 'modalidad')),
          entregadas: cellToNum(get(row, 'entregadas')),
          devueltas: cellToNum(get(row, 'devueltas')),
          paradasEntregadas: cellToNum(get(row, 'pEnt')),
          paradasNoEntregadas: cellToNum(get(row, 'pNo')),
          motivos: cellToTxt(get(row, 'motivo'))
            .split(/[;|]/)
            .map((s) => s.trim())
            .filter(Boolean),
          motivoCaja: cellToTxt(get(row, 'motivoCaja')),
          monto: cellToNum(get(row, 'monto')),
          auditor: cellToTxt(get(row, 'auditor')),
          fechaLiq: cellToFecha(get(row, 'fechaLiq')),
          horaLiq: cellToHora(get(row, 'horaLiq')),
          comentario: cellToTxt(get(row, 'comentario')),
        });
      }
    }
  }
  if (!found) {
    out.resultados.push({
      hoja: 'Archivo',
      archivo,
      fila: 0,
      ruta: '',
      agencia: '',
      fecha: '',
      estado: 'error',
      mensaje:
        'No se encontró una hoja de Asignación ni de Liquidación de contingencia. Usa los formatos descargados desde esta pantalla sin cambiar los encabezados.',
    });
  }
  return out;
}

// ---------------------------------------------------------------- plan

const matchCatalog = (val: string, catalog: readonly string[]): string | null => {
  const v = normTxt(val);
  return catalog.find((c) => normTxt(c) === v) || null;
};
const agenciaOficial = (raw: string): string | null => matchCatalog(raw, AGENCIA_LOCATION_OPTIONS);
const tipoOficial = (raw: string): AssignmentType | null => {
  const v = normTxt(raw);
  if (v === 'bolson' || v === 'ruta bolson') return 'Ruta Bolsón';
  if (v === 'selfservice' || v === 'self service') return 'Self Service';
  return (matchCatalog(raw, ['Primer Viaje', 'Recarga', 'Revisita', 'Self Service', 'Ruta Bolsón']) as AssignmentType) || null;
};
const modalidadOficial = (raw: string): 'Liquidada' | 'Ruta Abierta' | 'Caja Abierta' | null =>
  (matchCatalog(raw, ['Liquidada', 'Ruta Abierta', 'Caja Abierta']) as 'Liquidada' | 'Ruta Abierta' | 'Caja Abierta') || null;
const MOTIVOS_LIQ = [...ALL_MOTIVO_DEVOLUCION_REASONS, MOTIVO_BOLSON_LIQ];
const MOTIVOS_CAJA = CAJA_ABIERTA_OPTIONS.map((o) => o.reason);

const baseFecha = (r: Route) => formatDateToGuatemala(r.fechaOriginalRuta || r.fecha);
const nowHM = (now: Date) => formatDateTimeToGuatemala(now).slice(11, 16) || '00:00';
const isPilot = (s: Staff) => s.puesto === 'VPP' || s.puesto === 'VPPB' || s.rol === 'Conductor';
const crewOf = (a: Route['asignacion']) =>
  a ? ([a.conductor, a.auxiliar1, a.auxiliar2, a.auxiliar3, a.auxiliar4].filter(Boolean) as string[]) : [];

interface PlanInput {
  routes: Route[];
  historicalRoutes: Route[];
  trucks: Truck[];
  staff: Staff[];
  parsed: ContParsed;
  usuario: string;
  now?: Date;
}

type Evento = { tipo: 'A'; row: ContAsigRow } | { tipo: 'L'; row: ContLiqRow };

export function buildContingenciaPlan(input: PlanInput): ContPlan {
  const { routes, historicalRoutes, trucks, staff, parsed, usuario } = input;
  const now = input.now || new Date();
  const cargadoEl = formatDateTimeToGuatemala(now);
  const resultados: ContResultado[] = [...parsed.resultados];
  const res = (hoja: ContHoja, row: { archivo: string; fila: number; ruta: string; agencia: string; fecha: string }, estado: ContResultado['estado'], mensaje: string) => {
    resultados.push({ hoja, archivo: row.archivo, fila: row.fila, ruta: row.ruta, agencia: row.agencia, fecha: row.fecha, estado, mensaje });
  };

  // 1) Validación de campos fila por fila ---------------------------------
  type GrupoKey = string;
  const grupos = new Map<GrupoKey, { fecha: string; ruta: string; agencia: string; A: ContAsigRow[]; L: ContLiqRow[] }>();
  const grupoDe = (fecha: string, ruta: string, agencia: string) => {
    const k = `${fecha}|${ruta}|${agencia}`;
    if (!grupos.has(k)) grupos.set(k, { fecha, ruta, agencia, A: [], L: [] });
    return grupos.get(k)!;
  };
  const comunes = (hoja: ContHoja, r: { archivo: string; fila: number; fecha: string; ruta: string; agencia: string }): string | null => {
    const errs: string[] = [];
    if (!r.fecha) errs.push('Fecha Ruta vacía o no válida (usa DD/MM/AAAA)');
    if (!r.ruta) errs.push('falta el No. Ruta');
    if (!r.agencia) errs.push('falta la Agencia');
    else if (!agenciaOficial(r.agencia)) errs.push(`la agencia "${r.agencia}" no está en la lista`);
    if (errs.length) {
      res(hoja, r, 'error', errs.join('; ') + '.');
      return null;
    }
    return agenciaOficial(r.agencia);
  };

  for (const a of parsed.asignaciones) {
    const ag = comunes('Asignación', a);
    if (!ag) continue;
    const tipo = tipoOficial(a.tipo);
    const errs: string[] = [];
    if (!a.tipo) errs.push('falta el Tipo Asignación');
    else if (!tipo)
      errs.push(
        normTxt(a.tipo).includes('piso')
          ? '"Ruta a Piso" no se carga por contingencia: envíala a piso desde el tablero'
          : `Tipo Asignación "${a.tipo}" no válido`
      );
    if (tipo && TIPOS_VIAJE.includes(tipo) && !a.camion) errs.push('falta el ID Camión o Placa');
    if (a.cajas !== null && (isNaN(a.cajas) || a.cajas < 0)) errs.push('Cajas Físicas no es un número válido');
    if (a.paradas !== null && (isNaN(a.paradas) || a.paradas < 0)) errs.push('Paradas no es un número válido');
    const personas = [a.piloto, ...a.auxiliares].filter(Boolean).map(normTxt);
    if (new Set(personas).size !== personas.length) errs.push('la misma persona aparece dos veces en la tripulación');
    if (errs.length) {
      res('Asignación', { ...a, agencia: ag }, 'error', errs.join('; ') + '.');
      continue;
    }
    grupoDe(a.fecha, a.ruta, ag).A.push({ ...a, agencia: ag, tipo: tipo! });
  }
  for (const l of parsed.liquidaciones) {
    const ag = comunes('Liquidación', l);
    if (!ag) continue;
    const mod = modalidadOficial(l.modalidad);
    const errs: string[] = [];
    if (!l.modalidad) errs.push('falta la Modalidad');
    else if (!mod) errs.push(`Modalidad "${l.modalidad}" no válida`);
    if (l.entregadas === null) errs.push('faltan las Cajas Entregadas');
    const nums: [string, number | null][] = [
      ['Cajas Entregadas', l.entregadas],
      ['Cajas Devueltas', l.devueltas],
      ['Paradas Entregadas', l.paradasEntregadas],
      ['Paradas No Entregadas', l.paradasNoEntregadas],
      ['Monto Diferencia Caja', l.monto],
    ];
    nums.forEach(([n, v]) => {
      if (v !== null && (isNaN(v) || v < 0)) errs.push(`${n} no es un número válido`);
    });
    const motivos: string[] = [];
    l.motivos.forEach((m) => {
      const ok = matchCatalog(m, MOTIVOS_LIQ);
      if (ok) motivos.push(ok);
      else errs.push(`Motivo Devolución "${m}" no está en la lista`);
    });
    let motivoCaja = '';
    if (mod === 'Caja Abierta') {
      if (!l.motivoCaja) errs.push('falta el Motivo Caja Abierta');
      else {
        motivoCaja = matchCatalog(l.motivoCaja, MOTIVOS_CAJA) || '';
        if (!motivoCaja) errs.push(`Motivo Caja Abierta "${l.motivoCaja}" no está en la lista`);
      }
    }
    if (!l.auditor) errs.push('falta el Auditor');
    if (errs.length) {
      res('Liquidación', { ...l, agencia: ag }, 'error', errs.join('; ') + '.');
      continue;
    }
    grupoDe(l.fecha, l.ruta, ag).L.push({ ...l, agencia: ag, modalidad: mod!, motivos, motivoCaja });
  }

  // 2) Aplicación ruta por ruta ----------------------------------------------
  const work: Route[] = routes.map((r) => r); // referencias; se reemplazan al cambiar
  const originalByKey = new Map<string, Route>(routes.map((r) => [getRouteKey(r), r]));
  const changedKeys = new Set<string>();
  const beforeKeyOf = new Map<string, string | null>(); // clave final → clave original
  const createdKeys = new Set<string>();
  const histChanges = new Map<string, Route>();
  const touchedTrucks = new Set<string>();
  const touchedPeople = new Set<string>(); // nombres normalizados
  const grupoFilas = new Map<string, { hoja: ContHoja; row: ContAsigRow | ContLiqRow }[]>(); // por clave de ruta final
  let creadas = 0;

  const truckByRef = (ref: string, agencia: string): Truck | undefined => {
    const v = normTxt(ref).replace(/\s|-/g, '');
    const hits = trucks.filter(
      (t) =>
        normTxt(t.idCamion).replace(/\s|-/g, '') === v ||
        normTxt(t.placa).replace(/\s|-/g, '') === v ||
        normTxt(t.id).replace(/\s|-/g, '') === v
    );
    return hits.find((t) => t.agencia === agencia && t.estado !== 'Baja') || hits.find((t) => t.estado !== 'Baja') || hits[0];
  };
  const staffByRef = (ref: string, agencia: string): Staff | undefined => {
    const v = normTxt(ref);
    if (!v) return undefined;
    const hits = staff.filter(
      (s) =>
        normTxt(s.nombre) === v ||
        (!!s.codigo && normTxt(s.codigo) === v) ||
        (!!s.codigoCorto && normTxt(s.codigoCorto) === v) ||
        (!!s.dpi && normTxt(s.dpi).replace(/\s/g, '') === v.replace(/\s/g, ''))
    );
    const vivos = hits.filter((s) => s.estado !== 'Baja' && s.estatus !== 'BAJA');
    return vivos.find((s) => s.agencia === agencia) || vivos[0] || hits[0];
  };
  const findIdx = (g: { fecha: string; ruta: string; agencia: string }) => {
    const cands = work
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => String(r.id) === g.ruta && normTxt(r.agencia) === normTxt(g.agencia) && baseFecha(r) === g.fecha);
    const activa = cands.find(({ r }) => r.estado !== 'Liquidada');
    return (activa || cands[0])?.i ?? -1;
  };
  const log = (r: Route, tipo: ContingenciaLogEntry['tipo'], row: { archivo: string; fila: number }): Route => ({
    ...r,
    registroContingencia: [
      ...(r.registroContingencia || []),
      { tipo, archivo: row.archivo, fila: row.fila, cargadoPor: usuario, cargadoEl },
    ],
  });

  for (const g of grupos.values()) {
    // Orden dentro de cada hoja: por hora si viene, si no por fila.
    const byHora = <T extends { hora?: string; horaLiq?: string; fila: number }>(arr: T[]) =>
      [...arr].sort((x, y) => {
        const hx = x.hora || x.horaLiq || '';
        const hy = y.hora || y.horaLiq || '';
        if (hx && hy && hx !== hy) return hx < hy ? -1 : 1;
        return x.fila - y.fila;
      });
    const colaA = byHora(g.A);
    const colaL = byHora(g.L);
    const filasGrupo: { hoja: ContHoja; row: ContAsigRow | ContLiqRow }[] = [];

    let idx = findIdx(g);
    let createdHere = false;
    if (idx < 0) {
      // ¿Ya está archivada como liquidada?
      const enHist = historicalRoutes.some(
        (r) => String(r.id) === g.ruta && normTxt(r.agencia) === normTxt(g.agencia) && baseFecha(r) === g.fecha
      );
      const primeraA = colaA[0];
      if (enHist) {
        colaA.forEach((a) => res('Asignación', a, 'error', 'La ruta ya está liquidada en el historial de la app; no se modificó.'));
        colaL.forEach((l) => res('Liquidación', l, 'error', 'La ruta ya está liquidada en el historial de la app; no se modificó.'));
        continue;
      }
      if (!primeraA || primeraA.cajas === null || primeraA.paradas === null) {
        const msg =
          'La ruta no existe en la app para esa fecha y agencia. Para crearla, llena Segmento, Cajas Físicas y Paradas en su primera fila de la hoja Asignación.';
        colaA.forEach((a) => res('Asignación', a, 'error', msg));
        colaL.forEach((l) => res('Liquidación', l, 'error', msg));
        continue;
      }
      const nueva: Route = log(
        {
          id: g.ruta,
          agencia: g.agencia,
          mercado: '',
          segmento: primeraA.segmento || undefined,
          fecha: g.fecha,
          fechaOriginalRuta: g.fecha,
          paradas: primeraA.paradas,
          cajasFisicas: primeraA.cajas,
          estado: 'Pendiente',
          asignacion: null,
          liquidacion: null,
          fechaCarga: cargadoEl,
          fechaCreacion: cargadoEl,
          tipoRuta: 'Entrega',
        },
        'Creación',
        primeraA
      );
      work.unshift(nueva);
      idx = 0;
      createdHere = true;
      createdKeys.add(getRouteKey(nueva));
      creadas++;
    }

    const beforeKey = createdHere ? null : getRouteKey(work[idx]);
    let lastKey: string | null = createdHere ? getRouteKey(work[idx]) : null;
    if (createdHere) beforeKeyOf.set(lastKey!, null);
    // Procesa según el estado de la ruta: si está en ruta (o es Self Service /
    // Bolsón pendiente) toca un regreso; si no, toca una salida.
    while (colaA.length || colaL.length) {
      const r = work[idx];
      const esperaLiq =
        r.estado === 'En Tránsito' || (r.estado === 'Pendiente' && (r.esSelfService || r.esBolson));
      let ev: Evento;
      if (colaL.length && (esperaLiq || !colaA.length)) ev = { tipo: 'L', row: colaL.shift()! };
      else ev = { tipo: 'A', row: colaA.shift()! };

      if (ev.tipo === 'A') {
        const a = ev.row;
        const out = aplicarAsignacion(r, a);
        if (typeof out === 'string') {
          res('Asignación', a, 'error', out);
          continue;
        }
        work[idx] = log(out.route, 'Asignación', a);
        filasGrupo.push({ hoja: 'Asignación', row: a });
        out.avisos.forEach((m) => res('Asignación', a, 'aviso', m));
        res('Asignación', a, 'ok', out.mensaje);
      } else {
        const l = ev.row;
        const out = aplicarLiquidacion(r, l);
        if (typeof out === 'string') {
          res('Liquidación', l, 'error', out);
          continue;
        }
        work[idx] = log(out.route, 'Liquidación', l);
        if (work[idx].estado === 'Liquidada') histChanges.set(getRouteKey(work[idx]), work[idx]);
        filasGrupo.push({ hoja: 'Liquidación', row: l });
        res('Liquidación', l, 'ok', out.mensaje);
      }
      const k = getRouteKey(work[idx]);
      if (lastKey && lastKey !== k) {
        changedKeys.delete(lastKey);
        beforeKeyOf.delete(lastKey);
        if (createdKeys.delete(lastKey)) createdKeys.add(k);
        if (histChanges.has(lastKey)) {
          histChanges.set(k, histChanges.get(lastKey)!);
          histChanges.delete(lastKey);
        }
      }
      lastKey = k;
      changedKeys.add(k);
      beforeKeyOf.set(k, beforeKey);
    }
    if (filasGrupo.length) grupoFilas.set(getRouteKey(work[idx]), filasGrupo);
  }

  function aplicarAsignacion(r: Route, a: ContAsigRow): { route: Route; mensaje: string; avisos: string[] } | string {
    if (r.estado === 'Liquidada') return 'La ruta ya está liquidada; no se puede asignar de nuevo.';
    if (r.estado === 'En Tránsito')
      return `La ruta ya está en tránsito con el camión ${r.asignacion?.camionPlaca || ''}. Si cambió, corrígelo con Modificar en el tablero.`;
    const tipo = a.tipo as AssignmentType;
    const fechaHora = `${a.fecha} ${a.hora || nowHM(now)}`;
    const avisos: string[] = [];
    crewOf(r.asignacion).forEach((n) => touchedPeople.add(normTxt(n)));
    if (r.asignacion?.camionId) touchedTrucks.add(r.asignacion.camionId);

    if (tipo === 'Self Service' || tipo === 'Ruta Bolsón') {
      const base: Route = { ...r, estado: 'Pendiente', asignacion: null, esRecarga: false, aPiso: false };
      if (tipo === 'Self Service')
        return {
          route: { ...base, tipoAsignacion: 'Self Service', esSelfService: true, fechaSelfService: fechaHora, notaSelfService: a.nota || undefined, esBolson: false },
          mensaje: 'Marcada como Self Service (lista para liquidar).',
          avisos,
        };
      return {
        route: { ...base, tipoAsignacion: 'Ruta Bolsón', esBolson: true, fechaBolson: fechaHora, motivoBolson: a.nota || 'Contingencia', esSelfService: false },
        mensaje: 'Enviada a Bolsón (rechazo, lista para liquidar).',
        avisos,
      };
    }

    const truck = truckByRef(a.camion, r.agencia);
    if (!truck) return `No se encontró el camión "${a.camion}" (busca por ID Camión o placa en Camiones).`;
    if (truck.estado === 'Baja') avisos.push(`El camión ${truck.placa} está de baja en la app.`);
    if (truck.agencia && truck.agencia !== r.agencia) avisos.push(`El camión ${truck.placa} pertenece a ${truck.agencia}.`);
    const resolver = (ref: string, rol: string): { nombre: string; id?: string } | null => {
      if (!ref) return null;
      const st = staffByRef(ref, r.agencia);
      if (!st) {
        avisos.push(`${rol} "${ref}" no está en Personal: se guardó el nombre tal como viene.`);
        return { nombre: ref.toUpperCase() };
      }
      if (rol === 'Piloto' && !isPilot(st)) avisos.push(`${st.nombre} no es piloto (puesto ${st.puesto}).`);
      return { nombre: st.nombre, id: st.id };
    };
    const piloto = resolver(a.piloto, 'Piloto');
    const auxs = a.auxiliares.map((x, i) => resolver(x, `Auxiliar ${i + 1}`)!);
    const nombres = [piloto?.nombre, ...auxs.map((x) => x.nombre)].filter(Boolean).map((n) => normTxt(n));
    if (new Set(nombres).size !== nombres.length) return 'La misma persona aparece dos veces en la tripulación.';

    const hasPrior = Boolean(
      r.asignacion || r.ultimoDespacho || (r.historialDespachos?.length || 0) > 0 || r.estado === 'Abierta' || r.esReasignacion || (r.retornosCount || 0) > 0 || r.fechaAsignacion
    );
    let efectivo: AssignmentType = tipo;
    if (efectivo === 'Revisita' && !hasPrior) {
      efectivo = 'Primer Viaje';
      avisos.push('Se registró como Primer Viaje: la ruta no tenía una salida anterior.');
    }
    const original = r.fechaOriginalRuta || r.fecha;
    touchedTrucks.add(truck.id);
    nombres.forEach((n) => touchedPeople.add(n));
    const route: Route = {
      ...r,
      fechaOriginalRuta: original,
      fecha: original,
      estado: 'En Tránsito',
      tipoAsignacion: efectivo,
      esRecarga: efectivo === 'Recarga',
      esReasignacion: efectivo === 'Revisita',
      aPiso: false,
      esBolson: false,
      esSelfService: false,
      fechaAsignacion: fechaHora,
      asignacion: {
        camionId: truck.id,
        camionPlaca: truck.placa,
        conductor: piloto?.nombre || '',
        auxiliar1: auxs[0]?.nombre || null,
        auxiliar2: auxs[1]?.nombre || null,
        auxiliar3: auxs[2]?.nombre || null,
        auxiliar4: auxs[3]?.nombre || null,
        conductorId: piloto?.id,
        auxiliarIds: [0, 1, 2, 3].map((i) => auxs[i]?.id || null),
        horaSalida: a.hora || '',
        fechaDespacho: a.fecha,
        fechaAsignacion: fechaHora,
        tipoAsignacion: efectivo,
      },
    };
    const tripulacion = piloto ? `piloto ${piloto.nombre}` : 'sin piloto (solo camión)';
    return { route, mensaje: `${efectivo}: camión ${truck.idCamion ? `${truck.idCamion} · ` : ''}${truck.placa}, ${tripulacion}.`, avisos };
  }

  function aplicarLiquidacion(r: Route, l: ContLiqRow): { route: Route; mensaje: string } | string {
    if (r.estado === 'Liquidada') return 'La ruta ya está liquidada en la app; no se liquidó de nuevo.';
    if (r.estado === 'Abierta')
      return 'La ruta está como Ruta Abierta (esperando nueva salida). Agrega la fila de Revisita en la hoja Asignación antes de esta liquidación.';
    if (r.estado === 'Pendiente' && !r.esSelfService && !r.esBolson)
      return 'La ruta no tiene asignación. Agrega su fila en la hoja Asignación (o márcala como Self Service / Bolsón).';
    const fechaHora = `${l.fechaLiq || l.fecha} ${l.horaLiq || nowHM(now)}`;
    const paradasRuta = Number(r.paradas) || 0;
    const pNo = l.paradasNoEntregadas ?? 0;
    const pOk = l.paradasEntregadas ?? Math.max(0, paradasRuta - pNo);
    const devueltas = l.devueltas ?? 0;
    const entregadas = l.entregadas ?? 0;
    const hayDif = devueltas > 0 || pNo > 0;
    const esBolson = !!r.esBolson;
    const modalidad = l.modalidad as 'Liquidada' | 'Ruta Abierta' | 'Caja Abierta';
    let motivos = [...new Set(l.motivos)];
    if (esBolson && motivos.length === 0) motivos = [MOTIVO_BOLSON_LIQ];

    // Libera camión y tripulación (se recalculan al final con el estado de todas las rutas).
    if (r.asignacion?.camionId) touchedTrucks.add(r.asignacion.camionId);
    crewOf(r.asignacion).forEach((n) => touchedPeople.add(normTxt(n)));

    if (modalidad === 'Ruta Abierta') {
      if (motivos.length === 0) motivos = [MOTIVO_REVISITA];
      const prev = r.historialDespachos || [];
      const intento = prev.length + 1;
      const tipoViaje: AssignmentType =
        r.asignacion?.tipoAsignacion || r.tipoAsignacion || (r.esRecarga ? 'Recarga' : intento === 1 ? 'Primer Viaje' : 'Revisita');
      const motivoTxt = motivos.join(', ');
      const record: RouteDispatchRecord & { motivosSeleccionados?: MotivoDevolucionReason[] } = {
        intento,
        camionPlaca: r.asignacion?.camionPlaca || 'Sin placa asignada',
        camionId: r.asignacion?.camionId,
        conductor: r.asignacion?.conductor || 'Sin piloto',
        auxiliares: [r.asignacion?.auxiliar1, r.asignacion?.auxiliar2, r.asignacion?.auxiliar3, r.asignacion?.auxiliar4].filter(Boolean) as string[],
        horaSalida: r.asignacion?.horaSalida,
        fechaAsignacion: r.fechaAsignacion || r.asignacion?.fechaAsignacion,
        fechaRetorno: fechaHora,
        cajasEntregadas: entregadas,
        cajasDevueltas: devueltas,
        guiasExitosas: pOk,
        guiasRechazadas: pNo,
        motivoDevolucion: motivoTxt,
        motivosSeleccionados: motivos.filter((m) => ALL_MOTIVO_DEVOLUCION_REASONS.includes(m as MotivoDevolucionReason)) as MotivoDevolucionReason[],
        auditor: l.auditor,
        tipoAsignacion: tipoViaje,
        comentario: l.comentario || undefined,
      };
      return {
        route: {
          ...r,
          estado: 'Abierta',
          asignacion: null,
          ultimoDespacho: r.asignacion || r.ultimoDespacho,
          historialDespachos: [...prev, record],
          retornosCount: (r.retornosCount || 0) + 1,
          motivoDevolucion: motivoTxt,
          cajasDevueltasAcumuladas: (r.cajasDevueltasAcumuladas || 0) + devueltas,
          cajasOriginales: r.cajasOriginales || r.cajasFisicas,
          cajasFisicas: devueltas > 0 ? devueltas : r.cajasFisicas,
          paradasOriginales: r.paradasOriginales || r.paradas,
          paradas: pNo > 0 ? pNo : r.paradas,
          tipoAsignacion: tipoViaje,
          esReasignacion: tipoViaje === 'Revisita',
          esRecarga: tipoViaje === 'Recarga',
          liquidacion: null,
        },
        mensaje: `Ruta Abierta (retorno #${intento}): queda para Revisita.`,
      };
    }

    if (modalidad === 'Liquidada' && hayDif && motivos.length === 0)
      return 'Hay cajas devueltas o paradas no entregadas: elige el Motivo Devolución.';
    const finalMotivos = hayDif ? motivos : [];
    const cleanMotivo = finalMotivos.join(', ');
    const esCaja = modalidad === 'Caja Abierta';
    return {
      route: {
        ...r,
        estado: 'Liquidada',
        fechaLiquidacion: fechaHora,
        motivoDevolucion: cleanMotivo,
        liquidacion: {
          guiasExitosas: pOk,
          guiasRechazadas: pNo,
          cajasEntregadas: entregadas,
          cajasDevueltas: devueltas,
          motivoDevolucion: cleanMotivo,
          motivosSeleccionados: finalMotivos.filter((m) => ALL_MOTIVO_DEVOLUCION_REASONS.includes(m as MotivoDevolucionReason)) as MotivoDevolucionReason[],
          auditor: l.auditor,
          liquidadoPorUsuario: usuario,
          fechaLiquidacion: fechaHora,
          comentario: l.comentario || undefined,
          cajaAbierta: esCaja,
          motivoCajaAbierta: esCaja ? (l.motivoCaja as CajaAbiertaReason) : undefined,
          montoDiferenciaCaja: esCaja && l.monto !== null ? l.monto : undefined,
          historialEstados: [{ estado: esCaja ? 'Caja Abierta' : 'Liquidada', fecha: fechaHora }],
        },
      },
      mensaje: esCaja ? `Caja Abierta (${l.motivoCaja}).` : hayDif ? `Liquidada con diferencia (${cleanMotivo}).` : 'Liquidada completa.',
    };
  }

  // 3) Conflictos de recursos (misma regla que la base de datos) -------------
  const conflictoDe = (r: Route): string | null => {
    const a = r.asignacion;
    if (r.estado !== 'En Tránsito' || !a) return null;
    const mine = crewOf(a).map(normTxt);
    const j = jornadaDeRuta(r.fecha, now);
    for (const o of work) {
      if (o === r || o.estado !== 'En Tránsito' || !o.asignacion) continue;
      if (getRouteKey(o) === getRouteKey(r)) continue;
      if (jornadaDeRuta(o.fecha, now) !== j) continue;
      const oa = o.asignacion;
      if (a.camionId && a.camionId === oa.camionId && normTxt(a.conductor) !== normTxt(oa.conductor))
        return `el camión ${a.camionPlaca} también está en tránsito en la ruta ${o.id} con otro piloto`;
      if (normTxt(o.agencia) === normTxt(r.agencia) && (a.camionId || '') !== (oa.camionId || '')) {
        const others = crewOf(oa).map(normTxt);
        const shared = mine.filter((p) => others.includes(p));
        if (shared.length) return `${shared.join(', ').toUpperCase()} también está en tránsito en la ruta ${o.id} con otro camión`;
      }
    }
    return null;
  };
  for (let guard = 0; guard < 50; guard++) {
    const culpable = [...changedKeys]
      .map((k) => work.findIndex((r) => getRouteKey(r) === k))
      .filter((i) => i >= 0)
      .reverse()
      .find((i) => conflictoDe(work[i]));
    if (culpable === undefined) break;
    const r = work[culpable];
    const motivo = conflictoDe(r)!;
    const k = getRouteKey(r);
    const filas = grupoFilas.get(k) || [];
    // Se descartan TODAS las filas de esa ruta (la ruta vuelve a como estaba).
    filas.forEach(({ hoja, row }) => {
      const i = resultados.findIndex((x) => x.hoja === hoja && x.archivo === row.archivo && x.fila === row.fila && x.estado === 'ok');
      if (i >= 0) resultados[i] = { ...resultados[i], estado: 'error', mensaje: `No se aplicó: ${motivo}.` };
      for (let j = resultados.length - 1; j >= 0; j--) {
        const x = resultados[j];
        if (x.hoja === hoja && x.archivo === row.archivo && x.fila === row.fila && x.estado === 'aviso') resultados.splice(j, 1);
      }
    });
    const bk = beforeKeyOf.get(k);
    const orig = bk ? originalByKey.get(bk) : undefined;
    if (orig) work[culpable] = orig;
    else {
      work.splice(culpable, 1);
      createdKeys.delete(k);
      creadas--;
    }
    changedKeys.delete(k);
    beforeKeyOf.delete(k);
    histChanges.delete(k);
  }

  // 4) Estado final de camiones y personal tocados ---------------------------
  const enTransito = work.filter((r) => r.estado === 'En Tránsito' && r.asignacion);
  const changedTrucks: Truck[] = [];
  trucks.forEach((t) => {
    if (!touchedTrucks.has(t.id)) return;
    const usando = enTransito.filter((r) => r.asignacion!.camionId === t.id);
    let nt: Truck = t;
    if (usando.length) {
      const ids = Array.from(new Set(usando.map((r) => String(r.id)))).join(', ');
      if (t.estado !== 'En Ruta' || t.rutaActual !== ids || t.motivoNoAsignado)
        nt = { ...t, estado: 'En Ruta', rutaActual: ids, motivoNoAsignado: null, motivoNoAsignadoFecha: null, remuneraNoAsignado: null };
    } else if (t.estado === 'En Ruta') nt = { ...t, estado: 'Disponible', rutaActual: null };
    if (nt !== t) changedTrucks.push(nt);
  });
  const enRutaNombres = new Set(enTransito.flatMap((r) => crewOf(r.asignacion).map(normTxt)));
  const changedStaff: Staff[] = [];
  staff.forEach((s) => {
    const n = normTxt(s.nombre);
    if (!touchedPeople.has(n) || s.estado === 'Baja') return;
    let ns: Staff = s;
    if (enRutaNombres.has(n)) {
      if (s.estado !== 'En Ruta' || s.motivoNoAsignado)
        ns = { ...s, estado: 'En Ruta', motivoNoAsignado: null, motivoNoAsignadoFecha: null, remuneraNoAsignado: null };
    } else if (s.estado === 'En Ruta') ns = { ...s, estado: 'Disponible' };
    if (ns !== s) changedStaff.push(ns);
  });

  const changedRoutes = work.filter((r) => changedKeys.has(getRouteKey(r)) || createdKeys.has(getRouteKey(r)));
  const routeUpdates = changedRoutes.map((route) => ({ beforeKey: beforeKeyOf.get(getRouteKey(route)) ?? null, route }));
  const changedHistorical = changedRoutes.filter((r) => histChanges.has(getRouteKey(r)) && r.estado === 'Liquidada');

  resultados.sort((x, y) => (x.archivo === y.archivo ? (x.hoja === y.hoja ? x.fila - y.fila : x.hoja < y.hoja ? -1 : 1) : x.archivo < y.archivo ? -1 : 1));
  const okFilas = (h: ContHoja) =>
    new Set(resultados.filter((x) => x.hoja === h && x.estado === 'ok').map((x) => `${x.archivo}#${x.fila}`)).size;
  return {
    routeUpdates,
    changedRoutes,
    changedHistorical,
    changedTrucks,
    changedStaff,
    resultados,
    resumen: {
      creadas: Math.max(0, creadas),
      asignaciones: okFilas('Asignación'),
      liquidaciones: okFilas('Liquidación'),
      errores: resultados.filter((x) => x.estado === 'error').length,
      avisos: resultados.filter((x) => x.estado === 'aviso').length,
    },
  };
}
