-- DISCARGA CONTROLER — Fase 11: módulo ZR (Control de pagos de zonas rojas)
--
-- Crea lo que necesita el módulo ZR del menú:
--   • Tabla "app_zr": todos los datos de ZR (pagos, presupuestos, solicitudes,
--     vales, reintegros, gastos, pilotos, usuarios de ZR, historial…).
--   • Almacenamiento privado "zr" para fotos y PDF de evidencia (máx. 20 MB;
--     solo imágenes y PDF). Solo los ven usuarios con acceso a ZR.
--   • Reglas de la base de datos:
--       - Ver y registrar: usuarios activos con el permiso "ZR" (o administradores).
--       - Eliminar, cambiar usuarios/seguridad de ZR y el historial de meses:
--         solo administradores de ZR (administrador general de DISCARGA o
--         marcado como "Administrador" dentro de ZR → Usuarios).
--   • Tiempo real: los cambios aparecen al instante a todos.
--
-- Cómo correrlo: Supabase → SQL Editor → New query → pega TODO → Run.
-- Es seguro correrlo más de una vez. NO toca ni borra ninguna otra tabla.

-- 1) Tabla
create table if not exists public.app_zr (
  col        text not null,
  doc        text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (col, doc),
  constraint app_zr_ruta_valida check (col ~ '^[A-Za-z0-9_.~:@+-]{1,200}$' and doc ~ '^[A-Za-z0-9_.~:@+-]{1,200}$')
);

-- Quién y cuándo (lo pone la base, no el navegador).
create or replace function public.zr_sello()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists trg_zr_sello on public.app_zr;
create trigger trg_zr_sello before insert or update on public.app_zr
  for each row execute function public.zr_sello();

-- 2) ¿Tiene acceso a ZR? (administrador general o permiso "zr")
create or replace function public.zr_acceso()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_users u
    where u.id = auth.uid() and u.activo
      and (u.is_admin or coalesce(u.permissions->>'zr', 'false') = 'true')
  );
$$;

-- ¿Es administrador de ZR? (administrador general, o "Administrador" en ZR → Usuarios)
create or replace function public.zr_es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_app_admin()
    or (
      public.zr_acceso()
      and exists (
        select 1
        from public.app_zr z,
             jsonb_array_elements(case when jsonb_typeof(z.data->'lista') = 'array' then z.data->'lista' else '[]'::jsonb end) e
        where z.col = 'config' and z.doc = 'usuarios'
          and e->>'id' = auth.uid()::text
          and coalesce(e->>'admin', 'false') = 'true'
      )
    );
$$;
grant execute on function public.zr_acceso(), public.zr_es_admin() to authenticated;

-- Documentos que solo cambia un administrador de ZR.
create or replace function public.zr_solo_admin(c text, d text)
returns boolean language sql immutable as $$
  select c = 'historial_meses' or (c = 'config' and d in ('usuarios', 'seguridad'));
$$;

-- 3) Seguridad por filas
alter table public.app_zr enable row level security;
drop policy if exists "ZR ver" on public.app_zr;
drop policy if exists "ZR crear" on public.app_zr;
drop policy if exists "ZR editar" on public.app_zr;
drop policy if exists "ZR eliminar" on public.app_zr;

-- Las contraseñas antiguas de ZR ("config/claves") no se usan: ZR entra con la
-- cuenta de DISCARGA CONTROLER. Nadie puede leer ni guardar ese documento.
create policy "ZR ver" on public.app_zr for select to authenticated
  using (public.zr_acceso() and not (col = 'config' and doc = 'claves'));
create policy "ZR crear" on public.app_zr for insert to authenticated
  with check (public.zr_acceso() and not (col = 'config' and doc = 'claves')
              and (not public.zr_solo_admin(col, doc) or public.zr_es_admin()));
create policy "ZR editar" on public.app_zr for update to authenticated
  using (public.zr_acceso() and not (col = 'config' and doc = 'claves'))
  with check (public.zr_acceso() and not (col = 'config' and doc = 'claves')
              and (not public.zr_solo_admin(col, doc) or public.zr_es_admin()));
create policy "ZR eliminar" on public.app_zr for delete to authenticated
  using (public.zr_es_admin());

-- Actualizar parte de un documento (une los campos nuevos con los que ya tiene).
create or replace function public.zr_actualizar(p_col text, p_doc text, p_datos jsonb)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  update public.app_zr set data = data || coalesce(p_datos, '{}'::jsonb)
  where col = p_col and doc = p_doc;
  return found;
end $$;
grant execute on function public.zr_actualizar(text, text, jsonb) to authenticated;

-- Buscar usuarios de DISCARGA para agregarlos en ZR → Usuarios (solo admin de ZR).
create or replace function public.zr_buscar_usuarios(q text)
returns table (id uuid, nombre text, usuario text)
language sql stable security definer set search_path = public as $$
  select u.id, coalesce(nullif(u.nombre, ''), u.username), u.username
  from public.app_users u
  where public.zr_es_admin() and u.activo
    and length(trim(coalesce(q, ''))) >= 2
    and (u.nombre ilike '%' || trim(q) || '%' or u.username ilike '%' || trim(q) || '%')
  order by 2
  limit 20;
$$;

-- Nombres de los usuarios (para mostrar quién registró o autorizó).
create or replace function public.zr_nombres(ids uuid[])
returns table (id uuid, nombre text)
language sql stable security definer set search_path = public as $$
  select u.id, coalesce(nullif(u.nombre, ''), u.username)
  from public.app_users u
  where public.zr_acceso() and u.id = any(ids);
$$;
grant execute on function public.zr_buscar_usuarios(text), public.zr_nombres(uuid[]) to authenticated;

-- 4) Tiempo real
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_zr') then
    execute 'alter publication supabase_realtime add table public.app_zr';
  end if;
end $$;

-- 5) Almacenamiento privado para fotos y PDF
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('zr', 'zr', false, 20971520, array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ZR archivos ver" on storage.objects;
drop policy if exists "ZR archivos subir" on storage.objects;
drop policy if exists "ZR archivos eliminar" on storage.objects;
create policy "ZR archivos ver" on storage.objects for select to authenticated
  using (bucket_id = 'zr' and public.zr_acceso());
create policy "ZR archivos subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'zr' and public.zr_acceso());
create policy "ZR archivos eliminar" on storage.objects for delete to authenticated
  using (bucket_id = 'zr' and public.zr_es_admin());

-- Verificación: las 3 filas deben decir SÍ.
notify pgrst, 'reload schema';
select 'Tabla app_zr' as que, case when to_regclass('public.app_zr') is not null then 'SÍ' else 'NO' end as listo
union all
select 'Almacenamiento zr', case when exists (select 1 from storage.buckets where id = 'zr') then 'SÍ' else 'NO' end
union all
select 'Tiempo real', case when exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'app_zr') then 'SÍ' else 'NO' end;
