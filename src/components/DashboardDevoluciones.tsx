import React, { useMemo, useState } from 'react';
import { Route } from '../types';
import { formatDateToGuatemala } from '../utils/date';
import { getRouteKey } from '../utils/routeKey';
import { toNum } from '../utils/number';
import { loadXLSX, formatoMiles } from '../utils/excel';
import { FileDown, PackageX, X } from 'lucide-react';

// --- Rutas con mayor devolución (Dashboard de Despacho) ---
// Agrupa por ruta (ID + agencia) las liquidaciones del periodo elegido que
// tuvieron cajas devueltas. Doble clic en una ruta abre su detalle día por
// día (fecha, piloto, motivo…) y todo se puede descargar en Excel.

const C_CRIT = '#d03b3b';
const C_SERIOUS = '#ec835a';

const n0 = (v: number) => Math.round(v).toLocaleString('en-US');
const n1 = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 1 });
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const colorPct = (v: number) => (v >= 0.2 ? C_CRIT : v >= 0.1 ? C_SERIOUS : undefined);

const diaDe = (r: Route) => {
  const raw = r.fechaOriginalRuta || r.fecha;
  return raw ? formatDateToGuatemala(raw) : '';
};
const ordenFecha = (d: string) => d.split('/').reverse().join('');

export interface DevolucionDia {
  r: Route;
  fecha: string;
  viaje: number;
  piloto: string;
  auxiliares: string;
  placa: string;
  salida: number;
  entregadas: number;
  devueltas: number;
  pctDev: number;
  motivos: string[];
  detalleMotivo: string;
  comentario: string;
  auditor: string;
  paradas: number;
  rechazadas: number;
  clientes: { codigo: string; nombre: string; motivo: string; cajas?: number }[];
}

interface RutaDevolucion {
  key: string;
  ruta: string;
  agencia: string;
  segmento: string;
  dias: DevolucionDia[]; // solo los días con devolución
  diasLiquidados: number;
  salida: number;
  devueltas: number;
  pctDev: number;
  motivoPrincipal: string;
  pilotos: string[];
}

const aDia = (r: Route): DevolucionDia => {
  const l = r.liquidacion!;
  const dev = Number(l.cajasDevueltas || 0);
  const ent = Number(l.cajasEntregadas || 0);
  const a = r.asignacion;
  return {
    r,
    fecha: diaDe(r),
    viaje: r.tripNumber || 1,
    piloto: a?.conductor || '',
    auxiliares: [a?.auxiliar1, a?.auxiliar2, a?.auxiliar3, a?.auxiliar4].filter(Boolean).join(', '),
    placa: a?.camionPlaca || '',
    salida: toNum(r.cajasOriginales || r.cajasFisicas) || ent + dev,
    entregadas: ent,
    devueltas: dev,
    pctDev: ent + dev > 0 ? dev / (ent + dev) : 0,
    motivos: (l.motivosSeleccionados?.length ? l.motivosSeleccionados : [l.motivoDevolucion || r.motivoDevolucion || 'Sin motivo registrado']).map(String),
    detalleMotivo: l.motivoDetalle || '',
    comentario: l.comentario || '',
    auditor: l.auditor || '',
    paradas: Number(r.paradas || 0) || 0,
    rechazadas: Number(l.guiasRechazadas || 0) || 0,
    clientes: l.clientesPendientes || [],
  };
};

// Filas de Excel (una por ruta y día con devolución).
const filasDetalle = (dias: DevolucionDia[]) =>
  dias.map((d) => ({
    Ruta: String(d.r.id),
    Viaje: d.viaje,
    Fecha: d.fecha,
    Agencia: d.r.agencia || '',
    Segmento: d.r.segmento || '',
    Piloto: d.piloto,
    Auxiliares: d.auxiliares,
    Placa: d.placa,
    'CJ salida': d.salida,
    'CJ entregadas': d.entregadas,
    'CJ devueltas': d.devueltas,
    '% devolución': Number((d.pctDev * 100).toFixed(1)),
    'Paradas': d.paradas,
    'Paradas rechazadas': d.rechazadas,
    'Motivo(s) de rechazo': d.motivos.join(' | '),
    'Detalle del motivo': d.detalleMotivo,
    Comentario: d.comentario,
    'Liquidó / auditor': d.auditor,
    'Clientes con rechazo': d.clientes.map((c) => `${c.codigo} ${c.nombre} (${c.motivo}${c.cajas ? `, ${c.cajas} CJ` : ''})`).join(' | '),
  }));

