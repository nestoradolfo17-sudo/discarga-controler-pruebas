import type { Route, Truck } from '../types';
import { getRouteKey } from './routeKey';

// --- Costos de operación (tarifario mensual por agencia) ---
// Reglas acordadas:
//  • 1er viaje: tarifa de la agencia según la tripulación (piloto + auxiliares):
//    T3 = 3 personas, T4 = 4, T5 = 5. La tarifa ya incluye camión y tripulación.
//  • Recarga (y Revisita): costo del camión + VPP por el piloto + APP por cada auxiliar.
//  • Camión de apoyo propio: igual que un viaje (tarifa T según su tripulación).
//  • Camión rentado (de ruta o de apoyo): sin tarifa; un administrador asigna el valor.
//  • Ruta a piso, Ruta Bolsón y Self Service: no generan costo.
//  • Atanasio: la tarifa depende del segmento (Atanasio, Atanasio ME, Atanasio SM).
//    Mercado Abierto, Mercados Especiales y Supermercados usan las de Atanasio.
//  • Standby (por día): personal con motivo "Remunera (StandBy)" → costo VPP o APP
//    de su agencia; camión con motivo que remunera → su costo por placa.

export interface TarifaViaje {
  agencia: string;
  t3: number;
  t4: number;
  t5: number;
  camion: number;
  vpp: number;
  app: number;
}
export interface TarifaStandbyPersonal {
  agencia: string;
  vpp: number;
  app: number;
}
export interface TarifaStandbyCamion {
  idSap?: string;
  placa: string;
  serie?: string;
  agencia?: string;
  costo: number;
}
export interface TarifarioDatos {
  viaje: TarifaViaje[];
  standbyPersonal: TarifaStandbyPersonal[];
  standbyCamiones: TarifaStandbyCamion[];
  // Segmentos de ruta que usan "Atanasio SM" y "Atanasio ME" (el resto usa "Atanasio").
  segmentosAtanasio: { SM: string[]; ME: string[] };
}
export interface Tarifario extends TarifarioDatos {
  mes: string; // 'AAAA-MM'
  actualizadoPor?: string;
  actualizadoEl?: string;
}

// Foto diaria de camiones y personal que no salieron, con su motivo.
export interface StandbyRecurso {
  id: string;
  nombre: string; // placa (camión) o nombre (persona)
  puesto?: string; // VPP / VPPB / APP (personal)
  motivo: string;
  remunera?: string | null;
}
export interface StandbyDia {
  fecha: string; // 'dd/mm/aaaa'
  agencia: string;
  camiones: StandbyRecurso[];
  personal: StandbyRecurso[];
  actualizado?: string;
}

export type TipoSalida = 'viaje' | 'recarga' | 'apoyo' | 'sin_costo';
export type Clase = 'T3' | 'T4' | 'T5';

export interface Salida {
  id: string;
  ruta: string;
  agencia: string;
  segmento: string;
  dia: string; // 'dd/mm/aaaa'
  tipoAsignacion: string;
  tipo: TipoSalida;
  camionId: string;
  placa: string;
  rentado: boolean;
  conductor: string;
  auxiliares: number;
  tripulacion: number;
  clase: Clase | null;
  tarifaUsada: string; // fila del tarifario usada (p. ej. "Atanasio SM")
  costo: number | null; // null = falta valor (rentado o sin tarifa)
  detalle: string;
  aviso?: string;
}

export interface StandbyCosto {
  dia: string;
  agencia: string;
  tipo: 'camion' | 'personal';
  nombre: string;
  puesto?: string;
  motivo: string;
  costo: number | null;
  aviso?: string;
}

export const normTxt = (s?: string | null) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
const normPlaca = (s?: string | null) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const DIA_RE = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
export const diaDeTexto = (t?: string | null) => {
  const m = DIA_RE.exec(String(t || ''));
  return m ? `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}` : '';
};
/** 'dd/mm/aaaa' → 'AAAA-MM' */
export const mesDeDia = (dia: string) => (dia ? `${dia.slice(6, 10)}-${dia.slice(3, 5)}` : '');

