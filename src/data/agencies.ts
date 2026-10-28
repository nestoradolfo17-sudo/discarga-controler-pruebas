// Lista compartida de agencias/plantas utilizada tanto en el formulario de
// creación de Ruta de Traslado (campo Origen) como en el control de acceso
// por agencia al crear usuarios (apartado "Usuarios").
export const AGENCIA_LOCATION_OPTIONS: string[] = [
  'Barberena',
  'Chiquimulilla',
  'Coatepeque',
  'Coban',
  'Cocales',
  'Cuyotenango',
  'El Progreso',
  'Escuintla',
  'Jalapa',
  'Jutiapa',
  'Las Casas',
  'Mercado Abierto',
  'Mercados Especiales',
  'Naranjo',
  'Playa Grande',
  'Polochic',
  'Salama',
  'San Marcos',
  'Supermercados',
  'Tacana',
  'Villa Nueva',
  'Xela',
  'La Mariposa',
  'Planta Cuyotenango',
  'Atanasio',
];

// Código corto de cada agencia para el ID de camiones rentados (R-TRX-XEL-001).
// Debe coincidir con public.dc_codigo_agencia() en supabase/fase15_proveedores_rentados.sql.
const CODIGOS_AGENCIA: Record<string, string> = {
  barberena: 'BAR',
  chiquimulilla: 'CHQ',
  coatepeque: 'CTP',
  coban: 'CBN',
  cocales: 'COC',
  cuyotenango: 'CUY',
  elprogreso: 'EPG',
  escuintla: 'ESC',
  jalapa: 'JAL',
  jutiapa: 'JUT',
  lascasas: 'LCS',
  mercadoabierto: 'MAB',
  mercadosespeciales: 'MES',
  naranjo: 'NAR',
  playagrande: 'PGR',
  polochic: 'POL',
  salama: 'SAL',
  sanmarcos: 'SMA',
  supermercados: 'SUP',
  tacana: 'TAC',
  villanueva: 'VNU',
  xela: 'XEL',
  lamariposa: 'LMA',
  plantacuyotenango: 'PCU',
  atanasio: 'ATA',
};

export const codigoAgencia = (agencia: string | undefined | null): string => {
  const limpio = String(agencia || '').replace(/[^A-Za-z0-9]/g, '');
  return CODIGOS_AGENCIA[limpio.toLowerCase()] || (limpio + 'XXX').slice(0, 3).toUpperCase();
};
