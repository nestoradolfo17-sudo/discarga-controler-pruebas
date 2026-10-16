import { supabase, isSupabaseConfigured } from './supabaseClient';
import { isDemoMode } from './demoMode';
import type { Prestamo } from '../types';

// --- Préstamos de personal y camiones: lectura y guardado ---
// Tabla compartida "app_prestamos" (id + data jsonb), igual que Recargas. Sin
// Supabase (modo local) se guardan en este navegador. Si la tabla aún no
// existe (no se ha corrido supabase/fase9_prestamos.sql) la app sigue igual que
// antes: simplemente no hay préstamos.

const TABLE = 'app_prestamos';
const STORAGE_KEY = 'rutamaster_prestamos_v1';
const PAGE = 1000;

export type LecturaPrestamos = { ok: true; data: Prestamo[] } | { ok: false; tablaFalta: boolean; mensaje: string };

const esTablaFaltante = (e: unknown) => {
  const err = e as { code?: string; message?: string } | null;
  const msg = String(err?.message || '');
  return err?.code === '42P01' || err?.code === 'PGRST205' || /could not find the table|does not exist/i.test(msg);
};

const mensajeError = (e: unknown, def: string) => {
  if (esTablaFaltante(e)) return 'Falta crear la tabla de Préstamos en la base de datos (supabase/fase9_prestamos.sql).';
  const msg = String((e as { message?: string })?.message || '');
  if (msg.includes('PRESTAMO_')) return msg.replace(/^.*PRESTAMO_[A-Z_]+:\s*/, '');
  return msg || def;
};

const leerLocal = (): Prestamo[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};
const escribirLocal = (list: Prestamo[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // modo local de pruebas: se ignora
  }
};

export const nuevoIdPrestamo = () => `PR-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export async function leerPrestamos(): Promise<LecturaPrestamos> {
  if (!isSupabaseConfigured || !supabase) return { ok: true, data: leerLocal() };
  try {
    const all: Prestamo[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from(TABLE)
        .select('id, data')
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = (data || []) as { id: string; data: Prestamo }[];
      rows.forEach((r) => r.data && all.push({ ...r.data, id: r.id }));
      if (rows.length < PAGE) break;
    }
    return { ok: true, data: all };
  } catch (e) {
    return { ok: false, tablaFalta: esTablaFaltante(e), mensaje: String((e as { message?: string })?.message || e) };
  }
}

/** Crea o actualiza préstamos; devuelve cómo quedaron guardados (con su correlativo). */
export async function guardarPrestamos(list: Prestamo[]): Promise<{ error: string | null; guardados: Prestamo[] }> {
  if (list.length === 0) return { error: null, guardados: [] };
  if (!isSupabaseConfigured || !supabase) {
    const all = leerLocal();
    let max = all.reduce((m, x) => Math.max(m, x.correlativo || 0), 0);
    const guardados = list.map((p) => {
      const previo = all.find((x) => x.id === p.id);
      const g = { ...p, correlativo: previo?.correlativo || p.correlativo || ++max };
      const i = all.findIndex((x) => x.id === p.id);
      if (i === -1) all.push(g);
      else all[i] = g;
      return g;
    });
    escribirLocal(all);
    return { error: null, guardados };
  }
  try {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from(TABLE)
      .upsert(list.map((p) => ({ id: p.id, data: p, updated_at: now })), { onConflict: 'id' })
      .select('id, data');
    if (error) throw error;
    const rows = (Array.isArray(data) ? data : []) as { id: string; data: Prestamo }[];
    const byId = new Map(rows.map((x) => [x.id, { ...x.data, id: x.id }]));
    return { error: null, guardados: list.map((p) => byId.get(p.id) || p) };
  } catch (e) {
    return { error: mensajeError(e, 'No se pudo guardar el préstamo.'), guardados: [] };
  }
}

export async function eliminarPrestamo(id: string): Promise<string | null> {
  if (!isSupabaseConfigured || !supabase) {
    escribirLocal(leerLocal().filter((x) => x.id !== id));
    return null;
  }
  try {
    const { data, error } = await supabase.from(TABLE).delete().eq('id', id).select('id');
    if (error) throw error;
    if (!isDemoMode && Array.isArray(data) && data.length === 0) {
      return 'No tienes permiso para eliminar este préstamo (los autorizados solo los elimina un administrador).';
    }
    return null;
  } catch (e) {
    return mensajeError(e, 'No se pudo eliminar el préstamo.');
  }
}

export function suscribirPrestamos(onChange: (updater: (prev: Prestamo[]) => Prestamo[]) => void): () => void {
  if (!isSupabaseConfigured || !supabase) return () => {};
  const channel = supabase
    .channel('app_prestamos-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload: any) => {
      if (payload.eventType === 'DELETE') {
        const id = payload.old?.id;
        if (id) onChange((prev) => prev.filter((x) => x.id !== id));
        return;
      }
      const row = payload.new as { id?: string; data?: Prestamo } | undefined;
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
