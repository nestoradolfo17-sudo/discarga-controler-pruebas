import React, { useState, useEffect } from 'react';
import { X, Lock, Trash2, ShieldAlert } from 'lucide-react';
import { Button } from '../ui/Button';

// Eliminar camiones o personal se confirma con la CONTRASEÑA del usuario en
// sesión (antes era un código fijo escrito dentro de la app, visible para
// cualquiera que revisara el código descargado en el navegador).
const CONFIRM_WORD = 'ELIMINAR';

interface DeleteAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemLabel: string;
  // Corrección: cantidad de registros que se eliminarán en esta operación. Cuando
  // es mayor a 1 (eliminación masiva), se exige un paso adicional de confirmación
  // (escribir "ELIMINAR") antes de aceptar el código — la fricción ahora es
  // proporcional al riesgo en vez de ser siempre la misma. Al omitirse (o valer 1)
  // el comportamiento es idéntico al que ya existía.
  itemCount?: number;
  onVerifyPassword: (password: string) => Promise<boolean>;
}

export const DeleteAuthModal: React.FC<DeleteAuthModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  itemLabel,
  itemCount = 1,
  onVerifyPassword,
}) => {
  const [checking, setChecking] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const isHighRisk = itemCount > 1;
  const confirmPhraseOk = !isHighRisk || confirmPhrase.trim().toUpperCase() === CONFIRM_WORD;

  useEffect(() => {
    if (isOpen) {
      setCode('');
      setError('');
      setConfirmPhrase('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    setCode('');
    setError('');
    setConfirmPhrase('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (checking) return;
    if (!confirmPhraseOk) {
      setError(`Escribe "${CONFIRM_WORD}" para confirmar antes de continuar.`);
      return;
    }
    setChecking(true);
    let ok = false;
    try {
      ok = await onVerifyPassword(code);
    } finally {
      setChecking(false);
    }
    if (ok) {
      setCode('');
      setError('');
      setConfirmPhrase('');
      onConfirm();
    } else {
      setError('Contraseña incorrecta. Verifica e intenta de nuevo.');
      setCode('');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl p-6 space-y-4 text-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="font-bold text-sm text-slate-800 flex items-center">
            <Trash2 className="w-4 h-4 mr-1.5 text-rose-600" />
            Confirmar Eliminación
          </h3>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Cerrar"
            title="Cerrar"
            className="text-slate-400 hover:text-slate-600 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-slate-600 leading-relaxed">
          Esta acción eliminará permanentemente{' '}
          <span className="font-semibold text-slate-800">{itemLabel}</span>. Esta operación no se
          puede deshacer.
        </p>

        {/* Corrección: fricción adicional para eliminaciones masivas (más de un
            registro a la vez), sin cambiar el flujo de eliminar un solo registro. */}
        {isHighRisk && (
          <div className="p-2.5 bg-rose-100 border-2 border-rose-300 rounded-xl text-rose-950 space-y-2">
            <div className="flex items-center gap-1.5 font-black text-rose-900">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-700 shrink-0" />
              <span>Eliminación masiva ({itemCount} registros) — Confirmación Adicional</span>
            </div>
            <p className="text-[11px] text-rose-900">
              Para continuar, escribe <strong>{CONFIRM_WORD}</strong> abajo.
            </p>
            <input
              type="text"
              value={confirmPhrase}
              onChange={(e) => {
                setConfirmPhrase(e.target.value);
                if (error) setError('');
              }}
              placeholder={`Escribe ${CONFIRM_WORD} para continuar`}
              className="w-full min-h-[44px] p-2 border border-rose-300 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 font-bold text-center uppercase tracking-widest text-rose-900 bg-white"
            />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="font-semibold text-slate-700 mb-1 flex items-center">
              <Lock className="w-3 h-3 mr-1" />
              Tu contraseña
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError('');
              }}
              autoFocus={!isHighRisk}
              placeholder="Escribe tu contraseña"
              className="w-full min-h-[44px] p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 font-mono tracking-widest"
            />
            {error && <p className="text-rose-600 font-semibold mt-1">{error}</p>}
          </div>

          <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
            <Button variant="secondary" size="md" onClick={handleClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="md"
              icon={Trash2}
              disabled={!confirmPhraseOk || !code}
              loading={checking}
              loadingText="Verificando…"
              title={!confirmPhraseOk ? `Escribe "${CONFIRM_WORD}" arriba para habilitar` : undefined}
            >
              Eliminar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
