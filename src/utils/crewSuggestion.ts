import { Route, Truck, Staff } from '../types';
import { getRouteKey } from './routeKey';

// --- Tripulación sugerida por ID de ruta ---
//
// Revisa todas las salidas anteriores de la MISMA ruta (mismo número y misma
// agencia, en otras fechas) — tanto en el tablero activo como en el histórico
// de liquidadas — y sugiere el camión, el piloto y los auxiliares que más veces
// salieron con esa ruta. Cada día cuenta una sola vez (su última salida), para
// que una ruta con varias revisitas en un mismo día no pese más que las demás.

export interface CrewSuggestion {
  truckId: string | null;
  truckCount: number;
  driverName: string | null;
  driverCount: number;
  helpers: string[];
  helperCounts: Record<string, number>;
  samples: number; // cuántas salidas anteriores se analizaron
}

interface CrewSample {
  camionId?: string;
  camionPlaca?: string;
  conductor?: string;
  auxiliares: string[];
}

const norm = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase();

function sampleFromRoute(r: Route): CrewSample | null {
  const a = r.asignacion || r.ultimoDespacho;
  if (a && (a.camionId || a.camionPlaca || a.conductor)) {
    return {
      camionId: a.camionId,
      camionPlaca: a.camionPlaca,
      conductor: a.conductor,
      auxiliares: [a.auxiliar1, a.auxiliar2, a.auxiliar3, a.auxiliar4].filter(Boolean) as string[],
    };
  }
  const hist = r.historialDespachos;
  if (hist && hist.length > 0) {
    const last = hist[hist.length - 1];
    return {
      camionId: last.camionId,
      camionPlaca: last.camionPlaca,
      conductor: last.conductor,
      auxiliares: (last.auxiliares || []).filter(Boolean),
    };
  }
  return null;
}

function topOf(counts: Map<string, number>): [string, number] | null {
  let best: [string, number] | null = null;
  counts.forEach((n, k) => {
    if (!best || n > best[1]) best = [k, n];
  });
  return best;
}

export function suggestCrewForRoute(
  route: Route,
  allRoutes: Route[],
  trucks: Truck[],
  staff: Staff[]
): CrewSuggestion | null {
  const currentKey = getRouteKey(route);
  const seen = new Set<string>();
  const samples: CrewSample[] = [];

  allRoutes.forEach((r) => {
    if (String(r.id) !== String(route.id)) return;
    if ((r.agencia || '') !== (route.agencia || '')) return;
    const k = getRouteKey(r);
    if (k === currentKey || seen.has(k)) return;
    seen.add(k);
    const s = sampleFromRoute(r);
    if (s) samples.push(s);
  });

  if (samples.length === 0) return null;

  // Solo se sugieren recursos que siguen existiendo, son de la agencia de la
  // ruta y no están de baja.
  const agencyTrucks = trucks.filter((t) => t.agencia === route.agencia && t.estado !== 'Baja');
  const agencyStaff = staff.filter(
    (s) => s.agencia === route.agencia && s.estado !== 'Baja' && s.estatus !== 'BAJA'
  );
  const truckById = new Map(agencyTrucks.map((t) => [t.id, t]));
  const truckByPlaca = new Map(agencyTrucks.map((t) => [norm(t.placa), t]));
  const staffByName = new Map(agencyStaff.map((s) => [norm(s.nombre), s]));

  const truckCounts = new Map<string, number>();
  const driverCounts = new Map<string, number>();
  const helperCounts = new Map<string, number>();
  const helperSizes: number[] = [];

  samples.forEach((s) => {
    const t = (s.camionId && truckById.get(s.camionId)) || (s.camionPlaca && truckByPlaca.get(norm(s.camionPlaca)));
    if (t) truckCounts.set(t.id, (truckCounts.get(t.id) || 0) + 1);

    const d = s.conductor ? staffByName.get(norm(s.conductor)) : undefined;
    if (d) driverCounts.set(d.nombre, (driverCounts.get(d.nombre) || 0) + 1);

    helperSizes.push(s.auxiliares.length);
    s.auxiliares.forEach((h) => {
      const st = staffByName.get(norm(h));
      if (st) helperCounts.set(st.nombre, (helperCounts.get(st.nombre) || 0) + 1);
    });
  });

  const truckTop = topOf(truckCounts);
  const driverTop = topOf(driverCounts);

  // Cantidad típica de auxiliares = la más frecuente entre las salidas.
  const sizeCounts = new Map<string, number>();
  helperSizes.forEach((n) => sizeCounts.set(String(n), (sizeCounts.get(String(n)) || 0) + 1));
  const typicalSize = Math.min(4, parseInt(topOf(sizeCounts)?.[0] || '0', 10));

  const helpers = Array.from(helperCounts.entries())
    .filter(([name]) => !driverTop || norm(name) !== norm(driverTop[0]))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
    .slice(0, typicalSize)
    .map(([name]) => name);

  if (!truckTop && !driverTop && helpers.length === 0) return null;

  return {
    truckId: truckTop ? truckTop[0] : null,
    truckCount: truckTop ? truckTop[1] : 0,
    driverName: driverTop ? driverTop[0] : null,
    driverCount: driverTop ? driverTop[1] : 0,
    helpers,
    helperCounts: Object.fromEntries(helperCounts),
    samples: samples.length,
  };
}
