import { getRouteKey } from '../../utils/routeKey';
import React, { useState, useEffect } from 'react';
import { Route, MotivoDevolucionReason, CajaAbiertaReason, ClientePendiente } from '../../types';
import { X, CheckCircle, ClipboardCheck, RotateCcw, AlertTriangle, Lock, Users, Search } from 'lucide-react';
import { Button, IconButton } from '../ui/Button';
import { ModalFooter } from '../ui/ModalFooter';
import { ACTION_ICONS } from '../ui/actionIcons';
import { useMaximized } from '../ui/useMaximized';
import { MOTIVO_DEVOLUCION_OPTIONS, MOTIVO_REVISITA } from '../../data/motivosDevolucion';
import { CAJA_ABIERTA_OPTIONS } from '../../data/motivosCajaAbierta';

interface LiquidateModalProps {
  isOpen: boolean;
  onClose: () => void;
  route: Route | null;
  // Nombre a precargar en el campo "Auditor" (el usuario que tiene la sesión
  // abierta). El campo sigue siendo editable por si quien liquida físicamente
  // en la agencia es otra persona.
  defaultAuditor?: string;
  // Corrección: se agrega "fecha" porque el mismo ID de ruta puede repetirse en
  // fechas distintas (ver src/utils/routeKey.ts) — sin esto, liquidar una fila podía
  // terminar liquidando también otra fila con el mismo ID pero de otra fecha.
  onConfirmLiquidation: (
    routeId: string,
    fecha: string,
    data: {
      guiasExitosas: number;
      guiasRechazadas: number;
      cajasEntregadas: number;
      cajasDevueltas: number;
      motivoDevolucion: string;
      motivosSeleccionados: MotivoDevolucionReason[];
      motivoDetalle?: string;
      auditor: string;
      isRutaAbierta?: boolean;
      // Nuevo estado "Caja Abierta": la ruta se liquida igual que un cierre
      // definitivo, pero queda marcada como pendiente de validar la caja/boleta.
      isCajaAbierta?: boolean;
      motivoCajaAbierta?: CajaAbiertaReason;
      // Valor (Q) de la diferencia de la ruta en Caja Abierta (opcional).
      montoDiferenciaCaja?: number;
      // Comentario libre y opcional, disponible para las 3 modalidades de cierre.
      comentario?: string;
      // Clientes marcados puntualmente como pendientes (Ruta Abierta / Caja
      // Abierta), cada uno con su propio motivo. Solo se envía cuando la ruta
      // tenía clientesRuta cargado y el usuario marcó al menos uno; si no, queda
      // undefined y la liquidación funciona exactamente igual que siempre.
      clientesPendientes?: ClientePendiente[];
    }
  ) => void;
}

// Ruta Bolsón: se envía a rechazo y no sale a ruta (ver AssignModal).
const MOTIVO_BOLSON = 'Ruta Bolsón (Rechazo)';
const isBolsonRoute = (r: { esBolson?: boolean; tipoAsignacion?: string }) => !!(r.esBolson || r.tipoAsignacion === 'Ruta Bolsón');

