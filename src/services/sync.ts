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

// --- Aviso de errores de sincronización a la interfaz ---
//
// Corrección: antes cualquier error al leer/guardar/borrar en Supabase
// quedaba SOLO en la consola del navegador. El usuario seguía trabajando
// creyendo que sus cambios se estaban guardando en la base compartida cuando
// en realidad no era así. Ahora App.tsx registra aquí una función (que
// muestra un aviso en pantalla) y cada error se reporta también por esa vía.
type SyncErrorHandler = (message: string) => void;
let syncErrorHandler: SyncErrorHandler | null = null;

export function setSyncErrorHandler(handler: SyncErrorHandler | null): void {
  syncErrorHandler = handler;
}

function reportSyncError(message: string, error: unknown): void {
  console.error(message, error);
  try {
    syncErrorHandler?.(message);
  } catch {
    // Nunca dejar que un error al mostrar el aviso rompa la sincronización.
  }
}

// --- Blindaje: diagnóstico del error y reintentos automáticos ---
//
// Antes cualquier fallo mostraba el mismo aviso genérico ("revisa tu conexión
// y recarga la página"), aunque la causa real fuera otra (sesión vencida,
// permiso de agencia, base de datos llena...). Ahora se identifica la causa
// para mostrar un mensaje claro, y los fallos pasajeros (red intermitente,
// servidor ocupado, sesión por renovar) se reintentan solos antes de avisar.
// Reintentar es seguro: guardar (upsert) y borrar por clave dan el mismo
// resultado aunque se repitan.
export type SyncErrorKind = 'red' | 'sesion' | 'permiso' | 'espacio' | 'ocupado' | 'otro';

export function describeSyncError(e: unknown): { kind: SyncErrorKind; reason: string } {
  const err = (e || {}) as { message?: string; code?: string; details?: string; hint?: string; status?: number };
  const code = String(err.code || '');
  const text = `${err.message || ''} ${err.details || ''} ${err.hint || ''} ${e instanceof Error ? e.name : ''}`;
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed|typeerror/i.test(text)) {
    return { kind: 'red', reason: 'No hay comunicación con el servidor (internet inestable o sin señal).' };
  }
  if (code === 'PGRST301' || code === 'PGRST303' || err.status === 401 || /jwt|token.*expir|not authenticated|invalid claim/i.test(text)) {
    return { kind: 'sesion', reason: 'Tu sesión venció o no es válida.' };
  }
  if (code === '42501' || err.status === 403 || /row-level security|permission denied|violates row-level/i.test(text)) {
    return { kind: 'permiso', reason: 'Tu usuario no tiene permiso para este cambio (agencia o acción no autorizada). Consulta con el administrador.' };
  }
  if (code === '53100' || code === '25006' || /disk|no space|read-only transaction|read only/i.test(text)) {
    return { kind: 'espacio', reason: 'La base de datos está llena o en modo solo lectura. Avisa al administrador de inmediato.' };
  }
  if (code === '57014' || code === '53300' || code === 'PGRST000' || code === 'PGRST002' || (err.status ?? 0) >= 500 || /timeout|timed out|too many connections|service unavailable|bad gateway/i.test(text)) {
    return { kind: 'ocupado', reason: 'El servidor tardó demasiado o está ocupado.' };
  }
  return { kind: 'otro', reason: err.message ? `Detalle: ${err.message}` : 'Error desconocido.' };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const RETRY_DELAYS_MS = [1500, 4000, 8000];

/**
 * Ejecuta `fn` y, si falla por una causa pasajera, la reintenta (hasta 3
 * veces, con espera creciente). Si la sesión venció, intenta renovarla una
 * vez antes de reintentar. Los errores de permiso o de espacio no se
 * reintentan: no se arreglan solos.
 */
async function withRetry<R>(fn: () => Promise<R>): Promise<R> {
  let refreshedSession = false;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const { kind } = describeSyncError(e);
      const canRetry = attempt < RETRY_DELAYS_MS.length;
      if (kind === 'sesion' && !refreshedSession && supabase) {
        refreshedSession = true;
        try {
          await supabase.auth.refreshSession();
        } catch {
          /* si no se puede renovar, el reintento fallará y se avisará */
        }
        continue;
      }
      if (!canRetry || !(kind === 'red' || kind === 'ocupado')) throw e;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw e;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

const TABLE_LABELS: Record<SyncableTable, string> = {
  app_routes: 'Rutas',
  app_historical_routes: 'Rutas liquidadas',
  app_trucks: 'Camiones',
  app_staff: 'Personal',
  app_users: 'Usuarios',
};
const tableLabel = (t: SyncableTable) => `"${TABLE_LABELS[t] || t}"`;

/**
 * Estado del espacio de la base de datos (función estado_espacio() creada por
 * supabase/fase4_blindaje.sql). Devuelve null si la función aún no existe o
 * no se pudo leer: en ese caso la app simplemente no muestra el aviso.
 */
export async function fetchDatabaseSpace(): Promise<{ mb: number; pct: number; alerta: string } | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc('estado_espacio');
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return { mb: Number(row.mb_usados), pct: Number(row.pct_limite_free), alerta: String(row.alerta || 'OK') };
  } catch {
    return null;
  }
}

// Tamaño de página para leer y de lote para escribir.
//
// Corrección crítica: Supabase (PostgREST) devuelve como MÁXIMO 1000 filas
// por consulta. La lectura anterior hacía un solo `select` sin paginar, así
// que cualquier tabla con más de 1000 registros se cargaba INCOMPLETA en la
// aplicación, sin ningún aviso. Con "app_staff" eso provocó que cada Carga
// Masiva de Excel no encontrara (por DPI) a los colaboradores que habían
// quedado fuera de esas primeras 1000 filas y los volviera a crear con un id
// nuevo: la tabla llegó a tener miles de registros duplicados.
const PAGE_SIZE = 1000;
const UPSERT_BATCH_SIZE = 500;

