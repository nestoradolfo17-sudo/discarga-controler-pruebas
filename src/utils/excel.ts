import * as XLSX from 'xlsx';
import { Route, Staff, StaffPuesto, ResourceStatus, StaffEstatus, Truck, RouteClientEntry } from '../types';
import { formatDateToSpanish, formatDateToGuatemala, formatDateTimeToGuatemala, getGuatemalaDateForInput, parseFlexibleDate } from './date';
import { AGENCIA_LOCATION_OPTIONS } from '../data/agencies';

// Corrección: las cargas masivas de Excel (Personal, Camiones, Rutas) descartaban
// filas silenciosamente cuando les faltaba un dato clave (nombre, placa, ID de
// ruta, etc.) sin informar nada al usuario — parecía que "se importó todo" aunque
// algunas filas del archivo nunca llegaran al sistema. Los parsers ahora además
// devuelven un pequeño reporte (filas leídas / importadas / descartadas, con
// motivo) adjunto como propiedad del arreglo resultante — el arreglo en sí no
// cambia en nada, así que cualquier código existente que solo use el arreglo
// (mapearlo, medir su .length, etc.) sigue funcionando exactamente igual.
export interface ImportReport {
  totalRows: number;
  imported: number;
  discarded: number;
  discardedReasons: { reason: string; count: number }[];
}
export type WithImportReport<T> = T[] & { importReport?: ImportReport };

function buildImportReport(totalRows: number, imported: number, discardedByReason: Map<string, number>): ImportReport {
  const discardedReasons = Array.from(discardedByReason.entries()).map(([reason, count]) => ({ reason, count }));
  const discarded = discardedReasons.reduce((acc, r) => acc + r.count, 0);
  return { totalRows, imported, discarded, discardedReasons };
}

// Normaliza un texto de agencia leído de Excel contra la lista oficial de
// agencias (ignorando mayúsculas/acentos/espacios). Si coincide con una
// agencia oficial devuelve el nombre oficial (con su ortografía correcta);
// si no coincide con ninguna, devuelve el texto tal cual se recibió (para no
// perder información) y en caso de estar vacío devuelve el valor por defecto.
export function normalizeAgencia(raw: string, defaultAgencia?: string): string {
  const clean = (s: string) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  const rawClean = clean(raw);
  if (!rawClean) return defaultAgencia || '';
  const match = AGENCIA_LOCATION_OPTIONS.find((ag) => clean(ag) === rawClean);
  return match || raw.trim();
}

export function downloadExcelTemplate() {
  const templateData = [
    ["Agencia", "Segmento", "Fecha", "ID de ruta", "Viaje", "Servicio", "Descanso", "Total", "Distancia", "Paradas", "Equipo Frio", "% de capacidad", "Cajas 12 Oz", "Peso", "Cajas Fisicas"],
    ["Mercado Abierto", "Mayoreo", "31/07/2026", "102201", "01:29", "08:12", "00:45", "10:27", 16.8, 63, 53, "102.49 %", 348.3, 4478.203, 384.336],
    ["Mercado Abierto", "Detalle", "03/01/2026", "102202", "02:02", "08:57", "00:45", "11:44", 31.46, 74, 61, "106.26 %", 358.208, 4748.406, 398.482]
  ];

  const ws = XLSX.utils.aoa_to_sheet(templateData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Base_Rutas");
  XLSX.writeFile(wb, "Plantilla_Rutas_Logistica.xlsx");
}

export function cleanHeaderStr(val: any): string {
  return String(val || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getFormattedCellValue(cell: any, colType: string): string {
  if (!cell) return '';

  const rawVal = cell.v;
  const textVal = cell.w !== undefined && cell.w !== null ? String(cell.w).trim() : '';

  if (colType === 'ruta') {
    if (typeof rawVal === 'number') return String(Math.round(rawVal));
    let str = textVal || String(rawVal || '');
    if (/^\d+\.0+$/.test(str)) str = str.replace(/\.0+$/, '');
    return str.trim();
  }

  if (colType === 'time') {
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(textVal)) {
      return textVal.length > 5 ? textVal.slice(0, 5) : textVal;
    }
    if (typeof rawVal === 'number' && rawVal >= 0 && rawVal < 2) {
      const totalMinutes = Math.round(rawVal * 24 * 60);
      const hours = Math.floor(totalMinutes / 60);
      const mins = totalMinutes % 60;
      return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    }
    if (textVal) return textVal;
    return rawVal !== undefined && rawVal !== null ? String(rawVal) : '';
  }

  if (colType === 'date') {
    if (rawVal instanceof Date && !isNaN(rawVal.getTime())) return formatDateToGuatemala(rawVal);
    if (typeof rawVal === 'number' && rawVal > 25000 && rawVal < 70000) {
      const jsDate = new Date(Math.round((rawVal - 25569) * 86400 * 1000));
      const localDate = new Date(jsDate.getTime() + jsDate.getTimezoneOffset() * 60000);
      return formatDateToGuatemala(localDate);
    }
    if (textVal && !textVal.startsWith('#')) {
      const parsed = parseFlexibleDate(textVal);
      if (parsed) return formatDateToGuatemala(parsed);
      return textVal;
    }
    if (rawVal !== undefined && rawVal !== null) {
      const parsed = parseFlexibleDate(rawVal);
      if (parsed) return formatDateToGuatemala(parsed);
      return String(rawVal);
    }
    return '';
  }

  if (colType === 'percent') {
    if (textVal && textVal.includes('%')) return textVal;
    if (typeof rawVal === 'number') {
      const val = rawVal <= 2.5 ? rawVal * 100 : rawVal;
      return `${val.toFixed(2)} %`;
    }
    if (textVal) return textVal;
    return rawVal !== undefined ? String(rawVal) : '';
  }

  if (textVal && !textVal.startsWith('#')) return textVal;
  if (rawVal !== undefined && rawVal !== null) return String(rawVal).trim();
  return '';
}

export function scoreSheetForRoutes(ws: XLSX.WorkSheet): number {
  if (!ws['!ref']) return 0;
  const range = XLSX.utils.decode_range(ws['!ref']);
  let maxRowScore = 0;

  for (let r = range.s.r; r <= Math.min(range.s.r + 35, range.e.r); r++) {
    let rowScore = 0;
    let isPivotTable = false;

    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: r, c: c })];
      if (!cell) continue; // Si la celda está en blanco, ignorar
      const rawText = cell.w || cell.v || '';
      if (!rawText || String(rawText).trim() === '') continue; // Columna en blanco, ignorar

      const txt = cleanHeaderStr(rawText);
      if (!txt) continue;

      if (txt.includes('etiquetas de fila') || txt.includes('tabla dinamica') || txt.includes('total general')) {
        isPivotTable = true;
      }

      if (txt.includes('id de ruta') || txt === 'ruta' || txt === 'id ruta' || txt === 'id') rowScore += 4;
      else if (txt.includes('cajas fisic') || txt === 'cajas fisicas' || txt === 'cajas') rowScore += 3;
      else if (txt.includes('agencia') || txt.includes('sucursal')) rowScore += 2;
      else if (txt.includes('parada')) rowScore += 2;
      else if (txt.includes('equipo frio') || txt.includes('frio')) rowScore += 2;
      else if (txt.includes('fecha')) rowScore += 2;
      else if (txt.includes('capacidad')) rowScore += 1;
      else if (txt.includes('peso')) rowScore += 1;
    }

    if (isPivotTable) rowScore = 0;
    if (rowScore > maxRowScore) maxRowScore = rowScore;
  }

  return maxRowScore;
}

