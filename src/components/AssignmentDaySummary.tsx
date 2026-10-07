import React, { useMemo, useState } from 'react';
import { Route } from '../types';
import { SEGMENTO_OPTIONS } from '../data/segmentos';
import { formatDateToGuatemala } from '../utils/date';

// --- Resumen de Fin de Asignación (solo lectura) ---
// Cuadro tipo reporte con las rutas del día, las del día anterior (parciales
// y/o piso que salen hoy), las rutas a piso, recargas y las que salen mañana,
// cada bloque desglosado por SEGMENTO. Solo lee las rutas: no modifica nada.

interface Props {
  routes: Route[];
  fechaOperacion: string; // DD/MM/AAAA (jornada operativa del tablero)
  agencies: string[];
  defaultAgency?: string;
}

const dayNum = (v: unknown): number | null => {
  if (!v) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(formatDateToGuatemala(v) || '');
  return m ? Math.round(Date.UTC(+m[3], +m[2] - 1, +m[1]) / 86400000) : null;
};
const isFloor = (r: Route) =>
  Boolean(r.aPiso || r.tipoAsignacion === 'Ruta a Piso' || r.asignacion?.tipoAsignacion === 'Ruta a Piso');
const isBolson = (r: Route) => Boolean(r.esBolson || r.tipoAsignacion === 'Ruta Bolsón');
const isSelfService = (r: Route) => Boolean(r.esSelfService || r.tipoAsignacion === 'Self Service');
const isRecarga = (r: Route) =>
  Boolean(r.esRecarga || r.tipoAsignacion === 'Recarga' || r.asignacion?.tipoAsignacion === 'Recarga');