const filasClientes = (dias: DevolucionDia[]) =>
  dias.flatMap((d) =>
    d.clientes.map((c) => ({
      Ruta: String(d.r.id),
      Fecha: d.fecha,
      Agencia: d.r.agencia || '',
      Piloto: d.piloto,
      'Código cliente': String(c.codigo || ''),
      Cliente: c.nombre || '',
      Motivo: c.motivo || '',
      Cajas: Number(c.cajas || 0),
    }))
  );

const ancho = (filas: Record<string, unknown>[]) =>
  filas.length
    ? Object.keys(filas[0]).map((k) => ({ wch: Math.min(45, Math.max(k.length + 2, ...filas.slice(0, 200).map((f) => String(f[k] ?? '').length + 1))) }))
    : [];

async function descargarExcel(nombre: string, rutas: RutaDevolucion[] | null, dias: DevolucionDia[], periodo: string) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  if (rutas) {
    const resumen = rutas.map((x, i) => ({
      '#': i + 1,
      Ruta: x.ruta,
      Agencia: x.agencia,
      Segmento: x.segmento,
      'Días con devolución': x.dias.length,
      'Días liquidados': x.diasLiquidados,
      'CJ salida': Number(x.salida.toFixed(3)),
      'CJ devueltas': Number(x.devueltas.toFixed(3)),
      '% devolución': Number((x.pctDev * 100).toFixed(1)),
      'Motivo principal': x.motivoPrincipal,
      Pilotos: x.pilotos.join(', '),
    }));
    const ws = XLSX.utils.json_to_sheet(resumen);
    ws['!cols'] = ancho(resumen);
    XLSX.utils.book_append_sheet(wb, ws, 'Rutas');
  }
  const det = filasDetalle(dias);
  const wsD = XLSX.utils.json_to_sheet(det.length ? det : [{ Aviso: 'Sin devoluciones en el periodo' }]);
  wsD['!cols'] = ancho(det);
  XLSX.utils.book_append_sheet(wb, wsD, 'Detalle por día');
  const cli = filasClientes(dias);
  if (cli.length) {
    const wsC = XLSX.utils.json_to_sheet(cli);
    wsC['!cols'] = ancho(cli);
    XLSX.utils.book_append_sheet(wb, wsC, 'Clientes con rechazo');
  }
  const info = [{ Reporte: 'Rutas con mayor devolución', Periodo: periodo, Generado: formatDateToGuatemala(new Date()) }];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(info), 'Info');
  formatoMiles(wb);
  XLSX.writeFile(wb, `${nombre.replace(/[\\/:*?"<>|]+/g, '-')}.xlsx`);
}

