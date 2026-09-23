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

// Catálogo de motivos por los que la Caja (POS) de una ruta liquidada queda
// pendiente de validar (nuevo estado "Caja Abierta" del módulo de Liquidación).
// Es independiente del catálogo de Motivos de Devolución de arriba: estos NO
// tienen que ver con la mercadería entregada/devuelta, sino con el cierre de
// caja/boleta del punto de venta al momento de liquidar. Ver
// '../data/motivosCajaAbierta' para el catálogo con íconos.
export type CajaAbiertaReason = 'PIN de Abasto' | 'Pendiente Validación de Boleta' | 'Fuera POS';

// Un cliente/punto de venta dentro de una ruta, tal como viene en el archivo
// "Clientes N" que envía el cliente (operador logístico) junto con el resumen de
// rutas del día. "cajas" es la suma de la columna VENTA de todas las líneas de
// ese cliente dentro de esa ruta (un mismo cliente puede traer varias líneas —
// varias facturas— dentro de la misma ruta; se guardan ya sumadas). Es
// información de solo consulta/referencia: no participa en ningún cálculo de
// Cajas Físicas, Paradas ni Liquidación de la ruta salvo que el usuario la use
// explícitamente al marcar Clientes Pendientes (ver ClientePendiente abajo).
export interface RouteClientEntry {
  codigo: string;
  nombre: string;
  cajas: number;
}

// Un cliente de la ruta que quedó marcado como pendiente al momento de liquidar
// en modalidad "Ruta Abierta" o "Caja Abierta" (ver LiquidateModal), junto con el
// motivo puntual de ESE cliente (tomado del mismo catálogo que ya existía a nivel
// de ruta: motivosDevolucion.ts para Ruta Abierta, motivosCajaAbierta.ts para
// Caja Abierta). Se guarda además "cajas" (copiado de RouteClientEntry al
// momento de marcarlo) para poder recalcular sumas históricas sin depender de
// que clientesRuta siga existiendo en la ruta más adelante.
export interface ClientePendiente {
  codigo: string;
  nombre: string;
  motivo: string;
  cajas?: number;
}

