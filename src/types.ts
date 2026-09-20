export type RouteStatus = 'Pendiente' | 'En Tránsito' | 'Abierta' | 'Liquidada';

export type StaffPuesto = 'VPP' | 'VPPB' | 'APP';
export type StaffRol = 'Conductor' | 'Auxiliar';
export type ResourceStatus = 'Disponible' | 'En Ruta' | 'Baja';
export type AssignmentType = 'Primer Viaje' | 'Recarga' | 'Revisita' | 'Ruta a Piso';

export type TruckUnavailableReason = 'Taller' | 'Stand By' | 'Deshabilitado' | 'Consignado MP';

export type StaffUnavailableReason =
  | 'Apoyo Operaciones CBC'
  | 'Personal Autoventa'
  | 'Apoyo entre Agencias'
  | 'Ausencia sin justificación, penaliza séptimo'
  | 'Ausencia notificada - no penaliza séptimo'
  | 'Polígrafo'
  | 'Cita Judicial'
  | 'Permiso boda'
  | 'Permiso cumpleaños'
  | 'Permiso duelo'
  | 'Suspensión laboral'
  | 'Vacaciones'
  | 'Suspensión IGSS'
  | 'Cita IGSS'
  | 'Permiso sin goce de salario - no penaliza séptimo'
  | 'Permiso con goce'
  | 'Séptimo/ Descanso'
  | 'Nacimiento'
  | 'Baja'
  | 'Alta'
  | 'Ausencia día festivo o extraordinario'
  | 'Abandono de labores'
  | 'Día festivo o extraordinario';

// Clasificación de costo asociada a cada motivo de no-asignación (Taller de camiones /
// Fin de Asignación de personal). Se guarda junto con el motivo, en el momento en que
// se selecciona, para alimentar el futuro reporte de costos.
export type RemuneraStatus = 'Remunera' | 'Remunera (StandBy)' | 'No Remunera' | 'N/A';

export type StaffEstatus = 'ALTA' | 'BAJA';

// Catálogo estructurado de motivos de devolución / no-entrega utilizado al
// liquidar una ruta. Único origen de la verdad para el formulario de
// Liquidación (chips seleccionables) y, a futuro, para el desglose
// "Devoluciones por Motivo" del Dashboard. Ver '../data/motivosDevolucion'
// para el catálogo con íconos y estilos visuales.
export type MotivoDevolucionReason =
  | 'No dio tiempo de entrega (Revisita)'
  | 'Negocio Cerrado'
  | 'Sin Efectivo / Fondos'
  | 'Pedido Incompleto / Error'
  | 'Producto Dañado / Merma'
  | 'Dirección No Localizada'
  | 'Fuera de Horario / Retraso'
  | 'Cliente Rechaza Pedido';

export interface Truck {
  id: string;
  idCamion?: string;
  placa: string;
  // Agencia/planta a la que pertenece este camión. Los registros creados antes de
  // este campo pueden no tenerlo ("Sin Agencia") hasta que se corrijan por Carga
  // Masiva de Excel (empareja por Placa / ID Camión).
  agencia?: string;
  capacidad: string;
  ton?: number | string;
  bahias?: number | string;
  estado: ResourceStatus;
  rutaActual: string | null;
  motivoNoAsignado?: TruckUnavailableReason | null;
  motivoNoAsignadoFecha?: string | null;
  remuneraNoAsignado?: RemuneraStatus | null;
}

export interface Staff {
  id: string;
  dpi: string;
  codigo?: string;
  codigoCorto?: string;
  nombre: string;
  // Agencia/planta a la que pertenece este colaborador. Los registros creados
  // antes de este campo pueden no tenerlo ("Sin Agencia") hasta que se corrijan
  // por Carga Masiva de Excel (empareja por DPI / Nombre).
  agencia?: string;
  puesto: StaffPuesto;
  rol: StaffRol;
  telefono: string;
  estado: ResourceStatus;
  estatus?: StaffEstatus;
  motivoNoAsignado?: StaffUnavailableReason | null;
  motivoNoAsignadoFecha?: string | null;
  remuneraNoAsignado?: RemuneraStatus | null;
}

export interface RouteAssignment {
  camionId: string;
  camionPlaca: string;
  conductor: string;
  auxiliar1?: string | null;
  auxiliar2?: string | null;
  auxiliar3?: string | null;
  auxiliar4?: string | null;
  horaSalida: string;
  fechaDespacho?: string;
  fechaAsignacion?: string;
  tipoAsignacion?: AssignmentType;
}

