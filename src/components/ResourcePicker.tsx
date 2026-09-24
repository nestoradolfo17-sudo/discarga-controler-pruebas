import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Check, Eye, EyeOff } from 'lucide-react';

// --- Buscador táctil de recursos (camiones / pilotos / auxiliares) ---
//
// Reemplaza las listas desplegables largas del modal de asignación: en una
// tablet, desplazarse por cientos de nombres en un <select> es lento. Aquí se
// abre un panel grande con el cuadro de búsqueda ya activo; se busca por
// nombre, código corto, DPI, placa o ID; los resultados son tarjetas grandes
// con una etiqueta de color y los disponibles aparecen primero.

export type PickerStatus = 'sugerido' | 'disponible' | 'compartida' | 'enruta' | 'conflicto' | 'no_disponible' | 'baja';

export interface PickerItem {
  id: string; // valor que se devuelve al elegir
  title: string;
  subtitle?: string;
  searchText: string; // texto donde se busca (nombre, código, DPI, placa…)
  status: PickerStatus;
  statusLabel: string;
  disabled?: boolean;
  hidden?: boolean; // no disponible hoy: solo aparece con "Mostrar todos"
  extraBadge?: string;
}

interface ResourcePickerProps {
  isOpen: boolean;
  title: string;
  placeholder?: string;
  items: PickerItem[];
  selectedIds: string[];
  multi?: boolean;
  maxSelect?: number;
  onSelect: (id: string) => void;
  onRemove?: (id: string) => void;
  onClose: () => void;
  headerExtra?: React.ReactNode;
}

const STATUS_ORDER: Record<PickerStatus, number> = {
  sugerido: 0,
  disponible: 1,
  compartida: 2,
  enruta: 3,
  conflicto: 4,
  no_disponible: 5,
  baja: 6,
};

const STATUS_STYLE: Record<PickerStatus, string> = {
  sugerido: 'bg-violet-100 text-violet-800 border-violet-300',
  disponible: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  compartida: 'bg-sky-100 text-sky-800 border-sky-300',
  enruta: 'bg-amber-100 text-amber-800 border-amber-300',
  conflicto: 'bg-rose-100 text-rose-800 border-rose-300',
  no_disponible: 'bg-slate-100 text-slate-600 border-slate-300',
  baja: 'bg-slate-200 text-slate-500 border-slate-300',
};

const MAX_RENDER = 80;

export const normalizeSearch = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export const ResourcePicker: React.FC<ResourcePickerProps> = ({
  isOpen,
  title,
  placeholder = 'Buscar...',
  items,
  selectedIds,
  multi = false,
  maxSelect = 1,
  onSelect,
  onRemove,
  onClose,
  headerExtra,
}) => {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setShowAll(false);
      // Pequeño retraso para que el teclado de la tablet se abra al mostrar el panel.
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const hiddenCount = useMemo(() => items.filter((i) => i.hidden).length, [items]);

  const results = useMemo(() => {
    const words = normalizeSearch(query).split(' ').filter(Boolean);
    return items
      .filter((i) => showAll || !i.hidden || selectedIds.includes(i.id))
      .filter((i) => {
        if (words.length === 0) return true;
        const hay = normalizeSearch(i.searchText);
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => {
        const aSel = selectedIds.includes(a.id) ? 0 : 1;
        const bSel = selectedIds.includes(b.id) ? 0 : 1;
        if (aSel !== bSel) return aSel - bSel;
        const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        if (so !== 0) return so;
        return a.title.localeCompare(b.title, 'es');
      });
  }, [items, query, showAll, selectedIds]);

  if (!isOpen) return null;

  const selectedCount = selectedIds.length;
  const isFull = multi && selectedCount >= maxSelect;

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-full sm:max-h-[90vh]">
        {/* Encabezado + búsqueda */}
        <div className="p-4 border-b border-slate-200 space-y-3 flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <h4 className="font-bold text-slate-900 text-base">
              {title}
              {multi && (
                <span className="ml-2 text-xs font-semibold text-slate-500">
                  ({selectedCount} de {maxSelect})
                </span>
              )}
            </h4>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-xl bg-slate-900 text-white font-semibold text-sm flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              {multi ? (
                <>
                  <Check className="w-4 h-4" /> Listo
                </>
              ) : (
                <>
                  <X className="w-4 h-4" /> Cerrar
                </>
              )}
            </button>
          </div>
          <div className="relative">
            <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              ref={inputRef}
              type="search"
              inputMode="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="w-full pl-11 pr-10 py-3.5 text-base border-2 border-slate-300 rounded-xl focus:border-blue-500 outline-none font-medium"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 cursor-pointer"
                title="Borrar búsqueda"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs text-slate-500">
              {results.length} resultado{results.length === 1 ? '' : 's'}
              {!showAll && hiddenCount > 0 && ` · ${hiddenCount} oculto(s) por no estar disponibles hoy`}
            </span>
            <div className="flex items-center gap-2">
              {headerExtra}
              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="min-h-[36px] px-3 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 flex items-center gap-1 cursor-pointer"
                >
                  {showAll ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showAll ? 'Ocultar no disponibles' : 'Mostrar todos'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Resultados */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {results.length === 0 && (
            <div className="text-center text-sm text-slate-500 py-10">
              No hay coincidencias{!showAll && hiddenCount > 0 ? '. Prueba con "Mostrar todos".' : '.'}
            </div>
          )}
          {results.slice(0, MAX_RENDER).map((item) => {
            const isSelected = selectedIds.includes(item.id);
            const blocked = item.disabled || (!isSelected && isFull);
            return (
              <button
                key={item.id}
                type="button"
                disabled={blocked && !isSelected}
                onClick={() => {
                  if (isSelected && multi && onRemove) onRemove(item.id);
                  else if (!blocked) onSelect(item.id);
                }}
                className={`w-full min-h-[60px] text-left px-4 py-3 rounded-xl border-2 flex items-center gap-3 transition active:scale-[0.99] ${
                  isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : blocked
                    ? 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
                    : 'border-slate-200 bg-white hover:border-blue-300 cursor-pointer'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                  }`}
                >
                  {isSelected && <Check className="w-4 h-4 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900 text-sm sm:text-base truncate">{item.title}</div>
                  {item.subtitle && <div className="text-xs text-slate-500 truncate mt-0.5">{item.subtitle}</div>}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0 max-w-[45%]">
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap truncate max-w-full ${STATUS_STYLE[item.status]}`}
                  >
                    {item.statusLabel}
                  </span>
                  {item.extraBadge && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-800 border-amber-300 whitespace-nowrap">
                      {item.extraBadge}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          {results.length > MAX_RENDER && (
            <div className="text-center text-xs text-slate-500 py-3">
              Mostrando {MAX_RENDER} de {results.length}. Escribe más letras para encontrar a la persona.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