const GRUPO_ATANASIO = new Set(['atanasio', 'mercado abierto', 'mercados especiales', 'supermercados']);

/** Fila de tarifa por viaje que corresponde a la agencia y segmento de la ruta. */
export function tarifaViajeDe(t: TarifarioDatos, agencia: string, segmento?: string): TarifaViaje | null {
  const a = normTxt(agencia);
  let clave = a;
  if (GRUPO_ATANASIO.has(a)) {
    const seg = String(segmento || '').trim().toUpperCase();
    const enLista = (l: string[]) => l.some((x) => x.trim().toUpperCase() === seg);
    clave =
      a === 'mercados especiales'
        ? 'atanasio me'
        : a === 'supermercados'
        ? 'atanasio sm'
        : seg && enLista(t.segmentosAtanasio?.SM || [])
        ? 'atanasio sm'
        : seg && enLista(t.segmentosAtanasio?.ME || [])
        ? 'atanasio me'
        : 'atanasio';
  }
  return t.viaje.find((v) => normTxt(v.agencia) === clave) || null;
}

/** Costo de standby del personal para la agencia (Atanasio usa la fila de Mercado Abierto). */
export function tarifaStandbyPersonalDe(t: TarifarioDatos, agencia: string): TarifaStandbyPersonal | null {
  const a = normTxt(agencia);
  const fila = t.standbyPersonal.find((v) => normTxt(v.agencia) === a);
  if (fila) return fila;
  if (GRUPO_ATANASIO.has(a)) return t.standbyPersonal.find((v) => normTxt(v.agencia) === 'mercado abierto') || null;
  return null;
}

/** Aviso fijo de los viajes con menos de 3 personas (se costean como T3, la tarifa mínima). */
export const AVISO_MENOS_T3 = 'Viaje con menos de 3 personas: costeado como T3';
export const claseDe = (tripulacion: number): { clase: Clase; aviso?: string } => {
  if (tripulacion <= 3) return { clase: 'T3', aviso: tripulacion < 3 ? AVISO_MENOS_T3 : undefined };
  if (tripulacion === 4) return { clase: 'T4' };
  return { clase: 'T5', aviso: tripulacion > 5 ? `Tripulación de ${tripulacion}: se usó T5` : undefined };
};

const SIN_COSTO = new Set(['Ruta a Piso', 'Ruta Bolsón', 'Self Service']);
const ES_RECARGA = new Set(['Recarga', 'Revisita']);

/**
 * Todas las salidas (viajes, recargas, revisitas y camiones de apoyo) cuyo día
 * cae en el mes, con su costo según el tarifario.
 * manual: costos asignados a mano (camiones rentados), por id de salida.
 */
