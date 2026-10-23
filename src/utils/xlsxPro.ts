// --- Excel "profesional" (con formato, colores de DISCARGA y logo) ---
//
// La versión de SheetJS que usa la app no guarda colores, bordes ni imágenes.
// Este archivo arma el .xlsx directamente (es un ZIP con archivos XML), sin
// librerías externas ni conexiones a internet. Se usa en los reportes que se
// comparten (por ejemplo Rutas Prioridades).
//
// Colores tomados del logo de DISCARGA:
//   azul marino #2C3790 (letras y contorno) · azul cielo #5AACE4 · celeste #EAF5FC

export type TipoColumna = 'texto' | 'entero' | 'dec2' | 'dec3';
export type MarcaCelda = 'recarga' | 'piso' | 'apoyo' | 'clave';

export interface ColumnaPro {
  titulo: string;
  ancho: number; // ancho en caracteres
  tipo?: TipoColumna;
  centrar?: boolean;
}

export interface HojaPro {
  archivo: string; // nombre del archivo .xlsx
  hoja: string; // nombre de la pestaña (máx. 31 caracteres)
  tabla: string; // nombre interno de la tabla de Excel (sin espacios)
  titulo: string;
  lineas: string[]; // 1 o 2 líneas debajo del título
  columnas: ColumnaPro[];
  filas: (string | number | null | undefined)[][];
  total?: (string | number | null | undefined)[];
  marca?: (fila: number, col: number, valor: unknown) => MarcaCelda | undefined;
  logoPng?: Uint8Array | null;
}

const C = {
  marino: 'FF2C3790',
  cielo: 'FF5AACE4',
  celeste: 'FFEAF5FC',
  borde: 'FFC9D6EA',
  texto: 'FF1F2937',
  gris: 'FF5B6577',
  blanco: 'FFFFFFFF',
  morado: 'FF6B21A8',
  ambarFondo: 'FFFEF3C7',
  ambarTexto: 'FF92400E',
  apoyoFondo: 'FFE0F2FE',
};

