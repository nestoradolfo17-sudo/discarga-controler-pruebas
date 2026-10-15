import React, { useEffect, useMemo, useState } from 'react';
import { Route } from '../../types';
import { getRouteKey } from '../../utils/routeKey';
import { Button, IconButton } from '../ui/Button';
import { ModalFooter } from '../ui/ModalFooter';
import { ACTION_ICONS } from '../ui/actionIcons';
import { toNum } from '../../utils/number';

// --- Repartir cajas entre los viajes de una ruta partida ---
// Para rutas de UN solo cliente que se partieron en varios viajes: aun ya
// asignadas (o en tránsito) se puede cambiar cuántas cajas lleva cada viaje,
// por si cambian las cajas reales a entregar. El total del grupo se mantiene
// (solo se reparte); los viajes liquidados no se tocan.

interface RepartirCajasModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Viajes del grupo que se pueden ajustar (Pendiente / En Tránsito).
  trips: Route[];
  onConfirm: (cambios: { key: string; cajas: number }[]) => void;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export const RepartirCajasModal: React.FC<RepartirCajasModalProps> = ({ isOpen, onClose, trips, onConfirm }) => {
  const [values, setValues] = useState<Record<string, string>>({});

  const ordered = useMemo(
    () => [...trips].sort((a, b) => (a.tripNumber || 0) - (b.tripNumber || 0)),
    [trips]
  );

  useEffect(() => {
    if (isOpen) {
      const v: Record<string, string> = {};
      ordered.forEach((t) => (v[getRouteKey(t)] = String(r3(toNum(t.cajasFisicas) || 0))));
      setValues(v);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen || ordered.length === 0) return null;

  const total = r3(ordered.reduce((acc, t) => acc + (toNum(t.cajasFisicas) || 0), 0));
  const nums = ordered.map((t) => {
    const n = parseFloat(values[getRouteKey(t)] ?? '');
    return Number.isFinite(n) ? n : NaN;
  });
  const suma = r3(nums.reduce((acc, n) => acc + (Number.isFinite(n) ? n : 0), 0));
  const invalidos = ordered.filter((_, i) => !(nums[i] > 0)).map((t) => t.id);
  const descuadre = Math.abs(suma - total) > 0.01;
  const sinCambios = ordered.every((t, i) => Math.abs((toNum(t.cajasFisicas) || 0) - (nums[i] || 0)) < 0.0005);
  const bloqueado = invalidos.length > 0 || descuadre || sinCambios;
  const cliente = ordered[0]?.clientesRuta?.[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (bloqueado) return;
    onConfirm(ordered.map((t, i) => ({ key: getRouteKey(t), cajas: r3(nums[i]) })));
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-bold text-sm">Repartir cajas entre viajes</h3>
            <p className="text-[11px] text-slate-400">
              Ruta {ordered[0].parentRouteId || String(ordered[0].id).split('.')[0]} · {ordered[0].agencia}
              {cliente ? ` · Cliente ${cliente.codigo} ${cliente.nombre || ''}` : ''}
            </p>
          </div>
          <IconButton
            icon={ACTION_ICONS.cerrar}
            label="Cerrar sin guardar"
            onClick={onClose}
            className="text-slate-300 hover:text-white hover:bg-slate-800"
          />
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
          <p className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-[11px] text-indigo-900 leading-relaxed">
            Cambia cuántas cajas lleva cada viaje si cambiaron las cajas reales a entregar. El total del grupo se
            mantiene en <strong>{total} cajas</strong>. La asignación (camión y tripulación) no cambia.
          </p>

          <div className="space-y-2">
            {ordered.map((t, i) => {
              const key = getRouteKey(t);
              const antes = r3(toNum(t.cajasFisicas) || 0);
              const ahora = nums[i];
              return (
                <div key={key} className="bg-slate-50 p-3 rounded-xl border border-slate-200 grid grid-cols-[1fr_auto] gap-3 items-center">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 text-sm">
                      Ruta {t.id}
                      <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                        {t.estado}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {t.asignacion?.camionPlaca ? `Camión ${t.asignacion.camionPlaca}` : 'Sin camión'}
                      {t.asignacion?.conductor ? ` · ${t.asignacion.conductor}` : ''}
                    </p>
                    <p className="text-[10px] text-slate-400">Antes: {antes} cajas</p>
                  </div>
                  <div className="w-32">
                    <label htmlFor={`rc-${key}`} className="block text-[10px] text-slate-500 font-semibold mb-0.5">
                      Cajas
                    </label>
                    <input
                      id={`rc-${key}`}
                      type="number"
                      inputMode="decimal"
                      step="0.001"
                      min="0"
                      value={values[key] ?? ''}
                      onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                      className={`w-full min-h-[44px] p-1.5 border rounded-lg font-mono font-bold text-sm outline-none focus:ring-2 focus:ring-blue-300 ${
                        !(ahora > 0) ? 'border-rose-400 text-rose-700' : 'border-slate-300 text-blue-700'
                      }`}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div
            className={`flex justify-between items-center px-3 py-2 rounded-lg border text-[11px] font-bold ${
              invalidos.length > 0 || descuadre ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}
          >
            <span>
              Suma: {suma} de {total} cajas
            </span>
            <span>
              {invalidos.length > 0
                ? `⚠ Ruta ${invalidos.join(', ')} sin cajas`
                : descuadre
                ? `⚠ ${suma > total ? 'Sobran' : 'Faltan'} ${r3(Math.abs(total - suma))} cajas`
                : '✓ Cuadra con el total'}
            </span>
          </div>

          <ModalFooter
            bleed="p-6"
            secondary={
              <Button variant="secondary" size="lg" onClick={onClose}>
                Cancelar
              </Button>
            }
          >
            <Button
              type="submit"
              variant="primary"
              size="lg"
              icon={ACTION_ICONS.partir}
              disabled={bloqueado}
              title={sinCambios ? 'No hay cambios' : bloqueado ? 'La suma debe cuadrar con el total y ningún viaje puede quedar en 0' : undefined}
            >
              Guardar reparto
            </Button>
          </ModalFooter>
        </form>
      </div>
    </div>
  );
};
