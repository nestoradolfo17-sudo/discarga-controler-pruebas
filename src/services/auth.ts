import { supabase } from './supabaseClient';
import type { AppUser, TablePermissions } from '../types';

// --- Inicio de sesión y gestión de usuarios con Supabase Auth ---
//
// Las contraseñas las maneja Supabase Auth (cifradas en el servidor; la app
// nunca las ve ni las guarda). La tabla "app_users" guarda solo el PERFIL:
// usuario, nombre, administrador, permisos, permiso de eliminar y agencias.
// Crear, renombrar, cambiar contraseña o eliminar usuarios pasa por la
// función de servidor "admin-users" (supabase/functions/admin-users), que
// verifica que quien lo pide sea administrador. Ver supabase/GUIA_USUARIOS.md.

// Debe coincidir con USER_EMAIL_DOMAIN en supabase/functions/admin-users.
// Los usuarios entran con su NOMBRE DE USUARIO; internamente Supabase Auth
// necesita un correo, así que se usa "usuario@usuarios.discarga.app".
export const USER_EMAIL_DOMAIN = 'usuarios.discarga.app';
export const MIN_PASSWORD_LENGTH = 6;
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;

export const normalizeUsername = (u: string) => u.trim().toLowerCase();
const usernameToEmail = (u: string) => `${normalizeUsername(u)}@${USER_EMAIL_DOMAIN}`;

interface AppUserRow {
  id: string;
  username: string;
  nombre: string | null;
  is_admin: boolean;
  can_delete: boolean;
  permissions: TablePermissions;
  agency_access: 'all' | string[];
  activo: boolean;
  created_at: string;
  created_by: string | null;
  last_login: string | null;
}

export const rowToAppUser = (row: AppUserRow): AppUser => ({
  id: row.id,
  username: row.username,
  nombre: row.nombre || undefined,
  isAdmin: row.is_admin,
  canDelete: row.can_delete,
  permissions: (row.permissions || {}) as TablePermissions,
  agencyAccess: row.agency_access ?? 'all',
  activo: row.activo,
  createdAt: row.created_at,
  createdBy: row.created_by || undefined,
  lastLogin: row.last_login || undefined,
});

/** Devuelve el id del usuario con sesión activa (o null). */
export async function getSessionUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Escucha inicios/cierres de sesión (incluye expiración del token). */
export function onAuthChange(cb: (userId: string | null) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session?.user.id ?? null);
  });
  return () => data.subscription.unsubscribe();
}

/** Inicia sesión. Devuelve null si todo salió bien, o un mensaje de error. */
export async function signIn(username: string, password: string): Promise<string | null> {
  if (!supabase) return 'La base de datos no está configurada.';
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  if (error) {
    if (/invalid login credentials/i.test(error.message)) return 'Usuario o contraseña incorrectos.';
    return `No se pudo iniciar sesión: ${error.message}`;
  }
  void supabase.rpc('touch_last_login');
  return null;
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/**
 * Verifica la contraseña del usuario con sesión activa (se usa para
 * confirmar acciones delicadas en la pantalla Usuarios).
 */
export async function verifyOwnPassword(username: string, password: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.auth.signInWithPassword({
    email: usernameToEmail(username),
    password,
  });
  return !error;
}

/**
 * Perfiles visibles para el usuario en sesión: el administrador recibe todos,
 * un usuario normal solo el suyo (lo decide la base de datos, no la app).
 */
export async function fetchProfiles(): Promise<AppUser[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('app_users').select('*').order('created_at');
  if (error) {
    console.error('Error leyendo usuarios:', error);
    return null;
  }
  return (data as AppUserRow[]).map(rowToAppUser);
}

/** Cambios en tiempo real de los perfiles (lo que RLS permita ver). */
export function subscribeToProfiles(onChange: (updater: (prev: AppUser[]) => AppUser[]) => void): () => void {
  if (!supabase) return () => {};
  const client = supabase;
  const channel = client
    .channel('app_users-profiles')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_users' }, (payload: any) => {
      if (payload.eventType === 'DELETE') {
        const id = payload.old?.id;
        if (id) onChange((prev) => prev.filter((u) => u.id !== id));
        return;
      }
      if (!payload.new?.id) return;
      const user = rowToAppUser(payload.new as AppUserRow);
      onChange((prev) => {
        const idx = prev.findIndex((u) => u.id === user.id);
        if (idx === -1) return [...prev, user];
        const next = [...prev];
        next[idx] = user;
        return next;
      });
    })
    .subscribe();
  return () => {
    client.removeChannel(channel);
  };
}

// --- Acciones de administrador ---

async function callAdmin<T = any>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('La base de datos no está configurada.');
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    // La función devuelve { error: "mensaje" }; intentar mostrar ese mensaje.
    let message = error.message;
    try {
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        const parsed = await ctx.json();
        if (parsed?.error) message = parsed.error;
      }
    } catch {
      /* se usa el mensaje genérico */
    }
    if (/Failed to send a request|not found/i.test(message)) {
      message = 'No se encontró la función "admin-users" en Supabase. Revisa que esté desplegada (ver GUIA_USUARIOS.md).';
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function adminCreateUser(input: {
  username: string;
  password: string;
  nombre?: string;
  isAdmin: boolean;
  permissions: TablePermissions;
  canDelete: boolean;
  agencyAccess: 'all' | string[];
}): Promise<AppUser> {
  const res = await callAdmin<{ user: AppUserRow }>({ action: 'create', ...input });
  return rowToAppUser(res.user);
}

export async function adminSetPassword(userId: string, password: string): Promise<void> {
  await callAdmin({ action: 'set_password', userId, password });
}

export async function adminRenameUser(userId: string, username: string): Promise<void> {
  await callAdmin({ action: 'rename', userId, username });
}

export async function adminDeleteUser(userId: string): Promise<void> {
  await callAdmin({ action: 'delete', userId });
}

/** Permisos, nombre, administrador, eliminar, agencias, activo. */
export async function adminUpdateProfile(
  userId: string,
  updates: Partial<Pick<AppUser, 'nombre' | 'isAdmin' | 'canDelete' | 'permissions' | 'agencyAccess' | 'activo'>>
): Promise<void> {
  if (!supabase) throw new Error('La base de datos no está configurada.');
  const row: Record<string, unknown> = {};
  if ('nombre' in updates) row.nombre = updates.nombre ?? null;
  if (updates.isAdmin !== undefined) row.is_admin = updates.isAdmin;
  if (updates.canDelete !== undefined) row.can_delete = updates.canDelete;
  if (updates.permissions !== undefined) row.permissions = updates.permissions;
  if (updates.agencyAccess !== undefined) row.agency_access = updates.agencyAccess;
  if (updates.activo !== undefined) row.activo = updates.activo;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('app_users').update(row).eq('id', userId);
  if (error) throw new Error(error.message);
}
