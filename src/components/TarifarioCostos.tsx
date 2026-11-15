import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Tarifario, TarifarioDatos } from '../utils/costos';
import { SEGMENTO_OPTIONS } from '../data/segmentos';
import { Button } from './ui/Button';
import { Upload, Search, Save, RotateCcw, ChevronRight } from 'lucide-react';

// --- COSTOS: tarifario mes a mes (solo administradores) ---
// Matriz con los valores del Excel "Tarifa por viaje y Stand By": cada fila es
// una agencia (o una placa) y cada columna un mes del año. Al guardar, el
// Tablero Ventas recalcula la venta estimada de esos meses.
// Un mes sin valores guardados usa los del último mes guardado (o los del Excel base).

const n2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '');
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[Q,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const copia = (t: TarifarioDatos): TarifarioDatos => JSON.parse(JSON.stringify(t));
const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const normTxt = (s?: string | null) => String(s || '').trim().toLowerCase();

// --- Lectura del Excel (mismo formato que "01. Tarifa por viaje y Stand By.xlsx") ---
export async function leerExcel(file: File, actual: TarifarioDatos): Promise<{ datos: TarifarioDatos; resumen: string[] }> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const hoja = (re: RegExp) => {
    const nombre = wb.SheetNames.find((n) => re.test(n.toLowerCase()));
    return nombre ? (XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, raw: true }) as unknown[][]) : null;
  };
  const desdeEncabezado = (filas: unknown[][], re: RegExp) => {
    const i = filas.findIndex((f) => f.some((c) => re.test(String(c ?? '').toLowerCase())));
    return i < 0 ? [] : filas.slice(i + 1).filter((f) => f.some((c) => c !== null && c !== undefined && String(c).trim() !== ''));
  };
  const datos = copia(actual);
  const resumen: string[] = [];
  const v = hoja(/viaje/);
  if (v) {
    const filas = desdeEncabezado(v, /^agencia$/);
    datos.viaje = filas
      .filter((f) => String(f[0] ?? '').trim())
      .map((f) => ({ agencia: String(f[0]).trim(), t3: num(f[1]), t4: num(f[2]), t5: num(f[3]), camion: num(f[4]), vpp: num(f[5]), app: num(f[6]) }));
    resumen.push(`Tarifa por viaje: ${datos.viaje.length} agencias`);
  }
  const q = hoja(/qlp|personal/);
  if (q) {
    const filas = desdeEncabezado(q, /segmento|agencia/);
    datos.standbyPersonal = filas.filter((f) => String(f[0] ?? '').trim()).map((f) => ({ agencia: String(f[0]).trim(), vpp: num(f[1]), app: num(f[2]) }));
    resumen.push(`Standby personal: ${datos.standbyPersonal.length} agencias`);
  }
  const c = hoja(/cami/);
  if (c) {
    const i = c.findIndex((f) => f.some((x) => /placa/i.test(String(x ?? ''))));
    const enc = (c[i] || []).map((x) => String(x ?? '').toLowerCase());
    const col = (re: RegExp, def: number) => {
      const k = enc.findIndex((x) => re.test(x));
      return k < 0 ? def : k;
    };
    const [cId, cPl, cSe, cAg, cCo] = [col(/sap|^id/, 0), col(/placa/, 1), col(/serie/, 2), col(/agencia/, 5), col(/costo/, 6)];
    datos.standbyCamiones = c
      .slice(i + 1)
      .filter((f) => String(f[cPl] ?? '').trim())
      .map((f) => ({ idSap: String(f[cId] ?? '').trim(), placa: String(f[cPl]).trim().toUpperCase(), serie: String(f[cSe] ?? '').trim(), agencia: String(f[cAg] ?? '').trim(), costo: num(f[cCo]) }));
    resumen.push(`Standby camiones: ${datos.standbyCamiones.length} camiones`);
  }
  if (!resumen.length) throw new Error('El archivo no tiene las hojas del tarifario (Tarifa por viaje, Standby QLP, Standby Camiones).');
  return { datos, resumen };
}


