import React, { useState } from 'react';
import { Truck, Staff, ResourceStatus, StaffEstatus } from '../types';
import { Truck as TruckIcon, UserPlus, Users, ChevronDown, FileSpreadsheet, Download, Trash2 } from 'lucide-react';
import { BatchStaffModal } from './modals/BatchStaffModal';
import { BatchTruckModal } from './modals/BatchTruckModal';
import { DeleteAuthModal } from './modals/DeleteAuthModal';
import { downloadStaffExcelTemplate, downloadTruckExcelTemplate } from '../utils/excel';

interface ResourcesViewProps {
  mode: 'trucks' | 'staff';
  trucks: Truck[];
  staff: Staff[];
  defaultAgencia?: string;
  onOpenNewTruckModal: () => void;
  onOpenNewStaffModal: () => void;
  onUpdateStaffStatus?: (staffId: string, newStatus: ResourceStatus) => void;
  onUpdateStaffEstatus?: (staffId: string, newEstatus: StaffEstatus) => void;
  onImportStaffBatch?: (importedStaff: Staff[]) => void;
  onImportTrucksBatch?: (importedTrucks: Truck[]) => void;
  onDeleteTrucks?: (truckIds: string[]) => void;
  onDeleteStaffMembers?: (staffIds: string[]) => void;
  onShowToast?: (message: string, type: 'success' | 'error' | 'info') => void;
  canDelete?: boolean;
}