export function calcularSalidas(
  rutas: Route[],
  trucks: Truck[],
  mes: string,
  t: TarifarioDatos,
  manual: Map<string, number>
): Salida[] {
  const porId = new Map(trucks.map((x) => [String(x.id), x]));
  const porPlaca = new Map(trucks.map((x) => [normPlaca(x.placa), x]));
  const camionDe = (id?: string | null, placa?: string | null) => (id && porId.get(String(id))) || porPlaca.get(normPlaca(placa)) || null;
  const out: Salida[] = [];
  const vistas = new Set<string>();

  rutas.forEach((r) => {
    const base = `${getRouteKey(r)}|${r.tripNumber || 1}`;
    if (vistas.has(base)) return;
    vistas.add(base);
    const rutaSinCosto = !!(r.esBolson || r.esSelfService || r.tipoAsignacion === 'Ruta Bolsón' || r.tipoAsignacion === 'Self Service');
    const agencia = r.agencia || 'Sin agencia';
    const segmento = r.segmento || '';

    const agregar = (s: {
      id: string;
      tipoAsignacion: string;
      apoyo: boolean;
      camionId?: string | null;
      placa?: string | null;
      conductor?: string | null;
      auxiliares: number;
      fecha?: string | null;
    }) => {
      const dia = diaDeTexto(s.fecha) || diaDeTexto(r.fecha);
      if (mesDeDia(dia) !== mes) return;
      const camion = camionDe(s.camionId, s.placa);
      const rentado = !!camion && (camion.tipo === 'Rentado' || /^R-/.test(String(camion.idCamion || '')));
      const pilotos = s.conductor ? 1 : 0;
      const tripulacion = pilotos + s.auxiliares;
      const sinCosto = rutaSinCosto || SIN_COSTO.has(s.tipoAsignacion);
      const tipo: TipoSalida = sinCosto ? 'sin_costo' : s.apoyo ? 'apoyo' : ES_RECARGA.has(s.tipoAsignacion) ? 'recarga' : 'viaje';
      const tv = tarifaViajeDe(t, agencia, segmento);
      let costo: number | null = 0;
      let clase: Clase | null = null;
      let detalle = '';
      let aviso: string | undefined;
      if (tipo === 'sin_costo') {
        detalle = `${s.tipoAsignacion || 'Sin costo'}: no genera costo`;
      } else if (rentado) {
        const m = manual.get(s.id);
        costo = m == null ? null : m;
        detalle = m == null ? 'Camión rentado: falta asignar el costo' : 'Camión rentado: costo asignado';
      } else if (!tv) {
        costo = null;
        aviso = `Sin tarifa de viaje para ${agencia}`;
        detalle = aviso;
      } else if (tipo === 'recarga') {
        costo = tv.camion + tv.vpp * pilotos + tv.app * s.auxiliares;
        detalle = `Camión Q${tv.camion.toFixed(2)} + ${pilotos} VPP + ${s.auxiliares} APP`;
      } else {
        const c = claseDe(tripulacion);
        clase = c.clase;
        aviso = c.aviso;
        costo = c.clase === 'T3' ? tv.t3 : c.clase === 'T4' ? tv.t4 : tv.t5;
        detalle =
          tripulacion < 3
            ? `Tarifa T3 aplicada a ${tripulacion} persona(s): ${pilotos ? 'piloto' : 'sin piloto'} + ${s.auxiliares} APP`
            : `Tarifa ${c.clase} (${tripulacion} personas)`;
      }
      if (!camion && tipo !== 'sin_costo') aviso = aviso || 'Camión no encontrado en el catálogo: se tomó como propio';
      out.push({
        id: s.id,
        ruta: String(r.id),
        agencia,
        segmento,
        dia,
        tipoAsignacion: s.apoyo ? 'Camión de apoyo' : s.tipoAsignacion || 'Primer Viaje',
        tipo,
        camionId: String(s.camionId || camion?.id || ''),
        placa: String(s.placa || camion?.placa || ''),
        rentado,
        conductor: String(s.conductor || ''),
        auxiliares: s.auxiliares,
        tripulacion,
        clase,
        tarifaUsada: tv?.agencia || '',
        costo,
        detalle,
        aviso,
      });
    };

    const hist = r.historialDespachos || [];
    hist.forEach((d, i) =>
      agregar({
        id: `${base}|${d.intento || i + 1}`,
        tipoAsignacion: d.tipoAsignacion || (i === 0 ? 'Primer Viaje' : 'Revisita'),
        apoyo: false,
        camionId: d.camionId,
        placa: d.camionPlaca,
        conductor: d.conductor && d.conductor !== 'Sin piloto' ? d.conductor : '',
        auxiliares: (d.auxiliares || []).filter(Boolean).length,
        fecha: d.fechaAsignacion || d.fechaRetorno,
      })
    );
    const a = r.asignacion;
    if (a) {
      agregar({
        id: `${base}|${hist.length + 1}`,
        tipoAsignacion: a.tipoAsignacion || r.tipoAsignacion || (r.esRecarga ? 'Recarga' : hist.length ? 'Revisita' : 'Primer Viaje'),
        apoyo: false,
        camionId: a.camionId,
        placa: a.camionPlaca,
        conductor: a.conductor,
        auxiliares: [a.auxiliar1, a.auxiliar2, a.auxiliar3, a.auxiliar4].filter(Boolean).length,
        fecha: a.fechaAsignacion || a.fechaDespacho || r.fechaAsignacion,
      });
    }
    (r.apoyos || []).forEach((ap) =>
      agregar({
        id: `${base}|apoyo|${ap.id}`,
        tipoAsignacion: 'Camión de apoyo',
        apoyo: true,
        camionId: ap.camionId,
        placa: ap.camionPlaca,
        conductor: ap.conductor,
        auxiliares: (ap.auxiliares || []).filter(Boolean).length,
        fecha: ap.registradoEn,
      })
    );
  });
  return out;
}