export const LiquidateModal: React.FC<LiquidateModalProps> = ({
  isOpen,
  onClose,
  route,
  defaultAuditor,
  onConfirmLiquidation,
}) => {
  const [isMaximized, toggleMaximized] = useMaximized('dc_liquidate_maximized');
  const [guiasExitosas, setGuiasExitosas] = useState(0);
  const [guiasRechazadas, setGuiasRechazadas] = useState(0);
  const [cajasDevueltas, setCajasDevueltas] = useState<number | string>('0.000');
  // Corrección (pedido del usuario): se eliminó el "Motivo de Devolución /
  // Mermas" general de toda la ruta. El motivo ahora se registra POR CLIENTE
  // (lista de clientes de la ruta). Esta razón única solo se usa como respaldo
  // cuando la ruta no trae lista de clientes, o en un cierre con diferencia en
  // el que no se marcó ningún cliente.
  const [motivoGeneral, setMotivoGeneral] = useState<string>('');
  const [motivoGeneralError, setMotivoGeneralError] = useState('');
  const [auditor, setAuditor] = useState('Operador de Agencia');
  const [tipoResolucion, setTipoResolucion] = useState<'liquidada' | 'abierta' | 'cajaAbierta'>('liquidada');
  const [motivoCajaAbierta, setMotivoCajaAbierta] = useState<CajaAbiertaReason | null>(null);
  const [cajaAbiertaError, setCajaAbiertaError] = useState('');
  const [montoDiferencia, setMontoDiferencia] = useState('');
  // Ventana emergente "¿Estás seguro?" antes del OK final.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [comentario, setComentario] = useState('');
  // Clientes marcados puntualmente como pendientes en Ruta Abierta / Caja
  // Abierta (código -> motivo elegido, vacío mientras no se elija). Solo tiene
  // sentido cuando la ruta trae clientesRuta cargado (ver Route.clientesRuta) —
  // si no, esta sección ni siquiera se muestra y todo funciona como siempre.
  const [clientesMarcados, setClientesMarcados] = useState<Map<string, string>>(new Map());
  const [clientesFiltro, setClientesFiltro] = useState('');
  const [clientesPendientesError, setClientesPendientesError] = useState('');

  useEffect(() => {
    if (isOpen && route) {
      const paradasCount = parseInt(String(route.paradas)) || 1;
      const bolson = isBolsonRoute(route);
      // Ruta Bolsón: no salió, se liquida como rechazo total (se puede ajustar).
      setGuiasExitosas(bolson ? 0 : paradasCount);
      setGuiasRechazadas(bolson ? paradasCount : 0);
      setCajasDevueltas(bolson ? (parseFloat(String(route.cajasFisicas)) || 0).toFixed(3) : '0.000');
      setMotivoGeneral(bolson ? MOTIVO_BOLSON : '');
      setMotivoGeneralError('');
      setAuditor(defaultAuditor?.trim() || 'Operador de Agencia');
      // If already marked as Abierta, default to abierta
      setTipoResolucion(route.estado === 'Abierta' ? 'abierta' : 'liquidada');
      setMotivoCajaAbierta(null);
      setCajaAbiertaError('');
      setMontoDiferencia('');
      setConfirmOpen(false);
      setComentario('');
      setClientesMarcados(new Map());
      setClientesFiltro('');
      setClientesPendientesError('');
    }
  }, [isOpen, route, defaultAuditor]);

  // Cambiar de modalidad de cierre limpia los clientes marcados: los motivos
  // disponibles son distintos entre Ruta Abierta y Caja Abierta, así que no
  // tiene sentido arrastrar una selección hecha bajo la otra modalidad.
  useEffect(() => {
    setClientesMarcados(new Map());
    setClientesPendientesError('');
    setMotivoGeneral(route && isBolsonRoute(route) && tipoResolucion === 'liquidada' ? MOTIVO_BOLSON : '');
    setMotivoGeneralError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoResolucion]);

  // Corrección: si se marcan clientes como pendientes en modalidad "Ruta
  // Abierta", las Paradas No Entregadas y las Cajas Devueltas se recalculan
  // automáticamente a partir de esos clientes (así lo pidió el usuario), sin
  // impedir que después se ajusten a mano si algo no cuadra exactamente. Si no
  // se marca ningún cliente, estos campos se comportan igual que siempre
  // (edición manual). No aplica a "Caja Abierta": ahí los clientes marcados son
  // solo de trazabilidad de la caja/boleta, no representan mercadería sin
  // entregar.
  useEffect(() => {
    // Ruta Abierta y Cierre Definitivo con diferencia: los clientes marcados son
    // mercadería no entregada, así que recalculan paradas y cajas devueltas.
    if (tipoResolucion === 'cajaAbierta') return;
    if (!route?.clientesRuta || route.clientesRuta.length === 0) return;
    if (clientesMarcados.size === 0) return;
    const marcados = route.clientesRuta.filter((c) => clientesMarcados.has(c.codigo));
    const sumaCajas = marcados.reduce((acc, c) => acc + (Number(c.cajas) || 0), 0);
    handleRechazadasChange(marcados.length);
    setCajasDevueltas(sumaCajas.toFixed(3));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientesMarcados, tipoResolucion]);

  if (!isOpen || !route) return null;

  const totalParadas = parseInt(String(route.paradas)) || 0;
  const totalCajasSalida = parseFloat(String(route.cajasFisicas)) || 0;
  const devueltasNum = parseFloat(String(cajasDevueltas)) || 0;
  const cajasEntregadas = Math.max(0, totalCajasSalida - devueltasNum);

  const handleExitosasChange = (val: number) => {
    const safeExitosas = Math.min(Math.max(0, val), totalParadas);
    setGuiasExitosas(safeExitosas);
    const rej = Math.max(0, totalParadas - safeExitosas);
    setGuiasRechazadas(rej);
  };

  const handleRechazadasChange = (val: number) => {
    const safeRechazadas = Math.min(Math.max(0, val), totalParadas);
    setGuiasRechazadas(safeRechazadas);
    const ok = Math.max(0, totalParadas - safeRechazadas);
    setGuiasExitosas(ok);
  };

  const hayDiferencia = devueltasNum > 0 || guiasRechazadas > 0;
  const tieneClientes = !!route.clientesRuta && route.clientesRuta.length > 0;
  // Opciones de motivo según la modalidad.
  const esBolson = isBolsonRoute(route);
  const motivosDevolucionOpts: { reason: string; icon: string }[] =
    tipoResolucion === 'abierta'
      ? [{ reason: MOTIVO_REVISITA, icon: '🔁' }, ...MOTIVO_DEVOLUCION_OPTIONS]
      : esBolson
      ? [{ reason: MOTIVO_BOLSON, icon: '🗃️' }, ...MOTIVO_DEVOLUCION_OPTIONS]
      : MOTIVO_DEVOLUCION_OPTIONS;
  // Razón general de respaldo: Ruta Abierta sin lista de clientes, o cierre
  // (definitivo / caja abierta) con diferencia sin clientes marcados.
  const mostrarMotivoGeneral =
    (tipoResolucion === 'abierta' && !tieneClientes) ||
    (tipoResolucion !== 'abierta' && hayDiferencia && (tipoResolucion === 'cajaAbierta' || clientesMarcados.size === 0));

  // Validación previa (ventana emergente): avisos antes de confirmar.
  const clientesSinMotivo = Array.from(clientesMarcados.values()).some((m) => !m);
  const bloqueos: string[] = [];
  const avisos: string[] = [];
  if (tipoResolucion === 'cajaAbierta') {
    if (!motivoCajaAbierta) bloqueos.push('El motivo de la caja abierta no está marcado.');
    if (montoDiferencia.trim() === '') avisos.push('El valor de dinero (Q) de la diferencia está en blanco.');
    else if (!(Number(montoDiferencia.replace(',', '.')) > 0)) avisos.push('El valor de dinero (Q) de la diferencia es 0.');
  }
  if (tipoResolucion === 'liquidada' && hayDiferencia && clientesMarcados.size === 0 && !motivoGeneral) {
    bloqueos.push('Hay diferencia (cajas devueltas o paradas no entregadas) y no se marcó ningún motivo.');
  }
  if (tipoResolucion === 'abierta' && !motivoGeneral && clientesMarcados.size === 0) {
    avisos.push('No se marcó motivo para dejar la ruta abierta (se registrará como Revisita).');
  }
  if (clientesSinMotivo) bloqueos.push('Hay clientes marcados como pendientes sin motivo.');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setConfirmOpen(true);
  };

  const doSubmit = () => {
    setConfirmOpen(false);
    const isCajaAbierta = tipoResolucion === 'cajaAbierta';
    if (isCajaAbierta && !motivoCajaAbierta) {
      setCajaAbiertaError('Selecciona el motivo por el que la caja queda pendiente de validar.');
      return;
    }
    const montoNum = montoDiferencia.trim() === '' ? undefined : Number(montoDiferencia.replace(',', '.'));
    if (isCajaAbierta && montoNum !== undefined && (!isFinite(montoNum) || montoNum < 0)) {
      setCajaAbiertaError('El valor de la diferencia debe ser un número mayor o igual a 0.');
      return;
    }
    setCajaAbiertaError('');

    // Validar que todo cliente marcado como pendiente tenga su motivo elegido.
    if (clientesMarcados.size > 0) {
      const faltante = Array.from(clientesMarcados.values()).some((m) => !m);
      if (faltante) {
        setClientesPendientesError('Selecciona el motivo para todos los clientes marcados como pendientes.');
        return;
      }
    }
    const clientesPendientes: ClientePendiente[] | undefined =
      clientesMarcados.size > 0
        ? Array.from(clientesMarcados.entries()).map(([codigo, motivo]) => {
            const cliente = route.clientesRuta?.find((c) => c.codigo === codigo);
            return {
              codigo,
              nombre: cliente?.nombre || '',
              motivo,
              cajas: cliente?.cajas,
            };
          })
        : undefined;

    const isRutaAbierta = tipoResolucion === 'abierta';

    // Cierre Definitivo con diferencia: es obligatorio indicar la razón, ya sea
    // marcando los clientes no entregados (cada uno con su motivo) o, si no se
    // marca ninguno, con la razón general.
    if (tipoResolucion === 'liquidada' && hayDiferencia && clientesMarcados.size === 0 && !motivoGeneral) {
      setMotivoGeneralError(
        tieneClientes
          ? 'Cierre con diferencia: marca los clientes no entregados con su motivo, o elige la razón del cierre con diferencia.'
          : 'Cierre con diferencia: elige la razón del cierre con diferencia.'
      );
      return;
    }
    setMotivoGeneralError('');

    // Motivo de devolución de la ruta = motivos de los clientes marcados (sin
    // repetir). En Caja Abierta los motivos de los clientes son de la caja, no
    // de devolución, así que ahí solo cuenta la razón general.
    const motivosDeClientes =
      tipoResolucion === 'cajaAbierta'
        ? []
        : Array.from(new Set(Array.from(clientesMarcados.values()).filter(Boolean)));
    let finalMotivos: string[] = motivosDeClientes.length > 0 ? motivosDeClientes : motivoGeneral ? [motivoGeneral] : [];
    if (isRutaAbierta && finalMotivos.length === 0) finalMotivos = [MOTIVO_REVISITA];
    if (!isRutaAbierta && !hayDiferencia) finalMotivos = [];
    const validReasons = new Set<string>([MOTIVO_REVISITA, ...MOTIVO_DEVOLUCION_OPTIONS.map((o) => o.reason)]);
    const finalMotivoDevolucion = finalMotivos.join(', ');

    onConfirmLiquidation(route.id, getRouteKey(route), {
      guiasExitosas,
      guiasRechazadas,
      cajasEntregadas: parseFloat(cajasEntregadas.toFixed(3)),
      cajasDevueltas: parseFloat(devueltasNum.toFixed(3)),
      motivoDevolucion: finalMotivoDevolucion,
      motivosSeleccionados: finalMotivos.filter((m) => validReasons.has(m)) as MotivoDevolucionReason[],
      motivoDetalle: undefined,
      auditor: auditor.trim() || 'Auditor de Agencia',
      isRutaAbierta,
      isCajaAbierta,
      motivoCajaAbierta: isCajaAbierta ? motivoCajaAbierta ?? undefined : undefined,
      montoDiferenciaCaja: isCajaAbierta && montoNum !== undefined ? Math.round(montoNum * 100) / 100 : undefined,
      comentario: comentario.trim() || undefined,
      clientesPendientes,
    });
  };

  const infoTruck = route.asignacion ? route.asignacion.camionPlaca : '(Sin camión actual)';
  const infoDriver = route.asignacion ? route.asignacion.conductor : '(Sin piloto actual)';
  const isSplitNotice = route.isSplitRoute
    ? ` [Viaje ${route.tripNumber} de ${route.totalTrips}]`
    : '';

  return (
    <div className={`fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center ${isMaximized ? 'p-0' : 'p-3 sm:p-4'}`}>
      <div
        className={`bg-white w-full shadow-2xl border border-slate-200 overflow-hidden transform transition-all flex flex-col ${
          isMaximized ? 'h-full max-h-full rounded-none' : 'rounded-2xl max-w-2xl lg:max-w-3xl max-h-[92vh]'
        }`}
      >
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between flex-shrink-0">
          <div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <h3 className="font-bold text-sm">{esBolson ? 'Liquidación de Ruta Bolsón (Rechazo)' : 'Cierre y Liquidación de Ruta'}</h3>
            </div>
            <p className="text-[11px] text-slate-400">
              Liquidando Ruta: {route.id}
              {isSplitNotice} | Agencia: {route.agencia} | {route.cajasFisicas || 0} Cajas Físicas
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <IconButton
              icon={isMaximized ? ACTION_ICONS.restaurar : ACTION_ICONS.pantallaCompleta}
              label={isMaximized ? 'Restaurar tamaño de la ventana' : 'Ver a pantalla completa'}
              onClick={toggleMaximized}
              className="text-slate-300 hover:text-white hover:bg-slate-800"
            />
            <IconButton
              icon={ACTION_ICONS.cerrar}
              label="Cerrar sin guardar"
              onClick={onClose}
              className="text-slate-300 hover:text-white hover:bg-slate-800"
            />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
          {/* Summary Banner */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 grid grid-cols-3 gap-2 text-center">
            <div className="border-r border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase">Camión</span>
              <b className="text-slate-800 text-xs">{infoTruck}</b>
            </div>
            <div className="border-r border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase">Piloto</span>
              <b className="text-slate-800 text-xs">{infoDriver}</b>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase">Cajas Físicas</span>
              <b className="text-blue-700 font-mono text-xs">{route.cajasFisicas || 0} Cajas</b>
            </div>
          </div>

          {esBolson && (
            <div className="bg-rose-50 border border-rose-300 rounded-xl p-3 text-rose-950 space-y-1">
              <div className="font-bold text-xs text-rose-900">🗃️ Ruta Bolsón: no salió a ruta (sin camión ni tripulación)</div>
              <p className="text-[11px] leading-relaxed">
                Se liquida como <strong>rechazo total</strong>: 0 paradas entregadas y todas las cajas devueltas. Si una parte sí se
                entregó, ajusta los números antes de confirmar.
                {route.motivoBolson ? <span className="block mt-0.5"><strong>Motivo:</strong> {route.motivoBolson}</span> : null}
              </p>
            </div>
          )}

          {/* 1. Balance de Paradas y Cajas Físicas */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white">
            <h4 className="font-bold text-slate-800 text-xs flex items-center">
              <ClipboardCheck className="w-4 h-4 mr-1 text-blue-600" />
              Balance Operativo de Paradas y Cajas Físicas
            </h4>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">Paradas Programadas</label>
                <input
                  type="number"
                  value={totalParadas}
                  readOnly
                  className="w-full p-2 bg-slate-100 border border-slate-200 rounded-lg font-bold text-slate-700 outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-emerald-700 mb-1">Paradas Completadas *</label>
                <input
                  type="number"
                  min="0"
                  max={totalParadas}
                  value={guiasExitosas}
                  onChange={(e) => handleExitosasChange(parseInt(e.target.value) || 0)}
                  required
                  className="w-full min-h-[44px] p-2 border border-emerald-300 rounded-lg font-bold text-emerald-700 bg-emerald-50/40 outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-rose-700 mb-1">Paradas No Entregadas</label>
                <input
                  type="number"
                  min="0"
                  max={totalParadas}
                  value={guiasRechazadas}
                  onChange={(e) => handleRechazadasChange(parseInt(e.target.value) || 0)}
                  className="w-full min-h-[44px] p-2 border border-rose-300 rounded-lg font-bold text-rose-700 bg-rose-50/40 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div>
                <label className="block font-semibold text-slate-600 mb-1 text-[11px]">
                  Cajas Físicas Salida (Cargadas)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={totalCajasSalida.toFixed(3)}
                  readOnly
                  className="w-full p-2 bg-slate-200/70 border border-slate-300 rounded-lg font-mono font-bold text-slate-700 outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-rose-700 mb-1 text-[11px] flex items-center">
                  <span className="w-2 h-2 rounded-full bg-rose-500 mr-1"></span> Cajas Devueltas / Rechazo
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={cajasDevueltas}
                  onChange={(e) => setCajasDevueltas(e.target.value)}
                  className="w-full min-h-[44px] p-2 border-2 border-rose-300 focus:border-rose-500 rounded-lg font-mono font-bold text-rose-700 bg-rose-50/50 outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-emerald-700 mb-1 text-[11px] flex items-center">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1"></span> Cajas Físicas Entregadas (Resta)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={cajasEntregadas.toFixed(3)}
                  readOnly
                  className="w-full min-h-[44px] p-2 border border-emerald-300 bg-emerald-50/60 rounded-lg font-mono font-extrabold text-emerald-700 outline-none"
                />
              </div>
            </div>

            <p className="text-[10px] text-slate-500">
              El motivo de lo no entregado se registra por cliente, en la lista de clientes de abajo.
            </p>
          </div>

          {/* Modalidad de Cierre / Resolución */}
          <div className="border border-slate-200 rounded-xl p-3.5 space-y-2 bg-slate-50/70">
            <label className="block font-bold text-slate-800 text-xs">
              Modalidad de Cierre / Resolución de la Ruta *
            </label>
            <div role="radiogroup" aria-label="Modalidad de cierre" className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div
                role="radio"
                tabIndex={0}
                aria-checked={tipoResolucion === 'liquidada'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setTipoResolucion('liquidada');
                  }
                }}
                onClick={() => setTipoResolucion('liquidada')}
                className={`p-3 rounded-xl border-2 transition cursor-pointer flex flex-col justify-between outline-none focus-visible:ring-4 focus-visible:ring-blue-200 ${
                  tipoResolucion === 'liquidada'
                    ? 'border-emerald-500 bg-emerald-50/60 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-xs flex items-center">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600 mr-1.5" />
                      Cierre Definitivo (Liquidada)
                    </span>
                    <input
                      type="radio"
                      name="tipoResolucion"
                      checked={tipoResolucion === 'liquidada'}
                      onChange={() => setTipoResolucion('liquidada')}
                      className="cursor-pointer"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Cierra la ruta operativamente, libera piloto, auxiliares y unidad, y la transfiere al <strong>Tablero de Rutas Liquidadas</strong>.
                  </p>
                </div>
              </div>

              <div
                role="radio"
                tabIndex={0}
                aria-checked={tipoResolucion === 'abierta'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setTipoResolucion('abierta');
                  }
                }}
                onClick={() => setTipoResolucion('abierta')}
                className={`p-3 rounded-xl border-2 transition cursor-pointer flex flex-col justify-between outline-none focus-visible:ring-4 focus-visible:ring-blue-200 ${
                  tipoResolucion === 'abierta'
                    ? 'border-indigo-500 bg-indigo-50/70 shadow-xs ring-1 ring-indigo-200'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-indigo-900 text-xs flex items-center">
                      <RotateCcw className="w-3.5 h-3.5 text-indigo-600 mr-1.5" />
                      Ruta Abierta (Para Reasignar / Revisita)
                    </span>
                    <input
                      type="radio"
                      name="tipoResolucion"
                      checked={tipoResolucion === 'abierta'}
                      onChange={() => setTipoResolucion('abierta')}
                      className="cursor-pointer"
                    />
                  </div>
                  <p className="text-[11px] text-indigo-900 mt-1 leading-relaxed">
                    <strong>Libera piloto, auxiliares y unidad</strong> para dejarlos disponibles, y <strong>mantiene la ruta en el Tablero de Rutas</strong> con registro de su salida y retorno para volver a sacarla como <strong>Revisita</strong> (al día siguiente o por falta de tiempo).
                  </p>
                </div>
              </div>

              <div
                role="radio"
                tabIndex={0}
                aria-checked={tipoResolucion === 'cajaAbierta'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setTipoResolucion('cajaAbierta');
                  }
                }}
                onClick={() => setTipoResolucion('cajaAbierta')}
                className={`p-3 rounded-xl border-2 transition cursor-pointer flex flex-col justify-between outline-none focus-visible:ring-4 focus-visible:ring-blue-200 ${
                  tipoResolucion === 'cajaAbierta'
                    ? 'border-amber-500 bg-amber-50/70 shadow-xs ring-1 ring-amber-200'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-amber-900 text-xs flex items-center">
                      <Lock className="w-3.5 h-3.5 text-amber-600 mr-1.5" />
                      Caja Abierta (Pendiente de Validar)
                    </span>
                    <input
                      type="radio"
                      name="tipoResolucion"
                      checked={tipoResolucion === 'cajaAbierta'}
                      onChange={() => setTipoResolucion('cajaAbierta')}
                      className="cursor-pointer"
                    />
                  </div>
                  <p className="text-[11px] text-amber-900 mt-1 leading-relaxed">
                    <strong>Libera piloto, auxiliares y unidad</strong> y <strong>transfiere la ruta a Rutas Liquidadas</strong> igual que un cierre definitivo, pero queda marcada como <strong>Caja Abierta</strong> hasta validar la caja/boleta del punto de venta.
                  </p>
                </div>
              </div>
            </div>

            {tipoResolucion === 'cajaAbierta' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                <label className="block font-bold text-amber-900 text-[11px]">
                  Motivo por el que la caja queda pendiente de validar *
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {CAJA_ABIERTA_OPTIONS.map((opt) => {
                    const isActive = motivoCajaAbierta === opt.reason;
                    return (
                      <button
                        key={opt.reason}
                        type="button"
                        onClick={() => {
                          setMotivoCajaAbierta(opt.reason);
                          setCajaAbiertaError('');
                        }}
                        className={`min-h-[44px] px-3 text-xs font-bold border rounded-lg transition cursor-pointer shadow-xs ${
                          isActive
                            ? 'bg-amber-600 text-white border-amber-700 ring-2 ring-amber-200'
                            : 'bg-white hover:bg-amber-100 border-amber-300 text-amber-800'
                        }`}
                      >
                        {opt.icon} {opt.reason}
                      </button>
                    );
                  })}
                </div>
                <div className="pt-1">
                  <label htmlFor="montoDiferenciaCaja" className="block font-bold text-amber-900 text-[11px] mb-1">
                    Valor de la diferencia de la ruta (Q)
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-amber-800">Q</span>
                    <input
                      id="montoDiferenciaCaja"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={montoDiferencia}
                      onChange={(e) => setMontoDiferencia(e.target.value)}
                      placeholder="0.00"
                      className="w-40 min-h-[44px] px-3 border border-amber-300 rounded-lg text-sm font-mono font-bold bg-white text-slate-800 outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <span className="text-[10px] text-amber-800">Monto por el que existe diferencia (opcional).</span>
                  </div>
                </div>
                {cajaAbiertaError && (
                  <p className="text-[11px] text-rose-700 font-semibold">{cajaAbiertaError}</p>
                )}
              </div>
            )}

            {tipoResolucion === 'abierta' && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-[11px] flex items-start space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Aviso Operativo:</strong> Al confirmar como <strong>Ruta Abierta</strong>, el piloto ({infoDriver}) y la unidad ({infoTruck}) quedarán libres y disponibles en bodega. La ruta permanecerá en el tablero con la opción <em>"Reasignar Unidad"</em> para un nuevo despacho.
                </div>
              </div>
            )}
          </div>

          {/* Clientes Pendientes: solo aparece cuando la ruta trae detalle de
              clientes cargado (import de Excel) y la modalidad no es Cierre
              Definitivo. Permite marcar puntualmente qué clientes quedaron
              pendientes y con qué motivo, en vez de un solo motivo para toda la
              ruta. Es completamente opcional: si no se marca ningún cliente,
              todo funciona exactamente igual que antes de este cambio. */}
          {tieneClientes &&
            (() => {
              // Ruta Abierta: clientes que quedan pendientes (motivo de devolución o Revisita).
              // Cierre Definitivo: clientes no entregados en un cierre con diferencia.
              // Caja Abierta: clientes cuya caja/boleta queda pendiente (motivo de caja).
              const motivoOptions: { reason: string; icon: string }[] =
                tipoResolucion === 'cajaAbierta' ? CAJA_ABIERTA_OPTIONS : motivosDevolucionOpts;
              const tituloClientes =
                tipoResolucion === 'abierta'
                  ? 'Clientes que quedan abiertos'
                  : tipoResolucion === 'liquidada'
                  ? 'Clientes no entregados (cierre con diferencia)'
                  : 'Clientes con caja pendiente';

              const filtro = clientesFiltro.toLowerCase().trim();
              const clientesFiltrados = route.clientesRuta!.filter(
                (c) =>
                  !filtro ||
                  c.codigo.toLowerCase().includes(filtro) ||
                  (c.nombre || '').toLowerCase().includes(filtro)
              );

              const toggleCliente = (codigo: string) => {
                setClientesMarcados((prev) => {
                  const next = new Map(prev);
                  if (next.has(codigo)) next.delete(codigo);
                  else next.set(codigo, '');
                  return next;
                });
                setClientesPendientesError('');
              };

              const setMotivoCliente = (codigo: string, motivo: string) => {
                setClientesMarcados((prev) => {
                  const next = new Map(prev);
                  next.set(codigo, motivo);
                  return next;
                });
                setClientesPendientesError('');
              };

              return (
                <div className="border border-slate-200 rounded-xl p-3.5 space-y-2.5 bg-white">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="font-bold text-slate-800 text-xs flex items-center">
                      <Users className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                      {tituloClientes} ({clientesMarcados.size} de {route.clientesRuta!.length} marcados)
                    </label>
                    <div className="relative w-full sm:w-52">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={clientesFiltro}
                        onChange={(e) => setClientesFiltro(e.target.value)}
                        placeholder="Buscar código o nombre..."
                        aria-label="Buscar cliente por código o nombre"
                        className="w-full min-h-[40px] pl-7 pr-2 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <p className={`text-[10px] ${tipoResolucion === 'liquidada' && hayDiferencia && clientesMarcados.size === 0 ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>
                    {tipoResolucion === 'abierta'
                      ? 'Marca los clientes que quedan abiertos y el motivo de cada uno. Si no marcas ninguno, se registra como Revisita. Las paradas y cajas devueltas se recalculan solas.'
                      : tipoResolucion === 'liquidada'
                      ? hayDiferencia
                        ? 'Cierre con diferencia: marca los clientes no entregados y el motivo de cada uno (o elige abajo la razón del cierre con diferencia).'
                        : 'Si el cierre tiene diferencia, marca aquí los clientes no entregados y su motivo; las paradas y cajas devueltas se recalculan solas.'
                      : 'Opcional: marca los clientes cuya caja/boleta queda pendiente y su motivo.'}
                  </p>

                  <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {clientesFiltrados.map((c) => {
                      const isMarcado = clientesMarcados.has(c.codigo);
                      return (
                        <div
                          key={c.codigo}
                          className={`flex items-center justify-between gap-2 min-h-[48px] py-1 px-2 ${
                            isMarcado ? 'bg-amber-50/60' : ''
                          }`}
                        >
                          <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isMarcado}
                              onChange={() => toggleCliente(c.codigo)}
                              className="cursor-pointer shrink-0 w-5 h-5"
                            />
                            <span className="truncate text-xs">
                              <span className="font-mono text-slate-500">{c.codigo}</span>{' '}
                              <span className="font-medium text-slate-800">{c.nombre || '-'}</span>{' '}
                              <span className="text-slate-400">({Number(c.cajas || 0).toFixed(3)} cajas)</span>
                            </span>
                          </label>
                          {isMarcado && (
                            <select
                              value={clientesMarcados.get(c.codigo) || ''}
                              onChange={(e) => setMotivoCliente(c.codigo, e.target.value)}
                              aria-label={`Motivo del cliente ${c.codigo}`}
                              className="min-h-[40px] text-xs border border-amber-300 bg-white rounded-lg px-2 outline-none shrink-0 cursor-pointer font-semibold text-amber-900 focus-visible:ring-2 focus-visible:ring-amber-400"
                            >
                              <option value="">-- Motivo --</option>
                              {motivoOptions.map((opt) => (
                                <option key={opt.reason} value={opt.reason}>
                                  {opt.icon} {opt.reason}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    })}
                    {clientesFiltrados.length === 0 && (
                      <div className="py-3 text-center text-[11px] text-slate-400">Sin resultados</div>
                    )}
                  </div>

                  {clientesPendientesError && (
                    <p className="text-[11px] text-rose-700 font-semibold">{clientesPendientesError}</p>
                  )}
                </div>
              );
            })()}

          {mostrarMotivoGeneral && (
            <div className={`border rounded-xl p-3.5 space-y-2 ${tipoResolucion === 'abierta' ? 'border-indigo-200 bg-indigo-50/40' : 'border-rose-200 bg-rose-50/40'}`}>
              <label className="block font-bold text-slate-800 text-xs">
                {tipoResolucion === 'abierta'
                  ? 'Motivo por el que la ruta queda abierta'
                  : `Razón del cierre con diferencia${tipoResolucion === 'liquidada' ? ' *' : ''}`}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {motivosDevolucionOpts.map((opt) => {
                  const isActive = motivoGeneral === opt.reason;
                  return (
                    <button
                      key={opt.reason}
                      type="button"
                      onClick={() => {
                        setMotivoGeneral(isActive ? '' : opt.reason);
                        setMotivoGeneralError('');
                      }}
                      className={`min-h-[44px] px-3 text-xs font-semibold border rounded-lg transition cursor-pointer ${
                        isActive
                          ? 'bg-slate-800 text-white border-slate-900'
                          : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                      }`}
                    >
                      {opt.icon} {opt.reason}
                    </button>
                  );
                })}
              </div>
              {tipoResolucion === 'abierta' && !motivoGeneral && (
                <p className="text-[10px] text-slate-500">Si no eliges ninguno, se registra como Revisita.</p>
              )}
            </div>
          )}
          {motivoGeneralError && (
            <p className="text-[11px] text-rose-700 font-semibold -mt-2">{motivoGeneralError}</p>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Comentario (opcional)
            </label>
            <textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              rows={2}
              placeholder="Agrega cualquier observación adicional sobre esta liquidación..."
              className="w-full min-h-[44px] p-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block font-semibold text-slate-700">
                Nombre del Liquidador / Auditor en Agencia *
              </label>
              {defaultAuditor && auditor !== defaultAuditor && (
                <button
                  type="button"
                  onClick={() => setAuditor(defaultAuditor)}
                  className="min-h-[40px] px-2 text-xs font-semibold text-blue-700 hover:bg-blue-50 rounded-lg cursor-pointer"
                >
                  Usar mi usuario ({defaultAuditor})
                </button>
              )}
            </div>
            <input
              type="text"
              value={auditor}
              onChange={(e) => setAuditor(e.target.value)}
              required
              className="w-full min-h-[44px] p-2 border border-slate-300 rounded-lg outline-none"
            />
            {defaultAuditor && auditor === defaultAuditor && (
              <p className="text-[10px] text-slate-400 mt-1">
                Precargado con tu usuario de sesión. Puedes editarlo si otra persona está liquidando físicamente.
              </p>
            )}
          </div>

          {/* Pie fijo con el verbo exacto de lo que va a pasar. */}
          <ModalFooter
            bleed="p-6"
            secondary={
              <Button variant="secondary" size="lg" onClick={onClose}>
                Cancelar
              </Button>
            }
          >
            {tipoResolucion === 'abierta' ? (
              <Button type="submit" variant="primary" size="lg" icon={ACTION_ICONS.reasignar}>
                Dejar abierta para reasignar
              </Button>
            ) : tipoResolucion === 'cajaAbierta' ? (
              <Button type="submit" variant="warning" size="lg" icon={Lock}>
                Liquidar con caja abierta
              </Button>
            ) : (
              <Button type="submit" variant="success" size="lg" icon={ACTION_ICONS.liquidar}>
                Liquidar ruta {route.id}
              </Button>
            )}
          </ModalFooter>
        </form>
      </div>

      {/* Ventana emergente de confirmación antes del OK final */}
      {confirmOpen && (() => {
        const n3 = (v: number) => v.toLocaleString('es-GT', { maximumFractionDigits: 3 });
        const modalidad = tipoResolucion === 'abierta' ? 'Ruta Abierta (para reasignar)' : tipoResolucion === 'cajaAbierta' ? 'Caja Abierta (pendiente de validar)' : 'Cierre definitivo (liquidada)';
        const motivoTxt =
          tipoResolucion === 'cajaAbierta'
            ? motivoCajaAbierta || '— sin marcar —'
            : clientesMarcados.size > 0
            ? Array.from(new Set(Array.from(clientesMarcados.values()).filter(Boolean))).join(', ') || '— sin marcar —'
            : motivoGeneral || (hayDiferencia || tipoResolucion === 'abierta' ? '— sin marcar —' : 'No aplica (entrega completa)');
        const montoTxt = montoDiferencia.trim() === '' ? '— en blanco —' : `Q ${Number(montoDiferencia.replace(',', '.') || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        return (
          <div className="fixed inset-0 z-[60] bg-slate-900/50 flex items-center justify-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="liqConfirmTitle">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden">
              <div className={`px-5 py-3.5 text-white ${bloqueos.length ? 'bg-rose-600' : avisos.length ? 'bg-amber-500' : 'bg-slate-900'}`}>
                <h4 id="liqConfirmTitle" className="font-bold text-base">
                  {bloqueos.length ? 'Falta información antes de liquidar' : '¿Estás seguro de liquidar esta ruta?'}
                </h4>
                <p className="text-xs opacity-90">Ruta {route.id} · {route.agencia}</p>
              </div>
              <div className="p-5 space-y-3 text-sm">
                {bloqueos.length > 0 && (
                  <ul className="space-y-1.5">
                    {bloqueos.map((b) => (
                      <li key={b} className="flex gap-2 text-rose-700 font-semibold"><span>⛔</span><span>{b}</span></li>
                    ))}
                  </ul>
                )}
                {avisos.length > 0 && (
                  <ul className="space-y-1.5">
                    {avisos.map((a) => (
                      <li key={a} className="flex gap-2 text-amber-800 font-semibold"><span>⚠️</span><span>{a}</span></li>
                    ))}
                  </ul>
                )}
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <dt className="text-slate-500">Modalidad</dt><dd className="font-semibold text-slate-800">{modalidad}</dd>
                  <dt className="text-slate-500">Paradas</dt><dd className="font-semibold text-slate-800">{guiasExitosas} entregadas · {guiasRechazadas} no entregadas</dd>
                  <dt className="text-slate-500">Cajas</dt><dd className="font-semibold text-slate-800">{n3(cajasEntregadas)} entregadas · {n3(devueltasNum)} devueltas</dd>
                  <dt className="text-slate-500">Motivo</dt><dd className={`font-semibold ${motivoTxt.startsWith('—') ? 'text-rose-700' : 'text-slate-800'}`}>{motivoTxt}</dd>
                  {tipoResolucion === 'cajaAbierta' && (
                    <>
                      <dt className="text-slate-500">Valor (Q)</dt><dd className={`font-semibold ${montoTxt.startsWith('—') ? 'text-amber-700' : 'text-slate-800'}`}>{montoTxt}</dd>
                    </>
                  )}
                </dl>
                {!bloqueos.length && avisos.length > 0 && (
                  <p className="text-xs text-slate-600">Puedes volver para completar los datos o continuar así.</p>
                )}
              </div>
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap justify-end gap-2">
                <Button variant="secondary" size="lg" onClick={() => setConfirmOpen(false)} autoFocus={bloqueos.length > 0 || avisos.length > 0}>
                  {bloqueos.length ? 'Volver y completar' : 'Volver a revisar'}
                </Button>
                {!bloqueos.length && (
                  <Button variant={tipoResolucion === 'cajaAbierta' ? 'warning' : tipoResolucion === 'abierta' ? 'primary' : 'success'} size="lg" onClick={doSubmit}>
                    {avisos.length ? 'Sí, liquidar así' : 'Sí, confirmar'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
