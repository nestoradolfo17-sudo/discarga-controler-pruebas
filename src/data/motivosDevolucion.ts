import { MotivoDevolucionReason } from '../types';

export interface MotivoDevolucionOption {
  reason: MotivoDevolucionReason;
  icon: string;
  style: 'default' | 'warning' | 'danger';
}

// Catálogo único de motivos de devolución / no-entrega, seleccionable como
// "chips" en el formulario de Liquidación (ver LiquidateModal). Es el único
// lugar donde se define esta lista: agregar un motivo nuevo aquí lo hace
// disponible automáticamente en el formulario y, a futuro, en el desglose
// "Devoluciones por Motivo" del Dashboard.
export const MOTIVO_DEVOLUCION_OPTIONS: MotivoDevolucionOption[] = [
  { reason: 'Negocio Cerrado', icon: '🔒', style: 'default' },
  { reason: 'Sin Efectivo / Fondos', icon: '💵', style: 'default' },
  { reason: 'Pedido Incompleto / Error', icon: '📄', style: 'default' },
  { reason: 'Producto Dañado / Merma', icon: '⚠️', style: 'warning' },
  { reason: 'Dirección No Localizada', icon: '📍', style: 'default' },
  { reason: 'Fuera de Horario / Retraso', icon: '⏰', style: 'default' },
  { reason: 'Cliente Rechaza Pedido', icon: '🚫', style: 'danger' },
];

// Motivo especial de Revisita: se mantiene separado del catálogo genérico
// porque, además de agregarse a la selección, cambia automáticamente la
// Modalidad de Cierre a "Ruta Abierta" en el formulario de Liquidación.
export const MOTIVO_REVISITA: MotivoDevolucionReason = 'No dio tiempo de entrega (Revisita)';

// Lista completa (incluyendo Revisita) útil para validaciones o reportes que
// necesiten reconocer cualquier motivo del catálogo.
export const ALL_MOTIVO_DEVOLUCION_REASONS: MotivoDevolucionReason[] = [
  MOTIVO_REVISITA,
  ...MOTIVO_DEVOLUCION_OPTIONS.map((o) => o.reason),
];
