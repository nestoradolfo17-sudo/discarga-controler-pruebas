import React from 'react';
import type { TipoUnidad } from '../../types';

// --- Selector Propio / Rentado (camiones y personal) ---
// Dos botones grandes; el registro no se guarda hasta elegir uno.

const OPCIONES: TipoUnidad[] = ['Propio', 'Rentado'];

export const SelectorTipo: React.FC<{
  valor: TipoUnidad | null;
  onChange: (t: TipoUnidad) => void;
  titulo: string;
  etiquetas: Record<TipoUnidad, string>;
  ayudas?: Partial<Record<TipoUnidad, string>>;
  error?: boolean;
}> = ({ valor, onChange, titulo, etiquetas, ayudas, error }) => (
  <div>
    <span id="selector-tipo-titulo" className="block font-semibold text-slate-700 mb-1">
      {titulo}
    </span>
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="selector-tipo-titulo">
      {OPCIONES.map((t) => {
        const activo = valor === t;
        const color =
          t === 'Propio' ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-violet-600 bg-violet-50 text-violet-800';
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => onChange(t)}
            className={`text-left min-h-[52px] px-3 py-2 rounded-xl border-2 cursor-pointer transition ${
              activo ? color : error ? 'border-rose-300 bg-white text-slate-700' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
            }`}
          >
            <span className="block text-xs font-bold">{etiquetas[t]}</span>
            {ayudas?.[t] && <span className="block text-[10.5px] text-slate-500 leading-snug">{ayudas[t]}</span>}
          </button>
        );
      })}
    </div>
    {error && <p className="mt-1 text-[11px] font-semibold text-rose-600">Elige si es propio o rentado.</p>}
  </div>
);
