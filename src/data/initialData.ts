import { Route, Truck, Staff, AppUser } from '../types';

// Usuario administrador inicial: único con el que se puede ingresar la primera vez.
// Solo este usuario (o cualquier otro que él mismo cree como administrador) puede
// crear nuevos usuarios y asignarles permisos desde el apartado "Usuarios".
export const INITIAL_USERS: AppUser[] = [
  {
    id: 'U-ADMIN',
    username: 'admin',
    password: '1605',
    isAdmin: true,
    permissions: { dashboard: true, board: true, liquidated: true, trucks: true, staff: true, batch: true },
    canDelete: true,
    agencyAccess: 'all',
    createdAt: new Date().toISOString(),
  },
];

export const INITIAL_TRUCKS: Truck[] = [
  { id: 'T-1', idCamion: '381', placa: 'C-101 (P-882BKX)', agencia: 'Mercado Abierto', capacidad: '450', ton: 12, bahias: 10, estado: 'Disponible', rutaActual: null },
  { id: 'T-2', idCamion: '382', placa: 'C-102 (P-441DFG)', agencia: 'Mercado Abierto', capacidad: '500', ton: 14, bahias: 12, estado: 'En Ruta', rutaActual: '102201' },
  { id: 'T-3', idCamion: '383', placa: 'C-103 (P-993KLM)', agencia: 'Mercado Abierto', capacidad: '650', ton: 18, bahias: 14, estado: 'Disponible', rutaActual: null },
  { id: 'T-4', idCamion: '384', placa: 'C-104 (P-112ZXC)', agencia: 'Mercado Abierto', capacidad: '300', ton: 8, bahias: 6, estado: 'Disponible', rutaActual: null }
];

export const INITIAL_STAFF: Staff[] = [
  { id: 'S-1', dpi: '2541 89320 0101', codigo: 'DISAOC-00001', nombre: 'Carlos René Morales', agencia: 'Mercado Abierto', puesto: 'VPP', rol: 'Conductor', codigoCorto: '1001', telefono: '5541-8890', estado: 'En Ruta', estatus: 'ALTA' },
  { id: 'S-2', dpi: '1984 55421 0101', codigo: 'DISAOC-00002', nombre: 'Eduardo Rivas', agencia: 'Mercado Abierto', puesto: 'VPP', rol: 'Conductor', codigoCorto: '1002', telefono: '5589-2211', estado: 'Disponible', estatus: 'ALTA' },
  { id: 'S-3', dpi: '3002 44192 0101', codigo: 'DISAOC-00003', nombre: 'Josué Alarcón', agencia: 'Mercado Abierto', puesto: 'VPPB', rol: 'Conductor', codigoCorto: '1003', telefono: '5512-3344', estado: 'Disponible', estatus: 'ALTA' },
  { id: 'S-4', dpi: '2119 77810 0101', codigo: 'DISAOC-00004', nombre: 'Pedro Gómez', agencia: 'Mercado Abierto', puesto: 'APP', rol: 'Auxiliar', codigoCorto: '1004', telefono: '5590-7766', estado: 'En Ruta', estatus: 'ALTA' },
  { id: 'S-5', dpi: '2650 11920 0101', codigo: 'DISAOC-00005', nombre: 'Juan Pérez García', agencia: 'Mercado Abierto', puesto: 'APP', rol: 'Auxiliar', codigoCorto: '1005', telefono: '5566-4433', estado: 'En Ruta', estatus: 'ALTA' },
  { id: 'S-6', dpi: '1890 33412 0101', codigo: 'DISAOC-00006', nombre: 'David Morales', agencia: 'Mercado Abierto', puesto: 'APP', rol: 'Auxiliar', codigoCorto: '1006', telefono: '5533-9911', estado: 'En Ruta', estatus: 'ALTA' },
  { id: 'S-7', dpi: '2774 99182 0101', codigo: 'DISAOC-00007', nombre: 'Mario Velásquez', agencia: 'Mercado Abierto', puesto: 'APP', rol: 'Auxiliar', codigoCorto: '1007', telefono: '5577-1122', estado: 'Disponible', estatus: 'ALTA' }
];

export const INITIAL_ROUTES: Route[] = [
  {
    id: '102201',
    agencia: 'Mercado Abierto',
    mercado: 'Mercado Abierto',
    fecha: '31/07/2026',
    fechaOriginalRuta: '31/07/2026',
    viaje: '01:29',
    servicio: '08:12',
    descanso: '00:45',
    total: '10:27',
    distancia: '16.8',
    paradas: 63,
    equipoFrio: 53,
    capacidadPorc: '102.49 %',
    cajas12Oz: '348.3',
    pesoKg: '4478.203',
    cajasFisicas: '384.336',
    estado: 'En Tránsito',
    fechaAsignacion: '31/07/2026 06:30',
    asignacion: {
      camionPlaca: 'C-102 (P-441DFG)',
      camionId: 'T-2',
      conductor: 'Carlos René Morales',
      auxiliar1: 'Pedro Gómez',
      auxiliar2: 'Juan Pérez García',
      auxiliar3: 'David Morales',
      horaSalida: '06:30',
      fechaDespacho: '31/07/2026',
      fechaAsignacion: '31/07/2026 06:30',
    },
    liquidacion: null,
    fechaCarga: '31/07/2026 06:15',
    fechaCreacion: '31/07/2026 06:15'
  }
];
