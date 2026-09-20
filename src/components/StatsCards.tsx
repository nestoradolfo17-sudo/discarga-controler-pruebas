import React from 'react';
import { Clock, Navigation, AlertTriangle, CheckCircle2, Warehouse, Package } from 'lucide-react';

interface StatsCardsProps {
  pendientes: number;
  transito: number;
  abiertas: number;
  liquidadas: number;
  pisoHoy: number;
  fechaHoy?: string;
  liquidadasTotal?: number;
  cajasFisicasHoy?: number;
  cajasEntregadasHoy?: number;
  onSelectTab?: (tab: 'board' | 'liquidated') => void;
}

export const StatsCards: React.FC<StatsCardsProps> = ({
  pendientes,
  transito,
  abiertas,
  liquidadas,
  pisoHoy,
  fechaHoy,
  liquidadasTotal,
  cajasFisicasHoy,
  cajasEntregadasHoy,
  onSelectTab,
}) => {
  return (
    <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 md:gap-3">
      <div
        onClick={() => onSelectTab && onSelectTab('board')}
        className={`group bg-white p-3.5 rounded-2xl border border-slate-200/80 border-l-4 border-l-amber-400 shadow-sm flex flex-col justify-between min-h-[104px] transition-all duration-200 ${
          onSelectTab ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold text-slate-500 leading-snug">Rutas Pendientes</p>
          <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 ring-1 ring-amber-100 group-hover:scale-105 transition-transform">
            <Clock className="w-4 h-4" />
          </div>
        </div>
        <div>
          <h3 className="text-2xl font-bold text-slate-800 leading-none">{pendientes}</h3>
          <span className="text-[11px] text-amber-600 font-medium mt-1 block">Por asignar</span>
        </div>
      </div>

      <div
        onClick={() => onSelectTab && onSelectTab('board')}
        className={`group bg-white p-3.5 rounded-2xl border border-slate-200/80 border-l-4 border-l-blue-500 shadow-sm flex flex-col justify-between min-h-[104px] transition-all duration-200 ${
          onSelectTab ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold text-slate-500 leading-snug">En Tránsito</p>
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 ring-1 ring-blue-100 group-hover:scale-105 transition-transform">
            <Navigation className="w-4 h-4" />
          </div>
        </div>
        <div>
          <h3 className="text-2xl font-bold text-blue-600 leading-none">{transito}</h3>
          <span className="text-[11px] text-blue-500 font-medium mt-1 block">En reparto</span>
        </div>
      </div>

      <div
        onClick={() => onSelectTab && onSelectTab('board')}
        className={`group bg-white p-3.5 rounded-2xl border border-slate-200/80 border-l-4 border-l-orange-500 shadow-sm flex flex-col justify-between min-h-[104px] transition-all duration-200 ${
          onSelectTab ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''
        }`}
      >
        {/* Corrección: se usa la misma familia de color (naranja/coral) que el
            Dashboard usa para "Con Devolución" (antes esta tarjeta usaba rosa/rojo,
            dando la impresión de ser un estado distinto). */}
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold text-slate-500 leading-snug">Abiertas / Devolución</p>
          <div className="w-8 h-8 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0 ring-1 ring-orange-100 group-hover:scale-105 transition-transform">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
        <div>
          <h3 className="text-2xl font-bold text-orange-600 leading-none">{abiertas}</h3>
          <span className="text-[11px] text-orange-500 font-medium mt-1 block">Por reasignar</span>
        </div>
      </div>

      <div
        onClick={() => onSelectTab && onSelectTab('board')}
        className={`group bg-white p-3.5 rounded-2xl border border-slate-200/80 border-l-4 border-l-amber-500 shadow-sm flex flex-col justify-between min-h-[104px] transition-all duration-200 ${
          onSelectTab ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold text-slate-500 leading-snug">Rutas a Piso</p>
          <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 ring-1 ring-amber-100 group-hover:scale-105 transition-transform">
            <Warehouse className="w-4 h-4" />
          </div>
        </div>
        <div>
          <h3 className="text-2xl font-bold text-amber-600 leading-none">{pisoHoy}</h3>
          <span className="text-[11px] text-amber-600 font-medium mt-1 block truncate">
            {fechaHoy ? `Fecha: ${fechaHoy}` : 'Bodega hoy'}
          </span>
        </div>
      </div>

      <div
        onClick={() => onSelectTab && onSelectTab('liquidated')}
        className={`group bg-white p-3.5 rounded-2xl border border-slate-200/80 border-l-4 border-l-emerald-500 shadow-sm flex flex-col justify-between min-h-[104px] transition-all duration-200 ${
          onSelectTab ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold text-slate-500 leading-snug">Liquidadas</p>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 ring-1 ring-emerald-100 group-hover:scale-105 transition-transform">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
        <div>
          <h3 className="text-2xl font-bold text-emerald-600 leading-none">{liquidadas}</h3>
          <span className="text-[11px] text-emerald-600 font-medium mt-1 block truncate">
            {liquidadasTotal !== undefined && liquidadasTotal > liquidadas
              ? `${liquidadas} hoy · ${liquidadasTotal} hist. →`
              : 'Ver Liquidadas →'}
          </span>
        </div>
      </div>

      <div
        onClick={() => onSelectTab && onSelectTab('board')}
        className={`group bg-white p-3.5 rounded-2xl border border-slate-200/80 border-l-4 border-l-indigo-500 shadow-sm flex flex-col justify-between min-h-[104px] transition-all duration-200 ${
          onSelectTab ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold text-slate-500 leading-snug">Total Cajas Físicas</p>
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 ring-1 ring-indigo-100 group-hover:scale-105 transition-transform">
            <Package className="w-4 h-4" />
          </div>
        </div>
        <div>
          <h3 className="text-2xl font-bold text-indigo-700 leading-none">
            {cajasFisicasHoy !== undefined
              ? Number(cajasFisicasHoy.toFixed(1)).toLocaleString('es-GT', { maximumFractionDigits: 1 })
              : '0'}
          </h3>
          <span className="text-[11px] text-indigo-600 font-medium mt-1 block truncate">
            {cajasEntregadasHoy !== undefined && cajasEntregadasHoy > 0
              ? `${Number(cajasEntregadasHoy.toFixed(1)).toLocaleString('es-GT', { maximumFractionDigits: 1 })} entregadas`
              : 'Carga total del día'}
          </span>
        </div>
      </div>
    </section>
  );
};
