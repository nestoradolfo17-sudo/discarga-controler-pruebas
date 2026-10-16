import React, { useState } from 'react';
import { MailWarning, Copy, Check, X } from 'lucide-react';
import { Button } from '../ui/Button';

// Cuando el correo automático NO se pudo enviar (servicio de correo sin
// configurar, correo inválido, etc.), se muestra el enlace para crear la
// contraseña para que el administrador lo comparta por otro medio.
interface Props {
  aviso: { username: string; motivo?: string; enlace?: string } | null;
  onClose: () => void;
}

export const EnlaceCorreoModal: React.FC<Props> = ({ aviso, onClose }) => {
  const [copiado, setCopiado] = useState(false);
  if (!aviso) return null;
  const copiar = async () => {
    if (!aviso.enlace) return;
    try {
      await navigator.clipboard.writeText(aviso.enlace);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* el administrador puede seleccionarlo a mano */
    }
  };
  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="enlaceCorreoTitulo">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-4 flex items-center gap-2">
          <MailWarning className="w-5 h-5 text-amber-600" aria-hidden />
          <h3 id="enlaceCorreoTitulo" className="font-bold text-sm text-amber-900 flex-1">No se envió el correo a "{aviso.username}"</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg text-amber-700 hover:bg-amber-100 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {aviso.motivo && <p className="text-xs text-slate-600">{aviso.motivo}</p>}
          {aviso.enlace ? (
            <>
              <p className="text-sm text-slate-700">
                Comparte este enlace solo con esa persona (por ejemplo por WhatsApp). Con él crea su contraseña; sirve una sola vez y vence en 24 horas.
              </p>
              <textarea
                readOnly
                value={aviso.enlace}
                onFocus={(e) => e.currentTarget.select()}
                rows={3}
                className="w-full text-[11px] font-mono p-2 border border-slate-300 rounded-lg bg-slate-50 resize-none"
                aria-label="Enlace para crear la contraseña"
              />
            </>
          ) : (
            <p className="text-sm text-slate-700">Revisa que el usuario tenga un correo válido e intenta de nuevo con "Enviar enlace".</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            {aviso.enlace && (
              <Button variant="primary" icon={copiado ? Check : Copy} onClick={copiar}>
                {copiado ? 'Copiado' : 'Copiar enlace'}
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
