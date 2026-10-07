import React, { useEffect, useState } from 'react';
import { Route, AbonoCaja } from '../../types';
import { getRouteKey } from '../../utils/routeKey';

// --- Abonos diarios de una Caja Abierta ---
// Registra pagos parciales (abonos) contra el valor pendiente de la caja.
// Cuando lo abonado llega al 100% del valor, la caja se cierra sola
// (Liquidación Final) y la ruta queda como liquidada. No modifica ningún dato
// operativo de la ruta (cajas, paradas, motivos).

export const totalAbonado = (abonos?: AbonoCaja[]) =>
  Math.round((abonos || []).reduce((a, x) => a + (Number(x.monto) || 0), 0) * 100) / 100;

const fmtQ = (n: number) => `Q ${n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hoyISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date());

interface Props {
  route: Route | null;
  onClose: () => void;
  onRegistrar: (
    routeId: string,
    routeKey: string,
    abono: { fecha: string; monto: number; comentario?: string },
    montoTotal?: number
  ) => void;
}

export const AbonosCajaModal: React.FC<Props> = ({ route, onClose, onRegistrar }) => {
  const [fecha, setFecha] = useState(hoyISO());
  const [monto, setMonto] = useState('');
  const [comentario, setComentario] = useState('');
  const [montoTotalInput, setMontoTotalInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setFecha(hoyISO());
    setMonto('');
    setComentario('');
    setMontoTotalInput('');
    setError('');
  }, [route]);

  if (!route || !route.liquidacion) return null;
  const liq = route.liquidacion;
  const abonos = liq.abonosCaja || [];
  const tieneTotal = typeof liq.montoDiferenciaCaja === 'number' && liq.montoDiferenciaCaja > 0;
  const total = tieneTotal ? (liq.montoDiferenciaCaja as number) : Number(montoTotalInput) || 0;
  const abonado = totalAbonado(abonos);
  const saldo = Math.max(0, Math.round((total - abonado) * 100) / 100);
  const pct = total > 0 ? Math.min(100, (abonado / total) * 100) : 0;
  const cerrada = !!liq.cajaAbiertaResuelta;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const m = Math.round(Number(monto) * 100) / 100;
    if (!tieneTotal && !(Number(montoTotalInput) > 0)) {
      setError('Indica el valor total pendiente de la caja (Q).');
      return;
    }
    if (!(m > 0)) {
      setError('El abono debe ser mayor a 0.');
      return;
    }
    if (m > saldo + 0.001) {
      setError(`El abono no puede ser mayor al saldo pendiente (${fmtQ(saldo)}).`);
      return;
    }
    const [y, mo, d] = fecha.split('-');
    if (!y || !mo || !d) {
      setError('Indica la fecha del abono.');
      return;
    }
    onRegistrar(
      route.id,
      getRouteKey(route),
      { fecha: `${d}/${mo}/${y}`, monto: m, comentario: comentario.trim() || undefined },
      tieneTotal ? undefined : Math.round(Number(montoTotalInput) * 100) / 100
    );
    setMonto('');
    setComentario('');
  };

  return (
    <div className="fixed inset-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 110 }} onClick={onClose}>
      <div
        id="modalAbonosCaja"
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-900 text-white px-5 py-4">
          <h2 className="text-base font-bold">Abonos · Caja Abierta · Ruta {route.id}</h2>
          <p className="text-xs text-slate-300 mt-0.5">
            {route.agencia}
            {liq.motivoCajaAbierta ? ` · ${liq.motivoCajaAbierta}` : ''}
          </p>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto text-sm">
          {/* Resumen de saldo */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-slate-200 p-2">
              <p className="text-[10px] uppercase font-bold text-slate-500">Valor total</p>
              <p className="font-black text-slate-900">{total > 0 ? fmtQ(total) : '—'}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2">
              <p className="text-[10px] uppercase font-bold text-emerald-700">Abonado</p>
              <p id="abonosTotalAbonado" className="font-black text-emerald-800">{fmtQ(abonado)}</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-2">
              <p className="text-[10px] uppercase font-bold text-amber-700">Saldo</p>
              <p id="abonosSaldo" className="font-black text-amber-900">{total > 0 ? fmtQ(saldo) : '—'}</p>
            </div>
          </div>
          <div className="h-2.5 rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>

          {cerrada ? (
            <p className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold p-3 text-xs">
              Caja cerrada: se completó el pago y la ruta quedó liquidada
              {liq.fechaLiquidacionFinal ? ` (${liq.fechaLiquidacionFinal})` : ''}.
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 p-3 bg-slate-50">
              <p className="text-xs font-bold text-slate-700">Registrar abono</p>
              {!tieneTotal && (
                <div>
                  <label htmlFor="abonoMontoTotal" className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Valor total pendiente de la caja (Q) *
                  </label>
                  <input
                    id="abonoMontoTotal"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={montoTotalInput}
                    onChange={(e) => setMontoTotalInput(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-lg border border-amber-300 bg-white"
                    placeholder="Esta caja no tenía valor registrado"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="abonoFecha" className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Fecha del abono *
                  </label>
                  <input
                    id="abonoFecha"
                    type="date"
                    value={fecha}
                    max={hoyISO()}
                    onChange={(e) => setFecha(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white"
                  />
                </div>
                <div>
                  <label htmlFor="abonoMonto" className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Monto del abono (Q) *
                  </label>
                  <input
                    id="abonoMonto"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <input
                id="abonoComentario"
                type="text"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Comentario (opcional): boleta, depósito, quién entregó..."
                className="w-full min-h-[44px] px-3 rounded-lg border border-slate-300 bg-white"
              />
              {error && <p className="text-xs font-semibold text-rose-600">{error}</p>}
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-slate-500">Al completar el 100% la caja se cierra sola y la ruta queda liquidada.</p>
                <button
                  id="btnRegistrarAbono"
                  type="submit"
                  className="shrink-0 min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm"
                >
                  Registrar abono
                </button>
              </div>
            </form>
          )}

          {/* Historial de abonos */}
          <div>
            <p className="text-xs font-bold text-slate-700 mb-1.5">Historial de abonos ({abonos.length})</p>
            {abonos.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Aún no hay abonos registrados.</p>
            ) : (
              <table className="w-full text-xs border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="text-left px-2 py-1.5">Fecha</th>
                    <th className="text-right px-2 py-1.5">Monto</th>
                    <th className="text-left px-2 py-1.5">Comentario</th>
                    <th className="text-left px-2 py-1.5">Registró</th>
                  </tr>
                </thead>
                <tbody>
                  {abonos.map((a, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 whitespace-nowrap">{a.fecha}</td>
                      <td className="px-2 py-1.5 text-right font-bold whitespace-nowrap">{fmtQ(Number(a.monto) || 0)}</td>
                      <td className="px-2 py-1.5">{a.comentario || '—'}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{a.registradoPor || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-5 rounded-xl bg-slate-900 text-white font-semibold text-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
