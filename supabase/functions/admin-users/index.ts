// DISCARGA CONTROLER — Función "admin-users" (Supabase Edge Function)
//
// Es la ÚNICA puerta para crear, renombrar, cambiar contraseña o eliminar
// usuarios. Corre en los servidores de Supabase con la llave de servicio
// (service_role), que NUNCA llega al navegador. Antes de hacer cualquier
// cosa verifica que quien la llama haya iniciado sesión y sea un
// administrador activo en "app_users".
//
// Despliegue: Supabase → Edge Functions → Deploy a new function → Via Editor
// → nombre "admin-users" → pegar este archivo → Deploy.
// (Ver supabase/GUIA_USUARIOS.md)

import { createClient } from 'npm:@supabase/supabase-js@2';

// Debe coincidir con USER_EMAIL_DOMAIN en src/services/auth.ts. Los usuarios
// inician sesión con su NOMBRE DE USUARIO; internamente Supabase Auth necesita
// un correo, así que se forma "usuario@usuarios.discarga.app" (no se envían
// correos a esa dirección).
const USER_EMAIL_DOMAIN = 'usuarios.discarga.app';
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
const MIN_PASSWORD = 6;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const fail = (message: string, status = 400) => json({ error: message }, status);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('Método no permitido.', 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  // Llave secreta de servidor. Supabase la pone disponible automáticamente
  // como SUPABASE_SERVICE_ROLE_KEY. Si tu proyecto usa las llaves nuevas
  // ("sb_secret_...") y esa variable no funciona, crea un Secret llamado
  // SERVICE_KEY con tu llave secreta (ver GUIA_USUARIOS.md, paso 4).
  const serviceKey = Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) return fail('Falta configurar la llave secreta del servidor (SERVICE_KEY).', 500);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 1) ¿Quién llama? Se valida su token de sesión con Supabase Auth.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: authData } = token ? await admin.auth.getUser(token) : { data: null };
  const caller = authData?.user;
  if (!caller) return fail('Sesión no válida. Vuelve a iniciar sesión.', 401);

  // 2) ¿Es administrador activo?
  const { data: callerProfile } = await admin
    .from('app_users')
    .select('id, username, nombre, is_admin, activo')
    .eq('id', caller.id)
    .maybeSingle();
  if (!callerProfile?.is_admin || !callerProfile.activo) {
    return fail('Solo un administrador puede gestionar usuarios.', 403);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return fail('Solicitud inválida.');
  }

  const normalize = (u: unknown) => String(u ?? '').trim().toLowerCase();

  try {
    switch (body.action) {
      // ── Crear usuario ────────────────────────────────────────────────
      case 'create': {
        const username = normalize(body.username);
        const password = String(body.password ?? '');
        if (!USERNAME_RE.test(username)) {
          return fail('Usuario inválido: 3 a 30 caracteres, solo letras minúsculas, números, punto, guion o guion bajo (sin espacios ni tildes).');
        }
        if (password.length < MIN_PASSWORD) {
          return fail(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
        }
        const { data: existing } = await admin
          .from('app_users').select('id').eq('username', username).maybeSingle();
        if (existing) return fail('Ya existe un usuario con ese nombre.');

        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email: `${username}@${USER_EMAIL_DOMAIN}`,
          password,
          email_confirm: true,
        });
        if (createErr || !created.user) {
          return fail(`No se pudo crear el acceso: ${createErr?.message ?? 'error desconocido'}`);
        }

        const { data: profile, error: profileErr } = await admin
          .from('app_users')
          .insert({
            id: created.user.id,
            username,
            nombre: body.nombre ? String(body.nombre).trim() : null,
            is_admin: !!body.isAdmin,
            can_delete: !!body.canDelete,
            permissions: body.permissions ?? {},
            agency_access: body.agencyAccess ?? 'all',
            created_by: callerProfile.nombre || callerProfile.username,
          })
          .select()
          .single();
        if (profileErr) {
          // No dejar un acceso "huérfano" sin perfil.
          await admin.auth.admin.deleteUser(created.user.id);
          return fail(`No se pudo guardar el perfil: ${profileErr.message}`);
        }
        return json({ user: profile });
      }

      // ── Cambiar contraseña ───────────────────────────────────────────
      case 'set_password': {
        const password = String(body.password ?? '');
        if (!body.userId) return fail('Falta el usuario.');
        if (password.length < MIN_PASSWORD) {
          return fail(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
        }
        const { error } = await admin.auth.admin.updateUserById(body.userId, { password });
        if (error) return fail(`No se pudo cambiar la contraseña: ${error.message}`);
        return json({ ok: true });
      }

      // ── Cambiar nombre de usuario (también cambia el correo interno) ──
      case 'rename': {
        const username = normalize(body.username);
        if (!body.userId) return fail('Falta el usuario.');
        if (!USERNAME_RE.test(username)) {
          return fail('Usuario inválido: 3 a 30 caracteres, solo letras minúsculas, números, punto, guion o guion bajo.');
        }
        const { data: existing } = await admin
          .from('app_users').select('id').eq('username', username).maybeSingle();
        if (existing && existing.id !== body.userId) return fail('Ya existe un usuario con ese nombre.');

        const { error: authErr } = await admin.auth.admin.updateUserById(body.userId, {
          email: `${username}@${USER_EMAIL_DOMAIN}`,
          email_confirm: true,
        });
        if (authErr) return fail(`No se pudo cambiar el usuario: ${authErr.message}`);
        const { error: profErr } = await admin
          .from('app_users').update({ username }).eq('id', body.userId);
        if (profErr) return fail(`No se pudo cambiar el usuario: ${profErr.message}`);
        return json({ ok: true });
      }

      // ── Eliminar usuario ─────────────────────────────────────────────
      case 'delete': {
        if (!body.userId) return fail('Falta el usuario.');
        if (body.userId === caller.id) return fail('No puedes eliminar tu propio usuario.');
        // El trigger guard_last_admin impide borrar al último administrador.
        const { error: profErr } = await admin.from('app_users').delete().eq('id', body.userId);
        if (profErr) return fail(profErr.message);
        const { error } = await admin.auth.admin.deleteUser(body.userId);
        if (error) return fail(`Perfil eliminado, pero no el acceso: ${error.message}`);
        return json({ ok: true });
      }

      default:
        return fail('Acción no reconocida.');
    }
  } catch (e) {
    return fail(`Error inesperado: ${(e as Error).message}`, 500);
  }
});