export const DashboardDevoluciones: React.FC<{ liquidadas: Route[]; periodLabel: string }> = ({ liquidadas, periodLabel }) => {
  const [orden, setOrden] = useState<'cj' | 'pct' | 'dias'>('cj');
  const [verTodas, setVerTodas] = useState(false);
  const [abierta, setAbierta] = useState<RutaDevolucion | null>(null);

  const rutas = useMemo(() => {
    const m = new Map<string, { base: Route; todos: DevolucionDia[] }>();
    liquidadas.forEach((r) => {
      if (!r.liquidacion) return;
      const k = `${r.id}|${r.agencia || ''}`;
      const x = m.get(k) || { base: r, todos: [] as DevolucionDia[] };
      x.todos.push(aDia(r));
      m.set(k, x);
    });
    const out: RutaDevolucion[] = [];
    m.forEach(({ base, todos }, key) => {
      const dias = todos.filter((d) => d.devueltas > 0).sort((a, b) => ordenFecha(b.fecha).localeCompare(ordenFecha(a.fecha)) || b.viaje - a.viaje);
      if (!dias.length) return;
      const devueltas = todos.reduce((a, d) => a + d.devueltas, 0);
      const entregadas = todos.reduce((a, d) => a + d.entregadas, 0);
      const salida = todos.reduce((a, d) => a + d.salida, 0);
      const porMotivo = new Map<string, number>();
      dias.forEach((d) => d.motivos.forEach((mo) => porMotivo.set(mo, (porMotivo.get(mo) || 0) + d.devueltas / d.motivos.length)));
      const motivoPrincipal = Array.from(porMotivo.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      out.push({
        key,
        ruta: String(base.id),
        agencia: base.agencia || '',
        segmento: (base.segmento || '').toUpperCase(),
        dias,
        diasLiquidados: new Set(todos.map((d) => getRouteKey(d.r) + d.viaje)).size,
        salida,
        devueltas,
        pctDev: entregadas + devueltas > 0 ? devueltas / (entregadas + devueltas) : 0,
        motivoPrincipal,
        pilotos: Array.from(new Set(dias.map((d) => d.piloto).filter(Boolean))),
      });
    });
    return out.sort((a, b) =>
      orden === 'pct' ? b.pctDev - a.pctDev || b.devueltas - a.devueltas : orden === 'dias' ? b.dias.length - a.dias.length || b.devueltas - a.devueltas : b.devueltas - a.devueltas
    );
  }, [liquidadas, orden]);

  const totalDev = rutas.reduce((a, x) => a + x.devueltas, 0);
  const visibles = verTodas ? rutas : rutas.slice(0, 15);
  const th = 'py-2 px-1 text-[10.5px] uppercase tracking-wide text-slate-500';

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <PackageX className="w-4 h-4 text-slate-500" />
            Rutas con mayor devolución
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {periodLabel} · {n0(rutas.length)} ruta(s) con devolución · {n1(totalDev)} CJ devueltas
            <span data-no-pdf> · doble clic en una ruta para ver el detalle</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-no-pdf>
          <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
            Ordenar por
            <select value={orden} onChange={(e) => setOrden(e.target.value as typeof orden)} className="min-h-[36px] px-2 border border-slate-300 rounded-lg bg-white text-xs">
              <option value="cj">CJ devueltas</option>
              <option value="pct">% de devolución</option>
              <option value="dias">Días con devolución</option>
            </select>
          </label>
          <button
            type="button"
            disabled={!rutas.length}
            onClick={() => void descargarExcel(`Rutas_mayor_devolucion_${periodLabel}`, rutas, rutas.flatMap((x) => x.dias), periodLabel)}
            className="min-h-[36px] px-3 rounded-lg border border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <FileDown className="w-3.5 h-3.5" /> Descargar Excel
          </button>
        </div>
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className={`${th} text-left`}>#</th>
              <th className={`${th} text-left`}>Ruta</th>
              <th className={`${th} text-left`}>Agencia · segmento</th>
              <th className={`${th} text-right`}>Días con dev.</th>
              <th className={`${th} text-right`}>CJ salida</th>
              <th className={`${th} text-right`}>CJ devueltas</th>
              <th className={`${th} text-right`}>% dev.</th>
              <th className={`${th} text-left`}>Motivo principal</th>
              <th className={`${th} text-left`}>Piloto(s)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibles.map((x, i) => (
              <tr
                key={x.key}
                tabIndex={0}
                onDoubleClick={() => setAbierta(x)}
                onKeyDown={(e) => e.key === 'Enter' && setAbierta(x)}
                className="hover:bg-slate-50 cursor-pointer select-none"
                title="Doble clic para ver el detalle"
              >
                <td className="py-2 px-1 text-slate-400 tabular-nums">{i + 1}</td>
                <td className="py-2 px-1 font-mono font-bold text-slate-900 whitespace-nowrap">
                  {x.ruta}
                  <button type="button" data-no-pdf onClick={() => setAbierta(x)} className="ml-2 text-[10px] font-sans font-semibold text-blue-700 underline cursor-pointer">
                    ver
                  </button>
                </td>
                <td className="py-2 px-1 text-slate-700">
                  <span className="font-semibold">{x.agencia}</span>
                  {x.segmento ? <span className="text-slate-400"> · {x.segmento}</span> : null}
                </td>
                <td className="py-2 px-1 text-right tabular-nums">
                  {n0(x.dias.length)}
                  <span className="text-slate-400"> / {n0(x.diasLiquidados)}</span>
                </td>
                <td className="py-2 px-1 text-right tabular-nums">{n1(x.salida)}</td>
                <td className="py-2 px-1 text-right tabular-nums font-bold">{n1(x.devueltas)}</td>
                <td className="py-2 px-1 text-right tabular-nums font-bold" style={{ color: colorPct(x.pctDev) }}>
                  {pct(x.pctDev)}
                </td>
                <td className="py-2 px-1 text-slate-700">{x.motivoPrincipal}</td>
                <td className="py-2 px-1 text-slate-600 max-w-[220px] truncate" title={x.pilotos.join(', ')}>
                  {x.pilotos.join(', ') || '—'}
                </td>
              </tr>
            ))}
            {rutas.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-slate-500">
                  Sin devoluciones en el periodo. 👍
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rutas.length > 15 && (
        <button type="button" data-no-pdf onClick={() => setVerTodas((v) => !v)} className="mt-2 text-xs font-semibold text-blue-700 underline cursor-pointer">
          {verTodas ? 'Ver solo las 15 principales' : `Ver las ${n0(rutas.length)} rutas`}
        </button>
      )}

      {abierta && <DetalleRutaModal ruta={abierta} periodLabel={periodLabel} onClose={() => setAbierta(null)} />}
    </section>
  );
};

