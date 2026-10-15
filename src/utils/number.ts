// --- Lectura segura de cantidades (cajas, 12 Oz, peso) ---
//
// Las rutas cargadas desde Excel guardan las cantidades como TEXTO con el
// formato de la celda, p. ej. "450.000" o "8,561.000" (coma de miles). Con
// Number("8,561.000") el resultado es NaN (se contaba como 0) y con
// parseFloat("8,561.000") daba 8: por eso los totales de cajas no cuadraban
// cuando una ruta tenía 1,000 cajas o más. toNum entiende esos formatos sin
// cambiar el dato guardado.

export function toNum(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v === null || v === undefined) return 0;
  let s = String(v).replace(/[\s ]/g, '').replace(/[^0-9.,-]/g, '');
  if (!s) return 0;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // El separador que aparece al final es el decimal.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    // "8,561" / "1,234,567" = miles; "8,5" = decimal.
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (hasDot && /^-?\d{1,3}(\.\d{3}){2,}$/.test(s)) {
    // "1.234.567" = miles con punto.
    s = s.replace(/\./g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Texto numérico limpio para guardar (sin separador de miles), p. ej. "8561.000". */
export function limpiarNumeroTexto(v: string): string {
  if (!v) return v;
  const raw = String(v).trim();
  // Sin coma no hay separador de miles que quitar: se deja igual que antes.
  if (!raw.includes(',') || !/\d/.test(raw)) return raw;
  const n = toNum(raw);
  const s = String(n);
  const decimales = s.includes('.') ? s.split('.')[1].length : 0;
  // Conserva los decimales que traía la celda (p. ej. "8,561.000" -> "8561.000").
  const tras = raw.lastIndexOf('.') > raw.lastIndexOf(',') ? raw.slice(raw.lastIndexOf('.') + 1).replace(/\D/g, '') : '';
  const decCelda = tras.length;
  return n.toFixed(Math.min(6, Math.max(decimales, decCelda)));
}
