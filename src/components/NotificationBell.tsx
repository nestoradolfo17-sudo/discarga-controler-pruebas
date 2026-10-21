import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Repeat, ArrowLeftRight, Banknote, ChevronRight } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import { estadoPrestamo, formatoCorrelativoPrestamo } from '../utils/prestamos';
import type { Prestamo } from '../types';

// --- Campana de pendientes por autorizar ---
// Solo para quien autoriza: administrador general (todas las agencias) o
// administrador de agencia (sus agencias). Muestra lo que espera su decisión:
//   • Recargas pendientes de la agencia.
//   • Préstamos / traslados de personal y camiones (agencia que presta).
//   • ZR: solicitudes de pago parcial, anticipos y habilitaciones fuera de plazo.
// Se actualiza sola (tiempo real) y cada 2 minutos como respaldo.

export type DestinoNotificacion = 'recargas' | 'prestamos' | 'zr';

interface Item {
  id: string;
  tipo: DestinoNotificacion;
  agencia: string;
  titulo: string;
  detalle: string;
  fecha?: string;
}

interface Props {
  isAdmin: boolean;
  adminAgencias: string[];
  prestamos: Prestamo[];
  puedeVer: { recargas: boolean; prestamos: boolean; zr: boolean };
  onIr: (tipo: DestinoNotificacion, agencia: string) => void;
}

