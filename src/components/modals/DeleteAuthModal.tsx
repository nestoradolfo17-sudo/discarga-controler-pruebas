import React, { useState, useEffect } from 'react';
import { X, Lock, Trash2, ShieldAlert } from 'lucide-react';

// Código de autorización requerido para eliminar registros de Camiones o Personal.
// No se muestra en ninguna parte de la interfaz.
const DELETE_AUTH_CODE = '1605';
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
}

export const DeleteAuthModal: React.FC<DeleteAuthModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  itemLabel,
  itemCount = 1,
}) => {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmPhraseOk) {
      setError(`Escribe "${CONFIRM_WORD}" para confirmar antes de continuar.`);
      return;
    }
    if (code.trim() === DELETE_AUTH_CODE) {
      setCode('');
      setError('');
      setConfirmPhrase('');
      onConfirm();
    } else {
      setError('Código incorrecto. Verifica e intenta de nuevo.');
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
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
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
              className="w-full p-2 border border-rose-300 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 font-bold text-center uppercase tracking-widest text-rose-900 bg-white"
            />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="font-semibold text-slate-700 mb-1 flex items-center">
              <Lock className="w-3 h-3 mr-1" />
              Código de autorización
            </label>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError('');
              }}
              autoFocus={!isHighRisk}
              placeholder="••••"
              className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-rose-500 font-mono tracking-widest"
            />
            {error && <p className="text-rose-600 font-semibold mt-1">{error}</p>}
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleClose}
              className="px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer text-slate-600"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!confirmPhraseOk}
              title={!confirmPhraseOk ? `Escribe "${CONFIRM_WORD}" arriba para habilitar` : undefined}
              className={`px-3 py-1.5 font-semibold rounded-lg ${
                !confirmPhraseOk
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer'
              }`}
            >
              Eliminar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
