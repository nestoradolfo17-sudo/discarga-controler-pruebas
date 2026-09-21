import React, { useState } from 'react';
import { AppUser, TablePermissions } from '../types';
import { AGENCIA_LOCATION_OPTIONS } from '../data/agencies';
import { formatDateTimeToGuatemala } from '../utils/date';
import {
  UserPlus,
  Shield,
  ShieldCheck,
  Trash2,
  KeyRound,
  Users as UsersIcon,
  Check,
  X,
  MapPin,
  Pencil,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';

interface UsersViewProps {
  users: AppUser[];
  currentUser: AppUser;
  onCreateUser: (data: {
    username: string;
    password: string;
    nombre?: string;
    isAdmin: boolean;
    permissions: TablePermissions;
    canDelete: boolean;
    agencyAccess: 'all' | string[];
  }) => void;
  onUpdateUser: (
    userId: string,
    updates: Partial<
      Pick<AppUser, 'permissions' | 'canDelete' | 'isAdmin' | 'agencyAccess' | 'username' | 'nombre'>
    >
  ) => void;
  onResetPassword: (userId: string, newPassword: string) => void;
  onDeleteUser: (userId: string) => void;
}

const DEFAULT_PERMISSIONS: TablePermissions = {
  dashboard: true,
  board: true,
  liquidated: true,
  trucks: false,
  staff: false,
  batch: false,
  canBulkUploadTrucks: false,
  canManualAddTrucks: false,
  canBulkUploadStaff: false,
  canManualAddStaff: false,
};

// Corrección: los 4 permisos marcados con "grandfathered" son nuevos — los usuarios
// creados antes de este cambio no tienen estos campos guardados en su registro
// (quedan como undefined). Para no quitarles de golpe algo que ya podían hacer, se
// tratan como "permitido" (true) mientras no se hayan guardado explícitamente en
// false. Ver isPermEnabled/togglePermission más abajo.
const PERMISSION_LABELS: { key: keyof TablePermissions; label: string; grandfathered?: boolean }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'board', label: 'Tablero de Rutas' },
  { key: 'liquidated', label: 'Rutas Liquidadas' },
  { key: 'trucks', label: 'Camiones' },
  { key: 'staff', label: 'Personal' },
  { key: 'batch', label: 'Carga Masiva Excel' },
  { key: 'canBulkUploadTrucks', label: 'Subir Excel Camiones', grandfathered: true },
  { key: 'canManualAddTrucks', label: 'Agregar Camiones Manual', grandfathered: true },
  { key: 'canBulkUploadStaff', label: 'Subir Excel Personal', grandfathered: true },
  { key: 'canManualAddStaff', label: 'Agregar Personal Manual', grandfathered: true },
];

// Devuelve si un permiso está habilitado para un usuario, respetando la
// compatibilidad hacia atrás: un permiso "grandfathered" ausente (undefined, en
// cuentas creadas antes de agregarlo) se considera permitido hasta que se
// desactive explícitamente.
const isPermEnabled = (user: AppUser, key: keyof TablePermissions, grandfathered?: boolean) =>
  grandfathered ? user.permissions[key] !== false : !!user.permissions[key];

