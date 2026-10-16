-- DISCARGA CONTROLER — Fase 10: Administrador de agencias y correo del usuario
--
-- Agrega a cada usuario (tabla "app_users"):
--   • email           → correo real de la persona. A ese correo se le envía,
--                       automáticamente, el aviso de usuario creado (con el
--                       enlace para crear su contraseña) y el aviso de
--                       contraseña actualizada.
--   • admin_agencies  → lista de agencias de las que es ADMINISTRADOR, p. ej.
--                       ["Naranjo","Villa Nueva"]. En esas agencias puede
--                       eliminar, revertir y aprobar todo lo que requiere
--                       aprobación (recargas, préstamos, cambio de segmento y
--                       de estatus de camión). No puede gestionar usuarios.
--
-- Solo el ADMINISTRADOR GENERAL puede cambiar estos campos (la regla
-- "Solo admin modifica" de app_users ya lo hace cumplir).
--
-- Cómo correrlo: Supabase → SQL Editor → New query → pega TODO el contenido
-- de este archivo → Run. Es seguro correrlo más de una vez. No borra nada.
--
-- DESPUÉS de este, vuelve a correr (en este orden):
--   1. fase8_recargas.sql   (recargas: aprueba también el admin de la agencia)
--   2. fase9_prestamos.sql  (préstamos: aprueba también el admin de la agencia ORIGEN)

-- 1) Columnas nuevas
alter table public.app_users add column if not exists email text;
alter table public.app_users add column if not exists admin_agencies jsonb not null default '[]'::jsonb;

-- Correo con formato básico (o vacío).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'app_users_email_formato') then
    alter table public.app_users
      add constraint app_users_email_formato
      check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$') not valid;
  end if;
end $$;

-- admin_agencies siempre es una lista.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'app_users_admin_agencies_lista') then
    alter table public.app_users
      add constraint app_users_admin_agencies_lista
      check (jsonb_typeof(admin_agencies) = 'array') not valid;
  end if;
end $$;

-- 2) ¿El usuario en sesión es administrador general, o administrador de ESTA agencia?
create or replace function public.is_agency_admin(ag text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_users u
    where u.id = auth.uid() and u.activo
      and (
        u.is_admin
        or (coalesce(ag, '') <> '' and jsonb_typeof(u.admin_agencies) = 'array' and u.admin_agencies ? ag)
      )
  );
$$;
grant execute on function public.is_agency_admin(text) to authenticated;

-- 3) Verificación: debe mostrar las columnas email y admin_agencies.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'app_users' and column_name in ('email', 'admin_agencies');
