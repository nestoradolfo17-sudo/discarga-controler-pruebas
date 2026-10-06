import { formatDateToGuatemala } from './date';

// --- Jornada operativa de una ruta ---
// Una ruta con fecha FUTURA (p. ej. las del día siguiente que se asignan la
// noche anterior, ~21:00) pertenece a la jornada de su fecha. Una ruta de hoy
// o de días anteriores (rezagadas aún activas) pertenece a la jornada de HOY.
// Dos rutas solo compiten por el mismo camión o la misma tripulación si son de
// la misma jornada: así se puede asignar mañana sin liquidar lo de hoy.

const dayNum = (v: unknown): number | null => {
  if (!v) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(formatDateToGuatemala(v) || '');
  return m ? Math.round(Date.UTC(+m[3], +m[2] - 1, +m[1]) / 86400000) : null;
};

export function jornadaDeRuta(fecha: unknown, hoy: Date = new Date()): number {
  const today = dayNum(hoy) ?? Math.floor(hoy.getTime() / 86400000);
  const d = dayNum(fecha);
  return d !== null && d > today ? d : today;
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
