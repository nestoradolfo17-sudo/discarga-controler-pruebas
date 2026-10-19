import React, { useState, useMemo } from 'react';
import { RouteClientEntry, ClientePendiente } from '../types';
import { Search } from 'lucide-react';
import { normBusqueda } from '../utils/busqueda';

import { fmtNum } from '../utils/number';
interface ClientesRutaListProps {
  clientes: RouteClientEntry[];
  // Clientes que quedaron pendientes al liquidar (con su motivo): se marcan en
  // rojo dentro de la lista (y se agregan si ya no estaban en ella).
  pendientes?: ClientePendiente[];
  // Búsqueda con la que se abre la lista (p. ej. el cliente buscado en el Tablero).
  filtroInicial?: string;
}

// Lista de solo consulta/referencia de los clientes de una ruta (Código, Nombre,
// Cajas), usada tanto en el Tablero de Rutas como en el Tablero de Rutas
// Liquidadas. No permite editar ni seleccionar nada — para eso existe el
// selector de Clientes Pendientes dentro del modal de Liquidar.
export const ClientesRutaList: React.FC<ClientesRutaListProps> = ({ clientes: clientesBase, pendientes, filtroInicial = '' }) => {
  const [q, setQ] = useState(filtroInicial);

  const motivoPend = useMemo(() => new Map((pendientes || []).map((p) => [p.codigo, p.motivo])), [pendientes]);
  const clientes = useMemo(() => {
    const lista = [...clientesBase];
    const codigos = new Set(lista.map((c) => c.codigo));
    (pendientes || []).forEach((p) => {
      if (!codigos.has(p.codigo)) lista.push({ codigo: p.codigo, nombre: p.nombre, cajas: p.cajas || 0 });
    });
    // Los pendientes primero.
    return lista.sort((a, b) => Number(motivoPend.has(b.codigo)) - Number(motivoPend.has(a.codigo)));
  }, [clientesBase, pendientes, motivoPend]);
  const nPend = motivoPend.size;

  const filtered = useMemo(() => {
    const term = normBusqueda(q);
    if (!term) return clientes;
    return clientes.filter((c) => normBusqueda(c.codigo).includes(term) || normBusqueda(c.nombre).includes(term));
  }, [clientes, q]);

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
          Clientes de la ruta ({clientes.length}) — solo consulta
          {nPend > 0 && (
            <span className="ml-2 normal-case tracking-normal bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">
              {nPend} pendiente(s) al liquidar
            </span>
          )}
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
              {nPend > 0 && <th className="px-2.5 py-1.5">Estado</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono">
            {filtered.map((c, idx) => {
              const motivo = motivoPend.get(c.codigo);
              return (
                <tr key={`${c.codigo}-${idx}`} className={motivo ? 'bg-rose-50/70' : 'hover:bg-slate-50'}>
                  <td className="px-2.5 py-1">{c.codigo}</td>
                  <td className="px-2.5 py-1 font-sans">{c.nombre || '-'}</td>
                  <td className="px-2.5 py-1 text-right font-bold text-blue-700">{fmtNum(Number(c.cajas || 0), 3)}</td>
                  {nPend > 0 && (
                    <td className="px-2.5 py-1 font-sans">
                      {motivo ? (
                        <span className="text-rose-700 font-semibold">Pendiente · {motivo}</span>
                      ) : (
                        <span className="text-emerald-700">Entregado</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={nPend > 0 ? 4 : 3} className="px-2.5 py-3 text-center text-slate-400 font-sans">
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
