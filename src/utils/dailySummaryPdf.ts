import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface DailySummaryPdfData {
  mode: 'inicio' | 'fin';
  fechaHoy: string;
  filterAgency: string;
  stats: {
    totalRutas: number;
    enTiempo: number;
    atrasadas: number;
    piso: number;
    recargas: number;
    cajasPlan: number;
    paradasPlan: number;
    maxHorasAtraso: number;
    cumplimientoPorc?: string;
    cajasEntregadas?: number;
    cajasDevueltas?: number;
    efectividadEntregaPorc?: string;
    liquidadasCount?: number;
    pendientesCount?: number;
  };
  summaryTotals: {
    totalRutasPlan: number;
    totalCajasPlan: number;
    totalParadasPlan: number;
    totalCajasEntregadas: number;
    totalCajasDevueltas: number;
    totalParadasRealizadas: number;
    enTransito: {
      totalPlan: number;
      cajasPlan: number;
      paradasPlan: number;
      finLiquidadas: number;
      finPendientes: number;
      finCajasEntregadas: number;
      finCajasDevueltas: number;
      finParadasRealizadas: number;
    };
    pendientes?: {
      totalPlan: number;
      cajasPlan: number;
      paradasPlan: number;
      finLiquidadas: number;
      finPendientes: number;
      finCajasEntregadas: number;
      finCajasDevueltas: number;
      finParadasRealizadas: number;
    };
    enPiso: {
      totalPlan: number;
      cajasPlan: number;
      paradasPlan: number;
      finQuedan: number;
      finLiquidadas: number;
      finCajasQuedan: number;
      finParadasQuedan: number;
    };
    rutas24h: {
      totalPlan: number;
      cajasPlan: number;
      paradasPlan: number;
      finLiquidadas: number;
      finPendientes: number;
      finCajasEntregadas: number;
      finCajasDevueltas: number;
      finParadasRealizadas: number;
    };
    rutas72h: {
      totalPlan: number;
      cajasPlan: number;
      paradasPlan: number;
      finLiquidadas: number;
      finPendientes: number;
      finCajasEntregadas: number;
      finCajasDevueltas: number;
      finParadasRealizadas: number;
    };
    rutasMayor72h: {
      totalPlan: number;
      cajasPlan: number;
      paradasPlan: number;
      finLiquidadas: number;
      finPendientes: number;
      finCajasEntregadas: number;
      finCajasDevueltas: number;
      finParadasRealizadas: number;
    };
  };
  routesList: Array<{
    id: string;
    agencia: string;
    mercado: string;
    fechaPlanificadaStr: string;
    fechaDespachadaStr: string;
    horasTexto: string;
    estaAtrasado: boolean;
    indicadorDetalle: string;
    cajasFisicasPlan: number;
    paradasPlan: number;
    isFloor: boolean;
    isLiquidada: boolean;
    cajasFisicasEntregadas: number;
    cajasFisicasDevueltas: number;
    guiasExitosas: number;
  }>;
  // Corrección: el modal ya calculaba los camiones/personal disponibles que NO
  // salieron a ruta (con su motivo), pero el PDF de Inicio/Fin de Día los
  // descartaba por completo — un dato clave para explicar por qué no se cubrió
  // el 100% de la operación (falta de recursos vs. falta de rutas).
  unassignedResources?: {
    trucks: Array<{ id: string; placa: string; motivo: string }>;
    staff: Array<{ id: string; nombre: string; puesto: string; motivo: string }>;
    trucksByReason: Array<{ reason: string; count: number }>;
    staffByReason: Array<{ reason: string; count: number }>;
  };
}

/**
 * Genera el documento PDF oficial del Resumen de Inicio o Fin de Día
 * con encabezados ejecutivos, KPIs, Tabla Resumen de Totales y Tabla Detallada.
 */