export const ResourcesView: React.FC<ResourcesViewProps> = ({
  mode,
  trucks,
  staff,
  defaultAgencia,
  onOpenNewTruckModal,
  onOpenNewStaffModal,
  onUpdateStaffStatus,
  onUpdateStaffEstatus,
  onImportStaffBatch,
  onImportTrucksBatch,
  onDeleteTrucks,
  onDeleteStaffMembers,
  onShowToast,
  canDelete = true,
}) => {
  const [isBatchStaffModalOpen, setIsBatchStaffModalOpen] = useState(false);
  const [isBatchTruckModalOpen, setIsBatchTruckModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<
    { type: 'truck' | 'staff'; ids: string[]; label: string } | null
  >(null);
  const [selectedTruckIds, setSelectedTruckIds] = useState<Set<string>>(new Set());
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set());

  const toggleTruckSelection = (id: string) => {
    setSelectedTruckIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllTrucks = () => {
    setSelectedTruckIds((prev) =>
      prev.size === trucks.length ? new Set() : new Set(trucks.map((t) => t.id))
    );
  };

  const toggleStaffSelection = (id: string) => {
    setSelectedStaffIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllStaff = () => {
    setSelectedStaffIds((prev) =>
      prev.size === staff.length ? new Set() : new Set(staff.map((s) => s.id))
    );
  };
  return (
    <div className="space-y-6">
      {/* Trucks card */}
      {mode === 'trucks' && (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-7 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
          <div>
            <h3 className="font-bold text-slate-800 text-lg flex items-center">
              <TruckIcon className="w-5 h-5 mr-2 text-blue-600" />
              Flota de Camiones
              <span className="ml-2.5 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800">
                {trucks.length}
              </span>
            </h3>
            <p className="text-sm text-slate-400 mt-0.5">Unidades vehiculares registradas en el sistema</p>
          </div>
          <div className="flex items-center flex-wrap gap-2">
            <button
              type="button"
              id="btn-descargar-plantilla-camiones"
              onClick={() => {
                downloadTruckExcelTemplate();
                onShowToast?.('Plantilla de Excel para camiones descargada exitosamente.', 'success');
              }}
              className="text-xs bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center shadow-2xs"
              title="Descargar plantilla de Excel (.xlsx) con el formato oficial de camiones"
            >
              <Download className="w-3.5 h-3.5 mr-1 text-blue-600" />
              Descargar Plantilla
            </button>
            <button
              type="button"
              id="btn-subir-excel-camiones"
              onClick={() => setIsBatchTruckModalOpen(true)}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center shadow-2xs"
              title="Cargar camiones masivamente desde archivo Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />
              Subir Excel
            </button>
            <button
              id="btn-agregar-camion"
              onClick={onOpenNewTruckModal}
              className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-slate-800 transition cursor-pointer flex items-center"
            >
              + Agregar Camión
            </button>
          </div>
        </div>
        {canDelete && selectedTruckIds.size > 0 && (
          <div className="flex items-center justify-between bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            <span className="text-rose-800 font-semibold">
              {selectedTruckIds.size} camión(es) seleccionado(s)
            </span>
            <button
              type="button"
              onClick={() =>
                setPendingDelete({
                  type: 'truck',
                  ids: Array.from(selectedTruckIds),
                  label: `${selectedTruckIds.size} camión(es) seleccionado(s)`,
                })
              }
              className="text-xs bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Eliminar seleccionados
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-semibold uppercase">
              <tr>
                <th className="py-3 px-4 w-8">
                  <input
                    type="checkbox"
                    checked={trucks.length > 0 && selectedTruckIds.size === trucks.length}
                    onChange={toggleAllTrucks}
                    className="cursor-pointer"
                    title="Seleccionar todos"
                  />
                </th>
                <th className="py-3 px-4">ID Camión</th>
                <th className="py-3 px-4">Placa</th>
                <th className="py-3 px-4">Agencia</th>
                <th className="py-3 px-4">Estatus</th>
                <th className="py-3 px-4">TON</th>
                <th className="py-3 px-4">Bahías</th>
                <th className="py-3 px-4">Capacidad</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {trucks.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <input
                      type="checkbox"
                      checked={selectedTruckIds.has(t.id)}
                      onChange={() => toggleTruckSelection(t.id)}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600">{t.idCamion || '-'}</td>
                  <td className="py-3 px-4 font-mono font-bold text-slate-800">{t.placa}</td>
                  <td className="py-3 px-4">
                    {t.agencia ? (
                      <span className="text-slate-600 font-medium">{t.agencia}</span>
                    ) : (
                      <span className="text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-semibold">
                        Sin Agencia
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-col items-start gap-1">
                      {/* Corrección: antes se mostraba el badge verde "Disponible" incluso
                          cuando el camión tenía un motivoNoAsignado activo (p.ej. "Taller" o
                          "Deshabilitado"), mostrando dos mensajes contradictorios a la vez.
                          Ahora, si hay un motivo activo, se prioriza un badge ámbar de
                          "No Asignado" en vez del verde "Disponible". */}
                      {t.estado === 'Disponible' && t.motivoNoAsignado ? (
                        <span
                          className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded font-semibold border border-amber-200"
                          title="Disponible operativamente, pero no fue asignado hoy por el motivo indicado"
                        >
                          No Asignado
                        </span>
                      ) : t.estado === 'Disponible' ? (
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-semibold border border-emerald-200">
                          Disponible
                        </span>
                      ) : t.estado === 'Baja' ? (
                        <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded font-semibold border border-rose-200">
                          Baja
                        </span>
                      ) : (
                        <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-semibold border border-blue-200">
                          En Ruta
                        </span>
                      )}
                      {t.estado === 'Disponible' && t.motivoNoAsignado && (
                        <span className="text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 font-semibold">
                          {t.motivoNoAsignado}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-slate-600">{t.ton ?? '-'}</td>
                  <td className="py-3 px-4 text-slate-600">{t.bahias ?? '-'}</td>
                  <td className="py-3 px-4 text-slate-600">{t.capacidad}</td>
                  <td className="py-3 px-4 text-right">
                    {canDelete && (
                      <button
                        type="button"
                        title="Eliminar camión"
                        onClick={() =>
                          setPendingDelete({
                            type: 'truck',
                            ids: [t.id],
                            label: `el camión ${t.idCamion ? `#${t.idCamion} - ` : ''}${t.placa}`,
                          })
                        }
                        className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Staff card */}
      {mode === 'staff' && (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-7 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
          <div>
            <h3 className="font-bold text-slate-800 text-lg flex items-center">
              <Users className="w-5 h-5 mr-2 text-indigo-600" />
              Personal Operativo
              <span className="ml-2.5 px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
                {staff.length}
              </span>
            </h3>
            <p className="text-sm text-slate-400 mt-0.5">Pilotos titulares (VPP / VPPB) y auxiliares (APP)</p>
          </div>
          <div className="flex items-center flex-wrap gap-2">
            <button
              type="button"
              id="btn-descargar-plantilla-personal"
              onClick={() => {
                downloadStaffExcelTemplate();
                onShowToast?.('Plantilla de Excel para personal descargada exitosamente.', 'success');
              }}
              className="text-xs bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center shadow-2xs"
              title="Descargar plantilla de Excel (.xlsx) con el formato oficial de personal"
            >
              <Download className="w-3.5 h-3.5 mr-1 text-emerald-600" />
              Descargar Plantilla
            </button>
            <button
              type="button"
              id="btn-subir-excel-personal"
              onClick={() => setIsBatchStaffModalOpen(true)}
              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center shadow-2xs"
              title="Cargar personal masivamente desde archivo Excel"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />
              Subir Excel
            </button>
            <button
              id="btn-agregar-personal"
              onClick={onOpenNewStaffModal}
              className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-slate-800 transition cursor-pointer flex items-center"
            >
              <UserPlus className="w-3.5 h-3.5 mr-1" />
              Agregar Personal
            </button>
          </div>
        </div>
        {canDelete && selectedStaffIds.size > 0 && (
          <div className="flex items-center justify-between bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
            <span className="text-rose-800 font-semibold">
              {selectedStaffIds.size} colaborador(es) seleccionado(s)
            </span>
            <button
              type="button"
              onClick={() =>
                setPendingDelete({
                  type: 'staff',
                  ids: Array.from(selectedStaffIds),
                  label: `${selectedStaffIds.size} colaborador(es) seleccionado(s)`,
                })
              }
              className="text-xs bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Eliminar seleccionados
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-semibold uppercase">
              <tr>
                <th className="py-3 px-4 w-8">
                  <input
                    type="checkbox"
                    checked={staff.length > 0 && selectedStaffIds.size === staff.length}
                    onChange={toggleAllStaff}
                    className="cursor-pointer"
                    title="Seleccionar todos"
                  />
                </th>
                <th className="py-3 px-4">DPI</th>
                <th className="py-3 px-4">Código</th>
                <th className="py-3 px-4">Nombre Completo</th>
                <th className="py-3 px-4">Agencia</th>
                <th className="py-3 px-4">Puesto</th>
                <th className="py-3 px-4">Código Corto</th>
                {/* Corrección: esta columna en realidad contiene dos selectores
                    independientes (planilla ALTA/BAJA y estado operativo del día,
                    que también puede valer "Baja"), lo que confundía porque un
                    encabezado genérico "Estatus" sugería un solo valor. Se aclara
                    en el encabezado sin tocar los selectores ni sus valores. */}
                <th className="py-3 px-4">Estatus (Planilla / Operativo)</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staff.map((s) => {
                let puestoBadge = 'bg-slate-100 text-slate-700';
                if (s.puesto === 'VPP') puestoBadge = 'bg-indigo-100 text-indigo-800 border border-indigo-200';
                else if (s.puesto === 'VPPB') puestoBadge = 'bg-blue-100 text-blue-800 border border-blue-200';
                else if (s.puesto === 'APP') puestoBadge = 'bg-amber-100 text-amber-800 border border-amber-200';

                const estatus: StaffEstatus = s.estatus || 'ALTA';

                return (
                  <tr
                    key={s.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      estatus === 'BAJA' ? 'bg-rose-50/20 text-slate-500' : ''
                    }`}
                  >
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={selectedStaffIds.has(s.id)}
                        onChange={() => toggleStaffSelection(s.id)}
                        className="cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700 font-semibold text-xs">
                      {s.dpi || '-'}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 text-xs">
                      {s.codigo || '-'}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {s.nombre}
                    </td>
                    <td className="py-3 px-4">
                      {s.agencia ? (
                        <span className="text-slate-600 font-medium">{s.agencia}</span>
                      ) : (
                        <span className="text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-semibold">
                          Sin Agencia
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`${puestoBadge} px-2 py-0.5 rounded text-xs font-bold font-mono`}>
                        {s.puesto || s.rol || 'VPP'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 text-xs">
                      {s.codigoCorto || '-'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-col items-start gap-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] text-slate-400 font-semibold uppercase">Planilla:</span>
                          <div className="relative inline-block">
                            <select
                              id={`staff-estatus-${s.id}`}
                              value={estatus}
                              onChange={(e) =>
                                onUpdateStaffEstatus?.(s.id, e.target.value as StaffEstatus)
                              }
                              className={`appearance-none text-[11px] font-bold pl-2.5 pr-6 py-1 rounded-md border cursor-pointer outline-none transition shadow-sm ${
                                estatus === 'ALTA'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                  : 'bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100'
                              }`}
                              title="Estatus de planilla: si la persona sigue activa en la empresa (ALTA/BAJA)"
                            >
                              <option value="ALTA">ALTA</option>
                              <option value="BAJA">BAJA</option>
                            </select>
                            <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-current" />
                          </div>
                        </div>

                        {/* Estado operativo del día (independiente del estatus de planilla) */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9px] text-slate-400 font-semibold uppercase">Operativo:</span>
                          <div className="relative inline-block">
                            <select
                              id={`staff-status-${s.id}`}
                              value={s.estado}
                              onChange={(e) =>
                                onUpdateStaffStatus?.(s.id, e.target.value as ResourceStatus)
                              }
                              className={`appearance-none text-[10px] font-bold pl-2 pr-5 py-0.5 rounded border cursor-pointer outline-none transition ${
                                // Corrección: si el estado es "Disponible" pero existe un
                                // motivoNoAsignado activo (permiso, ausencia, apoyo a otra
                                // agencia, etc.), el selector ya no se pinta en verde — pintarlo
                                // como disponible mientras se muestra el motivo al lado era
                                // contradictorio. El valor real ("Disponible") no cambia.
                                s.estado === 'Disponible' && s.motivoNoAsignado
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : s.estado === 'Disponible'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : s.estado === 'Baja'
                                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                                  : 'bg-blue-50 text-blue-800 border-blue-200'
                              }`}
                              title={
                                s.estado === 'Disponible' && s.motivoNoAsignado
                                  ? `Disponible operativamente, pero no fue asignado hoy: ${s.motivoNoAsignado}`
                                  : 'Estado operativo del día (independiente del estatus de planilla)'
                              }
                            >
                              <option value="Disponible">Disponible</option>
                              <option value="En Ruta">En Ruta</option>
                              <option value="Baja">Baja</option>
                            </select>
                            <ChevronDown className="w-2.5 h-2.5 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none opacity-60 text-current" />
                          </div>

                          {s.estado === 'Disponible' && s.motivoNoAsignado && (
                            <span className="text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200 font-semibold whitespace-nowrap">
                              {s.motivoNoAsignado}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {canDelete && (
                        <button
                          type="button"
                          title="Eliminar colaborador"
                          onClick={() =>
                            setPendingDelete({
                              type: 'staff',
                              ids: [s.id],
                              label: `a ${s.nombre}${s.codigo ? ` (${s.codigo})` : ''}`,
                            })
                          }
                          className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Modal de Carga Masiva de Personal */}
      <BatchStaffModal
        isOpen={isBatchStaffModalOpen}
        onClose={() => setIsBatchStaffModalOpen(false)}
        existingStaff={staff}
        defaultAgencia={defaultAgencia}
        onCommitStaff={(importedStaff) => {
          onImportStaffBatch?.(importedStaff);
        }}
        onShowToast={onShowToast}
      />

      {/* Modal de Carga Masiva de Camiones */}
      <BatchTruckModal
        isOpen={isBatchTruckModalOpen}
        onClose={() => setIsBatchTruckModalOpen(false)}
        existingTrucks={trucks}
        defaultAgencia={defaultAgencia}
        onCommitTrucks={(importedTrucks) => {
          onImportTrucksBatch?.(importedTrucks);
        }}
        onShowToast={onShowToast}
      />

      {/* Modal de autorización para eliminar Camión o Personal */}
      <DeleteAuthModal
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        itemLabel={pendingDelete?.label || ''}
        itemCount={pendingDelete?.ids.length || 1}
        onConfirm={() => {
          if (!pendingDelete) return;
          if (pendingDelete.type === 'truck') {
            onDeleteTrucks?.(pendingDelete.ids);
            setSelectedTruckIds(new Set());
          } else {
            onDeleteStaffMembers?.(pendingDelete.ids);
            setSelectedStaffIds(new Set());
          }
          setPendingDelete(null);
        }}
      />
    </div>
  );
};
