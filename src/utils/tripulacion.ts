import type { Route } from '../types';

// --- Regla para liquidar: tripulación mínima ---
// Una ruta solo se puede liquidar si salió con CAMIÓN y PILOTO. Los auxiliares
// no son obligatorios (a veces no hay). No aplica a Ruta Bolsón (se liquida
// como rechazo, no sale) ni a Self Service (el cliente recoge).

const lleno = (v?: string | null) => !!v && !!String(v).trim() && String(v).trim().toLowerCase() !== 'sin piloto';

/** Motivo por el que NO se puede liquidar por falta de camión o piloto, o null si está bien. */
export const faltaTripulacionParaLiquidar = (r: Route): string | null => {
  const bolson = !!(r.esBolson || r.tipoAsignacion === 'Ruta Bolsón');
  const selfService = !!(r.esSelfService || r.tipoAsignacion === 'Self Service');
  if (bolson || selfService) return null;
  const a = r.asignacion || r.ultimoDespacho;
  const camion = !!(a && (lleno(a.camionId) || lleno(a.camionPlaca)));
  const piloto = lleno(a?.conductor);
  if (camion && piloto) return null;
  if (!camion && !piloto) return 'La ruta no tiene camión ni piloto asignados.';
  return !camion ? 'La ruta no tiene camión asignado.' : 'La ruta no tiene piloto asignado.';
};
