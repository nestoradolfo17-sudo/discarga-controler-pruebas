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
    return { ok: true, data: all };
  } catch (e) {
    return {
      ok: false,
      tablaFalta: esTablaFaltante(e),
      mensaje: String((e as { message?: string })?.message || e),
    };
  }
}

/** Crea o actualiza una recarga. Devuelve un mensaje de error o null si se guardó. */
export async function guardarRecarga(r: Recarga): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) {
    const list = leerLocal();
    const i = list.findIndex((x) => x.id === r.id);
    if (i === -1) list.push(r);
    else list[i] = r;
    escribirLocal(list);
    return null;
  }
  try {
    const { error } = await supabase
      .from(TABLE)
      .upsert([{ id: r.id, data: r, updated_at: new Date().toISOString() }], { onConflict: 'id' });
    if (error) throw error;
    return null;
  } catch (e) {
    if (esTablaFaltante(e)) return 'Falta crear la tabla de Recargas en la base de datos (supabase/fase8_recargas.sql).';
    const msg = String((e as { message?: string })?.message || '');
    if (msg.includes('RECARGA_')) return msg.replace(/^.*RECARGA_[A-Z_]+:\s*/, '');
    return String((e as { message?: string })?.message || 'No se pudo guardar la recarga.');
  }
}

/** Guarda varias recargas de una vez (autorización en bloque). */
export async function guardarRecargas(list: Recarga[]): Promise<string | null> {
  if (list.length === 0) return null;
  if (!isSupabaseConfigured || !supabase) {
    const all = leerLocal();
    list.forEach((r) => {
      const i = all.findIndex((x) => x.id === r.id);
      if (i === -1) all.push(r);
      else all[i] = r;
    });
    escribirLocal(all);
    return null;
  }
  try {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from(TABLE)
      .upsert(list.map((r) => ({ id: r.id, data: r, updated_at: now })), { onConflict: 'id' });
    if (error) throw error;
    return null;
  } catch (e) {
    const msg = String((e as { message?: string })?.message || '');
    if (msg.includes('RECARGA_')) return msg.replace(/^.*RECARGA_[A-Z_]+:\s*/, '');
    return msg || 'No se pudieron guardar las recargas.';
  }
}

export async function eliminarRecarga(id: string): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) {
    escribirLocal(leerLocal().filter((x) => x.id !== id));
    return null;
  }
  try {
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) throw error;
    return null;
  } catch (e) {
    return String((e as { message?: string })?.message || 'No se pudo eliminar la recarga.');
  }
}

/**
 * Registro automático al asignar una ruta como "Recarga" en el Tablero. Si ya
 * existe el registro de esa ruta y día (por ejemplo, al corregir la
 * tripulación con Modificar / Reasignar) se actualiza la tripulación y se
 * conservan el tipo y el comentario que alguien haya puesto. Nunca muestra
 * errores: si algo falla, la recarga se puede registrar a mano.
 */
export async function registrarRecargaAuto(base: Omit<Recarga, 'tipo' | 'origen' | 'creadoEn'>): Promise<void> {
  if (isDemoMode) return;
  try {
    let previa: Recarga | undefined;
    if (!isSupabaseConfigured || !supabase) {
      previa = leerLocal().find((x) => x.id === base.id);
    } else {
      const { data, error } = await supabase.from(TABLE).select('id, data').eq('id', base.id).limit(1);
      if (error) return; // tabla aún no creada u otro problema: se omite
      previa = (data?.[0] as { data?: Recarga } | undefined)?.data;
    }
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
