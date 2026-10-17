import type { Route, RouteClientEntry } from '../types';

/** Texto en minúsculas y sin tildes, para buscar sin importar acentos. */
export const normBusqueda = (v: unknown): string =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Clientes de la ruta cuyo código o nombre coincide con lo buscado. */
export function clientesQueCoinciden(r: Pick<Route, 'clientesRuta'>, q: string): RouteClientEntry[] {
  const t = normBusqueda(q);
  if (!t || !r.clientesRuta?.length) return [];
  return r.clientesRuta.filter((c) => normBusqueda(c.codigo).includes(t) || normBusqueda(c.nombre).includes(t));
}