// Corrección: los reportes tipo ROADNET/UPS Logistics (mismo formato que
// "Resumen N") no traen columna de Fecha por fila — solo un texto suelto
// "Fecha de entrega: <día completo>" en algún lugar del encabezado de la hoja.
// Antes, al no encontrar columna de fecha, cada ruta importada se quedaba con
// la fecha de HOY (el día en que se hace el import), lo cual está mal y
// además rompía el emparejamiento con el detalle de clientes. El día exacto de
// ese texto tampoco es 100% confiable (a veces difiere en un día del número
// real de la pestaña — ver "Fecha de entrega" vs. número de pestaña, corregido
// por el usuario), así que de aquí solo se toma el MES y AÑO (esos sí son
// consistentes); el día real se toma del número de la pestaña en
// BatchImportView, no de este texto.
export function extractFechaEntregaMonthYear(ws: XLSX.WorkSheet): { month: number; year: number } | null {
  if (!ws['!ref']) return null;
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let r = range.s.r; r <= Math.min(range.s.r + 20, range.e.r); r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      const raw = cell.w || cell.v;
      if (raw === undefined || raw === null) continue;
      const text = String(raw);
      if (!cleanHeaderStr(text).includes('fecha de entrega')) continue;
      const parsed = parseFlexibleDate(text);
      if (parsed && !isNaN(parsed.getTime())) {
        return { month: parsed.getMonth() + 1, year: parsed.getFullYear() };
      }
    }
  }
  return null;
}