const q = (v: unknown) => `Q ${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtFecha = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split('-').reverse().join('/') : '');

const GRUPOS: { tipo: DestinoNotificacion; titulo: string; icono: React.ElementType; color: string }[] = [
  { tipo: 'recargas', titulo: 'Recargas por autorizar', icono: Repeat, color: 'text-violet-600 bg-violet-50' },
  { tipo: 'prestamos', titulo: 'Préstamos / traslados por autorizar', icono: ArrowLeftRight, color: 'text-teal-600 bg-teal-50' },
  { tipo: 'zr', titulo: 'ZR por autorizar', icono: Banknote, color: 'text-rose-700 bg-rose-50' },
];

export const NotificationBell: React.FC<Props> = ({ isAdmin, adminAgencias, prestamos, puedeVer, onIr }) => {
  const [abierto, setAbierto] = useState(false);
  const [recargas, setRecargas] = useState<Item[]>([]);
  const [zr, setZr] = useState<Item[]>([]);
  const caja = useRef<HTMLDivElement>(null);
  const agenciasKey = adminAgencias.join('|');
  const esAdminDe = useCallback((ag?: string) => isAdmin || (!!ag && adminAgencias.includes(ag)), [isAdmin, agenciasKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Recargas pendientes (solo las que este usuario puede autorizar) ---
  const leerRecargas = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !puedeVer.recargas) return setRecargas([]);
    let qy = supabase.from('app_recargas').select('id, data').or('data->>estado.is.null,data->>estado.eq.Pendiente').limit(1000);
    if (!isAdmin) qy = qy.in('data->>agencia', adminAgencias);
    const { data, error } = await qy;
    if (error) return; // tabla aún no creada: sin avisos
    setRecargas(
      ((data || []) as { id: string; data: Record<string, any> }[])
        .filter((r) => esAdminDe(r.data?.agencia))
        .map((r) => ({
          id: r.id,
          tipo: 'recargas' as const,
          agencia: r.data.agencia || '',
          titulo: `${r.data.correlativo ? `REC-${String(r.data.correlativo).padStart(6, '0')}` : 'Recarga'} · ${r.data.tipo || ''}`.trim(),
          detalle: [r.data.rutaId ? `Ruta ${r.data.rutaId}` : 'Sin ruta', r.data.conductor].filter(Boolean).join(' · '),
          fecha: r.data.fecha,
        }))
        .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
    );
  }, [isAdmin, agenciasKey, esAdminDe, puedeVer.recargas]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- ZR: solicitudes, anticipos y habilitaciones pendientes ---
  const leerZr = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase || !puedeVer.zr) return setZr([]);
    let qy = supabase
      .from('app_zr')
      .select('agencia, col, doc, data')
      .in('col', ['solicitudes', 'gastos'])
      .or('data->>estado.eq.pendiente,data->>estadoAnticipo.eq.pendiente,data->ext->>estado.eq.pendiente')
      .limit(1000);
    if (!isAdmin) qy = qy.in('agencia', adminAgencias);
    const { data, error } = await qy;
    if (error) return; // ZR aún no instalado: sin avisos
    const out: Item[] = [];
    ((data || []) as { agencia: string; col: string; doc: string; data: Record<string, any> }[]).forEach((r) => {
      if (!esAdminDe(r.agencia)) return;
      const d = r.data || {};
      if (r.col === 'solicitudes' && d.estado === 'pendiente') {
        out.push({ id: `${r.agencia}/s/${r.doc}`, tipo: 'zr', agencia: r.agencia, titulo: `Pago parcial ${d.numero || ''}`.trim(), detalle: [d.sectorNombre, d.montoSolicitado ? q(d.montoSolicitado) : ''].filter(Boolean).join(' · '), fecha: d.fechaRetiro });
      }
      if (r.col === 'gastos' && d.anticipo && d.estadoAnticipo === 'pendiente') {
        out.push({ id: `${r.agencia}/a/${r.doc}`, tipo: 'zr', agencia: r.agencia, titulo: `Anticipo ${d.correlativo || ''}`.trim(), detalle: [d.sectorNombre, d.monto ? q(d.monto) : ''].filter(Boolean).join(' · '), fecha: d.fecha });
      }
      if (r.col === 'gastos' && d.ext?.estado === 'pendiente') {
        out.push({ id: `${r.agencia}/h/${r.doc}`, tipo: 'zr', agencia: r.agencia, titulo: `Habilitar fuera de plazo ${d.correlativo || ''}`.trim(), detalle: [d.sectorNombre, d.ext?.solicitanteNombre].filter(Boolean).join(' · '), fecha: d.fecha });
      }
    });
    setZr(out.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))));
  }, [isAdmin, agenciasKey, esAdminDe, puedeVer.zr]); // eslint-disable-line react-hooks/exhaustive-deps

  // Primera lectura, tiempo real y respaldo cada 2 minutos.
  useEffect(() => {
    void leerRecargas();
    void leerZr();
    if (!isSupabaseConfigured || !supabase) return;
    const sb = supabase;
    let tR: ReturnType<typeof setTimeout> | undefined;
    let tZ: ReturnType<typeof setTimeout> | undefined;
    const canal = sb
      .channel('notificaciones-' + Math.random().toString(36).slice(2))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_recargas' }, () => {
        clearTimeout(tR);
        tR = setTimeout(() => void leerRecargas(), 800);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_zr' }, () => {
        clearTimeout(tZ);
        tZ = setTimeout(() => void leerZr(), 800);
      })
      .subscribe();
    const iv = setInterval(() => {
      void leerRecargas();
      void leerZr();
    }, 120000);
    return () => {
      clearTimeout(tR);
      clearTimeout(tZ);
      clearInterval(iv);
      sb.removeChannel(canal);
    };
  }, [leerRecargas, leerZr]);

  // --- Préstamos: ya están en la app (tiempo real) ---
  const prestamosPend = useMemo<Item[]>(
    () =>
      !puedeVer.prestamos
        ? []
        : prestamos
            .filter((p) => estadoPrestamo(p) === 'Pendiente' && esAdminDe(p.agenciaOrigen))
            .map((p) => ({
              id: p.id,
              tipo: 'prestamos' as const,
              agencia: p.agenciaOrigen,
              titulo: `${formatoCorrelativoPrestamo(p.correlativo) || 'Préstamo'} · ${p.agenciaOrigen} → ${p.agenciaDestino}`,
              detalle: `${p.recursos.length} recurso(s) · ${fmtFecha(p.fechaInicio)} al ${fmtFecha(p.fechaFin)}${p.solicitadoPor ? ` · ${p.solicitadoPor}` : ''}`,
              fecha: p.fechaInicio,
            }))
            .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))),
    [prestamos, esAdminDe, puedeVer.prestamos]
  );

  const porTipo: Record<DestinoNotificacion, Item[]> = { recargas, prestamos: prestamosPend, zr };
  const total = recargas.length + prestamosPend.length + zr.length;

  // Cerrar al tocar fuera o con Escape.
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false);
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', esc);
    };
  }, [abierto]);

  const ir = (tipo: DestinoNotificacion, agencia: string) => {
    setAbierto(false);
    onIr(tipo, agencia);
  };

  return (
    <div className="relative" ref={caja}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={total ? `${total} pendiente(s) por autorizar` : 'Sin pendientes por autorizar'}
        title={total ? `${total} pendiente(s) por autorizar` : 'Sin pendientes por autorizar'}
        className="relative min-h-[40px] min-w-[40px] rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white flex items-center justify-center cursor-pointer"
      >
        <Bell className={`w-[18px] h-[18px] ${total ? '' : 'opacity-70'}`} />
        {total > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-rose-600 text-white text-[11px] font-black flex items-center justify-center tabular-nums ring-2 ring-slate-900">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {abierto && (
        <div
          role="dialog"
          aria-label="Pendientes por autorizar"
          className="absolute right-0 top-full mt-2 z-50 w-[22rem] max-w-[calc(100vw-24px)] bg-white text-slate-800 rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <b className="text-sm">Pendientes por autorizar</b>
            <span className="text-[11px] text-slate-500">{isAdmin ? 'Todas las agencias' : adminAgencias.join(', ')}</span>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {total === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">No hay nada pendiente por autorizar. 👍</p>}
            {GRUPOS.map((g) => {
              const lista = porTipo[g.tipo];
              if (!lista.length) return null;
              const Icono = g.icono;
              return (
                <section key={g.tipo} className="border-b border-slate-100 last:border-0">
                  <button
                    type="button"
                    onClick={() => ir(g.tipo, lista[0].agencia)}
                    className="w-full px-4 pt-3 pb-1.5 flex items-center gap-2 text-left cursor-pointer hover:bg-slate-50"
                  >
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${g.color}`}>
                      <Icono className="w-4 h-4" />
                    </span>
                    <span className="flex-1 text-xs font-bold text-slate-700">{g.titulo}</span>
                    <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-rose-600 text-white text-[11px] font-black flex items-center justify-center">{lista.length}</span>
                  </button>
                  <ul className="pb-2">
                    {lista.slice(0, 6).map((it) => (
                      <li key={it.id}>
                        <button
                          type="button"
                          onClick={() => ir(it.tipo, it.agencia)}
                          className="w-full px-4 py-1.5 flex items-center gap-2 text-left hover:bg-slate-50 cursor-pointer"
                        >
                          <span className="flex-1 min-w-0">
                            <span className="block text-[12.5px] font-semibold text-slate-800 truncate">{it.titulo}</span>
                            <span className="block text-[11px] text-slate-500 truncate">
                              {it.agencia}
                              {it.detalle ? ` · ${it.detalle}` : ''}
                              {it.fecha ? ` · ${fmtFecha(it.fecha)}` : ''}
                            </span>
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        </button>
                      </li>
                    ))}
                    {lista.length > 6 && (
                      <li>
                        <button type="button" onClick={() => ir(g.tipo, '')} className="px-4 py-1 text-[11.5px] font-semibold text-blue-700 underline cursor-pointer">
                          Ver las {lista.length}
                        </button>
                      </li>
                    )}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
