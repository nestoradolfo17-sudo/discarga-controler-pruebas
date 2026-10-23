import React, { useMemo, useState } from 'react';
import { CheckCircle2, Package, PackageCheck, AlertTriangle, Warehouse, ClipboardList, PackageX } from 'lucide-react';
import type { RouteSummaryMetric } from './modals/DailySummaryModal';
import { calcularCierre, ETIQUETA_CIERRE, textoDias, type EstadoCierre } from '../utils/cierreDia';
import logoDiscarga from '../assets/logo-discarga.png';

// --- Fin de Día: resumen ---
// Indicadores clave corregidos, balance del día (cada ruta en un solo estado),
// lo que queda pendiente para mañana y las devoluciones del día.
// Colores de DISCARGA: azul marino #2C3790 y azul cielo #5AACE4.

const MARINO = '#2C3790';
const CIELO = '#5AACE4';

export const COLOR_CIERRE: Record<EstadoCierre, string> = {
  liquidada: '#0ca30c',
  en_ruta: CIELO,
  abierta: '#5b6bd6',
  sin_despachar: '#eda100',
  piso: '#ec835a',
  bolson: '#d03b3b',
};

const n0 = (v: number) => Math.round(v).toLocaleString('en-US');
const n1 = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (v: number, t: number) => (t > 0 ? `${((v / t) * 100).toFixed(1)}%` : '—');

const Indicador: React.FC<{
  titulo: string;
  icono: React.ReactNode;
  acento: string;
  valor: React.ReactNode;
  sub: React.ReactNode;
  pie?: React.ReactNode;
  progreso?: number | null;
}> = ({ titulo, icono, acento, valor, sub, pie, progreso }) => (
  <div className="relative bg-white rounded-xl border border-slate-200 shadow-sm pl-4 pr-3 py-3 flex flex-col min-h-[132px] overflow-hidden print:shadow-none print:break-inside-avoid">
    <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r" style={{ backgroundColor: acento }} aria-hidden />
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">{titulo}</span>
      <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${acento}1A`, color: acento }}>
        {icono}
      </span>
    </div>
    <div className="mt-1.5 text-[28px] leading-none font-black tabular-nums" style={{ color: MARINO }}>
      {valor}
    </div>
    <div className="mt-1.5 text-xs text-slate-600 leading-snug">{sub}</div>
    {typeof progreso === 'number' && (
      <div className="mt-auto pt-2">
        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, progreso * 100))}%`, backgroundColor: acento }} />
        </div>
      </div>
    )}
    {pie && <div className="mt-auto pt-2 text-[11px] text-slate-500">{pie}</div>}
  </div>
);