/** Costo del standby de cada día (fotos guardadas) dentro del mes. */
export function calcularStandby(dias: StandbyDia[], mes: string, t: TarifarioDatos): StandbyCosto[] {
  const porPlaca = new Map(t.standbyCamiones.map((c) => [normPlaca(c.placa), c]));
  const out: StandbyCosto[] = [];
  dias
    .filter((d) => mesDeDia(d.fecha) === mes)
    .forEach((d) => {
      (d.camiones || []).forEach((c) => {
        if (c.remunera !== 'Remunera') return;
        const fila = porPlaca.get(normPlaca(c.nombre));
        out.push({
          dia: d.fecha,
          agencia: d.agencia,
          tipo: 'camion',
          nombre: c.nombre,
          motivo: c.motivo,
          costo: fila ? fila.costo : null,
          aviso: fila ? undefined : `Placa ${c.nombre} sin costo de standby en el tarifario`,
        });
      });
      const tp = tarifaStandbyPersonalDe(t, d.agencia);
      (d.personal || []).forEach((p) => {
        if (p.remunera !== 'Remunera (StandBy)') return;
        const esApp = String(p.puesto || '').toUpperCase() === 'APP';
        out.push({
          dia: d.fecha,
          agencia: d.agencia,
          tipo: 'personal',
          nombre: p.nombre,
          puesto: p.puesto,
          motivo: p.motivo,
          costo: tp ? (esApp ? tp.app : tp.vpp) : null,
          aviso: tp ? undefined : `Sin costo de standby de personal para ${d.agencia}`,
        });
      });
    });
  return out;
}

export interface ResumenAgencia {
  agencia: string;
  viajesN: number;
  viajesQ: number;
  recargasN: number;
  recargasQ: number;
  apoyosN: number;
  apoyosQ: number;
  stbPerN: number;
  stbPerQ: number;
  stbCamN: number;
  stbCamQ: number;
  pendientes: number; // salidas sin valor (rentados o sin tarifa)
  total: number;
}

export function resumirPorAgencia(salidas: Salida[], standby: StandbyCosto[]): ResumenAgencia[] {
  const m = new Map<string, ResumenAgencia>();
  const fila = (ag: string) => {
    let x = m.get(ag);
    if (!x) {
      x = { agencia: ag, viajesN: 0, viajesQ: 0, recargasN: 0, recargasQ: 0, apoyosN: 0, apoyosQ: 0, stbPerN: 0, stbPerQ: 0, stbCamN: 0, stbCamQ: 0, pendientes: 0, total: 0 };
      m.set(ag, x);
    }
    return x;
  };
  salidas.forEach((s) => {
    if (s.tipo === 'sin_costo') return;
    const x = fila(s.agencia);
    const q = s.costo ?? 0;
    if (s.costo == null) x.pendientes += 1;
    if (s.tipo === 'viaje') {
      x.viajesN += 1;
      x.viajesQ += q;
    } else if (s.tipo === 'recarga') {
      x.recargasN += 1;
      x.recargasQ += q;
    } else {
      x.apoyosN += 1;
      x.apoyosQ += q;
    }
    x.total += q;
  });
  standby.forEach((s) => {
    const x = fila(s.agencia);
    const q = s.costo ?? 0;
    if (s.tipo === 'personal') {
      x.stbPerN += 1;
      x.stbPerQ += q;
    } else {
      x.stbCamN += 1;
      x.stbCamQ += q;
    }
    x.total += q;
  });
  return [...m.values()].sort((a, b) => b.total - a.total);
}
