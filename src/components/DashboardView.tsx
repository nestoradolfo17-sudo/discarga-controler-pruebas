import React, { useRef, useState } from 'react';
import { Route, Truck, Staff } from '../types';
import { DashboardExecutive } from './DashboardExecutive';
import { DashboardSeguimiento } from './DashboardSeguimiento';
import { DashboardRecargas } from './DashboardRecargas';
import type { SituacionViaje } from '../services/recargas';
import { FileDown } from 'lucide-react';
import { Button } from './ui/Button';

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

// Vistas del Dashboard: Despacho · Cajas y Rutas Abiertas · Recargas.
// La preferencia se recuerda en este navegador.
type DashView = 'despacho' | 'seguimiento' | 'recargas';
const VISTAS: [DashView, string][] = [
  ['despacho', 'Despacho'],
  ['seguimiento', 'Cajas y Rutas Abiertas'],
  ['recargas', 'Recargas'],
];

// --- Descargar PDF de lo que se ve ---
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
      return v === 'seguimiento' || v === 'recargas' ? v : 'despacho';
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
  const nombreVista = VISTAS.find(([k]) => k === view)?.[1] || 'Dashboard';
  const agencia = props.selectedAgency === 'TODAS' ? 'Todas las agencias' : props.selectedAgency;
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
          title="Descargar en PDF el dashboard tal como se ve, con los filtros elegidos"
          onClick={() =>
            contenidoRef.current &&
            descargarPdf(
              contenidoRef.current,
              `Dashboard ${nombreVista} - ${agencia} - ${hoy}`,
              `Vista: ${nombreVista} · Agencia: ${agencia}${props.usuario ? ` · Descargado por: ${props.usuario}` : ''}`
            )
          }
        >
          Descargar PDF
        </Button>
      </div>
      <div ref={contenidoRef}>
        {view === 'seguimiento' ? (
          <DashboardSeguimiento
            routes={props.routes}
            liquidatedRoutes={props.liquidatedRoutes}
            selectedAgency={props.selectedAgency}
            historyLimitedDays={props.historyLimitedDays}
            onLoadFullHistory={props.onLoadFullHistory}
            isLoadingFullHistory={props.isLoadingFullHistory}
          />
        ) : view === 'recargas' ? (
          <DashboardRecargas staff={props.staff} selectedAgency={props.selectedAgency} puedeVerAgencia={props.puedeVerAgencia} situacionRecargas={props.situacionRecargas} />
        ) : (
          <DashboardExecutive
            routes={props.routes}
            liquidatedRoutes={props.liquidatedRoutes}
            trucks={props.trucks}
            staff={props.staff}
            stats={props.stats}
            selectedAgency={props.selectedAgency}
            historyLimitedDays={props.historyLimitedDays}
            onLoadFullHistory={props.onLoadFullHistory}
            isLoadingFullHistory={props.isLoadingFullHistory}
          />
        )}
      </div>
    </div>
  );
};
