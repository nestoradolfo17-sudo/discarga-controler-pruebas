-- DISCARGA CONTROLER — Fase 11: módulo ZR (Control de pagos de zonas rojas)
--
-- Crea lo que necesita el módulo ZR del menú, con las MISMAS reglas que
-- Recargas y Préstamos:
--   • Cada registro de ZR pertenece a una AGENCIA. Cada usuario ve y trabaja
--     solo en ZR de las agencias a las que tiene acceso.
--   • Ver y registrar: usuarios activos con el permiso "ZR" y acceso a la
--     agencia; el administrador general y el administrador de esa agencia
--     también.
--   • Administrador de ZR de una agencia = administrador general o
--     administrador de esa agencia (el mismo de Recargas y Préstamos). Solo él:
--       - autoriza o rechaza solicitudes de pago parcial, anticipos y
--         habilitaciones fuera de plazo;
--       - elimina registros;
--       - cambia los usuarios de ZR y el historial de meses.
--     La base de datos lo hace cumplir, aunque alguien intente saltarse la app.
--   • Almacenamiento privado "zr" para fotos y PDF (máx. 20 MB; imágenes y PDF).
--   • Tiempo real: los cambios aparecen al instante.
--
-- Cómo correrlo: Supabase → SQL Editor → New query → pega TODO → Run.
-- Es seguro correrlo más de una vez. NO toca ni borra ninguna otra tabla.

-- 0) Administrador de agencias (Fase 10). Si ya existe, queda igual.
alter table public.app_users add column if not exists admin_agencies jsonb not null default '[]'::jsonb;
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

-- 1) Tabla (agencia + colección + documento)
create table if not exists public.app_zr (
  agencia    text not null,
  col        text not null,
  doc        text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (agencia, col, doc),
  constraint app_zr_ruta_valida check (
    col ~ '^[A-Za-z0-9_.~:@+-]{1,200}$' and doc ~ '^[A-Za-z0-9_.~:@+-]{1,200}$' and length(trim(agencia)) between 1 and 80)
);

-- 2) ¿Puede usar ZR de esta agencia?
create or replace function public.zr_ve_agencia(ag text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_users u
    where u.id = auth.uid() and u.activo
      and (
        u.is_admin
        or (jsonb_typeof(u.admin_agencies) = 'array' and u.admin_agencies ? ag)
        or (
          coalesce(u.permissions->>'zr', 'false') = 'true'
          and (u.agency_access = '"all"'::jsonb
               or (jsonb_typeof(u.agency_access) = 'array' and u.agency_access ? ag))
        )
      )
  );
$$;