export interface Truck {
  id: string;
  idCamion?: string;
  placa: string;
  // Agencia/planta a la que pertenece este camión. Los registros creados antes de
  // este campo pueden no tenerlo ("Sin Agencia") hasta que se corrijan por Carga
  // Masiva de Excel (empareja por Placa / ID Camión).
  agencia?: string;
  // Proveedor / empresa dueña del camión (por ejemplo, si es una unidad propia o de
  // un proveedor de transporte tercerizado).
  proveedor?: string;
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

// Registro de un cambio de status dentro del ciclo de vida de una liquidación
// (por ejemplo: "Liquidada" o "Caja Abierta" al momento de liquidar, y más
// adelante "Liquidación Final" cuando se resuelve una Caja Abierta pendiente),
// junto con la fecha exacta en que ocurrió. Se guarda como lista ordenada
// (se agrega al final conforme ocurre cada paso) para poder mostrar en el
// Tablero de Rutas Liquidadas una línea de tiempo clara de todo el proceso.
export interface RouteLiquidationStatusEntry {
  estado: string;
  fecha: string;
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
  // Comentario libre y opcional que se captura en el momento de liquidar (las 3
  // modalidades: Liquidada, Ruta Abierta y Caja Abierta), para dejar contexto
  // adicional que no encaja en los campos estructurados (motivo, auditor, etc.).
  comentario?: string;
  // Nuevo estado "Caja Abierta": la ruta se liquida normalmente (libera piloto,
  // auxiliares y camión, y pasa al Tablero de Rutas Liquidadas), pero queda
  // marcada como pendiente de validar la caja/boleta del punto de venta hasta
  // que se resuelva. Ver CajaAbiertaReason en este mismo archivo.
  cajaAbierta?: boolean;
  motivoCajaAbierta?: CajaAbiertaReason;
  // Liquidación Final: para una ruta que quedó en Caja Abierta, esta opción
  // (disponible desde el Tablero de Rutas Liquidadas) permite cerrar
  // definitivamente el pendiente de validación una vez resuelto, sin alterar
  // los datos operativos ya liquidados (cajas, paradas, motivo, etc.).
  cajaAbiertaResuelta?: boolean;
  fechaLiquidacionFinal?: string;
  comentarioLiquidacionFinal?: string;
  // Historial ordenado de los status por los que ha pasado esta liquidación
  // (ver RouteLiquidationStatusEntry arriba), para mostrarlo en el Tablero de
  // Rutas Liquidadas.
  historialEstados?: RouteLiquidationStatusEntry[];
  // Clientes de la ruta (ver RouteClientEntry en Route.clientesRuta) que se
  // marcaron puntualmente como pendientes al liquidar en modalidad Ruta Abierta
  // o Caja Abierta, cada uno con su propio motivo. Solo se llena cuando la ruta
  // tenía clientesRuta cargado (import de Excel con detalle de clientes); si no,
  // la liquidación sigue funcionando igual que siempre, sin este detalle.
  clientesPendientes?: ClientePendiente[];
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
  // Comentario libre y opcional capturado al registrar el retorno (misma
  // captura que el campo de comentario del modal de liquidación).
  comentario?: string;
  // Clientes que se marcaron pendientes en ESTE intento/retorno puntual (Ruta
  // Abierta), cada uno con su motivo — ver ClientePendiente. Queda en el
  // historial de despachos para trazabilidad aunque la ruta se vuelva a
  // despachar y su lista de clientesRuta se reduzca solo a estos pendientes.
  clientesPendientes?: ClientePendiente[];
}

export interface Route {
  id: string;
  agencia: string;
  mercado: string;
  // Segmento de la ruta (por ejemplo, clasificación operativa/comercial adicional
  // a la Agencia y el Mercado). Se captura desde la Plantilla de Carga de Rutas,
  // se muestra en el Tablero de Rutas y viaja con la ruta hasta su liquidación.
  segmento?: string;
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
  // Lista de clientes/puntos de venta de esta ruta (solo consulta/referencia),
  // cargada desde el archivo "Clientes N" que envía el cliente junto al resumen
  // de rutas del día (ver RouteClientEntry). Opcional: las rutas cargadas antes
  // de esta función, o sin ese archivo disponible, simplemente no la traen y
  // todo sigue funcionando exactamente igual que hoy.
  clientesRuta?: RouteClientEntry[];
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
  batch: boolean; // Carga Masiva Excel (Rutas)
  // Corrección: permisos independientes para poder AGREGAR Camiones/Personal (por
  // Excel o manualmente) sin dar permiso para editar los registros ya cargados
  // previamente — la carga masiva de Camiones/Personal ahora solo agrega
  // registros nuevos y nunca sobrescribe uno existente que ya estaba en el
  // sistema (ver handleImportTrucksBatch / handleImportStaffBatch en App.tsx).
  // Nota de compatibilidad: los usuarios creados ANTES de este cambio no tienen
  // estos 4 campos guardados todavía; en tiempo de ejecución se tratan como
  // permitidos (true) mientras no se guarden explícitamente en false, para no
  // quitarles de golpe algo que ya podían hacer (ver App.tsx y UsersView.tsx).
  canBulkUploadTrucks: boolean; // Subir Excel de Camiones
  canManualAddTrucks: boolean; // Agregar Camiones manualmente
  canBulkUploadStaff: boolean; // Subir Excel de Personal
  canManualAddStaff: boolean; // Agregar Personal manualmente
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
  // Solo se usa en modo local (sin Supabase). Con Supabase Auth la contraseña
  // la maneja el servidor y la aplicación nunca la conoce.
  password?: string;
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
  // Con Supabase: un usuario desactivado no puede entrar ni ver datos.
  activo?: boolean;
}