export const CierreDiaResumen: React.FC<{
  metrics: RouteSummaryMetric[];
  fecha: string;
  agencia: string;
}> = ({ metrics, fecha, agencia }) => {
  const c = useMemo(() => calcularCierre(metrics), [metrics]);
  const [verTodas, setVerTodas] = useState(false);
  const estados: EstadoCierre[] = ['liquidada', 'en_ruta', 'abierta', 'sin_despachar', 'piso', 'bolson'];
  const pend = verTodas ? c.pendientes : c.pendientes.slice(0, 10);
  const totDev = c.devoluciones.reduce((a, d) => a + d.cajas, 0);
  const hayDev = c.devoluciones.length > 0;

  const th = 'px-3 py-2 text-[10.5px] font-bold uppercase tracking-wider text-white whitespace-nowrap';

  return (
    <div className="space-y-4">
      {/* Encabezado del cierre */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ borderBottom: `3px solid ${CIELO}` }}>
          <img src={logoDiscarga} alt="DISCARGA" className="w-11 h-11 object-contain shrink-0" />
          <div className="mr-auto">
            <h3 className="text-base font-black tracking-tight" style={{ color: MARINO }}>
              Fin de Día · {fecha}
            </h3>
            <p className="text-xs text-slate-500">
              Agencia: <b className="text-slate-700">{agencia}</b> · {n0(c.total)} rutas planificadas · {n0(c.despachables)} despachables (sin piso ni bolsón)
            </p>
          </div>
        </div>
      </div>

      {/* 1. Indicadores clave */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Indicador
          titulo="Rutas liquidadas"
          icono={<CheckCircle2 className="w-4 h-4" />}
          acento={c.cumplimiento === null ? CIELO : c.cumplimiento >= 0.9 ? '#0ca30c' : c.cumplimiento >= 0.7 ? '#eda100' : '#d03b3b'}
          valor={
            <>
              {n0(c.conteo.liquidada)}
              <span className="text-base font-bold text-slate-400"> / {n0(c.despachables)}</span>
            </>
          }
          sub={
            <>
              <b>{c.cumplimiento === null ? '—' : `${(c.cumplimiento * 100).toFixed(1)}%`}</b> de cumplimiento
              {c.conteo.en_ruta + c.conteo.abierta > 0 && <> · {n0(c.conteo.en_ruta + c.conteo.abierta)} siguen en ruta</>}
            </>
          }
          progreso={c.cumplimiento ?? 0}
        />
        <Indicador
          titulo="Cajas despachadas"
          icono={<Package className="w-4 h-4" />}
          acento={CIELO}
          valor={n1(c.cajasDespachadas)}
          sub={
            <>
              de <b>{n1(c.cajasPlan)}</b> planificadas
            </>
          }
          pie={
            <>
              {n1(c.cajasBodega)} en bodega{c.cajasSinDespachar > 0 ? ` · ${n1(c.cajasSinDespachar)} sin despachar` : ''}
            </>
          }
          progreso={c.cajasPlan > 0 ? c.cajasDespachadas / c.cajasPlan : 0}
        />
        <Indicador
          titulo="Efectividad de entrega"
          icono={<PackageCheck className="w-4 h-4" />}
          acento={c.efectividad === null ? '#94a3b8' : c.efectividad >= 0.97 ? '#0ca30c' : c.efectividad >= 0.9 ? '#eda100' : '#d03b3b'}
          valor={c.efectividad === null ? '—' : `${(c.efectividad * 100).toFixed(1)}%`}
          sub={
            c.efectividad === null ? (
              'Sin liquidaciones aún'
            ) : (
              <>
                {n1(c.cjEnt)} CJ entregadas · <span className="text-rose-600">{n1(c.cjDev)} devueltas</span>
              </>
            )
          }
          pie={c.efectividad === null ? undefined : `${n0(c.paradasExitosas)} paradas exitosas${c.cajasAbiertas ? ` · ${n0(c.cajasAbiertas)} caja(s) abierta(s)` : ''}`}
          progreso={c.efectividad}
        />
        <Indicador
          titulo="Atrasadas (+24 h)"
          icono={<AlertTriangle className="w-4 h-4" />}
          acento={c.atrasadas.total ? '#d03b3b' : '#0ca30c'}
          valor={n0(c.atrasadas.total)}
          sub={c.atrasadas.total ? 'sin liquidar desde su fecha planificada' : 'Ninguna ruta atrasada'}
          pie={
            c.atrasadas.total ? (
              <span className="text-rose-700 font-semibold">
                {n0(c.atrasadas.d1)} de 1 día · {n0(c.atrasadas.d2)} de 2–3 días · {n0(c.atrasadas.d3)} de +3 días
              </span>
            ) : undefined
          }
        />
        <Indicador
          titulo="Quedan en bodega"
          icono={<Warehouse className="w-4 h-4" />}
          acento="#ec835a"
          valor={
            <>
              {n0(c.conteo.piso)}
              <span className="text-base font-bold text-slate-400"> rutas</span>
            </>
          }
          sub={`${n1(c.cajasBodega)} CJ pasan a mañana`}
          pie={c.conteo.bolson ? `${n0(c.conteo.bolson)} en bolsón (no salen)` : undefined}
        />
      </div>

      {/* 2. Balance del día */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 print:shadow-none print:break-inside-avoid">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h4 className="text-sm font-black" style={{ color: MARINO }}>
            Balance del día
          </h4>
          <span className="text-[11px] text-slate-500">Cada ruta cuenta una sola vez · suman las {n0(c.total)} planificadas</span>
        </div>
        <div className="flex h-5 w-full rounded-full overflow-hidden bg-slate-100" role="img" aria-label="Balance del día por estado">
          {estados.map((e) =>
            c.conteo[e] > 0 ? (
              <div
                key={e}
                title={`${ETIQUETA_CIERRE[e]}: ${c.conteo[e]} (${pct(c.conteo[e], c.total)})`}
                style={{ width: `${(c.conteo[e] / Math.max(1, c.total)) * 100}%`, backgroundColor: COLOR_CIERRE[e] }}
              />
            ) : null
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {estados.map((e) => (
            <div key={e} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLOR_CIERRE[e] }} aria-hidden />
              <span className="text-[11px] font-semibold text-slate-600 flex-1 truncate">{ETIQUETA_CIERRE[e]}</span>
              <span className="text-sm font-black tabular-nums" style={{ color: MARINO }}>
                {n0(c.conteo[e])}
              </span>
              <span className="text-[10.5px] text-slate-400 tabular-nums w-10 text-right">{pct(c.conteo[e], c.total)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Pendientes para mañana + 4. Devoluciones */}
      <div className={`grid grid-cols-1 gap-4 ${hayDev ? 'xl:grid-cols-3' : ''}`}>
        <div className={`bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none ${hayDev ? 'xl:col-span-2' : ''}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4" style={{ color: MARINO }} />
              <h4 className="text-sm font-black" style={{ color: MARINO }}>
                Pendientes para mañana
              </h4>
              <span className="text-[11px] text-slate-500">
                {n0(c.pendientes.length)} ruta(s) sin liquidar · primero las más atrasadas
              </span>
            </div>
            {c.pendientes.length > 10 && (
              <button
                type="button"
                onClick={() => setVerTodas((v) => !v)}
                className="min-h-[36px] px-3 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer print:hidden"
              >
                {verTodas ? 'Ver solo 10' : `Ver todas (${n0(c.pendientes.length)})`}
              </button>
            )}
          </div>
          {c.pendientes.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500 text-center">Todo liquidado. No quedan rutas pendientes.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead style={{ backgroundColor: MARINO }}>
                  <tr>
                    <th className={`${th} text-left`}>Ruta</th>
                    <th className={`${th} text-left`}>Agencia</th>
                    <th className={`${th} text-left`}>Estado</th>
                    <th className={`${th} text-left`}>Piloto</th>
                    <th className={`${th} text-left`}>Camión</th>
                    <th className={`${th} text-right`}>Cajas</th>
                    <th className={`${th} text-right`}>Antigüedad</th>
                  </tr>
                </thead>
                <tbody>
                  {pend.map((p, i) => (
                    <tr key={p.m.id + '|' + p.m.agencia + '|' + i} className={i % 2 ? 'bg-[#EAF5FC]' : 'bg-white'}>
                      <td className="px-3 py-2 font-mono font-bold whitespace-nowrap" style={{ color: MARINO }}>
                        {p.m.id}
                      </td>
                      <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{p.m.agencia}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLOR_CIERRE[p.estado] }} aria-hidden />
                          {ETIQUETA_CIERRE[p.estado]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-700 max-w-[220px] truncate" title={p.piloto}>
                        {p.piloto}
                      </td>
                      <td className="px-3 py-2 text-slate-600 font-mono whitespace-nowrap">{p.camion}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{n1(p.m.cajasFisicasPlan)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-bold whitespace-nowrap ${p.dias > 3 ? 'text-rose-700' : p.dias >= 1 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {textoDias(p.dias)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {hayDev && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden print:shadow-none print:break-inside-avoid">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
              <PackageX className="w-4 h-4 text-rose-600" />
              <h4 className="text-sm font-black" style={{ color: MARINO }}>
                Devoluciones del día
              </h4>
            </div>
            <table className="w-full text-xs">
              <thead style={{ backgroundColor: MARINO }}>
                <tr>
                  <th className={`${th} text-left`}>Motivo</th>
                  <th className={`${th} text-right`}>Rutas</th>
                  <th className={`${th} text-right`}>CJ</th>
                  <th className={`${th} text-right`}>%</th>
                </tr>
              </thead>
              <tbody>
                {c.devoluciones.map((d, i) => (
                  <tr key={d.motivo} className={i % 2 ? 'bg-[#EAF5FC]' : 'bg-white'}>
                    <td className="px-3 py-2 text-slate-700">{d.motivo}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{n0(d.rutas)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{n1(d.cajas)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-rose-700">{pct(d.cajas, totDev)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#D6E4F5] font-black" style={{ color: MARINO }}>
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{n0(c.devoluciones.reduce((a, d) => a + d.rutas, 0))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{n1(totDev)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
