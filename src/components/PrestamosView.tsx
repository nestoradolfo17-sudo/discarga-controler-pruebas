import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, Plus, Download, Search, Pencil, Trash2, AlertTriangle, RefreshCw, ShieldCheck, Check, X, Clock, Undo2, Truck as TruckIcon, UserRound, Users } from 'lucide-react';
import { Prestamo, Route, Staff, Truck } from '../types';
import { PrestamoModal } from './modals/PrestamoModal';
import { guardarPrestamos, eliminarPrestamo, nuevoIdPrestamo } from '../services/prestamos';
import { getGuatemalaDateForInput } from '../utils/date';
import { loadXLSX } from '../utils/excel';
import { isDemoMode } from '../services/demoMode';
import {
  estadoPrestamo,
  formatoCorrelativoPrestamo,
  fmtFecha,
  diasEntre,
  cubreFecha,
  fechaDevolucionISO,
  fechaRutaISO,
} from '../utils/prestamos';

// --- Módulo de Préstamos de personal y camiones entre agencias ---
// Cualquier usuario registra un préstamo (agencia que presta → agencia que
// recibe, rango de fechas, pilotos/auxiliares/camiones y motivo). Aplica desde
// que se registra; un administrador lo autoriza y cualquiera registra la
// devolución. Las recargas hechas en préstamo solo se pagan con préstamo
// autorizado y devuelto (ver Excel de Recargas).

type Vista = 'vigentes' | 'programados' | 'porAutorizar' | 'sinDevolver' | 'devueltos' | 'todos';

interface PrestamosViewProps {
  prestamos: Prestamo[];
  onGuardados: (list: Prestamo[]) => void;
  onEliminado: (id: string) => void;
  onRecargar: () => void;
  cargando: boolean;
  tablaFalta: boolean;
  staff: Staff[];
  trucks: Truck[];
  rutas: Route[];
  agencias: string[]; // agencias que el usuario puede ver
  agenciasTodas: string[];
  agenciaGeneral: string;
  usuario: string;
  isAdmin: boolean;
  canDelete: boolean;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const fmtHora = (iso?: string) => {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  } catch {
    return iso;
  }
};
const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
const primeroDeMes = () => getGuatemalaDateForInput().slice(0, 8) + '01';
const etq = (p: Prestamo) => formatoCorrelativoPrestamo(p.correlativo) || 'préstamo';

const ICONO = { piloto: UserRound, auxiliar: Users, camion: TruckIcon } as const;