const DetalleRutaModal: React.FC<{ ruta: RutaDevolucion; periodLabel: string; onClose: () => void }> = ({ ruta, periodLabel, onClose }) => {
  const clientes = ruta.dias.flatMap((d) => d.clientes.map((c) => ({ ...c, fecha: d.fecha })));
  return (
    <div data-no-pdf className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-3" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de devoluciones de la ruta ${ruta.ruta}`}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-black text-slate-900">
              Ruta <span className="font-mono">{ruta.ruta}</span> · {ruta.agencia}
              {ruta.segmento ? <span className="text-slate-400 font-semibold"> · {ruta.segmento}</span> : null}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {periodLabel} · {n0(ruta.dias.length)} día(s) con devolución de {n0(ruta.diasLiquidados)} liquidado(s) · {n1(ruta.devueltas)} CJ devueltas ·{' '}
              <b style={{ color: colorPct(ruta.pctDev) }}>{pct(ruta.pctDev)}</b> de devolución
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void descargarExcel(`Devoluciones_ruta_${ruta.ruta}_${ruta.agencia}_${periodLabel}`, null, ruta.dias, periodLabel)}
              className="min-h-[38px] px-3 rounded-lg border border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <FileDown className="w-3.5 h-3.5" /> Descargar Excel
            </button>
            <button type="button" onClick={onClose} aria-label="Cerrar" autoFocus className="min-h-[38px] min-w-[38px] rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="overflow-auto p-4 space-y-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[10.5px] uppercase tracking-wide text-slate-500">
                <th className="text-left py-2 px-1">Fecha</th>
                <th className="text-left py-2 px-1">Piloto · placa</th>
                <th className="text-right py-2 px-1">CJ salida</th>
                <th className="text-right py-2 px-1">CJ entreg.</th>
                <th className="text-right py-2 px-1">CJ dev.</th>
                <th className="text-right py-2 px-1">% dev.</th>
                <th className="text-right py-2 px-1">Paradas rech.</th>
                <th className="text-left py-2 px-1">Motivo del rechazo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ruta.dias.map((d) => (
                <tr key={getRouteKey(d.r) + '|' + d.viaje} className="align-top">
                  <td className="py-2 px-1 whitespace-nowrap font-semibold text-slate-800">
                    {d.fecha}
                    {d.viaje > 1 ? <span className="text-slate-400 font-normal"> · V{d.viaje}</span> : null}
                  </td>
                  <td className="py-2 px-1 text-slate-700">
                    {d.piloto || '—'}
                    {d.placa ? <span className="text-slate-400"> · {d.placa}</span> : null}
                    {d.auxiliares ? <span className="block text-[10.5px] text-slate-400">Aux.: {d.auxiliares}</span> : null}
                  </td>
                  <td className="py-2 px-1 text-right tabular-nums">{n1(d.salida)}</td>
                  <td className="py-2 px-1 text-right tabular-nums">{n1(d.entregadas)}</td>
                  <td className="py-2 px-1 text-right tabular-nums font-bold">{n1(d.devueltas)}</td>
                  <td className="py-2 px-1 text-right tabular-nums font-bold" style={{ color: colorPct(d.pctDev) }}>
                    {pct(d.pctDev)}
                  </td>
                  <td className="py-2 px-1 text-right tabular-nums">
                    {n0(d.rechazadas)}
                    {d.paradas ? <span className="text-slate-400"> / {n0(d.paradas)}</span> : null}
                  </td>
                  <td className="py-2 px-1 text-slate-700">
                    <b>{d.motivos.join(' · ')}</b>
                    {d.detalleMotivo ? <span className="block text-slate-500 italic">“{d.detalleMotivo}”</span> : null}
                    {d.comentario ? <span className="block text-slate-500">Comentario: {d.comentario}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {clientes.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Clientes con rechazo ({n0(clientes.length)})</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[10.5px] uppercase tracking-wide text-slate-500">
                    <th className="text-left py-1.5 px-1">Fecha</th>
                    <th className="text-left py-1.5 px-1">Código</th>
                    <th className="text-left py-1.5 px-1">Cliente</th>
                    <th className="text-left py-1.5 px-1">Motivo</th>
                    <th className="text-right py-1.5 px-1">Cajas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {clientes.map((c, i) => (
                    <tr key={c.fecha + c.codigo + i}>
                      <td className="py-1.5 px-1 whitespace-nowrap">{c.fecha}</td>
                      <td className="py-1.5 px-1 font-mono text-slate-600">{c.codigo}</td>
                      <td className="py-1.5 px-1">{c.nombre}</td>
                      <td className="py-1.5 px-1">{c.motivo}</td>
                      <td className="py-1.5 px-1 text-right tabular-nums">{c.cajas ? n1(c.cajas) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
