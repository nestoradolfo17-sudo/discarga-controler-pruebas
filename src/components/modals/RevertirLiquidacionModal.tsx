import React, { useEffect, useState } from 'react';
import { Route, CajaAbiertaReason, ClientePendiente } from '../../types';
import { CAJA_ABIERTA_OPTIONS } from '../../data/motivosCajaAbierta';
import { Lock, CheckCircle, RotateCcw, Search, Users } from 'lucide-react';
import { Button, IconButton } from '../ui/Button';
import { ACTION_ICONS } from '../ui/actionIcons';
import { fmtNum } from '../../utils/number';

// --- Revertir estatus de una ruta liquidada (Liquidada ↔ Caja Abierta) ---
// Se abre desde el Tablero de Rutas Liquidadas. Repite el mismo paso de la
// liquidación inicial para el estatus destino:
//   • → Caja Abierta: motivo y valor en dinero (Q). Con clientes marcados, cada
//     uno lleva su motivo y su Q; sin clientes, un motivo y el Q total. El Q es
//     obligatorio salvo con "Pendiente Envase / Cajilla".
//   • → Liquidada: confirma el cierre (la caja queda validada).
// Siempre pide el motivo de la rectificación; App.tsx guarda el registro
// (liquidacion.rectificaciones) y no cambia cajas, paradas ni motivos de devolución.

export type DestinoRevertir = 'Liquidada' | 'Caja Abierta';
export interface DatosRevertir {
  a: DestinoRevertir;
  motivoCajaAbierta?: CajaAbiertaReason;
  montoDiferenciaCaja?: number;
  clientesPendientes?: ClientePendiente[];
  comentario: string;
}

const MOTIVO_SIN_Q = 'Pendiente Envase / Cajilla';
const parseQ = (v: string | undefined) => {
  const t = String(v ?? '').trim().replace(',', '.');
  if (!t) return undefined;
  const n = Number(t);
  return isFinite(n) ? n : NaN;
};
const fq = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Estatus actual de una liquidación para el botón Revertir. */
export const estatusLiquidacion = (r: Route): DestinoRevertir =>
  r.liquidacion?.cajaAbierta && !r.liquidacion?.cajaAbiertaResuelta ? 'Caja Abierta' : 'Liquidada';

interface Props {
  route: Route;
  onClose: () => void;
  onConfirm: (route: Route, datos: DatosRevertir) => void;
}

