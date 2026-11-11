import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Route, Truck, Staff } from '../types';
import { DashboardExecutive } from './DashboardExecutive';
import { DashboardSeguimiento } from './DashboardSeguimiento';
import { DashboardRecargas } from './DashboardRecargas';
import type { SituacionViaje } from '../services/recargas';
import { FileDown } from 'lucide-react';
import { Button } from './ui/Button';
import { descargarReportePdf, type ReportePdf } from '../utils/dashboardPdf';

interface DashboardStats {
  pendientes: number;
  transito: number;
  abiertas: number;
  liquidadas: number;
  liquidadasTotal: number;
  pisoHoy: number;
  fechaHoy: string;
  cajasFisicasHoy: number;
  cajasEntregadasHoy: number;
}

interface DashboardViewProps {
  // Rutas del día (todos los estados) visibles para el usuario en sesión, respetando
  // la agencia seleccionada en la barra superior y los permisos de agencia del usuario.
  routes: Route[];
  // Rutas activas (no liquidadas) visibles SIN el filtro de agencia de arriba.
  activeRoutesByAgency: Route[];
  // Rutas liquidadas visibles (respeta agencia seleccionada + permisos de agencia).
  liquidatedRoutes: Route[];
  trucks: Truck[];
  staff: Staff[];
  stats: DashboardStats;
  selectedAgency: string;
  // Nombre del filtro cuando no es una sola agencia ("Todas" o "Xela, Escuintla").
  etiquetaTodas?: string;
  // Historial cargado parcialmente (para el filtro de fechas).
  historyLimitedDays?: number;
  onLoadFullHistory?: () => void;
  isLoadingFullHistory?: boolean;
  // Agencias que el usuario puede ver (Dashboard de Recargas).
  puedeVerAgencia?: (agencia: string) => boolean;
  // ¿El viaje de cada recarga automática ya se liquidó? (Dashboard de Recargas)
  situacionRecargas?: (id: string) => SituacionViaje;
  // Quién descarga el PDF (va en el encabezado).
  usuario?: string;
}

// Vistas del Dashboard: Despacho (inicio del día) · Cajas y Rutas Abiertas
// (pendientes de cerrar + liquidación: cumplimiento, entregas, devoluciones) · Recargas.
// La preferencia se recuerda en este navegador.
type DashView = 'despacho' | 'seguimiento' | 'recargas';
const VISTAS: [DashView, string][] = [
  ['despacho', 'Despacho'],
  ['seguimiento', 'Cajas y Rutas Abiertas'],
  ['recargas', 'Recargas'],
];

