import type { Route } from '../types';
import { getRouteKey, isSameSplitGroup } from './routeKey';
import { toNum } from './number';

// --- Control de cajas de una ruta partida en varios viajes ---

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export const padreDeViaje = (r: Route): string => String(r.parentRouteId || String(r.id).split('.')[0]);

/** Reparte "total" en n partes parejas (3 decimales); la última absorbe el redondeo. */
export function repartirParejo(total: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor((total / n) * 1000) / 1000;
  const partes = Array.from({ length: n }, () => base);
  partes[n - 1] = r3(total - base * (n - 1));
  return partes;
}

/**
 * Viajes del mismo grupo que todavía pueden recibir cajas: no liquidados ni
 * abiertos (Pendiente o En Tránsito) y con a lo sumo un cliente.
 */
export function viajesQueRecibenCajas(rutas: Route[], viaje: Route): Route[] {
  if (!viaje.isSplitRoute) return [];
  const padre = padreDeViaje(viaje);
  const k = getRouteKey(viaje);
  return rutas
    .filter(
      (x) =>
        getRouteKey(x) !== k &&
        isSameSplitGroup(x, padre, viaje) &&
        (x.estado === 'Pendiente' || x.estado === 'En Tránsito') &&
        (x.clientesRuta?.length || 0) <= 1
    )
    .sort((a, b) => (a.tripNumber || 0) - (b.tripNumber || 0));
}

export interface ResumenGrupo {
  padre: string;
  viajes: number;
  total: number; // entregado + devuelto + pendiente
  entregado: number;
  devuelto: number;
  pendiente: number; // cajas aún por entregar (viajes no liquidados)
  viajesPendientes: number;
}

/** Totales del grupo (activas + liquidadas; sin repetir la misma ruta). */
export function resumenGrupo(rutas: Route[], viaje: Route): ResumenGrupo | null {
  if (!viaje.isSplitRoute) return null;
  const padre = padreDeViaje(viaje);
  const vistos = new Map<string, Route>();
  rutas.forEach((x) => {
    if (isSameSplitGroup(x, padre, viaje)) vistos.set(getRouteKey(x), x);
  });
  let entregado = 0;
  let devuelto = 0;
  let pendiente = 0;
  let viajesPendientes = 0;
  vistos.forEach((x) => {
    if (x.estado === 'Liquidada') {
      entregado += toNum(x.liquidacion?.cajasEntregadas);
      devuelto += toNum(x.liquidacion?.cajasDevueltas);
    } else {
      pendiente += toNum(x.cajasFisicas);
      viajesPendientes++;
    }
  });
  return {
    padre,
    viajes: vistos.size,
    total: r3(entregado + devuelto + pendiente),
    entregado: r3(entregado),
    devuelto: r3(devuelto),
    pendiente: r3(pendiente),
    viajesPendientes,
  };
}