export function parseRoutesFromSheet(ws: XLSX.WorkSheet, dateOverride?: string): WithImportReport<Route> {
  if (!ws['!ref']) return [];

  const range = XLSX.utils.decode_range(ws['!ref']);
  let headerRowIndex = -1;
  const colMap: Record<string, number> = {};

  // Escanear las primeras 35 filas para ubicar la fila de encabezados estándar
  for (let r = range.s.r; r <= Math.min(range.s.r + 35, range.e.r); r++) {
    const rowHeaders: Array<{ c: number; text: string }> = [];
    let isPivotRow = false;

    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: r, c: c })];
      if (!cell) continue; // Columna en blanco / vacía: no se toma en cuenta
      const rawText = cell.w || cell.v;
      if (rawText === undefined || rawText === null || String(rawText).trim() === '') {
        continue; // Celda sin contenido: columna en blanco ignorada
      }

      const txt = cleanHeaderStr(rawText);
      if (!txt) continue; // Texto vacío después de normalizar: columna en blanco ignorada

      if (txt.includes('etiquetas de fila') || txt.includes('tabla dinamica')) {
        isPivotRow = true;
      }

      rowHeaders.push({ c, text: txt });
    }

    if (isPivotRow) continue;

    const hasRuta = rowHeaders.some(
      h => h.text.includes('id de ruta') || h.text === 'id' || h.text === 'ruta' || h.text === 'id ruta' || h.text === 'cod ruta'
    );
    const hasAgencia = rowHeaders.some(h => h.text.includes('agencia') || h.text.includes('sucursal'));
    const hasCajas = rowHeaders.some(h => h.text.includes('caja') || h.text.includes('fisic'));

    if ((hasRuta && hasAgencia) || (hasRuta && hasCajas) || (hasAgencia && hasCajas)) {
      headerRowIndex = r;

      // Mapear estrictamente las columnas estándar de siempre ignorando columnas en blanco
      rowHeaders.forEach(item => {
        const h = item.text;
        const c = item.c;

        // 1. ID de Ruta
        if (
          h.includes('id de ruta') ||
          h.includes('id ruta') ||
          h === 'ruta' ||
          h === 'cod ruta' ||
          h === 'codigo ruta' ||
          h === 'id' ||
          (h.includes('ruta') && !h.includes('total') && !h.includes('tipo'))
        ) {
          if (colMap.ruta === undefined) colMap.ruta = c;
        }
        // 2. Agencia / Sucursal
        else if (h.includes('agencia') || h.includes('sucursal') || h === 'sede') {
          if (colMap.agencia === undefined) colMap.agencia = c;
        }
        // 3. Mercado / Canal
        else if (h.includes('mercado') || h.includes('canal')) {
          if (colMap.mercado === undefined) colMap.mercado = c;
        }
        // 3b. Segmento
        else if (h.includes('segmento')) {
          if (colMap.segmento === undefined) colMap.segmento = c;
        }
        // 4. Fecha de Ruta
        else if (h.includes('fecha') || h === 'dia' || h === 'date') {
          if (colMap.fecha === undefined) colMap.fecha = c;
        }
        // 5. Viaje
        else if (h === 'viaje' || h.includes('tiempo viaje') || h.includes('viaje')) {
          if (colMap.viaje === undefined) colMap.viaje = c;
        }
        // 6. Servicio
        else if (h === 'servicio' || h.includes('tiempo servicio') || h.includes('servicio')) {
          if (colMap.servicio === undefined) colMap.servicio = c;
        }
        // 7. Descanso
        else if (h === 'descanso' || h.includes('almuerzo') || h.includes('descanso')) {
          if (colMap.descanso === undefined) colMap.descanso = c;
        }
        // 8. Total (Tiempo total) - cuidando que no sea total cajas o total general
        else if (
          (h === 'total' || h.includes('tiempo total') || h.includes('total tiempo') || h.includes('total')) &&
          !h.includes('caja') &&
          !h.includes('peso') &&
          !h.includes('general')
        ) {
          if (colMap.total === undefined) colMap.total = c;
        }
        // 9. Distancia
        else if (h.includes('distancia') || h.includes('km') || h.includes('kilometros')) {
          if (colMap.distancia === undefined) colMap.distancia = c;
        }
        // 10. Paradas
        else if (h.includes('parada') || h.includes('cliente') || h.includes('visita')) {
          if (colMap.paradas === undefined) colMap.paradas = c;
        }
        // 11. Equipo Frío
        else if (h.includes('frio') || h.includes('equipo frio') || h.includes('congelador') || h.includes('nevera')) {
          if (colMap.equipoFrio === undefined) colMap.equipoFrio = c;
        }
        // 12. % Capacidad
        else if (h.includes('capacidad') || h.includes('%') || h.includes('ocupacion')) {
          if (colMap.capacidad === undefined) colMap.capacidad = c;
        }
        // 13. Cajas 12 Oz
        else if (h.includes('12') || h.includes('12 o') || h.includes('12oz')) {
          if (colMap.cajas12Oz === undefined) colMap.cajas12Oz = c;
        }
        // 14. Peso
        else if (h.includes('peso') || h === 'kg' || h.includes('peso kg')) {
          if (colMap.peso === undefined) colMap.peso = c;
        }
        // 15. Cajas Físicas
        else if (
          h.includes('fisic') ||
          h.includes('cajas fisicas') ||
          (h.includes('caja') && !h.includes('12')) ||
          h.includes('bultos')
        ) {
          if (colMap.cajasFisicas === undefined) colMap.cajasFisicas = c;
        }
      });
      break;
    }
  }

  if (headerRowIndex === -1 || colMap.ruta === undefined) {
    return [];
  }

  const results: WithImportReport<Route> = [];
  const discardedByReason = new Map<string, number>();
  let totalRows = 0;

  for (let r = headerRowIndex + 1; r <= range.e.r; r++) {
    // Si la fila entera está completamente vacía, omitir
    let hasAnyCell = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cCell = ws[XLSX.utils.encode_cell({ r: r, c: c })];
      if (cCell && cCell.v !== undefined && cCell.v !== null && String(cCell.v).trim() !== '') {
        hasAnyCell = true;
        break;
      }
    }
    if (!hasAnyCell) continue; // fila completamente vacía: no cuenta ni como leída

    totalRows++;

    const getVal = (colIdx: number | undefined, type: string) => {
      if (colIdx === undefined || colIdx === null || colIdx < 0) return '';
      const cell = ws[XLSX.utils.encode_cell({ r: r, c: colIdx })];
      return getFormattedCellValue(cell, type);
    };

    const idVal = getVal(colMap.ruta, 'ruta');
    const idCheck = idVal.toLowerCase().trim();

    if (!idVal || idCheck === '' || idCheck === '-') {
      discardedByReason.set('Falta el ID de ruta', (discardedByReason.get('Falta el ID de ruta') || 0) + 1);
      continue;
    }
    if (
      idCheck.includes('etiquetas') ||
      idCheck.includes('fila') ||
      idCheck.includes(' a ') ||
      idCheck.includes('mayor o igual') ||
      idCheck === 'id de ruta' ||
      idCheck === 'ruta'
    ) {
      discardedByReason.set('Fila de encabezado / tabla dinámica', (discardedByReason.get('Fila de encabezado / tabla dinámica') || 0) + 1);
      continue;
    }
    if (
      idCheck.includes('total') ||
      idCheck.includes('promedio') ||
      idCheck.includes('subtotal') ||
      idCheck.includes('suma')
    ) {
      discardedByReason.set('Fila de total / subtotal', (discardedByReason.get('Fila de total / subtotal') || 0) + 1);
      continue;
    }
    // Corrección: los reportes tipo ROADNET/UPS Logistics (el mismo formato de
    // "Resumen N" que usa este archivo) traen, después de la última ruta real,
    // un bloque de estadísticas de la hoja ("N Rutas", "Menor", "Superior") y
    // notas al pie ("Los tamaños resaltados son...", "El % de capacidad se
    // calcula..."), a veces SIN ninguna fila en blanco que las separe de los
    // datos reales. En vez de intentar reconocer cada frase posible de ese
    // bloque una por una (frágil: cualquier variante de redacción se cuela),
    // se exige que el ID de ruta tenga el formato real de un código de ruta:
    // solo dígitos, con como mucho un pequeño sufijo de letras (p. ej.
    // "152201", "152232A"). Cualquier otra cosa — texto con espacios, palabras
    // sueltas como "Menor"/"Superior", el conteo "N Rutas", notas al pie — se
    // descarta aquí sin importar la redacción exacta.
    if (!/^\d+[a-zA-Z]{0,3}$/.test(idVal.trim())) {
      discardedByReason.set(
        'Formato de ID de ruta no válido (se esperaba un código numérico)',
        (discardedByReason.get('Formato de ID de ruta no válido (se esperaba un código numérico)') || 0) + 1
      );
      continue;
    }

    const agenciaVal = getVal(colMap.agencia, 'general') || 'Mercado Abierto';
    const mercadoVal = getVal(colMap.mercado, 'general') || (agenciaVal.toLowerCase().includes('mercado') ? agenciaVal : 'Mercado Abierto');
    if (agenciaVal.toLowerCase().includes('etiquetas') || agenciaVal.toLowerCase().includes('total general')) {
      discardedByReason.set('Fila de encabezado / tabla dinámica', (discardedByReason.get('Fila de encabezado / tabla dinámica') || 0) + 1);
      continue;
    }

    const rawDate = getVal(colMap.fecha, 'date');
    // Prioridad: (1) columna de Fecha por fila si la hoja la trae (plantilla
    // propia, donde cada fila puede tener su propia fecha); (2) dateOverride
    // calculado por el llamador a partir del número de pestaña + mes/año (ver
    // extractFechaEntregaMonthYear) para hojas tipo ROADNET sin columna de
    // fecha; (3) como último recurso, la fecha de hoy.
    const routeDate = rawDate
      ? formatDateToGuatemala(rawDate)
      : dateOverride || formatDateToGuatemala(new Date());

    const cajas12Val = getVal(colMap.cajas12Oz, 'general') || '0';
    let cajasFisicasVal = getVal(colMap.cajasFisicas, 'general');
    if (!cajasFisicasVal && cajas12Val && cajas12Val !== '0') {
      cajasFisicasVal = cajas12Val;
    }

    const segmentoVal = getVal(colMap.segmento, 'general');

    const routeItem: Route = {
      id: idVal,
      agencia: agenciaVal,
      mercado: mercadoVal,
      segmento: segmentoVal || '',
      fecha: routeDate,
      fechaOriginalRuta: routeDate, // Se guarda la fecha original de la ruta desde su importación
      viaje: getVal(colMap.viaje, 'time') || '00:00',
      servicio: getVal(colMap.servicio, 'time') || '00:00',
      descanso: getVal(colMap.descanso, 'time') || '00:00',
      total: getVal(colMap.total, 'time') || '00:00',
      distancia: getVal(colMap.distancia, 'general') || '0',
      paradas: parseInt(String(getVal(colMap.paradas, 'general')).replace(/[^0-9]/g, '')) || 0,
      equipoFrio: parseInt(String(getVal(colMap.equipoFrio, 'general')).replace(/[^0-9]/g, '')) || 0,
      capacidadPorc: getVal(colMap.capacidad, 'percent') || '0 %',
      cajas12Oz: cajas12Val,
      pesoKg: getVal(colMap.peso, 'general') || '0',
      cajasFisicas: cajasFisicasVal || '0',
      estado: 'Pendiente',
      asignacion: null,
      liquidacion: null,
      fechaCarga: formatDateTimeToGuatemala(new Date()),
      fechaCreacion: formatDateTimeToGuatemala(new Date())
    };

    results.push(routeItem);
  }

  results.importReport = buildImportReport(totalRows, results.length, discardedByReason);
  return results;
}

