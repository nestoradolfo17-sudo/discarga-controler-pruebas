import React, { useEffect, useMemo, useState } from 'react';
import { Route } from '../../types';
import { getRouteKey } from '../../utils/routeKey';
import { Button, IconButton } from '../ui/Button';
import { ModalFooter } from '../ui/ModalFooter';
import { ACTION_ICONS } from '../ui/actionIcons';
import { toNum, fmtNum } from '../../utils/number';

// --- Confirmar y repartir cajas entre los viajes de una ruta partida ---
// Para rutas de UN solo cliente que se partieron en varios viajes. Conforme se
// carga cada camión se CONFIRMAN las cajas reales que lleva ese viaje; las que
// faltan por entregar se reparten solas, en proporción, entre los viajes que
// aún no están confirmados. Así lo pendiente siempre refleja las cajas reales.
// Los viajes liquidados no se tocan (solo se muestran como ya entregados).

export interface CambioRepartoCajas {
  key: string;
  cajas: number;
  // true = cajas reales confirmadas para este viaje; false = repartido automático.
  confirmada: boolean;
}

interface RepartirCajasModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Viajes del grupo que se pueden ajustar (Pendiente / En Tránsito).
  trips: Route[];
  // Viajes del mismo grupo ya liquidados (solo informativo).
  liquidados?: Route[];
  onConfirm: (cambios: CambioRepartoCajas[], totalAntes: number, totalNuevo: number) => void;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const num = (v: string | undefined) => {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) ? n : NaN;
};

