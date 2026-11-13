import React, { useEffect, useMemo, useState } from 'react';
import { Route } from '../../types';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button, IconButton } from '../ui/Button';
import { ACTION_ICONS } from '../ui/actionIcons';
import { toNum, fmtNum } from '../../utils/number';
import { getRouteKey } from '../../utils/routeKey';

// --- Liquidación en lote (rutas entregadas al 100%, sin rechazos) ---
// Liquida varias rutas a la vez con todas sus paradas exitosas y todas sus
// cajas entregadas. Las rutas con rechazos, devoluciones, Ruta Abierta o Caja
// Abierta se deben liquidar una por una con el formulario normal.

// Devuelve por qué una ruta NO se puede liquidar en lote (o null si sí se puede).
export const motivoNoLiquidableEnLote = (r: Route): string | null => {
  const bolson = !!(r.esBolson || r.tipoAsignacion === 'Ruta Bolsón');
  const selfService = !!(r.esSelfService || r.tipoAsignacion === 'Self Service');
  if (r.estado === 'Liquidada') return 'Ya está liquidada';
  if (r.estado === 'Abierta') return 'Ruta abierta: liquídala de forma individual';
  if (bolson) return 'Ruta Bolsón: se liquida como rechazo, hazlo de forma individual';
  if (r.liquidacion) return 'Ya está liquidada';
  if (r.estado === 'En Tránsito') return null;
  if (r.estado === 'Pendiente' && selfService) return null;
  return 'Aún no sale a ruta (sin camión asignado)';
};

// Paradas y cajas que se registran como entregadas (igual que el formulario
// individual cuando no hay rechazos: todas las paradas, todas las cajas).
export const paradasDeRuta = (r: Route) => parseInt(String(r.paradas)) || 1;
export const cajasDeRuta = (r: Route) => toNum(r.cajasFisicas) || 0;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  routes: Route[]; // rutas seleccionadas en el Tablero
  defaultAuditor?: string;
  onConfirm: (keys: string[], datos: { auditor: string; comentario?: string }) => void;
}