// --- Detalle de Clientes por Ruta ---
//
// El cliente (operador logístico para el que Discarga trabaja) envía un archivo
// Excel con una pestaña "Resumen N" (totales de ruta, ya soportado arriba) y una
// pestaña "Clientes N" por cada día del mes, donde N es el día. La pestaña
// "Clientes N" trae, por ruta, el listado de clientes/puntos de venta visitados:
// CODIGO, NOMBRE, RUTA, EQUIPO_FRIO, VENTA, SECUENCIA, más filas de subtotal
// "Total <ruta>" y un "Total general" al cierre de la hoja. Un mismo cliente
// puede repetirse varias veces bajo la misma ruta (varias facturas al mismo
// cliente en la misma parada): se agrupa por (RUTA, CODIGO) sumando VENTA, lo
// cual reproduce exactamente los subtotales "Total <ruta>" que el propio
// archivo ya trae (verificado contra un archivo real: 0 diferencias).

export interface ClienteRutaGrouped {
  ruta: string;
  codigo: string;
  nombre: string;
  cajas: number;
}

export function parseClientesFromSheet(ws: XLSX.WorkSheet): WithImportReport<ClienteRutaGrouped> {
  if (!ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);

  let headerRowIndex = -1;
  const colMap: Record<string, number> = {};

  // Escanea las primeras 15 filas buscando la fila de encabezados
  // CODIGO / NOMBRE / RUTA / EQUIPO_FRIO / VENTA / SECUENCIA.
  for (let r = range.s.r; r <= Math.min(range.s.r + 15, range.e.r); r++) {
    const rowHeaders: Array<{ c: number; text: string }> = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      const rawText = cell.w || cell.v;
      if (rawText === undefined || rawText === null || String(rawText).trim() === '') continue;
      const txt = cleanHeaderStr(rawText);
      if (!txt) continue;
      rowHeaders.push({ c, text: txt });
    }

    const hasCodigo = rowHeaders.some((h) => h.text === 'codigo');
    const hasRuta = rowHeaders.some((h) => h.text === 'ruta');
    const hasVenta = rowHeaders.some((h) => h.text === 'venta');

    if (hasCodigo && hasRuta && hasVenta) {
      headerRowIndex = r;
      rowHeaders.forEach((item) => {
        if (item.text === 'codigo' && colMap.codigo === undefined) colMap.codigo = item.c;
        else if (item.text === 'nombre' && colMap.nombre === undefined) colMap.nombre = item.c;
        else if (item.text === 'ruta' && colMap.ruta === undefined) colMap.ruta = item.c;
        else if (item.text === 'venta' && colMap.venta === undefined) colMap.venta = item.c;
      });
      break;
    }
  }

  if (headerRowIndex === -1 || colMap.codigo === undefined || colMap.ruta === undefined) {
    return [];
  }

  const getRawVal = (r: number, colIdx: number | undefined) => {
    if (colIdx === undefined) return undefined;
    const cell = ws[XLSX.utils.encode_cell({ r, c: colIdx })];
    return cell ? cell.v : undefined;
  };

  let totalRows = 0;
  const discardedByReason = new Map<string, number>();
  // Agrupa por (ruta, codigo) sumando venta: así se reduce automáticamente
  // cualquier cliente repetido (varias facturas) a un solo registro por ruta.
  const groups = new Map<string, ClienteRutaGrouped>();

  for (let r = headerRowIndex + 1; r <= range.e.r; r++) {
    const rawCodigo = getRawVal(r, colMap.codigo);
    const rawRuta = getRawVal(r, colMap.ruta);
    const rawNombre = getRawVal(r, colMap.nombre);
    const rawVenta = getRawVal(r, colMap.venta);

    const hasAnyCell =
      rawCodigo !== undefined || rawRuta !== undefined || rawNombre !== undefined || rawVenta !== undefined;
    if (!hasAnyCell) continue; // fila completamente vacía: no cuenta ni como leída

    totalRows++;

    if (rawCodigo === undefined || rawCodigo === null || String(rawCodigo).trim() === '') {
      // Filas sin código de cliente: son los subtotales "Total <ruta>" que el
      // archivo intercala después de cada ruta, o el "Total general" al final.
      discardedByReason.set(
        'Fila de subtotal ("Total <ruta>" / "Total general")',
        (discardedByReason.get('Fila de subtotal ("Total <ruta>" / "Total general")') || 0) + 1
      );
      continue;
    }
    if (rawRuta === undefined || rawRuta === null || String(rawRuta).trim() === '') {
      discardedByReason.set('Falta el número de ruta', (discardedByReason.get('Falta el número de ruta') || 0) + 1);
      continue;
    }

    const codigo = String(typeof rawCodigo === 'number' ? Math.round(rawCodigo) : rawCodigo).trim();
    const ruta = String(typeof rawRuta === 'number' ? Math.round(rawRuta) : rawRuta).trim();
    const nombre = rawNombre !== undefined && rawNombre !== null ? String(rawNombre).trim() : '';
    const venta =
      typeof rawVenta === 'number' ? rawVenta : parseFloat(String(rawVenta ?? '0').replace(',', '.')) || 0;

    const key = `${ruta}__${codigo}`;
    const existing = groups.get(key);
    if (existing) {
      existing.cajas += venta;
      if (!existing.nombre && nombre) existing.nombre = nombre;
    } else {
      groups.set(key, { ruta, codigo, nombre, cajas: venta });
    }
  }

  const results: WithImportReport<ClienteRutaGrouped> = Array.from(groups.values());
  results.importReport = buildImportReport(totalRows, results.length, discardedByReason);
  return results;
}

// Agrupa filas ya sumadas por cliente en un mapa RUTA -> lista de clientes,
// listo para asignarse directamente a Route.clientesRuta.
export function groupClientesByRuta(rows: ClienteRutaGrouped[]): Map<string, RouteClientEntry[]> {
  const map = new Map<string, RouteClientEntry[]>();
  rows.forEach((row) => {
    const arr = map.get(row.ruta) || [];
    arr.push({ codigo: row.codigo, nombre: row.nombre, cajas: row.cajas });
    map.set(row.ruta, arr);
  });
  return map;
}

// El nombre de cada pestaña ("Clientes 22", "Resumen 05", "Resumen 4.", "Resumen
// 9", etc.) siempre trae en algún punto el número del día del mes al que
// corresponde esa hoja — el formato exacto varía (con o sin cero a la
// izquierda, con o sin un punto al final) pero el número es consistente con la
// fecha real de entrega (ver conversación con el usuario).
export function extractDayNumberFromSheetName(name: string): number | null {
  const m = String(name || '').match(/(\d{1,2})/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 1 && n <= 31 ? n : null;
}

// Identifica, de forma tolerante a mayúsculas/acentos, si una pestaña es del
// tipo "Clientes N" (detalle de clientes) en vez de "Resumen N" (totales de
// ruta) u otra pestaña ajena al archivo (por ejemplo, una "Hoja1" en blanco).
//
// Corrección: antes se exigía que el nombre contuviera exactamente "cliente".
// El archivo real del cliente trae la pestaña escrita como "Clintes 23" (sin
// la "e"), así que se ignoraba y la lista de clientes nunca se cargaba. Ahora
// se aceptan variantes con errores de tipeo (Clintes, Clientes, Cliente,
// Clients, Clentes...). Además, ver isClientesSheet(): si el nombre no ayuda,
// la pestaña se reconoce por su CONTENIDO (encabezados CODIGO / RUTA / VENTA).
export function isClientesSheetName(name: string): boolean {
  const clean = cleanHeaderStr(name);
  return /\bcl[a-z]{0,3}n?t[a-z]*/.test(clean) && /\bcl/.test(clean) && /nt/.test(clean);
}

// ¿La hoja tiene la tabla de detalle de clientes? (fila de encabezados con
// CODIGO, RUTA y VENTA en las primeras 15 filas — el mismo criterio que usa
// parseClientesFromSheet para empezar a leer).
export function looksLikeClientesSheet(ws: XLSX.WorkSheet | undefined): boolean {
  if (!ws || !ws['!ref']) return false;
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let r = range.s.r; r <= Math.min(range.s.r + 15, range.e.r); r++) {
    const texts = new Set<string>();
    for (let c = range.s.c; c <= Math.min(range.e.c, range.s.c + 40); c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      const t = cleanHeaderStr(cell.w || cell.v);
      if (t) texts.add(t);
    }
    if (texts.has('codigo') && texts.has('ruta') && texts.has('venta')) return true;
  }
  return false;
}

