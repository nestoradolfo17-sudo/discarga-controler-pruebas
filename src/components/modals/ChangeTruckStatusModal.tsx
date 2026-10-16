import React, { useEffect, useState } from 'react';
import { Truck, ResourceStatus } from '../../types';

// --- Cambiar manualmente el estatus de un camión ---
// Para corregir a mano el estatus (Disponible / En Ruta / Baja) cuando no
// coincide con la realidad. Solo se aplica con usuario y contraseña de un
// ADMINISTRADOR (si quien opera no es administrador, un administrador escribe
// sus datos para autorizar) y con un motivo; queda en el historial del camión.

const ESTADOS: { k: ResourceStatus; label: string; cls: string }[] = [
  { k: 'Disponible', label: 'Disponible', cls: 'border-emerald-500 bg-emerald-50 text-emerald-800' },
  { k: 'En Ruta', label: 'En Ruta', cls: 'border-blue-500 bg-blue-50 text-blue-800' },
  { k: 'Baja', label: 'Baja', cls: 'border-rose-500 bg-rose-50 text-rose-800' },
];

interface Props {
  truck: Truck | null;
  defaultAdminUser?: string;
  onVerifyAdmin: (username: string, password: string) => Promise<{ ok: boolean; nombre?: string; error?: string }>;
  onConfirm: (truckId: string, nuevo: ResourceStatus, motivo: string, autorizadoPor: string) => void;
  onClose: () => void;
}

export const ChangeTruckStatusModal: React.FC<Props> = ({ truck, defaultAdminUser, onVerifyAdmin, onConfirm, onClose }) => {
  const [nuevo, setNuevo] = useState<ResourceStatus | ''>('');
  const [motivo, setMotivo] = useState('');
  const [adminUser, setAdminUser] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!truck) return;
    setNuevo('');
    setMotivo('');
    setAdminUser(defaultAdminUser || '');
    setPassword('');
    setError('');
    setBusy(false);
  }, [truck, defaultAdminUser]);

  if (!truck) return null;

  const enRuta = !!truck.rutaActual;
  const puedeConfirmar =
    !!nuevo && nuevo !== truck.estado && motivo.trim().length >= 5 && !!adminUser.trim() && !!password && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puedeConfirmar || !nuevo) return;
    setBusy(true);
    setError('');
    const res = await onVerifyAdmin(adminUser.trim(), password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error || 'No se pudo verificar la contraseña de administrador.');
      setPassword('');
      return;
    }
    onConfirm(truck.id, nuevo, motivo.trim(), res.nombre || adminUser.trim());
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <form
        id="formCambiarEstatusCamion"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="bg-slate-900 text-white px-5 py-4">
          <h2 className="text-base font-bold">
            Cambiar estatus · Camión {truck.idCamion ? `${truck.idCamion} · ` : ''}
            {truck.placa}
          </h2>
          <p className="text-xs text-slate-300 mt-0.5">
            {truck.agencia || 'Sin agencia'} · Estatus actual: <strong className="text-white">{truck.estado}</strong>
            {truck.rutaActual ? ` · Ruta ${truck.rutaActual}` : ''}
          </p>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <span id="lblNuevoEstatus" className="block text-xs font-bold text-slate-600 uppercase mb-2">
              Nuevo estatus
            </span>
            <div role="radiogroup" aria-labelledby="lblNuevoEstatus" className="grid grid-cols-3 gap-2">
              {ESTADOS.map((e) => {
                const actual = e.k === truck.estado;
                const sel = nuevo === e.k;
                return (
                  <button
                    key={e.k}
                    type="button"
                    role="radio"
                    aria-checked={sel}
                    disabled={actual}
                    onClick={() => setNuevo(e.k)}
                    className={`min-h-[48px] rounded-xl border-2 text-sm font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                      sel ? e.cls : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {e.label}
                    {actual && <span className="block text-[10px] font-semibold">(actual)</span>}
                  </button>
                );
              })}
            </div>
            {nuevo && nuevo !== 'Baja' && (
              <p className="mt-2 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
                "Disponible" y "En Ruta" normalmente se calculan solos con las rutas asignadas. Si lo cambias a mano, se
                respeta <b>por hoy</b>; mañana vuelve a calcularse solo.
              </p>
            )}
            {enRuta && nuevo && nuevo !== 'En Ruta' && (
              <p className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                Este camión aparece asignado a la ruta <b>{truck.rutaActual}</b>. Quedará como <b>{nuevo}</b> y libre para
                otra asignación; revisa que esa ruta ya no lo esté usando.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="txtMotivoEstatus" className="block text-xs font-bold text-slate-600 uppercase mb-1">
              Motivo del cambio *
            </label>
            <textarea
              id="txtMotivoEstatus"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Ej.: regresó de taller, quedó trabado en En Ruta, unidad vendida…"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[11px] text-slate-400">Queda registrado en el historial del camión.</p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
            <p className="text-xs font-bold text-amber-900">Autorización de administrador (general o de la agencia)</p>
            <input
              id="estAdminUser"
              type="text"
              autoComplete="username"
              value={adminUser}
              onChange={(e) => setAdminUser(e.target.value)}
              placeholder="Usuario administrador"
              className="w-full min-h-[44px] border border-slate-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              id="estAdminPass"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña del administrador"
              className="w-full min-h-[44px] border border-slate-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
          </div>

          {truck.historialEstado && truck.historialEstado.length > 0 && (
            <details className="text-[11px] text-slate-600">
              <summary className="cursor-pointer font-semibold">Cambios anteriores ({truck.historialEstado.length})</summary>
              <ul className="mt-1 space-y-0.5 max-h-28 overflow-y-auto">
                {[...truck.historialEstado].reverse().map((h, i) => (
                  <li key={i}>
                    {h.fecha}: {h.de} → <b>{h.a}</b> · {h.motivo} · por {h.por}
                    {h.autorizadoPor && h.autorizadoPor !== h.por ? ` (autorizó ${h.autorizadoPor})` : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}
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
            id="btnConfirmarEstatus"
            type="submit"
            disabled={!puedeConfirmar}
            title={!puedeConfirmar ? 'Elige el nuevo estatus, escribe el motivo y la autorización de administrador' : undefined}
            className="flex-1 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm"
          >
            {busy ? 'Verificando…' : 'Cambiar estatus'}
          </button>
        </div>
      </form>
    </div>
  );
};