export const PrestamosView: React.FC<PrestamosViewProps> = ({
  prestamos,
  onGuardados,
  onEliminado,
  onRecargar,
  cargando,
  tablaFalta,
  staff,
  trucks,
  rutas,
  agencias,
  agenciasTodas,
  agenciaGeneral,
  usuario,
  isAdmin,
  canDelete,
  onShowToast,
}) => {
  const hoy = getGuatemalaDateForInput();
  const [vista, setVista] = useState<Vista>('vigentes');
  const [desde, setDesde] = useState(primeroDeMes);
  const [hasta, setHasta] = useState(hoy);
  const [agencia, setAgencia] = useState('');
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState<{ abierto: boolean; prestamo: Prestamo | null }>({ abierto: false, prestamo: null });
  const [guardando, setGuardando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [accion, setAccion] = useState<{ id: string; tipo: 'rechazar' | 'devolver' | 'eliminar'; texto: string } | null>(null);

  const agenciasVisibles = useMemo(
    () => (agenciaGeneral && agenciaGeneral !== 'TODAS' ? agencias.filter((a) => a === agenciaGeneral) : agencias),
    [agencias, agenciaGeneral]
  );
  const delUsuario = useMemo(
    () => prestamos.filter((p) => agenciasVisibles.includes(p.agenciaOrigen) || agenciasVisibles.includes(p.agenciaDestino)),
    [prestamos, agenciasVisibles]
  );

  const clasif = (p: Prestamo) => {
    const e = estadoPrestamo(p);
    return {
      rechazado: e === 'Rechazado',
      devuelto: !!p.devuelto,
      vigente: e !== 'Rechazado' && !p.devuelto && p.fechaInicio <= hoy && hoy <= p.fechaFin,
      programado: e !== 'Rechazado' && !p.devuelto && p.fechaInicio > hoy,
      sinDevolver: e !== 'Rechazado' && !p.devuelto && p.fechaFin < hoy,
      porAutorizar: e === 'Pendiente',
    };
  };

  const base = useMemo(() => {
    const q = norm(busca.trim());
    return delUsuario
      .filter((p) => !agencia || p.agenciaOrigen === agencia || p.agenciaDestino === agencia)
      .filter(
        (p) =>
          !q ||
          norm([formatoCorrelativoPrestamo(p.correlativo), p.agenciaOrigen, p.agenciaDestino, p.motivo, p.solicitadoPor, ...p.recursos.map((r) => `${r.nombre} ${r.detalle || ''}`)].join(' ')).includes(q)
      );
  }, [delUsuario, agencia, busca]);

  const enRango = (p: Prestamo) => (!desde || p.fechaFin >= desde) && (!hasta || p.fechaInicio <= hasta);

  const conteo = useMemo(() => {
    const c = { vigentes: 0, programados: 0, porAutorizar: 0, sinDevolver: 0, devueltos: 0, todos: 0 };
    base.forEach((p) => {
      const k = clasif(p);
      if (k.vigente) c.vigentes++;
      if (k.programado) c.programados++;
      if (k.porAutorizar) c.porAutorizar++;
      if (k.sinDevolver) c.sinDevolver++;
      if (k.devuelto && enRango(p)) c.devueltos++;
      if (enRango(p)) c.todos++;
    });
    return c;
  }, [base, desde, hasta]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtrados = useMemo(
    () =>
      base
        .filter((p) => {
          const k = clasif(p);
          if (vista === 'vigentes') return k.vigente;
          if (vista === 'programados') return k.programado;
          if (vista === 'porAutorizar') return k.porAutorizar;
          if (vista === 'sinDevolver') return k.sinDevolver;
          if (vista === 'devueltos') return k.devuelto && enRango(p);
          return enRango(p);
        })
        .sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio) || (b.correlativo || 0) - (a.correlativo || 0)),
    [base, vista, desde, hasta] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const recursosEnUso = conteo.vigentes
    ? base.filter((p) => clasif(p).vigente).reduce((a, p) => a + p.recursos.length, 0)
    : 0;

  const guardar = async (list: Prestamo[], ok: string) => {
    setProcesando(true);
    const { error, guardados } = await guardarPrestamos(list);
    setProcesando(false);
    if (error) {
      onShowToast(error, 'error');
      return false;
    }
    onGuardados(guardados);
    setAccion(null);
    onShowToast(isDemoMode ? 'Versión DEMO: el cambio se ve aquí pero no se guarda.' : ok, isDemoMode ? 'info' : 'success');
    return true;
  };

  const handleGuardar = async (datos: Pick<Prestamo, 'agenciaOrigen' | 'agenciaDestino' | 'fechaInicio' | 'fechaFin' | 'recursos' | 'motivo'>) => {
    const ahora = new Date().toISOString();
    const previo = modal.prestamo;
    let p: Prestamo;
    if (!previo) {
      p = { ...datos, id: nuevoIdPrestamo(), solicitadoPor: usuario, creadoPor: usuario, creadoEn: ahora, estado: 'Pendiente', devuelto: false };
    } else {
      p = { ...previo, ...datos, editadoPor: usuario, editadoEn: ahora };
      const cambio = JSON.stringify([previo.agenciaOrigen, previo.agenciaDestino, previo.fechaInicio, previo.fechaFin, previo.recursos, previo.motivo]) !==
        JSON.stringify([p.agenciaOrigen, p.agenciaDestino, p.fechaInicio, p.fechaFin, p.recursos, p.motivo]);
      if (!isAdmin && cambio) p = { ...p, estado: 'Pendiente', autorizadoPor: undefined, autorizadoEn: undefined, motivoRechazo: undefined };
    }
    setGuardando(true);
    const ok = await guardar(
      [p],
      previo ? `Préstamo ${etq(previo)} actualizado.` : `Préstamo registrado: ${p.recursos.length} recurso(s) de ${p.agenciaOrigen} a ${p.agenciaDestino}. Queda pendiente de autorización.`
    );
    setGuardando(false);
    if (ok) setModal({ abierto: false, prestamo: null });
  };

  const autorizar = (p: Prestamo) =>
    guardar([{ ...p, estado: 'Autorizado', autorizadoPor: usuario, autorizadoEn: new Date().toISOString(), motivoRechazo: undefined }], `Préstamo ${etq(p)} autorizado.`);
  const rechazar = (p: Prestamo, motivo: string) =>
    guardar([{ ...p, estado: 'Rechazado', autorizadoPor: usuario, autorizadoEn: new Date().toISOString(), motivoRechazo: motivo }], `Préstamo ${etq(p)} rechazado: ya no aplica.`);
  const devolver = (p: Prestamo, comentario: string) =>
    guardar(
      [{ ...p, devuelto: true, devueltoPor: usuario, devueltoEn: new Date().toISOString(), comentarioDevolucion: comentario || undefined, editadoPor: usuario, editadoEn: new Date().toISOString() }],
      `Devolución registrada: ${p.recursos.length} recurso(s) regresan a ${p.agenciaOrigen}.`
    );
  const eliminar = async (p: Prestamo) => {
    setProcesando(true);
    const err = await eliminarPrestamo(p.id);
    setProcesando(false);
    if (err) {
      onShowToast(err, 'error');
      return;
    }
    onEliminado(p.id);
    setAccion(null);
    onShowToast(`Préstamo ${etq(p)} eliminado.`, 'success');
  };

  // Rutas que trabajó cada recurso en la agencia destino durante el préstamo.
  const rutasDe = (p: Prestamo, tipo: string, id: string, nombre: string) => {
    const n = norm(nombre).trim();
    const lista: string[] = [];
    rutas.forEach((r) => {
      if (r.agencia !== p.agenciaDestino) return;
      const f = fechaRutaISO(r);
      if (!cubreFecha(p, f)) return;
      const despachos = [r.asignacion, ...(r.historialDespachos || []).map((d) => ({ camionId: d.camionId, conductor: d.conductor, auxiliar1: d.auxiliares?.[0], auxiliar2: d.auxiliares?.[1], auxiliar3: d.auxiliares?.[2], auxiliar4: d.auxiliares?.[3] }))].filter(Boolean) as {
        camionId?: string;
        conductor?: string;
        auxiliar1?: string | null;
        auxiliar2?: string | null;
        auxiliar3?: string | null;
        auxiliar4?: string | null;
      }[];
      const usado = despachos.some((a) =>
        tipo === 'camion' ? a.camionId === id : [a.conductor, a.auxiliar1, a.auxiliar2, a.auxiliar3, a.auxiliar4].some((x) => x && norm(x).trim() === n)
      );
      if (usado) lista.push(`${r.id} (${fmtFecha(f)})`);
    });
    return Array.from(new Set(lista));
  };

  const descargarExcel = async () => {
    if (filtrados.length === 0) {
      onShowToast('No hay préstamos con estos filtros.', 'info');
      return;
    }
    const XLSX = await loadXLSX();
    const wb = XLSX.utils.book_new();
    const filas: Record<string, string | number>[] = [];
    filtrados.forEach((p) => {
      const e = estadoPrestamo(p);
      p.recursos.forEach((r) => {
        const st = r.tipo === 'camion' ? undefined : staff.find((s) => s.id === r.id);
        const tr = r.tipo === 'camion' ? trucks.find((t) => t.id === r.id) : undefined;
        const rs = rutasDe(p, r.tipo, r.id, r.nombre);
        const finReal = p.devuelto && fechaDevolucionISO(p) && fechaDevolucionISO(p) < p.fechaFin ? fechaDevolucionISO(p) : p.fechaFin;
        filas.push({
          'No. préstamo': formatoCorrelativoPrestamo(p.correlativo),
          Tipo: r.tipo === 'piloto' ? 'Piloto' : r.tipo === 'auxiliar' ? 'Auxiliar' : 'Camión',
          'Nombre / Placa': r.nombre,
          'DPI / ID camión': st?.dpi ? String(st.dpi) : tr?.idCamion || '',
          Puesto: r.tipo === 'camion' ? '' : st?.puesto || r.detalle || '',
          'Agencia que presta': p.agenciaOrigen,
          'Agencia que recibe': p.agenciaDestino,
          Desde: fmtFecha(p.fechaInicio),
          Hasta: fmtFecha(p.fechaFin),
          'Días en préstamo': e === 'Rechazado' ? 0 : diasEntre(p.fechaInicio, finReal),
          'Rutas en la agencia que recibe': rs.length,
          'Detalle de rutas': rs.join(', '),
          Motivo: p.motivo,
          Autorización: e,
          'Autorizado / rechazado por': p.autorizadoPor || '',
          'Fecha autorización': fmtHora(p.autorizadoEn),
          'Motivo de rechazo': p.motivoRechazo || '',
          Devuelto: p.devuelto ? 'Sí' : 'No',
          'Devuelto por': p.devueltoPor || '',
          'Fecha devolución': fmtHora(p.devueltoEn),
          'Comentario devolución': p.comentarioDevolucion || '',
          'Recargas pagables': e === 'Autorizado' && p.devuelto ? 'Sí' : 'No (falta autorización o devolución)',
          'Solicitado por': p.solicitadoPor,
          'Registrado el': fmtHora(p.creadoEn),
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(filas);
    ws['!cols'] = [13, 9, 30, 16, 8, 18, 18, 11, 11, 9, 12, 40, 34, 11, 20, 17, 26, 9, 18, 17, 26, 22, 20, 17].map((wch) => ({ wch }));
    if (filas.length) ws['!autofilter'] = { ref: `A1:X${filas.length + 1}` };
    XLSX.utils.book_append_sheet(wb, ws, 'Préstamos');
    XLSX.writeFile(wb, `Prestamos_${vista}_${desde || 'inicio'}_a_${hasta || 'hoy'}.xlsx`);
    onShowToast(`Reporte de ${filtrados.length} préstamo(s) descargado.`, 'success');
  };

  const input = 'min-h-[40px] px-3 border border-slate-300 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-blue-300';
  const usaRango = vista === 'devueltos' || vista === 'todos';

  const tabs: { k: Vista; l: string; n: number; on: string }[] = [
    { k: 'vigentes', l: 'Vigentes hoy', n: conteo.vigentes, on: 'bg-teal-600 text-white border-teal-600' },
    { k: 'programados', l: 'Programados', n: conteo.programados, on: 'bg-sky-600 text-white border-sky-600' },
    { k: 'porAutorizar', l: 'Por autorizar', n: conteo.porAutorizar, on: 'bg-amber-500 text-white border-amber-500' },
    { k: 'sinDevolver', l: 'Vencidos sin devolver', n: conteo.sinDevolver, on: 'bg-rose-600 text-white border-rose-600' },
    { k: 'devueltos', l: 'Devueltos', n: conteo.devueltos, on: 'bg-emerald-600 text-white border-emerald-600' },
    { k: 'todos', l: 'Todos', n: conteo.todos, on: 'bg-slate-800 text-white border-slate-800' },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
            <ArrowLeftRight className="w-5 h-5" />
          </span>
          <div className="mr-auto">
            <h2 className="text-lg font-bold text-slate-800">Préstamos entre agencias</h2>
            <p className="text-xs text-slate-400">
              Pilotos, auxiliares y camiones prestados a otra agencia por un rango de fechas
              {agenciaGeneral && agenciaGeneral !== 'TODAS' ? ` · Agencia: ${agenciaGeneral}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onRecargar}
            className="min-h-[40px] px-3 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 flex items-center gap-1.5 cursor-pointer hover:bg-slate-50"
          >
            <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} /> Actualizar
          </button>
          <button
            id="btnNuevoPrestamo"
            type="button"
            onClick={() => setModal({ abierto: true, prestamo: null })}
            disabled={tablaFalta}
            className="min-h-[44px] px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" /> Nuevo préstamo
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="preFDesde" className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Desde</label>
            <input id="preFDesde" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} className={input} />
          </div>
          <div>
            <label htmlFor="preFHasta" className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Hasta</label>
            <input id="preFHasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} className={input} />
          </div>
          <div>
            <label htmlFor="preFAgencia" className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Agencia (presta o recibe)</label>
            <select id="preFAgencia" value={agencia} onChange={(e) => setAgencia(e.target.value)} className={input}>
              <option value="">Todas</option>
              {agenciasVisibles.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar piloto, auxiliar, placa, agencia, PRE-…"
              aria-label="Buscar préstamos"
              className={`${input} w-full pl-8`}
            />
          </div>
          <button
            id="btnExcelPrestamos"
            type="button"
            onClick={() => void descargarExcel()}
            className="min-h-[40px] px-3 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-emerald-100"
          >
            <Download className="w-4 h-4" /> Descargar Excel
          </button>
        </div>
        {!usaRango && <p className="text-[10.5px] text-slate-400">Las fechas aplican a las pestañas Devueltos y Todos.</p>}
      </div>

      {tablaFalta && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            El módulo de Préstamos todavía no está activado en la base de datos. Un administrador debe ejecutar una vez el archivo{' '}
            <b>supabase/fase9_prestamos.sql</b> en Supabase (SQL Editor).
          </span>
        </div>
      )}

      {isAdmin && conteo.porAutorizar > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl px-4 py-3 text-xs">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span className="flex-1">
            <b>{conteo.porAutorizar} préstamo(s) esperan tu autorización.</b> Las recargas hechas en préstamo no se pagan hasta que esté autorizado y devuelto.
          </span>
          {vista !== 'porAutorizar' && (
            <button type="button" onClick={() => setVista('porAutorizar')} className="min-h-[36px] px-3 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold cursor-pointer">
              Ver por autorizar
            </button>
          )}
        </div>
      )}
      {conteo.sinDevolver > 0 && (
        <div className="flex flex-wrap items-center gap-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-4 py-3 text-xs">
          <Clock className="w-4 h-4 shrink-0" />
          <span className="flex-1">
            <b>{conteo.sinDevolver} préstamo(s) ya vencieron y no tienen devolución registrada.</b> Ya no se pueden asignar en la agencia que recibe; registra la
            devolución para cerrar el préstamo.
          </span>
          {vista !== 'sinDevolver' && (
            <button type="button" onClick={() => setVista('sinDevolver')} className="min-h-[36px] px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer">
              Ver vencidos
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: 'Vigentes hoy', v: conteo.vigentes, s: `${recursosEnUso} recurso(s) prestado(s)`, c: 'border-teal-300 text-teal-800', k: 'vigentes' as Vista },
          { l: 'Por autorizar', v: conteo.porAutorizar, s: 'falta OK del administrador', c: 'border-amber-300 text-amber-800', k: 'porAutorizar' as Vista },
          { l: 'Vencidos sin devolver', v: conteo.sinDevolver, s: 'registrar devolución', c: 'border-rose-200 text-rose-700', k: 'sinDevolver' as Vista },
          { l: 'Devueltos', v: conteo.devueltos, s: 'en el rango de fechas', c: 'border-emerald-300 text-emerald-800', k: 'devueltos' as Vista },
        ].map((k) => (
          <button
            key={k.l}
            type="button"
            onClick={() => setVista(k.k)}
            aria-pressed={vista === k.k}
            className={`text-left bg-white border rounded-2xl p-4 shadow-sm cursor-pointer hover:shadow ${k.c} ${vista === k.k ? 'ring-2 ring-slate-800' : ''}`}
          >
            <p className="text-[10.5px] font-semibold uppercase tracking-wide">{k.l}</p>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{k.v}</p>
            <p className="text-[11px] text-slate-500">{k.s}</p>
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-1" role="tablist" aria-label="Préstamos">
          {tabs.map((t) => (
            <button
              key={t.k}
              type="button"
              role="tab"
              aria-selected={vista === t.k}
              onClick={() => setVista(t.k)}
              className={`min-h-[40px] px-3.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                vista === t.k ? t.on : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {t.l}
              <span className={`px-1.5 rounded-md text-[10.5px] tabular-nums ${vista === t.k ? 'bg-white/25' : 'bg-slate-100'}`}>{t.n}</span>
            </button>
          ))}
        </div>
        {filtrados.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <ArrowLeftRight className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-500">Sin préstamos en esta vista</p>
            <p className="text-xs text-slate-400">Registra uno con "Nuevo préstamo".</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10.5px] uppercase text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2.5">No.</th>
                  <th className="text-left px-3 py-2.5">Recursos</th>
                  <th className="text-left px-3 py-2.5">Presta → Recibe</th>
                  <th className="text-left px-3 py-2.5">Fechas</th>
                  <th className="text-left px-3 py-2.5">Motivo</th>
                  <th className="text-left px-3 py-2.5">Autorización</th>
                  <th className="text-left px-3 py-2.5">Devolución</th>
                  <th className="text-right px-4 py-2.5">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtrados.map((p) => {
                  const e = estadoPrestamo(p);
                  const k = clasif(p);
                  const puedeEditar = isAdmin || (e !== 'Autorizado' && !p.devuelto);
                  const puedeEliminar = isAdmin || (canDelete && e !== 'Autorizado');
                  const abierta = accion?.id === p.id ? accion : null;
                  return (
                    <React.Fragment key={p.id}>
                      <tr className="align-top hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-mono font-bold text-teal-700 whitespace-nowrap">{formatoCorrelativoPrestamo(p.correlativo) || '—'}</td>
                        <td className="px-3 py-3 min-w-[200px]">
                          {p.recursos.map((r) => {
                            const I = ICONO[r.tipo];
                            return (
                              <span key={`${r.tipo}${r.id}`} className="flex items-center gap-1.5 py-0.5">
                                <I className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <b className="text-slate-800">{r.nombre}</b>
                                {r.detalle && <span className="text-[10px] text-slate-400">{r.detalle}</span>}
                              </span>
                            );
                          })}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="font-semibold text-slate-700">{p.agenciaOrigen}</span>
                          <span className="mx-1 text-slate-400">→</span>
                          <span className="font-semibold text-teal-700">{p.agenciaDestino}</span>
                          <span className="block text-[10px] text-slate-400">Solicitó: {p.solicitadoPor}</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className="font-semibold text-slate-700">
                            {fmtFecha(p.fechaInicio)} – {fmtFecha(p.fechaFin)}
                          </span>
                          <span className="block text-[10px] text-slate-400">{diasEntre(p.fechaInicio, p.fechaFin)} día(s)</span>
                          {k.vigente && <span className="inline-flex mt-0.5 px-1.5 rounded bg-teal-50 border border-teal-200 text-teal-700 text-[10px] font-bold">Vigente hoy</span>}
                          {k.programado && <span className="inline-flex mt-0.5 px-1.5 rounded bg-sky-50 border border-sky-200 text-sky-700 text-[10px] font-bold">Programado</span>}
                        </td>
                        <td className="px-3 py-3 text-slate-600 max-w-[220px]">
                          <span className="line-clamp-3" title={p.motivo}>
                            {p.motivo}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold ${
                              e === 'Autorizado'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : e === 'Rechazado'
                                ? 'bg-rose-50 text-rose-700 border-rose-300'
                                : 'bg-amber-50 text-amber-800 border-amber-300'
                            }`}
                          >
                            {e === 'Autorizado' ? <Check className="w-3 h-3" /> : e === 'Rechazado' ? <X className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                            {e}
                          </span>
                          {p.autorizadoPor && <span className="block text-[10px] text-slate-400 mt-0.5">{p.autorizadoPor} · {fmtHora(p.autorizadoEn)}</span>}
                          {e === 'Rechazado' && p.motivoRechazo && <span className="block text-[10px] text-rose-600 whitespace-normal max-w-[170px]">Motivo: {p.motivoRechazo}</span>}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          {p.devuelto ? (
                            <>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold bg-emerald-50 text-emerald-800 border-emerald-300">
                                <Undo2 className="w-3 h-3" /> Devuelto
                              </span>
                              <span className="block text-[10px] text-slate-400 mt-0.5">{p.devueltoPor} · {fmtHora(p.devueltoEn)}</span>
                            </>
                          ) : e === 'Rechazado' ? (
                            <span className="text-[11px] text-slate-400">No aplica</span>
                          ) : (
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-md border text-[11px] font-bold ${
                                k.sinDevolver ? 'bg-rose-50 text-rose-700 border-rose-300' : 'bg-slate-50 text-slate-600 border-slate-200'
                              }`}
                            >
                              {k.sinDevolver ? 'Vencido sin devolver' : 'Sin devolver'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end items-center gap-1.5 flex-wrap">
                            {isAdmin && e !== 'Autorizado' && (
                              <button
                                type="button"
                                disabled={procesando}
                                onClick={() => void autorizar(p)}
                                aria-label={`Autorizar ${etq(p)}`}
                                className="min-h-[36px] px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-60"
                              >
                                <Check className="w-3.5 h-3.5" /> Autorizar
                              </button>
                            )}
                            {isAdmin && e !== 'Rechazado' && !p.devuelto && (
                              <button
                                type="button"
                                disabled={procesando}
                                onClick={() => setAccion({ id: p.id, tipo: 'rechazar', texto: '' })}
                                aria-label={`Rechazar ${etq(p)}`}
                                className="min-h-[36px] px-2.5 rounded-lg border border-rose-300 text-rose-700 hover:bg-rose-50 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" /> Rechazar
                              </button>
                            )}
                            {!p.devuelto && e !== 'Rechazado' && (
                              <button
                                type="button"
                                disabled={procesando}
                                onClick={() => setAccion({ id: p.id, tipo: 'devolver', texto: '' })}
                                aria-label={`Registrar devolución ${etq(p)}`}
                                className="min-h-[36px] px-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <Undo2 className="w-3.5 h-3.5" /> Devolver
                              </button>
                            )}
                            {puedeEditar && (
                              <button
                                type="button"
                                onClick={() => setModal({ abierto: true, prestamo: p })}
                                aria-label={`Editar ${etq(p)}`}
                                title="Editar"
                                className="w-9 h-9 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                            )}
                            {puedeEliminar && (
                              <button
                                type="button"
                                onClick={() => setAccion({ id: p.id, tipo: 'eliminar', texto: '' })}
                                aria-label={`Eliminar ${etq(p)}`}
                                title="Eliminar"
                                className="w-9 h-9 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 flex items-center justify-center cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {abierta && (
                        <tr className={abierta.tipo === 'devolver' ? 'bg-teal-50/60' : 'bg-rose-50/60'}>
                          <td colSpan={8} className="px-4 py-3">
                            <form
                              className="flex flex-wrap items-center gap-2"
                              onSubmit={(ev) => {
                                ev.preventDefault();
                                if (abierta.tipo === 'rechazar') {
                                  if (abierta.texto.trim().length < 5) return;
                                  void rechazar(p, abierta.texto.trim());
                                } else if (abierta.tipo === 'devolver') void devolver(p, abierta.texto.trim());
                                else void eliminar(p);
                              }}
                            >
                              {abierta.tipo === 'eliminar' ? (
                                <span className="text-[11px] font-bold text-rose-800 flex-1">¿Eliminar el préstamo {etq(p)}? Esta acción no se puede deshacer.</span>
                              ) : (
                                <>
                                  <label htmlFor={`preAccion-${p.id}`} className={`text-[11px] font-bold ${abierta.tipo === 'devolver' ? 'text-teal-800' : 'text-rose-800'}`}>
                                    {abierta.tipo === 'devolver' ? `Devolución de ${etq(p)} (comentario opcional):` : `Motivo del rechazo (${etq(p)}):`}
                                  </label>
                                  <input
                                    id={`preAccion-${p.id}`}
                                    autoFocus
                                    value={abierta.texto}
                                    maxLength={200}
                                    onChange={(ev) => setAccion({ ...abierta, texto: ev.target.value })}
                                    placeholder={abierta.tipo === 'devolver' ? 'Ej. Regresaron completos a la agencia' : 'Ej. No se aprobó el apoyo'}
                                    className="flex-1 min-w-[240px] min-h-[40px] px-3 border border-slate-300 rounded-lg text-xs bg-white outline-none focus:ring-2 focus:ring-blue-300"
                                  />
                                </>
                              )}
                              <button
                                type="submit"
                                disabled={procesando || (abierta.tipo === 'rechazar' && abierta.texto.trim().length < 5)}
                                className={`min-h-[40px] px-3 rounded-lg text-white text-xs font-bold cursor-pointer disabled:opacity-50 ${
                                  abierta.tipo === 'devolver' ? 'bg-teal-600' : 'bg-rose-600'
                                }`}
                              >
                                {abierta.tipo === 'devolver' ? 'Registrar devolución' : abierta.tipo === 'rechazar' ? 'Rechazar préstamo' : 'Sí, eliminar'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setAccion(null)}
                                className="min-h-[40px] px-3 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 cursor-pointer bg-white"
                              >
                                Cancelar
                              </button>
                            </form>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PrestamoModal
        isOpen={modal.abierto}
        onClose={() => setModal({ abierto: false, prestamo: null })}
        inicial={modal.prestamo}
        staff={staff}
        trucks={trucks}
        agenciasOrigen={Array.from(new Set([...staff.map((s) => s.agencia || ''), ...trucks.map((t) => t.agencia || '')]))
          .filter(Boolean)
          .sort()}
        agenciasDestino={agenciasTodas}
        agenciaPorDefecto={agencia || (agenciaGeneral !== 'TODAS' ? agenciaGeneral : '')}
        existentes={prestamos}
        usuario={usuario}
        guardando={guardando}
        avisoReautorizar={!!modal.prestamo && !isAdmin && estadoPrestamo(modal.prestamo) !== 'Pendiente'}
        onGuardar={(d) => void handleGuardar(d)}
      />
    </div>
  );
};
