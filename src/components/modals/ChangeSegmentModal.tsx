import React, { useEffect, useState } from 'react';
import { Route } from '../../types';
import { SEGMENTO_OPTIONS } from '../../data/segmentos';

// --- Cambiar el segmento de una ruta del Tablero ---
// Solo se aplica con usuario y contraseña de un ADMINISTRADOR (si quien opera
// no es administrador, un administrador escribe sus datos para autorizar).
// Solo cambia el campo "segmento" de la ruta (y, si se elige, de los demás
// viajes de la misma ruta partida); no toca ningún otro dato.

interface ChangeSegmentModalProps {
  route: Route | null;
  // Cantidad de viajes de la misma ruta partida (incluida esta). 1 = no partida.
  splitCount: number;
  defaultAdminUser?: string;
  onVerifyAdmin: (username: string, password: string) => Promise<{ ok: boolean; nombre?: string; error?: string }>;
  onConfirm: (segmento: string, applyToSplitGroup: boolean, autorizadoPor: string) => void;
  onClose: () => void;
}

export const ChangeSegmentModal: React.FC<ChangeSegmentModalProps> = ({
  route,
  splitCount,
  defaultAdminUser,
  onVerifyAdmin,
  onConfirm,
  onClose,
}) => {
  const [segmento, setSegmento] = useState('');
  const [applyAll, setApplyAll] = useState(true);
  const [adminUser, setAdminUser] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!route) return;
    setSegmento('');
    setApplyAll(true);
    setAdminUser(defaultAdminUser || '');
    setPassword('');
    setError('');
    setBusy(false);
  }, [route, defaultAdminUser]);

  if (!route) return null;

  const actual = (route.segmento || '').trim();
  const opciones = Array.from(new Set([...SEGMENTO_OPTIONS, ...(actual ? [actual.toUpperCase()] : [])]));
  const puedeConfirmar = !!segmento && segmento !== actual.toUpperCase() && !!adminUser.trim() && !!password && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeConfirmar) return;
    setBusy(true);
    setError('');
    const res = await onVerifyAdmin(adminUser.trim(), password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error || 'No se pudo verificar la contraseña de administrador.');
      setPassword('');
      return;
    }
    onConfirm(segmento, splitCount > 1 && applyAll, res.nombre || adminUser.trim());
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <form
        id="formCambiarSegmento"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="bg-slate-900 text-white px-5 py-4">
          <h2 className="text-base font-bold">Cambiar segmento · Ruta {route.id}</h2>
          <p className="text-xs text-slate-300 mt-0.5">
            {route.agencia} · Segmento actual: <strong className="text-white">{actual || 'Sin segmento'}</strong>
          </p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs font-bold text-slate-600 uppercase mb-2">Nuevo segmento</p>
            <div className="grid grid-cols-2 gap-2">
              {opciones.map((op) => {
                const esActual = op === actual.toUpperCase();
                return (
                  <button
                    key={op}
                    type="button"
                    disabled={esActual}
                    onClick={() => setSegmento(op)}
                    aria-pressed={segmento === op}
                    className={`min-h-[44px] px-3 rounded-xl text-sm font-semibold border transition ${
                      segmento === op
                        ? 'bg-blue-600 text-white border-blue-600'
                        : esActual
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 cursor-pointer'
                    }`}
                  >
                    {op}
                    {esActual ? ' (actual)' : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {splitCount > 1 && (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={applyAll}
                onChange={(e) => setApplyAll(e.target.checked)}
                className="mt-0.5 w-5 h-5"
              />
              <span>Aplicar también a los otros viajes de esta ruta partida ({splitCount} viajes en total)</span>
            </label>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
            <p className="text-xs font-bold text-amber-900">Autorización de administrador</p>
            <input
              id="segAdminUser"
              type="text"
              autoComplete="username"
              value={adminUser}
              onChange={(e) => setAdminUser(e.target.value)}
              placeholder="Usuario administrador"
              className="w-full min-h-[44px] border border-slate-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              id="segAdminPass"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña del administrador"
              className="w-full min-h-[44px] border border-slate-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
          </div>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] rounded-xl border border-slate-300 bg-white text-slate-700 font-semibold text-sm hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            id="btnConfirmarSegmento"
            type="submit"
            disabled={!puedeConfirmar}
            className="flex-1 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm"
          >
            {busy ? 'Verificando…' : 'Cambiar segmento'}
          </button>
        </div>
      </form>
    </div>
  );
};