const volumenDe = (r: Route) => {
  const n = Number(r.cajasFisicas || r.cajasOriginales || 0);
  return isNaN(n) ? 0 : n;
};
const segDe = (r: Route) => {
  const s = String(r.segmento || '').trim().toUpperCase();
  return s && s !== '-' ? s : 'SIN SEGMENTO';
};
const fmtVol = (n: number) => n.toLocaleString('es-GT', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

interface Bloque {
  rutas: number;
  volumen: number;
  porSeg: Map<string, number>;
}
const nuevoBloque = (): Bloque => ({ rutas: 0, volumen: 0, porSeg: new Map() });
const sumar = (b: Bloque, r: Route) => {
  b.rutas += 1;
  b.volumen += volumenDe(r);
  const s = segDe(r);
  b.porSeg.set(s, (b.porSeg.get(s) || 0) + 1);
};

export const AssignmentDaySummary: React.FC<Props> = ({ routes, fechaOperacion, agencies, defaultAgency }) => {
  const [agencia, setAgencia] = useState<string>(defaultAgency && defaultAgency !== 'TODAS' ? defaultAgency : 'TODAS');
  const [copiado, setCopiado] = useState(false);

  const resumen = useMemo(() => {
    const hoy = dayNum(fechaOperacion) ?? dayNum(new Date());
    const dia = nuevoBloque();
    const anterior = nuevoBloque();
    const piso = nuevoBloque();
    const manana = nuevoBloque();
    let recargas = 0;
    let bolson = 0;
    // Self Service: el cliente recoge (sin tripulación). Sí son rutas del día
    // (cuentan en su bloque y en el volumen); aquí se muestra cuántas son.
    let selfService = 0;
    routes.forEach((r) => {
      if (agencia !== 'TODAS' && r.agencia !== agencia) return;
      const base = dayNum(r.fechaOriginalRuta || r.fecha);
      const liquidada = r.estado === 'Liquidada';
      // Liquidadas de días anteriores ya no forman parte de la asignación de hoy.
      if (liquidada && base !== null && hoy !== null && base < hoy) return;
      if (!liquidada && isRecarga(r) && !isFloor(r)) recargas += 1;
      if (isFloor(r)) {
        if (!liquidada) sumar(piso, r);
        return;
      }
      if (isBolson(r)) {
        if (!liquidada) bolson += 1;
        return;
      }
      if (isSelfService(r) && (base === null || hoy === null || base <= hoy)) selfService += 1;
      if (base === null || hoy === null || base === hoy) sumar(dia, r);
      else if (base < hoy) sumar(anterior, r);
      else sumar(manana, r);
    });
    // Segmentos a mostrar: los del catálogo (siempre, aunque estén en 0) + otros presentes.
    const extras = new Set<string>();
    [dia, anterior, piso, manana].forEach((b) => b.porSeg.forEach((_, k) => extras.add(k)));
    const segmentos = [...SEGMENTO_OPTIONS, ...Array.from(extras).filter((s) => !SEGMENTO_OPTIONS.includes(s)).sort()];
    return { dia, anterior, piso, manana, recargas, bolson, selfService, segmentos };
  }, [routes, fechaOperacion, agencia]);

  const { dia, anterior, piso, manana, recargas, bolson, selfService, segmentos } = resumen;
  const totalRutas = dia.rutas + anterior.rutas;
  const totalVolumen = dia.volumen + anterior.volumen;

  // Colores como en el formato del reporte (azul, gris y amarillo).
  const head = 'text-slate-900 font-black';
  const val = 'text-slate-900 font-black';
  const yellow = 'text-slate-900 font-black';
  const cell = 'border border-slate-800 px-3 py-1.5 text-center';

  type Fila = { label: string; value: string | number; labelCls?: string; valueCls?: string; topBorder?: boolean; labelBg?: string; valueBg?: string };
  const filas: Fila[] = [];
  const bloque = (titulo: string, b: Bloque, conVolumen: boolean) => {
    filas.push({ label: titulo, value: b.rutas, labelCls: head, valueCls: val, topBorder: true, labelBg: '#2e8fe0', valueBg: '#c8c8c8' });
    segmentos.forEach((s) => filas.push({ label: s, value: b.porSeg.get(s) || 0 }));
    if (conVolumen) filas.push({ label: 'Volumen', value: fmtVol(b.volumen), valueCls: titulo === 'Rutas del día' ? yellow : undefined, valueBg: titulo === 'Rutas del día' ? '#ffff00' : undefined });
  };
  bloque('Rutas del día', dia, true);
  bloque('Rutas día anterior (parciales y/o piso)', anterior, true);
  filas.push({ label: 'Total Rutas', value: totalRutas, labelCls: 'font-black', valueCls: val, topBorder: true, valueBg: '#c8c8c8' });
  filas.push({ label: 'Total Volumen', value: fmtVol(totalVolumen), labelCls: 'font-black', valueCls: yellow, valueBg: '#ffff00' });
  bloque('Rutas piso', piso, false);
  filas.push({ label: 'Recargas', value: recargas, labelCls: 'font-black', valueCls: val, topBorder: true, valueBg: '#c8c8c8' });
  filas.push({ label: 'Self Service (sin tripulación)', value: selfService, labelCls: 'font-black', valueCls: val, valueBg: '#c8c8c8' });
  if (bolson > 0) filas.push({ label: 'Rutas Bolsón (no salen)', value: bolson, labelCls: 'font-black', valueCls: val, valueBg: '#c8c8c8' });
  filas.push({ label: 'Rutas que salen Mañana', value: manana.rutas, labelCls: 'font-black', valueCls: val, valueBg: '#c8c8c8' });

  const copiar = async () => {
    const titulo = `Fin de Asignación ${fechaOperacion}${agencia !== 'TODAS' ? ` · ${agencia}` : ''}`;
    const txt = [titulo, ...filas.map((f) => `${f.label}: ${f.value}`)].join('\n');
    try {
      await navigator.clipboard.writeText(txt);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* el navegador no permitió copiar */
    }
  };

  return (
    <div id="resumenFinAsignacion" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-bold text-slate-700 text-[11px] uppercase tracking-wide">
          Resumen de asignación del día · {fechaOperacion}
        </h4>
        <div className="flex items-center gap-2">
          <select
            value={agencia}
            onChange={(e) => setAgencia(e.target.value)}
            aria-label="Agencia del resumen"
            className="min-h-[36px] px-2 rounded-lg border border-slate-300 text-xs font-semibold bg-white"
          >
            <option value="TODAS">Todas las agencias</option>
            {agencies.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={copiar}
            className="min-h-[36px] px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
            title="Copiar el resumen como texto (para WhatsApp o correo)"
          >
            {copiado ? '✓ Copiado' : 'Copiar resumen'}
          </button>
        </div>
      </div>
      <table className="w-full max-w-xl mx-auto border-collapse text-[13px]">
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} className={f.topBorder ? 'border-t-[3px] border-slate-900' : ''}>
              <td className={`${cell} ${f.labelCls || 'font-bold text-slate-800'}`} style={{ background: f.labelBg || '#ffffff' }}>{f.label}</td>
              <td className={`${cell} w-40 ${f.valueCls || 'font-bold text-slate-900'}`} style={{ background: f.valueBg || '#ffffff' }}>{f.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-slate-400 text-center">
        Solo lectura · Rutas del día y del día anterior según su fecha de ruta; a piso y recargas según su estado actual en el tablero. Las Self Service ya están incluidas en Rutas del día y Total Rutas.
      </p>
    </div>
  );
};