-- ¿Es administrador de ZR en esta agencia? (general o administrador de la agencia)
create or replace function public.zr_es_admin(ag text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_agency_admin(ag);
$$;
grant execute on function public.zr_ve_agencia(text), public.zr_es_admin(text) to authenticated;

-- Documentos que solo cambia un administrador de ZR.
create or replace function public.zr_solo_admin(c text, d text)
returns boolean language sql immutable as $$
  select c = 'historial_meses' or (c = 'config' and d in ('usuarios', 'seguridad'));
$$;

-- 3) Control de autorizaciones (lo hace cumplir la base de datos)
--    Quien NO es administrador de esa agencia:
--      • no puede autorizar, rechazar ni anular solicitudes de pago parcial;
--      • no puede autorizar ni rechazar anticipos ni habilitaciones fuera de plazo;
--      • solo puede registrar un pago "con autorización" si esa solicitud ya
--        está autorizada por un administrador.
--    Además: la base pone la fecha y el usuario de cada cambio.
create or replace function public.zr_control()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  es_admin boolean := public.zr_es_admin(new.agencia);
  o jsonb := case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end;
  n jsonb := new.data;
  sol jsonb;
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' and (new.agencia <> old.agencia or new.col <> old.col or new.doc <> old.doc) then
    raise exception 'No se puede mover un registro de ZR a otra agencia.';
  end if;
  if es_admin or auth.uid() is null then
    return new;  -- administrador (o el propio SQL Editor)
  end if;

  if new.col = 'solicitudes'
     and coalesce(n->>'estado', '') in ('autorizada', 'rechazada', 'anulada')
     and coalesce(n->>'estado', '') is distinct from coalesce(o->>'estado', '') then
    raise exception 'Solo el administrador general o el administrador de la agencia % puede autorizar, rechazar o anular solicitudes.', new.agencia;
  end if;

  if new.col = 'gastos' then
    if coalesce(n->>'estadoAnticipo', '') in ('autorizada', 'rechazada')
       and coalesce(n->>'estadoAnticipo', '') is distinct from coalesce(o->>'estadoAnticipo', '') then
      raise exception 'Solo el administrador general o el administrador de la agencia % puede autorizar o rechazar anticipos.', new.agencia;
    end if;
    if coalesce(n#>>'{ext,estado}', '') in ('autorizada', 'rechazada')
       and coalesce(n#>>'{ext,estado}', '') is distinct from coalesce(o#>>'{ext,estado}', '') then
      raise exception 'Solo el administrador general o el administrador de la agencia % puede habilitar registros fuera de plazo.', new.agencia;
    end if;
  end if;

  if new.col = 'pagos' and jsonb_typeof(n->'autorizacion') = 'object'
     and (n->'autorizacion') is distinct from (o->'autorizacion') then
    select z.data into sol from public.app_zr z
    where z.agencia = new.agencia and z.col = 'solicitudes' and z.doc = n#>>'{autorizacion,solicitudId}';
    if sol is null or coalesce(sol->>'estado', '') not in ('autorizada', 'registrada') then
      raise exception 'El pago parcial necesita una solicitud autorizada por el administrador.';
    end if;
  end if;

  return new;
end $$;
drop trigger if exists trg_zr_control on public.app_zr;
create trigger trg_zr_control before insert or update on public.app_zr
  for each row execute function public.zr_control();

-- 4) Seguridad por filas
alter table public.app_zr enable row level security;
drop policy if exists "ZR ver" on public.app_zr;
drop policy if exists "ZR crear" on public.app_zr;
drop policy if exists "ZR editar" on public.app_zr;
drop policy if exists "ZR eliminar" on public.app_zr;

-- Las contraseñas antiguas de ZR ("config/claves") no se usan: ZR entra con la
-- cuenta de DISCARGA CONTROLER. Nadie puede leer ni guardar ese documento.
create policy "ZR ver" on public.app_zr for select to authenticated
  using (public.zr_ve_agencia(agencia) and not (col = 'config' and doc = 'claves'));
create policy "ZR crear" on public.app_zr for insert to authenticated
  with check (public.zr_ve_agencia(agencia) and not (col = 'config' and doc = 'claves')
              and (not public.zr_solo_admin(col, doc) or public.zr_es_admin(agencia)));
create policy "ZR editar" on public.app_zr for update to authenticated
  using (public.zr_ve_agencia(agencia) and not (col = 'config' and doc = 'claves'))
  with check (public.zr_ve_agencia(agencia) and not (col = 'config' and doc = 'claves')
              and (not public.zr_solo_admin(col, doc) or public.zr_es_admin(agencia)));
create policy "ZR eliminar" on public.app_zr for delete to authenticated
  using (public.zr_es_admin(agencia));

-- Actualizar parte de un documento (une los campos nuevos con los que ya tiene).
create or replace function public.zr_actualizar(p_agencia text, p_col text, p_doc text, p_datos jsonb)
returns boolean language plpgsql security invoker set search_path = public as $$
begin
  update public.app_zr set data = data || coalesce(p_datos, '{}'::jsonb)
  where agencia = p_agencia and col = p_col and doc = p_doc;
  return found;
end $$;
grant execute on function public.zr_actualizar(text, text, text, jsonb) to authenticated;

-- Buscar usuarios de DISCARGA para agregarlos en ZR → Usuarios de una agencia
-- (solo el administrador de esa agencia).
create or replace function public.zr_buscar_usuarios(p_agencia text, q text)
returns table (id uuid, nombre text, usuario text)
language sql stable security definer set search_path = public as $$
  select u.id, coalesce(nullif(u.nombre, ''), u.username), u.username
  from public.app_users u
  where public.zr_es_admin(p_agencia) and u.activo
    and length(trim(coalesce(q, ''))) >= 2
    and (u.nombre ilike '%' || trim(q) || '%' or u.username ilike '%' || trim(q) || '%')
  order by 2
  limit 20;
$$;

-- Nombres de los usuarios (para mostrar quién registró o autorizó).
create or replace function public.zr_nombres(p_agencia text, ids uuid[])
returns table (id uuid, nombre text)
language sql stable security definer set search_path = public as $$
  select u.id, coalesce(nullif(u.nombre, ''), u.username)
  from public.app_users u
  where public.zr_ve_agencia(p_agencia) and u.id = any(ids);
$$;
grant execute on function public.zr_buscar_usuarios(text, text), public.zr_nombres(text, uuid[]) to authenticated;

-- 5) Tiempo real
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_zr') then
    execute 'alter publication supabase_realtime add table public.app_zr';
  end if;
end $$;

-- 6) Almacenamiento privado para fotos y PDF: cada archivo se guarda en la
--    carpeta de su agencia ("Atanasio/abc123…").
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('zr', 'zr', false, 20971520, array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ZR archivos ver" on storage.objects;
drop policy if exists "ZR archivos subir" on storage.objects;
drop policy if exists "ZR archivos eliminar" on storage.objects;
create policy "ZR archivos ver" on storage.objects for select to authenticated
  using (bucket_id = 'zr' and public.zr_ve_agencia(split_part(name, '/', 1)));
create policy "ZR archivos subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'zr' and public.zr_ve_agencia(split_part(name, '/', 1)));
create policy "ZR archivos eliminar" on storage.objects for delete to authenticated
  using (bucket_id = 'zr' and public.zr_es_admin(split_part(name, '/', 1)));

-- Verificación: las 3 filas deben decir SÍ.
notify pgrst, 'reload schema';
select 'Tabla app_zr (por agencia)' as que,
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'app_zr' and column_name = 'agencia') then 'SÍ' else 'NO' end as listo
union all
select 'Almacenamiento zr', case when exists (select 1 from storage.buckets where id = 'zr') then 'SÍ' else 'NO' end
union all
select 'Tiempo real', case when exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'app_zr') then 'SÍ' else 'NO' end;
