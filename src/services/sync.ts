import { supabase, isSupabaseConfigured } from './supabaseClient';

// --- Sincronización compartida contra Supabase (fase de pruebas) ---
//
// Cada colección que antes vivía solo en localStorage (rutas, historial de
// liquidadas, camiones, personal, usuarios) se refleja en una tabla de
// Supabase con dos columnas: "id" (el mismo id que ya usa cada registro en la
// aplicación) y "data" (el objeto completo tal cual lo maneja el frontend,
// en formato JSON). Esto es intencional para esta fase: permite compartir
// datos reales entre los usuarios de prueba sin tener que rediseñar cada
// tabla como columnas relacionales todavía — eso queda para la fase de
// producción ya planeada, y migrar en ese momento es sencillo porque los
// datos ya están guardados y con el mismo "id".

export type SyncableTable =
  | 'app_routes'
  | 'app_historical_routes'
  | 'app_trucks'
  | 'app_staff'
  | 'app_users';

interface WithId {
  id: string;
}

// Recuerda, entre una sincronización y la siguiente, qué IDs existían para
// poder detectar eliminaciones (un id que ya no está en el arreglo actual se
// borra también en Supabase).
export interface SyncIdHolder {
  ids: Set<string> | null;
}

/**
 * Descarga todos los registros de una tabla compartida. Devuelve `null` si
 * Supabase no está configurado o si ocurre un error de red (en ese caso la
 * aplicación sigue usando lo que ya tenía en memoria/localStorage).
 */
export async function fetchSharedCollection<T extends WithId>(
  table: SyncableTable
): Promise<T[] | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from(table).select('data');
    if (error) throw error;
    return (data || []).map((row: { data: T }) => row.data);
  } catch (e) {
    console.error(`Error leyendo "${table}" de Supabase:`, e);
    return null;
  }
}

/**
 * Sube el estado completo de una colección: hace upsert de todos los
 * registros actuales y elimina en Supabase los que ya no existen en el
 * arreglo local (se detectan comparando contra `idHolder`, que esta función
 * actualiza al final). Nunca lanza — cualquier error queda solo en consola,
 * igual que ya ocurría con los errores de localStorage lleno/bloqueado.
 */
export async function pushSharedCollection<T extends WithId>(
  table: SyncableTable,
  items: T[],
  idHolder: SyncIdHolder
): Promise<void> {
  if (!supabase) return;
  try {
    const currentIds = new Set(items.map((item) => item.id));
    if (items.length > 0) {
      const rows = items.map((item) => ({
        id: item.id,
        data: item,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    }
    if (idHolder.ids) {
      const removedIds = [...idHolder.ids].filter((id) => !currentIds.has(id));
      if (removedIds.length > 0) {
        const { error } = await supabase.from(table).delete().in('id', removedIds);
        if (error) throw error;
      }
    }
    idHolder.ids = currentIds;
  } catch (e) {
    console.error(`Error sincronizando "${table}" con Supabase:`, e);
  }
}

/**
 * Se suscribe a los cambios en tiempo real de una tabla compartida (para que
 * los cambios que haga otro usuario de prueba, en otra computadora, se vean
 * sin recargar la página). `onChange` recibe una función "updater" con la
 * misma forma que espera un setState de React (prev => next), lista para
 * pasarle directamente al setter del estado correspondiente.
 *
 * Devuelve una función para cancelar la suscripción.
 */
export function subscribeToSharedCollection<T extends WithId>(
  table: SyncableTable,
  onChange: (updater: (prev: T[]) => T[]) => void
): () => void {
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`${table}-changes`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table },
      (payload: any) => {
        if (payload.eventType === 'DELETE') {
          const deletedId = payload.old?.id;
          if (!deletedId) return;
          onChange((prev) => prev.filter((item) => item.id !== deletedId));
        } else {
          const newItem = payload.new?.data as T | undefined;
          if (!newItem) return;
          onChange((prev) => {
            const idx = prev.findIndex((item) => item.id === newItem.id);
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
