import React from 'react';

// --- Selector de botones (segmentado) ---
// Para listas cortas (agencia, segmento, tipo): un toque en vez de abrir una
// lista desplegable. Botones de 44 px, el elegido en azul. Si hay demasiadas
// opciones (> maxButtons) se muestra una lista desplegable normal.

interface SegmentedSelectProps {
  id?: string;
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  maxButtons?: number;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

export const SegmentedSelect: React.FC<SegmentedSelectProps> = ({
  id,
  label,
  options,
  value,
  onChange,
  maxButtons = 8,
  placeholder = '— Selecciona —',
  required,
  disabled,
}) => {
  const missing = required && !value;
  if (options.length > maxButtons) {
    return (
      <select
        id={id}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full min-h-[44px] px-3 border rounded-xl text-sm font-medium bg-white outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
          missing ? 'border-amber-400' : 'border-slate-300'
        }`}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={label}
      className={`flex flex-wrap gap-2 ${missing ? 'p-1 -m-1 rounded-xl ring-2 ring-amber-300' : ''}`}
    >
      {options.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o)}
            className={`min-h-[44px] px-4 rounded-xl border-2 text-sm font-semibold transition cursor-pointer active:scale-95 outline-none focus-visible:ring-4 focus-visible:ring-blue-200 disabled:opacity-50 ${
              active ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-slate-300 text-slate-700 hover:border-blue-300'
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
};
