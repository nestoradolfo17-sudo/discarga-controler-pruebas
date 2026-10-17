import { supabase, isSupabaseConfigured } from './supabaseClient';
import { isDemoMode } from './demoMode';
import type { Recarga } from '../types';

// --- Módulo de Recargas: lectura y guardado ---
//
// Las recargas viven en su propia tabla compartida "app_recargas" (mismo
// formato que las demás: id + data jsonb). Se manejan aquí, fuera del ciclo
// general de sincronización de App.tsx, porque son registros pequeños que solo
// usa este módulo. Sin Supabase (modo local) se guardan en este navegador.
//
// Si la tabla todavía no existe (no se ha corrido supabase/fase8_recargas.sql)
// la pantalla lo avisa y el registro automático desde el Tablero se omite en
// silencio, sin mostrar errores al operador.

const TABLE = 'app_recargas';
const STORAGE_KEY = 'rutamaster_recargas_v1';
const PAGE = 1000;

export type ResultadoLectura =
  | { ok: true; data: Recarga[] }
  | { ok: false; tablaFalta: boolean; mensaje: string };

const esTablaFaltante = (e: unknown) => {
  const err = e as { code?: string; message?: string } | null;
  const msg = String(err?.message || '');
  return err?.code === '42P01' || err?.code === 'PGRST205' || /could not find the table|does not exist/i.test(msg);
};

const leerLocal = (): Recarga[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};
const escribirLocal = (list: Recarga[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Sin espacio en el navegador: se ignora (modo local de pruebas).
  }
};

// Versión DEMO: lo que se registra o cambia vive solo en la memoria de esta
// pestaña (la base no se toca) y se combina con lo real al leer, para que la
// práctica se vea completa. Al recargar la página vuelve a lo real.
const demoGuardadas = new Map<string, Recarga>();
const demoEliminadas = new Set<string>();
let demoMaxCorrelativo = 0;

