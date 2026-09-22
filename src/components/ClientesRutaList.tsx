import React, { useState, useMemo } from 'react';
import { RouteClientEntry } from '../types';
import { Search } from 'lucide-react';

interface ClientesRutaListProps {
  clientes: RouteClientEntry[];
}

// Lista de solo consulta/referencia de los clientes de una ruta (Código, Nombre,
// Cajas), usada tanto en el Tablero de Rutas como en el Tablero de Rutas
// Liquidadas. No permite editar ni seleccionar nada — para eso existe el
// selector de Clientes Pendientes dentro del modal de Liquidar.
export const ClientesRutaList: React.FC<ClientesRutaListProps> = ({ clientes }) => {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const term = q.toLowerCase().trim();
    if (!term) return clientes;
    return clientes.filter(
      (c) => c.codigo.toLowerCase().includes(term) || (c.nombre || '').toLowerCase().includes(term)
    );
  }, [clientes, q]);

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
          Clientes de la ruta ({clientes.length}) — solo consulta
        </span>
        <div className="relative w-full sm:w-56">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar código o nombre..."
            className="w-full pl-7 pr-2 py-1 text-[11px] border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg bg-white">
        <table className="w-full text-[11px] text-left">
          <thead className="bg-slate-100 text-slate-600 uppercase font-semibold sticky top-0">
            <tr>
              <th className="px-2.5 py-1.5">Código</th>
              <th className="px-2.5 py-1.5">Nombre</th>
              <th className="px-2.5 py-1.5 text-right">Cajas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono">
            {filtered.map((c, idx) => (
              <tr key={`${c.codigo}-${idx}`} className="hover:bg-slate-50">
                <td className="px-2.5 py-1">{c.codigo}</td>
                <td className="px-2.5 py-1 font-sans">{c.nombre || '-'}</td>
                <td className="px-2.5 py-1 text-right font-bold text-blue-700">{Number(c.cajas || 0).toFixed(3)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="px-2.5 py-3 text-center text-slate-400 font-sans">
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
