import React, { useMemo, useState } from 'react';
import { Route } from '../types';
import { parseFlexibleDate, formatDateToGuatemala, formatDateTimeToGuatemala } from '../utils/date';
import { getRouteKey } from '../utils/routeKey';
import { toNum } from '../utils/number';
import { loadXLSX } from '../utils/excel';
import { Lock, RotateCcw, Clock, Download, AlertTriangle } from 'lucide-react';

// --- Dashboard de SEGUIMIENTO: Cajas Abiertas y Rutas Abiertas ---
// Lo que sigue pendiente de cerrar y cuánto tiempo lleva así, para darle
// seguimiento diario y reportarlo (Excel con resumen + detalle).
//  - Caja Abierta: ruta liquidada cuya caja/boleta sigue sin validar
//    (liquidacion.cajaAbierta y sin Liquidación Final). Saldo = diferencia − abonos.
//  - Ruta Abierta: ruta que regresó con devolución y espera volver a salir
//    (estado "Abierta"). El tiempo cuenta desde su último retorno.

interface Props {
  routes: Route[]; // rutas del tablero (respeta agencia y permisos)
  liquidatedRoutes: Route[]; // liquidadas (respeta agencia y permisos)
  selectedAgency: string;
  historyLimitedDays?: number;
  onLoadFullHistory?: () => void;
  isLoadingFullHistory?: boolean;
}

