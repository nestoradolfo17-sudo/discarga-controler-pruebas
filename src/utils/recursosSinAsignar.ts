import type { Route, Truck, Staff } from '../types';

// --- Recursos sin asignar del día (Fin de Asignación) ---
//
// Un camión o una persona "no fue asignado" en la fecha de operación solo si:
//   • está Disponible (no En Ruta ni de Baja) y, en el caso del personal, su
//     estatus no es BAJA; y
//   • no aparece en NINGUNA ruta de ese día: ni en una que siga En Tránsito, ni
//     en una que ya regresó, se liquidó o quedó Abierta, ni en un despacho
//     anterior del historial (2° viaje, recarga, revisita).
// Antes solo se revisaban las rutas En Tránsito, así que quien ya había salido
// y regresado ese día volvía a "Disponible" y aparecía como si no lo hubieran
// asignado. Esta misma regla la usan el modal y el número del botón.

const DIA_RE = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;

/** Fecha "dd/mm/aaaa" contenida en un texto ("16/10/2026 05:10" → "16/10/2026"). */
export const diaDe = (texto?: string | null): string => {
  const m = DIA_RE.exec(String(texto || ''));
  return m ? `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}` : '';
};

const norm = (s?: string | null) => String(s || '').trim().toUpperCase();

export interface AsignadosDelDia {
  truckIds: Set<string>;
  truckPlacas: Set<string>;
  staffIds: Set<string>;
  staffNombres: Set<string>;
}

export function asignadosEnFecha(rutas: Route[], fecha: string): AsignadosDelDia {
  const res: AsignadosDelDia = { truckIds: new Set(), truckPlacas: new Set(), staffIds: new Set(), staffNombres: new Set() };
  const dia = diaDe(fecha);
  const agregar = (
    camionId?: string | null,
    placa?: string | null,
    nombres: (string | null | undefined)[] = [],
    ids: (string | null | undefined)[] = []
  ) => {
    if (camionId) res.truckIds.add(String(camionId));
    if (placa) res.truckPlacas.add(norm(placa));
    nombres.forEach((n) => n && res.staffNombres.add(norm(n)));
    ids.forEach((i) => i && res.staffIds.add(String(i)));
  };
  const vistos = new Set<Route>();
  rutas.forEach((r) => {
    if (!r || vistos.has(r)) return;
    vistos.add(r);
    const a = r.asignacion;
    if (a) {
      const diaAsig = diaDe(a.fechaAsignacion || a.fechaDespacho || r.fechaAsignacion);
      const salioEseDia =
        r.estado === 'En Tránsito' ||
        diaAsig === dia ||
        // Asignación sin fecha registrada: se toma la fecha de la ruta.
        (!diaAsig && diaDe(r.fecha) === dia && r.estado !== 'Pendiente');
      if (salioEseDia) {
        agregar(
          a.camionId,
          a.camionPlaca,
          [a.conductor, a.auxiliar1, a.auxiliar2, a.auxiliar3, a.auxiliar4],
          [a.conductorId, ...(a.auxiliarIds || [])]
        );
      }
    }
    (r.historialDespachos || []).forEach((d) => {
      if (diaDe(d.fechaAsignacion) === dia || diaDe(d.fechaRetorno) === dia) {
        agregar(d.camionId, d.camionPlaca, [d.conductor, ...(d.auxiliares || [])]);
      }
    });
    // Camiones de apoyo: cuentan como asignados el día que salieron.
    (r.apoyos || []).forEach((ap) => {
      if ((!ap.cerradoEn && r.estado === 'En Tránsito') || diaDe(ap.registradoEn) === dia || diaDe(ap.cerradoEn) === dia) {
        agregar(ap.camionId, ap.camionPlaca, [ap.conductor, ...(ap.auxiliares || [])], [ap.conductorId, ...(ap.auxiliarIds || [])]);
      }
    });
  });
  return res;
}

export function camionesSinAsignar(trucks: Truck[], asignados: AsignadosDelDia): Truck[] {
  return trucks.filter(
    (t) =>
      t.estado === 'Disponible' &&
      !asignados.truckIds.has(String(t.id)) &&
      !asignados.truckPlacas.has(norm(t.placa))
  );
}

export function personalSinAsignar(staff: Staff[], asignados: AsignadosDelDia): Staff[] {
  return staff.filter(
    (s) =>
      s.estado === 'Disponible' &&
      s.estatus !== 'BAJA' &&
      !asignados.staffIds.has(String(s.id)) &&
      !asignados.staffNombres.has(norm(s.nombre))
  );
}
