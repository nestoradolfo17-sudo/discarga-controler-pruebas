import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Tarifario, TarifarioDatos, TarifaViaje, TarifaStandbyPersonal, TarifaStandbyCamion } from '../utils/costos';
import { SEGMENTO_OPTIONS } from '../data/segmentos';
import { Button } from './ui/Button';
import { Upload, Search, Plus, Trash2, Save, RotateCcw } from 'lucide-react';

// --- Tarifario mensual (solo administradores) ---
// Las mismas tablas del Excel "Tarifa por viaje y Stand By", editables por mes.
// Al guardar, los costos del mes se recalculan con estos valores.

interface Props {
  mes: string;
  tarifario: TarifarioDatos; // el vigente para el mes (propio, heredado o base)
  origen: string; // de dónde viene (p. ej. "Guardado el ...", "Heredado de oct 2026")
  propio: boolean; // ¿ya hay tarifario guardado para este mes?
  onGuardar: (t: Tarifario) => Promise<void>;
}

type Pestana = 'viaje' | 'personal' | 'camiones' | 'atanasio';
const n2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '');
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[Q,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const copia = (t: TarifarioDatos): TarifarioDatos => JSON.parse(JSON.stringify(t));

// Celda numérica: se edita como texto y se guarda como número al salir.
const CeldaQ: React.FC<{ valor: number; onCambio: (v: number) => void; etiqueta: string }> = ({ valor, onCambio, etiqueta }) => {
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
        if (v !== valor) onCambio(v);
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="w-24 min-h-[34px] px-2 rounded-md border border-slate-200 text-right tabular-nums text-xs outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 bg-white"
    />
  );
};

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