export function generateDailySummaryPdf(data: DailySummaryPdfData, action: 'save' | 'print' = 'save'): jsPDF {
  const { mode, fechaHoy, filterAgency, stats, summaryTotals, routesList } = data;

  // Formato horizontal (landscape) en tamaño carta para acomodar todas las columnas
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'letter', // 279.4 x 215.9 mm
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;

  // 1. BANDA SUPERIOR DE ENCABEZADO
  const isInicio = mode === 'inicio';
  const headerBgColor = isInicio ? [15, 23, 42] : [15, 23, 42]; // Slate 900
  const accentColor = isInicio ? [217, 119, 6] : [79, 70, 229]; // Amber 600 / Indigo 600

  // Fondo del encabezado
  doc.setFillColor(headerBgColor[0], headerBgColor[1], headerBgColor[2]);
  doc.rect(0, 0, pageWidth, 22, 'F');

  // Línea de acento inferior
  doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
  doc.rect(0, 22, pageWidth, 1.8, 'F');

  // Textos del encabezado
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text('DISCARGA CONTROLER', margin, 9.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225); // Slate 300
  doc.text(
    isInicio
      ? 'REPORTE RESUMEN INICIO DE DÍA • CONTROL DE SALIDA Y PLANIFICACIÓN'
      : 'REPORTE RESUMEN FIN DE DÍA • BALANCE OPERATIVO Y CIERRE REAL',
    margin,
    16
  );

  // Metadata en el lado derecho
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  const agencyText = `Agencia: ${filterAgency}`;
  const dateText = `Fecha: ${fechaHoy}`;
  doc.text(agencyText, pageWidth - margin, 9.5, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(226, 232, 240);
  doc.text(dateText, pageWidth - margin, 16, { align: 'right' });

  let currentY = 28;

  // 2. BLOQUE DE RESUMEN EJECUTIVO / KPIS (Tarjetas compactas)
  const cardWidth = (pageWidth - margin * 2 - 12) / 5;
  const cardHeight = 16;

  // KPI 1: Rutas Planificadas
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, currentY, cardWidth, cardHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('RUTAS PROGRAMADAS', margin + 2.5, currentY + 4.5);
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`${stats.totalRutas}`, margin + 2.5, currentY + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`${stats.paradasPlan} paradas plan`, margin + 2.5, currentY + 13.8);

  // KPI 2: Total Cajas Físicas
  const kpi2X = margin + cardWidth + 3;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(kpi2X, currentY, cardWidth, cardHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(67, 56, 202); // Indigo 700
  doc.text('CAJAS FÍSICAS DÍA', kpi2X + 2.5, currentY + 4.5);
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`${stats.cajasPlan.toFixed(1)}`, kpi2X + 2.5, currentY + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    isInicio
      ? '100% carga planificada'
      : `${(stats.cajasEntregadas || 0).toFixed(1)} ent • ${(stats.cajasDevueltas || 0).toFixed(1)} dev`,
    kpi2X + 2.5,
    currentY + 13.8
  );

  // KPI 3: En Tiempo / Liquidadas
  const kpi3X = margin + (cardWidth + 3) * 2;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(kpi3X, currentY, cardWidth, cardHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(22, 101, 52); // Green 800
  doc.text(isInicio ? 'EN TIEMPO' : 'LIQUIDADAS / CUMP.', kpi3X + 2.5, currentY + 4.5);
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(isInicio ? `${stats.enTiempo}` : `${stats.liquidadasCount || 0} (${stats.cumplimientoPorc || '0'}%)`, kpi3X + 2.5, currentY + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    isInicio
      ? `${stats.totalRutas > 0 ? ((stats.enTiempo / stats.totalRutas) * 100).toFixed(1) : 0}% puntual`
      : `${stats.totalRutas - (stats.liquidadasCount || 0)} pendientes`,
    kpi3X + 2.5,
    currentY + 13.8
  );

  // KPI 4: Atrasadas / Devoluciones
  const kpi4X = margin + (cardWidth + 3) * 3;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(kpi4X, currentY, cardWidth, cardHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(185, 28, 28); // Red 700
  doc.text(isInicio ? 'CON RETRASO' : 'EFECTIVIDAD ENTREGA', kpi4X + 2.5, currentY + 4.5);
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(isInicio ? `${stats.atrasadas}` : `${stats.efectividadEntregaPorc || '100'}%`, kpi4X + 2.5, currentY + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    isInicio
      ? `Hasta ${stats.maxHorasAtraso || 0}h atraso`
      : `${stats.cajasEntregadas || 0} ent • ${stats.cajasDevueltas || 0} dev`,
    kpi4X + 2.5,
    currentY + 13.8
  );

  // KPI 5: En Bodega / Piso
  const kpi5X = margin + (cardWidth + 3) * 4;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(kpi5X, currentY, cardWidth, cardHeight, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(180, 83, 9); // Amber 700
  doc.text('EN BODEGA / PISO', kpi5X + 2.5, currentY + 4.5);
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`${stats.piso}`, kpi5X + 2.5, currentY + 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`${stats.recargas || 0} recargas prog.`, kpi5X + 2.5, currentY + 13.8);

  currentY += cardHeight + 4;

  // 3. TABLA 1: TABLA RESUMEN DE TOTALES (5 CATEGORÍAS CLAVE + TOTAL GENERAL)
  const calcPerc = (val: number, total: number) => (total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '0.0%');

  const summaryHead = isInicio
    ? [['CATEGORÍA / CLASIFICACIÓN', 'RUTAS PLAN', '% PART.', 'CAJAS FÍSICAS', 'PARADAS', 'CONDICIÓN OPERATIVA']]
    : [['CATEGORÍA / CLASIFICACIÓN', 'PLAN', 'LIQUIDADAS', 'PENDIENTES', 'CAJAS ENTREGADAS', 'CAJAS DEV.', 'BALANCE DE CIERRE']];

  // Corrección: esta tabla combinaba en una sola lista numerada (1 a 6) dos
  // clasificaciones de ruta que NO son mutuamente excluyentes: el ESTADO de
  // despacho (En Tránsito / Pendientes de Salida / En Piso, que sí suman el 100%
  // del total) y la ANTIGÜEDAD desde lo planificado (24h / 48-72h / >72h, que se
  // calcula sin importar el estado y por lo tanto puede solaparse con las
  // primeras tres filas — una ruta "En Tránsito" con 30h de atraso cuenta en
  // ambas). Numerarlas 1-6 junto a un renglón "TOTAL GENERAL = 100%" daba a
  // entender que las 6 filas se sumaban a un mismo total, lo cual es incorrecto.
  // Ahora se muestran como dos bloques separados, cada uno con su propio
  // encabezado explicando su criterio, sin cambiar ningún cálculo existente.
  const sectionDivider = (label: string): [{ content: string; colSpan: number; styles: Record<string, unknown> }] => [
    {
      content: label,
      colSpan: 7,
      styles: { fillColor: [203, 213, 225], textColor: [30, 41, 59], fontStyle: 'bold', halign: 'left', fontSize: 6.5 },
    },
  ];

  const summaryRows = isInicio
    ? [
        sectionDivider('POR ESTADO DE DESPACHO (categorías mutuamente excluyentes — suman el total de rutas)'),
        [
          'Total Rutas en Tránsito',
          `${summaryTotals.enTransito.totalPlan}`,
          calcPerc(summaryTotals.enTransito.totalPlan, summaryTotals.totalRutasPlan),
          summaryTotals.enTransito.cajasPlan.toFixed(1),
          `${summaryTotals.enTransito.paradasPlan}`,
          'Rutas en ruta activa hacia clientes',
        ],
        ...(summaryTotals.pendientes ? [
          [
            'Total Rutas Pendientes de Salida',
            `${summaryTotals.pendientes.totalPlan}`,
            calcPerc(summaryTotals.pendientes.totalPlan, summaryTotals.totalRutasPlan),
            summaryTotals.pendientes.cajasPlan.toFixed(1),
            `${summaryTotals.pendientes.paradasPlan}`,
            'Programadas pendientes de asignación y despacho',
          ],
        ] : []),
        [
          'Total Rutas en Piso',
          `${summaryTotals.enPiso.totalPlan}`,
          calcPerc(summaryTotals.enPiso.totalPlan, summaryTotals.totalRutasPlan),
          summaryTotals.enPiso.cajasPlan.toFixed(1),
          `${summaryTotals.enPiso.paradasPlan}`,
          'Retenidas / resguardadas en bodega',
        ],
        sectionDivider('POR ANTIGÜEDAD DESDE LO PLANIFICADO (todas las rutas sin importar su estado — se solapan con el bloque anterior)'),
        [
          'Rutas de 24 Horas',
          `${summaryTotals.rutas24h.totalPlan}`,
          calcPerc(summaryTotals.rutas24h.totalPlan, summaryTotals.totalRutasPlan),
          summaryTotals.rutas24h.cajasPlan.toFixed(1),
          `${summaryTotals.rutas24h.paradasPlan}`,
          'Tiempo transcurrido: 24h a 48h desde plan',
        ],
        [
          'Rutas de 72 Horas',
          `${summaryTotals.rutas72h.totalPlan}`,
          calcPerc(summaryTotals.rutas72h.totalPlan, summaryTotals.totalRutasPlan),
          summaryTotals.rutas72h.cajasPlan.toFixed(1),
          `${summaryTotals.rutas72h.paradasPlan}`,
          'Tiempo transcurrido: 48h a 72h desde plan',
        ],
        [
          'Rutas Mayores a 72 Horas',
          `${summaryTotals.rutasMayor72h.totalPlan}`,
          calcPerc(summaryTotals.rutasMayor72h.totalPlan, summaryTotals.totalRutasPlan),
          summaryTotals.rutasMayor72h.cajasPlan.toFixed(1),
          `${summaryTotals.rutasMayor72h.paradasPlan}`,
          'Tiempo crítico: más de 72h de retraso acumulado',
        ],
        [
          'TOTAL GENERAL OPERATIVO (universo de rutas del reporte)',
          `${summaryTotals.totalRutasPlan}`,
          '100.0%',
          summaryTotals.totalCajasPlan.toFixed(1),
          `${summaryTotals.totalParadasPlan}`,
          'Cuadre total de rutas del reporte (no es la suma de las 6 filas)',
        ],
      ]
    : [
        sectionDivider('POR ESTADO DE DESPACHO (categorías mutuamente excluyentes — suman el total de rutas)'),
        [
          'Total Rutas en Tránsito',
          `${summaryTotals.enTransito.totalPlan}`,
          `${summaryTotals.enTransito.finLiquidadas}`,
          `${summaryTotals.enTransito.finPendientes}`,
          summaryTotals.enTransito.finCajasEntregadas.toFixed(1),
          summaryTotals.enTransito.finCajasDevueltas.toFixed(1),
          summaryTotals.enTransito.finPendientes === 0 ? 'Completadas al 100%' : `${summaryTotals.enTransito.finPendientes} aún en tránsito`,
        ],
        ...(summaryTotals.pendientes ? [
          [
            'Total Rutas Pendientes de Salida',
            `${summaryTotals.pendientes.totalPlan}`,
            `${summaryTotals.pendientes.finLiquidadas}`,
            `${summaryTotals.pendientes.finPendientes}`,
            summaryTotals.pendientes.finCajasEntregadas.toFixed(1),
            summaryTotals.pendientes.finCajasDevueltas.toFixed(1),
            summaryTotals.pendientes.finPendientes === 0 ? 'Evacuadas al cierre' : `${summaryTotals.pendientes.finPendientes} sin despachar`,
          ],
        ] : []),
        [
          'Total Rutas en Piso',
          `${summaryTotals.enPiso.totalPlan}`,
          `${summaryTotals.enPiso.finLiquidadas}`,
          `${summaryTotals.enPiso.finQuedan}`,
          '-',
          '-',
          `${summaryTotals.enPiso.finQuedan} rutas resguardadas para mañana`,
        ],
        sectionDivider('POR ANTIGÜEDAD DESDE LO PLANIFICADO (todas las rutas sin importar su estado — se solapan con el bloque anterior)'),
        [
          'Rutas de 24 Horas',
          `${summaryTotals.rutas24h.totalPlan}`,
          `${summaryTotals.rutas24h.finLiquidadas}`,
          `${summaryTotals.rutas24h.finPendientes}`,
          summaryTotals.rutas24h.finCajasEntregadas.toFixed(1),
          summaryTotals.rutas24h.finCajasDevueltas.toFixed(1),
          `${summaryTotals.rutas24h.finLiquidadas} evacuadas con éxito`,
        ],
        [
          'Rutas de 72 Horas',
          `${summaryTotals.rutas72h.totalPlan}`,
          `${summaryTotals.rutas72h.finLiquidadas}`,
          `${summaryTotals.rutas72h.finPendientes}`,
          summaryTotals.rutas72h.finCajasEntregadas.toFixed(1),
          summaryTotals.rutas72h.finCajasDevueltas.toFixed(1),
          summaryTotals.rutas72h.finPendientes > 0 ? `${summaryTotals.rutas72h.finPendientes} sin liquidar` : 'Evacuadas',
        ],
        [
          'Rutas Mayores a 72 Horas',
          `${summaryTotals.rutasMayor72h.totalPlan}`,
          `${summaryTotals.rutasMayor72h.finLiquidadas}`,
          `${summaryTotals.rutasMayor72h.finPendientes}`,
          summaryTotals.rutasMayor72h.finCajasEntregadas.toFixed(1),
          summaryTotals.rutasMayor72h.finCajasDevueltas.toFixed(1),
          summaryTotals.rutasMayor72h.finPendientes > 0 ? 'CRÍTICO: Pendientes de evacuar' : 'Completamente resueltas',
        ],
        [
          'TOTAL GENERAL OPERATIVO (universo de rutas del reporte)',
          `${summaryTotals.totalRutasPlan}`,
          `${stats.liquidadasCount || 0}`,
          `${summaryTotals.totalRutasPlan - (stats.liquidadasCount || 0)}`,
          summaryTotals.totalCajasEntregadas.toFixed(1),
          summaryTotals.totalCajasDevueltas.toFixed(1),
          `Efectividad entrega: ${stats.efectividadEntregaPorc || '100'}% (no es la suma de las 6 filas)`,
        ],
      ];

  autoTable(doc, {
    startY: currentY,
    head: summaryHead,
    body: summaryRows as any,
    theme: 'grid',
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      textColor: [30, 41, 59],
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { fontStyle: 'bold', halign: 'left' },
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'center' },
      5: { halign: isInicio ? 'left' : 'center' },
      6: { halign: 'left' },
    },
    didParseCell: (hookData) => {
      // Fila final de total general destacada
      if (hookData.section === 'body' && hookData.row.index === summaryRows.length - 1) {
        hookData.cell.styles.fillColor = [226, 232, 240];
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.textColor = [15, 23, 42];
      }
    },
    margin: { left: margin, right: margin },
  });

  // @ts-ignore
  const table1EndY = (doc as any).lastAutoTable?.finalY || currentY + 40;
  currentY = table1EndY + 5;

  // 4. TABLA 2: TABLA DETALLADA DE RUTAS PLANIFICADAS
  const detailedHead = isInicio
    ? [
        [
          'NO. RUTA',
          'F. PLANIFICADA',
          'F. DESPACHADA',
          'HORAS',
          'INDICADOR / RETRASO',
          'CAJAS',
          'PARADAS',
          'AGENCIA',
          'MERCADO',
        ],
      ]
    : [
        [
          'NO. RUTA',
          'F. PLANIFICADA',
          'F. DESPACHADA',
          'HORAS',
          'INDICADOR',
          'CAJAS PLAN',
          'CAJAS ENT.',
          'CAJAS DEV.',
          'PARADAS',
          'ESTADO CIERRE',
          'AGENCIA',
        ],
      ];

  const detailedRows = routesList.map((r) => {
    if (isInicio) {
      return [
        r.id,
        r.fechaPlanificadaStr,
        r.fechaDespachadaStr,
        r.horasTexto,
        `${r.estaAtrasado ? 'CON RETRASO' : 'EN TIEMPO'} - ${r.indicadorDetalle}`,
        `${r.cajasFisicasPlan}`,
        `${r.paradasPlan}`,
        r.agencia,
        r.mercado || '-',
      ];
    } else {
      return [
        r.id,
        r.fechaPlanificadaStr,
        r.fechaDespachadaStr,
        r.horasTexto,
        r.estaAtrasado ? 'RETRASO' : 'A TIEMPO',
        `${r.cajasFisicasPlan}`,
        r.isLiquidada ? `${r.cajasFisicasEntregadas}` : '-',
        r.isLiquidada ? `${r.cajasFisicasDevueltas}` : '-',
        r.isLiquidada ? `${r.guiasExitosas}/${r.paradasPlan}` : `${r.paradasPlan}`,
        r.isLiquidada ? 'Liquidada' : r.isFloor ? 'En Piso' : 'Pendiente',
        r.agencia,
      ];
    }
  });

  autoTable(doc, {
    startY: currentY,
    head: detailedHead,
    body: detailedRows,
    theme: 'striped',
    styles: {
      fontSize: 6.5,
      cellPadding: 1.4,
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { fontStyle: 'bold', halign: 'center' },
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'center' },
      4: { halign: 'left' },
      5: { halign: 'center' },
      6: { halign: 'center' },
      7: { halign: 'center' },
      8: { halign: 'center' },
      9: { halign: 'left' },
    },
    didParseCell: (hookData) => {
      // Colorear ligeramente si está atrasado en la columna de indicador
      if (hookData.section === 'body') {
        const rowData = routesList[hookData.row.index];
        if (rowData && rowData.estaAtrasado && hookData.column.index === 4) {
          hookData.cell.styles.textColor = [185, 28, 28]; // Rojo
          hookData.cell.styles.fontStyle = 'bold';
        }
      }
    },
    margin: { left: margin, right: margin },
  });

  // 4.5 TABLA 3: RECURSOS NO ASIGNADOS (camiones y personal disponibles que no
  // salieron a ruta hoy, con su motivo) — antes se calculaba en el modal pero
  // nunca llegaba al PDF exportado/impreso.
  const unassigned = data.unassignedResources;
  if (unassigned && (unassigned.trucks.length > 0 || unassigned.staff.length > 0)) {
    // @ts-ignore
    const prevTableEndY = (doc as any).lastAutoTable?.finalY || currentY;
    currentY = prevTableEndY + 7;

    if (currentY > pageHeight - 40) {
      doc.addPage();
      currentY = margin + 4;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('RECURSOS NO ASIGNADOS (Disponibles que no salieron a ruta)', margin, currentY);
    currentY += 4;

    const resourceHead = [['TIPO', 'ID / IDENTIFICACIÓN', 'DETALLE', 'MOTIVO DE NO ASIGNACIÓN']];
    const resourceRows: string[][] = [
      ...unassigned.trucks.map((t) => ['Camión', t.id, t.placa, t.motivo]),
      ...unassigned.staff.map((s) => ['Personal', s.id, `${s.nombre} (${s.puesto})`, s.motivo]),
    ];

    autoTable(doc, {
      startY: currentY,
      head: resourceHead,
      body: resourceRows,
      theme: 'striped',
      styles: {
        fontSize: 6.5,
        cellPadding: 1.4,
        textColor: [15, 23, 42],
        lineColor: [226, 232, 240],
        lineWidth: 0.15,
      },
      headStyles: {
        fillColor: [71, 85, 105],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { fontStyle: 'bold', halign: 'center', cellWidth: 24 },
        1: { halign: 'center', cellWidth: 30 },
        2: { halign: 'left' },
        3: { halign: 'left' },
      },
      margin: { left: margin, right: margin },
    });

    // @ts-ignore
    currentY = ((doc as any).lastAutoTable?.finalY || currentY) + 4;

    const reasonSummaryParts: string[] = [
      ...unassigned.trucksByReason.map((r) => `${r.count} Camión(es) - ${r.reason}`),
      ...unassigned.staffByReason.map((r) => `${r.count} Personal - ${r.reason}`),
    ];
    if (reasonSummaryParts.length > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`Resumen por motivo: ${reasonSummaryParts.join(' • ')}`, margin, currentY, {
        maxWidth: pageWidth - margin * 2,
      });
    }
  }

  // 5. PIE DE PÁGINA EN TODAS LAS HOJAS (didDrawPage)
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(148, 163, 184); // Slate 400

    doc.line(margin, pageHeight - 8, pageWidth - margin, pageHeight - 8);

    doc.text(
      `DISCARGA CONTROLER • Sistema de Gestión de Rutas y Liquidación • Emitido el ${new Date().toLocaleDateString('es-GT')} a las ${new Date().toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}`,
      margin,
      pageHeight - 4.5
    );

    doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 4.5, { align: 'right' });
  }

  // Ejecución de la acción
  const cleanFecha = (fechaHoy || 'HOY').replace(/[\/\\]/g, '-');
  const cleanAgency = filterAgency === 'TODAS' ? 'Todas_Agencias' : filterAgency.replace(/[\s\/\\]+/g, '_');
  const filename = `${isInicio ? 'Reporte_Inicio_de_Dia_DISCARGA' : 'Reporte_Fin_de_Dia_DISCARGA'}_${cleanAgency}_${cleanFecha}.pdf`;

  if (action === 'save') {
    doc.save(filename);
  } else if (action === 'print') {
    try {
      doc.autoPrint();
      const blobUrl = doc.output('bloburl');
      const printWindow = window.open(blobUrl, '_blank');
      if (!printWindow) {
        // Si el popup fue bloqueado por el navegador, descargar directamente el archivo
        doc.save(filename);
      }
    } catch {
      doc.save(filename);
    }
  }

  return doc;
}