type Concepto = 't3' | 't4' | 't5' | 'camion' | 'vpp' | 'app' | 'stbVpp' | 'stbApp' | 'stbCam' | 'atanasio';
const CONCEPTOS: { k: Concepto; l: string; grupo: string; ayuda: string }[] = [
  { k: 't3', l: 'T3', grupo: '1er viaje', ayuda: 'Tarifa del 1er viaje con 3 personas (piloto + 2 auxiliares). Incluye camión y tripulación.' },
  { k: 't4', l: 'T4', grupo: '1er viaje', ayuda: 'Tarifa del 1er viaje con 4 personas (piloto + 3 auxiliares).' },
  { k: 't5', l: 'T5', grupo: '1er viaje', ayuda: 'Tarifa del 1er viaje con 5 personas (piloto + 4 auxiliares).' },
  { k: 'camion', l: 'Camión', grupo: 'Recarga', ayuda: 'Recarga y revisita: costo del camión (se suma VPP y APP).' },
  { k: 'vpp', l: 'VPP', grupo: 'Recarga', ayuda: 'Recarga y revisita: valor por el piloto.' },
  { k: 'app', l: 'APP', grupo: 'Recarga', ayuda: 'Recarga y revisita: valor por cada auxiliar.' },
  { k: 'stbVpp', l: 'Standby VPP', grupo: 'Standby', ayuda: 'Por día, por piloto que no salió con motivo "Remunera (StandBy)".' },
  { k: 'stbApp', l: 'Standby APP', grupo: 'Standby', ayuda: 'Por día, por auxiliar que no salió con motivo "Remunera (StandBy)".' },
  { k: 'stbCam', l: 'Standby camiones', grupo: 'Standby', ayuda: 'Por día, por camión que no salió con un motivo que remunera. Se busca por placa.' },
  { k: 'atanasio', l: 'Segmentos Atanasio', grupo: 'Otros', ayuda: 'Qué segmentos de Atanasio usan la tarifa SM y cuáles la ME (el resto usa Atanasio).' },
];

interface Props {
  tarifarios: Map<string, Tarifario>; // meses guardados
  base: TarifarioDatos; // valores del Excel base
  mesInicial: string; // 'AAAA-MM'
  onGuardar: (ts: Tarifario[]) => Promise<void>;
}

// Celda editable: texto mientras se escribe, número al salir.
const Celda: React.FC<{ valor: number; editado: boolean; heredado: boolean; actual: boolean; etiqueta: string; onCambio: (v: number) => void }> = ({ valor, editado, heredado, actual, etiqueta, onCambio }) => {
  const [txt, setTxt] = useState(n2(valor));
  useEffect(() => setTxt(n2(valor)), [valor]);
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={etiqueta}
      value={txt}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => {
        const v = num(txt);
        setTxt(n2(v));
        if (Math.abs(v - valor) > 1e-9) onCambio(v);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={`w-[5.6rem] min-h-[32px] px-1.5 rounded-md border text-right tabular-nums text-[11.5px] outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 ${
        editado ? 'border-amber-400 bg-amber-50 font-bold text-slate-900' : heredado ? 'border-slate-200 bg-slate-50 text-slate-400 italic' : 'border-slate-200 bg-white text-slate-800'
      } ${actual ? 'ring-1 ring-sky-200' : ''}`}
    />
  );
};

