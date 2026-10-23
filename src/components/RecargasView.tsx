import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Repeat, Plus, Download, Search, Pencil, Trash2, AlertTriangle, RefreshCw, Zap, ShieldCheck, Check, X, Clock, Printer } from 'lucide-react';
import { EstadoRecarga, Prestamo, Recarga, Route, Staff, TipoRecarga } from '../types';
import { cubreFecha, prestamoCerrado, formatoCorrelativoPrestamo, estadoPrestamo } from '../utils/prestamos';
import { RecargaModal, TIPOS_RECARGA } from './modals/RecargaModal';
import { leerRecargas, guardarRecarga, guardarRecargas, eliminarRecarga, suscribirRecargas, nuevoIdRecarga, formatoCorrelativo, crearSituacionRecargas, estadoRecarga } from '../services/recargas';
import { imprimirBoletaRecarga } from '../utils/boletaRecarga';
import { getGuatemalaDateForInput } from '../utils/date';
import { loadXLSX, formatoMiles } from '../utils/excel';
import { isDemoMode } from '../services/demoMode';

import { fmtNum } from '../utils/number';
// --- Módulo de Recargas ---
// Registro de las recargas realizadas (manuales y las que se crean solas al
// asignar una ruta como "Recarga"), con filtros por rango de fechas, agencia,
// tipo y estado, y un reporte en Excel de lo que se ve.
//
// Viajes de Recarga del Tablero: se registran al asignar, pero quedan "En ruta"
// y NO se pueden autorizar hasta que el viaje se LIQUIDA (entonces pasan a
// "Pendiente" = Por autorizar).
//
// Autorización: toda recarga manual nace "Pendiente". Solo un administrador la pasa a
// "Autorizada" (cuenta para pago) o "Rechazada" (con motivo). Si alguien que
// no es administrador cambia una recarga ya revisada, vuelve a "Pendiente".
// La base de datos aplica la misma regla (ver supabase/fase8_recargas.sql).

interface RecargasViewProps {
  rutas: Route[];
  staff: Staff[];
  agencias: string[]; // agencias que el usuario puede ver
  agenciaGeneral: string; // filtro de agencia de la barra superior ('TODAS' = todas)
  usuario: string;
  isAdmin: boolean;
  canDelete: boolean;
  // Administrador de agencias: autoriza, edita y elimina recargas de estas agencias.
  adminAgencias?: string[];
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info', action?: { label: string; onClick: () => void }) => void;
  // Préstamos entre agencias: las recargas hechas en préstamo solo se pagan
  // con el préstamo autorizado y devuelto.
  prestamos?: Prestamo[];
}

const VIAJES: Record<TipoRecarga, number> = { Simple: 1, Doble: 2, Triple: 3 };
// Valor a pagar por cada recarga SIMPLE según el puesto (Doble = x2, Triple = x3).
// Solo se usa en el Excel; no se muestra en pantalla.
const TARIFA_RECARGA: Record<string, number> = { VPP: 125, VPPB: 125, APP: 75 };
const tarifaDe = (puesto: string) => TARIFA_RECARGA[puesto] ?? (puesto === 'APP' ? 75 : 125);
const fmt = (iso: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso || '-');
const fmtHora = (iso?: string) => {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  } catch {
    return iso;
  }
};
const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const primeroDeMes = () => getGuatemalaDateForInput().slice(0, 8) + '01';

// Cómo se nombra una recarga en botones y avisos.
const etq = (r: Recarga) => (r.sinRuta || !r.rutaId ? formatoCorrelativo(r.correlativo) || 'sin ruta' : `ruta ${r.rutaId}`);

const badgeTipo = (t: TipoRecarga) =>
  t === 'Triple'
    ? 'bg-amber-100 text-amber-800 border-amber-300'
    : t === 'Doble'
    ? 'bg-violet-100 text-violet-800 border-violet-300'
    : 'bg-sky-100 text-sky-800 border-sky-300';

const ESTADO_STYLE: Record<EstadoRecarga, string> = {
  'En ruta': 'bg-sky-50 text-sky-800 border-sky-300',
  Pendiente: 'bg-amber-50 text-amber-800 border-amber-300',
  Autorizada: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  Rechazada: 'bg-rose-50 text-rose-700 border-rose-300',
};

// Campos que, si cambian, obligan a una nueva autorización.
const contenido = (r: Partial<Recarga>) =>
  JSON.stringify([r.solicitadoPor || '', r.fecha, r.rutaId, !!r.sinRuta, r.agencia, r.tipo, r.conductor, r.auxiliares, r.camionPlaca, r.comentario || '']);