export interface RouteLiquidation {
  guiasExitosas: number;
  guiasRechazadas: number;
  cajasEntregadas: number;
  cajasDevueltas: number;
  motivoDevolucion?: string;
  // Corrección: LiquidateModal/App.tsx ya guardaban estos dos campos (selección de
  // motivos de devolución en catálogo + detalle libre), pero no estaban declarados
  // aquí — quedaban fuera del tipo aunque sí se persistían en cada liquidación.
  // Se agregan para poder consumirlos de forma segura (p.ej. en el Dashboard).
  motivosSeleccionados?: MotivoDevolucionReason[];
  motivoDetalle?: string;
  auditor: string;
  // Corrección: "auditor" sigue siendo texto libre editable (a propósito: la
  // persona que firma físicamente el acta puede ser distinta de quien tiene la
  // sesión abierta en el sistema). Para tener trazabilidad real sin quitar esa
  // flexibilidad, se agrega este campo aparte con el usuario realmente logueado
  // que ejecutó la liquidación en el sistema (no editable, se llena solo).
  liquidadoPorUsuario?: string;
  fechaLiquidacion: string;
  horaLiquidacion?: string;
}

export interface RouteDispatchRecord {
  intento: number;
  camionPlaca: string;
  camionId?: string;
  conductor: string;
  auxiliares: string[];
  horaSalida?: string;
  fechaAsignacion?: string;
  fechaRetorno: string;
  cajasEntregadas: number;
  cajasDevueltas: number;
  guiasExitosas?: number;
  guiasRechazadas?: number;
  motivoDevolucion: string;
  auditor: string;
  tipoAsignacion?: AssignmentType;
}

export interface Route {
  id: string;
  agencia: string;
  mercado: string;
  fecha: string;
  fechaAsignacion?: string;
  fechaLiquidacion?: string;
  fechaOriginalRuta?: string;
  fechaReprogramada?: string;
  viaje?: string;
  servicio?: string;
  descanso?: string;
  total?: string;
  distancia?: string | number;
  paradas: number;
  paradasOriginales?: number;
  equipoFrio?: number;
  capacidadPorc?: string;
  cajas12Oz?: string | number;
  pesoKg?: string | number;
  cajasFisicas: number | string;
  cajasOriginales?: number | string;
  estado: RouteStatus;
  isSplitRoute?: boolean;
  tripNumber?: number;
  totalTrips?: number;
  parentRouteId?: string;
  originalRouteData?: Route;
  cajasDevueltasAcumuladas?: number;
  asignacion: RouteAssignment | null;
  ultimoDespacho?: RouteAssignment | null;
  historialDespachos?: RouteDispatchRecord[];
  retornosCount?: number;
  motivoDevolucion?: string;
  liquidacion: RouteLiquidation | null;
  fechaCarga?: string;
  fechaCreacion?: string;
  tipoAsignacion?: AssignmentType;
  esRecarga?: boolean;
  esReasignacion?: boolean;
  aPiso?: boolean;
  fechaPiso?: string;
  motivoPiso?: string;
  tipoRuta?: 'Entrega' | 'Traslado';
  origen?: string;
  destino?: string;
  razonTraslado?: string;
  razonTrasladoDetalle?: string;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

// --- Control de acceso (usuarios y permisos) ---

export interface TablePermissions {
  dashboard: boolean; // Dashboard
  board: boolean; // Tablero de Rutas
  liquidated: boolean; // Rutas Liquidadas
  trucks: boolean; // Camiones
  staff: boolean; // Personal
  batch: boolean; // Carga Masiva Excel
}

export interface AppUser {
  id: string;
  username: string;
  // Nombre real de la persona asignada a este usuario (opcional). Si se define,
  // se muestra en lugar del nombre de usuario de acceso en la insignia de sesión
  // (Navbar) tras iniciar sesión.
  nombre?: string;
  // Nota: al no existir un backend, la contraseña se guarda en el almacenamiento
  // local del navegador (no hay hash/cifrado real posible sin un servidor). El
  // control de acceso es funcional (evita el uso sin credenciales) pero no debe
  // tratarse como una medida de seguridad de nivel bancario.
  password: string;
  isAdmin: boolean;
  permissions: TablePermissions;
  canDelete: boolean;
  // Control de acceso por agencia: 'all' = puede ver rutas de todas las agencias;
  // si es un arreglo, solo puede ver rutas cuya agencia esté en la lista. Las
  // opciones disponibles son las mismas que el campo Origen de Ruta de Traslado
  // (ver '../data/agencies'). Un administrador siempre tiene acceso a todas.
  agencyAccess: 'all' | string[];
  createdAt: string;
  // Corrección: se agrega rastro de auditoría básico para saber quién creó cada
  // cuenta y cuándo fue el último acceso exitoso — antes no se registraba nada de
  // esto, dificultando revisar altas de usuarios o detectar cuentas inactivas.
  createdBy?: string;
  lastLogin?: string;
}
