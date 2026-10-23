import type { ApoyoRuta, MotivoApoyo, Route } from '../types';

// --- Camiones de apoyo de una ruta ---
// Un camión de apoyo sale junto con el camión principal para llevar la carga
// por caminos angostos o de acceso difícil. La ruta sigue siendo UNA sola: sus
// cajas, su meta y su liquidación no se duplican. Mientras la ruta está en
// tránsito, el camión y la tripulación de apoyo quedan "En Ruta" (no se pueden
// asignar a otra ruta). Al liquidar la ruta el apoyo se cierra solo.

export const MOTIVOS_APOYO: MotivoApoyo[] = ['Camino angosto', 'Acceso restringido', 'Peso / capacidad', 'Otro'];

/** Número del viaje (despacho) actual de la ruta: 1 = primer despacho. */
export const viajeActual = (r: Route) => (r.historialDespachos?.length || 0) + 1;

/** Apoyos que siguen abiertos en el viaje actual de la ruta. */
export const apoyosActivos = (r: Route): ApoyoRuta[] =>
  r.estado === 'En Tránsito' ? (r.apoyos || []).filter((a) => !a.cerradoEn && a.intento === viajeActual(r)) : [];

/** Cierra los apoyos abiertos de la ruta (al liquidar o al despachar de nuevo). */
export const cerrarApoyos = <T extends Route>(r: T, cuando: string): T =>
  r.apoyos?.some((a) => !a.cerradoEn) ? { ...r, apoyos: r.apoyos.map((a) => (a.cerradoEn ? a : { ...a, cerradoEn: cuando })) } : r;

/** Apoyos de un viaje (para reportes de rutas ya liquidadas). */
export const apoyosDelViaje = (r: Route, intento?: number): ApoyoRuta[] => {
  const n = intento ?? (r.estado === 'Abierta' ? r.historialDespachos?.length || 1 : viajeActual(r));
  return (r.apoyos || []).filter((a) => a.intento === n);
};

/** Texto corto para reportes: "C101BCD (Juan Pérez) · Camino angosto". */
export const textoApoyos = (lista: ApoyoRuta[]) =>
  lista.map((a) => `${a.camionPlaca}${a.conductor ? ` (${a.conductor})` : ''} · ${a.motivo}${a.cajas ? ` · ${a.cajas} cj` : ''}`).join(' | ');

export const nuevoIdApoyo = () => `AP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
