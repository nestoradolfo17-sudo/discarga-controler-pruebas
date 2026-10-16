import logoDiscarga from '../assets/logo-discarga.png';
import type { Recarga } from '../types';
import { formatoCorrelativo } from '../services/recargas';

// --- Boleta de recarga para imprimir ---
// Media carta: en una hoja carta salen dos copias iguales (Original para la
// agencia y Copia para el piloto), con espacio para firmas. Si la recarga aún
// no está autorizada, la boleta lo dice claramente y no es válida para pago.

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const fecha = (iso: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso || '-');
const fechaHora = (iso?: string) => {
  if (!iso) return '-';
  try {
    return new Intl.DateTimeFormat('es-GT', {
      timeZone: 'America/Guatemala',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

const VIAJES: Record<string, number> = { Simple: 1, Doble: 2, Triple: 3 };

function copia(r: Recarga, etiqueta: string, logo: string): string {
  const estado = r.estado || 'Pendiente';
  const aut = estado === 'Autorizada';
  const aux = (r.auxiliares || []).filter(Boolean);
  const fila = (k: string, v: string) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`;
  return `
  <section class="boleta">
    ${aut ? '' : `<div class="marca">${estado === 'Rechazada' ? 'RECHAZADA' : 'PENDIENTE DE AUTORIZACIÓN'}</div>`}
    <header>
      <img src="${esc(logo)}" alt="Discarga" />
      <div class="tit">
        <h1>BOLETA DE RECARGA</h1>
        <p>DISCARGA CONTROLER · ${esc(etiqueta)}</p>
      </div>
      <div class="corr">
        <span>No.</span>
        <b>${esc(formatoCorrelativo(r.correlativo) || 'SIN NÚMERO')}</b>
        <em class="${aut ? 'ok' : estado === 'Rechazada' ? 'no' : 'pend'}">${esc(estado.toUpperCase())}</em>
      </div>
    </header>
    <table class="datos">
      ${fila('Fecha de recarga', esc(fecha(r.fecha)))}
      ${fila('Ruta', r.sinRuta || !r.rutaId ? '<b>SIN RUTA</b>' : `<b>${esc(r.rutaId)}</b>`)}
      ${fila('Agencia', esc(r.agencia) + (r.segmento ? ` · ${esc(r.segmento)}` : ''))}
      ${fila('Tipo', `<b>${esc(r.tipo)}</b> (${VIAJES[r.tipo] || 1} recarga${(VIAJES[r.tipo] || 1) > 1 ? 's' : ''})`)}
      ${fila('Camión', esc(r.camionPlaca || '-'))}
      ${fila('Piloto', r.conductor ? `<b>${esc(r.conductor)}</b>` : 'Sin piloto')}
      ${fila('Auxiliares', aux.length ? aux.map(esc).join('<br/>') : '-')}
      ${fila('Comentarios', esc(r.comentario || '-'))}
    </table>
    <p class="meta">
      Registró: ${esc(r.creadoPor)} · ${esc(fechaHora(r.creadoEn))}
      ${aut ? ` &nbsp;|&nbsp; Autorizó: ${esc(r.autorizadoPor || '-')} · ${esc(fechaHora(r.autorizadoEn))}` : ''}
      ${estado === 'Rechazada' && r.motivoRechazo ? ` &nbsp;|&nbsp; Motivo de rechazo: ${esc(r.motivoRechazo)}` : ''}
    </p>
    ${aut ? '' : '<p class="aviso">Esta boleta NO es válida para pago hasta que un administrador autorice la recarga.</p>'}
    <div class="firmas">
      <div><span></span>Piloto</div>
      <div><span></span>Supervisor de agencia</div>
      <div><span></span>Autorizado por</div>
    </div>
  </section>`;
}

export function htmlBoletaRecarga(r: Recarga, logo: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8" />
<title>Boleta de recarga ${esc(formatoCorrelativo(r.correlativo))}</title>
<style>
  @page { size: letter portrait; margin: 8mm 10mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #0f172a; font-size: 11.5px; }
  .boleta { position: relative; height: 122mm; border: 1.5px solid #000c7d; border-radius: 6px; padding: 9px 12px; overflow: hidden; display: flex; flex-direction: column; }
  .corte { height: 8mm; border-bottom: 1px dashed #94a3b8; margin-bottom: 8mm; text-align: center; color: #94a3b8; font-size: 9px; line-height: 14mm; }
  header { display: flex; align-items: center; gap: 10px; border-bottom: 2px solid #000c7d; padding-bottom: 6px; margin-bottom: 6px; }
  header img { width: 42px; height: 42px; object-fit: contain; }
  .tit { flex: 1; }
  h1 { margin: 0; font-size: 17px; color: #000c7d; letter-spacing: .5px; }
  .tit p { margin: 2px 0 0; font-size: 10px; color: #475569; }
  .corr { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .corr span { font-size: 9px; color: #64748b; }
  .corr b { font-size: 18px; font-family: 'Courier New', monospace; color: #b91c1c; }
  .corr em { font-style: normal; font-size: 9.5px; font-weight: 700; padding: 1px 6px; border-radius: 4px; border: 1px solid; }
  .corr em.ok { color: #047857; border-color: #047857; }
  .corr em.pend { color: #b45309; border-color: #b45309; }
  .corr em.no { color: #b91c1c; border-color: #b91c1c; }
  table.datos { width: 100%; border-collapse: collapse; }
  table.datos th { text-align: left; width: 30%; padding: 3.5px 6px; background: #dcecfa; color: #01215b; font-size: 10.5px; border: 1px solid #bfd3ea; vertical-align: top; }
  table.datos td { padding: 3.5px 6px; border: 1px solid #cbd5e1; vertical-align: top; }
  .meta { margin: 5px 0 0; font-size: 9.5px; color: #475569; }
  .aviso { margin: 4px 0 0; font-size: 10px; font-weight: 700; color: #b45309; }
  .firmas { margin-top: auto; display: flex; gap: 16px; padding-top: 22px; }
  .firmas div { flex: 1; text-align: center; font-size: 10px; color: #334155; }
  .firmas span { display: block; border-top: 1px solid #0f172a; margin-bottom: 3px; }
  .marca { position: absolute; top: 46%; left: 50%; transform: translate(-50%, -50%) rotate(-18deg); font-size: 34px; font-weight: 800; color: rgba(185, 28, 28, .13); white-space: nowrap; pointer-events: none; }
</style></head><body>
${copia(r, 'ORIGINAL · AGENCIA', logo)}
<div class="corte">✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</div>
${copia(r, 'COPIA · PILOTO', logo)}
</body></html>`;
}

/** Abre el cuadro de impresión del navegador con la boleta (dos copias). */
export function imprimirBoletaRecarga(r: Recarga): void {
  let logo = String(logoDiscarga);
  try {
    logo = new URL(logo, window.location.href).href;
  } catch {
    // se usa tal cual
  }
  const html = htmlBoletaRecarga(r, logo);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);
  const doc = frame.contentDocument || frame.contentWindow?.document;
  if (!doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const imprimir = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } finally {
      setTimeout(() => frame.remove(), 60000);
    }
  };
  const img = doc.querySelector('img');
  if (img && !(img as HTMLImageElement).complete) {
    img.addEventListener('load', imprimir, { once: true });
    img.addEventListener('error', imprimir, { once: true });
  } else {
    setTimeout(imprimir, 50);
  }
}