type Rango = '0-1' | '2-3' | '4-7' | '8+';
const RANGOS: { k: Rango; label: string; color: string; bg: string }[] = [
  { k: '0-1', label: '0–1 día', color: '#0ca30c', bg: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  { k: '2-3', label: '2–3 días', color: '#eda100', bg: 'bg-amber-50 text-amber-800 border-amber-200' },
  { k: '4-7', label: '4–7 días', color: '#ec835a', bg: 'bg-orange-50 text-orange-800 border-orange-200' },
  { k: '8+', label: 'Más de 7 días', color: '#d03b3b', bg: 'bg-rose-50 text-rose-800 border-rose-200' },
];
const rangoDe = (dias: number): Rango => (dias <= 1 ? '0-1' : dias <= 3 ? '2-3' : dias <= 7 ? '4-7' : '8+');
const infoRango = (r: Rango) => RANGOS.find((x) => x.k === r)!;

const DIA = 86400000;
// Días calendario (hoy = 0, ayer = 1…), no horas: así "liquidada el lunes" es
// siempre el mismo número de días durante todo el día.
const soloFecha = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const diasDesde = (d: Date | null) => (d ? Math.max(0, Math.round((soloFecha(new Date()) - soloFecha(d)) / DIA)) : 0);
const q = (n: number) => `Q ${n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const n1 = (n: number) => n.toLocaleString('es-GT', { maximumFractionDigits: 1 });

interface FilaCaja {
  key: string;
  id: string;
  agencia: string;
  segmento: string;
  fechaRuta: string;
  fechaLiq: string;
  dias: number;
  rango: Rango;
  motivo: string;
  monto: number;
  abonado: number;
  saldo: number;
  abonos: number;
  ultimoAbono: string;
  piloto: string;
  placa: string;
  clientesPend: number;
  comentario: string;
}

interface FilaRuta {
  key: string;
  id: string;
  agencia: string;
  segmento: string;
  fechaRuta: string;
  desde: string;
  dias: number;
  rango: Rango;
  retornos: number;
  cajas: number;
  paradas: number;
  motivo: string;
  ultimoPiloto: string;
  ultimaPlaca: string;
  clientesPend: number;
}

export const DashboardSeguimiento: React.FC<Props> = ({
  routes,
  liquidatedRoutes,
  selectedAgency,
  historyLimitedDays,
  onLoadFullHistory,
  isLoadingFullHistory,
}) => {
  const [agencia, setAgencia] = useState('TODAS');
  const [rangoFiltro, setRangoFiltro] = useState<Rango | ''>('');
  const [busca, setBusca] = useState('');

  const cajas = useMemo<FilaCaja[]>(() => {
    const vistos = new Map<string, Route>();
    liquidatedRoutes.forEach((r) => {
      const l = r.liquidacion;
      if (l?.cajaAbierta && !l.cajaAbiertaResuelta) vistos.set(getRouteKey(r), r);
    });
    return Array.from(vistos.values())
      .map((r) => {
        const l = r.liquidacion!;
        const fLiq = parseFlexibleDate(l.fechaLiquidacion || r.fechaLiquidacion);
        const dias = diasDesde(fLiq);
        const monto = toNum(l.montoDiferenciaCaja);
        const abonos = l.abonosCaja || [];
        const abonado = abonos.reduce((a, x) => a + toNum(x.monto), 0);
        const asig = r.asignacion || r.ultimoDespacho;
        return {
          key: getRouteKey(r),
          id: String(r.id),
          agencia: r.agencia || '-',
          segmento: r.segmento || '-',
          fechaRuta: formatDateToGuatemala(r.fechaOriginalRuta || r.fecha) || '-',
          fechaLiq: formatDateTimeToGuatemala(l.fechaLiquidacion || r.fechaLiquidacion) || '-',
          dias,
          rango: rangoDe(dias),
          motivo: l.motivoCajaAbierta || '-',
          monto,
          abonado,
          saldo: Math.max(0, monto - abonado),
          abonos: abonos.length,
          ultimoAbono: abonos.length ? abonos[abonos.length - 1].fecha : '',
          piloto: asig?.conductor || '-',
          placa: asig?.camionPlaca || '-',
          clientesPend: l.clientesPendientes?.length || 0,
          comentario: l.comentario || '',
        };
      })
      .sort((a, b) => b.dias - a.dias || b.saldo - a.saldo);
  }, [liquidatedRoutes]);

  const rutas = useMemo<FilaRuta[]>(() => {
    return routes
      .filter((r) => r.estado === 'Abierta')
      .map((r) => {
        const hist = r.historialDespachos || [];
        const ult = hist[hist.length - 1];
        const fDesde =
          parseFlexibleDate(ult?.fechaRetorno) ||
          parseFlexibleDate(r.fechaAsignacion || r.ultimoDespacho?.fechaAsignacion) ||
          parseFlexibleDate(r.fecha);
        const dias = diasDesde(fDesde);
        return {
          key: getRouteKey(r),
          id: String(r.id),
          agencia: r.agencia || '-',
          segmento: r.segmento || '-',
          fechaRuta: formatDateToGuatemala(r.fechaOriginalRuta || r.fecha) || '-',
          desde: fDesde ? formatDateTimeToGuatemala(fDesde) : '-',
          dias,
          rango: rangoDe(dias),
          retornos: r.retornosCount || hist.length || 1,
          cajas: toNum(r.cajasFisicas),
          paradas: Number(r.paradas) || 0,
          motivo: ult?.motivoDevolucion || r.motivoDevolucion || '-',
          ultimoPiloto: ult?.conductor || r.ultimoDespacho?.conductor || '-',
          ultimaPlaca: ult?.camionPlaca || r.ultimoDespacho?.camionPlaca || '-',
          clientesPend: r.clientesRuta?.length || 0,
        };
      })
      .sort((a, b) => b.dias - a.dias || b.cajas - a.cajas);
  }, [routes]);

  const agencias = useMemo(
    () => Array.from(new Set([...cajas.map((c) => c.agencia), ...rutas.map((r) => r.agencia)])).sort((a, b) => a.localeCompare(b, 'es')),
    [cajas, rutas]
  );

  const pasa = (f: { agencia: string; rango: Rango; id: string; piloto?: string; ultimoPiloto?: string; motivo: string }) => {
    if (agencia !== 'TODAS' && f.agencia !== agencia) return false;
    if (rangoFiltro && f.rango !== rangoFiltro) return false;
    const t = busca.trim().toLowerCase();
    if (!t) return true;
    return [f.id, f.piloto, f.ultimoPiloto, f.motivo].some((v) => String(v || '').toLowerCase().includes(t));
  };
  const cajasF = cajas.filter(pasa);
  const rutasF = rutas.filter(pasa);

  const prom = (arr: { dias: number }[]) => (arr.length ? arr.reduce((a, x) => a + x.dias, 0) / arr.length : 0);
  const kpi = {
    cajas: cajasF.length,
    saldo: cajasF.reduce((a, x) => a + x.saldo, 0),
    cajasProm: prom(cajasF),
    cajasMax: cajasF[0]?.dias || 0,
    rutas: rutasF.length,
    cajasPend: rutasF.reduce((a, x) => a + x.cajas, 0),
    rutasProm: prom(rutasF),
    rutasMax: rutasF[0]?.dias || 0,
    criticas: cajasF.filter((x) => x.rango === '8+').length + rutasF.filter((x) => x.rango === '8+').length,
  };

  // Antigüedad (las dos listas juntas, respetando agencia y búsqueda pero no el rango).
  const sinRango = (f: Parameters<typeof pasa>[0]) => pasa({ ...f, rango: rangoFiltro || f.rango });
  const antig = RANGOS.map((r) => ({
    ...r,
    cajas: cajas.filter((x) => sinRango(x) && x.rango === r.k).length,
    rutas: rutas.filter((x) => sinRango(x) && x.rango === r.k).length,
  }));
  const antigMax = Math.max(1, ...antig.map((a) => a.cajas + a.rutas));

  const porAgencia = (() => {
    const m = new Map<string, { ca: number; saldo: number; caMax: number; ra: number; cj: number; raMax: number }>();
    const get = (ag: string) => {
      if (!m.has(ag)) m.set(ag, { ca: 0, saldo: 0, caMax: 0, ra: 0, cj: 0, raMax: 0 });
      return m.get(ag)!;
    };
    cajasF.forEach((c) => {
      const g = get(c.agencia);
      g.ca++;
      g.saldo += c.saldo;
      g.caMax = Math.max(g.caMax, c.dias);
    });
    rutasF.forEach((r) => {
      const g = get(r.agencia);
      g.ra++;
      g.cj += r.cajas;
      g.raMax = Math.max(g.raMax, r.dias);
    });
    return Array.from(m.entries())
      .map(([ag, v]) => ({ ag, ...v }))
      .sort((a, b) => b.ca + b.ra - (a.ca + a.ra) || Math.max(b.caMax, b.raMax) - Math.max(a.caMax, a.raMax));
  })();

  const exportar = async () => {
    const XLSX = await loadXLSX();
    const hoy = formatDateToGuatemala(new Date());
    const wb = XLSX.utils.book_new();
    const resumen = [
      { Indicador: 'Fecha del reporte', Valor: formatDateTimeToGuatemala(new Date()) },
      { Indicador: 'Agencia', Valor: agencia !== 'TODAS' ? agencia : selectedAgency !== 'TODAS' ? selectedAgency : 'Todas' },
      { Indicador: 'Cajas abiertas', Valor: kpi.cajas },
      { Indicador: 'Saldo pendiente cajas abiertas (Q)', Valor: Number(kpi.saldo.toFixed(2)) },
      { Indicador: 'Días promedio caja abierta', Valor: Number(kpi.cajasProm.toFixed(1)) },
      { Indicador: 'Caja abierta más antigua (días)', Valor: kpi.cajasMax },
      { Indicador: 'Rutas abiertas', Valor: kpi.rutas },
      { Indicador: 'Cajas pendientes en rutas abiertas', Valor: Number(kpi.cajasPend.toFixed(3)) },
      { Indicador: 'Días promedio ruta abierta', Valor: Number(kpi.rutasProm.toFixed(1)) },
      { Indicador: 'Ruta abierta más antigua (días)', Valor: kpi.rutasMax },
      { Indicador: 'Casos con más de 7 días', Valor: kpi.criticas },
      ...(historyLimitedDays ? [{ Indicador: 'Nota', Valor: `Cajas abiertas de los últimos ${historyLimitedDays} días cargados` }] : []),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen');
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        porAgencia.map((a) => ({
          Agencia: a.ag,
          'Cajas abiertas': a.ca,
          'Saldo (Q)': Number(a.saldo.toFixed(2)),
          'Caja más antigua (días)': a.caMax,
          'Rutas abiertas': a.ra,
          'Cajas pendientes': Number(a.cj.toFixed(3)),
          'Ruta más antigua (días)': a.raMax,
        }))
      ),
      'Por agencia'
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        cajasF.map((c) => ({
          Ruta: c.id,
          Agencia: c.agencia,
          Segmento: c.segmento,
          'Fecha ruta': c.fechaRuta,
          'Fecha liquidación': c.fechaLiq,
          'Días abierta': c.dias,
          Antigüedad: infoRango(c.rango).label,
          Motivo: c.motivo,
          'Diferencia (Q)': Number(c.monto.toFixed(2)),
          'Abonado (Q)': Number(c.abonado.toFixed(2)),
          'Saldo (Q)': Number(c.saldo.toFixed(2)),
          Abonos: c.abonos,
          'Último abono': c.ultimoAbono,
          Piloto: c.piloto,
          Camión: c.placa,
          'Clientes pendientes': c.clientesPend,
          Comentario: c.comentario,
        }))
      ),
      'Cajas abiertas'
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        rutasF.map((r) => ({
          Ruta: r.id,
          Agencia: r.agencia,
          Segmento: r.segmento,
          'Fecha ruta': r.fechaRuta,
          'Abierta desde': r.desde,
          'Días abierta': r.dias,
          Antigüedad: infoRango(r.rango).label,
          Retornos: r.retornos,
          'Cajas pendientes': Number(r.cajas.toFixed(3)),
          'Paradas pendientes': r.paradas,
          Motivo: r.motivo,
          'Último piloto': r.ultimoPiloto,
          'Último camión': r.ultimaPlaca,
          'Clientes pendientes': r.clientesPend,
        }))
      ),
      'Rutas abiertas'
    );
    XLSX.writeFile(wb, `Seguimiento_Cajas_y_Rutas_Abiertas_${hoy.replace(/\//g, '-')}.xlsx`);
  };

  const Chip: React.FC<{ r: Rango; dias: number }> = ({ r, dias }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold whitespace-nowrap ${infoRango(r).bg}`}>
      <Clock className="w-3 h-3" />
      {dias === 0 ? 'Hoy' : `${dias} día${dias === 1 ? '' : 's'}`}
    </span>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h2 className="text-lg font-bold text-slate-800">Seguimiento de Cajas y Rutas Abiertas</h2>
          <p className="text-xs text-slate-400">
            Lo que sigue pendiente de cerrar y cuánto tiempo lleva así
            {selectedAgency !== 'TODAS' ? ` · Agencia: ${selectedAgency}` : ''}
          </p>
        </div>
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar ruta, piloto, motivo…"
          aria-label="Buscar ruta, piloto o motivo"
          className="min-h-[40px] w-56 px-3 text-xs bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={agencia}
          onChange={(e) => setAgencia(e.target.value)}
          aria-label="Agencia"
          className={`min-h-[40px] px-2 text-xs font-semibold rounded-lg border cursor-pointer ${
            agencia !== 'TODAS' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-300'
          }`}
        >
          <option value="TODAS">Todas las agencias</option>
          {agencias.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void exportar()}
          className="min-h-[40px] px-3 text-xs font-bold rounded-lg border border-emerald-300 text-emerald-800 bg-white hover:bg-emerald-50 inline-flex items-center gap-1.5 cursor-pointer"
          title="Descargar Excel con resumen, por agencia y detalle"
        >
          <Download className="w-4 h-4" /> Reporte Excel
        </button>
      </div>

      {historyLimitedDays && onLoadFullHistory && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-sky-900 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
          <span>
            Las cajas abiertas se buscan en las liquidaciones de los <b>últimos {historyLimitedDays} días</b>. Para incluir
            cajas más antiguas:
          </span>
          <button
            type="button"
            onClick={onLoadFullHistory}
            disabled={isLoadingFullHistory}
            className="min-h-[32px] px-2.5 rounded-lg border border-sky-300 bg-white font-semibold text-sky-800 cursor-pointer disabled:opacity-60"
          >
            {isLoadingFullHistory ? 'Cargando…' : 'Cargar historial completo'}
          </button>
        </div>
      )}

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-amber-200 rounded-2xl p-4 shadow-sm">
          <p className="text-[10.5px] font-semibold text-amber-800 uppercase tracking-wide flex items-center gap-1">
            <Lock className="w-3.5 h-3.5" /> Cajas abiertas
          </p>
          <p className="text-2xl font-bold text-slate-900">{kpi.cajas}</p>
          <p className="text-[11px] text-slate-500">Saldo pendiente {q(kpi.saldo)}</p>
        </div>
        <div className="bg-white border border-amber-200 rounded-2xl p-4 shadow-sm">
          <p className="text-[10.5px] font-semibold text-amber-800 uppercase tracking-wide">Tiempo cajas abiertas</p>
          <p className="text-2xl font-bold text-slate-900">{n1(kpi.cajasProm)} días</p>
          <p className="text-[11px] text-slate-500">promedio · la más antigua {kpi.cajasMax} días</p>
        </div>
        <div className="bg-white border border-indigo-200 rounded-2xl p-4 shadow-sm">
          <p className="text-[10.5px] font-semibold text-indigo-800 uppercase tracking-wide flex items-center gap-1">
            <RotateCcw className="w-3.5 h-3.5" /> Rutas abiertas
          </p>
          <p className="text-2xl font-bold text-slate-900">{kpi.rutas}</p>
          <p className="text-[11px] text-slate-500">{n1(kpi.cajasPend)} cajas por volver a salir</p>
        </div>
        <div className="bg-white border border-indigo-200 rounded-2xl p-4 shadow-sm">
          <p className="text-[10.5px] font-semibold text-indigo-800 uppercase tracking-wide">Tiempo rutas abiertas</p>
          <p className="text-2xl font-bold text-slate-900">{n1(kpi.rutasProm)} días</p>
          <p className="text-[11px] text-slate-500">promedio · la más antigua {kpi.rutasMax} días</p>
        </div>
      </div>

      {kpi.criticas > 0 && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3 py-2 text-xs font-semibold">
          <AlertTriangle className="w-4 h-4" />
          {kpi.criticas} caso(s) llevan más de 7 días abiertos: priorizar su cierre.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-3">
        {/* Antigüedad */}
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Antigüedad (tiempo abierto)</h3>
            {rangoFiltro && (
              <button type="button" onClick={() => setRangoFiltro('')} className="text-[11px] font-semibold text-blue-700 cursor-pointer">
                Ver todos
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-400">Toca un rango para filtrar las listas.</p>
          {antig.map((a) => {
            const tot = a.cajas + a.rutas;
            const activo = rangoFiltro === a.k;
            return (
              <button
                key={a.k}
                type="button"
                onClick={() => setRangoFiltro(activo ? '' : a.k)}
                aria-pressed={activo}
                className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 border cursor-pointer text-left ${
                  activo ? 'border-slate-800 bg-slate-50' : 'border-transparent hover:bg-slate-50'
                }`}
              >
                <span className="w-24 shrink-0 text-[11px] font-semibold text-slate-700">{a.label}</span>
                <div className="flex-1 h-4 bg-slate-100 rounded-md overflow-hidden flex">
                  <div style={{ width: `${(a.cajas / antigMax) * 100}%`, backgroundColor: '#eda100' }} title={`${a.cajas} caja(s) abierta(s)`} />
                  <div style={{ width: `${(a.rutas / antigMax) * 100}%`, backgroundColor: '#5b6bd6' }} title={`${a.rutas} ruta(s) abierta(s)`} />
                </div>
                <span className="w-24 text-right text-[11px] tabular-nums text-slate-600">
                  <b style={{ color: a.color }}>{tot}</b> ({a.cajas} CA · {a.rutas} RA)
                </span>
              </button>
            );
          })}
          <div className="flex gap-3 text-[10px] text-slate-500 pt-1">
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#eda100' }} /> Caja abierta (CA)
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#5b6bd6' }} /> Ruta abierta (RA)
            </span>
          </div>
        </div>

        {/* Por agencia */}
        <div className="xl:col-span-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-2">Por agencia</h3>
          {porAgencia.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">Sin cajas ni rutas abiertas con estos filtros.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10.5px] uppercase text-slate-500">
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-1.5 pr-2">Agencia</th>
                    <th className="text-right py-1.5 px-2">Cajas ab.</th>
                    <th className="text-right py-1.5 px-2">Saldo</th>
                    <th className="text-right py-1.5 px-2">Máx. días</th>
                    <th className="text-right py-1.5 px-2">Rutas ab.</th>
                    <th className="text-right py-1.5 px-2">Cajas pend.</th>
                    <th className="text-right py-1.5 pl-2">Máx. días</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {porAgencia.map((a) => (
                    <tr key={a.ag} className="hover:bg-slate-50 cursor-pointer" onClick={() => setAgencia(a.ag === agencia ? 'TODAS' : a.ag)}>
                      <td className="py-1.5 pr-2 font-semibold text-blue-700">{a.ag}</td>
                      <td className="py-1.5 px-2 text-right">{a.ca}</td>
                      <td className="py-1.5 px-2 text-right">{a.ca ? q(a.saldo) : '-'}</td>
                      <td className="py-1.5 px-2 text-right">{a.ca ? <Chip r={rangoDe(a.caMax)} dias={a.caMax} /> : '-'}</td>
                      <td className="py-1.5 px-2 text-right">{a.ra}</td>
                      <td className="py-1.5 px-2 text-right">{a.ra ? n1(a.cj) : '-'}</td>
                      <td className="py-1.5 pl-2 text-right">{a.ra ? <Chip r={rangoDe(a.raMax)} dias={a.raMax} /> : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detalle: Cajas Abiertas */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-600" />
          <h3 className="text-sm font-bold text-slate-800">Cajas abiertas por validar ({cajasF.length})</h3>
          <span className="text-[11px] text-slate-400">más antiguas primero</span>
        </div>
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-slate-50 text-[10.5px] uppercase text-slate-500 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2">Ruta</th>
                <th className="text-left px-3 py-2">Agencia</th>
                <th className="text-left px-3 py-2">Liquidada</th>
                <th className="text-left px-3 py-2">Tiempo</th>
                <th className="text-left px-3 py-2">Motivo</th>
                <th className="text-right px-3 py-2">Diferencia</th>
                <th className="text-right px-3 py-2">Abonado</th>
                <th className="text-right px-3 py-2">Saldo</th>
                <th className="text-left px-3 py-2">Piloto · Camión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cajasF.map((c) => (
                <tr key={c.key} className={c.rango === '8+' ? 'bg-rose-50/50' : 'hover:bg-slate-50'}>
                  <td className="px-3 py-2 font-mono font-bold text-slate-900">
                    {c.id}
                    {c.clientesPend > 0 && <span className="ml-1 text-[10px] font-sans text-rose-700">({c.clientesPend} cli. pend.)</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-blue-700">{c.agencia}</div>
                    <div className="text-[10px] text-slate-400">{c.segmento}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{c.fechaLiq}</td>
                  <td className="px-3 py-2"><Chip r={c.rango} dias={c.dias} /></td>
                  <td className="px-3 py-2 text-slate-700 max-w-[220px] truncate" title={c.comentario ? `${c.motivo} · ${c.comentario}` : c.motivo}>
                    {c.motivo}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.monto ? q(c.monto) : <span className="text-slate-400">Sin valor</span>}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                    {c.abonado ? q(c.abonado) : '-'}
                    {c.abonos > 0 && <div className="text-[10px] text-slate-400">{c.abonos} abono(s) · último {c.ultimoAbono}</div>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-rose-700">{c.monto ? q(c.saldo) : '-'}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {c.piloto} · <span className="font-mono">{c.placa}</span>
                  </td>
                </tr>
              ))}
              {cajasF.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-slate-400">Sin cajas abiertas con estos filtros.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detalle: Rutas Abiertas */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-800">Rutas abiertas por volver a salir ({rutasF.length})</h3>
          <span className="text-[11px] text-slate-400">tiempo desde su último retorno</span>
        </div>
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full text-xs whitespace-nowrap">
            <thead className="bg-slate-50 text-[10.5px] uppercase text-slate-500 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2">Ruta</th>
                <th className="text-left px-3 py-2">Agencia</th>
                <th className="text-left px-3 py-2">Fecha ruta</th>
                <th className="text-left px-3 py-2">Abierta desde</th>
                <th className="text-left px-3 py-2">Tiempo</th>
                <th className="text-right px-3 py-2">Retornos</th>
                <th className="text-right px-3 py-2">Cajas pend.</th>
                <th className="text-right px-3 py-2">Paradas pend.</th>
                <th className="text-left px-3 py-2">Motivo</th>
                <th className="text-left px-3 py-2">Último piloto · Camión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rutasF.map((r) => (
                <tr key={r.key} className={r.rango === '8+' ? 'bg-rose-50/50' : 'hover:bg-slate-50'}>
                  <td className="px-3 py-2 font-mono font-bold text-slate-900">{r.id}</td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-blue-700">{r.agencia}</div>
                    <div className="text-[10px] text-slate-400">{r.segmento}</div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{r.fechaRuta}</td>
                  <td className="px-3 py-2 text-slate-600">{r.desde}</td>
                  <td className="px-3 py-2"><Chip r={r.rango} dias={r.dias} /></td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.retornos}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-indigo-700">{n1(r.cajas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.paradas}</td>
                  <td className="px-3 py-2 text-slate-700 max-w-[220px] truncate" title={r.motivo}>{r.motivo}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {r.ultimoPiloto} · <span className="font-mono">{r.ultimaPlaca}</span>
                  </td>
                </tr>
              ))}
              {rutasF.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-slate-400">Sin rutas abiertas con estos filtros.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
