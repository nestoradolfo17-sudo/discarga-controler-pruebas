import React, { useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

// --- Botón único de la app (sistema de diseño) ---
//
// Antes cada botón repetía a mano 10–15 clases y había 9 colores distintos para
// la acción principal. Aquí vive la regla para toda la app:
//
//   primary   → azul      Confirmar / Asignar / Guardar (acción principal)
//   success   → verde     Cerrar un proceso: Liquidar, Fin de Asignación
//   warning   → ámbar     Caja abierta, A Piso, reprogramar
//   danger    → rojo      Eliminar, Revertir (destructivo)
//   secondary → blanco    Cancelar, Cerrar, acciones de apoyo
//   ghost     → sin borde Acciones terciarias dentro de tarjetas
//   dark      → negro     Navegación / pantalla completa
//
// Tamaños pensados para tablet (dedo, no mouse):
//   sm = 40 px, md = 44 px (mínimo recomendado), lg = 52 px (acción principal).
//
// Además:
//   • Estado "cargando": si onClick devuelve una promesa, el botón muestra el
//     spinner y queda bloqueado hasta que termine (o se controla con `loading`).
//   • Anti doble toque: ignora un segundo toque en los siguientes 450 ms (evita
//     asignar o liquidar dos veces cuando la tablet responde lento).
//   • Foco visible para teclado (tablet con teclado Bluetooth).

export type ButtonVariant = 'primary' | 'success' | 'warning' | 'danger' | 'secondary' | 'ghost' | 'dark';
export type ButtonSize = 'sm' | 'md' | 'lg';
type IconType = React.ComponentType<{ className?: string }>;

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white border border-blue-600 shadow-sm focus-visible:ring-blue-300',
  success: 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white border border-emerald-600 shadow-sm focus-visible:ring-emerald-300',
  warning: 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white border border-amber-500 shadow-sm focus-visible:ring-amber-300',
  danger: 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white border border-rose-600 shadow-sm focus-visible:ring-rose-300',
  secondary: 'bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 border border-slate-300 focus-visible:ring-slate-300',
  ghost: 'bg-transparent hover:bg-slate-100 active:bg-slate-200 text-slate-600 border border-transparent focus-visible:ring-slate-300',
  dark: 'bg-slate-900 hover:bg-slate-800 active:bg-black text-white border border-slate-900 focus-visible:ring-slate-400',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-[40px] text-xs gap-1.5 rounded-lg',
  md: 'min-h-[44px] text-sm gap-2 rounded-xl',
  lg: 'min-h-[52px] text-sm sm:text-base gap-2 rounded-xl',
};

const PAD: Record<ButtonSize, string> = { sm: 'px-3', md: 'px-4', lg: 'px-5' };
const SQUARE: Record<ButtonSize, string> = { sm: 'min-w-[40px]', md: 'min-w-[44px]', lg: 'min-w-[52px]' };

const ICON_SIZE: Record<ButtonSize, string> = {
  sm: 'w-4 h-4',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

const DOUBLE_TAP_MS = 450;

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconType;
  iconRight?: IconType;
  loading?: boolean;
  loadingText?: string;
  fullWidth?: boolean;
  badge?: React.ReactNode;
  // Botón cuadrado (solo ícono): sin relleno lateral y con ancho mínimo táctil.
  square?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => unknown;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon: Icon,
    iconRight: IconRight,
    loading,
    loadingText,
    fullWidth,
    badge,
    square,
    className = '',
    type = 'button',
    disabled,
    onClick,
    children,
    ...rest
  },
  ref
) {
  const [busy, setBusy] = useState(false);
  const lastTapRef = useRef(0);
  const isLoading = !!loading || busy;
  const isDisabled = !!disabled || isLoading;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS || isLoading) {
      // Segundo toque demasiado rápido: no repetir la acción (ni reenviar el formulario).
      e.preventDefault();
      return;
    }
    lastTapRef.current = now;
    const result = onClick?.(e);
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      setBusy(true);
      (result as Promise<unknown>).finally(() => setBusy(false));
    }
  };

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      onClick={handleClick}
      className={`inline-flex items-center justify-center font-semibold select-none transition-all cursor-pointer active:scale-[0.98] outline-none focus-visible:ring-4 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${VARIANT[variant]} ${SIZE[size]} ${square ? SQUARE[size] : PAD[size]} ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
      {...rest}
    >
      {isLoading ? (
        <Loader2 className={`${ICON_SIZE[size]} animate-spin shrink-0`} aria-hidden />
      ) : (
        Icon && <Icon className={`${ICON_SIZE[size]} shrink-0`} aria-hidden />
      )}
      {isLoading && loadingText ? <span>{loadingText}</span> : children}
      {badge !== undefined && badge !== null && badge !== false && (
        <span className="ml-0.5 min-w-[20px] px-1.5 rounded-full text-[11px] font-bold leading-5 bg-black/15">{badge}</span>
      )}
      {IconRight && !isLoading && <IconRight className={`${ICON_SIZE[size]} shrink-0`} aria-hidden />}
    </button>
  );
});

// --- Botón solo con ícono ---
// En tablet no existe "pasar el mouse", así que el texto de ayuda (title) nunca
// se ve: `label` es obligatorio y se usa como aria-label y como title. El área
// táctil es de al menos 44×44 px aunque el ícono sea pequeño.
export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'icon' | 'iconRight' | 'fullWidth' | 'loadingText'> {
  icon: IconType;
  label: string;
  // Muestra también el texto al lado del ícono (en pantallas medianas o más).
  showLabel?: boolean;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, showLabel, size = 'md', variant = 'ghost', className = '', ...rest },
  ref
) {
  return (
    <Button
      ref={ref}
      icon={icon}
      size={size}
      variant={variant}
      aria-label={label}
      title={label}
      square={!showLabel}
      className={className}
      {...rest}
    >
      {showLabel ? <span className="hidden md:inline">{label}</span> : null}
    </Button>
  );
});
