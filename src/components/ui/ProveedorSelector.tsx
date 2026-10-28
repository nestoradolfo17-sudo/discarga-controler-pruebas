import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  listarProveedores,
  crearProveedor,
  sugerirCodigo,
  previaIdRentado,
  CODIGO_PROVEEDOR_RE,
  type Proveedor,
} from '../../services/proveedores';

// --- Elegir (o agregar) el proveedor de un camión rentado ---
// El catálogo es por agencia. Quien tiene permiso de Camiones puede agregar
// proveedores nuevos (nombre + código corto). Muestra el ID que se generará.

export const ProveedorSelector: React.FC<{
  agencia: string;
  valor: Proveedor | null;
  onChange: (p: Proveedor | null) => void;
  puedeAgregar: boolean;
  error?: boolean;
}> = ({ agencia, valor, onChange, puedeAgregar, error }) => {
  const [lista, setLista] = useState<Proveedor[]>([]);
  const [cargando, setCargando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('');
  const [codigoTocado, setCodigoTocado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    onChange(null);
    setNuevo(false);
    setAviso('');
    if (!agencia) {
      setLista([]);
      return;
    }
    setCargando(true);
    listarProveedores(agencia)
      .then((l) => vivo && setLista(l))
      .catch((e) => vivo && setAviso((e as Error).message))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agencia]);

  const guardarNuevo = async () => {
    setGuardando(true);
    setAviso('');
    try {
      const p = await crearProveedor(agencia, nombre, codigo);
      setLista((l) => [...l, p].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
      onChange(p);
      setNuevo(false);
      setNombre('');
      setCodigo('');
      setCodigoTocado(false);
    } catch (e) {
      setAviso((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  const codigoOk = CODIGO_PROVEEDOR_RE.test(codigo);

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="sel-proveedor" className="block font-semibold text-slate-700 mb-1">
            Proveedor (empresa que renta) *
          </label>
          <select
            id="sel-proveedor"
            value={valor?.codigo || ''}
            onChange={(e) => onChange(lista.find((p) => p.codigo === e.target.value) || null)}
            disabled={cargando || !agencia}
            className={`w-full min-h-[44px] p-2 border rounded-lg bg-white font-semibold outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
              error && !valor ? 'border-rose-400' : 'border-slate-300'
            }`}
          >
            <option value="">{cargando ? 'Cargando…' : lista.length ? 'Elige el proveedor…' : 'Sin proveedores en esta agencia'}</option>
            {lista.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.nombre} ({p.codigo})
              </option>
            ))}
          </select>
        </div>
        {puedeAgregar && !nuevo && (
          <button
            type="button"
            onClick={() => setNuevo(true)}
            className="min-h-[44px] px-3 rounded-lg border border-violet-300 bg-violet-50 text-violet-800 text-xs font-bold flex items-center gap-1 cursor-pointer hover:bg-violet-100"
          >
            <Plus className="w-3.5 h-3.5" /> Nuevo
          </button>
        )}
      </div>

      {nuevo && (
        <div className="p-3 rounded-xl border border-violet-200 bg-violet-50/60 space-y-2">
          <p className="text-[11px] font-bold text-violet-900">Nuevo proveedor para {agencia}</p>
          <div className="grid grid-cols-[1fr_96px] gap-2">
            <input
              type="text"
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value);
                if (!codigoTocado) setCodigo(sugerirCodigo(e.target.value));
              }}
              placeholder="Nombre del proveedor"
              aria-label="Nombre del proveedor"
              className="min-h-[44px] p-2 border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-violet-400"
            />
            <input
              type="text"
              value={codigo}
              onChange={(e) => {
                setCodigoTocado(true);
                setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5));
              }}
              placeholder="Código"
              aria-label="Código corto del proveedor (2 a 5 letras)"
              className={`min-h-[44px] p-2 border rounded-lg bg-white font-mono font-bold uppercase outline-none focus:ring-2 focus:ring-violet-400 ${
                codigo && !codigoOk ? 'border-rose-400' : 'border-slate-300'
              }`}
            />
          </div>
          <p className="text-[10.5px] text-violet-800">Código de 2 a 5 letras o números; va dentro del ID del camión y no se puede repetir en la agencia.</p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setNuevo(false);
                setAviso('');
              }}
              className="min-h-[40px] px-3 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-600 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardarNuevo}
              disabled={guardando || nombre.trim().length < 2 || !codigoOk}
              className="min-h-[40px] px-3 rounded-lg bg-violet-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {guardando ? 'Guardando…' : 'Agregar proveedor'}
            </button>
          </div>
        </div>
      )}

      {aviso && <p className="text-[11px] font-semibold text-rose-600">{aviso}</p>}

      {valor && (
        <p className="text-[11px] text-slate-600">
          ID que se generará: <span className="font-mono font-bold text-violet-800">{previaIdRentado(valor.codigo, agencia)}</span>{' '}
          <span className="text-slate-400">(el número lo asigna el sistema al guardar)</span>
        </p>
      )}
    </div>
  );
};
