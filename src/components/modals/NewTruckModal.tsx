import React, { useState, useEffect } from 'react';
import { X, Truck } from 'lucide-react';
import { AGENCIA_LOCATION_OPTIONS } from '../../data/agencies';

interface NewTruckModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultAgencia?: string;
  onSubmit: (truck: {
    idCamion: string;
    placa: string;
    agencia: string;
    proveedor: string;
    ton: string;
    bahias: string;
    capacidad: string;
  }) => void;
}

export const NewTruckModal: React.FC<NewTruckModalProps> = ({
  isOpen,
  onClose,
  defaultAgencia,
  onSubmit,
}) => {
  const [idCamion, setIdCamion] = useState('');
  const [placa, setPlaca] = useState('');
  const [agencia, setAgencia] = useState(defaultAgencia || AGENCIA_LOCATION_OPTIONS[0]);
  const [proveedor, setProveedor] = useState('');
  const [ton, setTon] = useState('');
  const [bahias, setBahias] = useState('');
  const [capacidad, setCapacidad] = useState('');

  useEffect(() => {
    if (isOpen) {
      setAgencia(defaultAgencia || AGENCIA_LOCATION_OPTIONS[0]);
    }
  }, [isOpen, defaultAgencia]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!placa.trim()) return;
    if (!agencia) return;
    onSubmit({
      idCamion: idCamion.trim(),
      placa: placa.trim().toUpperCase(),
      agencia,
      proveedor: proveedor.trim(),
      ton: ton.trim(),
      bahias: bahias.trim(),
      capacidad: capacidad.trim() || '0',
    });
    setIdCamion('');
    setPlaca('');
    setProveedor('');
    setTon('');
    setBahias('');
    setCapacidad('');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-4 text-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="font-bold text-sm text-slate-800 flex items-center">
            <Truck className="w-4 h-4 mr-1.5 text-blue-600" />
            Registrar Nuevo Camión
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">ID Camión *</label>
            <input
              type="text"
              value={idCamion}
              onChange={(e) => setIdCamion(e.target.value)}
              placeholder="Ej: 385"
              required
              className="w-full p-2 border border-slate-300 rounded-lg font-mono outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

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
              className="w-full p-2 border border-slate-300 rounded-lg uppercase outline-none focus:ring-2 focus:ring-blue-500 font-mono font-medium"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Agencia *</label>
            <select
              value={agencia}
              onChange={(e) => setAgencia(e.target.value)}
              required
              className="w-full p-2 border border-slate-300 rounded-lg bg-white font-semibold outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              {AGENCIA_LOCATION_OPTIONS.map((ag) => (
                <option key={ag} value={ag}>
                  {ag}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Proveedor</label>
            <input
              type="text"
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
              placeholder="Ej: Unidad Propia / Transportes XYZ"
              className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">TON *</label>
              <input
                type="text"
                value={ton}
                onChange={(e) => setTon(e.target.value)}
                placeholder="12"
                required
                className="w-full p-2 border border-slate-300 rounded-lg font-mono outline-none focus:ring-2 focus:ring-blue-500 font-medium"
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
                className="w-full p-2 border border-slate-300 rounded-lg font-mono outline-none focus:ring-2 focus:ring-blue-500 font-medium"
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
                className="w-full p-2 border border-slate-300 rounded-lg font-mono outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer text-slate-600"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg cursor-pointer"
            >
              Guardar Camión
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
