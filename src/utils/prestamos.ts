import type { Prestamo, PrestamoInfo, Route, TipoRecursoPrestamo } from '../types';
import { getGuatemalaDateForInput, parseFlexibleDate } from './date';

// --- Reglas de los préstamos de personal y camiones entre agencias ---

export const formatoCorrelativoPrestamo = (n?: number) =>
  typeof n === 'number' && n > 0 ? `PRE-${String(n).padStart(6, '0')}` : '';

export const estadoPrestamo = (p: Prestamo) => p.estado || 'Pendiente';

/** Día (AAAA-MM-DD) en que se registró la devolución, o '' si no se ha devuelto. */
export const fechaDevolucionISO = (p: Prestamo) => {
  if (!p.devuelto || !p.devueltoEn) return '';
  try {
    return getGuatemalaDateForInput(new Date(p.devueltoEn));
  } catch {
    return '';
  }
};

/**
 * ¿El préstamo cubre ese día? (para historia: recargas y reportes). Un préstamo
 * rechazado no cubre nada; uno devuelto antes de tiempo cubre hasta el día de
 * la devolución.
 */
export function cubreFecha(p: Prestamo, fechaISO: string): boolean {
  if (!fechaISO || estadoPrestamo(p) === 'Rechazado') return false;
  if (fechaISO < p.fechaInicio || fechaISO > p.fechaFin) return false;
  const dev = fechaDevolucionISO(p);
  return !dev || fechaISO <= dev;
}

/** ¿Está vigente ese día para asignar? (no rechazado, sin devolver y dentro del rango). */
export function vigenteEn(p: Prestamo, fechaISO: string): boolean {
  return !p.devuelto && cubreFecha(p, fechaISO);
}

export const claveRecurso = (tipo: TipoRecursoPrestamo, id: string) => (tipo === 'camion' ? `t:${id}` : `s:${id}`);

/** Recurso → préstamo vigente ese día. */
export function prestamosVigentes(prestamos: Prestamo[], fechaISO: string): Map<string, Prestamo> {
  const m = new Map<string, Prestamo>();
  prestamos.forEach((p) => {
    if (!vigenteEn(p, fechaISO)) return;
    p.recursos.forEach((r) => m.set(claveRecurso(r.tipo, r.id), p));
  });
  return m;
}

export const infoDePrestamo = (p: Prestamo): PrestamoInfo => ({
  origen: p.agenciaOrigen,
  destino: p.agenciaDestino,
  hasta: p.fechaFin,
  correlativo: p.correlativo,
  estado: estadoPrestamo(p),
});

/** Fecha de una ruta (DD/MM/AAAA u otros formatos) como AAAA-MM-DD. */
export const fechaRutaISO = (r: Pick<Route, 'fecha' | 'fechaOriginalRuta'>) => {
  const d = parseFlexibleDate(r.fechaOriginalRuta || r.fecha);
  return d ? getGuatemalaDateForInput(d) : '';
};

/** Agencia donde trabaja un camión/persona ese día (la de destino si está prestado). */
export function agenciaEfectiva(
  vigentes: Map<string, Prestamo>,
  tipo: 'camion' | 'persona',
  id: string,
  agenciaBase: string | undefined
): string {
  const p = vigentes.get(tipo === 'camion' ? `t:${id}` : `s:${id}`);
  return p ? p.agenciaDestino : agenciaBase || '';
}

/** Para pago de recargas: el préstamo está cerrado (autorizado y devuelto). */
export const prestamoCerrado = (p: Prestamo) => estadoPrestamo(p) === 'Autorizado' && !!p.devuelto;

export const fmtFecha = (iso: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso || '-');

export const diasEntre = (a: string, b: string) => {
  const d1 = Date.parse(a + 'T00:00:00Z');
  const d2 = Date.parse(b + 'T00:00:00Z');
  return Number.isFinite(d1) && Number.isFinite(d2) ? Math.round((d2 - d1) / 86400000) + 1 : 0;
};
