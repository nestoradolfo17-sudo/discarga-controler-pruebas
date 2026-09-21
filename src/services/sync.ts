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
 * registros actuales (bajo la clave que calcule `getKey`) y elimina en
 * Supabase las claves de `previousKeys` que ya no están presentes en
 * `items`.
 *
 * Corrección importante: `previousKeys` se recibe como un valor YA
 * CAPTURADO por quien llama (un Set independiente, no una referencia
 * mutable compartida que esta función vaya a leer más tarde). Antes,
 * `pushSharedCollection` recibía un objeto "idHolder" mutable y leía
 * `idHolder.ids` en el momento en que la operación de red finalmente se
 * ejecutaba. Si dos sincronizaciones de la misma colección quedaban en cola
 * (por ejemplo, una edición local seguida de un cambio en tiempo real de
 * otro usuario, o dos ediciones locales seguidas), ese objeto podía ser
 * sobrescrito por la más reciente ANTES de que la más antigua, ya en vuelo,
 * leyera `idHolder.ids` — comparando entonces contra un conjunto de ids que
 * no tenía nada que ver con los datos que esa sincronización específica
 * estaba subiendo, y terminando por BORRAR en Supabase registros que otro
 * usuario acababa de guardar correctamente unos milisegundos antes. Ahora
 * cada llamada recibe su propio snapshot de "claves anteriores" por valor,
 * capturado de forma síncrona en el mismo instante en que se decide subir el
 * cambio (ver App.tsx/pushIfChanged), así que ninguna sincronización puede
 * "contaminar" el punto de comparación de otra que ya esté en cola. Nunca
 * lanza — cualquier error queda solo en consola, igual que ya ocurría con
 * los errores de localStorage lleno/bloqueado.
 */
export async function pushSharedCollection<T>(
  table: SyncableTable,
  items: T[],
  getKey: SyncKeyFn<T>,
  previousKeys: Set<string> | null
): Promise<void> {
  if (!supabase) return;
  try {
    const currentKeys = new Set(items.map(getKey));
    if (items.length > 0) {
      const rows = items.map((item) => ({
        id: getKey(item),
        data: item,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    }
    if (previousKeys) {
      const removedKeys = [...previousKeys].filter((key) => !currentKeys.has(key));
      if (removedKeys.length > 0) {
        const { error } = await supabase.from(table).delete().in('id', removedKeys);
        if (error) throw error;
      }
    }
  } catch (e) {
    console.error(`Error sincronizando "${table}" con Supabase:`, e);
  }
}

/**
 * Elimina explícitamente filas de una tabla compartida por su clave. Se usa
 * puntualmente para limpiar, una sola vez, filas que quedaron guardadas con
 * un esquema de clave anterior (ver la migración de "app_routes" /
 * "app_historical_routes" en App.tsx al pasar a clave compuesta id+fecha).
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
