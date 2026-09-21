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

export function getRouteKey(route: { id: string; fecha?: string }): string {
  return `${route.id}__${route.fecha ?? ''}`;
}

export function routeMatchesKey(
  route: { id: string; fecha?: string },
  id: string,
  fecha: string
): boolean {
  return String(route.id) === String(id) && String(route.fecha ?? '') === String(fecha);
}
