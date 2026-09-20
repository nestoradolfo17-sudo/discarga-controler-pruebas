import { Route } from '../types';

export function parseFlexibleDate(dateInput: any): Date | null {
  if (!dateInput) return null;
  if (dateInput instanceof Date && !isNaN(dateInput.getTime())) return dateInput;

  const str = String(dateInput).trim();
  if (!str) return null;

  // Corrección: marcas de tiempo ISO con zona horaria explícita (por ejemplo
  // "2026-09-20T04:08:23.456Z", el formato que genera new Date().toISOString()
  // y que se usa para "Alta"/"Último acceso" de usuarios). Estas SÍ traen la
  // hora en UTC de verdad, así que hay que dejar que el motor de JS las
  // interprete de forma nativa. Antes caían en la rama YYYY-MM-DD de abajo,
  // que toma los números de hora tal cual y los trata como si ya fueran hora
  // local de Guatemala — eso adelantaba el reloj mostrado 6 horas (el
  // desfase real entre UTC y America/Guatemala).
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+\-]\d{2}:?\d{2})$/.test(str)) {
    const iso = new Date(str);
    if (!isNaN(iso.getTime())) return iso;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const h = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 6;
    const m = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const d = new Date(year, month, day, h, m, 0);
    if (!isNaN(d.getTime())) return d;
  }

  // YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})(?:[T\s](\d{1,2}):(\d{2}))?/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const h = ymdMatch[4] ? parseInt(ymdMatch[4], 10) : 6;
    const m = ymdMatch[5] ? parseInt(ymdMatch[5], 10) : 0;
    const d = new Date(year, month, day, h, m, 0);
    if (!isNaN(d.getTime())) return d;
  }

  // Spanish text format: e.g. "viernes, 31 de julio de 2026"
  const months: Record<string, number> = {
    enero: 0, ene: 0, febrero: 1, feb: 1, marzo: 2, mar: 2,
    abril: 3, abr: 3, mayo: 4, may: 4, junio: 5, jun: 5,
    julio: 6, jul: 6, agosto: 7, ago: 7, septiembre: 8, sep: 8, sept: 8,
    octubre: 9, oct: 9, noviembre: 10, nov: 10, diciembre: 11, dic: 11
  };
  const spMatch = str.toLowerCase().match(/(\d{1,2})\s+de\s+([a-záéíóú]+)(?:\s+de|\s+del)?\s+(\d{4})/i);
  if (spMatch) {
    const day = parseInt(spMatch[1], 10);
    const mKey = spMatch[2].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const year = parseInt(spMatch[3], 10);
    const month = months[mKey];
    if (month !== undefined) {
      const d = new Date(year, month, day, 6, 0, 0);
      if (!isNaN(d.getTime())) return d;
    }
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed;

  return null;
}

export function getRouteElapsedHours(route: Route): number {
  let dateObj: Date | null = null;
  if (route.fecha) {
    dateObj = parseFlexibleDate(route.fecha);
  }
  if (!dateObj || isNaN(dateObj.getTime())) {
    const fallbackStr = route.fechaCarga || route.fechaCreacion;
    if (fallbackStr) {
      dateObj = parseFlexibleDate(fallbackStr);
    }
  }
  if (!dateObj || isNaN(dateObj.getTime())) {
    return 0;
  }
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
}

export function formatDateToSpanish(d: Date | null): string {
  if (!d || isNaN(d.getTime())) return '';
  const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${days[d.getDay()]}, ${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
}

/**
 * Convierte cualquier fecha, timestamp o cadena al formato oficial de fecha de Guatemala: DD/MM/YYYY
 * Ejemplo: "31/07/2026" o "02/09/2026"
 */
export function formatDateToGuatemala(dateInput: any): string {
  if (!dateInput) return '';

  const str = String(dateInput).trim();
  // Si ya viene exactamente en formato DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    return str;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const [d, m, y] = str.split('/');
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }

  const d = dateInput instanceof Date ? dateInput : parseFlexibleDate(dateInput);
  if (!d || isNaN(d.getTime())) {
    return str || '';
  }

  try {
    const parts = new Intl.DateTimeFormat('es-GT', {
      timeZone: 'America/Guatemala',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).formatToParts(d);

    const day = parts.find((p) => p.type === 'day')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const year = parts.find((p) => p.type === 'year')?.value;
    if (day && month && year) {
      return `${day}/${month}/${year}`;
    }
  } catch {
    // Fallback manual
  }

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Convierte cualquier fecha al formato oficial de fecha y hora de Guatemala: DD/MM/YYYY HH:mm
 * Ejemplo: "02/09/2026 19:20" (Zona horaria de Guatemala UTC-6)
 */
export function formatDateTimeToGuatemala(dateInput: any = new Date()): string {
  if (!dateInput) return '';

  const d = dateInput instanceof Date ? dateInput : parseFlexibleDate(dateInput);
  if (!d || isNaN(d.getTime())) {
    return String(dateInput || '');
  }

  try {
    const parts = new Intl.DateTimeFormat('es-GT', {
      timeZone: 'America/Guatemala',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);

    const day = parts.find((p) => p.type === 'day')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const year = parts.find((p) => p.type === 'year')?.value;
    let hour = parts.find((p) => p.type === 'hour')?.value || '00';
    const minute = parts.find((p) => p.type === 'minute')?.value || '00';
    if (hour === '24') hour = '00';

    if (day && month && year) {
      return `${day}/${month}/${year} ${hour}:${minute}`;
    }
  } catch {
    // Fallback manual
  }

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Retorna la fecha actual en la zona horaria de Guatemala (America/Guatemala) en formato YYYY-MM-DD
 * para ser utilizada por inputs HTML de tipo date (<input type="date" />)
 */
export function getGuatemalaDateForInput(date: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Guatemala',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    // Fallback
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Retorna la fecha del día de mañana a partir de una fecha base (o el día de hoy)
 * en el formato oficial guatemalteco DD/MM/YYYY.
 */
export function getTomorrowGuatemalaDate(baseDateInput?: any): string {
  let baseDate: Date;
  if (baseDateInput) {
    const parsed = parseFlexibleDate(baseDateInput);
    baseDate = parsed && !isNaN(parsed.getTime()) ? parsed : new Date();
  } else {
    baseDate = new Date();
  }
  // Sumar 1 día asegurando la zona horaria
  const tomorrow = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + 1, 6, 0, 0);
  return formatDateToGuatemala(tomorrow);
}