export const RepartirCajasModal: React.FC<RepartirCajasModalProps> = ({ isOpen, onClose, trips, liquidados = [] as Route[], onConfirm }) => {
  const ordered = useMemo(
    () => [...trips].sort((a, b) => (a.tripNumber || 0) - (b.tripNumber || 0)),
    [trips]
  );
  const keys = ordered.map((t) => getRouteKey(t));
  const totalAntes = r3(ordered.reduce((acc, t) => acc + (toNum(t.cajasFisicas) || 0), 0));

  const [totalTxt, setTotalTxt] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [fijas, setFijas] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isOpen) return;
    const v: Record<string, string> = {};
    const f: Record<string, boolean> = {};
    ordered.forEach((t) => {
      const k = getRouteKey(t);
      v[k] = String(r3(toNum(t.cajasFisicas) || 0));
      f[k] = !!t.cajasConfirmadas;
    });
    setValues(v);
    setFijas(f);
    setTotalTxt(String(totalAntes));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Reparte lo que falta (total − confirmadas) entre los viajes no confirmados,
  // en proporción a lo que llevaba cada uno (parejo si todos estaban en 0).
  const rebalancear = (vals: Record<string, string>, fij: Record<string, boolean>, total: number) => {
    const libres = keys.filter((k) => !fij[k]);
    if (libres.length === 0) return vals;
    const confirmadas = keys.filter((k) => fij[k]).reduce((a, k) => a + (num(vals[k]) || 0), 0);
    const resto = r3(total - confirmadas);
    const base = libres.map((k) => {
      const t = ordered[keys.indexOf(k)];
      return Math.max(0, toNum(t.cajasFisicas) || 0);
    });
    const sumaBase = base.reduce((a, b) => a + b, 0);
    const out = { ...vals };
    let acum = 0;
    libres.forEach((k, i) => {
      const ultimo = i === libres.length - 1;
      const parte = ultimo
        ? r3(resto - acum)
        : r3(sumaBase > 0 ? (resto * base[i]) / sumaBase : resto / libres.length);
      acum = r3(acum + parte);
      out[k] = String(parte);
    });
    return out;
  };

  if (!isOpen || ordered.length === 0) return null;

  const total = num(totalTxt);
  const nums = keys.map((k) => num(values[k]));
  const suma = r3(nums.reduce((acc, n) => acc + (Number.isFinite(n) ? n : 0), 0));
  const confirmadasSuma = r3(keys.reduce((a, k, i) => a + (fijas[k] ? nums[i] || 0 : 0), 0));
  const invalidos = ordered.filter((_, i) => !(nums[i] > 0)).map((t) => t.id);
  const totalInvalido = !(total > 0);
  const descuadre = !totalInvalido && Math.abs(suma - total) > 0.01;
  const sinCambios =
    !totalInvalido &&
    Math.abs(total - totalAntes) < 0.0005 &&
    ordered.every(
      (t, i) => Math.abs((toNum(t.cajasFisicas) || 0) - (nums[i] || 0)) < 0.0005 && !!t.cajasConfirmadas === !!fijas[keys[i]]
    );
  const bloqueado = totalInvalido || invalidos.length > 0 || descuadre || sinCambios;
  const cliente = ordered[0]?.clientesRuta?.[0];
  const entregadoLiq = r3(
    liquidados.reduce((a, t) => a + (parseFloat(String(t.liquidacion?.cajasEntregadas)) || 0), 0)
  );

  const cambiarViaje = (k: string, txt: string) => {
    // Escribir las cajas de un viaje lo deja CONFIRMADO; los demás se ajustan solos.
    const nuevasFijas = { ...fijas, [k]: true };
    const nuevos = rebalancear({ ...values, [k]: txt }, nuevasFijas, Number.isFinite(total) ? total : totalAntes);
    setFijas(nuevasFijas);
    setValues(nuevos);
  };
  const alternarFija = (k: string) => {
    const nuevasFijas = { ...fijas, [k]: !fijas[k] };
    setFijas(nuevasFijas);
    setValues(rebalancear(values, nuevasFijas, Number.isFinite(total) ? total : totalAntes));
  };
  const cambiarTotal = (txt: string) => {
    setTotalTxt(txt);
    const t = num(txt);
    if (t > 0) setValues(rebalancear(values, fijas, t));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (bloqueado) return;
    onConfirm(
      ordered.map((t, i) => ({ key: keys[i], cajas: r3(nums[i]), confirmada: !!fijas[keys[i]] })),
      totalAntes,
      r3(total)
    );
  };

  const mensaje = totalInvalido
    ? '⚠ Escribe el total de cajas por entregar'
    : invalidos.length > 0
    ? `⚠ Viaje ${invalidos.join(', ')} quedaría sin cajas`
    : descuadre
    ? `⚠ ${suma > total ? 'Sobran' : 'Faltan'} ${fmtNum(r3(Math.abs(total - suma)))} cajas`
    : '✓ Cuadra con el total por entregar';

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-bold text-sm">Confirmar y repartir cajas</h3>
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
            Escribe las <strong>cajas reales</strong> que lleva cada viaje al cargarlo: queda <strong>confirmado</strong> y
            las cajas que faltan se reparten solas, en proporción, entre los viajes sin confirmar. La asignación
            (camión y tripulación) no cambia.
          </p>

          {/* Resumen: total por entregar, confirmado y por repartir */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="p-3 rounded-xl border border-slate-200 bg-white">
              <label htmlFor="rc-total" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Total por entregar
              </label>
              <input
                id="rc-total"
                type="number"
                inputMode="decimal"
                step="0.001"
                min="0"
                value={totalTxt}
                onChange={(e) => cambiarTotal(e.target.value)}
                className={`mt-1 w-full min-h-[40px] p-1.5 border rounded-lg font-mono font-bold text-sm outline-none focus:ring-2 focus:ring-blue-300 ${
                  totalInvalido ? 'border-rose-400 text-rose-700' : 'border-slate-300 text-slate-800'
                }`}
              />
              <span className="block mt-0.5 text-[10px] text-slate-400">
                {Math.abs((Number.isFinite(total) ? total : 0) - totalAntes) < 0.0005
                  ? 'Cámbialo solo si cambió el pedido del cliente'
                  : `Antes: ${fmtNum(totalAntes)} cajas`}
              </span>
            </div>
            <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700">Confirmadas</span>
              <span className="block mt-1 text-lg font-black font-mono text-emerald-800">{fmtNum(confirmadasSuma)}</span>
              <span className="block text-[10px] text-emerald-700">
                {keys.filter((k) => fijas[k]).length} de {keys.length} viajes
              </span>
            </div>
            <div className="p-3 rounded-xl border border-blue-200 bg-blue-50">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-blue-700">Por repartir</span>
              <span className="block mt-1 text-lg font-black font-mono text-blue-800">
                {fmtNum(r3(Math.max(0, (Number.isFinite(total) ? total : 0) - confirmadasSuma)))}
              </span>
              <span className="block text-[10px] text-blue-700">entre los viajes sin confirmar</span>
            </div>
          </div>

          {liquidados.length > 0 && (
            <p className="text-[11px] text-slate-500">
              Ya liquidados: {liquidados.map((t) => t.id).join(', ')} · {fmtNum(entregadoLiq)} cajas entregadas (no se modifican).
            </p>
          )}

          <div className="space-y-2">
            {ordered.map((t, i) => {
              const key = keys[i];
              const antes = r3(toNum(t.cajasFisicas) || 0);
              const ahora = nums[i];
              const fija = !!fijas[key];
              return (
                <div
                  key={key}
                  className={`p-3 rounded-xl border grid grid-cols-[1fr_auto] gap-3 items-center ${
                    fija ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50 border-slate-200'
                  }`}
                >
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
                    <p className="text-[10px] text-slate-400">
                      Antes: {fmtNum(antes)} cajas
                      {t.cajasConfirmadas ? ` · confirmado ${t.cajasConfirmadas.fecha} por ${t.cajasConfirmadas.por}` : ''}
                    </p>
                  </div>
                  <div className="w-36 space-y-1">
                    <label htmlFor={`rc-${key}`} className="block text-[10px] text-slate-500 font-semibold">
                      Cajas reales
                    </label>
                    <input
                      id={`rc-${key}`}
                      type="number"
                      inputMode="decimal"
                      step="0.001"
                      min="0"
                      value={values[key] ?? ''}
                      onChange={(e) => cambiarViaje(key, e.target.value)}
                      className={`w-full min-h-[44px] p-1.5 border rounded-lg font-mono font-bold text-sm outline-none focus:ring-2 focus:ring-blue-300 ${
                        !(ahora > 0) ? 'border-rose-400 text-rose-700' : fija ? 'border-emerald-400 text-emerald-800' : 'border-slate-300 text-blue-700'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => alternarFija(key)}
                      aria-pressed={fija}
                      className={`w-full min-h-[32px] rounded-lg text-[10.5px] font-bold border cursor-pointer ${
                        fija ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                      }`}
                      title={fija ? 'Quitar confirmación: este viaje volverá a ajustarse solo' : 'Confirmar las cajas de este viaje'}
                    >
                      {fija ? '✓ Confirmado' : 'Confirmar'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div
            className={`flex justify-between items-center px-3 py-2 rounded-lg border text-[11px] font-bold ${
              totalInvalido || invalidos.length > 0 || descuadre
                ? 'bg-rose-50 border-rose-200 text-rose-700'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}
          >
            <span>
              Suma: {fmtNum(suma)} de {fmtNum(Number.isFinite(total) ? total : 0)} cajas
            </span>
            <span>{mensaje}</span>
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
              Guardar cajas
            </Button>
          </ModalFooter>
        </form>
      </div>
    </div>
  );
};
