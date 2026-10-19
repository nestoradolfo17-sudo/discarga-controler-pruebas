import React, { useEffect, useMemo, useState } from 'react';
import type { Recarga, Staff, TipoRecarga } from '../types';
import { leerRecargas, suscribirRecargas, formatoCorrelativo } from '../services/recargas';
import { Card, Kpi, HBar, C_GOOD, C_INFO, C_WARN, C_CRIT, C_TRACK } from './DashboardExecutive';
import { Repeat, Clock, CheckCircle2, XCircle, Wallet, Building2, Users, Layers, AlertTriangle, BarChart3 } from 'lucide-react';

// --- Dashboard de Recargas ---
// Solo LEE la tabla de recargas (no modifica nada). Respeta la agencia elegida
// arriba y las agencias que el usuario puede ver. Los montos son estimados con
// la tarifa por puesto (VPP Q125 · APP Q75 por viaje; Doble ×2, Triple ×3); el
// cálculo oficial de pago (con retenciones por préstamo) es el Excel de Recargas.

const VIAJES: Record<TipoRecarga, number> = { Simple: 1, Doble: 2, Triple: 3 };
const TARIFA: Record<string, number> = { VPP: 125, VPPB: 125, APP: 75 };
const tarifaDe = (puesto: string) => TARIFA[puesto] ?? (puesto === 'APP' ? 75 : 125);
// Tipos de recarga: identidad (no estado) → paleta categórica en orden fijo.
const COLOR_TIPO: Record<TipoRecarga, string> = { Simple: '#2a78d6', Doble: '#eb6834', Triple: '#1baf7a' };

const n0 = (v: number) => Math.round(v).toLocaleString('en-US');
const q0 = (v: number) => `Q ${Math.round(v).toLocaleString('en-US')}`;
const pct = (v: number, t: number) => (t > 0 ? `${Math.round((v / t) * 100)}%` : '—');
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hoyIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date());
const fmt = (s: string) => (s ? s.split('-').reverse().join('/') : '');
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const estadoDe = (r: Recarga) => r.estado || 'Pendiente';

type Periodo = 'hoy' | '7d' | 'mes' | 'rango';

interface Props {
  staff: Staff[];
  selectedAgency: string;
  puedeVerAgencia?: (agencia: string) => boolean;
}