export const TarifarioCostos: React.FC<Props> = ({ mes, tarifario, origen, propio, onGuardar }) => {
  const [borrador, setBorrador] = useState<TarifarioDatos>(() => copia(tarifario));
  const [sucio, setSucio] = useState(false);
  const [pestana, setPestana] = useState<Pestana>('viaje');
  const [buscar, setBuscar] = useState('');
  const [limite, setLimite] = useState(60);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ t: 'ok' | 'error' | 'info'; m: string } | null>(null);
  const archivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setBorrador(copia(tarifario));
    setSucio(false);
    setAviso(null);
  }, [tarifario, mes]);

  const cambiar = (f: (d: TarifarioDatos) => void) => {
    setBorrador((prev) => {
      const d = copia(prev);
      f(d);
      return d;
    });
    setSucio(true);
  };
  const setViaje = (i: number, k: keyof TarifaViaje, v: number) => cambiar((d) => ((d.viaje[i] as unknown as Record<string, number>)[k] = v));
  const setPer = (i: number, k: keyof TarifaStandbyPersonal, v: number) => cambiar((d) => ((d.standbyPersonal[i] as unknown as Record<string, number>)[k] = v));

  const camionesFiltrados = useMemo(() => {
    const b = buscar.trim().toLowerCase();
    return borrador.standbyCamiones
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => !b || [c.placa, c.idSap, c.agencia, c.serie].some((x) => String(x || '').toLowerCase().includes(b)));
  }, [borrador.standbyCamiones, buscar]);

  const nombreMes = (() => {
    const [y, m] = mes.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('es-GT', { month: 'long', year: 'numeric' });
  })();

  const guardar = async () => {
    setGuardando(true);
    setAviso(null);
    try {
      await onGuardar({ ...borrador, mes });
      setSucio(false);
      setAviso({ t: 'ok', m: `Tarifario de ${nombreMes} guardado. Los costos del mes ya usan estos valores.` });
    } catch (e) {
      setAviso({ t: 'error', m: (e as Error).message });
    } finally {
      setGuardando(false);
    }
  };

  const tab = (k: Pestana, l: string, n?: number) => (
    <button
      key={k}
      type="button"
      role="tab"
      aria-selected={pestana === k}
      onClick={() => setPestana(k)}
      className={`min-h-[38px] px-3.5 rounded-lg text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap ${pestana === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
    >
      {l}
      {n != null && <span className="ml-1.5 text-[11px] text-slate-400">{n}</span>}
    </button>
  );

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-800">Tarifario de {nombreMes}</h3>
          <p className="text-[11.5px] text-slate-500 mt-0.5">
            {origen}
            {!propio && ' · Al guardar queda fijo para este mes.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
                const r = await leerExcel(f, borrador);
                setBorrador(r.datos);
                setSucio(true);
                setAviso({ t: 'info', m: `Excel leído (${r.resumen.join(' · ')}). Revisa y presiona Guardar.` });
              } catch (err) {
                setAviso({ t: 'error', m: (err as Error).message });
              }
            }}
          />
          <Button variant="secondary" size="sm" icon={Upload} onClick={() => archivo.current?.click()}>
            Importar Excel
          </Button>
          {sucio && (
            <Button
              variant="ghost"
              size="sm"
              icon={RotateCcw}
              onClick={() => {
                setBorrador(copia(tarifario));
                setSucio(false);
                setAviso(null);
              }}
            >
              Descartar cambios
            </Button>
          )}
          <Button variant="success" size="sm" icon={Save} disabled={guardando || (!sucio && propio)} onClick={guardar}>
            {guardando ? 'Guardando…' : propio ? 'Guardar cambios' : `Guardar para ${nombreMes}`}
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
      {sucio && <div className="text-[11.5px] font-semibold text-amber-700">Hay cambios sin guardar.</div>}

      <div role="tablist" aria-label="Tablas del tarifario" className="inline-flex max-w-full overflow-x-auto bg-slate-100 border border-slate-200 rounded-xl p-1 gap-0.5">
        {tab('viaje', 'Tarifa por viaje', borrador.viaje.length)}
        {tab('personal', 'Standby personal', borrador.standbyPersonal.length)}
        {tab('camiones', 'Standby camiones', borrador.standbyCamiones.length)}
        {tab('atanasio', 'Segmentos Atanasio')}
      </div>

      {pestana === 'viaje' && (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs min-w-[760px]">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wide text-slate-500">
                <th rowSpan={2} className="text-left py-2 px-2 align-bottom border-b border-slate-200">Agencia</th>
                <th colSpan={3} className="py-1 px-2 text-center bg-slate-50 rounded-t-lg">1er viaje · por tripulación</th>
                <th colSpan={3} className="py-1 px-2 text-center bg-sky-50 rounded-t-lg">Recarga</th>
              </tr>
              <tr className="text-[10.5px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="py-2 px-2 text-right bg-slate-50">T3 (3 pers.)</th>
                <th className="py-2 px-2 text-right bg-slate-50">T4 (4 pers.)</th>
                <th className="py-2 px-2 text-right bg-slate-50">T5 (5 pers.)</th>
                <th className="py-2 px-2 text-right bg-sky-50">Camión</th>
                <th className="py-2 px-2 text-right bg-sky-50">VPP (piloto)</th>
                <th className="py-2 px-2 text-right bg-sky-50">APP (auxiliar)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {borrador.viaje.map((v, i) => (
                <tr key={v.agencia + i}>
                  <td className="py-1.5 px-2 font-semibold text-slate-800 whitespace-nowrap">{v.agencia}</td>
                  {(['t3', 't4', 't5', 'camion', 'vpp', 'app'] as const).map((k) => (
                    <td key={k} className={`py-1.5 px-2 text-right ${k === 't3' || k === 't4' || k === 't5' ? 'bg-slate-50/60' : 'bg-sky-50/40'}`}>
                      <CeldaQ valor={v[k]} etiqueta={`${v.agencia} ${k}`} onCambio={(x) => setViaje(i, k, x)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-slate-500 mt-2">
            1er viaje: la tarifa incluye camión y tripulación; T3/T4/T5 = cantidad de personas (piloto + auxiliares). Recarga y revisita: camión + VPP por el piloto + APP por cada auxiliar. Camión de apoyo propio: igual que un viaje.
          </p>
        </div>
      )}

      {pestana === 'personal' && (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs min-w-[420px] max-w-xl">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <th className="text-left py-2 px-2">Agencia</th>
                <th className="py-2 px-2 text-right">Standby VPP (día)</th>
                <th className="py-2 px-2 text-right">Standby APP (día)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {borrador.standbyPersonal.map((v, i) => (
                <tr key={v.agencia + i}>
                  <td className="py-1.5 px-2 font-semibold text-slate-800">{v.agencia}</td>
                  <td className="py-1.5 px-2 text-right">
                    <CeldaQ valor={v.vpp} etiqueta={`${v.agencia} VPP`} onCambio={(x) => setPer(i, 'vpp', x)} />
                  </td>
                  <td className="py-1.5 px-2 text-right">
                    <CeldaQ valor={v.app} etiqueta={`${v.agencia} APP`} onCambio={(x) => setPer(i, 'app', x)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-slate-500 mt-2">
            Se cobra por día a la persona que no salió con motivo "Remunera (StandBy)". VPP y VPPB usan la columna VPP. Atanasio usa la fila de Mercado Abierto.
          </p>
        </div>
      )}

      {pestana === 'camiones' && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={buscar}
                onChange={(e) => {
                  setBuscar(e.target.value);
                  setLimite(60);
                }}
                placeholder="Buscar placa, ID SAP o agencia"
                aria-label="Buscar camión"
                className="min-h-[36px] pl-8 pr-3 rounded-lg border border-slate-200 text-xs w-64 outline-none focus:border-slate-400"
              />
            </label>
            <Button
              variant="secondary"
              size="sm"
              icon={Plus}
              onClick={() => {
                cambiar((d) => d.standbyCamiones.unshift({ idSap: '', placa: '', serie: '', agencia: '', costo: 0 }));
                setBuscar('');
              }}
            >
              Agregar camión
            </Button>
          </div>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  <th className="text-left py-2 px-2">ID SAP</th>
                  <th className="text-left py-2 px-2">Placa</th>
                  <th className="text-left py-2 px-2">Serie</th>
                  <th className="text-left py-2 px-2">Agencia</th>
                  <th className="py-2 px-2 text-right">Costo standby (día)</th>
                  <th className="py-2 px-2 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {camionesFiltrados.slice(0, limite).map(({ c, i }) => {
                  const txt = (k: keyof TarifaStandbyCamion, w: string) => (
                    <input
                      type="text"
                      value={String(c[k] ?? '')}
                      aria-label={`${c.placa} ${k}`}
                      onChange={(e) => cambiar((d) => ((d.standbyCamiones[i] as unknown as Record<string, string>)[k] = k === 'placa' ? e.target.value.toUpperCase() : e.target.value))}
                      className={`${w} min-h-[34px] px-2 rounded-md border border-slate-200 text-xs outline-none focus:border-slate-500 bg-white`}
                    />
                  );
                  return (
                    <tr key={i}>
                      <td className="py-1.5 px-2">{txt('idSap', 'w-24')}</td>
                      <td className="py-1.5 px-2">{txt('placa', 'w-24 font-mono font-semibold')}</td>
                      <td className="py-1.5 px-2">{txt('serie', 'w-24')}</td>
                      <td className="py-1.5 px-2">{txt('agencia', 'w-32')}</td>
                      <td className="py-1.5 px-2 text-right">
                        <CeldaQ valor={c.costo} etiqueta={`${c.placa} costo`} onCambio={(x) => cambiar((d) => (d.standbyCamiones[i].costo = x))} />
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <button
                          type="button"
                          aria-label={`Quitar ${c.placa}`}
                          onClick={() => cambiar((d) => d.standbyCamiones.splice(i, 1))}
                          className="w-8 h-8 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer inline-flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {camionesFiltrados.length > limite && (
            <button type="button" onClick={() => setLimite((l) => l + 100)} className="text-xs font-semibold text-sky-700 hover:underline cursor-pointer">
              Mostrar más ({camionesFiltrados.length - limite} restantes)
            </button>
          )}
          <p className="text-[11px] text-slate-500">Se cobra por día al camión que no salió con un motivo que remunera (Taller, Stand By, Deshabilitado, Consignado MP). Se busca por placa.</p>
        </div>
      )}

      {pestana === 'atanasio' && (
        <div className="space-y-3 max-w-3xl">
          <p className="text-xs text-slate-600">
            En Atanasio la tarifa de viaje depende del segmento de la ruta. Marca qué segmentos usan <strong>Atanasio SM</strong> y cuáles <strong>Atanasio ME</strong>; el resto usa <strong>Atanasio</strong>. Las agencias Mercados Especiales y Supermercados usan Atanasio ME y Atanasio SM; Mercado Abierto usa Atanasio.
          </p>
          {(['SM', 'ME'] as const).map((k) => (
            <div key={k}>
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1.5">Atanasio {k}</div>
              <div className="flex flex-wrap gap-1.5">
                {SEGMENTO_OPTIONS.map((s) => {
                  const on = (borrador.segmentosAtanasio?.[k] || []).includes(s);
                  const otro = (borrador.segmentosAtanasio?.[k === 'SM' ? 'ME' : 'SM'] || []).includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={on}
                      disabled={otro}
                      title={otro ? `Ya está en Atanasio ${k === 'SM' ? 'ME' : 'SM'}` : undefined}
                      onClick={() =>
                        cambiar((d) => {
                          const l = new Set(d.segmentosAtanasio?.[k] || []);
                          if (on) l.delete(s);
                          else l.add(s);
                          d.segmentosAtanasio = { SM: d.segmentosAtanasio?.SM || [], ME: d.segmentosAtanasio?.ME || [], [k]: [...l] };
                        })
                      }
                      className={`min-h-[34px] px-3 rounded-full text-xs font-semibold border cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${on ? 'bg-[#2C3790] text-white border-[#2C3790]' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-500'}`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
