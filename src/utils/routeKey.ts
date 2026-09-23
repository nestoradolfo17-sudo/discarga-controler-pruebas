// Corrección: el "ID" de una ruta (el número que trae la plantilla de Excel) puede
// repetirse legítimamente en fechas distintas — es la MISMA ruta recurrente que se
// vuelve a cargar día tras día con el mismo número. Antes, el Tablero de Rutas y
// todas sus acciones (Asignar, A Piso, Liquidar, Eliminar, selección con checkbox,
// menú de Acciones) identificaban cada fila únicamente por el ID, así que hacer
// clic en la fila del 17/09 podía terminar afectando también a la fila del 16/09
// con el mismo ID (o viceversa). Esta utilidad combina ID + Fecha —el campo que sí
// distingue una fecha de otra, según lo reportado— en una sola clave estable, para
// que cada acción sobre una fila afecte únicamente a esa fila y no a sus "hermanas"
// con el mismo ID en otras fechas.
//
// route.fecha siempre está presente (campo obligatorio de Route) y, una vez asignada
// la ruta por primera vez, se mantiene congelada a su fecha original durante toda su
// vida (reasignaciones, recargas, envíos a piso, liquidación), así que es un
// identificador estable para esta clave.

// Corrección: además de ID + Fecha, la clave incluye la AGENCIA. Distintas
// agencias pueden usar el mismo número de ruta el mismo día; sin la agencia,
// la carga de una agencia sustituía a la ruta de la otra (misma fila en
// Supabase, mismas acciones en el tablero). Las filas guardadas con la clave
// anterior (sin agencia) se migran solas al cargar la app (ver
// reconcileInitialLoad en App.tsx).
const KEY_SEP = '__';

export function getRouteKey(route: { id: string; fecha?: string; agencia?: string }): string {
  return `${route.id}${KEY_SEP}${route.fecha ?? ''}${KEY_SEP}${route.agencia ?? ''}`;
}

/**
 * ¿Esta ruta es la fila indicada? `ref` normalmente es la clave completa de
 * la fila (getRouteKey: id + fecha + agencia), que es lo que ahora envían el
 * Tablero y los modales. Por compatibilidad también acepta solo la fecha
 * (comportamiento anterior: id + fecha).
 */
export function routeMatchesKey(
  route: { id: string; fecha?: string; agencia?: string },
  id: string,
  ref: string
): boolean {
  if (String(route.id) !== String(id)) return false;
  if (String(ref).includes(KEY_SEP)) return getRouteKey(route) === ref;
  return String(route.fecha ?? '') === String(ref);
}
