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

export interface BarraPdf {
  titulo: string;
  sub?: string;
  segmentos: { label: string; valor: number; color: [number, number, number] }[];
}

export interface ReportePdf {
  titulo: string; // "Dashboard de Despacho"
  periodo: string;
  agencia: string;
  kpis: KpiPdf[];
  // Barra apilada (por ejemplo "Balance del día"), debajo de los indicadores.
  barra?: BarraPdf;
  tablas: TablaPdf[];
  notas?: string[];
  // Resumen ejecutivo (frases cortas) que va en la primera hoja, bajo los indicadores.
  resumen?: string[];
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
    const alto = 64;
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
      doc.text(limpio(k.label).toUpperCase(), x + 12, yy + 14, { maxWidth: ancho - 18 });
      doc.setFontSize(18);
      doc.setTextColor(...RGB.marino);
      doc.text(limpio(k.valor), x + 12, yy + 35);
      if (k.sub) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...RGB.gris);
        // Hasta 2 líneas; si no cabe, la segunda termina en "…".
        const s = doc.splitTextToSize(limpio(k.sub), ancho - 18) as string[];
        const l2 = s.length > 2 ? doc.splitTextToSize(s.slice(1).join(' '), ancho - 24)[0] + '…' : s[1];
        doc.text(s[0], x + 12, yy + 47);
        if (l2) doc.text(l2, x + 12, yy + 56);
      }
    });
    y += Math.ceil(rep.kpis.length / porFila) * (alto + gap) + 6;
  }

  // ---------- Resumen ejecutivo ----------
  if (rep.resumen?.length) {
    const ancho = W - 2 * M;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const lineas = rep.resumen.map((s) => doc.splitTextToSize(limpio(s), ancho - 34) as string[]);
    const altoCaja = 24 + lineas.reduce((a, l) => a + l.length * 11 + 2, 0);
    doc.setFillColor(...RGB.celeste);
    doc.setDrawColor(...RGB.borde);
    doc.roundedRect(M, y, ancho, altoCaja, 6, 6, 'FD');
    doc.setFillColor(...RGB.marino);
    doc.rect(M, y + 6, 3.5, altoCaja - 12, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...RGB.marino);
    doc.text('RESUMEN EJECUTIVO', M + 14, y + 16);
    let yy = y + 28;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...RGB.texto);
    lineas.forEach((l) => {
      doc.setFillColor(...RGB.cielo);
      doc.circle(M + 18, yy - 3, 1.8, 'F');
      doc.text(l, M + 26, yy);
      yy += l.length * 11 + 2;
    });
    y += altoCaja + 14;
  }

  // ---------- Tablas ----------
  // ¿La hoja actual está en blanco (recién creada)? Sirve para no dejar hojas vacías.
  let hojaLimpia = false;
  const nuevaHoja = () => {
    doc.addPage();
    y = 48;
    hojaLimpia = true;
  };
  const tituloSeccion = (t: string, sub?: string) => {
    if (y > H - 90) nuevaHoja();
    hojaLimpia = false;
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

  // ---------- Barra apilada ----------
  if (rep.barra && rep.barra.segmentos.some((s) => s.valor > 0)) {
    const b = rep.barra;
    const total = b.segmentos.reduce((a, s) => a + s.valor, 0);
    tituloSeccion(b.titulo, b.sub);
    const ancho = W - 2 * M;
    let x = M;
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(M, y, ancho, 14, 7, 7, 'F');
    b.segmentos.forEach((s) => {
      if (s.valor <= 0) return;
      const w = (s.valor / total) * ancho;
      doc.setFillColor(...s.color);
      doc.rect(x, y, w, 14, 'F');
      if (w > 22) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(255, 255, 255);
        doc.text(String(s.valor), x + w / 2, y + 9.8, { align: 'center' });
      }
      x += w;
    });
    y += 26;
    // Leyenda en una fila pareja
    const cols = b.segmentos.length;
    const cw = ancho / cols;
    b.segmentos.forEach((s, i) => {
      const lx = M + i * cw;
      doc.setFillColor(...s.color);
      doc.circle(lx + 4, y - 2.5, 3.2, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...RGB.gris);
      doc.text(limpio(s.label), lx + 11, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...RGB.marino);
      doc.text(`${s.valor}  (${total > 0 ? ((s.valor / total) * 100).toFixed(1) : '0.0'}%)`, lx + 11, y + 11);
    });
    y += 34;
  }

  // Reglas de hojas para un reporte limpio (sin hojas medio vacías):
  //  - Una tabla que cabe completa en lo que queda de la hoja, va ahí.
  //  - Si no cabe pero sí cabe completa en una hoja nueva, pasa entera a la
  //    siguiente hoja (no se parte).
  //  - Si es más larga que una hoja: empieza donde está cuando queda buena parte
  //    de la hoja libre; si queda poco, empieza en hoja nueva. Repite el
  //    encabezado en cada hoja y pone "(continuación)" con su título.
  //  - Las tablas largas (más de FILAS_LARGA filas) llevan columna "#".
  const FILAS_LARGA = 18;
  const TOPE = 66; // margen superior de las tablas en hojas 2+ (deja lugar al título de continuación)
  const PIE = 44;
  const altoDe = (t: TablaPdf) => {
    const larga = t.filas.length > FILAS_LARGA;
    const fsEst = t.columnas.length + (larga ? 1 : 0) > 8 ? 7.6 : 8.4;
    const altoFila = fsEst * 1.15 + (fsEst < 8 ? 6.4 : 7) + 1;
    return (t.sub || t.filas.length > 1 ? 41 : 30) + altoFila + 4 + Math.max(1, t.filas.length) * altoFila + (t.total ? altoFila + 2 : 0);
  };
  const pendientes = rep.tablas.filter((t) => t.filas.length || t.vacio);
  const altoHoja = H - PIE - 48;
  while (pendientes.length) {
    let t = pendientes[0];
    const restante = H - PIE - y;
    if (!hojaLimpia && altoDe(t) > restante) {
      // Antes de pasar de hoja, se aprovecha el espacio con una tabla corta
      // que venga después y quepa completa (así no quedan hojas medio vacías).
      // Se elige la más grande que quepa, para llenar mejor la hoja.
      let i = -1;
      pendientes.forEach((x, k) => {
        if (k > 0 && altoDe(x) <= restante && (i < 0 || altoDe(x) > altoDe(pendientes[i]))) i = k;
      });
      if (i > 0 && restante > 90) {
        t = pendientes.splice(i, 1)[0];
      } else {
        pendientes.shift();
        if (altoDe(t) <= altoHoja || restante < altoHoja * 0.45) nuevaHoja();
      }
    } else {
      pendientes.shift();
    }
    const larga = t.filas.length > FILAS_LARGA;
    const sub = [t.sub, t.filas.length > 1 ? `${t.filas.length} registros` : ''].filter(Boolean).join('  ·  ');
    tituloSeccion(t.titulo, sub);
    if (!t.filas.length) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...RGB.gris);
      doc.text(limpio(t.vacio), M + 9, y + 8);
      y += 26;
      continue;
    }
    // Tablas anchas: letra un poco menor para que no se amontonen las columnas.
    const anchas = t.columnas.length + (larga ? 1 : 0) > 8;
    const fs = anchas ? 7.6 : 8.4;
    const conNumero = larga;
    const columnas: ColumnaPdf[] = conNumero ? [{ t: '#', num: true, ancho: 26 }, ...t.columnas] : t.columnas;
    const columnStyles: Record<number, { halign?: 'right' | 'left' | 'center'; cellWidth?: number; textColor?: [number, number, number] }> = {};
    columnas.forEach((col, i) => {
      columnStyles[i] = { halign: col.num ? 'right' : 'left', ...(col.ancho ? { cellWidth: col.ancho } : {}) };
    });
    if (conNumero) columnStyles[0] = { halign: 'center', cellWidth: 26, textColor: RGB.gris };
    const tituloT = limpio(t.titulo);
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, top: TOPE, bottom: 40 },
      head: [columnas.map((col) => limpio(col.t))],
      body: t.filas.map((f, i) => (conNumero ? [String(i + 1), ...f.map((v) => limpio(v))] : f.map((v) => limpio(v)))),
      foot: t.total ? [(conNumero ? ['', ...t.total] : t.total).map((v) => limpio(v))] : undefined,
      showHead: 'everyPage',
      showFoot: 'lastPage',
      rowPageBreak: 'avoid',
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: fs, cellPadding: anchas ? 3.2 : 3.5, textColor: RGB.texto, lineColor: RGB.borde, lineWidth: 0.5, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: RGB.marino, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: fs, halign: 'center', valign: 'middle' },
      footStyles: { fillColor: RGB.totalFondo, textColor: RGB.marino, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: RGB.celeste },
      columnStyles,
      didParseCell: (d) => {
        if (d.section === 'foot') d.cell.styles.halign = columnas[d.column.index]?.num ? 'right' : 'left';
      },
      didDrawPage: (d) => {
        // Hojas siguientes de la misma tabla: su título con "(continuación)".
        if (d.pageNumber <= 1) return;
        doc.setFillColor(...RGB.cielo);
        doc.rect(M, 40, 3.5, 13, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...RGB.marino);
        doc.text(`${tituloT} (continuación)`, M + 9, 50);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...RGB.gris);
        doc.text(`${t.filas.length} registros en total`, W - M, 50, { align: 'right' });
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY || y) + 26;
    hojaLimpia = false;
  }

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