// --- Descargar PDF ---
// Cada dashboard entrega sus DATOS (registrarReporte) y se arma un PDF con
// formato propio (utils/dashboardPdf.ts). La copia de pantalla de abajo queda
// solo como respaldo si un dashboard no entregara sus datos.
// Copia el dashboard tal como está en pantalla (con los filtros elegidos) a una
// página aparte con los mismos estilos de la app y abre "Guardar como PDF".
// No usa programas externos (ver la regla de seguridad del navegador).
function descargarPdf(contenido: HTMLElement, titulo: string, detalle: string) {
  const copia = contenido.cloneNode(true) as HTMLElement;
  // Lo que es solo para usar en pantalla no va en el PDF.
  copia.querySelectorAll('[data-no-pdf]').forEach((el) => el.remove());
  // Conservar lo elegido en listas y fechas (cloneNode no copia el valor actual).
  const origSel = contenido.querySelectorAll('select');
  copia.querySelectorAll('select').forEach((sel, i) => {
    const v = (origSel[i] as HTMLSelectElement | undefined)?.value;
    Array.from(sel.options).forEach((o) => (o.selected = o.value === v));
    Array.from(sel.options).forEach((o) => (o.value === v ? o.setAttribute('selected', '') : o.removeAttribute('selected')));
  });
  const origIn = contenido.querySelectorAll('input');
  copia.querySelectorAll('input').forEach((inp, i) => {
    const o = origIn[i] as HTMLInputElement | undefined;
    if (!o) return;
    if (o.type === 'checkbox' || o.type === 'radio') {
      if (o.checked) inp.setAttribute('checked', '');
    } else inp.setAttribute('value', o.value);
  });

  const estilos = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((el) => (el instanceof HTMLLinkElement ? `<link rel="stylesheet" href="${el.href.replace(/"/g, '&quot;')}">` : `<style>${el.textContent || ''}</style>`))
    .join('\n');
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1200px;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title>${estilos}
<style>
  @page { size: letter landscape; margin: 10mm; }
  @media print { @page { size: letter landscape; margin: 10mm; } }
  html, body { background: #fff !important; }
  body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  section, .rounded-2xl { break-inside: avoid; }
  .pdf-head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #0f172a; padding-bottom: 6px; margin-bottom: 12px; font-family: Inter, sans-serif; }
  .pdf-head b { font-size: 16px; color: #0f172a; }
  .pdf-head span { font-size: 11px; color: #475569; }
</style></head>
<body><div class="pdf-head"><div><b>DISCARGA CONTROLER · ${esc(titulo)}</b><br><span>${esc(detalle)}</span></div><span>Generado: ${esc(
    new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', dateStyle: 'short', timeStyle: 'short' }).format(new Date())
  )}</span></div>${copia.outerHTML}</body></html>`);
  doc.close();

  const tituloOriginal = document.title;
  // El nombre del archivo PDF sale del título de la página.
  document.title = titulo.replace(/[\\/:*?"<>|]+/g, '-');
  let hecho = false;
  const imprimir = () => {
    if (hecho) return;
    hecho = true;
    setTimeout(() => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } finally {
        setTimeout(() => {
          document.title = tituloOriginal;
          frame.remove();
        }, 1500);
      }
    }, 400);
  };
  if (doc.readyState === 'complete') imprimir();
  else frame.addEventListener('load', imprimir, { once: true });
  setTimeout(imprimir, 3000);
}

export const DashboardView: React.FC<DashboardViewProps> = (props) => {
  const [view, setView] = useState<DashView>(() => {
    try {
      const v = localStorage.getItem('dc_dashboard_view');
      // 'liquidacion' fue una pestaña aparte por poco tiempo: ahora vive en Cajas y Rutas Abiertas.
      return v === 'seguimiento' || v === 'liquidacion' ? 'seguimiento' : v === 'recargas' ? 'recargas' : 'despacho';
    } catch {
      return 'despacho';
    }
  });
  const choose = (v: DashView) => {
    setView(v);
    try {
      localStorage.setItem('dc_dashboard_view', v);
    } catch {
      /* sin almacenamiento: solo dura esta sesión */
    }
  };
  const contenidoRef = useRef<HTMLDivElement>(null);
  // Cómo armar el reporte de la vista actual (lo entrega cada dashboard).
  const armarRef = useRef<(() => ReportePdf) | null>(null);
  const registrarReporte = useCallback((armar: () => ReportePdf) => {
    armarRef.current = armar;
  }, []);
  // Cajas y Rutas Abiertas junta dos reportes (seguimiento + liquidación) en un PDF.
  const armarSegRef = useRef<(() => ReportePdf) | null>(null);
  const armarLiqRef = useRef<(() => ReportePdf) | null>(null);
  const registrarSeg = useCallback((armar: () => ReportePdf) => {
    armarSegRef.current = armar;
  }, []);
  const registrarLiq = useCallback((armar: () => ReportePdf) => {
    armarLiqRef.current = armar;
  }, []);
  useEffect(() => {
    if (view !== 'seguimiento') return;
    armarRef.current = () => {
      const a = armarSegRef.current?.();
      const b = armarLiqRef.current?.();
      if (!a || !b) return (a || b)!;
      return {
        titulo: 'Cajas y Rutas Abiertas · Liquidación',
        periodo: b.periodo,
        agencia: b.agencia || a.agencia,
        kpis: [...a.kpis, ...b.kpis],
        barra: a.barra || b.barra,
        tablas: [...a.tablas, ...b.tablas],
        notas: [...(a.notas || []), ...(b.notas || [])],
      };
    };
  });
  const [generando, setGenerando] = useState(false);
  const nombreVista = VISTAS.find(([k]) => k === view)?.[1] || 'Dashboard';
  const etiquetaTodas = props.etiquetaTodas && props.etiquetaTodas !== 'Todas' ? props.etiquetaTodas : '';
  const agencia = props.selectedAgency === 'TODAS' ? etiquetaTodas || 'Todas las agencias' : props.selectedAgency;
  const hoy = new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date())
    .replace(/\//g, '-');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div role="tablist" aria-label="Vista del dashboard" className="inline-flex bg-slate-100 border border-slate-200 rounded-xl p-1">
          {VISTAS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={view === k}
              onClick={() => choose(k)}
              className={`min-h-[40px] px-4 rounded-lg text-sm font-semibold cursor-pointer transition ${
                view === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <Button
          id="btnDashboardPdf"
          variant="secondary"
          icon={FileDown}
          title="Descargar un reporte PDF con los datos del dashboard y los filtros elegidos"
          disabled={generando}
          onClick={async () => {
            const titulo = `Dashboard ${nombreVista} - ${agencia} - ${hoy}`;
            if (armarRef.current) {
              setGenerando(true);
              try {
                await descargarReportePdf(armarRef.current(), { archivo: `${titulo}.pdf`, usuario: props.usuario });
              } finally {
                setGenerando(false);
              }
              return;
            }
            if (contenidoRef.current)
              descargarPdf(contenidoRef.current, titulo, `Vista: ${nombreVista} · Agencia: ${agencia}${props.usuario ? ` · Descargado por: ${props.usuario}` : ''}`);
          }}
        >
          {generando ? 'Generando…' : 'Descargar PDF'}
        </Button>
      </div>
      <div ref={contenidoRef}>
        {view === 'seguimiento' ? (
          <div className="space-y-6">
            <DashboardSeguimiento
              routes={props.routes}
              liquidatedRoutes={props.liquidatedRoutes}
              selectedAgency={props.selectedAgency}
              etiquetaTodas={props.etiquetaTodas}
              historyLimitedDays={props.historyLimitedDays}
              onLoadFullHistory={props.onLoadFullHistory}
              isLoadingFullHistory={props.isLoadingFullHistory}
              registrarReporte={registrarSeg}
            />
            {/* Liquidación: cómo se cerraron las rutas del periodo. */}
            <DashboardExecutive
              modo="liquidacion"
              routes={props.routes}
              liquidatedRoutes={props.liquidatedRoutes}
              trucks={props.trucks}
              staff={props.staff}
              stats={props.stats}
              selectedAgency={props.selectedAgency}
              etiquetaTodas={props.etiquetaTodas}
              historyLimitedDays={props.historyLimitedDays}
              onLoadFullHistory={props.onLoadFullHistory}
              isLoadingFullHistory={props.isLoadingFullHistory}
              registrarReporte={registrarLiq}
            />
          </div>
        ) : view === 'recargas' ? (
          <DashboardRecargas
            staff={props.staff}
            selectedAgency={props.selectedAgency}
            etiquetaTodas={props.etiquetaTodas}
            puedeVerAgencia={props.puedeVerAgencia}
            situacionRecargas={props.situacionRecargas}
            registrarReporte={registrarReporte}
          />
        ) : (
          <DashboardExecutive
            modo="despacho"
            routes={props.routes}
            liquidatedRoutes={props.liquidatedRoutes}
            trucks={props.trucks}
            staff={props.staff}
            stats={props.stats}
            selectedAgency={props.selectedAgency}
            etiquetaTodas={props.etiquetaTodas}
            historyLimitedDays={props.historyLimitedDays}
            onLoadFullHistory={props.onLoadFullHistory}
            isLoadingFullHistory={props.isLoadingFullHistory}
            registrarReporte={registrarReporte}
          />
        )}
      </div>
    </div>
  );
};