export const RecargasView: React.FC<RecargasViewProps> = ({ rutas, staff, agencias, agenciaGeneral, usuario, isAdmin, canDelete, onShowToast, prestamos = [] as Prestamo[], adminAgencias = [] as string[] }) => {
  // ¿Puede autorizar / modificar las recargas de esta agencia?
  const adminDe = (ag?: string) => isAdmin || (!!ag && adminAgencias.includes(ag));
  const aprobador = isAdmin || adminAgencias.length > 0;
  // Estado en pantalla: un viaje de Recarga que aún no se liquida queda
  // "En ruta" y no se puede autorizar (ver services/recargas.ts).
  const situacion = useMemo(() => crearSituacionRecargas(rutas), [rutas]);
  const estadoDe = useCallback((r: Recarga): EstadoRecarga => estadoRecarga(r, situacion), [situacion]);
  const [recargas, setRecargas] = useState<Recarga[]>([]);
  const [cargando, setCargando] = useState(true);
  const [tablaFalta, setTablaFalta] = useState(false);
  const [errorLectura, setErrorLectura] = useState('');
  const [desde, setDesde] = useState(primeroDeMes);
  const [hasta, setHasta] = useState(() => getGuatemalaDateForInput());
  const [agencia, setAgencia] = useState('');
  const [tipo, setTipo] = useState<'' | TipoRecarga>('');
  const [estado, setEstado] = useState<'' | EstadoRecarga>('Pendiente');
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState<{ abierto: boolean; recarga: Recarga | null }>({ abierto: false, recarga: null });
  const [guardando, setGuardando] = useState(false);
  const [porEliminar, setPorEliminar] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [rechazo, setRechazo] = useState<{ id: string; motivo: string } | null>(null);
  const [procesando, setProcesando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const res = await leerRecargas();
    setCargando(false);
    if (res.ok) {
      setRecargas(res.data);
      setTablaFalta(false);
      setErrorLectura('');
    } else {
      setTablaFalta(res.tablaFalta);
      setErrorLectura(res.tablaFalta ? '' : res.mensaje);
    }
  }, []);

  useEffect(() => {
    void cargar();
    return suscribirRecargas((updater) => setRecargas(updater));
  }, [cargar]);

  // La agencia de la barra superior manda; dentro de ella se puede afinar.
  const agenciasVisibles = useMemo(
    () => (agenciaGeneral && agenciaGeneral !== 'TODAS' ? agencias.filter((a) => a === agenciaGeneral) : agencias),
    [agencias, agenciaGeneral]
  );
  useEffect(() => {
    if (agencia && !agenciasVisibles.includes(agencia)) setAgencia('');
  }, [agencia, agenciasVisibles]);

  const delUsuario = useMemo(() => recargas.filter((r) => agenciasVisibles.includes(r.agencia)), [recargas, agenciasVisibles]);
  // Pendientes de autorizar en TODO el historial (no solo en el rango elegido).
  const pendientesTotales = useMemo(
    () => delUsuario.filter((r) => estadoDe(r) === 'Pendiente' && adminDe(r.agencia)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [delUsuario, isAdmin, adminAgencias, estadoDe]
  );

  const filtradas = useMemo(() => {
    const q = norm(busca.trim());
    return delUsuario
      .filter((r) => !agencia || r.agencia === agencia)
      .filter((r) => estado === 'Pendiente' || estado === 'En ruta' || ((!desde || r.fecha >= desde) && (!hasta || r.fecha <= hasta)))
      .filter((r) => !tipo || r.tipo === tipo)
      .filter((r) => !estado || estadoDe(r) === estado)
      .filter(
        (r) =>
          !q ||
          norm([formatoCorrelativo(r.correlativo), r.sinRuta ? 'sin ruta' : '', r.rutaId, r.conductor, ...(r.auxiliares || []), r.camionPlaca, r.comentario, r.segmento, r.agencia].join(' ')).includes(q)
      )
      .sort((a, b) => (b.fecha + b.creadoEn).localeCompare(a.fecha + a.creadoEn));
  }, [delUsuario, agencia, desde, hasta, tipo, estado, busca, estadoDe]);

  // Indicadores: todo lo del rango y filtros (sin importar la pestaña elegida);
  // las pendientes se cuentan siempre completas.
  const baseKpi = useMemo(() => {
    const q = norm(busca.trim());
    return delUsuario
      .filter((r) => !agencia || r.agencia === agencia)
      .filter((r) => !tipo || r.tipo === tipo)
      .filter((r) => estadoDe(r) === 'Pendiente' || estadoDe(r) === 'En ruta' || ((!desde || r.fecha >= desde) && (!hasta || r.fecha <= hasta)))
      .filter(
        (r) =>
          !q ||
          norm([formatoCorrelativo(r.correlativo), r.sinRuta ? 'sin ruta' : '', r.rutaId, r.conductor, ...(r.auxiliares || []), r.camionPlaca, r.comentario, r.segmento, r.agencia].join(' ')).includes(q)
      );
  }, [delUsuario, agencia, tipo, desde, hasta, busca, estadoDe]);

  const kpi = useMemo(() => {
    const filtradas = baseKpi;
    const por = (e: EstadoRecarga) => filtradas.filter((r) => estadoDe(r) === e);
    const aut = por('Autorizada');
    return {
      total: filtradas.length,
      simple: filtradas.filter((r) => r.tipo === 'Simple').length,
      doble: filtradas.filter((r) => r.tipo === 'Doble').length,
      triple: filtradas.filter((r) => r.tipo === 'Triple').length,
      pendientes: por('Pendiente').length,
      enRuta: por('En ruta').length,
      autorizadas: aut.length,
      rechazadas: por('Rechazada').length,
      viajesPago: aut.reduce((a, r) => a + (VIAJES[r.tipo] || 1), 0),
      viajesPend: por('Pendiente').reduce((a, r) => a + (VIAJES[r.tipo] || 1), 0),
      auto: filtradas.filter((r) => r.origen === 'asignacion').length,
    };
  }, [baseKpi, estadoDe]);

  // Pendientes que el usuario en sesión puede autorizar (selección masiva).
  const pendientesVisibles = useMemo(
    () => filtradas.filter((r) => estadoDe(r) === 'Pendiente' && adminDe(r.agencia)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtradas, isAdmin, adminAgencias, estadoDe]
  );
  // La selección solo guarda pendientes que siguen visibles.
  const seleccionadas = useMemo(() => pendientesVisibles.filter((r) => seleccion.has(r.id)), [pendientesVisibles, seleccion]);

  const rangoInvalido = !!desde && !!hasta && desde > hasta;

  const aplicar = (list: Recarga[]) =>
    setRecargas((prev) => {
      const byId = new Map(list.map((r) => [r.id, r]));
      const next = prev.map((r) => byId.get(r.id) || r);
      list.forEach((r) => {
        if (!prev.some((x) => x.id === r.id)) next.push(r);
      });
      return next;
    });

  const handleGuardar = async (datos: Omit<Recarga, 'id' | 'origen' | 'creadoPor' | 'creadoEn'>) => {
    const ahora = new Date().toISOString();
    const previa = modal.recarga;
    if (previa && estadoDe(previa) === 'Autorizada') {
      onShowToast('Una recarga autorizada no se puede editar. Si está mal, un administrador debe eliminarla y registrarla de nuevo.', 'error');
      setModal({ abierto: false, recarga: null });
      return;
    }
    let r: Recarga;
    if (!previa) {
      r = { ...datos, solicitadoPor: usuario, id: nuevoIdRecarga(), origen: 'manual', creadoPor: usuario, creadoEn: ahora, estado: 'Pendiente' };
    } else {
      r = { ...previa, ...datos, solicitadoPor: previa.solicitadoPor || previa.creadoPor, editadoPor: usuario, editadoEn: ahora };
      // Un cambio real hecho por alguien que no es administrador vuelve a Pendiente.
      if (!(adminDe(previa.agencia) && adminDe(r.agencia)) && contenido(previa) !== contenido(r)) {
        // Si el viaje aún no se liquida, sigue "En ruta".
        r = { ...r, estado: estadoDe(previa) === 'En ruta' ? 'En ruta' : 'Pendiente', autorizadoPor: undefined, autorizadoEn: undefined, motivoRechazo: undefined };
      }
    }
    setGuardando(true);
    const { error: err, guardada } = await guardarRecarga(r);
    setGuardando(false);
    if (err) {
      onShowToast(err, 'error');
      return;
    }
    r = guardada;
    aplicar([r]);
    setModal({ abierto: false, recarga: null });
    const volvio = previa && estadoDe(previa) !== 'Pendiente' && estadoDe(r) === 'Pendiente';
    onShowToast(
      isDemoMode
        ? 'Versión DEMO: la recarga se ve aquí pero no se guarda.'
        : !previa
        ? `Recarga ${formatoCorrelativo(r.correlativo)} (${r.sinRuta ? 'sin ruta' : `ruta ${r.rutaId}`}) registrada. Queda pendiente de autorización.`
        : volvio
        ? `Recarga ${etq(r)} actualizada. Volvió a Por autorizar: necesita nueva autorización.`
        : `Recarga ${etq(r)} actualizada.`,
      isDemoMode ? 'info' : 'success',
      { label: 'Imprimir boleta', onClick: () => imprimirBoletaRecarga(r) }
    );
  };

  const cambiarEstado = async (list: Recarga[], nuevo: EstadoRecarga, motivo?: string) => {
    // Las autorizadas ya no cambian de estado (solo se pueden eliminar).
    // Las de viajes aún sin liquidar ("En ruta") todavía no se autorizan.
    list = list.filter((r) => adminDe(r.agencia) && estadoDe(r) !== 'Autorizada' && estadoDe(r) !== 'En ruta');
    if (!aprobador || list.length === 0) return;
    const ahora = new Date().toISOString();
    const cambios = list.map<Recarga>((r) => ({
      ...r,
      estado: nuevo,
      autorizadoPor: nuevo === 'Pendiente' ? undefined : usuario,
      autorizadoEn: nuevo === 'Pendiente' ? undefined : ahora,
      motivoRechazo: nuevo === 'Rechazada' ? motivo : undefined,
    }));
    setProcesando(true);
    const { error: err, guardadas } = await guardarRecargas(cambios);
    setProcesando(false);
    if (err) {
      onShowToast(err, 'error');
      return;
    }
    aplicar(guardadas);
    setSeleccion(new Set());
    setRechazo(null);
    const n = cambios.length;
    onShowToast(
      nuevo === 'Autorizada'
        ? `${n} recarga(s) autorizada(s): pasaron a la pestaña Autorizadas y ya cuentan para pago.`
        : nuevo === 'Rechazada'
        ? `Recarga ${etq(cambios[0])} rechazada.`
        : `${n} recarga(s) regresada(s) a Por autorizar.`,
      'success'
    );
  };

  const handleEliminar = async (r: Recarga) => {
    setPorEliminar(null);
    const err = await eliminarRecarga(r.id);
    if (err) {
      onShowToast(err, 'error');
      return;
    }
    setRecargas((prev) => prev.filter((x) => x.id !== r.id));
    onShowToast(`Recarga ${etq(r)} eliminada.`, 'success');
  };

  const descargarExcel = async () => {
    if (filtradas.length === 0) {
      onShowToast('No hay recargas en el rango y filtros elegidos.', 'info');
      return;
    }
    const XLSX = await loadXLSX();
    const wb = XLSX.utils.book_new();

    // --- Hoja "Pago recargas": solo AUTORIZADAS, una fila por persona ---
    // Cada recarga cuenta para el piloto y para cada auxiliar que la sacó. El
    // puesto (VPP / VPPB / APP) y el DPI se toman de Personal.
    const porId = new Map(staff.map((x) => [x.id, x]));
    const buscarPersona = (nombre: string, id: string | null | undefined, agenciaR: string) => {
      const n = norm(nombre).trim();
      return (
        (id ? porId.get(id) : undefined) ||
        staff.find((x) => x.agencia === agenciaR && norm(x.nombre).trim() === n) ||
        staff.find((x) => norm(x.nombre).trim() === n)
      );
    };
    const personasDe = (r: Recarga) => [
      ...(r.conductor ? [{ nombre: r.conductor, id: r.conductorId, rol: 'Piloto' }] : []),
      ...(r.auxiliares || []).map((n, i) => ({ nombre: n, id: r.auxiliarIds?.[i] || null, rol: 'Auxiliar' })).filter((x) => x.nombre),
    ];
    // Préstamo que cubría a esa persona ese día en la agencia de la recarga.
    const prestamoDe = (staffId: string | undefined, r: Recarga) =>
      staffId
        ? prestamos.find(
            (p) => p.agenciaDestino === r.agencia && cubreFecha(p, r.fecha) && p.recursos.some((x) => x.tipo !== 'camion' && x.id === staffId)
          )
        : undefined;
    type Retenida = { r: Recarga; nombre: string; puesto: string; p: Prestamo; valor: number };
    const retenidas: Retenida[] = [];
    const valorDe = (r: Recarga) =>
      personasDe(r).reduce((acc, p) => {
        const st = buscarPersona(p.nombre, p.id, r.agencia);
        const pr = prestamoDe(st?.id, r);
        if (pr && !prestamoCerrado(pr)) return acc;
        const puesto = (st?.puesto || (p.rol === 'Piloto' ? 'VPP' : 'APP')).toUpperCase();
        return acc + tarifaDe(puesto) * (VIAJES[r.tipo] || 1);
      }, 0);
    type FilaPago = { dpi: string; nombre: string; puesto: string; agencia: string; s: number; d: number; t: number; enPrestamo: number };
    const pago = new Map<string, FilaPago>();
    filtradas
      .filter((r) => estadoDe(r) === 'Autorizada')
      .forEach((r) => {
        personasDe(r).forEach((p) => {
          const st = buscarPersona(p.nombre, p.id, r.agencia);
          const puesto = (st?.puesto || (p.rol === 'Piloto' ? 'VPP' : 'APP')).toUpperCase();
          // Hecha en préstamo: solo se paga con el préstamo autorizado y devuelto.
          const pr = prestamoDe(st?.id, r);
          if (pr && !prestamoCerrado(pr)) {
            retenidas.push({ r, nombre: st?.nombre || p.nombre, puesto, p: pr, valor: tarifaDe(puesto) * (VIAJES[r.tipo] || 1) });
            return;
          }
          const dpi = st?.dpi ? String(st.dpi) : '';
          const k = dpi || `${r.agencia}|${norm(p.nombre).trim()}`;
          const f = pago.get(k) || { dpi, nombre: st?.nombre || p.nombre, puesto, agencia: st?.agencia || r.agencia, s: 0, d: 0, t: 0, enPrestamo: 0 };
          if (r.tipo === 'Triple') f.t++;
          else if (r.tipo === 'Doble') f.d++;
          else f.s++;
          if (pr) f.enPrestamo += VIAJES[r.tipo] || 1;
          pago.set(k, f);
        });
      });
    const filasPago = Array.from(pago.values())
      .map((f) => {
        const recargas = f.s + f.d * 2 + f.t * 3;
        const tarifa = tarifaDe(f.puesto);
        return { ...f, recargas, tarifa, valor: recargas * tarifa };
      })
      .sort((a, b) => a.agencia.localeCompare(b.agencia) || a.puesto.localeCompare(b.puesto) || a.nombre.localeCompare(b.nombre));
    const aoa: (string | number)[][] = [
      ['DPI', 'Nombre y Apellidos', 'PUESTO', 'Agencia', 'Simples', 'Dobles', 'Triples', 'Recargas', 'Tarifa por recarga', 'Valor Recargas', 'Recargas en préstamo (incluidas)'],
      ...filasPago.map((f) => [f.dpi, f.nombre, f.puesto, f.agencia, f.s, f.d, f.t, f.recargas, f.tarifa, f.valor, f.enPrestamo]),
    ];
    const totRec = filasPago.reduce((a, f) => a + f.recargas, 0);
    const totVal = filasPago.reduce((a, f) => a + f.valor, 0);
    aoa.push(['', filasPago.length ? 'TOTAL' : 'Sin recargas autorizadas en este rango', '', '', '', '', '', totRec, '', totVal, '']);
    if (retenidas.length) {
      aoa.push([]);
      aoa.push(['', `Retenidas por préstamo sin autorización o sin devolución: ${retenidas.length} (ver hoja "Retenidas por préstamo")`]);
    }
    const wsPago = XLSX.utils.aoa_to_sheet(aoa);
    wsPago['!cols'] = [17, 34, 9, 18, 9, 9, 9, 10, 17, 16, 16].map((wch) => ({ wch }));
    if (filasPago.length) wsPago['!autofilter'] = { ref: `A1:K${filasPago.length + 1}` };
    for (let i = 2; i <= aoa.length; i++) {
      ['I', 'J'].forEach((c) => {
        const cell = wsPago[`${c}${i}`];
        if (cell && typeof cell.v === 'number') cell.z = '"Q" #,##0.00';
      });
      const dpiCell = wsPago[`A${i}`];
      if (dpiCell) dpiCell.t = 's'; // DPI como texto (sin notación científica)
    }
    XLSX.utils.book_append_sheet(wb, wsPago, 'Pago recargas');

    if (retenidas.length) {
      const wsRet = XLSX.utils.json_to_sheet(
        retenidas.map((x) => ({
          'Recarga': formatoCorrelativo(x.r.correlativo),
          Fecha: fmt(x.r.fecha),
          Ruta: x.r.sinRuta || !x.r.rutaId ? 'SIN RUTA' : x.r.rutaId,
          'Agencia donde trabajó': x.r.agencia,
          Tipo: x.r.tipo,
          'Nombre y Apellidos': x.nombre,
          PUESTO: x.puesto,
          'Préstamo': formatoCorrelativoPrestamo(x.p.correlativo),
          'Agencia que prestó': x.p.agenciaOrigen,
          'Autorización préstamo': estadoPrestamo(x.p),
          'Devuelto': x.p.devuelto ? 'Sí' : 'No',
          'Falta': [estadoPrestamo(x.p) !== 'Autorizado' ? 'autorización' : '', !x.p.devuelto ? 'devolución' : ''].filter(Boolean).join(' y '),
          'Valor retenido (Q)': x.valor,
        }))
      );
      wsRet['!cols'] = [12, 10, 9, 18, 8, 30, 8, 12, 18, 14, 9, 22, 16].map((wch) => ({ wch }));
      for (let i = 2; i <= retenidas.length + 1; i++) {
        const c = wsRet[`M${i}`];
        if (c && typeof c.v === 'number') c.z = '"Q" #,##0.00';
      }
      XLSX.utils.book_append_sheet(wb, wsRet, 'Retenidas por préstamo');
    }

    const detalle = filtradas.map((r) => {
      const e = estadoDe(r);
      return {
        Correlativo: formatoCorrelativo(r.correlativo),
        Fecha: fmt(r.fecha),
        Ruta: r.sinRuta || !r.rutaId ? 'SIN RUTA' : r.rutaId,
        Agencia: r.agencia,
        Segmento: r.segmento || '',
        Tipo: r.tipo,
        'Viajes de recarga': VIAJES[r.tipo] || 1,
        Estado: e,
        'Cuenta para pago': e === 'Autorizada' ? 'Sí' : 'No',
        'Valor a pagar (Q)': e === 'Autorizada' ? valorDe(r) : 0,
        Piloto: r.conductor,
        'Auxiliar 1': r.auxiliares?.[0] || '',
        'Auxiliar 2': r.auxiliares?.[1] || '',
        'Auxiliar 3': r.auxiliares?.[2] || '',
        'Auxiliar 4': r.auxiliares?.[3] || '',
        Camión: r.camionPlaca || '',
        Comentarios: r.comentario || '',
        'Autorizado / rechazado por': r.autorizadoPor || '',
        'Fecha autorización': fmtHora(r.autorizadoEn),
        'Motivo de rechazo': r.motivoRechazo || '',
        Origen: r.origen === 'asignacion' ? 'Automática (liquidación)' : 'Manual',
        'Solicitado por': r.solicitadoPor || r.creadoPor,
        'Registrado por': r.creadoPor,
        'Registrado el': fmtHora(r.creadoEn),
        'Editado por': r.editadoPor || '',
        'Editado el': fmtHora(r.editadoEn),
      };
    });
    const wsD = XLSX.utils.json_to_sheet(detalle);
    for (let i = 2; i <= detalle.length + 1; i++) {
      const c = wsD[`J${i}`];
      if (c && typeof c.v === 'number') c.z = '"Q" #,##0.00';
    }
    wsD['!cols'] = [12, 10, 9, 16, 16, 8, 10, 11, 10, 14, 26, 22, 22, 22, 22, 10, 40, 22, 17, 30, 18, 16, 17, 16, 17].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, wsD, 'Recargas');

    const porAg = new Map<string, { p: number; a: number; r: number; v: number; e: number }>();
    filtradas.forEach((r) => {
      const x = porAg.get(r.agencia) || { p: 0, a: 0, r: 0, v: 0, e: 0 };
      const e = estadoDe(r);
      if (e === 'Autorizada') {
        x.a++;
        x.v += VIAJES[r.tipo] || 1;
      } else if (e === 'Rechazada') x.r++;
      else if (e === 'En ruta') x.e++;
      else x.p++;
      porAg.set(r.agencia, x);
    });
    const resumen = Array.from(porAg.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ag, x]) => ({ Agencia: ag, 'En ruta (sin liquidar)': x.e, Pendientes: x.p, Autorizadas: x.a, Rechazadas: x.r, 'Total registros': x.e + x.p + x.a + x.r, 'Viajes para pago (autorizadas)': x.v }));
    resumen.push({ Agencia: 'TOTAL', 'En ruta (sin liquidar)': kpi.enRuta, Pendientes: kpi.pendientes, Autorizadas: kpi.autorizadas, Rechazadas: kpi.rechazadas, 'Total registros': kpi.total, 'Viajes para pago (autorizadas)': kpi.viajesPago });
    const wsR = XLSX.utils.json_to_sheet(resumen);
    wsR['!cols'] = [20, 11, 12, 11, 15, 28].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, wsR, 'Resumen por agencia');

    formatoMiles(wb);

    XLSX.writeFile(wb, `Recargas_${desde || 'inicio'}_a_${hasta || 'hoy'}${agencia ? '_' + agencia.replace(/\s+/g, '_') : ''}.xlsx`);
    onShowToast(`Reporte de ${filtradas.length} recarga(s) descargado.`, 'success');
  };

  const input = 'min-h-[40px] px-3 border border-slate-300 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-blue-300';
  const todasSel = pendientesVisibles.length > 0 && seleccionadas.length === pendientesVisibles.length;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center">
            <Repeat className="w-5 h-5" />
          </span>
          <div className="mr-auto">
            <h2 className="text-lg font-bold text-slate-800">Recargas</h2>
            <p className="text-xs text-slate-400">
              Registro de recargas: ruta, tripulación, fecha y tipo · solo las autorizadas cuentan para pago
              {agenciaGeneral && agenciaGeneral !== 'TODAS' ? ` · Agencia: ${agenciaGeneral}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void cargar()}
            title="Volver a leer"
            className="min-h-[40px] px-3 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 flex items-center gap-1.5 cursor-pointer hover:bg-slate-50"
          >
            <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
          </button>
          <button
            id="btnNuevaRecarga"
            type="button"
            onClick={() => setModal({ abierto: true, recarga: null })}
            disabled={tablaFalta}
            className="min-h-[44px] px-4 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" /> Nueva recarga
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="recDesde" className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Desde</label>
            <input id="recDesde" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} className={input} />
          </div>
          <div>
            <label htmlFor="recHasta" className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Hasta</label>
            <input id="recHasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} className={input} />
          </div>
          <div className="flex gap-1">
            {[
              { l: 'Hoy', d: getGuatemalaDateForInput(), h: getGuatemalaDateForInput() },
              { l: 'Este mes', d: primeroDeMes(), h: getGuatemalaDateForInput() },
            ].map((b) => (
              <button
                key={b.l}
                type="button"
                onClick={() => {
                  setDesde(b.d);
                  setHasta(b.h);
                }}
                className="min-h-[40px] px-2.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                {b.l}
              </button>
            ))}
          </div>
          <div>
            <label htmlFor="recFiltroAgencia" className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Agencia</label>
            <select id="recFiltroAgencia" value={agencia} onChange={(e) => setAgencia(e.target.value)} className={input}>
              <option value="">Todas</option>
              {agenciasVisibles.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="recFiltroTipo" className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Tipo</label>
            <select id="recFiltroTipo" value={tipo} onChange={(e) => setTipo(e.target.value as '' | TipoRecarga)} className={input}>
              <option value="">Todos</option>
              {TIPOS_RECARGA.map((t) => (
                <option key={t.tipo} value={t.tipo}>
                  {t.tipo}
                </option>
              ))}
            </select>
          </div>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar ruta, piloto, auxiliar, camión…"
              aria-label="Buscar recargas"
              className={`${input} w-full pl-8`}
            />
          </div>
          <button
            id="btnExcelRecargas"
            type="button"
            onClick={() => void descargarExcel()}
            disabled={rangoInvalido}
            className="min-h-[40px] px-3 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-emerald-100 disabled:opacity-50"
          >
            <Download className="w-4 h-4" /> Descargar Excel
          </button>
        </div>
        {rangoInvalido && <p className="text-[11px] font-semibold text-rose-600">La fecha "Desde" no puede ser después de "Hasta".</p>}
      </div>

      {tablaFalta && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            El módulo de Recargas todavía no está activado en la base de datos. Un administrador debe ejecutar una vez el archivo{' '}
            <b>supabase/fase8_recargas.sql</b> en Supabase (SQL Editor). Mientras tanto no se pueden registrar recargas.
          </span>
        </div>
      )}
      {errorLectura && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-4 py-3 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>No se pudieron leer las recargas: {errorLectura}. Revisa tu conexión y presiona Actualizar.</span>
        </div>
      )}

      {aprobador && pendientesTotales > 0 && (
        <div id="avisoPendientesRecarga" className="flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl px-4 py-3 text-xs">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span className="flex-1">
            <b>{fmtNum(pendientesTotales)} recarga(s) esperan tu autorización.</b> Mientras no las autorices no cuentan para pago.
          </span>
          {estado !== 'Pendiente' && (
            <button
              type="button"
              onClick={() => setEstado('Pendiente')}
              className="min-h-[36px] px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold cursor-pointer"
            >
              Ver pendientes
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { l: 'Recargas', v: kpi.total, s: `Simple ${kpi.simple} · Doble ${kpi.doble} · Triple ${kpi.triple}`, c: 'border-slate-200 text-slate-800', f: '' as const },
          { l: 'Pendientes', v: kpi.pendientes, s: `${kpi.viajesPend} viaje(s) por autorizar`, c: 'border-amber-300 text-amber-800', f: 'Pendiente' as const },
          { l: 'Autorizadas', v: kpi.autorizadas, s: 'cuentan para pago', c: 'border-emerald-300 text-emerald-800', f: 'Autorizada' as const },
          { l: 'Rechazadas', v: kpi.rechazadas, s: 'no se pagan', c: 'border-rose-200 text-rose-700', f: 'Rechazada' as const },
          { l: 'Viajes para pago', v: kpi.viajesPago, s: 'solo autorizadas · S1 · D2 · T3', c: 'border-emerald-300 text-emerald-800 bg-emerald-50/40', f: 'Autorizada' as const },
        ].map((k) => (
          <button
            key={k.l}
            type="button"
            onClick={() => setEstado(estado === k.f ? '' : k.f)}
            aria-pressed={!!k.f && estado === k.f}
            className={`text-left bg-white border rounded-2xl p-4 shadow-sm cursor-pointer hover:shadow ${k.c} ${k.f && estado === k.f && k.l !== 'Viajes para pago' ? 'ring-2 ring-slate-800' : ''}`}
          >
            <p className="text-[10.5px] font-semibold uppercase tracking-wide">{k.l}</p>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{k.v}</p>
            <p className="text-[11px] text-slate-500">{k.s}</p>
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 mr-auto" role="tablist" aria-label="Estado de las recargas">
            {(
              [
                { k: 'Pendiente', l: 'Por autorizar', n: kpi.pendientes, on: 'bg-amber-500 text-white border-amber-500' },
                { k: 'En ruta', l: 'En ruta (sin liquidar)', n: kpi.enRuta, on: 'bg-sky-600 text-white border-sky-600' },
                { k: 'Autorizada', l: 'Autorizadas', n: kpi.autorizadas, on: 'bg-emerald-600 text-white border-emerald-600' },
                { k: 'Rechazada', l: 'Rechazadas', n: kpi.rechazadas, on: 'bg-rose-600 text-white border-rose-600' },
                { k: '', l: 'Todas', n: kpi.total, on: 'bg-slate-800 text-white border-slate-800' },
              ] as { k: '' | EstadoRecarga; l: string; n: number; on: string }[]
            ).map((t) => (
              <button
                key={t.l}
                type="button"
                role="tab"
                aria-selected={estado === t.k}
                onClick={() => {
                  setEstado(t.k);
                  setSeleccion(new Set());
                }}
                className={`min-h-[40px] px-3.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                  estado === t.k ? t.on : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {t.l}
                <span className={`px-1.5 rounded-md text-[10.5px] tabular-nums ${estado === t.k ? 'bg-white/25' : 'bg-slate-100'}`}>{t.n}</span>
              </button>
            ))}
          </div>
          <span className="text-[11px] text-slate-400">
            {estado === 'Pendiente' ? 'Todas las pendientes, sin importar la fecha' : estado === 'En ruta' ? 'Viajes de Recarga aún sin liquidar: se autorizan después de liquidar' : `${desde ? fmt(desde) : 'Desde el inicio'} a ${fmt(hasta)}`}
            {kpi.auto > 0 ? ` · ${kpi.auto} automática(s) por liquidación` : ''}
          </span>
          {aprobador && seleccionadas.length > 0 && (
            <button
              id="btnAutorizarSeleccion"
              type="button"
              disabled={procesando}
              onClick={() => void cambiarEstado(seleccionadas, 'Autorizada')}
              className="min-h-[40px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <Check className="w-4 h-4" /> Autorizar {seleccionadas.length} seleccionada(s)
            </button>
          )}
        </div>
        {cargando && recargas.length === 0 ? (
          <p className="text-xs text-slate-400 py-10 text-center">Cargando recargas…</p>
        ) : filtradas.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <Repeat className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-500">Sin recargas con estos filtros</p>
            <p className="text-xs text-slate-400">Cambia las fechas o el estado, o registra una con "Nueva recarga".</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10.5px] uppercase text-slate-500">
                <tr>
                  {aprobador && (
                    <th className="pl-4 py-2.5 w-8">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todas las pendientes"
                        title="Seleccionar todas las pendientes"
                        disabled={pendientesVisibles.length === 0}
                        checked={todasSel}
                        onChange={() => setSeleccion(todasSel ? new Set() : new Set(pendientesVisibles.map((r) => r.id)))}
                        className="w-4 h-4 cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="text-left px-4 py-2.5">No.</th>
                  <th className="text-left px-3 py-2.5">Fecha</th>
                  <th className="text-left px-3 py-2.5">Ruta</th>
                  <th className="text-left px-3 py-2.5">Agencia</th>
                  <th className="text-left px-3 py-2.5">Tipo</th>
                  <th className="text-left px-3 py-2.5">Estado</th>
                  <th className="text-left px-3 py-2.5">Piloto</th>
                  <th className="text-left px-3 py-2.5">Auxiliares</th>
                  <th className="text-left px-3 py-2.5">Camión</th>
                  <th className="text-left px-3 py-2.5">Comentarios</th>
                  <th className="text-left px-3 py-2.5">Registro</th>
                  <th className="text-right px-4 py-2.5">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtradas.map((r) => {
                  const e = estadoDe(r);
                  const pend = e === 'Pendiente';
                  // Autorizadas: solo un administrador las modifica o elimina.
                  const esAdminAqui = adminDe(r.agencia);
                  // Una recarga AUTORIZADA ya no se edita ni se rechaza (nadie);
                  // solo la puede ELIMINAR un administrador (general o de la agencia).
                  const puedeEditar = e !== 'Autorizada';
                  const puedeEliminar = esAdminAqui || (canDelete && e !== 'Autorizada');
                  return (
                    <React.Fragment key={r.id}>
                      <tr className={`align-top ${pend ? 'bg-amber-50/30' : ''} hover:bg-slate-50/70`}>
                        {aprobador && (
                          <td className="pl-4 py-3">
                            {pend && esAdminAqui && (
                              <input
                                type="checkbox"
                                aria-label={`Seleccionar recarga ${etq(r)}`}
                                checked={seleccion.has(r.id)}
                                onChange={() =>
                                  setSeleccion((prev) => {
                                    const n = new Set(prev);
                                    if (n.has(r.id)) n.delete(r.id);
                                    else n.add(r.id);
                                    return n;
                                  })
                                }
                                className="w-4 h-4 cursor-pointer"
                              />
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3 font-mono font-bold text-rose-700 whitespace-nowrap">{formatoCorrelativo(r.correlativo) || '—'}</td>
                        <td className="px-3 py-3 font-semibold text-slate-700 whitespace-nowrap">{fmt(r.fecha)}</td>
                        <td className="px-3 py-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {r.sinRuta || !r.rutaId ? (
                            <span className="inline-flex px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10.5px] font-sans font-bold text-slate-600">Sin ruta</span>
                          ) : (
                            r.rutaId
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className="font-semibold text-blue-700">{r.agencia}</span>
                          {r.segmento && <span className="block text-[10px] text-slate-400">{r.segmento}</span>}
                        </td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-md border text-[11px] font-bold ${badgeTipo(r.tipo)}`}>{r.tipo}</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold ${ESTADO_STYLE[e]}`}>
                            {e === 'Autorizada' ? <Check className="w-3 h-3" /> : e === 'Rechazada' ? <X className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                            {e}
                          </span>
                          {r.autorizadoPor && !pend && (
                            <span className="block text-[10px] text-slate-400 mt-0.5">
                              {r.autorizadoPor} · {fmtHora(r.autorizadoEn)}
                            </span>
                          )}
                          {e === 'En ruta' && (
                            <span className="block text-[10px] text-sky-700 max-w-[180px] whitespace-normal">Se autoriza al liquidar el viaje</span>
                          )}
                          {e === 'Rechazada' && r.motivoRechazo && (
                            <span className="block text-[10px] text-rose-600 max-w-[180px] whitespace-normal">Motivo: {r.motivoRechazo}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-800">{r.conductor || <span className="text-[11px] font-normal text-slate-400">Sin piloto</span>}</td>
                        <td className="px-3 py-3 text-slate-600">
                          {r.auxiliares?.length ? r.auxiliares.map((a) => <span key={a} className="block">{a}</span>) : <span className="text-slate-300">-</span>}
                        </td>
                        <td className="px-3 py-3 font-mono text-slate-600">{r.camionPlaca || '-'}</td>
                        <td className="px-3 py-3 text-slate-600 max-w-[220px]">
                          {r.comentario ? <span className="line-clamp-3" title={r.comentario}>{r.comentario}</span> : <span className="text-slate-300">-</span>}
                        </td>
                        <td className="px-3 py-3 text-[10.5px] text-slate-500 whitespace-nowrap">
                          {r.origen === 'asignacion' && (
                            <span className="inline-flex items-center gap-1 mb-0.5 px-1.5 py-0.5 rounded bg-violet-50 border border-violet-200 text-violet-700 font-bold">
                              <Zap className="w-3 h-3" /> Automática
                            </span>
                          )}
                          <span className="block">Solicitó: <b className="text-slate-700">{r.solicitadoPor || r.creadoPor}</b></span>
                          <span className="block">Registró: {r.creadoPor}</span>
                          <span className="block text-slate-400">{fmtHora(r.creadoEn)}</span>
                          {r.editadoPor && <span className="block text-slate-400">Editó: {r.editadoPor}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end items-center gap-1.5 flex-wrap">
                            {esAdminAqui && e !== 'Autorizada' && e !== 'En ruta' && (
                              <button
                                type="button"
                                disabled={procesando}
                                onClick={() => void cambiarEstado([r], 'Autorizada')}
                                aria-label={`Autorizar recarga ${etq(r)}`}
                                className="min-h-[36px] px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-60"
                              >
                                <Check className="w-3.5 h-3.5" /> Autorizar
                              </button>
                            )}
                            {esAdminAqui && e !== 'Rechazada' && e !== 'Autorizada' && e !== 'En ruta' && (
                              <button
                                type="button"
                                disabled={procesando}
                                onClick={() => setRechazo({ id: r.id, motivo: '' })}
                                aria-label={`Rechazar recarga ${etq(r)}`}
                                className="min-h-[36px] px-2.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-60"
                              >
                                <X className="w-3.5 h-3.5" /> Rechazar
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => imprimirBoletaRecarga(r)}
                              aria-label={`Imprimir boleta ${etq(r)}`}
                              title="Imprimir boleta"
                              className="w-9 h-9 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            {puedeEditar && (<button
                              type="button"
                              onClick={() => setModal({ abierto: true, recarga: r })}
                              aria-label={`Editar recarga ${etq(r)}`}
                              title="Editar"
                              className="w-9 h-9 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>)}
                            {puedeEliminar && porEliminar === r.id ? (
                              <span className="flex items-center gap-1">
                                <span className="text-[11px] font-semibold text-rose-700">¿Eliminar?</span>
                                <button
                                  type="button"
                                  onClick={() => void handleEliminar(r)}
                                  className="min-h-[36px] px-2.5 rounded-lg bg-rose-600 text-white text-[11px] font-bold cursor-pointer"
                                >
                                  Sí
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPorEliminar(null)}
                                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-300 text-[11px] font-bold text-slate-600 cursor-pointer"
                                >
                                  No
                                </button>
                              </span>
                            ) : (
                              puedeEliminar && (
                                <button
                                  type="button"
                                  onClick={() => setPorEliminar(r.id)}
                                  aria-label={`Eliminar recarga ${etq(r)}`}
                                  title="Eliminar"
                                  className="w-9 h-9 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 flex items-center justify-center cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                      {rechazo?.id === r.id && (
                        <tr className="bg-rose-50/60">
                          <td colSpan={aprobador ? 13 : 12} className="px-4 py-3">
                            <form
                              className="flex flex-wrap items-center gap-2"
                              onSubmit={(ev) => {
                                ev.preventDefault();
                                if (rechazo.motivo.trim().length < 5) return;
                                void cambiarEstado([r], 'Rechazada', rechazo.motivo.trim());
                              }}
                            >
                              <label htmlFor={`motivoRechazo-${r.id}`} className="text-[11px] font-bold text-rose-800">
                                Motivo del rechazo ({etq(r)}):
                              </label>
                              <input
                                id={`motivoRechazo-${r.id}`}
                                autoFocus
                                value={rechazo.motivo}
                                maxLength={200}
                                onChange={(ev) => setRechazo({ id: r.id, motivo: ev.target.value })}
                                placeholder="Ej. No salió la recarga, ruta duplicada, tripulación incorrecta…"
                                className="flex-1 min-w-[240px] min-h-[40px] px-3 border border-rose-300 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-rose-300"
                              />
                              <button
                                type="submit"
                                disabled={procesando || rechazo.motivo.trim().length < 5}
                                className="min-h-[40px] px-3 rounded-lg bg-rose-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                              >
                                Rechazar recarga
                              </button>
                              <button
                                type="button"
                                onClick={() => setRechazo(null)}
                                className="min-h-[40px] px-3 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 cursor-pointer"
                              >
                                Cancelar
                              </button>
                            </form>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RecargaModal
        isOpen={modal.abierto}
        onClose={() => setModal({ abierto: false, recarga: null })}
        inicial={modal.recarga}
        rutas={rutas}
        staff={staff}
        prestamos={prestamos}
        agencias={agenciasVisibles}
        agenciaPorDefecto={agencia || (agenciaGeneral !== 'TODAS' ? agenciaGeneral : '')}
        solicitantePorDefecto={usuario}
        existentes={recargas}
        guardando={guardando}
        avisoReautorizar={!!modal.recarga && !adminDe(modal.recarga.agencia) && estadoDe(modal.recarga) !== 'Pendiente' && estadoDe(modal.recarga) !== 'En ruta'}
        onGuardar={(d) => void handleGuardar(d)}
      />
    </div>
  );
};