/**
 * Descarga todos los registros de una tabla compartida, junto con la clave
 * ("id" de la fila en Supabase) bajo la que están guardados actualmente.
 * Devuelve `null` si Supabase no está configurado o si ocurre un error de
 * red (en ese caso la aplicación sigue usando lo que ya tenía en
 * memoria/localStorage).
 */
export async function fetchSharedCollection<T>(
  table: SyncableTable,
  // Punto 15: permite traer solo lo modificado en los últimos N días (se usa
  // para el historial de liquidadas, que crece todos los días).
  opts?: { sinceDays?: number }
): Promise<SyncedRow<T>[] | null> {
  if (!supabase) return null;
  try {
    const all: SyncedRow<T>[] = [];
    // Lectura paginada (ver PAGE_SIZE arriba). Se ordena por "id" para que
    // las páginas sean estables y no se salte ni se repita ninguna fila.
    const since = opts?.sinceDays
      ? new Date(Date.now() - opts.sinceDays * 24 * 60 * 60 * 1000).toISOString()
      : null;
    for (let from = 0; ; from += PAGE_SIZE) {
      const pageFrom = from;
      // La consulta se arma dentro del reintento: cada intento es una solicitud nueva.
      const { data } = await withRetry(async () => {
        let query = supabase!.from(table).select('id, data');
        if (since) query = query.gte('updated_at', since);
        const res = await query.order('id', { ascending: true }).range(pageFrom, pageFrom + PAGE_SIZE - 1);
        if (res.error) throw res.error;
        return res;
      });
      const rows = (data || []) as { id: string; data: T }[];
      rows.forEach((row) => all.push({ key: row.id, data: row.data }));
      if (rows.length < PAGE_SIZE) break;
    }
    return all;
  } catch (e) {
    reportSyncError(`No se pudo leer ${tableLabel(table)}. ${describeSyncError(e).reason}`, e);
    return null;
  }
}

/**
 * Hace upsert de los registros recibidos (bajo la clave que calcule
 * `getKey`). App.tsx ahora solo le pasa los registros que REALMENTE cambiaron
 * (no la colección completa) — ver pushIfChanged. NUNCA borra nada en
 * Supabase — ver la nota de seguridad más abajo. Nunca lanza: devuelve
 * `true` si se guardó todo, `false` si hubo error (y lo reporta en pantalla
 * mediante setSyncErrorHandler).
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
): Promise<boolean> {
  if (!supabase) return false;
  if (items.length === 0) return true;
  try {
    const now = new Date().toISOString();
    const rows = items.map((item) => ({
      id: getKey(item),
      data: item,
      updated_at: now,
    }));
    // En lotes, para no mandar solicitudes gigantes (ver UPSERT_BATCH_SIZE).
    for (let i = 0; i < rows.length; i += UPSERT_BATCH_SIZE) {
      const batch = rows.slice(i, i + UPSERT_BATCH_SIZE);
      await withRetry(async () => {
        const { error } = await supabase!.from(table).upsert(batch, { onConflict: 'id' });
        if (error) throw error;
      });
    }
    return true;
  } catch (e) {
    // Rechazo de la base de datos por recurso ocupado (otra tablet asignó ese
    // camión o esa persona primero): se muestra el motivo exacto.
    const msg = String((e as { message?: string })?.message || '');
    if (msg.includes('RECURSO_OCUPADO')) {
      reportSyncError(
        `No se guardó la asignación: ${msg.replace(/^.*RECURSO_OCUPADO:\s*/, '')} Se restauró la ruta; elige otro recurso.`,
        e
      );
    } else {
      const { kind, reason } = describeSyncError(e);
      const retryNote =
        kind === 'red' || kind === 'ocupado' || kind === 'sesion' || kind === 'otro'
          ? ' La app lo volverá a intentar sola.'
          : '';
      reportSyncError(`No se guardaron cambios de ${tableLabel(table)}. ${reason}${retryNote}`, e);
    }
    return false;
  }
}

/**
 * Vuelve a leer de la base compartida filas puntuales (por clave). Se usa
 * cuando la base rechaza un cambio, para restaurar en pantalla lo que
 * realmente quedó guardado. Devuelve null si no se pudo leer.
 */
export async function fetchSharedRowsByKeys<T>(
  table: SyncableTable,
  keys: string[]
): Promise<Map<string, T> | null> {
  if (!supabase || keys.length === 0) return new Map();
  try {
    const { data } = await withRetry(async () => {
      const res = await supabase!.from(table).select('id, data').in('id', keys);
      if (res.error) throw res.error;
      return res;
    });
    const map = new Map<string, T>();
    (data || []).forEach((row: { id: string; data: T }) => map.set(row.id, row.data));
    return map;
  } catch (e) {
    console.error(`Error releyendo "${table}":`, e);
    return null;
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
    for (let i = 0; i < keys.length; i += UPSERT_BATCH_SIZE) {
      const batch = keys.slice(i, i + UPSERT_BATCH_SIZE);
      await withRetry(async () => {
        const { error } = await supabase!.from(table).delete().in('id', batch);
        if (error) throw error;
      });
    }
  } catch (e) {
    reportSyncError(`No se pudieron eliminar registros de ${tableLabel(table)}. ${describeSyncError(e).reason}`, e);
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
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        reportSyncError(
          `Se interrumpió la actualización en vivo de ${tableLabel(table)}. Se reconecta sola; si en 2 minutos no ves los cambios de otros usuarios, recarga la página.`,
          status
        );
      }
    });

  return () => {
    supabase.removeChannel(channel);
  };
}

export { isSupabaseConfigured };
