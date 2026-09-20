import { TruckUnavailableReason, StaffUnavailableReason, RemuneraStatus } from '../types';

// Motivos de "Camión Sin Asignar" (Fin de Asignación) y su clasificación de Remunera,
// tal como fueron definidos por el usuario para el reporte de costos.
export const TRUCK_REASON_OPTIONS: TruckUnavailableReason[] = [
  'Taller',
  'Stand By',
  'Deshabilitado',
  'Consignado MP',
];

export const TRUCK_REASON_REMUNERA: Record<TruckUnavailableReason, RemuneraStatus> = {
  Taller: 'Remunera',
  'Stand By': 'Remunera',
  Deshabilitado: 'Remunera',
  'Consignado MP': 'Remunera',
};

// Motivos de "Personal Sin Asignar" (Fin de Asignación) y su clasificación de Remunera.
export const STAFF_REASON_OPTIONS: StaffUnavailableReason[] = [
  'Apoyo Operaciones CBC',
  'Personal Autoventa',
  'Apoyo entre Agencias',
  'Ausencia sin justificación, penaliza séptimo',
  'Ausencia notificada - no penaliza séptimo',
  'Polígrafo',
  'Cita Judicial',
  'Permiso boda',
  'Permiso cumpleaños',
  'Permiso duelo',
  'Suspensión laboral',
  'Vacaciones',
  'Suspensión IGSS',
  'Cita IGSS',
  'Permiso sin goce de salario - no penaliza séptimo',
  'Permiso con goce',
  'Séptimo/ Descanso',
  'Nacimiento',
  'Baja',
  'Alta',
  'Ausencia día festivo o extraordinario',
  'Abandono de labores',
  'Día festivo o extraordinario',
];

export const STAFF_REASON_REMUNERA: Record<StaffUnavailableReason, RemuneraStatus> = {
  'Apoyo Operaciones CBC': 'Remunera (StandBy)',
  'Personal Autoventa': 'Remunera (StandBy)',
  'Apoyo entre Agencias': 'Remunera (StandBy)',
  'Ausencia sin justificación, penaliza séptimo': 'No Remunera',
  'Ausencia notificada - no penaliza séptimo': 'No Remunera',
  'Polígrafo': 'Remunera (StandBy)',
  'Cita Judicial': 'Remunera (StandBy)',
  'Permiso boda': 'Remunera (StandBy)',
  'Permiso cumpleaños': 'Remunera (StandBy)',
  'Permiso duelo': 'Remunera (StandBy)',
  'Suspensión laboral': 'No Remunera',
  'Vacaciones': 'Remunera (StandBy)',
  'Suspensión IGSS': 'No Remunera',
  'Cita IGSS': 'No Remunera',
  'Permiso sin goce de salario - no penaliza séptimo': 'No Remunera',
  'Permiso con goce': 'Remunera (StandBy)',
  'Séptimo/ Descanso': 'N/A',
  'Nacimiento': 'Remunera (StandBy)',
  'Baja': 'N/A',
  'Alta': 'N/A',
  'Ausencia día festivo o extraordinario': 'No Remunera',
  'Abandono de labores': 'N/A',
  'Día festivo o extraordinario': 'N/A',
};
