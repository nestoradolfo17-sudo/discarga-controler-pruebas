import React, { useState, useEffect } from 'react';
import { X, Truck } from 'lucide-react';
import { Button, IconButton } from '../ui/Button';
import { ACTION_ICONS } from '../ui/actionIcons';
import { AGENCIA_LOCATION_OPTIONS } from '../../data/agencies';
import type { TipoUnidad } from '../../types';
import { SelectorTipo } from '../ui/SelectorTipo';
import { ProveedorSelector } from '../ui/ProveedorSelector';
import type { Proveedor } from '../../services/proveedores';

interface NewTruckModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultAgencia?: string;
  onSubmit: (truck: {
    placa: string;
    agencia: string;
    proveedor: string;
    ton: string;
    bahias: string;
    capacidad: string;
    tipo: TipoUnidad;
    // Solo rentados: proveedor del catálogo (su código va en el ID correlativo).
    proveedorCodigo?: string;
  }) => boolean | void | Promise<boolean | void>;
  // ¿Puede agregar proveedores nuevos al catálogo? (permiso de Camiones)
  puedeAgregarProveedor?: boolean;
}

export const NewTruckModal: React.FC<NewTruckModalProps> = ({
  isOpen,
  onClose,
  defaultAgencia,
  onSubmit,
  puedeAgregarProveedor = false,
}) => {
  const [placa, setPlaca] = useState('');
  const [agencia, setAgencia] = useState(defaultAgencia || AGENCIA_LOCATION_OPTIONS[0]);
  const [proveedor, setProveedor] = useState('');
  const [ton, setTon] = useState('');
  const [bahias, setBahias] = useState('');
  const [capacidad, setCapacidad] = useState('');
  const [tipo, setTipo] = useState<TipoUnidad | null>(null);
  const [faltaTipo, setFaltaTipo] = useState(false);
  const [proveedorCat, setProveedorCat] = useState<Proveedor | null>(null);
  const [faltaProveedor, setFaltaProveedor] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAgencia(defaultAgencia || AGENCIA_LOCATION_OPTIONS[0]);
      setTipo(null);
      setFaltaTipo(false);
      setProveedorCat(null);
      setFaltaProveedor(false);
      setGuardando(false);
    }
  }, [isOpen, defaultAgencia]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardando) return;
    if (!placa.trim()) return;
    if (!agencia) return;
    if (!tipo) {
      setFaltaTipo(true);
      return;
    }
    if (tipo === 'Rentado' && !proveedorCat) {
      setFaltaProveedor(true);
      return;
    }
    setGuardando(true);
    let ok: boolean | void = true;
    try {
      ok = await onSubmit({
        placa: placa.trim().toUpperCase(),
        agencia,
        proveedor: tipo === 'Rentado' ? proveedorCat!.nombre : proveedor.trim(),
        ton: ton.trim(),
        bahias: bahias.trim(),
        capacidad: capacidad.trim() || '0',
        tipo,
        ...(tipo === 'Rentado' ? { proveedorCodigo: proveedorCat!.codigo } : {}),
      });
    } finally {
      setGuardando(false);
    }
    // Si no se pudo guardar (p. ej. no se generó el ID), se conservan los datos.
    if (ok === false) return;
    setProveedorCat(null);
    setPlaca('');
    setProveedor('');
    setTon('');
    setBahias('');
    setCapacidad('');
    setTipo(null);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-4 text-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="font-bold text-sm text-slate-800 flex items-center">
            <Truck className="w-4 h-4 mr-1.5 text-blue-600" />
            Registrar Nuevo Camión
          </h3>
          <IconButton icon={ACTION_ICONS.cerrar} label="Cerrar" onClick={onClose} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Placa *
            </label>
            <input
              type="text"
              value={placa}
              onChange={(e) => setPlaca(e.target.value)}
              placeholder="Ej: C234BGD"
              required
              className="w-full min-h-[44px] p-2 border border-slate-300 rounded-lg uppercase outline-none focus:ring-2 focus:ring-blue-500 font-mono font-medium"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Agencia *</label>
            <select
              value={agencia}
              onChange={(e) => setAgencia(e.target.value)}
              required
              className="w-full min-h-[44px] p-2 border border-slate-300 rounded-lg bg-white font-semibold outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              {AGENCIA_LOCATION_OPTIONS.map((ag) => (
                <option key={ag} value={ag}>
                  {ag}
                </option>
              ))}
            </select>
          </div>

          <SelectorTipo
            valor={tipo}
            onChange={(t) => {
              setTipo(t);
              setFaltaTipo(false);
            }}
            error={faltaTipo}
            etiquetas={{ Propio: 'Propio', Rentado: 'Rentado' }}
            ayudas={{ Propio: 'Unidad de la empresa', Rentado: 'Unidad de un proveedor' }}
            titulo="Tipo de camión *"
          />

          {tipo === 'Rentado' ? (
            <ProveedorSelector
              agencia={agencia}
              valor={proveedorCat}
              onChange={(p) => {
                setProveedorCat(p);
                if (p) setFaltaProveedor(false);
              }}
              puedeAgregar={puedeAgregarProveedor}
              error={faltaProveedor}
            />
          ) : (
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Proveedor</label>
            <input
              type="text"
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
              placeholder="Ej: Unidad Propia"
              className="w-full min-h-[44px] p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">TON *</label>
              <input
                type="text"
                value={ton}
                onChange={(e) => setTon(e.target.value)}
                placeholder="12"
                required
                className="w-full min-h-[44px] p-2 border border-slate-300 rounded-lg font-mono outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Bahías *</label>
              <input
                type="text"
                value={bahias}
                onChange={(e) => setBahias(e.target.value)}
                placeholder="10"
                required
                className="w-full min-h-[44px] p-2 border border-slate-300 rounded-lg font-mono outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Capacidad *</label>
              <input
                type="text"
                value={capacidad}
                onChange={(e) => setCapacidad(e.target.value)}
                placeholder="375"
                required
                className="w-full min-h-[44px] p-2 border border-slate-300 rounded-lg font-mono outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>
          </div>

<div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
            <Button variant="secondary" size="lg" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="lg" icon={ACTION_ICONS.nuevo} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar camión'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
