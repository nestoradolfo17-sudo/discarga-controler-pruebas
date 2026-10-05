import React from 'react';

// --- Pie de ventana (modal) único ---
//
// Regla para todas las ventanas:
//   • Siempre visible (fijo abajo): en tablet no hay que desplazarse hasta el
//     final para encontrar el botón de confirmar.
//   • Cancelar / Cerrar a la IZQUIERDA (secundario) y la acción principal a la
//     DERECHA, con un verbo específico ("Liquidar ruta", no "Confirmar").
//   • `info` (opcional) muestra un resumen corto junto a los botones, p. ej.
//     "3 viajes · 120 cajas".
//
// Se usa DENTRO del contenedor con scroll del modal (el <form> con
// overflow-y-auto). `bleed` indica el relleno de ese contenedor para que el
// pie ocupe todo el ancho sin dejar huecos a los lados.

interface ModalFooterProps {
  children: React.ReactNode; // botones de la derecha (acción principal al final)
  secondary?: React.ReactNode; // botón de la izquierda (Cancelar / Cerrar)
  info?: React.ReactNode;
  bleed?: 'p-5' | 'p-6' | 'p-5 sm:p-7' | 'none';
  className?: string;
}

const BLEED: Record<NonNullable<ModalFooterProps['bleed']>, string> = {
  'p-5': '-mx-5 -mb-5 px-5',
  'p-6': '-mx-6 -mb-6 px-6',
  'p-5 sm:p-7': '-mx-5 sm:-mx-7 -mb-5 sm:-mb-7 px-5 sm:px-7',
  none: 'px-4',
};

export const ModalFooter: React.FC<ModalFooterProps> = ({ children, secondary, info, bleed = 'p-6', className = '' }) => (
  <div
    className={`sticky bottom-0 z-10 ${BLEED[bleed]} py-3 bg-white border-t border-slate-200 flex flex-wrap items-center gap-2 sm:gap-3 ${className}`}
  >
    {secondary && <div className="flex items-center gap-2">{secondary}</div>}
    {info && <div className="text-xs text-slate-500 min-w-0 flex-1 truncate">{info}</div>}
    <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">{children}</div>
  </div>
);
