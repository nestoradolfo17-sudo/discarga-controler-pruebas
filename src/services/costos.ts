import { supabase } from './supabaseClient';
import { isDemoMode, isSoloConsulta } from './demoMode';
import type { Tarifario, StandbyDia } from '../utils/costos';

// --- Costos: tarifario mensual, costos manuales y fotos diarias de standby ---
// Ver supabase/fase16_costos.sql.
//  • app_costos: tarifario de cada mes y costos asignados a mano (camiones
//    rentados). Solo administradores pueden verla y cambiarla.
//  • app_standby_dia: una fila por día y agencia con los camiones y el personal
//    que no salieron y su motivo. La escribe la app sola mientras se trabaja.
// En DEMO, usuario de solo consulta o sin base de datos se guarda solo en este
// navegador (para poder probar sin tocar los datos reales).

const T_COSTOS = 'app_costos';
const T_STANDBY = 'app_standby_dia';
const soloLocal = () => !supabase || isDemoMode || isSoloConsulta();
const FALTA_SQL = 'Falta correr en Supabase el script fase16_costos.sql.';
const faltaTabla = (m: string) => /app_costos|app_standby_dia|schema cache|does not exist/i.test(m);

// ---------- almacenamiento local (DEMO / sin base) ----------
const leerLocal = <T,>(k: string, def: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : def;
  } catch {
    return def;
  }
};
const guardarLocal = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* sin almacenamiento */
  }
};
const K_TARIF = 'dc_costos_tarifarios';
const K_MANUAL = 'dc_costos_manual';
const K_STANDBY = 'dc_standby_dia';

const isoDeDia = (dia: string) => `${dia.slice(6, 10)}-${dia.slice(3, 5)}-${dia.slice(0, 2)}`;
const diaDeIso = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

// ---------- Tarifarios ----------
export async function cargarTarifarios(): Promise<Map<string, Tarifario>> {
  if (soloLocal()) return new Map(Object.entries(leerLocal<Record<string, Tarifario>>(K_TARIF, {})));
  const { data, error } = await supabase!.from(T_COSTOS).select('id, data').eq('tipo', 'tarifario');
  if (error) throw new Error(faltaTabla(error.message) ? FALTA_SQL : error.message);
  const m = new Map<string, Tarifario>();
  (data || []).forEach((row: { data: Tarifario }) => row.data?.mes && m.set(row.data.mes, row.data));
  return m;
}

export async function guardarTarifario(t: Tarifario, usuario: string): Promise<Tarifario> {
  const fila: Tarifario = { ...t, actualizadoPor: usuario, actualizadoEl: new Date().toISOString() };
  if (soloLocal()) {
    const todo = leerLocal<Record<string, Tarifario>>(K_TARIF, {});
    todo[t.mes] = fila;
    guardarLocal(K_TARIF, todo);
    return fila;
  }
  const { error } = await supabase!
    .from(T_COSTOS)
    .upsert({ id: `tarifario:${t.mes}`, tipo: 'tarifario', mes: t.mes, data: fila, actualizado_por: usuario, actualizado_el: fila.actualizadoEl }, { onConflict: 'id' });
  if (error) {
    if (/row-level security/i.test(error.message)) throw new Error('Solo un administrador puede cambiar el tarifario.');
    throw new Error(faltaTabla(error.message) ? FALTA_SQL : error.message);
  }
  return fila;
}

// ---------- Costos asignados a mano (camiones rentados) ----------
export async function cargarManuales(mes: string): Promise<Map<string, number>> {
  if (soloLocal()) {
    const todo = leerLocal<Record<string, { mes: string; monto: number }>>(K_MANUAL, {});
    return new Map(Object.entries(todo).filter(([, v]) => v.mes === mes).map(([k, v]) => [k, v.monto]));
  }
  const { data, error } = await supabase!.from(T_COSTOS).select('id, data').eq('tipo', 'manual').eq('mes', mes);
  if (error) throw new Error(faltaTabla(error.message) ? FALTA_SQL : error.message);
  const m = new Map<string, number>();
  (data || []).forEach((row: { id: string; data: { monto?: number } }) => {
    if (typeof row.data?.monto === 'number') m.set(row.id.replace(/^manual:/, ''), row.data.monto);
  });
  return m;
}