export const UsersView: React.FC<UsersViewProps> = ({
  users,
  currentUser,
  onCreateUser,
  onUpdateUser,
  onResetPassword,
  onDeleteUser,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // Corrección: se agrega confirmación de contraseña y opción de mostrar/ocultar al
  // crear un usuario, para reducir el riesgo de errores de tecleo (antes la
  // contraseña se escribía una sola vez y siempre en texto plano).
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [nombre, setNombre] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [permissions, setPermissions] = useState<TablePermissions>({ ...DEFAULT_PERMISSIONS });
  const [canDelete, setCanDelete] = useState(false);
  const [agencyAll, setAgencyAll] = useState(true);
  const [agencySelection, setAgencySelection] = useState<string[]>([]);
  const [formError, setFormError] = useState('');
  const [passwordEditingId, setPasswordEditingId] = useState<string | null>(null);
  const [newPasswordDraft, setNewPasswordDraft] = useState('');
  const [agencyEditingId, setAgencyEditingId] = useState<string | null>(null);
  const [agencyDraftAll, setAgencyDraftAll] = useState(true);
  const [agencyDraftList, setAgencyDraftList] = useState<string[]>([]);

  // Edición de usuario y nombre de un usuario ya existente.
  const [profileEditingId, setProfileEditingId] = useState<string | null>(null);
  const [profileUsernameDraft, setProfileUsernameDraft] = useState('');
  const [profileNombreDraft, setProfileNombreDraft] = useState('');
  const [profileEditError, setProfileEditError] = useState('');

  // Confirmación con contraseña de administrador: se exige para guardar cambios de
  // usuario/nombre, cambios de contraseña, o eliminar un registro de usuario.
  const [confirmAction, setConfirmAction] = useState<
    | { type: 'profile'; userId: string; username: string; nombre?: string }
    | { type: 'password'; userId: string; newPassword: string }
    | { type: 'delete'; userId: string }
    | null
  >(null);
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [confirmError, setConfirmError] = useState('');

  const adminCount = users.filter((u) => u.isAdmin).length;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const trimmed = username.trim();
    if (!trimmed) {
      setFormError('El nombre de usuario es obligatorio.');
      return;
    }
    if (password.length < 4) {
      setFormError('La contraseña debe tener al menos 4 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Las contraseñas no coinciden.');
      return;
    }
    if (users.some((u) => u.username.toLowerCase() === trimmed.toLowerCase())) {
      setFormError('Ya existe un usuario con ese nombre.');
      return;
    }
    onCreateUser({
      username: trimmed,
      password,
      nombre: nombre.trim() || undefined,
      isAdmin,
      permissions: isAdmin
        ? {
            dashboard: true,
            board: true,
            liquidated: true,
            trucks: true,
            staff: true,
            batch: true,
            canBulkUploadTrucks: true,
            canManualAddTrucks: true,
            canBulkUploadStaff: true,
            canManualAddStaff: true,
          }
        : permissions,
      canDelete: isAdmin ? true : canDelete,
      agencyAccess: isAdmin ? 'all' : agencyAll ? 'all' : agencySelection,
    });
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setNombre('');
    setIsAdmin(false);
    setPermissions({ ...DEFAULT_PERMISSIONS });
    setCanDelete(false);
    setAgencyAll(true);
    setAgencySelection([]);
  };

  const togglePermission = (
    userId: string,
    key: keyof TablePermissions,
    user: AppUser,
    grandfathered?: boolean
  ) => {
    if (user.isAdmin) return; // Los administradores siempre tienen todos los permisos
    const current = isPermEnabled(user, key, grandfathered);
    onUpdateUser(userId, { permissions: { ...user.permissions, [key]: !current } });
  };

  const toggleCanDelete = (userId: string, user: AppUser) => {
    if (user.isAdmin) return;
    onUpdateUser(userId, { canDelete: !user.canDelete });
  };

  const startPasswordEdit = (userId: string) => {
    setPasswordEditingId(userId);
    setNewPasswordDraft('');
  };

  const requestSavePasswordEdit = (userId: string) => {
    if (newPasswordDraft.length < 4) return;
    setConfirmError('');
    setConfirmPasswordInput('');
    setConfirmAction({ type: 'password', userId, newPassword: newPasswordDraft });
  };

  const startProfileEdit = (user: AppUser) => {
    setProfileEditingId(user.id);
    setProfileUsernameDraft(user.username);
    setProfileNombreDraft(user.nombre || '');
    setProfileEditError('');
  };

  const cancelProfileEdit = () => {
    setProfileEditingId(null);
    setProfileEditError('');
  };

  const requestSaveProfileEdit = (userId: string) => {
    const trimmedUsername = profileUsernameDraft.trim();
    if (!trimmedUsername) {
      setProfileEditError('El nombre de usuario no puede quedar vacío.');
      return;
    }
    if (
      users.some(
        (u) => u.id !== userId && u.username.toLowerCase() === trimmedUsername.toLowerCase()
      )
    ) {
      setProfileEditError('Ya existe un usuario con ese nombre.');
      return;
    }
    setProfileEditError('');
    setConfirmError('');
    setConfirmPasswordInput('');
    setConfirmAction({
      type: 'profile',
      userId,
      username: trimmedUsername,
      nombre: profileNombreDraft.trim() || undefined,
    });
  };

  const requestDeleteUser = (userId: string) => {
    setConfirmError('');
    setConfirmPasswordInput('');
    setConfirmAction({ type: 'delete', userId });
  };

  const cancelConfirm = () => {
    setConfirmAction(null);
    setConfirmPasswordInput('');
    setConfirmError('');
  };

  const submitConfirm = () => {
    if (!confirmAction) return;
    if (confirmPasswordInput !== currentUser.password) {
      setConfirmError('Contraseña de administrador incorrecta.');
      return;
    }
    if (confirmAction.type === 'profile') {
      onUpdateUser(confirmAction.userId, {
        username: confirmAction.username,
        nombre: confirmAction.nombre,
      });
      setProfileEditingId(null);
    } else if (confirmAction.type === 'password') {
      onResetPassword(confirmAction.userId, confirmAction.newPassword);
      setPasswordEditingId(null);
      setNewPasswordDraft('');
    } else if (confirmAction.type === 'delete') {
      onDeleteUser(confirmAction.userId);
    }
    setConfirmAction(null);
    setConfirmPasswordInput('');
    setConfirmError('');
  };

  const startAgencyEdit = (user: AppUser) => {
    setAgencyEditingId(user.id);
    setAgencyDraftAll(!user.agencyAccess || user.agencyAccess === 'all');
    setAgencyDraftList(Array.isArray(user.agencyAccess) ? user.agencyAccess : []);
  };

  const toggleDraftAgency = (ag: string) => {
    setAgencyDraftList((prev) => (prev.includes(ag) ? prev.filter((a) => a !== ag) : [...prev, ag]));
  };

  const saveAgencyEdit = (userId: string) => {
    onUpdateUser(userId, { agencyAccess: agencyDraftAll ? 'all' : agencyDraftList });
    setAgencyEditingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Crear usuario */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-7 shadow-sm space-y-5">
        <div className="pb-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-lg flex items-center">
            <UserPlus className="w-5 h-5 mr-2 text-blue-600" />
            Crear Nuevo Usuario
          </h3>
          <p className="text-sm text-slate-400 mt-0.5">
            Solo el administrador puede crear usuarios y asignarles permisos de acceso.
          </p>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nombre de la Persona
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
              placeholder="Ej: Juan Pérez (opcional, se muestra al iniciar sesión)"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Usuario *</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
                placeholder="Ej: jperez"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Contraseña *</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full p-2.5 pr-9 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                  placeholder="Mínimo 4 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Confirmar Contraseña *
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                placeholder="Repite la contraseña"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
              className="cursor-pointer"
            />
            Es Administrador (acceso total y puede crear otros usuarios)
          </label>

          {!isAdmin && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                Permisos de acceso por tabla
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {PERMISSION_LABELS.map(({ key, label }) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={permissions[key]}
                      onChange={(e) =>
                        setPermissions((prev) => ({ ...prev, [key]: e.target.checked }))
                      }
                      className="cursor-pointer"
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div className="pt-2 border-t border-slate-200">
                <label className="flex items-center gap-2 text-xs font-bold text-rose-700 cursor-pointer w-fit">
                  <input
                    type="checkbox"
                    checked={canDelete}
                    onChange={(e) => setCanDelete(e.target.checked)}
                    className="cursor-pointer"
                  />
                  Puede eliminar datos (rutas, camiones, personal)
                </label>
              </div>

              <div className="pt-3 border-t border-slate-200 space-y-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer w-fit">
                  <input
                    type="checkbox"
                    checked={agencyAll}
                    onChange={(e) => setAgencyAll(e.target.checked)}
                    className="cursor-pointer"
                  />
                  Ver rutas de todas las agencias
                </label>
                {!agencyAll && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-slate-500">
                      Selecciona las agencias que este usuario podrá ver en el Tablero de Rutas y
                      en Rutas Liquidadas (mismas opciones que el campo Origen de Ruta de
                      Traslado):
                    </p>
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-white">
                      {AGENCIA_LOCATION_OPTIONS.map((ag) => (
                        <label
                          key={ag}
                          className="flex items-center gap-1 text-[11px] font-medium text-slate-700 cursor-pointer px-1.5 py-0.5 rounded hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={agencySelection.includes(ag)}
                            onChange={(e) => {
                              setAgencySelection((prev) =>
                                e.target.checked ? [...prev, ag] : prev.filter((a) => a !== ag)
                              );
                            }}
                            className="cursor-pointer"
                          />
                          {ag}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {formError && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {formError}
            </div>
          )}

          <button
            type="submit"
            className="text-xs bg-slate-900 text-white px-4 py-2.5 rounded-lg font-semibold hover:bg-slate-800 transition cursor-pointer flex items-center"
          >
            <UserPlus className="w-3.5 h-3.5 mr-1.5" />
            Crear Usuario
          </button>
        </form>
      </div>

      {/* Lista de usuarios */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-7 shadow-sm space-y-5">
        <div className="pb-4 border-b border-slate-100">
          <h3 className="font-bold text-slate-800 text-lg flex items-center">
            <UsersIcon className="w-5 h-5 mr-2 text-indigo-600" />
            Usuarios del Sistema
            <span className="ml-2.5 px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
              {users.length}
            </span>
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 font-semibold uppercase text-xs">
              <tr>
                <th className="py-3 px-4">Usuario</th>
                <th className="py-3 px-4">Nombre</th>
                <th className="py-3 px-4">Rol</th>
                <th className="py-3 px-4">Permisos de acceso</th>
                <th className="py-3 px-4">Agencias</th>
                <th className="py-3 px-4">Eliminar datos</th>
                <th className="py-3 px-4">Contraseña</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => {
                const isSelf = u.id === currentUser.id;
                const isLastAdmin = u.isAdmin && adminCount <= 1;
                return (
                  <tr key={u.id} className="hover:bg-slate-50 align-top">
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {profileEditingId === u.id ? (
                        <input
                          type="text"
                          value={profileUsernameDraft}
                          onChange={(e) => setProfileUsernameDraft(e.target.value)}
                          className="w-28 p-1.5 text-xs border border-slate-300 rounded-lg font-mono outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <>
                          {u.username}
                          {isSelf && (
                            <span className="ml-1.5 text-[10px] text-slate-400 font-normal">(tú)</span>
                          )}
                          {/* Corrección: rastro de auditoría básico (quién creó la cuenta y
                              cuándo fue el último acceso) que antes no se mostraba en ningún
                              lugar del sistema. */}
                          <div className="mt-1 text-[9px] font-normal text-slate-400 leading-tight space-y-0.5">
                            {u.createdAt && (
                              <p title={u.createdBy ? `Creado por ${u.createdBy}` : undefined}>
                                Alta: {formatDateTimeToGuatemala(u.createdAt)}
                                {u.createdBy ? ` · por ${u.createdBy}` : ''}
                              </p>
                            )}
                            <p>
                              Último acceso:{' '}
                              {u.lastLogin ? (
                                formatDateTimeToGuatemala(u.lastLogin)
                              ) : (
                                <span className="italic">Nunca</span>
                              )}
                            </p>
                          </div>
                        </>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {profileEditingId === u.id ? (
                        <div className="space-y-1.5">
                          <input
                            type="text"
                            autoFocus
                            value={profileNombreDraft}
                            onChange={(e) => setProfileNombreDraft(e.target.value)}
                            placeholder="Nombre de la persona"
                            className="w-36 p-1.5 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          {profileEditError && (
                            <p className="text-[10px] text-rose-600">{profileEditError}</p>
                          )}
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => requestSaveProfileEdit(u.id)}
                              className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                              title="Guardar"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={cancelProfileEdit}
                              className="p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 cursor-pointer"
                              title="Cancelar"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span>{u.nombre || <span className="text-slate-300 italic">—</span>}</span>
                          <button
                            type="button"
                            onClick={() => startProfileEdit(u)}
                            className="text-slate-300 hover:text-blue-600 cursor-pointer"
                            title="Editar usuario y nombre"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {u.isAdmin ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                          <ShieldCheck className="w-3 h-3" />
                          Administrador
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
                          <Shield className="w-3 h-3" />
                          Estándar
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {u.isAdmin ? (
                        <span className="text-[11px] text-slate-400 italic">Acceso total</span>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 max-w-xs">
                          {PERMISSION_LABELS.map(({ key, label, grandfathered }) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() => togglePermission(u.id, key, u, grandfathered)}
                              title={label}
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border transition cursor-pointer ${
                                isPermEnabled(u, key, grandfathered)
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-slate-50 text-slate-400 border-slate-200'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 max-w-[220px]">
                      {u.isAdmin ? (
                        <span className="text-[11px] text-slate-400 italic">Todas</span>
                      ) : agencyEditingId === u.id ? (
                        <div className="space-y-2">
                          <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={agencyDraftAll}
                              onChange={(e) => setAgencyDraftAll(e.target.checked)}
                              className="cursor-pointer"
                            />
                            Todas
                          </label>
                          {!agencyDraftAll && (
                            <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto border border-slate-200 rounded-lg p-1.5 bg-slate-50">
                              {AGENCIA_LOCATION_OPTIONS.map((ag) => (
                                <button
                                  key={ag}
                                  type="button"
                                  onClick={() => toggleDraftAgency(ag)}
                                  className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border transition cursor-pointer ${
                                    agencyDraftList.includes(ag)
                                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                                      : 'bg-white text-slate-400 border-slate-200'
                                  }`}
                                >
                                  {ag}
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => saveAgencyEdit(u.id)}
                              className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                              title="Guardar"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setAgencyEditingId(null)}
                              className="p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 cursor-pointer"
                              title="Cancelar"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startAgencyEdit(u)}
                          className="text-[11px] text-slate-500 hover:text-blue-700 font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          {u.agencyAccess === 'all' || !u.agencyAccess
                            ? 'Todas'
                            : `${(u.agencyAccess as string[]).length} agencia${
                                (u.agencyAccess as string[]).length === 1 ? '' : 's'
                              }`}
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {u.isAdmin ? (
                        <span className="text-[11px] text-slate-400 italic">Sí</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleCanDelete(u.id, u)}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition cursor-pointer ${
                            u.canDelete
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}
                        >
                          {u.canDelete ? 'Sí' : 'No'}
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {passwordEditingId === u.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            autoFocus
                            value={newPasswordDraft}
                            onChange={(e) => setNewPasswordDraft(e.target.value)}
                            placeholder="Nueva contraseña"
                            className="w-32 p-1.5 text-xs border border-slate-300 rounded-lg font-mono outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => requestSavePasswordEdit(u.id)}
                            className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                            title="Guardar"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPasswordEditingId(null)}
                            className="p-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 cursor-pointer"
                            title="Cancelar"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startPasswordEdit(u.id)}
                          className="text-[11px] text-slate-500 hover:text-blue-700 font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          Cambiar
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        disabled={isSelf || isLastAdmin}
                        title={
                          isSelf
                            ? 'No puedes eliminar tu propio usuario'
                            : isLastAdmin
                            ? 'Debe existir al menos un administrador'
                            : 'Eliminar usuario'
                        }
                        onClick={() => {
                          if (isSelf || isLastAdmin) return;
                          requestDeleteUser(u.id);
                        }}
                        className={`p-1.5 rounded-lg transition ${
                          isSelf || isLastAdmin
                            ? 'text-slate-300 cursor-not-allowed'
                            : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer'
                        }`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmación con contraseña de administrador para guardar cambios o eliminar */}
      {confirmAction && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-600" />
              <h3 className="font-bold text-sm text-slate-800">
                {confirmAction.type === 'delete'
                  ? 'Confirmar eliminación de usuario'
                  : confirmAction.type === 'password'
                  ? 'Confirmar cambio de contraseña'
                  : 'Confirmar cambios de usuario'}
              </h3>
            </div>
            <p className="text-xs text-slate-500">
              {confirmAction.type === 'delete' && (
                <>
                  Esta acción eliminará al usuario "
                  {users.find((u) => u.id === confirmAction.userId)?.username}" y no se puede
                  deshacer.{' '}
                </>
              )}
              Ingresa la contraseña de administrador para confirmar.
            </p>
            <div>
              <input
                type="password"
                autoFocus
                value={confirmPasswordInput}
                onChange={(e) => setConfirmPasswordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitConfirm();
                }}
                placeholder="Contraseña de administrador"
                className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
              />
              {confirmError && <p className="text-[11px] text-rose-600 mt-1">{confirmError}</p>}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={cancelConfirm}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={submitConfirm}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg text-white cursor-pointer ${
                  confirmAction.type === 'delete'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                {confirmAction.type === 'delete' ? 'Eliminar' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
