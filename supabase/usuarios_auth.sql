-- DISCARGA CONTROLER — Usuarios seguros con Supabase Auth
--
-- Ejecuta este script UNA SOLA VEZ en Supabase → SQL Editor → New query → Run.
-- (Guía completa paso a paso en supabase/GUIA_USUARIOS.md)
--
-- Qué cambia:
--   • Las contraseñas dejan de guardarse en una tabla pública. Ahora las
--     maneja Supabase Auth (cifradas, nunca visibles, ni para el admin).
--   • "app_users" pasa a ser una tabla de PERFILES: usuario, nombre,
--     administrador, permisos por pantalla, permiso de eliminar y agencias.
--   • Solo un administrador puede crear, modificar o eliminar usuarios.
--     No existe registro público ("sign up"): los usuarios se crean desde la
--     pantalla Usuarios de la app (a través de la función "admin-users").
--   • Las tablas de datos (rutas, camiones, personal, historial) dejan de
--     estar abiertas a cualquiera: solo usuarios que iniciaron sesión y
--     tienen un perfil ACTIVO pueden leerlas o modificarlas.

-- ─── 1. La tabla anterior (usuarios con contraseña en texto) se conserva
--        como respaldo, pero queda totalmente cerrada ───────────────────────
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'app_users')
     and not exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'app_users' and column_name = 'is_admin') then
    alter table public.app_users rename to app_users_legacy;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_publication_tables
             where pubname = 'supabase_realtime' and tablename = 'app_users_legacy') then
    alter publication supabase_realtime drop table public.app_users_legacy;
  end if;
end $$;

drop policy if exists "Acceso temporal de pruebas" on public.app_users_legacy;
-- RLS sigue habilitado y sin políticas → nadie puede leerla desde la app.

-- ─── 2. Tabla de perfiles ────────────────────────────────────────────────
create table if not exists public.app_users (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text not null unique
                check (username ~ '^[a-z0-9._-]{3,30}$'),
  nombre        text,
  is_admin      boolean not null default false,
  can_delete    boolean not null default false,
  -- Mismo formato que TablePermissions en src/types.ts
  -- {dashboard, board, liquidated, trucks, staff, batch,
  --  canBulkUploadTrucks, canManualAddTrucks, canBulkUploadStaff, canManualAddStaff}
  permissions   jsonb not null default '{}'::jsonb,
  -- "all" o una lista de agencias, p. ej. ["Xela","Coban"]
  agency_access jsonb not null default '"all"'::jsonb,
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    text,
  last_login    timestamptz
);

alter table public.app_users enable row level security;

-- ─── 3. Funciones auxiliares (SECURITY DEFINER evita recursión en RLS) ───
create or replace function public.is_app_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_users where id = auth.uid() and activo);
$$;

create or replace function public.is_app_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_users where id = auth.uid() and activo and is_admin);
$$;

-- Registrar el último acceso (cada usuario solo puede tocar SU propia fecha).
create or replace function public.touch_last_login()
returns void language sql security definer set search_path = public as $$
  update public.app_users set last_login = now() where id = auth.uid();
$$;

grant execute on function public.is_app_user(), public.is_app_admin(), public.touch_last_login() to authenticated;

-- Nunca dejar el sistema sin al menos un administrador activo.
create or replace function public.guard_last_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'DELETE' and old.is_admin and old.activo)
     or (tg_op = 'UPDATE' and old.is_admin and old.activo and (not new.is_admin or not new.activo)) then
    if not exists (select 1 from public.app_users
                   where id <> old.id and is_admin and activo) then
      raise exception 'Debe existir al menos un usuario administrador activo.';
    end if;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_guard_last_admin on public.app_users;
create trigger trg_guard_last_admin
  before update or delete on public.app_users
  for each row execute function public.guard_last_admin();

-- ─── 4. Políticas de app_users ──────────────────────────────────────────
-- Cada usuario ve su propio perfil; el administrador ve todos.
drop policy if exists "Ver perfil propio o admin" on public.app_users;
create policy "Ver perfil propio o admin" on public.app_users
  for select to authenticated
  using (id = auth.uid() or public.is_app_admin());

-- Solo el administrador cambia permisos, nombre, agencias, etc.
drop policy if exists "Solo admin modifica" on public.app_users;
create policy "Solo admin modifica" on public.app_users
  for update to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

-- No hay política de INSERT ni DELETE: crear y eliminar usuarios solo es
-- posible desde la función "admin-users" (que verifica que quien lo pide
-- sea administrador).

-- Tiempo real: el admin ve al instante los cambios de otros admins.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'app_users') then
    alter publication supabase_realtime add table public.app_users;
  end if;
end $$;

-- ─── 5. Cerrar las tablas de datos: solo usuarios con sesión y perfil activo
do $$
declare t text;
begin
  foreach t in array array['app_routes','app_historical_routes','app_trucks','app_staff'] loop
    execute format('drop policy if exists "Acceso temporal de pruebas" on public.%I', t);
    execute format('drop policy if exists "Usuarios activos" on public.%I', t);
    execute format(
      'create policy "Usuarios activos" on public.%I for all to authenticated
         using (public.is_app_user()) with check (public.is_app_user())', t);
  end loop;
end $$;

-- ─── 6. Perfil del PRIMER administrador ─────────────────────────────────
-- Antes de ejecutar este script, crea el acceso del administrador en
-- Supabase → Authentication → Users → Add user → Create new user:
--     Email:    admin@usuarios.discarga.app
--     Password: (la que tú elijas, mínimo 6 caracteres)
--     ✔ Auto Confirm User
-- Este bloque le crea su perfil de administrador con todos los permisos.
-- (Si cambias "admin" por otro nombre, cámbialo en las DOS líneas de abajo.)
insert into public.app_users (id, username, nombre, is_admin, can_delete, permissions, agency_access, created_by)
select
  u.id, 'admin', 'Administrador', true, true,
  '{"dashboard":true,"board":true,"liquidated":true,"trucks":true,"staff":true,"batch":true,
    "canBulkUploadTrucks":true,"canManualAddTrucks":true,"canBulkUploadStaff":true,"canManualAddStaff":true}'::jsonb,
  '"all"'::jsonb,
  'Configuración inicial'
from auth.users u
where u.email = 'admin@usuarios.discarga.app'
on conflict (id) do nothing;

-- Verificación: debe mostrar 1 fila con is_admin = true.
select username, nombre, is_admin, activo from public.app_users;