export const BulkLiquidateModal: React.FC<Props> = ({ isOpen, onClose, routes, defaultAuditor, onConfirm }) => {
  const [auditor, setAuditor] = useState('');
  const [comentario, setComentario] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [quitadas, setQuitadas] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      setAuditor(defaultAuditor?.trim() || 'Operador de Agencia');
      setComentario('');
      setConfirmado(false);
      setQuitadas(new Set());
    }
  }, [isOpen, defaultAuditor]);

  const { aptas, excluidas } = useMemo(() => {
    const aptas: Route[] = [];
    const excluidas: { r: Route; motivo: string }[] = [];
    routes.forEach((r) => {
      const m = motivoNoLiquidableEnLote(r);
      if (m) excluidas.push({ r, motivo: m });
      else aptas.push(r);
    });
    return { aptas, excluidas };
  }, [routes]);
  const aLiquidar = aptas.filter((r) => !quitadas.has(getRouteKey(r)));
  const totCajas = aLiquidar.reduce((a, r) => a + cajasDeRuta(r), 0);
  const totParadas = aLiquidar.reduce((a, r) => a + paradasDeRuta(r), 0);

  if (!isOpen) return null;

  const alternar = (k: string) =>
    setQuitadas((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const puede = confirmado && aLiquidar.length > 0 && auditor.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-lote" className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl p-4 sm:p-6 text-xs max-h-[90vh] flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 id="titulo-lote" className="font-bold text-base text-slate-800 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Liquidar rutas al 100%
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Liquidación en lote: todas las paradas exitosas y todas las cajas entregadas.</p>
          </div>
          <IconButton icon={ACTION_ICONS.cerrar} label="Cerrar" onClick={onClose} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100" />
        </div>

        <div className="overflow-y-auto flex-1 space-y-4 pr-1">
          {/* Advertencia */}
          <div role="alert" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 sm:p-4 text-amber-900">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
            <div className="space-y-1.5 text-[12.5px] leading-relaxed">
              <p className="font-bold">Advertencia: usa esta opción solo si las rutas se entregaron al 100%.</p>
              <p>
                Cada ruta se liquidará con <strong>0 cajas devueltas, 0 paradas rechazadas y sin motivo de devolución</strong>. Si alguna tuvo
                rechazos, devoluciones, quedó como Ruta Abierta o tiene Caja Abierta, <strong>quítala de la lista</strong> y liquídala de forma
                individual.
              </p>
              <p>Al liquidar, los camiones y la tripulación quedan libres y las rutas pasan a Rutas Liquidadas.</p>
            </div>
          </div>

          {/* Resumen */}
          <div className="grid grid-cols-3 gap-2">
            {[
              ['Rutas a liquidar', fmtNum(aLiquidar.length)],
              ['Paradas entregadas', fmtNum(totParadas)],
              ['Cajas entregadas', totCajas.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-slate-200 p-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{l}</div>
                <div className="text-lg font-black text-slate-900 tabular-nums">{v}</div>
              </div>
            ))}
          </div>

          {/* Rutas aptas */}
          <div className="border border-slate-200 rounded-xl overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-[10px]">
                <tr>
                  <th className="py-2 px-3 w-10">Incluir</th>
                  <th className="py-2 px-3">Ruta</th>
                  <th className="py-2 px-3">Agencia</th>
                  <th className="py-2 px-3">Camión · piloto</th>
                  <th className="py-2 px-3 text-right">Paradas</th>
                  <th className="py-2 px-3 text-right">Cajas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {aptas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 px-3 text-center text-slate-400 italic">
                      Ninguna de las rutas seleccionadas se puede liquidar en lote.
                    </td>
                  </tr>
                )}
                {aptas.map((r) => {
                  const k = getRouteKey(r);
                  const incluida = !quitadas.has(k);
                  return (
                    <tr key={k} className={incluida ? '' : 'opacity-45'}>
                      <td className="py-2 px-3">
                        <input type="checkbox" checked={incluida} onChange={() => alternar(k)} aria-label={`Incluir ruta ${r.id}`} className="w-4 h-4 accent-emerald-600 cursor-pointer" />
                      </td>
                      <td className="py-2 px-3 font-mono font-bold text-slate-800 whitespace-nowrap">{r.id}</td>
                      <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{r.agencia || '—'}</td>
                      <td className="py-2 px-3 text-slate-600">
                        {r.asignacion ? `${r.asignacion.camionPlaca || '—'} · ${r.asignacion.conductor || '—'}` : 'Self Service'}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{fmtNum(paradasDeRuta(r))}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-semibold">{cajasDeRuta(r).toFixed(3)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {excluidas.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] font-bold text-slate-600 mb-1.5">
                {excluidas.length === 1 ? '1 ruta seleccionada no se incluye' : `${excluidas.length} rutas seleccionadas no se incluyen`}
              </div>
              <ul className="space-y-1">
                {excluidas.map(({ r, motivo }) => (
                  <li key={getRouteKey(r)} className="text-[11.5px] text-slate-600">
                    <span className="font-mono font-bold text-slate-800">{r.id}</span> · {r.agencia} — {motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-slate-600">Auditor / liquidador</span>
              <input
                type="text"
                value={auditor}
                onChange={(e) => setAuditor(e.target.value)}
                className="min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-slate-600">
                Comentario <span className="font-normal text-slate-400">(opcional, se guarda en todas)</span>
              </span>
              <input
                type="text"
                value={comentario}
                maxLength={300}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Opcional"
                className="min-h-[40px] px-3 rounded-lg border border-slate-300 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </label>
          </div>

          <label className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 cursor-pointer">
            <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} className="w-5 h-5 mt-0.5 accent-emerald-600 cursor-pointer shrink-0" />
            <span className="text-[12.5px] text-slate-800 leading-snug">
              Confirmo que las <strong>{fmtNum(aLiquidar.length)}</strong> rutas se entregaron <strong>al 100%</strong>, sin rechazos ni devoluciones.
            </span>
          </label>
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-100">
          <Button variant="ghost" size="lg" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="success"
            size="lg"
            icon={ACTION_ICONS.liquidar}
            disabled={!puede}
            onClick={() => onConfirm(aLiquidar.map(getRouteKey), { auditor: auditor.trim(), comentario: comentario.trim() || undefined })}
          >
            Liquidar {fmtNum(aLiquidar.length)} {aLiquidar.length === 1 ? 'ruta' : 'rutas'}
          </Button>
        </div>
      </div>
    </div>
  );
};
