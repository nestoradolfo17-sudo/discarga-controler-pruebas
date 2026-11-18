import type { Route } from '../types';
import { formatDateToGuatemala } from './date';
import { toNum } from './number';

// Hora de asignación: a qué hora se le asignó camión y tripulación a cada ruta
// (fecha y hora que registra el sistema al asignar, "dd/mm/aaaa hh:mm").
// Mismas reglas que el Dashboard de Despacho.

export const PALETA_HORA = ['#2C3790', '#2f5fb8', '#5AACE4', '#1a9e76', '#8a63cf', '#d69e2e', '#e5793b', '#c84448', '#64748b', '#0f766e', '#a16207', '#7c3aed'];

const cajasRuta = (r: Route) => toNum(r.cajasOriginales || r.cajasFisicas);
const esDespachada = (r: Route) => r.estado !== 'Pendiente' || !!r.liquidacion;

const routeDayKey = (r: Route) => {
  const raw = r.fechaOriginalRuta || r.fecha;
  return raw ? formatDateToGuatemala(raw) : null;
};

// Fecha y hora de un texto ("dd/mm/aaaa hh:mm", "aaaa-mm-dd hh:mm" o ISO con
// zona) en minutos, en hora de Guatemala. Sin hora = medianoche.
const minutosDe = (s: string): number | null => {
  const t = String(s || '').trim();
  if (!t) return null;
  if (/T\d{2}:\d{2}.*(Z|[+-]\d{2}:?\d{2})$/.test(t)) {
    const d = new Date(t);
    return isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 60000) - 360; // Guatemala = UTC-6
  }
  let y = 0,
    mo = 0,
    da = 0;
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
export const minutosAsignacion = (r: Route): number | null => {
  const txt = textoAsignacion(r);
  if (!/\d{1,2}:\d{2}/.test(txt)) return null;
  const a = minutosDe(txt);
  const d = minutosDe(routeDayKey(r) || '');
  return a == null || d == null ? null : a - d;
};

export const etiquetaHora = (h: number) => (h < 0 ? 'Día ant.' : h >= 24 ? 'Día sig.' : `${String(h).padStart(2, '0')}:00`);

export interface FranjaHora {
  key: string;
  label: string;
  rango: string;
  n: number; // rutas asignadas en la franja
  cj: number; // cajas de esas rutas
  pct: number; // % sobre el total de rutas asignadas con hora
  color: string;
}

// Rutas asignadas por franja horaria, solo las franjas con rutas, en orden.
export function franjasAsignacion(rutas: Route[]): { franjas: FranjaHora[]; total: number; cj: number; sinHora: number } {
  const mapa = new Map<number, { n: number; cj: number }>();
  let sinHora = 0;
  rutas.filter(esDespachada).forEach((r) => {
    const m = minutosAsignacion(r);
    if (m == null) {
      sinHora += 1;
      return;
    }
    const h = m < 0 ? -1 : m >= 1440 ? 24 : Math.floor(m / 60);
    const x = mapa.get(h) || { n: 0, cj: 0 };
    x.n += 1;
    x.cj += cajasRuta(r);
    mapa.set(h, x);
  });
  const total = [...mapa.values()].reduce((a, x) => a + x.n, 0);
  const cj = [...mapa.values()].reduce((a, x) => a + x.cj, 0);
  const horas = [...mapa.keys()].sort((a, b) => a - b);
  const franjas = horas.map((h, i) => {
    const x = mapa.get(h) as { n: number; cj: number };
    const rango = h < 0 ? 'Día anterior' : h >= 24 ? 'Después del día de la ruta' : `${etiquetaHora(h)} – ${String(h).padStart(2, '0')}:59`;
    return { key: String(h), label: etiquetaHora(h), rango, n: x.n, cj: x.cj, pct: total ? (x.n / total) * 100 : 0, color: PALETA_HORA[i % PALETA_HORA.length] };
  });
  return { franjas, total, cj, sinHora };
}