export const nuevoIdRecarga = () => `RC-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Clave fija para la recarga creada sola desde el Tablero (una por ruta y día). */
export const idRecargaAuto = (routeKey: string, fechaISO: string) => `AUTO__${routeKey}__${fechaISO}`;

export async function leerRecargas(): Promise<ResultadoLectura> {
  if (!isSupabaseConfigured || !supabase) return { ok: true, data: leerLocal() };
  try {
    const all: Recarga[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from(TABLE)
        .select('id, data')
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = (data || []) as { id: string; data: Recarga }[];
      rows.forEach((r) => r.data && all.push({ ...r.data, id: r.id }));
      if (rows.length < PAGE) break;
    }
    if (isDemoMode) {
      all.forEach((r) => (demoMaxCorrelativo = Math.max(demoMaxCorrelativo, r.correlativo || 0)));
      const byId = new Map(all.filter((r) => !demoEliminadas.has(r.id)).map((r) => [r.id, r]));
      demoGuardadas.forEach((r, id) => byId.set(id, r));
      return { ok: true, data: [...byId.values()] };
    }
    return { ok: true, data: all };
  } catch (e) {
    return {
      ok: false,
      tablaFalta: esTablaFaltante(e),
      mensaje: String((e as { message?: string })?.message || e),
    };
  }
}

export const formatoCorrelativo = (n?: number) => (typeof n === 'number' && n > 0 ? `REC-${String(n).padStart(6, '0')}` : '');

const mensajeError = (e: unknown, def: string) => {
  if (esTablaFaltante(e)) return 'Falta crear la tabla de Recargas en la base de datos (supabase/fase8_recargas.sql).';
  const msg = String((e as { message?: string })?.message || '');
  if (msg.includes('RECARGA_')) return msg.replace(/^.*RECARGA_[A-Z_]+:\s*/, '');
  return msg || def;
};

export type ResultadoGuardado = { error: string | null; guardadas: Recarga[] };

/**
 * Crea o actualiza recargas. Devuelve las recargas tal como quedaron guardadas
 * (con el correlativo que asigna la base). En modo local el correlativo se
 * calcula aquí.
 */
export async function guardarRecargas(list: Recarga[]): Promise<ResultadoGuardado> {
  if (list.length === 0) return { error: null, guardadas: [] };
  if (!isSupabaseConfigured || !supabase) {
    const all = leerLocal();
    let max = all.reduce((m, x) => Math.max(m, x.correlativo || 0), 0);
    const guardadas = list.map((r) => {
      const previa = all.find((x) => x.id === r.id);
      const correlativo = previa?.correlativo || r.correlativo || ++max;
      const g = { ...r, correlativo };
      const i = all.findIndex((x) => x.id === r.id);
      if (i === -1) all.push(g);
      else all[i] = g;
      return g;
    });
    escribirLocal(all);
    return { error: null, guardadas };
  }
  if (isDemoMode) {
    const guardadas = list.map((r) => {
      const previa = demoGuardadas.get(r.id);
      const g = { ...r, correlativo: r.correlativo || previa?.correlativo || ++demoMaxCorrelativo };
      demoGuardadas.set(r.id, g);
      demoEliminadas.delete(r.id);
      return g;
    });
    return { error: null, guardadas };
  }
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from(TABLE)
      .upsert(list.map((r) => ({ id: r.id, data: r, updated_at: now })), { onConflict: 'id' })
      .select('id, data');
    if (error) throw error;
    const rows = (Array.isArray(data) ? data : []) as { id: string; data: Recarga }[];
    const byId = new Map(rows.map((x) => [x.id, { ...x.data, id: x.id }]));
    return { error: null, guardadas: list.map((r) => byId.get(r.id) || r) };
  } catch (e) {
    return { error: mensajeError(e, 'No se pudieron guardar las recargas.'), guardadas: [] };
  }
}

/** Crea o actualiza una recarga. */
export async function guardarRecarga(r: Recarga): Promise<{ error: string | null; guardada: Recarga }> {
  const res = await guardarRecargas([r]);
  return { error: res.error, guardada: res.guardadas[0] || r };
}

export async function eliminarRecarga(id: string): Promise<string | null> {
  if (isDemoMode) {
    demoGuardadas.delete(id);
    demoEliminadas.add(id);
    return null;
  }
  if (!isSupabaseConfigured || !supabase) {
    escribirLocal(leerLocal().filter((x) => x.id !== id));
    return null;
  }
  try {
    const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select('id');
    if (error) throw error;
    // La base no borra (sin error) cuando no hay permiso: se avisa.
    if (!isDemoMode && Array.isArray(data) && data.length === 0) {
      return 'No tienes permiso para eliminar esta recarga (las autorizadas solo las elimina un administrador).';
    }
    return null;
  } catch (e) {
    return mensajeError(e, 'No se pudo eliminar la recarga.');
  }
}

/**
 * Registro automático de un viaje "Recarga" del Tablero: se crea al ASIGNAR
 * (queda en Recargas → Por autorizar) y se actualiza la misma recarga al
 * LIQUIDAR (misma clave: ruta, fecha y número de despacho; nunca se duplica).
 * Si ya existe (por ejemplo, al corregir la tripulación con Modificar /
 * Reasignar) se actualiza la tripulación y se conservan el tipo y el
 * comentario que alguien haya puesto. Nunca muestra
 * errores: si algo falla, la recarga se puede registrar a mano.
 */
export async function registrarRecargaAuto(base: Omit<Recarga, 'tipo' | 'origen' | 'creadoEn'>): Promise<void> {
  try {
    let previa: Recarga | undefined;
    if (isDemoMode && demoGuardadas.has(base.id)) {
      previa = demoGuardadas.get(base.id);
    } else if (!isSupabaseConfigured || !supabase) {
      previa = leerLocal().find((x) => x.id === base.id);
    } else {
      const { data, error } = await supabase.from(TABLE).select('id, data').eq('id', base.id).limit(1);
      if (error) return; // tabla aún no creada u otro problema: se omite
      previa = (data?.[0] as { data?: Recarga } | undefined)?.data;
    }
    // Una recarga ya autorizada no se toca desde el Tablero (solo un
    // administrador la modifica, desde Recargas).
    if (previa && previa.estado === 'Autorizada') return;
    const ahora = new Date().toISOString();
    // Si cambió la tripulación de una recarga ya revisada, vuelve a quedar
    // Pendiente: el administrador debe autorizarla otra vez.
    const tripulacion = (x: { conductor?: string; auxiliares?: string[]; camionPlaca?: string }) =>
      [x.conductor || '', ...(x.auxiliares || []), x.camionPlaca || ''].join('|');
    const cambio = !!previa && tripulacion(previa) !== tripulacion(base);
    const r: Recarga = previa
      ? {
          ...previa,
          ...base,
          tipo: previa.tipo,
          comentario: previa.comentario,
          origen: previa.origen,
          creadoPor: previa.creadoPor,
          creadoEn: previa.creadoEn,
          editadoPor: base.creadoPor,
          editadoEn: ahora,
          ...(cambio ? { estado: 'Pendiente' as const, autorizadoPor: undefined, autorizadoEn: undefined, motivoRechazo: undefined } : {}),
        }
      : { ...base, tipo: 'Simple', origen: 'asignacion', creadoEn: ahora, estado: 'Pendiente' };
    await guardarRecarga(r);
  } catch {
    // Silencioso a propósito (ver comentario arriba).
  }
}

/** Cambios en vivo de otros usuarios. Devuelve la función para cancelar. */
export function suscribirRecargas(onChange: (updater: (prev: Recarga[]) => Recarga[]) => void): () => void {
  if (!isSupabaseConfigured || !supabase) return () => {};
  const channel = supabase
    .channel('app_recargas-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload: any) => {
      if (payload.eventType === 'DELETE') {
        const id = payload.old?.id;
        if (id) onChange((prev) => prev.filter((x) => x.id !== id));
        return;
      }
      const row = payload.new as { id?: string; data?: Recarga } | undefined;
      if (!row?.id || !row.data) return;
      const item = { ...row.data, id: row.id };
      onChange((prev) => {
        const i = prev.findIndex((x) => x.id === item.id);
        if (i === -1) return [...prev, item];
        const next = [...prev];
        next[i] = item;
        return next;
      });
    })
    .subscribe();
  return () => {
    supabase!.removeChannel(channel);
  };
}
