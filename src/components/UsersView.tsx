import React, { useState } from 'react';
import { AppUser, TablePermissions } from '../types';
import { AGENCIA_LOCATION_OPTIONS } from '../data/agencies';
import { formatDateTimeToGuatemala } from '../utils/date';
import { MIN_PASSWORD_LENGTH, USERNAME_PATTERN, normalizeUsername } from '../services/auth';
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
  Download,
  Building2,
} from 'lucide-react';
import { Button } from './ui/Button';

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
    adminAgencies?: string[];
  }) => boolean | Promise<boolean>;
  onUpdateUser: (
    userId: string,
    updates: Partial<
      Pick<AppUser, 'permissions' | 'canDelete' | 'isAdmin' | 'agencyAccess' | 'username' | 'nombre' | 'adminAgencies'>
    >
  ) => void;
  onResetPassword: (userId: string, newPassword: string) => void;
  onDeleteUser: (userId: string) => void;
  // Verifica la contraseña del administrador en sesión para confirmar acciones
  // delicadas. Con Supabase Auth la app ya no conoce ninguna contraseña, así
  // que la verificación la hace el servidor.
  onVerifyPassword: (password: string) => Promise<boolean>;
  // Punto 19: descarga manual de un respaldo completo (solo administrador).
  onDownloadBackup?: () => Promise<void>;
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

// Corrección: los permisos marcados con "grandfathered" son nuevos — los usuarios
// creados antes de este cambio no tienen estos campos guardados en su registro
// (quedan como undefined). Para no quitarles de golpe algo que ya podían hacer, se
// tratan como "permitido" (true) mientras no se hayan guardado explícitamente en
// false. Ver isPermEnabled/togglePermission más abajo.
//
// Corrección: "Agregar Camiones/Personal Manual" ya NO aparece aquí como permiso
// aparte — si el usuario puede ver Camiones/Personal (permisos "Camiones"/
// "Personal" de abajo), automáticamente puede agregar de forma manual en esa
// tabla. Solo queda como permiso independiente la carga masiva por Excel: si NO
// se le da ese permiso, el usuario simplemente se queda con agregar manual (ver
// canManualAddTrucks/canManualAddStaff en App.tsx).
const PERMISSION_LABELS: { key: keyof TablePermissions; label: string; grandfathered?: boolean }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'board', label: 'Asignación' },
  { key: 'liquidated', label: 'Rutas Liquidadas' },
  { key: 'trucks', label: 'Camiones' },
  { key: 'staff', label: 'Personal' },
  { key: 'batch', label: 'Carga Masiva Excel' },
  { key: 'canBulkUploadTrucks', label: 'Subir Excel Camiones', grandfathered: true },
  { key: 'canBulkUploadStaff', label: 'Subir Excel Personal', grandfathered: true },
  { key: 'canCreateUsers', label: 'Crear usuarios' },
];

// Devuelve si un permiso está habilitado para un usuario, respetando la
// compatibilidad hacia atrás: un permiso "grandfathered" ausente (undefined, en
// cuentas creadas antes de agregarlo) se considera permitido hasta que se
// desactive explícitamente.
const isPermEnabled = (user: AppUser, key: keyof TablePermissions, grandfathered?: boolean) =>
  grandfathered ? user.permissions[key] !== false : !!user.permissions[key];

// Última conexión: fecha y hora + hace cuánto, con un punto verde si estuvo
// activo en los últimos 15 minutos (la app la renueva cada 10 min en uso).
const renderUltimaConexion = (iso?: string) => {
  if (!iso) return <span className="text-xs italic text-slate-400">Nunca</span>;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return <span className="text-xs text-slate-400">—</span>;
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  const enLinea = min <= 15;
  const hace =
    min < 1 ? 'hace un momento' : min < 60 ? `hace ${min} min` : min < 1440 ? `hace ${Math.floor(min / 60)} h` : `hace ${Math.floor(min / 1440)} día(s)`;
  const color = enLinea ? 'bg-emerald-500' : min < 1440 ? 'bg-amber-400' : min < 7 * 1440 ? 'bg-slate-300' : 'bg-rose-400';
  return (
    <div className="text-xs leading-tight" title={formatDateTimeToGuatemala(iso)}>
      <div className="flex items-center gap-1.5 font-semibold text-slate-700">
        <span className={`inline-block w-2 h-2 rounded-full ${color}`} aria-hidden="true" />
        {enLinea ? 'Conectado' : hace}
      </div>
      <div className="text-[10px] text-slate-500 mt-0.5">{formatDateTimeToGuatemala(iso)}</div>
    </div>
  );
};