export const RevertirLiquidacionModal: React.FC<Props> = ({ route, onClose, onConfirm }) => {
  const actual = estatusLiquidacion(route);
  const destino: DestinoRevertir = actual === 'Caja Abierta' ? 'Liquidada' : 'Caja Abierta';
  const aCaja = destino === 'Caja Abierta';
  const liq = route.liquidacion;
  const clientes = route.clientesRuta || [];

  const [motivo, setMotivo] = useState<CajaAbiertaReason | null>(null);
  const [montoTotal, setMontoTotal] = useState('');
  const [marcados, setMarcados] = useState<Map<string, string>>(new Map());
  const [montos, setMontos] = useState<Map<string, string>>(new Map());
  const [filtro, setFiltro] = useState('');
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState('');
  const [confirmar, setConfirmar] = useState(false);

  useEffect(() => {
    setMotivo(null);
    setMontoTotal('');
    setMarcados(new Map());
    setMontos(new Map());
    setComentario('');
    setError('');
    setConfirmar(false);
  }, [route]);

  const conClientes = aCaja && marcados.size > 0;
  const qInvalido = (codigo: string) => {
    const m = marcados.get(codigo) || '';
    const q = parseQ(montos.get(codigo));
    if (q !== undefined && (isNaN(q) || q < 0)) return true;
    return m !== MOTIVO_SIN_Q && !(q !== undefined && q > 0);
  };
  const totalClientes = (Array.from(marcados.keys()) as string[]).reduce((a: number, k: string) => {
    const q = parseQ(montos.get(k));
    return a + (q && q > 0 ? q : 0);
  }, 0);

  const validar = (): string => {
    if (comentario.trim().length < 5) return 'Escribe el motivo de la rectificación (al menos 5 caracteres).';
    if (!aCaja) return '';
    if (conClientes) {
      const codigos = Array.from(marcados.keys()) as string[];
      if (codigos.some((k) => !marcados.get(k))) return 'Elige el motivo de cada cliente marcado.';
      if (codigos.some(qInvalido)) return `Escribe el valor (Q) de cada cliente marcado. Solo "${MOTIVO_SIN_Q}" puede ir sin valor.`;
      return '';
    }
    if (!motivo) return 'Elige el motivo de la caja abierta.';
    const q = parseQ(montoTotal);
    if (q !== undefined && (isNaN(q) || q < 0)) return 'El valor en dinero (Q) no es válido.';
    if (motivo !== MOTIVO_SIN_Q && !(q !== undefined && q > 0)) return `Escribe el valor total en dinero (Q). Solo "${MOTIVO_SIN_Q}" permite dejarlo sin valor.`;
    return '';
  };

  const enviar = () => {
    const e = validar();
    if (e) {
      setError(e);
      setConfirmar(false);
      return;
    }
    let datos: DatosRevertir = { a: destino, comentario: comentario.trim() };
    if (aCaja && conClientes) {
      const filas = (Array.from(marcados.entries()) as [string, string][]).map(([codigo, m]) => {
        const c = clientes.find((x) => x.codigo === codigo);
        const q = parseQ(montos.get(codigo));
        return {
          codigo,
          nombre: c?.nombre || '',
          motivo: m,
          cajas: c?.cajas,
          ...(q !== undefined && !isNaN(q) && q > 0 ? { monto: Math.round(q * 100) / 100 } : {}),
        } as ClientePendiente;
      });
      const mayor = [...filas].sort((a, b) => (b.monto || 0) - (a.monto || 0))[0];
      datos = {
        ...datos,
        motivoCajaAbierta: mayor?.motivo as CajaAbiertaReason,
        montoDiferenciaCaja: totalClientes > 0 ? Math.round(totalClientes * 100) / 100 : undefined,
        clientesPendientes: filas,
      };
    } else if (aCaja) {
      const q = parseQ(montoTotal);
      datos = {
        ...datos,
        motivoCajaAbierta: motivo || undefined,
        montoDiferenciaCaja: q !== undefined && !isNaN(q) && q > 0 ? Math.round(q * 100) / 100 : undefined,
      };
    }
    onConfirm(route, datos);
  };

  const f = filtro.toLowerCase().trim();
  const visibles = clientes.filter((c) => !f || c.codigo.toLowerCase().includes(f) || (c.nombre || '').toLowerCase().includes(f));

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="titRevertir" className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col text-xs">
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
              <RotateCcw className="w-5 h-5 text-indigo-700" />
            </div>
            <div>
              <h3 id="titRevertir" className="font-bold text-slate-800 text-sm">
                Revertir ruta {route.id}: {actual} → {destino}
              </h3>
              <p className="text-[11px] text-slate-500">
                Agencia {route.agencia} · {route.fecha} · Liquidada el {liq?.fechaLiquidacion || '—'}
              </p>
            </div>
          </div>
          <IconButton icon={ACTION_ICONS.cerrar} label="Cerrar" onClick={onClose} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100" />
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 leading-relaxed">
            Estatus actual: <strong>{actual}</strong>
            {actual === 'Caja Abierta' && liq?.motivoCajaAbierta && (
              <>
                {' '}· Motivo: <strong>{liq.motivoCajaAbierta}</strong>
                {typeof liq.montoDiferenciaCaja === 'number' && <> · Q {fq(liq.montoDiferenciaCaja)}</>}
              </>
            )}
            <span className="block text-[11px] text-slate-500 mt-0.5">
              No cambian cajas, paradas ni motivos de devolución. Queda registrado quién y cuándo rectificó la ruta.
            </span>
          </div>

          {aCaja ? (
            <>
              {clientes.length > 0 && (
                <div className="border border-slate-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-blue-600" />
                      Clientes con caja pendiente ({marcados.size} de {clientes.length})
                    </span>
                    <div className="relative w-full sm:w-52">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                      <input
                        value={filtro}
                        onChange={(e) => setFiltro(e.target.value)}
                        placeholder="Buscar código o nombre..."
                        aria-label="Buscar cliente"
                        className="w-full min-h-[40px] pl-7 pr-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Cada cliente marcado lleva su motivo y su valor (Q). Si no marcas ninguno, elige abajo el motivo y el valor total.
                  </p>
                  <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {visibles.map((c) => {
                      const on = marcados.has(c.codigo);
                      return (
                        <div key={c.codigo} className={`flex items-center justify-between gap-2 min-h-[48px] px-2 py-1 ${on ? 'bg-amber-50/60' : ''}`}>
                          <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => {
                                setMarcados((p) => {
                                  const n = new Map(p);
                                  if (n.has(c.codigo)) n.delete(c.codigo);
                                  else n.set(c.codigo, '');
                                  return n;
                                });
                                setError('');
                              }}
                              className="w-5 h-5 cursor-pointer shrink-0"
                            />
                            <span className="truncate">
                              <span className="font-mono text-slate-500">{c.codigo}</span> <span className="font-medium text-slate-800">{c.nombre || '-'}</span>{' '}
                              <span className="text-slate-400">({fmtNum(Number(c.cajas || 0), 3)} cajas)</span>
                            </span>
                          </label>
                          {on && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <select
                                value={marcados.get(c.codigo) || ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setMarcados((p) => new Map(p).set(c.codigo, v));
                                  setError('');
                                }}
                                aria-label={`Motivo del cliente ${c.codigo}`}
                                className="min-h-[40px] border border-amber-300 bg-white rounded-lg px-2 font-semibold text-amber-900 cursor-pointer"
                              >
                                <option value="">-- Motivo --</option>
                                {CAJA_ABIERTA_OPTIONS.map((o) => (
                                  <option key={o.reason} value={o.reason}>
                                    {o.icon} {o.reason}
                                  </option>
                                ))}
                              </select>
                              <span className="font-bold text-amber-800">Q</span>
                              <input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                value={montos.get(c.codigo) || ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setMontos((p) => new Map(p).set(c.codigo, v));
                                  setError('');
                                }}
                                placeholder={marcados.get(c.codigo) === MOTIVO_SIN_Q ? 'opcional' : '0.00'}
                                aria-label={`Valor en quetzales del cliente ${c.codigo}`}
                                className={`w-24 min-h-[40px] px-2 font-mono font-bold border rounded-lg outline-none ${
                                  marcados.get(c.codigo) && qInvalido(c.codigo) ? 'border-rose-400 bg-rose-50' : 'border-amber-300'
                                }`}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {conClientes && <p className="text-right font-bold font-mono text-amber-900">Total Q {fq(totalClientes)}</p>}
                </div>
              )}

              {!conClientes && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                  <span className="block font-bold text-amber-900 text-[11px]">Motivo por el que la caja queda pendiente de validar *</span>
                  <div className="flex flex-wrap gap-1.5">
                    {CAJA_ABIERTA_OPTIONS.map((o) => (
                      <button
                        key={o.reason}
                        type="button"
                        onClick={() => {
                          setMotivo(o.reason);
                          setError('');
                        }}
                        className={`min-h-[44px] px-3 font-bold border rounded-lg cursor-pointer ${
                          motivo === o.reason ? 'bg-amber-600 text-white border-amber-700 ring-2 ring-amber-200' : 'bg-white hover:bg-amber-100 border-amber-300 text-amber-800'
                        }`}
                      >
                        {o.icon} {o.reason}
                      </button>
                    ))}
                  </div>
                  <label className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="font-bold text-amber-900 text-[11px]">
                      Valor total en dinero (Q){motivo === MOTIVO_SIN_Q ? ' (opcional)' : ' *'}
                    </span>
                    <span className="font-bold text-amber-800">Q</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={montoTotal}
                      onChange={(e) => {
                        setMontoTotal(e.target.value);
                        setError('');
                      }}
                      placeholder="0.00"
                      className="w-40 min-h-[44px] px-3 border border-amber-300 rounded-lg font-mono font-bold bg-white outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </label>
                </div>
              )}
            </>
          ) : (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-900 flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                La ruta quedará como <strong>Liquidada</strong>: la caja se da por validada y deja de aparecer como Caja Abierta. El motivo y el valor que tenía quedan guardados en el registro de la rectificación.
              </span>
            </div>
          )}

          <label className="block">
            <span className="block font-semibold text-slate-700 mb-1">Motivo de la rectificación *</span>
            <textarea
              value={comentario}
              onChange={(e) => {
                setComentario(e.target.value);
                setError('');
              }}
              rows={2}
              maxLength={300}
              placeholder="Ej.: Se validó la boleta con el cliente / La caja no cuadró en la revisión."
              className="w-full min-h-[44px] p-2 border border-slate-300 rounded-lg outline-none resize-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          {error && <p className="text-rose-700 font-semibold">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="lg" onClick={onClose}>
            Cancelar
          </Button>
          <div className="ml-auto flex items-center gap-2">
            {confirmar ? (
              <>
                <span className="font-semibold text-slate-700">¿Seguro? Pasa a {destino}.</span>
                <Button variant="secondary" size="lg" onClick={() => setConfirmar(false)}>
                  No
                </Button>
                <Button variant={aCaja ? 'warning' : 'success'} size="lg" icon={aCaja ? Lock : CheckCircle} onClick={enviar}>
                  Sí, revertir
                </Button>
              </>
            ) : (
              <Button
                variant={aCaja ? 'warning' : 'success'}
                size="lg"
                icon={RotateCcw}
                onClick={() => {
                  const e = validar();
                  if (e) setError(e);
                  else setConfirmar(true);
                }}
              >
                Revertir a {destino}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
