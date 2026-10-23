import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { leerLogoPng } from './xlsxPro';
import logoDiscargaUrl from '../assets/logo-discarga.png';

// --- PDF profesional de los Dashboards ---
//
// Antes el botón "Descargar PDF" imprimía una copia de la pantalla. Ahora cada
// dashboard entrega sus DATOS (indicadores y tablas) y aquí se arma un reporte
// con formato propio: encabezado con el logo y los colores de DISCARGA,
// tarjetas de indicadores, tablas con totales y pie con número de página.
// Usa jsPDF (ya incluido en la app); no necesita internet.

export type TonoPdf = 'ok' | 'warn' | 'crit' | 'info';

export interface KpiPdf {
  label: string;
  valor: string;
  sub?: string;
  tono?: TonoPdf;
}

export interface ColumnaPdf {
  t: string;
  num?: boolean; // alinear a la derecha
  ancho?: number; // ancho fijo en puntos (opcional)
}

export interface TablaPdf {
  titulo: string;
  sub?: string;
  columnas: ColumnaPdf[];
  filas: (string | number)[][];
  total?: (string | number)[];
  vacio?: string; // texto si no hay filas (si no se da, la tabla se omite)
}

export interface ReportePdf {
  titulo: string; // "Dashboard de Despacho"
  periodo: string;
  agencia: string;
  kpis: KpiPdf[];
  tablas: TablaPdf[];
  notas?: string[];
}

const RGB = {
  marino: [44, 55, 144] as [number, number, number],
  cielo: [90, 172, 228] as [number, number, number],
  celeste: [234, 245, 252] as [number, number, number],
  totalFondo: [214, 228, 245] as [number, number, number],
  borde: [201, 214, 234] as [number, number, number],
  texto: [31, 41, 55] as [number, number, number],
  gris: [91, 101, 119] as [number, number, number],
  ok: [12, 163, 12] as [number, number, number],
  warn: [237, 161, 0] as [number, number, number],
  crit: [208, 59, 59] as [number, number, number],
  info: [90, 172, 228] as [number, number, number],
};

// La fuente estándar del PDF no tiene emojis ni algunos símbolos: se cambian.
const limpio = (v: unknown) =>
  String(v ?? '')
    .replace(/[→⟶]/g, '>')
    .replace(/[≥]/g, '>=')
    .replace(/[≤]/g, '<=')
    .replace(/[✓✔]/g, 'Sí')
    .replace(/[✕✖]/g, 'X')
    .replace(/[⚠]/g, '!')
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, '')
    .trim();

const fechaHora = () =>
  new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

