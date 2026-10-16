import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, Check, LogOut } from 'lucide-react';
import { Button } from '../ui/Button';
import { MIN_PASSWORD_LENGTH } from '../../services/auth';

// Se muestra cuando el usuario entra con el enlace "Crear mi contraseña" que le
// llegó al correo (usuario nuevo o contraseña restablecida). La sesión ya está
// abierta; aquí define la contraseña con la que entrará de ahora en adelante.
interface Props {
  username: string;
  nombre?: string;
  onSave: (password: string) => Promise<string | null>;
  onLogout: () => void;
}

export const SetPasswordModal: React.FC<Props> = ({ username, nombre, onSave, onLogout }) => {
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (pass.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (pass !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setError('');
    setSaving(true);
    const err = await onSave(pass);
    setSaving(false);
    if (err) setError(err);
  };

  const input =
    'w-full min-h-[44px] p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono';

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="crearContrasenaTitulo">
      <form onSubmit={submit} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-amber-300" aria-hidden />
          <h2 id="crearContrasenaTitulo" className="font-bold text-sm">Crea tu contraseña</h2>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-600">
            Hola{nombre ? ` ${nombre}` : ''}. Tu usuario es <b className="font-mono text-slate-900">{username}</b>. Escribe la
            contraseña con la que vas a ingresar de ahora en adelante.
          </p>
          <div>
            <label htmlFor="nuevaContrasena" className="block text-xs font-semibold text-slate-700 mb-1">Nueva contraseña</label>
            <div className="relative">
              <input
                id="nuevaContrasena"
                type={show ? 'text' : 'password'}
                autoFocus
                autoComplete="new-password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
                className={`${input} pr-11`}
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-0 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label htmlFor="confirmarContrasena" className="block text-xs font-semibold text-slate-700 mb-1">Confirmar contraseña</label>
            <input
              id="confirmarContrasena"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repite la contraseña"
              className={input}
            />
          </div>
          {error && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button type="button" onClick={onLogout} className="min-h-[44px] px-2 text-xs font-semibold text-slate-500 hover:text-rose-700 inline-flex items-center gap-1.5 cursor-pointer">
              <LogOut className="w-4 h-4" aria-hidden />
              Salir
            </button>
            <Button type="submit" variant="primary" icon={Check} loading={saving} loadingText="Guardando…">
              Guardar contraseña
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
};