// Columnas apiladas por día (estados de la recarga), con leyenda y tooltip.
const ColumnasEstado: React.FC<{ data: { key: string; label: string; aut: number; pend: number; rech: number }[] }> = ({ data }) => {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.aut + d.pend + d.rech));
  const mostrarEtiqueta = (i: number) => data.length <= 16 || i % 3 === 0 || i === data.length - 1;
  return (
    <div>
      <div className="flex items-end gap-1 h-40 px-1 border-b border-slate-200">
        {data.map((d, i) => {
          const tot = d.aut + d.pend + d.rech;
          return (
            <div
              key={d.key}
              tabIndex={0}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="relative flex-1 min-w-0 h-full flex flex-col justify-end cursor-default outline-none"
            >
              {hover === i && (
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 z-10 bg-slate-900 text-white text-[11px] font-semibold px-2 py-1 rounded-lg whitespace-nowrap shadow-lg pointer-events-none">
                  {d.label}: {n0(tot)} viajes
                  <br />✓ {n0(d.aut)} · ⏳ {n0(d.pend)} · ✕ {n0(d.rech)}
                </div>
              )}
              {tot > 0 && data.length <= 16 && <span className="text-center text-[10px] font-bold text-slate-600 mb-0.5 tabular-nums">{n0(tot)}</span>}
              <div className="w-full flex flex-col justify-end gap-[2px]" style={{ height: `${tot > 0 ? Math.max(4, (tot / max) * 88) : 1.5}%` }}>
                {tot === 0 ? (
                  <div className="w-full h-full" style={{ backgroundColor: '#e1e0d9' }} />
                ) : (
                  [
                    ['rech', d.rech, C_CRIT],
                    ['pend', d.pend, C_WARN],
                    ['aut', d.aut, C_GOOD],
                  ]
                    .filter(([, v]) => (v as number) > 0)
                    .map(([k2, v, c], j) => (
                      <div key={k2 as string} className={`w-full ${j === 0 ? 'rounded-t-[4px]' : ''}`} style={{ flex: v as number, backgroundColor: c as string }} />
                    ))
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 px-1 mt-1">
        {data.map((d, i) => (
          <span key={d.key} className="flex-1 min-w-0 text-center text-[9.5px] text-slate-500 tabular-nums truncate">
            {mostrarEtiqueta(i) ? d.label.slice(0, 5) : ''}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-slate-600">
        {[
          ['Autorizadas', C_GOOD, '✓'],
          ['Por autorizar', C_WARN, '⏳'],
          ['Rechazadas', C_CRIT, '✕'],
        ].map(([l, c, ic]) => (
          <span key={l} className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: c }} aria-hidden />
            {ic} {l}
          </span>
        ))}
      </div>
    </div>
  );
};

export const DashboardRecargas: React.FC<Props> = ({ staff, selectedAgency, puedeVerAgencia }) => {
  const [recargas, setRecargas] = useState<Recarga[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    void leerRecargas().then((res) => {
      if (!vivo) return;
      setCargando(false);
      if (res.ok) setRecargas(res.data);
      else setError(res.tablaFalta ? 'El módulo de Recargas aún no está activado en la base de datos.' : res.mensaje);
    });
    const off = suscribirRecargas((upd) => setRecargas((prev) => upd(prev)));
    return () => {
      vivo = false;
      off();
    };
  }, []);

  // ---------- Filtro de periodo ----------
  const hoy = hoyIso();
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [desde, setDesde] = useState(hoy.slice(0, 8) + '01');
  const [hasta, setHasta] = useState(hoy);
  const [d0, d1] = useMemo((): [string, string] => {
    if (periodo === 'hoy') return [hoy, hoy];
    if (periodo === '7d') {
      const [y, m, d] = hoy.split('-').map(Number);
      return [iso(new Date(y, m - 1, d - 6)), hoy];
    }
    if (periodo === 'mes') return [hoy.slice(0, 8) + '01', hoy];
    return desde <= hasta ? [desde, hasta] : [hasta, desde];
  }, [periodo, desde, hasta, hoy]);

  const delAlcance = useMemo(
    () =>
      recargas.filter(
        (r) => (selectedAgency === 'TODAS' ? !puedeVerAgencia || puedeVerAgencia(r.agencia) : r.agencia === selectedAgency)
      ),
    [recargas, selectedAgency, puedeVerAgencia]
  );
  const enPeriodo = useMemo(() => delAlcance.filter((r) => r.fecha >= d0 && r.fecha <= d1), [delAlcance, d0, d1]);

  // ---------- Valor por recarga (tarifa por puesto) ----------
  const porId = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const personasDe = (r: Recarga) => [
    ...(r.conductor ? [{ nombre: r.conductor, id: r.conductorId, rol: 'Piloto' }] : []),
    ...(r.auxiliares || []).map((n, i) => ({ nombre: n, id: r.auxiliarIds?.[i] || undefined, rol: 'Auxiliar' })).filter((x) => x.nombre),
  ];
  const personaDe = (nombre: string, id: string | undefined | null, agencia: string) =>
    (id ? porId.get(id) : undefined) ||
    staff.find((s) => s.agencia === agencia && norm(s.nombre) === norm(nombre)) ||
    staff.find((s) => norm(s.nombre) === norm(nombre));
  const valorDe = (r: Recarga) =>
    personasDe(r).reduce((acc, p) => {
      const st = personaDe(p.nombre, p.id, r.agencia);
      const puesto = String(st?.puesto || (p.rol === 'Piloto' ? 'VPP' : 'APP')).toUpperCase();
      return acc + tarifaDe(puesto) * (VIAJES[r.tipo] || 1);
    }, 0);

  // ---------- Indicadores ----------
  const k = useMemo(() => {
    const viajes = (l: Recarga[]) => l.reduce((a, r) => a + (VIAJES[r.tipo] || 1), 0);
    const aut = enPeriodo.filter((r) => estadoDe(r) === 'Autorizada');
    const pend = enPeriodo.filter((r) => estadoDe(r) === 'Pendiente');
    const rech = enPeriodo.filter((r) => estadoDe(r) === 'Rechazada');
    // Pendientes de TODAS las fechas (lo que el administrador tiene por revisar).
    const pendTodas = delAlcance.filter((r) => estadoDe(r) === 'Pendiente');
    const dias = (f: string) => Math.max(0, Math.round((Date.parse(hoy) - Date.parse(f)) / 864e5));
    const masAntigua = pendTodas.reduce((m, r) => Math.max(m, dias(r.fecha)), 0);
    return {
      total: enPeriodo.length,
      viajes: viajes(enPeriodo),
      aut: aut.length,
      viajesAut: viajes(aut),
      pend: pend.length,
      viajesPend: viajes(pend),
      rech: rech.length,
      montoAut: aut.reduce((a, r) => a + valorDe(r), 0),
      montoPend: pend.reduce((a, r) => a + valorDe(r), 0),
      pendTodas,
      masAntigua,
      dias,
      auto: enPeriodo.filter((r) => r.origen === 'asignacion').length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enPeriodo, delAlcance, staff, hoy]);

  // ---------- Tendencia por día ----------
  const tendencia = useMemo(() => {
    const out: { key: string; label: string; aut: number; pend: number; rech: number }[] = [];
    const [y0, m0, dd0] = d0.split('-').map(Number);
    for (let d = new Date(y0, m0 - 1, dd0); iso(d) <= d1 && out.length < 92; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      out.push({ key: iso(d), label: fmt(iso(d)), aut: 0, pend: 0, rech: 0 });
    }
    const idx = new Map(out.map((x, i) => [x.key, i]));
    enPeriodo.forEach((r) => {
      const i = idx.get(r.fecha);
      if (i === undefined) return;
      const v = VIAJES[r.tipo] || 1;
      const e = estadoDe(r);
      if (e === 'Autorizada') out[i].aut += v;
      else if (e === 'Rechazada') out[i].rech += v;
      else out[i].pend += v;
    });
    return out;
  }, [enPeriodo, d0, d1]);

  // ---------- Por agencia ----------
  const porAgencia = useMemo(() => {
    const m = new Map<string, { viajes: number; monto: number; pend: number }>();
    enPeriodo
      .filter((r) => estadoDe(r) !== 'Rechazada')
      .forEach((r) => {
        const x = m.get(r.agencia || 'Sin agencia') || { viajes: 0, monto: 0, pend: 0 };
        x.viajes += VIAJES[r.tipo] || 1;
        if (estadoDe(r) === 'Autorizada') x.monto += valorDe(r);
        else x.pend += 1;
        m.set(r.agencia || 'Sin agencia', x);
      });
    return [...m.entries()].sort((a, b) => b[1].viajes - a[1].viajes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enPeriodo, staff]);

  // ---------- Por tipo ----------
  const porTipo = useMemo(() => {
    const c: Record<TipoRecarga, number> = { Simple: 0, Doble: 0, Triple: 0 };
    enPeriodo.filter((r) => estadoDe(r) !== 'Rechazada').forEach((r) => (c[r.tipo] = (c[r.tipo] || 0) + 1));
    return c;
  }, [enPeriodo]);

  // ---------- Colaboradores con más recargas autorizadas ----------
  const ranking = useMemo(() => {
    const m = new Map<string, { nombre: string; puesto: string; agencia: string; viajes: number; monto: number }>();
    enPeriodo
      .filter((r) => estadoDe(r) === 'Autorizada')
      .forEach((r) =>
        personasDe(r).forEach((p) => {
          const st = personaDe(p.nombre, p.id, r.agencia);
          const puesto = String(st?.puesto || (p.rol === 'Piloto' ? 'VPP' : 'APP')).toUpperCase();
          const key = st?.id || norm(p.nombre);
          const x = m.get(key) || { nombre: st?.nombre || p.nombre, puesto, agencia: st?.agencia || r.agencia, viajes: 0, monto: 0 };
          const v = VIAJES[r.tipo] || 1;
          x.viajes += v;
          x.monto += tarifaDe(puesto) * v;
          m.set(key, x);
        })
      );
    return [...m.values()].sort((a, b) => b.viajes - a.viajes || b.monto - a.monto).slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enPeriodo, staff]);

  const pendientesViejas = useMemo(
    () => [...k.pendTodas].sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 8),
    [k.pendTodas]
  );

  const tipoTotal = porTipo.Simple + porTipo.Doble + porTipo.Triple;
  const maxAg = Math.max(1, ...porAgencia.map(([, v]) => v.viajes));
  const periodoLabel = d0 === d1 ? `Día ${fmt(d0)}` : `Del ${fmt(d0)} al ${fmt(d1)}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Dashboard de Recargas</h2>
          <p className="text-xs text-slate-500">
            {periodoLabel} · Agencia: <span className="font-semibold text-slate-700">{selectedAgency === 'TODAS' ? 'Todas' : selectedAgency}</span> · {n0(k.total)} recargas registradas
          </p>
        </div>
        <span className="text-[11px] text-slate-400">Se actualiza solo cuando registran o autorizan recargas</span>
      </div>

      {/* Filtro de periodo */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 shadow-sm flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mr-1">Periodo</span>
        <div role="tablist" aria-label="Periodo de recargas" className="inline-flex flex-wrap gap-1 bg-slate-100 rounded-xl p-1">
          {([
            ['hoy', 'Hoy'],
            ['7d', 'Últimos 7 días'],
            ['mes', 'Este mes'],
            ['rango', 'Rango de días'],
          ] as [Periodo, string][]).map(([key, l]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={periodo === key}
              onClick={() => setPeriodo(key)}
              className={`min-h-[40px] px-3 rounded-lg text-xs sm:text-sm font-semibold cursor-pointer ${periodo === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {l}
            </button>
          ))}
        </div>
        {periodo === 'rango' && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1 font-semibold text-slate-600">
              Desde
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="min-h-[40px] px-2 border border-slate-300 rounded-lg bg-white" />
            </label>
            <label className="flex items-center gap-1 font-semibold text-slate-600">
              Hasta
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="min-h-[40px] px-2 border border-slate-300 rounded-lg bg-white" />
            </label>
          </div>
        )}
        <span className="text-xs font-semibold text-slate-700 ml-auto">{periodoLabel}</span>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}
      {cargando && <p className="text-xs text-slate-400">Cargando recargas…</p>}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        <Kpi label="Recargas" value={n0(k.total)} sub={`${n0(k.viajes)} viajes · ${n0(k.auto)} automáticas desde Asignación`} accent={C_INFO} icon={<Repeat className="w-4 h-4" />} />
        <Kpi
          label="Por autorizar"
          value={n0(k.pendTodas.length)}
          status={k.pendTodas.length ? (k.masAntigua > 2 ? 'Atrasadas' : 'En revisión') : 'Al día'}
          sub={k.pendTodas.length ? `todas las fechas · la más antigua tiene ${k.masAntigua} día(s)` : 'nada pendiente de revisar'}
          accent={k.masAntigua > 2 ? C_CRIT : C_WARN}
          icon={<Clock className="w-4 h-4" />}
        />
        <Kpi
          label="Autorizadas"
          value={n0(k.aut)}
          progress={k.total ? k.aut / k.total : 0}
          sub={`${pct(k.aut, k.total)} del periodo · ${n0(k.viajesAut)} viajes`}
          accent={C_GOOD}
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <Kpi label="Rechazadas" value={n0(k.rech)} sub={`${pct(k.rech, k.total)} del periodo · no se pagan`} accent={C_CRIT} icon={<XCircle className="w-4 h-4" />} />
        <Kpi
          label="Monto autorizado"
          value={q0(k.montoAut)}
          sub={`estimado · ${q0(k.montoPend)} más si se autorizan las del periodo`}
          accent={C_INFO}
          icon={<Wallet className="w-4 h-4" />}
        />
      </div>

      {/* Tendencia */}
      <Card title="Viajes de recarga por día" sub="Cada barra son los viajes del día (Simple 1 · Doble 2 · Triple 3) según su estado" icon={<BarChart3 className="w-4 h-4 text-slate-500" />}>
        {tendencia.length ? <ColumnasEstado data={tendencia} /> : <p className="text-xs text-slate-400">Sin días en el periodo.</p>}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2" title="Por agencia" sub="Viajes autorizados y por autorizar · monto autorizado estimado" icon={<Building2 className="w-4 h-4 text-slate-500" />}>
          {porAgencia.length === 0 ? (
            <p className="text-xs text-slate-400">Sin recargas en el periodo.</p>
          ) : (
            <div className="space-y-2">
              {porAgencia.slice(0, 12).map(([ag, v]) => (
                <HBar
                  key={ag}
                  label={ag}
                  value={v.viajes}
                  max={maxAg}
                  color={C_INFO}
                  display={`${n0(v.viajes)} viajes · ${q0(v.monto)}`}
                  valueWidth="w-36"
                  tip={`${ag}: ${n0(v.viajes)} viajes · ${q0(v.monto)} autorizado · ${n0(v.pend)} por autorizar`}
                />
              ))}
            </div>
          )}
        </Card>
        <Card title="Por tipo" sub="Recargas autorizadas y por autorizar" icon={<Layers className="w-4 h-4 text-slate-500" />}>
          {tipoTotal === 0 ? (
            <p className="text-xs text-slate-400">Sin recargas en el periodo.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex h-4 w-full gap-[2px] rounded-full overflow-hidden" style={{ backgroundColor: C_TRACK }} role="img" aria-label="Reparto por tipo">
                {(['Simple', 'Doble', 'Triple'] as TipoRecarga[]).map((t) =>
                  porTipo[t] ? <div key={t} title={`${t}: ${porTipo[t]}`} style={{ flex: porTipo[t], backgroundColor: COLOR_TIPO[t] }} /> : null
                )}
              </div>
              {(['Simple', 'Doble', 'Triple'] as TipoRecarga[]).map((t) => (
                <div key={t} className="flex items-center gap-2 text-xs">
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: COLOR_TIPO[t] }} aria-hidden />
                  <span className="flex-1 text-slate-700">
                    {t} <span className="text-slate-400">(×{VIAJES[t]})</span>
                  </span>
                  <span className="font-bold text-slate-800 tabular-nums">{n0(porTipo[t])}</span>
                  <span className="w-10 text-right text-slate-500 tabular-nums">{pct(porTipo[t], tipoTotal)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Colaboradores con más recargas" sub="Top 10 por viajes autorizados en el periodo · monto estimado" icon={<Users className="w-4 h-4 text-slate-500" />}>
          {ranking.length === 0 ? (
            <p className="text-xs text-slate-400">Aún no hay recargas autorizadas en el periodo.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-[10.5px] uppercase text-slate-500">
                <tr>
                  <th className="text-left py-1.5">#</th>
                  <th className="text-left py-1.5">Nombre</th>
                  <th className="text-left py-1.5">Puesto</th>
                  <th className="text-left py-1.5">Agencia</th>
                  <th className="text-right py-1.5">Viajes</th>
                  <th className="text-right py-1.5">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ranking.map((x, i) => (
                  <tr key={x.nombre + i}>
                    <td className="py-1.5 text-slate-400 tabular-nums">{i + 1}</td>
                    <td className="py-1.5 font-semibold text-slate-800">{x.nombre}</td>
                    <td className="py-1.5 text-slate-600">{x.puesto}</td>
                    <td className="py-1.5 text-slate-600">{x.agencia}</td>
                    <td className="py-1.5 text-right font-bold tabular-nums">{n0(x.viajes)}</td>
                    <td className="py-1.5 text-right tabular-nums">{q0(x.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card
          title="Por autorizar más antiguas"
          sub="Todas las fechas · mientras no se autoricen no cuentan para pago"
          icon={<Clock className="w-4 h-4 text-slate-500" />}
          right={<span className="text-[11px] font-bold text-slate-500">{n0(k.pendTodas.length)} en total</span>}
        >
          {pendientesViejas.length === 0 ? (
            <p className="text-xs text-emerald-700 font-semibold">✓ No hay recargas esperando autorización.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-[10.5px] uppercase text-slate-500">
                <tr>
                  <th className="text-left py-1.5">No.</th>
                  <th className="text-left py-1.5">Fecha</th>
                  <th className="text-left py-1.5">Ruta</th>
                  <th className="text-left py-1.5">Agencia</th>
                  <th className="text-left py-1.5">Tipo</th>
                  <th className="text-right py-1.5">Días</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendientesViejas.map((r) => {
                  const d = k.dias(r.fecha);
                  return (
                    <tr key={r.id}>
                      <td className="py-1.5 font-mono font-bold text-slate-700">{formatoCorrelativo(r.correlativo) || '—'}</td>
                      <td className="py-1.5 tabular-nums">{fmt(r.fecha)}</td>
                      <td className="py-1.5">{r.sinRuta || !r.rutaId ? 'Sin ruta' : r.rutaId}</td>
                      <td className="py-1.5 text-slate-600">{r.agencia}</td>
                      <td className="py-1.5">{r.tipo}</td>
                      <td className="py-1.5 text-right font-bold tabular-nums" style={{ color: d > 2 ? C_CRIT : '#334155' }}>
                        {d > 2 ? '⚠ ' : ''}
                        {d}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      <p className="text-[11px] text-slate-400">
        Montos estimados con la tarifa por puesto (VPP Q125 · APP Q75 por viaje). El pago oficial, con las retenciones por préstamo, sale del Excel de Recargas.
      </p>
    </div>
  );
};