export const UsersView: React.FC<UsersViewProps> = ({
  users,
  currentUser,
  onCreateUser,
  onUpdateUser,
  onResetPassword,
  onDeleteUser,
  onVerifyPassword,
  onDownloadBackup,
}) => {
  // Agencias de las que el nuevo usuario será administrador.
  const [adminAgencies, setAdminAgencies] = useState<string[]>([]);
  const [adminAgEditingId, setAdminAgEditingId] = useState<string | null>(null);
  const [adminAgDraft, setAdminAgDraft] = useState<string[]>([]);

  const [isBackingUp, setIsBackingUp] = useState(false);
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
  const [agencyAll, setAgencyAll] = useState(
    currentUser.isAdmin || currentUser.agencyAccess === 'all' || !currentUser.agencyAccess
  );
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

  // Quien NO es administrador pero tiene el permiso "Crear usuarios" solo puede
  // dar permisos y agencias que él mismo tiene, nunca rango de administrador ni
  // el propio permiso de crear usuarios (el servidor aplica la misma regla).
  const isAdminSession = currentUser.isAdmin;
  const canGrant = (key: keyof TablePermissions, grandfathered?: boolean) =>
    isAdminSession || (key !== 'canCreateUsers' && isPermEnabled(currentUser, key, grandfathered));
  const grantableLabels = PERMISSION_LABELS.filter((p) => canGrant(p.key, p.grandfathered));
  const myAgencies = currentUser.agencyAccess;
  const agencyChoices =
    isAdminSession || myAgencies === 'all' || !myAgencies
      ? AGENCIA_LOCATION_OPTIONS
      : AGENCIA_LOCATION_OPTIONS.filter((ag) => myAgencies.includes(ag));
  const canGrantAllAgencies = isAdminSession || myAgencies === 'all' || !myAgencies;
  const canGrantDelete = isAdminSession || currentUser.canDelete;

  const [isCreating, setIsCreating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreating) return;
    setFormError('');
    const trimmed = normalizeUsername(username);
    if (!trimmed) {
      setFormError('El nombre de usuario es obligatorio.');
      return;
    }
    if (!USERNAME_PATTERN.test(trimmed)) {
      setFormError(
        'Usuario inválido: de 3 a 30 caracteres, solo letras minúsculas, números, punto, guion o guion bajo (sin espacios ni tildes).'
      );
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setFormError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
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
    if (!isAdminSession && !canGrantAllAgencies && (agencyAll || agencySelection.length === 0)) {
      setFormError('Selecciona al menos una de tus agencias para el nuevo usuario.');
      return;
    }
    // Recorte final de lo que este usuario puede otorgar (por si acaso).
    const permisosFinales: TablePermissions = isAdminSession
      ? permissions
      : (Object.fromEntries(
          Object.entries(permissions).map(([k, v]) => {
            const lbl = PERMISSION_LABELS.find((p) => p.key === k);
            return [k, !!v && canGrant(k as keyof TablePermissions, lbl?.grandfathered)];
          })
        ) as unknown as TablePermissions);
    if (!isAdminSession) permisosFinales.canCreateUsers = false;
    // Solo puede administrar agencias que también puede ver.
    const agenciasVisibles = agencyAll && canGrantAllAgencies ? null : agencySelection;
    const adminAgFinal =
      isAdminSession && !isAdmin
        ? adminAgencies.filter((a) => !agenciasVisibles || agenciasVisibles.includes(a))
        : [];
    setIsCreating(true);
    const created = await onCreateUser({
      username: trimmed,
      password,
      nombre: nombre.trim() || undefined,
      adminAgencies: adminAgFinal,
      isAdmin: isAdminSession && isAdmin,
      permissions: isAdminSession && isAdmin
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
            canCreateUsers: true,
          }
        : permisosFinales,
      canDelete: isAdminSession && isAdmin ? true : canGrantDelete && canDelete,
      agencyAccess:
        isAdminSession && isAdmin
          ? 'all'
          : agencyAll && canGrantAllAgencies
          ? 'all'
          : agencySelection.filter((a) => agencyChoices.includes(a)),
    });
    setIsCreating(false);
    if (!created) return;
    setUsername('');
    setAdminAgencies([]);
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setNombre('');
    setIsAdmin(false);
    setPermissions({ ...DEFAULT_PERMISSIONS });
    setCanDelete(false);
    setAgencyAll(canGrantAllAgencies);
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
    if (newPasswordDraft.length < MIN_PASSWORD_LENGTH) {
      alertPasswordTooShort();
      return;
    }
    setConfirmError('');
    setConfirmPasswordInput('');
    setConfirmAction({ type: 'password', userId, newPassword: newPasswordDraft });
  };

  const [passwordEditError, setPasswordEditError] = useState('');
  const alertPasswordTooShort = () =>
    setPasswordEditError(`Mínimo ${MIN_PASSWORD_LENGTH} caracteres.`);

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
    const currentUsername = users.find((u) => u.id === userId)?.username;
    // Un nombre de usuario antiguo que no cumpla el formato se puede conservar;
    // solo se valida el formato si realmente se cambia.
    const trimmedUsername =
      profileUsernameDraft.trim() === currentUsername ? currentUsername : normalizeUsername(profileUsernameDraft);
    if (!trimmedUsername) {
      setProfileEditError('El nombre de usuario no puede quedar vacío.');
      return;
    }
    if (trimmedUsername !== currentUsername && !USERNAME_PATTERN.test(trimmedUsername)) {
      setProfileEditError('Solo minúsculas, números, punto, guion o guion bajo (3 a 30).');
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

  const submitConfirm = async () => {
    if (!confirmAction || isConfirming) return;
    setIsConfirming(true);
    const valid = await onVerifyPassword(confirmPasswordInput);
    setIsConfirming(false);
    if (!valid) {
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
    const u = users.find((x) => x.id === userId);
    const admin = u?.adminAgencies || [];
    // Si deja de ver una agencia, también deja de administrarla.
    const adminPodado = agencyDraftAll ? admin : admin.filter((a) => agencyDraftList.includes(a));
    onUpdateUser(userId, {
      agencyAccess: agencyDraftAll ? 'all' : agencyDraftList,
      ...(adminPodado.length !== admin.length ? { adminAgencies: adminPodado } : {}),
    });
    setAgencyEditingId(null);
  };

  // Administrador de agencias (solo lo asigna el administrador general).
  const startAdminAgEdit = (user: AppUser) => {
    setAdminAgEditingId(user.id);
    setAdminAgDraft(user.adminAgencies || []);
  };
  const saveAdminAgEdit = (user: AppUser) => {
    const visibles = user.agencyAccess === 'all' || !user.agencyAccess ? null : user.agencyAccess;
    const lista = adminAgDraft.filter((a) => !visibles || visibles.includes(a));
    onUpdateUser(user.id, { adminAgencies: lista });
    setAdminAgEditingId(null);
  };
  // Opciones de "Administrador de agencias" para el formulario de creación:
  // solo agencias que el nuevo usuario podrá ver.
  const adminAgChoices = agencyAll && canGrantAllAgencies ? AGENCIA_LOCATION_OPTIONS : agencySelection;

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
            {isAdminSession
              ? 'El administrador puede crear usuarios y asignarles permisos. Para que otra persona pueda crear usuarios sin ser administrador, márcale el permiso "Crear usuarios".'
              : 'Tienes permiso para crear usuarios. Solo puedes darles los permisos y agencias que tú tienes; para crear un administrador o editar usuarios existentes, pide ayuda a un administrador.'}
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
              className="w-full min-h-[44px] p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
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
                className="w-full min-h-[44px] p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-medium"
                placeholder="Ej: jperez (minúsculas, sin espacios)"
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
                  placeholder={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
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
                className="w-full min-h-[44px] p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                placeholder="Repite la contraseña"
              />
            </div>
          </div>

          {isAdminSession && (
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer w-fit">
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
                className="cursor-pointer w-5 h-5"
              />
              Es Administrador (acceso total y puede crear otros usuarios)
            </label>
          )}

          {!(isAdminSession && isAdmin) && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                Permisos de acceso por tabla
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {grantableLabels.map(({ key, label }) => (
                  <label
                    key={key}
                    className={`flex items-center gap-2 text-xs cursor-pointer ${
                      key === 'canCreateUsers' ? 'font-bold text-blue-800' : 'font-medium text-slate-700'
                    }`}
                    title={key === 'canCreateUsers' ? 'Podrá crear usuarios NO administradores, solo con sus mismos permisos y agencias.' : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={!!permissions[key]}
                      onChange={(e) =>
                        setPermissions((prev) => ({ ...prev, [key]: e.target.checked }))
                      }
                      className="cursor-pointer"
                    />
                    {label}
                  </label>
                ))}
              </div>
              {canGrantDelete && (
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
              )}

              <div className="pt-3 border-t border-slate-200 space-y-2">
                {canGrantAllAgencies && (
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer w-fit">
                  <input
                    type="checkbox"
                    checked={agencyAll}
                    onChange={(e) => setAgencyAll(e.target.checked)}
                    className="cursor-pointer"
                  />
                  Ver rutas de todas las agencias
                </label>
                )}
                {(!agencyAll || !canGrantAllAgencies) && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] text-slate-500">
                      Selecciona las agencias que este usuario podrá ver en Asignación y
                      en Rutas Liquidadas (mismas opciones que el campo Origen de Ruta de
                      Traslado):
                    </p>
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-white">
                      {agencyChoices.map((ag) => (
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

              {isAdminSession && (
                <div className="pt-3 border-t border-slate-200 space-y-2">
                  <p className="text-xs font-bold text-violet-800 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4" aria-hidden />
                    Administrador de agencias (opcional)
                  </p>
                  <p className="text-[11px] text-slate-500">
                    En las agencias marcadas podrá eliminar, revertir y aprobar todo lo que requiere aprobación
                    (recargas, préstamos, cambio de segmento y de estatus de camión). No podrá gestionar usuarios.
                  </p>
                  {adminAgChoices.length === 0 ? (
                    <p className="text-[11px] italic text-slate-400">Primero selecciona las agencias que podrá ver.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto border border-violet-200 rounded-lg p-2 bg-white">
                      {adminAgChoices.map((ag) => (
                        <label
                          key={ag}
                          className="flex items-center gap-1 text-[11px] font-medium text-slate-700 cursor-pointer px-1.5 py-0.5 rounded hover:bg-violet-50"
                        >
                          <input
                            type="checkbox"
                            checked={adminAgencies.includes(ag)}
                            onChange={(e) =>
                              setAdminAgencies((prev) => (e.target.checked ? [...prev, ag] : prev.filter((a) => a !== ag)))
                            }
                            className="cursor-pointer"
                          />
                          {ag}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {formError && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {formError}
            </div>
          )}

          <Button type="submit" variant="primary" icon={UserPlus} loading={isCreating} loadingText="Creando usuario…">
            Crear usuario
          </Button>
        </form>
      </div>

      {!isAdminSession && (
        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-4">
          La lista de usuarios, los cambios de permisos, contraseñas y eliminaciones solo los puede hacer un administrador.
        </p>
      )}

      {/* Lista de usuarios */}
      {isAdminSession && (
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
                <th className="py-3 px-4 whitespace-nowrap">Última conexión</th>
                <th className="py-3 px-4">Rol</th>
                <th className="py-3 px-4">Permisos de acceso</th>
                <th className="py-3 px-4">Agencias</th>
                <th className="py-3 px-4 whitespace-nowrap">Admin. de agencias</th>
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
                            className="w-40 min-h-[40px] p-1.5 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          {profileEditError && (
                            <p className="text-[10px] text-rose-600">{profileEditError}</p>
                          )}
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => requestSaveProfileEdit(u.id)}
                              className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                              title="Guardar"
                              aria-label="Guardar"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={cancelProfileEdit}
                              className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 cursor-pointer"
                              title="Cancelar"
                              aria-label="Cancelar"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span>{u.nombre || <span className="text-slate-300 italic">—</span>}</span>
                          <button
                            type="button"
                            onClick={() => startProfileEdit(u)}
                            className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer"
                            title="Editar usuario y nombre"
                            aria-label={`Editar usuario y nombre de ${u.username}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">{renderUltimaConexion(u.lastLogin)}</td>
                    <td className="py-3 px-4">
                      {u.isAdmin ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                          <ShieldCheck className="w-3 h-3" />
                          Administrador
                        </span>
                      ) : (u.adminAgencies || []).length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-800 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                          <Building2 className="w-3 h-3" />
                          Admin. de agencia
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
                              aria-pressed={isPermEnabled(u, key, grandfathered)}
                              className={`min-h-[36px] text-[11px] font-semibold px-2 rounded-lg border transition cursor-pointer ${
                                isPermEnabled(u, key, grandfathered)
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : 'bg-white text-slate-400 border-slate-200 line-through decoration-slate-300'
                              }`}
                            >
                              {isPermEnabled(u, key, grandfathered) ? '✓ ' : ''}
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
                              className="cursor-pointer w-5 h-5"
                            />
                            Todas
                          </label>
                          {!agencyDraftAll && (
                            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-1.5 bg-slate-50">
                              {AGENCIA_LOCATION_OPTIONS.map((ag) => (
                                <button
                                  key={ag}
                                  type="button"
                                  onClick={() => toggleDraftAgency(ag)}
                                  aria-pressed={agencyDraftList.includes(ag)}
                                  className={`min-h-[36px] text-[11px] font-semibold px-2 rounded-lg border transition cursor-pointer ${
                                    agencyDraftList.includes(ag)
                                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                                      : 'bg-white text-slate-400 border-slate-200'
                                  }`}
                                >
                                  {agencyDraftList.includes(ag) ? '✓ ' : ''}
                                  {ag}
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => saveAgencyEdit(u.id)}
                              className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                              title="Guardar"
                              aria-label="Guardar"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setAgencyEditingId(null)}
                              className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 cursor-pointer"
                              title="Cancelar"
                              aria-label="Cancelar"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startAgencyEdit(u)}
                          className="min-h-[40px] px-2.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:text-blue-700 hover:border-blue-300 hover:bg-blue-50 font-semibold flex items-center gap-1.5 cursor-pointer"
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
                    <td className="py-3 px-4 max-w-[240px]">
                      {u.isAdmin ? (
                        <span className="text-[11px] text-slate-400 italic">Todas (admin. general)</span>
                      ) : adminAgEditingId === u.id ? (
                        <div className="space-y-2">
                          {(() => {
                            const opciones = u.agencyAccess === 'all' || !u.agencyAccess ? AGENCIA_LOCATION_OPTIONS : u.agencyAccess;
                            return opciones.length === 0 ? (
                              <p className="text-[11px] italic text-slate-400">Primero asígnale agencias que pueda ver.</p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto border border-violet-200 rounded-lg p-1.5 bg-violet-50/40">
                                {opciones.map((ag) => (
                                  <button
                                    key={ag}
                                    type="button"
                                    onClick={() =>
                                      setAdminAgDraft((prev) => (prev.includes(ag) ? prev.filter((a) => a !== ag) : [...prev, ag]))
                                    }
                                    aria-pressed={adminAgDraft.includes(ag)}
                                    className={`min-h-[36px] text-[11px] font-semibold px-2 rounded-lg border transition cursor-pointer ${
                                      adminAgDraft.includes(ag)
                                        ? 'bg-violet-100 text-violet-800 border-violet-300'
                                        : 'bg-white text-slate-400 border-slate-200'
                                    }`}
                                  >
                                    {adminAgDraft.includes(ag) ? '✓ ' : ''}
                                    {ag}
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => saveAdminAgEdit(u)}
                              className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                              title="Guardar"
                              aria-label="Guardar"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setAdminAgEditingId(null)}
                              className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 cursor-pointer"
                              title="Cancelar"
                              aria-label="Cancelar"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startAdminAgEdit(u)}
                          title={(u.adminAgencies || []).join(', ') || 'No administra agencias'}
                          aria-label={`Administrador de agencias de ${u.username}`}
                          className={`min-h-[40px] px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer text-left ${
                            (u.adminAgencies || []).length > 0
                              ? 'border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100'
                              : 'border-slate-200 text-slate-500 hover:text-violet-700 hover:border-violet-300 hover:bg-violet-50'
                          }`}
                        >
                          <Building2 className="w-3.5 h-3.5 shrink-0" />
                          {(u.adminAgencies || []).length > 0 ? (u.adminAgencies || []).join(', ') : 'Ninguna'}
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
                          aria-pressed={!!u.canDelete}
                          aria-label={`Puede eliminar datos: ${u.canDelete ? 'Sí' : 'No'}`}
                          className={`min-h-[36px] min-w-[52px] text-xs font-bold px-3 rounded-full border transition cursor-pointer ${
                            u.canDelete
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}
                        >
                          {u.canDelete ? '✓ Sí' : 'No'}
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
                            onChange={(e) => {
                              setNewPasswordDraft(e.target.value);
                              setPasswordEditError('');
                            }}
                            placeholder="Nueva contraseña"
                            className="w-36 min-h-[40px] p-1.5 text-sm border border-slate-300 rounded-lg font-mono outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => requestSavePasswordEdit(u.id)}
                            className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                            title="Guardar"
                              aria-label="Guardar"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPasswordEditingId(null);
                              setPasswordEditError('');
                            }}
                            className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-600 cursor-pointer"
                            title="Cancelar"
                              aria-label="Cancelar"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          {passwordEditError && (
                            <span className="text-[10px] font-semibold text-rose-600">{passwordEditError}</span>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startPasswordEdit(u.id)}
                          className="min-h-[40px] px-2.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:text-blue-700 hover:border-blue-300 hover:bg-blue-50 font-semibold flex items-center gap-1.5 cursor-pointer"
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
                        aria-label={`Eliminar usuario ${u.username}`}
                        className={`min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg transition ${
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
      )}

      {/* Herramientas de administrador (al final: acciones poco frecuentes).
          El respaldo también está en el menú del usuario de la barra superior. */}
      {onDownloadBackup && (
        <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Respaldo de datos</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Descarga una copia completa (rutas, liquidadas, camiones y personal) para guardarla fuera de Supabase.
              Además, Supabase guarda un respaldo automático cada día.
            </p>
          </div>
          <Button
            variant="secondary"
            icon={Download}
            loading={isBackingUp}
            loadingText="Preparando respaldo…"
            onClick={async () => {
              setIsBackingUp(true);
              try {
                await onDownloadBackup();
              } finally {
                setIsBackingUp(false);
              }
            }}
          >
            Descargar respaldo
          </Button>
        </div>
      )}

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
                className="w-full min-h-[44px] p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
              />
              {confirmError && <p className="text-[11px] text-rose-600 mt-1">{confirmError}</p>}
            </div>
            <div className="flex items-center justify-between gap-2 pt-2">
              <Button variant="secondary" onClick={cancelConfirm}>
                Cancelar
              </Button>
              <Button
                variant={confirmAction.type === 'delete' ? 'danger' : 'primary'}
                icon={confirmAction.type === 'delete' ? Trash2 : Check}
                onClick={submitConfirm}
                loading={isConfirming}
                loadingText="Verificando…"
              >
                {confirmAction.type === 'delete'
                  ? 'Eliminar usuario'
                  : confirmAction.type === 'password'
                  ? 'Cambiar contraseña'
                  : 'Guardar cambios'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