// Pestaña de detalle de clientes: por nombre (tolerante a errores de tipeo)
// o por contenido.
export function isClientesSheet(wb: XLSX.WorkBook, name: string): boolean {
  return isClientesSheetName(name) || looksLikeClientesSheet(wb.Sheets[name]);
}

export function getRouteAssignmentType(r: Route): string {
  const currentTipo = r.asignacion?.tipoAsignacion || r.tipoAsignacion;
  if (currentTipo === 'Recarga') return 'Recarga';
  if (currentTipo === 'Revisita') return 'Revisita';
  if (currentTipo === 'Ruta a Piso') return 'Ruta a Piso';
  if (currentTipo === 'Primer Viaje') return 'Primer Viaje';

  if (r.esRecarga) return 'Recarga';
  if (r.esReasignacion) return 'Revisita';
  if (r.aPiso) return 'Ruta a Piso';
  if ((r.historialDespachos?.length || 0) > 0) {
    return 'Revisita';
  }

  return 'Primer Viaje';
}

export function exportRoutesToExcel(routes: Route[], staffList: Staff[]) {
  if (!routes || routes.length === 0) return false;

  const headers = [
    "ID Ruta",
    "Agencia",
    "Segmento",
    "Fecha de Ruta",
    "Fecha de Asignación",
    "Fecha de Liquidación",
    "Estado",
    "Tipo de Asignación",
    "Camión (Placa)",
    "Piloto (Nombre)",
    "Puesto Piloto",
    "DPI Piloto",
    "Auxiliar 1 (APP)",
    "DPI Auxiliar 1",
    "Auxiliar 2 (APP)",
    "DPI Auxiliar 2",
    "Auxiliar 3 (APP)",
    "DPI Auxiliar 3",
    "Auxiliar 4 (APP)",
    "DPI Auxiliar 4",
    "Hora Salida",
    "Paradas Prog.",
    "Paradas Entregadas",
    "Paradas Rechazadas",
    "Cajas Físicas Salida",
    "Cajas Entregadas",
    "Cajas Devueltas",
    "Motivo Devolución",
    "Cajas 12 Oz",
    "Peso (Kg)",
    "Equipo Frío",
    "Auditor Liquidación"
  ];

  const rows = routes.map(r => {
    const asig = r.asignacion || r.ultimoDespacho;
    const liq = r.liquidacion;
    const tipoAsignacion = getRouteAssignmentType(r);

    const driverObj = asig?.conductor ? staffList.find(s => s.nombre === asig.conductor) : undefined;
    const h1Obj = asig?.auxiliar1 ? staffList.find(s => s.nombre === asig.auxiliar1) : undefined;
    const h2Obj = asig?.auxiliar2 ? staffList.find(s => s.nombre === asig.auxiliar2) : undefined;
    const h3Obj = asig?.auxiliar3 ? staffList.find(s => s.nombre === asig.auxiliar3) : undefined;
    const h4Obj = asig?.auxiliar4 ? staffList.find(s => s.nombre === asig.auxiliar4) : undefined;

    const pilotoNombre = asig?.conductor || "Sin Asignar";
    const pilotoPuesto = driverObj ? (driverObj.puesto || "VPP") : (asig?.conductor ? "VPP" : "-");
    const pilotoDpi = driverObj ? (driverObj.dpi || "-") : "-";

    return [
      r.id,
      r.agencia || "Mercado Abierto",
      r.segmento || "-",
      formatDateToGuatemala(r.fechaOriginalRuta || r.fecha) || "",
      r.fechaAsignacion || asig?.fechaAsignacion || "-",
      formatDateTimeToGuatemala(liq?.fechaLiquidacion || r.fechaLiquidacion) || "-",
      r.estado || "Pendiente",
      tipoAsignacion,
      asig?.camionPlaca || "Sin Asignar",
      pilotoNombre,
      pilotoPuesto,
      pilotoDpi,
      asig?.auxiliar1 || "-",
      h1Obj ? (h1Obj.dpi || "-") : "-",
      asig?.auxiliar2 || "-",
      h2Obj ? (h2Obj.dpi || "-") : "-",
      asig?.auxiliar3 || "-",
      h3Obj ? (h3Obj.dpi || "-") : "-",
      asig?.auxiliar4 || "-",
      h4Obj ? (h4Obj.dpi || "-") : "-",
      asig?.horaSalida || "-",
      parseInt(String(r.paradas)) || 0,
      liq?.guiasExitosas !== undefined ? liq.guiasExitosas : "-",
      liq?.guiasRechazadas !== undefined ? liq.guiasRechazadas : "-",
      parseFloat(String(r.cajasFisicas)) || 0,
      liq?.cajasEntregadas !== undefined ? liq.cajasEntregadas : "-",
      liq?.cajasDevueltas !== undefined ? liq.cajasDevueltas : "-",
      (parseFloat(String(liq?.cajasDevueltas || 0)) === 0 && (liq?.guiasRechazadas === 0 || liq?.guiasRechazadas === undefined))
        ? "-"
        : (liq?.motivoDevolucion || r.motivoDevolucion || "-"),
      parseFloat(String(r.cajas12Oz)) || 0,
      parseFloat(String(r.pesoKg)) || 0,
      parseInt(String(r.equipoFrio)) || 0,
      liq?.auditor || "-"
    ];
  });

  const aoaData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoaData);

  const colWidths = headers.map((h, i) => {
    let maxLen = h.length;
    rows.forEach(r => {
      const val = String(r[i] !== undefined && r[i] !== null ? r[i] : "");
      if (val.length > maxLen) maxLen = val.length;
    });
    return { wch: Math.min(Math.max(maxLen + 3, 10), 32) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Control_Rutas");

  const todayStr = getGuatemalaDateForInput(new Date());
  XLSX.writeFile(wb, `Reporte_Control_Rutas_${todayStr}.xlsx`);
  return true;
}

export function exportHistoricalToExcel(historicalRoutes: Route[], staffList: Staff[]) {
  if (!historicalRoutes || historicalRoutes.length === 0) return false;

  const headers = [
    "ID Ruta",
    "Agencia",
    "Segmento",
    "Fecha de Ruta",
    "Fecha de Asignación",
    "Fecha de Liquidación",
    "Estado",
    "Tipo de Asignación",
    "Camión (Placa)",
    "Piloto (Nombre)",
    "Puesto Piloto",
    "DPI Piloto",
    "Auxiliar 1 (APP)",
    "DPI Auxiliar 1",
    "Auxiliar 2 (APP)",
    "DPI Auxiliar 2",
    "Auxiliar 3 (APP)",
    "DPI Auxiliar 3",
    "Auxiliar 4 (APP)",
    "DPI Auxiliar 4",
    "Paradas Programadas",
    "Paradas Entregadas",
    "Paradas Rechazadas",
    "Cajas Físicas Salida",
    "Cajas Entregadas",
    "Cajas Devueltas",
    "Motivo Devolución",
    "Cajas 12 Oz",
    "Auditor Liquidación"
  ];

  const rows = historicalRoutes.map(r => {
    const asig = r.asignacion || r.ultimoDespacho;
    const liq = r.liquidacion;
    const tipoAsignacion = getRouteAssignmentType(r);

    const driverObj = asig?.conductor ? staffList.find(s => s.nombre === asig.conductor) : undefined;
    const h1Obj = asig?.auxiliar1 ? staffList.find(s => s.nombre === asig.auxiliar1) : undefined;
    const h2Obj = asig?.auxiliar2 ? staffList.find(s => s.nombre === asig.auxiliar2) : undefined;
    const h3Obj = asig?.auxiliar3 ? staffList.find(s => s.nombre === asig.auxiliar3) : undefined;
    const h4Obj = asig?.auxiliar4 ? staffList.find(s => s.nombre === asig.auxiliar4) : undefined;

    return [
      r.id,
      r.agencia || "Mercado Abierto",
      r.segmento || "-",
      formatDateToGuatemala(r.fechaOriginalRuta || r.fecha) || "",
      r.fechaAsignacion || asig?.fechaAsignacion || "-",
      formatDateTimeToGuatemala(liq?.fechaLiquidacion || r.fechaLiquidacion) || "",
      r.estado || "Liquidada",
      tipoAsignacion,
      asig?.camionPlaca || "N/A",
      asig?.conductor || "N/A",
      driverObj ? (driverObj.puesto || "VPP") : "VPP",
      driverObj ? (driverObj.dpi || "-") : "-",
      asig?.auxiliar1 || "-",
      h1Obj ? (h1Obj.dpi || "-") : "-",
      asig?.auxiliar2 || "-",
      h2Obj ? (h2Obj.dpi || "-") : "-",
      asig?.auxiliar3 || "-",
      h3Obj ? (h3Obj.dpi || "-") : "-",
      asig?.auxiliar4 || "-",
      h4Obj ? (h4Obj.dpi || "-") : "-",
      parseInt(String(r.paradas)) || 0,
      liq?.guiasExitosas !== undefined ? liq.guiasExitosas : "-",
      liq?.guiasRechazadas !== undefined ? liq.guiasRechazadas : "-",
      parseFloat(String(r.cajasFisicas)) || 0,
      liq?.cajasEntregadas !== undefined ? liq.cajasEntregadas : "-",
      liq?.cajasDevueltas !== undefined ? liq.cajasDevueltas : "-",
      (parseFloat(String(liq?.cajasDevueltas || 0)) === 0 && (liq?.guiasRechazadas === 0 || liq?.guiasRechazadas === undefined))
        ? "-"
        : (liq?.motivoDevolucion || r.motivoDevolucion || "-"),
      parseFloat(String(r.cajas12Oz)) || 0,
      liq?.auditor || "-"
    ];
  });

  const aoaData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoaData);

  const colWidths = headers.map((h, i) => {
    let maxLen = h.length;
    rows.forEach(r => {
      const val = String(r[i] !== undefined && r[i] !== null ? r[i] : "");
      if (val.length > maxLen) maxLen = val.length;
    });
    return { wch: Math.min(Math.max(maxLen + 3, 11), 34) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Historico_Liquidaciones");

  const todayStr = getGuatemalaDateForInput(new Date());
  XLSX.writeFile(wb, `Historico_Rutas_Liquidadas_${todayStr}.xlsx`);
  return true;
}

export function downloadStaffExcelTemplate() {
  const headers = ["DPI", "Código", "Nombre Completo", "Agencia", "Puesto", "Código Corto", "Estatus"];
  const rows = [
    ["2541 89320 0101", "DISAOC-00381", "Carlos Gómez Pérez", "Mercado Abierto", "VPP", "3810", "ALTA"],
    ["1890 45123 0101", "DISAOC-00382", "Marcos Estrada Morales", "Mercado Abierto", "VPPB", "3820", "ALTA"],
    ["3012 77890 0101", "DISAOC-00383", "Luis Fernando Rosales", "Xela", "APP", "3830", "ALTA"],
    ["2109 66543 0101", "DISAOC-00384", "Jorge Mario López", "Escuintla", "APP", "3840", "ALTA"],
    ["1987 33456 0101", "DISAOC-00385", "Roberto Antonio Dávila", "Coatepeque", "VPP", "3850", "BAJA"]
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    { wch: 22 }, // DPI
    { wch: 16 }, // Código
    { wch: 30 }, // Nombre Completo
    { wch: 18 }, // Agencia
    { wch: 12 }, // Puesto
    { wch: 14 }, // Código Corto
    { wch: 12 }, // Estatus
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Personal");
  XLSX.writeFile(wb, "Plantilla_Carga_Personal.xlsx");
}

export function parseStaffFromSheet(ws: XLSX.WorkSheet, defaultAgencia?: string): WithImportReport<Staff> {
  if (!ws || !ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);

  let headerRow = -1;
  let colDpi = -1;
  let colCodigo = -1;
  let colNombre = -1;
  let colAgencia = -1;
  let colPuesto = -1;
  let colCodigoCorto = -1;
  let colTelefono = -1;
  let colEstado = -1;
  let colEstatus = -1;

  // Look for header row in first 15 rows
  for (let r = range.s.r; r <= Math.min(range.s.r + 15, range.e.r); r++) {
    const rowTexts: { c: number; text: string }[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      const clean = cleanHeaderStr(cell.w || cell.v || '');
      if (clean) {
        rowTexts.push({ c, text: clean });
      }
    }

    const hasNombre = rowTexts.some(t =>
      t.text.includes('nombre') ||
      t.text.includes('colaborador') ||
      t.text.includes('personal') ||
      t.text.includes('empleado') ||
      t.text.includes('piloto') ||
      t.text.includes('chofer')
    );
    const hasDpi = rowTexts.some(t =>
      t.text.includes('dpi') ||
      t.text.includes('identifica') ||
      t.text.includes('cedula') ||
      t.text.includes('documento') ||
      t.text === 'id'
    );
    const hasPuesto = rowTexts.some(t =>
      t.text.includes('puesto') ||
      t.text.includes('cargo') ||
      t.text.includes('rol')
    );

    if (hasNombre || (hasDpi && hasPuesto)) {
      headerRow = r;
      rowTexts.forEach(item => {
        const t = item.text;
        // Orden importante: "codigo corto" y "estatus" deben revisarse antes que
        // los genéricos "codigo" y "estado" porque los contienen como subcadena.
        if (
          t.includes('dpi') ||
          t.includes('identifica') ||
          t.includes('cedula') ||
          t.includes('documento') ||
          t === 'id'
        ) {
          colDpi = item.c;
        } else if (t.includes('codigo corto') || t.includes('cod corto')) {
          colCodigoCorto = item.c;
        } else if (t.includes('codigo') || t.includes('cod')) {
          colCodigo = item.c;
        } else if (
          t.includes('nombre') ||
          t.includes('colaborador') ||
          t.includes('personal') ||
          t.includes('empleado') ||
          t.includes('chofer') ||
          t.includes('piloto')
        ) {
          colNombre = item.c;
        } else if (t.includes('agencia') || t.includes('sucursal') || t === 'sede') {
          colAgencia = item.c;
        } else if (
          t.includes('puesto') ||
          t.includes('cargo') ||
          t.includes('rol') ||
          t.includes('posicion')
        ) {
          colPuesto = item.c;
        } else if (
          t.includes('telefono') ||
          t.includes('tel') ||
          t.includes('celular') ||
          t.includes('movil') ||
          t.includes('phone') ||
          t.includes('contacto')
        ) {
          colTelefono = item.c;
        } else if (t.includes('estatus')) {
          colEstatus = item.c;
        } else if (
          t.includes('estado') ||
          t.includes('status') ||
          t.includes('condicion')
        ) {
          colEstado = item.c;
        }
      });
      break;
    }
  }

  // Fallback si no se detecta fila de encabezado: asumir
  // [DPI, Código, Nombre Completo, Puesto, Código Corto, Estatus]
  if (headerRow === -1) {
    headerRow = range.s.r;
    colDpi = range.s.c;
    colCodigo = range.s.c + 1;
    colNombre = range.s.c + 2;
    colPuesto = range.s.c + 3;
    colCodigoCorto = range.s.c + 4;
    colEstatus = range.s.c + 5;
  }

  const result: WithImportReport<Staff> = [];
  let rowCounter = 1;
  const discardedByReason = new Map<string, number>();
  let totalRows = 0;

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const getVal = (colIdx: number) => {
      if (colIdx < 0) return '';
      const cell = ws[XLSX.utils.encode_cell({ r, c: colIdx })];
      if (!cell) return '';
      let text = cell.w !== undefined && cell.w !== null ? String(cell.w).trim() : String(cell.v || '').trim();
      if (/^\d+\.0+$/.test(text)) text = text.replace(/\.0+$/, '');
      return text;
    };

    const rawNombre = colNombre >= 0 ? getVal(colNombre) : '';
    const rawDpi = colDpi >= 0 ? getVal(colDpi) : '';
    const rawCodigo = colCodigo >= 0 ? getVal(colCodigo) : '';
    const rawCodigoCorto = colCodigoCorto >= 0 ? getVal(colCodigoCorto) : '';
    const rawAgenciaCheck = colAgencia >= 0 ? getVal(colAgencia) : '';
    const rawPuestoCheck = colPuesto >= 0 ? getVal(colPuesto) : '';
    const rawTelefonoCheck = colTelefono >= 0 ? getVal(colTelefono) : '';
    const rawEstadoCheck = colEstado >= 0 ? getVal(colEstado) : '';
    const rawEstatusCheck = colEstatus >= 0 ? getVal(colEstatus) : '';
    const rowHasAnyData = Boolean(
      rawNombre || rawDpi || rawCodigo || rawCodigoCorto || rawAgenciaCheck || rawPuestoCheck || rawTelefonoCheck || rawEstadoCheck || rawEstatusCheck
    );
    if (!rowHasAnyData) continue; // fila completamente vacía: no cuenta ni como leída

    totalRows++;
    if (!rawNombre) {
      discardedByReason.set('Falta el nombre', (discardedByReason.get('Falta el nombre') || 0) + 1);
      continue;
    }
    if (rawNombre.toLowerCase() === 'nombre') {
      discardedByReason.set('Fila de encabezado repetida', (discardedByReason.get('Fila de encabezado repetida') || 0) + 1);
      continue;
    }

    const agencia = normalizeAgencia(rawAgenciaCheck, defaultAgencia);
    const rawPuesto = rawPuestoCheck.toUpperCase();
    const rawTelefono = rawTelefonoCheck;
    const rawEstado = rawEstadoCheck.toLowerCase();
    const rawEstatus = rawEstatusCheck.toLowerCase();

    let puesto: StaffPuesto = 'VPP';
    if (rawPuesto.includes('VPPB')) {
      puesto = 'VPPB';
    } else if (
      rawPuesto.includes('APP') ||
      rawPuesto.includes('AUX') ||
      rawPuesto.includes('AYUD') ||
      rawPuesto.includes('PEON')
    ) {
      puesto = 'APP';
    } else if (
      rawPuesto.includes('VPP') ||
      rawPuesto.includes('PILOTO') ||
      rawPuesto.includes('CHOFER') ||
      rawPuesto.includes('CONDUCTOR')
    ) {
      puesto = 'VPP';
    }

    const rol = puesto === 'APP' ? 'Auxiliar' : 'Conductor';

    let estado: ResourceStatus = 'Disponible';
    if (
      rawEstado.includes('baja') ||
      rawEstado.includes('inactiv') ||
      rawEstado.includes('desactiv')
    ) {
      estado = 'Baja';
    } else if (rawEstado.includes('ruta') || rawEstado.includes('transito')) {
      estado = 'En Ruta';
    }

    // Estatus administrativo de planilla (ALTA/BAJA), independiente del estado operativo del día
    let estatus: StaffEstatus = 'ALTA';
    if (rawEstatus.includes('baja') || rawEstatus.includes('inactiv')) {
      estatus = 'BAJA';
    }

    result.push({
      id: `S-IMP-${Date.now()}-${rowCounter++}`,
      dpi: rawDpi || 'N/A',
      codigo: rawCodigo || undefined,
      codigoCorto: rawCodigoCorto || undefined,
      nombre: rawNombre,
      agencia: agencia || undefined,
      puesto,
      rol,
      telefono: rawTelefono || '-',
      estado,
      estatus,
    });
  }

  result.importReport = buildImportReport(totalRows, result.length, discardedByReason);
  return result;
}

export function downloadTruckExcelTemplate() {
  const headers = ["ID Camión", "Placa", "Agencia", "Estatus", "TON", "Bahías", "Capacidad"];
  const rows = [
    ["385", "C234BGD", "Mercado Abierto", "Disponible", 12, 10, 375],
    ["386", "C441DFG", "Mercado Abierto", "Disponible", 10, 8, 300],
    ["387", "C993KLM", "Xela", "Disponible", 14, 12, 450],
    ["388", "C112ZXC", "Escuintla", "Disponible", 8, 6, 250],
    ["389", "C774HYT", "Coatepeque", "Baja", 12, 10, 375]
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [
    { wch: 12 }, // ID Camión
    { wch: 16 }, // Placa
    { wch: 18 }, // Agencia
    { wch: 14 }, // Estatus
    { wch: 8 },  // TON
    { wch: 10 }, // Bahías
    { wch: 12 }, // Capacidad
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Camiones");
  XLSX.writeFile(wb, "Plantilla_Carga_Camiones.xlsx");
}

export function parseTrucksFromSheet(ws: XLSX.WorkSheet, defaultAgencia?: string): WithImportReport<Truck> {
  if (!ws || !ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);

  let headerRow = -1;
  let colIdCamion = -1;
  let colPlaca = -1;
  let colAgencia = -1;
  let colCapacidad = -1;
  let colTon = -1;
  let colBahias = -1;
  let colEstado = -1;
  let colRuta = -1;

  // Look for header row in first 15 rows
  for (let r = range.s.r; r <= Math.min(range.s.r + 15, range.e.r); r++) {
    const rowTexts: { c: number; text: string }[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell) continue;
      const clean = cleanHeaderStr(cell.w || cell.v || '');
      if (clean) {
        rowTexts.push({ c, text: clean });
      }
    }

    const hasPlaca = rowTexts.some(t =>
      t.text.includes('placa') ||
      t.text.includes('codigo') ||
      t.text.includes('unidad') ||
      t.text.includes('camion') ||
      t.text.includes('vehiculo') ||
      t.text.includes('truck') ||
      t.text.includes('plate')
    );
    const hasCapacidad = rowTexts.some(t =>
      t.text.includes('capacidad') ||
      t.text.includes('tonel') ||
      t.text.includes('volumen') ||
      t.text.includes('cajas') ||
      t.text.includes('peso')
    );

    if (hasPlaca || hasCapacidad) {
      headerRow = r;
      rowTexts.forEach(item => {
        const t = item.text;
        // Orden importante: "id camion" y "bahias"/"ton" deben revisarse antes que
        // los genéricos "camion" y "capacidad" porque los contienen como subcadena.
        if (t.includes('id camion') || t.includes('id de camion') || t === 'id camion') {
          colIdCamion = item.c;
        } else if (
          t.includes('placa') ||
          t.includes('codigo') ||
          t.includes('unidad') ||
          t.includes('camion') ||
          t.includes('vehiculo') ||
          t === 'id' ||
          t.includes('plate')
        ) {
          colPlaca = item.c;
        } else if (t.includes('agencia') || t.includes('sucursal') || t === 'sede') {
          colAgencia = item.c;
        } else if (t.startsWith('ton')) {
          colTon = item.c;
        } else if (t.includes('bahia')) {
          colBahias = item.c;
        } else if (
          t.includes('capacidad') ||
          t.includes('volumen') ||
          t.includes('cajas') ||
          t.includes('peso') ||
          t.includes('cap')
        ) {
          colCapacidad = item.c;
        } else if (
          t.includes('estado') ||
          t.includes('status') ||
          t.includes('condicion')
        ) {
          colEstado = item.c;
        } else if (
          t.includes('ruta actual') ||
          t.includes('ruta') ||
          t.includes('viaje')
        ) {
          colRuta = item.c;
        }
      });
      break;
    }
  }

  // Fallback si no se detecta fila de encabezado: asumir
  // [ID Camión, Placa, Estatus, TON, Bahías, Capacidad]
  if (headerRow === -1) {
    headerRow = range.s.r;
    colIdCamion = range.s.c;
    colPlaca = range.s.c + 1;
    colEstado = range.s.c + 2;
    colTon = range.s.c + 3;
    colBahias = range.s.c + 4;
    colCapacidad = range.s.c + 5;
  }

  const result: WithImportReport<Truck> = [];
  let rowCounter = 1;
  const discardedByReason = new Map<string, number>();
  let totalRows = 0;

  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const getVal = (colIdx: number) => {
      if (colIdx < 0) return '';
      const cell = ws[XLSX.utils.encode_cell({ r, c: colIdx })];
      if (!cell) return '';
      let text = cell.w !== undefined && cell.w !== null ? String(cell.w).trim() : String(cell.v || '').trim();
      if (/^\d+\.0+$/.test(text)) text = text.replace(/\.0+$/, '');
      return text;
    };

    const rawPlaca = colPlaca >= 0 ? getVal(colPlaca) : '';
    const rawIdCamion = colIdCamion >= 0 ? getVal(colIdCamion) : '';
    const rawAgenciaCheck = colAgencia >= 0 ? getVal(colAgencia) : '';
    const rawCapacidadCheck = colCapacidad >= 0 ? getVal(colCapacidad) : '';
    const rawTonCheck = colTon >= 0 ? getVal(colTon) : '';
    const rawBahiasCheck = colBahias >= 0 ? getVal(colBahias) : '';
    const rawEstadoCheck = colEstado >= 0 ? getVal(colEstado) : '';
    const rawRutaCheck = colRuta >= 0 ? getVal(colRuta) : '';
    const rowHasAnyData = Boolean(
      rawPlaca || rawIdCamion || rawAgenciaCheck || rawCapacidadCheck || rawTonCheck || rawBahiasCheck || rawEstadoCheck || rawRutaCheck
    );
    if (!rowHasAnyData) continue; // fila completamente vacía: no cuenta ni como leída

    totalRows++;
    if (!rawPlaca) {
      discardedByReason.set('Falta la placa / código de unidad', (discardedByReason.get('Falta la placa / código de unidad') || 0) + 1);
      continue;
    }
    if (rawPlaca.toLowerCase() === 'placa' || rawPlaca.toLowerCase() === 'codigo') {
      discardedByReason.set('Fila de encabezado repetida', (discardedByReason.get('Fila de encabezado repetida') || 0) + 1);
      continue;
    }

    const agencia = normalizeAgencia(rawAgenciaCheck, defaultAgencia);
    const rawCapacidad = rawCapacidadCheck;
    const rawTon = rawTonCheck;
    const rawBahias = rawBahiasCheck;
    const rawEstado = rawEstadoCheck.toLowerCase();
    const rawRuta = rawRutaCheck;

    let estado: ResourceStatus = 'Disponible';
    if (
      rawEstado.includes('baja') ||
      rawEstado.includes('inactiv') ||
      rawEstado.includes('desactiv') ||
      rawEstado.includes('taller') ||
      rawEstado.includes('mantenimiento')
    ) {
      estado = 'Baja';
    } else if (rawEstado.includes('ruta') || rawEstado.includes('transito')) {
      estado = 'En Ruta';
    }

    result.push({
      id: `T-IMP-${Date.now()}-${rowCounter++}`,
      idCamion: rawIdCamion || undefined,
      placa: rawPlaca.toUpperCase(),
      agencia: agencia || undefined,
      capacidad: rawCapacidad || '0',
      ton: rawTon || undefined,
      bahias: rawBahias || undefined,
      estado,
      rutaActual: rawRuta && rawRuta !== '-' && rawRuta.toLowerCase() !== 'ninguna' ? rawRuta : null,
    });
  }

  result.importReport = buildImportReport(totalRows, result.length, discardedByReason);
  return result;
}


