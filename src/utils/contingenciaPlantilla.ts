import { Truck, Staff } from '../types';
import { loadXLSX } from './excel';

// --- Descarga de los formatos de contingencia con listas de la app ---
// El formato de Asignación trae una hoja "Recursos" vacía y listas
// desplegables (▼) en Camión, Piloto y Auxiliares que apuntan a ella. Al
// descargarlo desde la app se llena esa hoja con los camiones y el personal
// ACTIVOS (los mismos que ofrece el tablero al asignar), sin tocar el resto del
// archivo: se edita solo el XML de esa hoja dentro del .xlsx, así se conservan
// las listas, colores y validaciones que la librería de Excel no sabe escribir.

export const PLANTILLA_URL = {
  asignacion: '/plantillas/Contingencia_Asignacion.xlsx',
  liquidacion: '/plantillas/Contingencia_Liquidacion.xlsx',
} as const;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const isPilot = (s: Staff) => s.puesto === 'VPP' || s.puesto === 'VPPB' || s.rol === 'Conductor';
const activo = (s: Staff) => s.estado !== 'Baja' && s.estatus !== 'BAJA';

/** Texto con el que aparece un camión en la lista (y que la carga reconoce). */
export const etiquetaCamion = (t: Truck) => (t.idCamion ? `${t.idCamion} - ${t.placa}` : t.placa);

export function listasRecursos(trucks: Truck[], staff: Staff[], agencia?: string) {
  const enAgencia = (ag?: string) => !agencia || agencia === 'TODAS' || ag === agencia;
  const uniq = (arr: string[]) => Array.from(new Set(arr.map((x) => x.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'));
  return {
    camiones: uniq(trucks.filter((t) => t.estado !== 'Baja' && enAgencia(t.agencia)).map(etiquetaCamion)),
    pilotos: uniq(staff.filter((s) => activo(s) && isPilot(s) && enAgencia(s.agencia)).map((s) => s.nombre)),
    personal: uniq(staff.filter((s) => activo(s) && enAgencia(s.agencia)).map((s) => s.nombre)),
  };
}

const guardar = (data: Uint8Array, nombre: string) => {
  const blob = new Blob([data as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

/** Inserta las listas en la hoja "Recursos" del .xlsx (devuelve el archivo nuevo). */
export async function llenarRecursos(
  plantilla: Uint8Array,
  listas: { camiones: string[]; pilotos: string[]; personal: string[] }
): Promise<Uint8Array> {
  const XLSX = await loadXLSX();
  const CFB = (XLSX as unknown as { CFB: any }).CFB;
  const cfb = CFB.read(plantilla, { type: 'array' });
  const dec = new TextDecoder('utf-8');
  const enc = new TextEncoder();
  const idxDe = (ruta: string) =>
    cfb.FullPaths.findIndex((p: string) => p.replace(/^Root Entry\//, '').replace(/^\//, '') === ruta.replace(/^\//, ''));
  const leer = (ruta: string) => {
    const i = idxDe(ruta);
    return i >= 0 ? dec.decode(cfb.FileIndex[i].content) : '';
  };

  // Ubica la hoja "Recursos" por su nombre (workbook.xml → relación → archivo).
  const wbXml = leer('xl/workbook.xml');
  const rid = (/<sheet\b[^>]*name="Recursos"[^>]*r:id="([^"]+)"/.exec(wbXml) || /<sheet\b[^>]*r:id="([^"]+)"[^>]*name="Recursos"/.exec(wbXml) || [])[1];
  const rels = leer('xl/_rels/workbook.xml.rels');
  const relTag = rid ? (rels.match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*>`)) || [])[0] : '';
  let target = (/Target="([^"]+)"/.exec(relTag || '') || [])[1] || '';
  if (!target) throw new Error('El formato no tiene la hoja "Recursos".');
  target = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const i = idxDe(target);
  if (i < 0) throw new Error('No se encontró la hoja "Recursos" dentro del archivo.');

  const cols: [string, string[]][] = [
    ['A', listas.camiones],
    ['B', listas.pilotos],
    ['C', listas.personal],
  ];
  const n = Math.max(0, ...cols.map(([, l]) => l.length));
  let filas = '';
  for (let r = 0; r < n; r++) {
    const fila = r + 2;
    const celdas = cols
      .filter(([, l]) => l[r])
      .map(([c, l]) => `<c r="${c}${fila}" t="inlineStr"><is><t>${esc(l[r])}</t></is></c>`)
      .join('');
    filas += `<row r="${fila}">${celdas}</row>`;
  }
  let xml = dec.decode(cfb.FileIndex[i].content);
  if (/<sheetData\s*\/>/.test(xml)) xml = xml.replace(/<sheetData\s*\/>/, `<sheetData>${filas}</sheetData>`);
  else xml = xml.replace('</sheetData>', `${filas}</sheetData>`);
  xml = xml.replace(/<dimension ref="[^"]*"\s*\/>/, `<dimension ref="A1:E${Math.max(1, n + 1)}"/>`);
  const nuevo = enc.encode(xml);
  cfb.FileIndex[i].content = nuevo;
  cfb.FileIndex[i].size = nuevo.length;
  const out = CFB.write(cfb, { fileType: 'zip', type: 'array', compression: true });
  return out instanceof Uint8Array ? out : new Uint8Array(out);
}

/**
 * Descarga el formato. En Asignación agrega los camiones y el personal activos
 * (de la agencia elegida o de todas). Si algo falla, descarga el formato base.
 */
export async function descargarPlantillaContingencia(
  tipo: 'asignacion' | 'liquidacion',
  datos?: { trucks: Truck[]; staff: Staff[]; agencia?: string }
): Promise<{ ok: boolean; conRecursos: boolean; error?: string }> {
  const url = PLANTILLA_URL[tipo];
  const nombre = url.split('/').pop() || 'Contingencia.xlsx';
  const resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) return { ok: false, conRecursos: false, error: `No se pudo descargar el formato (${resp.status}).` };
  const base = new Uint8Array(await resp.arrayBuffer());
  if (tipo !== 'asignacion' || !datos) {
    guardar(base, nombre);
    return { ok: true, conRecursos: false };
  }
  try {
    const listas = listasRecursos(datos.trucks, datos.staff, datos.agencia);
    const out = await llenarRecursos(base, listas);
    const sufijo = datos.agencia && datos.agencia !== 'TODAS' ? `_${datos.agencia.replace(/\s+/g, '_')}` : '';
    guardar(out, nombre.replace('.xlsx', `${sufijo}.xlsx`));
    return { ok: true, conRecursos: true };
  } catch (e) {
    guardar(base, nombre);
    return { ok: true, conRecursos: false, error: String((e as Error)?.message || e) };
  }
}
