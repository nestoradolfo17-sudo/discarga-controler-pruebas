import React, { useState } from 'react';
import { Lock, User, LogIn, AlertCircle } from 'lucide-react';
import logoDiscarga from '../../assets/logo-discarga.png';

interface LoginScreenProps {
  // Devuelve true/null si entró; false o un mensaje de error si no.
  onLogin: (username: string, password: string) => boolean | string | null | Promise<boolean | string | null>;
  // Aviso a mostrar al abrir el login (p. ej. "usuario desactivado").
  notice?: string;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, notice }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError('');
    setIsSubmitting(true);
    let result: boolean | string | null;
    try {
      result = await onLogin(username.trim(), password);
    } catch {
      result = 'No se pudo conectar. Revisa tu conexión e intenta de nuevo.';
    }
    setIsSubmitting(false);
    if (result === false || typeof result === 'string') {
      setError(typeof result === 'string' ? result : 'Usuario o contraseña incorrectos.');
      setPassword('');
    }
  };

  const shownError = error || notice || '';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center shadow-lg ring-1 ring-white/10 mb-3 overflow-hidden p-1">
            <img src={logoDiscarga} alt="DISCARGA S.A." className="w-full h-full object-contain" />
          </div>
          <h1 className="text-white font-bold text-lg tracking-tight">DISCARGA CONTROLER</h1>
          <p className="text-slate-400 text-xs mt-0.5">Asignación, Segmentación y Liquidación Operativa</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4"
        >
          <div>
            <h2 className="font-bold text-slate-800 text-sm mb-1">Iniciar sesión</h2>
            <p className="text-xs text-slate-400">Ingresa con el usuario y contraseña que te asignó el administrador.</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Usuario</label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                placeholder="Nombre de usuario"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Contraseña</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                placeholder="••••••••"
              />
            </div>
          </div>

          {shownError && (
            <div className="flex items-center gap-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {shownError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm py-2.5 rounded-lg transition cursor-pointer disabled:opacity-60 disabled:cursor-wait"
          >
            <LogIn className="w-4 h-4" />
            {isSubmitting ? 'Ingresando...' : 'Ingresar'}
          </button>

          <p className="text-[11px] text-slate-400 text-center pt-1">
            El acceso solo puede ser creado por un administrador. Si no tienes credenciales, solicítalas con él.
          </p>
        </form>
      </div>
    </div>
  );
};
