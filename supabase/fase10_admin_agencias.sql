-- DISCARGA CONTROLER — Fase 10: Administrador de agencias
--
-- Agrega a cada usuario (tabla "app_users") la columna:
--   • admin_agencies  → lista de agencias de las que es ADMINISTRADOR, p. ej.
--                       ["Naranjo","Villa Nueva"]. En esas agencias puede
--                       eliminar, revertir y aprobar todo lo que requiere
--                       aprobación (recargas, préstamos que salen de esa
--                       agencia, cambio de segmento y de estatus de camión).
--                       No puede gestionar usuarios.
--
-- Solo el ADMINISTRADOR GENERAL puede cambiar este campo (la regla
-- "Solo admin modifica" de app_users ya lo hace cumplir).
--
-- Cómo correrlo: Supabase → SQL Editor → New query → pega TODO el contenido
-- de este archivo → Run. Es seguro correrlo más de una vez. No borra nada.
--
-- DESPUÉS de este, vuelve a correr (en este orden):
--   1. fase8_recargas.sql   (recargas: aprueba también el admin de la agencia)
--   2. fase9_prestamos.sql  (préstamos: aprueba también el admin de la agencia ORIGEN)

-- 1) Columna nueva (siempre una lista)
alter table public.app_users add column if not exists admin_agencies jsonb not null default '[]'::jsonb;

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

-- 3) Verificación: debe mostrar la columna admin_agencies.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'app_users' and column_name = 'admin_agencies';
