import { CajaAbiertaReason } from '../types';

export interface CajaAbiertaOption {
  reason: CajaAbiertaReason;
  icon: string;
}

// Catálogo único de motivos por los que la Caja (POS) de una ruta queda
// pendiente de validar al liquidar (estado "Caja Abierta"), seleccionable como
// "chips" (selección única) en el formulario de Liquidación (ver
// LiquidateModal). Es completamente independiente del catálogo de Motivos de
// Devolución (ver motivosDevolucion.ts): estos motivos no describen qué pasó
// con la mercadería entregada/devuelta, sino por qué no se pudo cerrar la
// caja/boleta del punto de venta en el momento de la liquidación.
export const CAJA_ABIERTA_OPTIONS: CajaAbiertaOption[] = [
  { reason: 'PIN de Abasto', icon: '🔑' },
  { reason: 'Pendiente Validación de Boleta', icon: '🧾' },
  { reason: 'Fuera POS', icon: '📴' },
];
