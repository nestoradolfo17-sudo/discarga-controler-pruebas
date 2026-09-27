import React, { useState, useEffect } from 'react';
import { StaffPuesto, StaffEstatus } from '../../types';
import { X, UserPlus } from 'lucide-react';
import { Button, IconButton } from '../ui/Button';
import { ACTION_ICONS } from '../ui/actionIcons';
import { AGENCIA_LOCATION_OPTIONS } from '../../data/agencies';

interface NewStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultAgencia?: string;
  onSubmit: (staff: {
    dpi: string;
    codigo: string;
    nombre: string;
    agencia: string;
    puesto: StaffPuesto;
    codigoCorto: string;
    telefono: string;
    estatus: StaffEstatus;
  }) => void;
}

export const NewStaffModal: React.FC<NewStaffModalProps> = ({
  isOpen,
  onClose,
  defaultAgencia,
  onSubmit,
}) => {
  const [dpi, setDpi] = useState('');
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [agencia, setAgencia] = useState(defaultAgencia || AGENCIA_LOCATION_OPTIONS[0]);
  const [puesto, setPuesto] = useState<StaffPuesto>('VPP');
  const [codigoCorto, setCodigoCorto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [estatus, setEstatus] = useState<StaffEstatus>('ALTA');

  useEffect(() => {
    if (isOpen) {
      setAgencia(defaultAgencia || AGENCIA_LOCATION_OPTIONS[0]);
    }
  }, [isOpen, defaultAgencia]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    if (!agencia) return;
    onSubmit({
      dpi: dpi.trim() || 'N/A',
      codigo: codigo.trim(),
      nombre: nombre.trim(),
      agencia,
      puesto,
      codigoCorto: codigoCorto.trim(),
      telefono: telefono.trim(),
      estatus,
    });
    setDpi('');
    setCodigo('');
    setNombre('');
    setPuesto('VPP');
    setCodigoCorto('');
    setTelefono('');
    setEstatus('ALTA');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-4 text-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="font-bold text-sm text-slate-800 flex items-center">
            <UserPlus className="w-4 h-4 mr-1.5 text-indigo-600" />
            Registrar Nuevo Colaborador
          </h3>
          <IconButton icon={ACTION_ICONS.cerrar} label="Cerrar" onClick={onClose} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              DPI / Documento de Identificación *
            </label>
            <input
              type="text"
              value={dpi}
              onChange={(e) => setDpi(e.target.value)}
              placeholder="Ej: 2541 89320 0101"
              required
              className="w-full min-h-[44px] p-2 border border-slate-300 rounded-lg font-mono outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Código *</label>
            <input
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Ej: DISAOC-00381"
              required
              className="w-full min-h-[44px] p-2 border border-slate-300 rounded-lg font-mono uppercase outline-none focus:ring-2 focus:ring-blue-500 font-medium"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Nombre Completo *</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Carlos Ramírez"
              required
              className="w-full min-h-[44px] p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-medium"
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

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Puesto Operativo *</label>
            <select
              value={puesto}
              onChange={(e) => setPuesto(e.target.value as StaffPuesto)}
              required
              className="w-full min-h-[44px] p-2 border border-slate-300 rounded-lg bg-white font-semibold outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="VPP">VPP (Piloto Titular Principal)</option>
              <option value="VPPB">VPPB (Piloto Titular B)</option>
              <option value="APP">APP (Auxiliar de Reparto / Peón)</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Código Corto *</label>
              <input
                type="text"
                value={codigoCorto}
                onChange={(e) => setCodigoCorto(e.target.value)}
                placeholder="Ej: 3810"
                required
                className="w-full min-h-[44px] p-2 border border-slate-300 rounded-lg font-mono outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Estatus *</label>
              <select
                value={estatus}
                onChange={(e) => setEstatus(e.target.value as StaffEstatus)}
                required
                className="w-full min-h-[44px] p-2 border border-slate-300 rounded-lg bg-white font-semibold outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="ALTA">ALTA</option>
                <option value="BAJA">BAJA</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Teléfono Móvil</label>
            <input
              type="text"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="+502 5555-1234"
              className="w-full min-h-[44px] p-2 border border-slate-300 rounded-lg font-mono outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

<div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
            <Button variant="secondary" size="lg" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="lg" icon={ACTION_ICONS.nuevo}>
              Guardar colaborador
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