/** Arma el PDF y lo descarga. */
export async function descargarReportePdf(rep: ReportePdf, opciones: { archivo: string; usuario?: string }) {
  const logo = await leerLogoPng(logoDiscargaUrl);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 32; // margen
  const generado = fechaHora();

  // ---------- Encabezado (página 1) ----------
  doc.setFillColor(...RGB.marino);
  doc.rect(0, 0, W, 74, 'F');
  doc.setFillColor(...RGB.cielo);
  doc.rect(0, 74, W, 4, 'F');
  if (logo) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(M, 11, 52, 52, 8, 8, 'F');
    try {
      doc.addImage(logo, 'PNG', M + 3, 14, 46, 46);
    } catch {
      /* sin logo */
    }
  }
  const xT = logo ? M + 64 : M;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(limpio(rep.titulo), xT, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(214, 228, 245);
  doc.text(limpio(`${rep.periodo}   ·   Agencia: ${rep.agencia}`), xT, 52);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('DISCARGA CONTROLER', W - M, 30, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(214, 228, 245);
  doc.text(limpio(`Generado: ${generado}`), W - M, 45, { align: 'right' });
  if (opciones.usuario) doc.text(limpio(`Por: ${opciones.usuario}`), W - M, 58, { align: 'right' });

  let y = 96;

  // ---------- Indicadores (tarjetas) ----------
  if (rep.kpis.length) {
    const porFila = Math.min(rep.kpis.length, rep.kpis.length > 6 ? 4 : rep.kpis.length);
    const gap = 10;
    const ancho = (W - 2 * M - gap * (porFila - 1)) / porFila;
    const alto = 62;
    rep.kpis.forEach((k, i) => {
      const col = i % porFila;
      const fila = Math.floor(i / porFila);
      const x = M + col * (ancho + gap);
      const yy = y + fila * (alto + gap);
      doc.setDrawColor(...RGB.borde);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, yy, ancho, alto, 6, 6, 'FD');
      doc.setFillColor(...RGB[k.tono || 'info']);
      doc.rect(x, yy + 6, 3.5, alto - 12, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...RGB.gris);
      doc.text(limpio(k.label).toUpperCase(), x + 12, yy + 16, { maxWidth: ancho - 18 });
      doc.setFontSize(18);
      doc.setTextColor(...RGB.marino);
      doc.text(limpio(k.valor), x + 12, yy + 39);
      if (k.sub) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...RGB.gris);
        const s = doc.splitTextToSize(limpio(k.sub), ancho - 18) as string[];
        doc.text(s[0] + (s.length > 1 ? '…' : ''), x + 12, yy + 53);
      }
    });
    y += Math.ceil(rep.kpis.length / porFila) * (alto + gap) + 6;
  }

  // ---------- Tablas ----------
  const tituloSeccion = (t: string, sub?: string) => {
    if (y > H - 90) {
      doc.addPage();
      y = 48;
    }
    doc.setFillColor(...RGB.cielo);
    doc.rect(M, y - 9, 3.5, 13, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...RGB.marino);
    doc.text(limpio(t), M + 9, y + 1);
    if (sub) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...RGB.gris);
      doc.text(limpio(sub), M + 9, y + 12);
      y += 11;
    }
    y += 8;
  };

  rep.tablas.forEach((t) => {
    if (!t.filas.length && !t.vacio) return;
    tituloSeccion(t.titulo, t.sub);
    if (!t.filas.length) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...RGB.gris);
      doc.text(limpio(t.vacio), M + 9, y + 8);
      y += 26;
      return;
    }
    const columnStyles: Record<number, { halign?: 'right' | 'left'; cellWidth?: number }> = {};
    t.columnas.forEach((c, i) => {
      columnStyles[i] = { halign: c.num ? 'right' : 'left', ...(c.ancho ? { cellWidth: c.ancho } : {}) };
    });
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, top: 48, bottom: 40 },
      head: [t.columnas.map((c) => limpio(c.t))],
      body: t.filas.map((f) => f.map((v) => limpio(v))),
      foot: t.total ? [t.total.map((v) => limpio(v))] : undefined,
      showFoot: 'lastPage',
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.2, cellPadding: 4, textColor: RGB.texto, lineColor: RGB.borde, lineWidth: 0.5, overflow: 'linebreak' },
      headStyles: { fillColor: RGB.marino, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.2, halign: 'center', valign: 'middle' },
      footStyles: { fillColor: RGB.totalFondo, textColor: RGB.marino, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: RGB.celeste },
      columnStyles,
      didParseCell: (d) => {
        if (d.section === 'foot') d.cell.styles.halign = t.columnas[d.column.index]?.num ? 'right' : 'left';
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY || y) + 26;
  });

  if (rep.notas?.length) {
    if (y > H - 70) {
      doc.addPage();
      y = 48;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...RGB.gris);
    rep.notas.forEach((n) => {
      const l = doc.splitTextToSize(limpio(n), W - 2 * M) as string[];
      doc.text(l, M, y);
      y += l.length * 10 + 2;
    });
  }

  // ---------- Encabezado corto (páginas 2+) y pie en todas ----------
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    if (p > 1) {
      doc.setFillColor(...RGB.marino);
      doc.rect(0, 0, W, 26, 'F');
      doc.setFillColor(...RGB.cielo);
      doc.rect(0, 26, W, 2.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(255, 255, 255);
      doc.text(limpio(`${rep.titulo}  ·  ${rep.agencia}`), M, 17);
      doc.setFont('helvetica', 'normal');
      doc.text(limpio(rep.periodo), W - M, 17, { align: 'right' });
    }
    doc.setDrawColor(...RGB.borde);
    doc.setLineWidth(0.6);
    doc.line(M, H - 26, W - M, H - 26);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...RGB.gris);
    doc.text('DISCARGA, S.A.  ·  DISCARGA CONTROLER', M, H - 14);
    doc.text(limpio(`${rep.titulo}  ·  Generado ${generado}`), W / 2, H - 14, { align: 'center' });
    doc.text(`Página ${p} de ${total}`, W - M, H - 14, { align: 'right' });
  }

  doc.save(opciones.archivo.replace(/[\\/:*?"<>|]+/g, '-'));
}