// ---------- utilidades ----------
const esc = (v: unknown) =>
  String(v ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const colLetra = (i: number) => {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

let crcTabla: Uint32Array | null = null;
const crc32 = (d: Uint8Array) => {
  if (!crcTabla) {
    crcTabla = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTabla[i] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < d.length; i++) c = crcTabla[(c ^ d[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** ZIP sin compresión (método "stored"): suficiente y compatible con Excel. */
function zip(archivos: { nombre: string; datos: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const ahora = new Date();
  const hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | Math.floor(ahora.getSeconds() / 2);
  const fecha = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
  archivos.forEach((f) => {
    const nombre = enc.encode(f.nombre);
    const crc = crc32(f.datos);
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true);
    loc.setUint16(4, 20, true);
    loc.setUint16(6, 0x0800, true); // nombres en UTF-8
    loc.setUint16(8, 0, true);
    loc.setUint16(10, hora, true);
    loc.setUint16(12, fecha, true);
    loc.setUint32(14, crc, true);
    loc.setUint32(18, f.datos.length, true);
    loc.setUint32(22, f.datos.length, true);
    loc.setUint16(26, nombre.length, true);
    loc.setUint16(28, 0, true);
    partes.push(new Uint8Array(loc.buffer), nombre, f.datos);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true);
    cen.setUint16(12, hora, true);
    cen.setUint16(14, fecha, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, f.datos.length, true);
    cen.setUint32(24, f.datos.length, true);
    cen.setUint16(28, nombre.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), nombre);
    offset += 30 + nombre.length + f.datos.length;
  });
  const tamCentral = central.reduce((a, b) => a + b.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true);
  fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true);
  fin.setUint32(16, offset, true);
  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const out = new Uint8Array(todo.reduce((a, b) => a + b.length, 0));
  let p = 0;
  todo.forEach((b) => {
    out.set(b, p);
    p += b.length;
  });
  return out;
}

// ---------- estilos ----------
interface Estilo {
  fuente?: { b?: boolean; tam?: number; color?: string };
  fondo?: string;
  borde?: boolean;
  formato?: TipoColumna;
  h?: 'left' | 'center' | 'right';
  ajustar?: boolean;
}

class Estilos {
  fuentes: string[] = ['<font><sz val="11"/><color rgb="' + C.texto + '"/><name val="Calibri"/><family val="2"/></font>'];
  fondos: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  bordes: string[] = [
    '<border><left/><right/><top/><bottom/><diagonal/></border>',
    `<border><left style="thin"><color rgb="${C.borde}"/></left><right style="thin"><color rgb="${C.borde}"/></right><top style="thin"><color rgb="${C.borde}"/></top><bottom style="thin"><color rgb="${C.borde}"/></bottom><diagonal/></border>`,
  ];
  xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  private cache = new Map<string, number>();

  private idx(lista: string[], xml: string) {
    const i = lista.indexOf(xml);
    if (i >= 0) return i;
    lista.push(xml);
    return lista.length - 1;
  }

  id(e: Estilo): number {
    const clave = JSON.stringify(e);
    const ya = this.cache.get(clave);
    if (ya !== undefined) return ya;
    const f = e.fuente || {};
    const fontId = this.idx(
      this.fuentes,
      `<font>${f.b ? '<b/>' : ''}<sz val="${f.tam || 10}"/><color rgb="${f.color || C.texto}"/><name val="Calibri"/><family val="2"/></font>`
    );
    const fillId = e.fondo ? this.idx(this.fondos, `<fill><patternFill patternType="solid"><fgColor rgb="${e.fondo}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const borderId = e.borde ? 1 : 0;
    const numFmtId = e.formato === 'entero' ? 3 : e.formato === 'dec2' ? 4 : e.formato === 'dec3' ? 164 : 0;
    const al = `<alignment vertical="center"${e.h ? ` horizontal="${e.h}"` : ''}${e.ajustar ? ' wrapText="1"' : ''}/>`;
    const xf = `<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyFont="1"${fillId ? ' applyFill="1"' : ''}${borderId ? ' applyBorder="1"' : ''}${numFmtId ? ' applyNumberFormat="1"' : ''} applyAlignment="1">${al}</xf>`;
    this.xfs.push(xf);
    const n = this.xfs.length - 1;
    this.cache.set(clave, n);
    return n;
  }

  xml() {
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.000"/></numFmts>' +
      `<fonts count="${this.fuentes.length}">${this.fuentes.join('')}</fonts>` +
      `<fills count="${this.fondos.length}">${this.fondos.join('')}</fills>` +
      `<borders count="${this.bordes.length}">${this.bordes.join('')}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '<dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>' +
      '</styleSheet>'
    );
  }
}

/** Arma el .xlsx con formato profesional y lo devuelve como bytes. */
export function crearExcelPro(cfg: HojaPro): Uint8Array {
  const enc = new TextEncoder();
  const st = new Estilos();
  const nCol = cfg.columnas.length;
  const ultima = colLetra(nCol - 1);
  const filaEnc = 6; // fila del encabezado de la tabla
  const primeraDato = filaEnc + 1;
  const ultimaDato = filaEnc + Math.max(cfg.filas.length, 1);

  // Textos compartidos
  const textos: string[] = [];
  const idxTexto = new Map<string, number>();
  const sst = (t: string) => {
    let i = idxTexto.get(t);
    if (i === undefined) {
      i = textos.length;
      textos.push(t);
      idxTexto.set(t, i);
    }
    return i;
  };
  const celda = (ref: string, v: unknown, s: number) => {
    if (v === null || v === undefined || v === '') return `<c r="${ref}" s="${s}"/>`;
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
    return `<c r="${ref}" s="${s}" t="s"><v>${sst(String(v))}</v></c>`;
  };

  // Estilos fijos
  const sTitulo = st.id({ fuente: { b: true, tam: 18, color: C.marino }, h: 'left' });
  const sLinea = st.id({ fuente: { tam: 10, color: C.gris }, h: 'left' });
  const sLineaB = st.id({ fuente: { b: true, tam: 10, color: C.marino }, h: 'left' });
  const sBanda = st.id({ fondo: C.cielo });
  const sEnc = st.id({ fuente: { b: true, tam: 10, color: C.blanco }, fondo: C.marino, borde: true, h: 'center', ajustar: true });
  const sTotalTxt = st.id({ fuente: { b: true, tam: 10, color: C.blanco }, fondo: C.marino, borde: true, h: 'left' });
  const estiloDato = (col: ColumnaPro, banda: boolean, m?: MarcaCelda) => {
    const tipo = col.tipo || 'texto';
    const num = tipo !== 'texto';
    const e: Estilo = {
      borde: true,
      formato: num ? tipo : undefined,
      h: num ? 'right' : col.centrar ? 'center' : 'left',
      fondo: banda ? C.celeste : undefined,
      fuente: { tam: 10 },
    };
    if (m === 'clave') e.fuente = { b: true, tam: 10, color: C.marino };
    if (m === 'recarga') e.fuente = { b: true, tam: 10, color: C.morado };
    if (m === 'piso') {
      e.fondo = C.ambarFondo;
      e.fuente = { b: true, tam: 10, color: C.ambarTexto };
    }
    if (m === 'apoyo') {
      e.fondo = C.apoyoFondo;
      e.fuente = { tam: 10, color: C.marino };
    }
    return st.id(e);
  };
  const estiloTotal = (col: ColumnaPro) => {
    const tipo = col.tipo || 'texto';
    return tipo === 'texto'
      ? sTotalTxt
      : st.id({ fuente: { b: true, tam: 10, color: C.blanco }, fondo: C.marino, borde: true, formato: tipo, h: 'right' });
  };

  // Filas
  const filasXml: string[] = [];
  const fila = (r: number, celdas: string, alto?: number) =>
    filasXml.push(`<row r="${r}"${alto ? ` ht="${alto}" customHeight="1"` : ''}>${celdas}</row>`);
  fila(1, '', 8);
  fila(2, celda('B2', cfg.titulo, sTitulo), 30);
  fila(3, celda('B3', cfg.lineas[0] || '', sLineaB), 18);
  fila(4, celda('B4', cfg.lineas[1] || '', sLinea), 18);
  fila(5, cfg.columnas.map((_, i) => celda(`${colLetra(i)}5`, '', sBanda)).join(''), 5);
  fila(filaEnc, cfg.columnas.map((c, i) => celda(`${colLetra(i)}${filaEnc}`, c.titulo, sEnc)).join(''), 32);
  const datos = cfg.filas.length ? cfg.filas : [cfg.columnas.map(() => '')];
  datos.forEach((f, ri) => {
    const r = primeraDato + ri;
    const banda = ri % 2 === 1;
    fila(r, cfg.columnas.map((c, ci) => celda(`${colLetra(ci)}${r}`, f[ci], estiloDato(c, banda, cfg.marca?.(ri, ci, f[ci])))).join(''), 18);
  });
  let filaTotal = 0;
  if (cfg.total) {
    filaTotal = ultimaDato + 1;
    fila(filaTotal, cfg.columnas.map((c, ci) => celda(`${colLetra(ci)}${filaTotal}`, cfg.total![ci], estiloTotal(c))).join(''), 22);
  }
  const ultimaFila = filaTotal || ultimaDato;

  const cols = cfg.columnas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.ancho}" customWidth="1"/>`).join('');
  const hay = !!cfg.logoPng?.length;
  const hoja =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    `<dimension ref="A1:${ultima}${ultimaFila}"/>` +
    `<sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="${filaEnc}" topLeftCell="A${primeraDato}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${primeraDato}" sqref="A${primeraDato}"/></sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    `<cols>${cols}</cols>` +
    `<sheetData>${filasXml.join('')}</sheetData>` +
    `<mergeCells count="3"><mergeCell ref="B2:${ultima}2"/><mergeCell ref="B3:${ultima}3"/><mergeCell ref="B4:${ultima}4"/></mergeCells>` +
    '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
    '<pageSetup orientation="landscape" paperSize="1" fitToWidth="1" fitToHeight="0"/>' +
    '<headerFooter><oddFooter>&amp;L&amp;8DISCARGA, S.A.&amp;R&amp;8Página &amp;P de &amp;N</oddFooter></headerFooter>' +
    (hay ? '<drawing r:id="rId2"/>' : '') +
    '<tableParts count="1"><tablePart r:id="rId1"/></tableParts>' +
    '</worksheet>';

  const tabla =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="${esc(cfg.tabla)}" displayName="${esc(cfg.tabla)}" ref="A${filaEnc}:${ultima}${ultimaDato}" totalsRowShown="0">` +
    `<autoFilter ref="A${filaEnc}:${ultima}${ultimaDato}"/>` +
    `<tableColumns count="${nCol}">${cfg.columnas.map((c, i) => `<tableColumn id="${i + 1}" name="${esc(c.titulo)}"/>`).join('')}</tableColumns>` +
    '<tableStyleInfo name="TableStyleLight1" showFirstColumn="0" showLastColumn="0" showRowStripes="0" showColumnStripes="0"/>' +
    '</table>';

  // Logo: 84 × 84 px arriba a la izquierda (EMU = px × 9525)
  const lado = 84 * 9525;
  const dibujo =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>38100</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>19050</xdr:rowOff></xdr:from><xdr:ext cx="${lado}" cy="${lado}"/>` +
    '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo DISCARGA"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>' +
    '<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
    `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${lado}" cy="${lado}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>` +
    '<xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>';

  const nombreHoja = esc(cfg.hoja.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  const libro =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="15000"/></bookViews>' +
    `<sheets><sheet name="${nombreHoja}" sheetId="1" r:id="rId1"/></sheets>` +
    `<definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">'${nombreHoja.replace(/'/g, "''")}'!$${filaEnc}:$${filaEnc}</definedName></definedNames>` +
    '</workbook>';

  const sharedStrings =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${textos.length}" uniqueCount="${textos.length}">` +
    textos.map((t) => `<si><t xml:space="preserve">${esc(t)}</t></si>`).join('') +
    '</sst>';

  const tipos =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="png" ContentType="image/png"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
    '<Override PartName="/xl/tables/table1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>' +
    (hay ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : '') +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '</Types>';

  const rel = (items: [string, string, string][]) =>
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    items.map(([id, tipo, destino]) => `<Relationship Id="${id}" Type="${tipo}" Target="${destino}"/>`).join('') +
    '</Relationships>';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const ahoraIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const core =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${esc(cfg.titulo)}</dc:title><dc:creator>DISCARGA CONTROLER</dc:creator>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${ahoraIso}</dcterms:created></cp:coreProperties>`;

  const t = (s: string) => enc.encode(s);
  const archivos = [
    { nombre: '[Content_Types].xml', datos: t(tipos) },
    { nombre: '_rels/.rels', datos: t(rel([['rId1', R + 'officeDocument', 'xl/workbook.xml'], ['rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml']])) },
    { nombre: 'docProps/core.xml', datos: t(core) },
    { nombre: 'xl/workbook.xml', datos: t(libro) },
    { nombre: 'xl/_rels/workbook.xml.rels', datos: t(rel([['rId1', R + 'worksheet', 'worksheets/sheet1.xml'], ['rId2', R + 'styles', 'styles.xml'], ['rId3', R + 'sharedStrings', 'sharedStrings.xml']])) },
    { nombre: 'xl/styles.xml', datos: t(st.xml()) },
    { nombre: 'xl/sharedStrings.xml', datos: t(sharedStrings) },
    { nombre: 'xl/worksheets/sheet1.xml', datos: t(hoja) },
    {
      nombre: 'xl/worksheets/_rels/sheet1.xml.rels',
      datos: t(rel([['rId1', R + 'table', '../tables/table1.xml'], ...(hay ? ([['rId2', R + 'drawing', '../drawings/drawing1.xml']] as [string, string, string][]) : [])])),
    },
    { nombre: 'xl/tables/table1.xml', datos: t(tabla) },
  ];
  if (hay) {
    archivos.push({ nombre: 'xl/drawings/drawing1.xml', datos: t(dibujo) });
    archivos.push({ nombre: 'xl/drawings/_rels/drawing1.xml.rels', datos: t(rel([['rId1', R + 'image', '../media/image1.png']])) });
    archivos.push({ nombre: 'xl/media/image1.png', datos: cfg.logoPng as Uint8Array });
  }
  return zip(archivos);
}

/** Arma el Excel y lo descarga en el navegador. */
export function descargarExcelPro(cfg: HojaPro) {
  const bytes = crearExcelPro(cfg);
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = cfg.archivo;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1500);
}

/** Logo de DISCARGA (PNG) para los reportes. Si no se puede leer, el Excel sale sin logo. */
export async function leerLogoPng(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const b = new Uint8Array(await r.arrayBuffer());
    // Firma PNG
    return b.length > 8 && b[0] === 0x89 && b[1] === 0x50 ? b : null;
  } catch {
    return null;
  }
}