/** monto null = quitar el valor asignado. */
export async function guardarManual(salidaId: string, mes: string, monto: number | null, usuario: string): Promise<void> {
  if (soloLocal()) {
    const todo = leerLocal<Record<string, { mes: string; monto: number }>>(K_MANUAL, {});
    if (monto == null) delete todo[salidaId];
    else todo[salidaId] = { mes, monto };
    guardarLocal(K_MANUAL, todo);
    return;
  }
  const id = `manual:${salidaId}`;
  const { error } =
    monto == null
      ? await supabase!.from(T_COSTOS).delete().eq('id', id)
      : await supabase!
          .from(T_COSTOS)
          .upsert({ id, tipo: 'manual', mes, data: { monto, por: usuario, el: new Date().toISOString() }, actualizado_por: usuario, actualizado_el: new Date().toISOString() }, { onConflict: 'id' });
  if (error) {
    if (/row-level security/i.test(error.message)) throw new Error('Solo un administrador puede asignar costos.');
    throw new Error(faltaTabla(error.message) ? FALTA_SQL : error.message);
  }
}

// ---------- Fotos diarias de standby ----------
export async function cargarStandby(mes: string): Promise<StandbyDia[]> {
  if (soloLocal()) {
    const todo = leerLocal<Record<string, StandbyDia>>(K_STANDBY, {});
    return Object.values(todo).filter((d) => `${d.fecha.slice(6, 10)}-${d.fecha.slice(3, 5)}` === mes);
  }
  const [y, m] = mes.split('-').map(Number);
  const desde = `${mes}-01`;
  const hasta = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-01`;
  const out: StandbyDia[] = [];
  for (let desdeFila = 0; ; desdeFila += 1000) {
    const { data, error } = await supabase!
      .from(T_STANDBY)
      .select('fecha, agencia, data')
      .gte('fecha', desde)
      .lt('fecha', hasta)
      .range(desdeFila, desdeFila + 999);
    if (error) throw new Error(faltaTabla(error.message) ? FALTA_SQL : error.message);
    (data || []).forEach((row: { fecha: string; agencia: string; data: StandbyDia }) =>
      out.push({ ...row.data, fecha: diaDeIso(row.fecha), agencia: row.agencia })
    );
    if (!data || data.length < 1000) break;
  }
  return out;
}

// Última versión enviada de cada fila (para no reenviar lo que no cambió).
const enviado = new Map<string, string>();

/** Guarda (si cambió) la foto del día por agencia. No lanza errores: es un registro de fondo. */
export async function guardarStandbyDia(filas: StandbyDia[], usuario: string): Promise<void> {
  const cambios = filas.filter((f) => {
    const firma = JSON.stringify([f.camiones, f.personal]);
    const id = `${isoDeDia(f.fecha)}|${f.agencia}`;
    if (enviado.get(id) === firma) return false;
    enviado.set(id, firma);
    return true;
  });
  if (!cambios.length) return;
  const ahora = new Date().toISOString();
  if (soloLocal()) {
    const todo = leerLocal<Record<string, StandbyDia>>(K_STANDBY, {});
    cambios.forEach((f) => (todo[`${isoDeDia(f.fecha)}|${f.agencia}`] = { ...f, actualizado: ahora }));
    guardarLocal(K_STANDBY, todo);
    return;
  }
  const { error } = await supabase!.from(T_STANDBY).upsert(
    cambios.map((f) => ({
      id: `${isoDeDia(f.fecha)}|${f.agencia}`,
      fecha: isoDeDia(f.fecha),
      agencia: f.agencia,
      data: { ...f, actualizado: ahora },
      actualizado_por: usuario,
      actualizado_el: ahora,
    })),
    { onConflict: 'id' }
  );
  if (error) {
    // Si falla (sin conexión, falta el script), se reintenta en el próximo cambio.
    cambios.forEach((f) => enviado.delete(`${isoDeDia(f.fecha)}|${f.agencia}`));
    if (!faltaTabla(error.message)) console.warn('Standby del día no guardado:', error.message);
  }
}
