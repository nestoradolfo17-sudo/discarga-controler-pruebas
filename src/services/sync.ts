import { supabase, isSupabaseConfigured } from './supabaseClient';

// --- Sincronización compartida contra Supabase (fase de pruebas) ---
//
// Cada colección que antes vivía solo en localStorage (rutas, historial de
// liquidadas, camiones, personal, usuarios) se refleja en una tabla de
// Supabase con dos columnas: "id" (la CLAVE bajo la que se guarda cada
// registro — ver SyncKeyFn más abajo, no siempre es igual al campo "id" del
// objeto) y "data" (el objeto completo tal cual lo maneja el frontend, en
// formato JSON). Esto es intencional para esta fase: permite compartir datos
// reales entre los usuarios de prueba sin tener que rediseñar cada tabla
// como columnas relacionales todavía — eso queda para la fase de producción
// ya planeada, y migrar en ese momento es sencillo porque los datos ya están
// guardados y con la misma clave.

export type SyncableTable =
  | 'app_routes'
  | 'app_historical_routes'
  | 'app_trucks'
  | 'app_staff'
  | 'app_users';

// Extrae la clave con la que se guarda cada registro en la tabla compartida
// (columna "id" de Supabase). Para Camiones/Personal/Usuarios es simplemente
// el campo "id" del objeto. Para Rutas/Historial se usa una clave compuesta
// (ver getRouteKey en utils/routeKey.ts): el mismo número de ruta puede
// repetirse legítimamente en fechas distintas (rutas recurrentes cargadas
// día a día), y guardar solo por "id" hacía que la ruta de un día
// sobrescribiera/eliminara en Supabase a la de otro día con el mismo número,
// aunque en memoria ya se distinguieran correctamente por id+fecha.
export type SyncKeyFn<T> = (item: T) => string;

export interface SyncedRow<T> {
  key: string;
  data: T;
}

/**
 * Descarga todos los registros de una tabla compartida, junto con la clave
 * ("id" de la fila en Supabase) bajo la que están guardados actualmente.
 * Devuelve `null` si Supabase no está configurado o si ocurre un error de
 * red (en ese caso la aplicación sigue usando lo que ya tenía en
 * memoria/localStorage).
 */
export async function fetchSharedCollection<T>(
  table: SyncableTable
): Promise<SyncedRow<T>[] | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from(table).select('id, data');
    if (error) throw error;
    return (data || []).map((row: { id: string; data: T }) => ({ key: row.id, data: row.data }));
  } catch (e) {
    console.error(`Error leyendo "${table}" de Supabase:`, e);
    return null;
  }
}

/**
 * Sube el estado completo de una colección: hace upsert de todos los
 * registros actuales (bajo la clave que calcule `getKey`). NUNCA borra nada
 * en Supabase — ver la nota de seguridad más abajo. Nunca lanza — cualquier
 * error queda solo en consola, igual que ya ocurría con los errores de
 * localStorage lleno/bloqueado.
 *
 * ────────────────────────────────────────────────────────────────────────
 * NOTA DE SEGURIDAD — por qué esta función NUNCA borra registros:
 *
 * La versión anterior de esta función borraba en Supabase cualquier clave
 * que "antes" existiera localmente y ya "no" apareciera en `items` (borrado
 * INFERIDO por diferencia entre dos snapshots). La intención era simple
 * (reflejar en Supabase cuando el arreglo local se hacía más chico), pero
 * ese diseño resultó ser peligroso: CUALQUIER causa que hiciera que el
 * arreglo local pareciera más chico de lo que realmente debía ser —una
 * condición de carrera, una recarga con datos aún no sincronizados, un error
 * de programación futuro en cualquier pantalla que reemplace un arreglo
 * completo (como el reinicio a datos de ejemplo, que sí llegó a ocurrir)—
 * se traducía automáticamente en un borrado real, silencioso y compartido
 * con TODOS los usuarios conectados. Esto causó más de un incidente real de
 * pérdida de datos en Camiones, Personal y Rutas.
 *
 * Ahora el borrado en Supabase SOLO ocurre cuando el código de App.tsx llama
 * explícitamente a `deleteSharedRecords` con las claves EXACTAS de lo que el
 * usuario realmente decidió eliminar (por ejemplo, al presionar "Eliminar"
 * sobre un camión, una ruta o un colaborador concreto). `pushSharedCollection`
 * en cambio solo agrega/actualiza — nunca puede borrar nada, sin importar
 * qué tan chico llegue `items`. El costo de este diseño es que, si en el
 * futuro se agrega una nueva forma de "quitar" un registro de su arreglo
 * local sin agregar también su borrado explícito correspondiente, esa fila
 * quedaría "huérfana" en Supabase (visible para quien revise la base de
 * datos directamente) en vez de desaparecer del tablero — un error mucho
 * más seguro y fácil de notar/corregir que borrar datos reales de otros
 * usuarios sin que nadie lo pidiera.
 * ────────────────────────────────────────────────────────────────────────
 */
