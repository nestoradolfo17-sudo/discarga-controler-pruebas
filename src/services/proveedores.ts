import { supabase } from './supabaseClient';
import { isDemoMode, isSoloConsulta } from './demoMode';
import { codigoAgencia } from '../data/agencies';

// --- Proveedores de camiones rentados (catálogo por agencia) e ID correlativo ---
// Ver supabase/fase15_proveedores_rentados.sql. El número del ID lo entrega la
// base de datos (función dc_siguiente_id_rentado), así nunca se repite aunque
// dos agencias registren camiones al mismo tiempo.
// En DEMO o sin base de datos se trabaja en memoria (nada se guarda).

export interface Proveedor {
  id: string;
  agencia: string;
  nombre: string;
  codigo: string;
}

const TABLA = 'app_proveedores';
const enMemoria = new Map<string, Proveedor[]>(); // DEMO / sin base: por agencia
const soloLocal = () => !supabase || isDemoMode || isSoloConsulta();

export const CODIGO_PROVEEDOR_RE = /^[A-Z0-9]{2,5}$/;

/** Sugiere un código corto a partir del nombre ("Transportes XYZ" → "TXY"). */
export function sugerirCodigo(nombre: string): string {
  const palabras = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((p) => p && !['DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'SA', 'S', 'A'].includes(p));
  if (palabras.length === 0) return '';
  if (palabras.length === 1) return palabras[0].slice(0, 3);
  return palabras
    .map((p) => p[0])
    .join('')
    .slice(0, 5)
    .padEnd(2, palabras[0][1] || 'X');
}

/** Vista previa del ID (el número real lo asigna la base al guardar). */
export const previaIdRentado = (codigo: string, agencia: string) => `R-${codigo}-${codigoAgencia(agencia)}-###`;

export async function listarProveedores(agencia: string): Promise<Proveedor[]> {
  const locales = enMemoria.get(agencia) || [];
  if (!supabase) return locales;
  const { data, error } = await supabase
    .from(TABLA)
    .select('id, agencia, nombre, codigo')
    .eq('agencia', agencia)
    .eq('activo', true)
    .order('nombre');
  if (error) {
    if (/app_proveedores|schema cache|does not exist/i.test(error.message)) {
      throw new Error('Falta correr en Supabase el script fase15_proveedores_rentados.sql.');
    }
    throw new Error(error.message);
  }
  const remotos = (data || []) as Proveedor[];
  // En DEMO se suman los agregados en esta sesión (no se guardan).
  return [...remotos, ...locales.filter((l) => !remotos.some((r) => r.codigo === l.codigo))];
}

export async function crearProveedor(agencia: string, nombre: string, codigo: string): Promise<Proveedor> {
  const cod = codigo.trim().toUpperCase();
  const nom = nombre.trim();
  if (nom.length < 2) throw new Error('Escribe el nombre del proveedor.');
  if (!CODIGO_PROVEEDOR_RE.test(cod)) throw new Error('El código debe tener de 2 a 5 letras o números, sin espacios.');
  if (soloLocal()) {
    const lista = enMemoria.get(agencia) || [];
    if (lista.some((p) => p.codigo === cod)) throw new Error(`Ya existe un proveedor con el código ${cod} en ${agencia}.`);
    const nuevo: Proveedor = { id: `local-${Date.now()}`, agencia, nombre: nom, codigo: cod };
    enMemoria.set(agencia, [...lista, nuevo]);
    return nuevo;
  }
  const { data, error } = await supabase!
    .from(TABLA)
    .insert({ agencia, nombre: nom, codigo: cod })
    .select('id, agencia, nombre, codigo')
    .single();
  if (error) {
    if (/app_proveedores_codigo_uq/i.test(error.message)) throw new Error(`Ya existe un proveedor con el código ${cod} en ${agencia}.`);
    if (/app_proveedores_nombre_uq/i.test(error.message)) throw new Error(`Ya existe el proveedor "${nom}" en ${agencia}.`);
    if (/row-level security/i.test(error.message)) throw new Error('Para agregar proveedores se necesita permiso de Camiones en esta agencia.');
    throw new Error(error.message);
  }
  return data as Proveedor;
}

/**
 * Siguiente ID para un camión rentado (R-TRX-XEL-001). En DEMO / sin base se
 * calcula con los IDs que ya están en pantalla (no se guarda nada).
 */
export async function siguienteIdRentado(agencia: string, codigo: string, idsExistentes: string[]): Promise<string> {
  const cod = codigo.trim().toUpperCase();
  const prefijo = `R-${cod}-${codigoAgencia(agencia)}-`;
  const local = () => {
    const max = idsExistentes
      .filter((id) => id.startsWith(prefijo))
      .map((id) => parseInt(id.slice(prefijo.length), 10) || 0)
      .reduce((a, b) => Math.max(a, b), 0);
    return `${prefijo}${String(max + 1).padStart(3, '0')}`;
  };
  if (soloLocal()) return local();
  const { data, error } = await supabase!.rpc('dc_siguiente_id_rentado', { p_agencia: agencia, p_codigo: cod });
  if (error) {
    if (/dc_siguiente_id_rentado|schema cache|does not exist/i.test(error.message)) {
      throw new Error('Falta correr en Supabase el script fase15_proveedores_rentados.sql.');
    }
    throw new Error(error.message.replace(/^.*?(NO_AUTORIZADO|PROVEEDOR_NO_EXISTE):\s*/, ''));
  }
  if (!data || typeof data !== 'string') throw new Error('La base no devolvió el ID. Intenta de nuevo.');
  return data;
}