export const TarifarioCostos: React.FC<Props> = ({ tarifarios, base, mesInicial, onGuardar }) => {
  const [anio, setAnio] = useState(Number(mesInicial.slice(0, 4)));
  const [concepto, setConcepto] = useState<Concepto>('t3');
  const [cambios, setCambios] = useState<Map<string, TarifarioDatos>>(new Map());
  const [buscar, setBuscar] = useState('');
  const [limite, setLimite] = useState(40);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ t: 'ok' | 'error' | 'info'; m: string } | null>(null);
  const [mesImportar, setMesImportar] = useState(mesInicial);
  const archivo = useRef<HTMLInputElement>(null);

  const meses = useMemo(() => Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, '0')}`), [anio]);
  // Valores vigentes de cada mes: guardado → último guardado antes → Excel base.
  const vigente = (m: string): { t: TarifarioDatos; guardado: boolean } => {
    const g = tarifarios.get(m);
    if (g) return { t: g, guardado: true };
    const prev = [...tarifarios.keys()].filter((k) => k < m).sort().pop();
    return { t: prev ? (tarifarios.get(prev) as TarifarioDatos) : base, guardado: false };
  };
  const datosDe = (m: string) => cambios.get(m) || vigente(m).t;
  const editar = (m: string, f: (d: TarifarioDatos) => void) => {
    setCambios((prev) => {
      const n = new Map<string, TarifarioDatos>(prev);
      const d = copia(n.get(m) || vigente(m).t);
      f(d);
      n.set(m, d);
      return n;
    });
  };

  // Filas: agencias (o placas) que aparecen en cualquier mes del año.
  const filas = useMemo(() => {
    const set: string[] = [];
    const add = (x: string) => x && !set.some((y) => normTxt(y) === normTxt(x)) && set.push(x);
    meses.forEach((m) => {
      const d = datosDe(m);
      if (concepto === 'stbCam') d.standbyCamiones.forEach((c) => add(c.placa));
      else if (concepto === 'stbVpp' || concepto === 'stbApp') d.standbyPersonal.forEach((c) => add(c.agencia));
      else d.viaje.forEach((c) => add(c.agencia));
    });
    const b = buscar.trim().toLowerCase();
    if (concepto !== 'stbCam' || !b) return set.filter((x) => !b || x.toLowerCase().includes(b));
    // Camiones: también se busca por agencia o ID SAP.
    const d = datosDe(mesInicial);
    return set.filter((p) => {
      const c = d.standbyCamiones.find((x) => x.placa === p);
      return [p, c?.agencia, c?.idSap].some((v) => String(v || '').toLowerCase().includes(b));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meses, concepto, buscar, cambios, tarifarios, base]);

  const leer = (d: TarifarioDatos, fila: string): number | null => {
    const n = normTxt(fila);
    if (concepto === 'stbCam') {
      const c = d.standbyCamiones.find((x) => normTxt(x.placa) === n);
      return c ? c.costo : null;
    }
    if (concepto === 'stbVpp' || concepto === 'stbApp') {
      const c = d.standbyPersonal.find((x) => normTxt(x.agencia) === n);
      return c ? (concepto === 'stbVpp' ? c.vpp : c.app) : null;
    }
    const c = d.viaje.find((x) => normTxt(x.agencia) === n);
    return c ? (c[concepto as 't3'] as number) : null;
  };
  const escribir = (d: TarifarioDatos, fila: string, v: number) => {
    const n = normTxt(fila);
    if (concepto === 'stbCam') {
      const c = d.standbyCamiones.find((x) => normTxt(x.placa) === n);
      if (c) c.costo = v;
      else d.standbyCamiones.push({ placa: fila, costo: v });
    } else if (concepto === 'stbVpp' || concepto === 'stbApp') {
      let c = d.standbyPersonal.find((x) => normTxt(x.agencia) === n);
      if (!c) d.standbyPersonal.push((c = { agencia: fila, vpp: 0, app: 0 }));
      if (concepto === 'stbVpp') c.vpp = v;
      else c.app = v;
    } else {
      let c = d.viaje.find((x) => normTxt(x.agencia) === n);
      if (!c) d.viaje.push((c = { agencia: fila, t3: 0, t4: 0, t5: 0, camion: 0, vpp: 0, app: 0 }));
      (c as unknown as Record<string, number>)[concepto] = v;
    }
  };

  const hoyMes = mesInicial;
  const info = CONCEPTOS.find((c) => c.k === concepto)!;
  const mesesConCambio = [...cambios.keys()].sort();

  const guardar = async () => {
    if (!mesesConCambio.length) return;
    setGuardando(true);
    setAviso(null);
    try {
      await onGuardar(mesesConCambio.map((m) => ({ ...(cambios.get(m) as TarifarioDatos), mes: m })));
      setAviso({ t: 'ok', m: `Guardado: ${mesesConCambio.map((m) => `${MESES_CORTO[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`).join(', ')}. El Tablero Ventas ya usa estos valores.` });
      setCambios(new Map());
    } catch (e) {
      setAviso({ t: 'error', m: (e as Error).message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-slate-900 tracking-wide">COSTOS · tarifario mes a mes</h3>
          <p className="text-[11.5px] text-slate-500 mt-0.5 max-w-3xl">
            Cambia los valores de cada mes. Al guardar, la venta estimada del Tablero Ventas se recalcula. Los meses sin guardar (en gris) usan los valores del último mes guardado.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-0.5">
            <button type="button" aria-label="Año anterior" onClick={() => setAnio((a) => a - 1)} className="w-8 h-8 rounded-md hover:bg-slate-100 cursor-pointer rotate-180 inline-flex items-center justify-center">
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="px-2 text-sm font-bold tabular-nums">{anio}</span>
            <button type="button" aria-label="Año siguiente" onClick={() => setAnio((a) => a + 1)} className="w-8 h-8 rounded-md hover:bg-slate-100 cursor-pointer inline-flex items-center justify-center">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            Importar Excel en
            <select value={mesImportar} onChange={(e) => setMesImportar(e.target.value)} className="min-h-[34px] px-2 rounded-lg border border-slate-200 bg-white text-xs">
              {meses.map((m) => (
                <option key={m} value={m}>
                  {MESES_CORTO[Number(m.slice(5)) - 1]} {m.slice(0, 4)}
                </option>
              ))}
            </select>
          </label>
          <input
            ref={archivo}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const r = await leerExcel(f, datosDe(mesImportar));
                setCambios((prev) => new Map<string, TarifarioDatos>(prev).set(mesImportar, r.datos));
                setAviso({ t: 'info', m: `Excel cargado en ${MESES_CORTO[Number(mesImportar.slice(5)) - 1]} ${mesImportar.slice(0, 4)} (${r.resumen.join(' · ')}). Revisa y presiona Guardar.` });
              } catch (err) {
                setAviso({ t: 'error', m: (err as Error).message });
              }
            }}
          />
          <Button variant="secondary" size="sm" icon={Upload} onClick={() => archivo.current?.click()}>
            Importar Excel
          </Button>
          {mesesConCambio.length > 0 && (
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={() => setCambios(new Map())}>
              Descartar
            </Button>
          )}
          <Button variant="success" size="sm" icon={Save} disabled={guardando || !mesesConCambio.length} onClick={guardar}>
            {guardando ? 'Guardando…' : mesesConCambio.length ? `Guardar (${mesesConCambio.length} mes${mesesConCambio.length > 1 ? 'es' : ''})` : 'Guardar'}
          </Button>
        </div>
      </div>

      {aviso && (
        <div
          role="status"
          className={`text-xs rounded-lg px-3 py-2 border ${
            aviso.t === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : aviso.t === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-sky-50 border-sky-200 text-sky-900'
          }`}
        >
          {aviso.m}
        </div>
      )}

      {/* Conceptos */}
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {['1er viaje', 'Recarga', 'Standby', 'Otros'].map((g) => (
          <div key={g} className="flex items-center gap-1.5">
            <span className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400">{g}</span>
            <div className="flex rounded-lg bg-slate-100 p-0.5">
              {CONCEPTOS.filter((c) => c.grupo === g).map((c) => (
                <button
                  key={c.k}
                  type="button"
                  aria-pressed={concepto === c.k}
                  onClick={() => {
                    setConcepto(c.k);
                    setBuscar('');
                    setLimite(40);
                  }}
                  className={`min-h-[32px] px-2.5 rounded-md text-xs font-semibold cursor-pointer whitespace-nowrap ${concepto === c.k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  {c.l}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11.5px] text-slate-600">{info.ayuda}</p>
        <div className="flex items-center gap-3 text-[10.5px] text-slate-500">
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded border border-slate-300 bg-white" />Guardado</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded border border-slate-200 bg-slate-50" />Heredado</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded border border-amber-400 bg-amber-50" />Con cambios</span>
        </div>
      </div>

      {concepto === 'atanasio' ? (
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            Se aplica a todos los meses de {anio}. Mercados Especiales usa Atanasio ME, Supermercados usa Atanasio SM y Mercado Abierto usa Atanasio.
          </p>
          {(['SM', 'ME'] as const).map((k) => {
            const actual = datosDe(hoyMes.startsWith(String(anio)) ? hoyMes : meses[0]).segmentosAtanasio || { SM: [], ME: [] };
            return (
              <div key={k}>
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">Atanasio {k}</div>
                <div className="flex flex-wrap gap-1.5">
                  {SEGMENTO_OPTIONS.map((s) => {
                    const on = (actual[k] || []).includes(s);
                    const otro = (actual[k === 'SM' ? 'ME' : 'SM'] || []).includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={on}
                        disabled={otro}
                        onClick={() =>
                          meses.forEach((m) =>
                            editar(m, (d) => {
                              const sa = { SM: [...(d.segmentosAtanasio?.SM || [])], ME: [...(d.segmentosAtanasio?.ME || [])] };
                              sa[k] = on ? sa[k].filter((x) => x !== s) : [...sa[k].filter((x) => x !== s), s];
                              d.segmentosAtanasio = sa;
                            })
                          )
                        }
                        className={`min-h-[34px] px-3 rounded-full text-xs font-semibold border cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${on ? 'bg-[#2C3790] text-white border-[#2C3790]' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-500'}`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <label className="relative inline-block">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={buscar}
              onChange={(e) => {
                setBuscar(e.target.value);
                setLimite(40);
              }}
              placeholder={concepto === 'stbCam' ? 'Buscar placa, agencia o ID SAP' : 'Buscar agencia'}
              aria-label="Buscar"
              className="min-h-[36px] pl-8 pr-3 rounded-lg border border-slate-200 text-xs w-64 outline-none focus:border-slate-400"
            />
          </label>
          <div className="overflow-x-auto -mx-1 border border-slate-200 rounded-xl">
            <table className="text-xs border-collapse">
              <thead className="bg-slate-50">
                <tr className="text-[10.5px] uppercase tracking-wide text-slate-500">
                  <th className="sticky left-0 z-10 bg-slate-50 text-left py-2 px-3 min-w-[9.5rem] border-b border-slate-200">{concepto === 'stbCam' ? 'Placa' : 'Agencia'}</th>
                  {meses.map((m) => {
                    const g = vigente(m).guardado;
                    const c = cambios.has(m);
                    return (
                      <th key={m} className={`py-2 px-1.5 text-center border-b border-slate-200 ${m === hoyMes ? 'bg-sky-50 text-sky-800' : ''}`}>
                        <div>{MESES_CORTO[Number(m.slice(5)) - 1]}</div>
                        <div className={`text-[9px] font-semibold normal-case tracking-normal ${c ? 'text-amber-700' : g ? 'text-emerald-700' : 'text-slate-400'}`}>
                          {c ? 'con cambios' : g ? 'guardado' : 'heredado'}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filas.slice(0, limite).map((fila) => {
                  const sub = concepto === 'stbCam' ? datosDe(hoyMes).standbyCamiones.find((x) => x.placa === fila)?.agencia : '';
                  return (
                    <tr key={fila} className="hover:bg-slate-50/60">
                      <td className="sticky left-0 z-10 bg-white py-1 px-3 font-semibold text-slate-800 whitespace-nowrap">
                        <div className="flex items-center justify-between gap-2">
                          <span>
                            <span className={concepto === 'stbCam' ? 'font-mono' : ''}>{fila}</span>
                            {sub && <span className="block text-[10px] font-normal text-slate-400">{sub}</span>}
                          </span>
                          <button
                            type="button"
                            title="Copiar el valor del mes actual a los meses siguientes del año"
                            aria-label={`Copiar ${fila} a los meses siguientes`}
                            onClick={() => {
                              const desde = meses.includes(hoyMes) ? hoyMes : meses[0];
                              const v = leer(datosDe(desde), fila);
                              if (v == null) return;
                              meses.filter((m) => m > desde).forEach((m) => editar(m, (d) => escribir(d, fila, v)));
                            }}
                            className="w-6 h-6 rounded text-slate-400 hover:text-sky-700 hover:bg-sky-50 cursor-pointer inline-flex items-center justify-center text-[11px] font-bold"
                          >
                            »
                          </button>
                        </div>
                      </td>
                      {meses.map((m) => {
                        const v = leer(datosDe(m), fila);
                        const editado = cambios.has(m) && v !== leer(vigente(m).t, fila);
                        return (
                          <td key={m} className={`py-1 px-1 ${m === hoyMes ? 'bg-sky-50/50' : ''}`}>
                            <Celda
                              valor={v ?? 0}
                              editado={editado}
                              heredado={!vigente(m).guardado && !cambios.has(m)}
                              actual={m === hoyMes}
                              etiqueta={`${fila} ${MESES_CORTO[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`}
                              onCambio={(x) => editar(m, (d) => escribir(d, fila, x))}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filas.length > limite && (
            <button type="button" onClick={() => setLimite((l) => l + 60)} className="text-xs font-semibold text-sky-700 hover:underline cursor-pointer">
              Mostrar más ({filas.length - limite} restantes)
            </button>
          )}
          <p className="text-[11px] text-slate-500">
            El botón » copia el valor del mes actual a los meses siguientes del año. Los cambios se guardan solo al presionar Guardar.
          </p>
        </>
      )}
    </section>
  );
};