export async function pushSharedCollection<T>(
  table: SyncableTable,
  items: T[],
  getKey: SyncKeyFn<T>
): Promise<void> {
  if (!supabase || items.length === 0) return;
  try {
    const rows = items.map((item) => ({
      id: getKey(item),
      data: item,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  } catch (e) {
    console.error(`Error sincronizando "${table}" con Supabase:`, e);
  }
}

/**
 * Elimina explícitamente filas de una tabla compartida por su clave. Esta es
 * la ÚNICA forma en la que un registro puede desaparecer de Supabase (ver la
 * nota de seguridad en `pushSharedCollection` arriba) — App.tsx la llama
 * puntualmente desde cada acción que realmente borra algo a propósito (por
 * ejemplo, "Eliminar" sobre un camión, una ruta o un colaborador concreto,
 * o al archivar una ruta liquidada fuera del tablero activo), nunca de forma
 * implícita a partir de que un arreglo local se haya hecho más chico.
 * También se usa puntualmente para limpiar, una sola vez, filas que quedaron
 * guardadas con un esquema de clave anterior (ver la migración de
 * "app_routes" / "app_historical_routes" en App.tsx al pasar a clave
 * compuesta id+fecha).
 */
export async function deleteSharedRecords(table: SyncableTable, keys: string[]): Promise<void> {
  if (!supabase || keys.length === 0) return;
  try {
    const { error } = await supabase.from(table).delete().in('id', keys);
    if (error) throw error;
  } catch (e) {
    console.error(`Error eliminando registros heredados de "${table}" en Supabase:`, e);
  }
}

/**
 * Se suscribe a los cambios en tiempo real de una tabla compartida (para que
 * los cambios que haga otro usuario de prueba, en otra computadora, se vean
 * sin recargar la página). `onChange` recibe una función "updater" con la
 * misma forma que espera un setState de React (prev => next), lista para
 * pasarle directamente al setter del estado correspondiente. `getKey` debe
 * ser la misma función usada para guardar la colección (ver SyncKeyFn
 * arriba), para poder emparejar correctamente la fila de Supabase con el
 * registro local correspondiente.
 *
 * Devuelve una función para cancelar la suscripción.
 */
export function subscribeToSharedCollection<T>(
  table: SyncableTable,
  onChange: (updater: (prev: T[]) => T[]) => void,
  getKey: SyncKeyFn<T>
): () => void {
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`${table}-changes`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload: any) => {
        if (payload.eventType === 'DELETE') {
          const deletedKey = payload.old?.id;
          if (!deletedKey) return;
          onChange((prev) => prev.filter((item) => getKey(item) !== deletedKey));
        } else {
          const newItem = payload.new?.data as T | undefined;
          if (!newItem) return;
          const newKey = getKey(newItem);
          onChange((prev) => {
            const idx = prev.findIndex((item) => getKey(item) === newKey);
            if (idx === -1) return [...prev, newItem];
            const next = [...prev];
            next[idx] = newItem;
            return next;
          });
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export { isSupabaseConfigured };
