import React, { useEffect, useState } from 'react';
import { Truck } from '../../types';
import { Button, IconButton } from '../ui/Button';
import { ACTION_ICONS } from '../ui/actionIcons';
import { ProveedorSelector } from '../ui/ProveedorSelector';
import type { Proveedor } from '../../services/proveedores';

// --- Asignar el ID correlativo a un camión rentado que ya existía ---
// Se elige su proveedor del catálogo de la agencia y la base entrega el número.
// La clave interna del camión no cambia (asignaciones e historial siguen igual).

export const AsignarIdRentadoModal: React.FC<{
  truck: Truck | null;
  puedeAgregarProveedor: boolean;
  onClose: () => void;
  onConfirm: (truck: Truck, proveedor: Proveedor) => Promise<boolean>;
}> = ({ truck, puedeAgregarProveedor, onClose, onConfirm }) => {
  const [proveedor, setProveedor] = useState<Proveedor | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setProveedor(null);
    setGuardando(false);
  }, [truck]);

  if (!truck) return null;
  const agencia = truck.agencia || '';

  const confirmar = async () => {
    if (!proveedor || guardando) return;
    setGuardando(true);
    try {
      const ok = await onConfirm(truck, proveedor);
      if (ok) onClose();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl p-6 space-y-4 text-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div>
            <h3 className="font-bold text-sm text-slate-800">Asignar ID de camión rentado</h3>
            <p className="text-[11px] text-slate-500">
              Placa <span className="font-mono font-bold">{truck.placa}</span> · {agencia || 'Sin agencia'}
              {truck.proveedor ? ` · Proveedor actual: ${truck.proveedor}` : ''}
            </p>
          </div>
          <IconButton icon={ACTION_ICONS.cerrar} label="Cerrar" onClick={onClose} className="text-slate-400 hover:text-slate-700 hover:bg-slate-100" />
        </div>

        {!agencia ? (
          <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
            Este camión no tiene agencia. Corrígela primero (Carga Masiva de Excel) para poder asignarle el ID.
          </p>
        ) : (
          <ProveedorSelector agencia={agencia} valor={proveedor} onChange={setProveedor} puedeAgregar={puedeAgregarProveedor} />
        )}

        <p className="text-[11px] text-slate-500">
          El ID actual ({truck.idCamion || truck.id}) se reemplaza por el correlativo del proveedor. Las asignaciones y el historial del camión no cambian.
        </p>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <Button variant="secondary" size="lg" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="lg" icon={ACTION_ICONS.nuevo} disabled={!proveedor || guardando} onClick={confirmar}>
            {guardando ? 'Generando…' : 'Generar ID'}
          </Button>
        </div>
      </div>
    </div>
  );
};
