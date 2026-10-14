import { formatDateToGuatemala } from './date';

// --- Jornada operativa de una ruta ---
// Cada ruta pertenece a la jornada de SU PROPIA FECHA. Dos rutas solo compiten
// por el mismo camión o la misma tripulación si tienen la MISMA fecha: así se
// puede asignar una ruta de mañana sin liquidar las de hoy, y una ruta de hoy
// aunque el recurso siga "en tránsito" en una ruta de un día anterior que aún
// no se liquida en el sistema. (Antes, las rutas de días anteriores contaban
// como de hoy y bloqueaban el recurso.) Una ruta sin fecha cuenta como de hoy.
const dayNum = (v: unknown): number | null => {
  if (!v) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(formatDateToGuatemala(v) || '');
  return m ? Math.round(Date.UTC(+m[3], +m[2] - 1, +m[1]) / 86400000) : null;
};

export function jornadaDeRuta(fecha: unknown, hoy: Date = new Date()): number {
  const today = dayNum(hoy) ?? Math.floor(hoy.getTime() / 86400000);
  const d = dayNum(fecha);
  return d !== null ? d : today;
}

export function mismaJornada(a: { fecha?: string }, b: { fecha?: string }, hoy: Date = new Date()): boolean {
  return jornadaDeRuta(a.fecha, hoy) === jornadaDeRuta(b.fecha, hoy);
}

/** true si la ruta es de una fecha posterior a hoy (jornada futura). */
export function esJornadaFutura(fecha: unknown, hoy: Date = new Date()): boolean {
  const today = dayNum(hoy) ?? Math.floor(hoy.getTime() / 86400000);
  const d = dayNum(fecha);
  return d !== null && d > today;
}
