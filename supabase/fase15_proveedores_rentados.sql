-- DISCARGA CONTROLER — Fase 15: proveedores de camiones rentados e ID correlativo
-- Copia TODO este texto en Supabase → SQL Editor → New query → Run.
-- NO borra ni cambia camiones, rutas ni personal. Seguro de repetir.
--
-- Qué hace:
--  1) Catálogo de proveedores POR AGENCIA (nombre + código corto de 2 a 5 letras).
--     Lo ven los usuarios de esa agencia; lo amplía quien tiene permiso de
--     Camiones (o es administrador). Solo un administrador lo corrige o borra.
--  2) ID correlativo para camiones rentados: R-<PROVEEDOR>-<AGENCIA>-<NNN>,
--     p. ej. R-TRX-XEL-001. El número lo entrega la base (nunca se repite, aunque
--     dos agencias registren al mismo tiempo) y no se reutiliza si un camión sale.
--  La clave interna del camión (TR-placa) NO cambia: solo el "ID Camión" visible.

-- 0) Permiso por pantalla (igual que en la Fase 14; se crea aquí por si esa fase aún no se corrió).
create or replace function public.dc_tiene_permiso(p text, p_defecto boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select u.is_admin
        or case when jsonb_typeof(u.permissions) = 'object' and u.permissions ? p
                then u.permissions ->> p = 'true' else p_defecto end
    from public.app_users u
    where u.id = auth.uid() and u.activo
  ), false);
$$;
grant execute on function public.dc_tiene_permiso(text, boolean) to authenticated;
revoke execute on function public.dc_tiene_permiso(text, boolean) from public, anon;

-- 1) Código corto de cada agencia (fijo, para que el ID se lea fácil).
create or replace function public.dc_codigo_agencia(p_agencia text)
returns text language sql immutable set search_path = public as $$
  select case lower(regexp_replace(coalesce(p_agencia, ''), '[^A-Za-z0-9]', '', 'g'))
    when 'barberena' then 'BAR'
    when 'chiquimulilla' then 'CHQ'
    when 'coatepeque' then 'CTP'
    when 'coban' then 'CBN'
    when 'cocales' then 'COC'
    when 'cuyotenango' then 'CUY'
    when 'elprogreso' then 'EPG'
    when 'escuintla' then 'ESC'
    when 'jalapa' then 'JAL'
    when 'jutiapa' then 'JUT'
    when 'lascasas' then 'LCS'
    when 'mercadoabierto' then 'MAB'
    when 'mercadosespeciales' then 'MES'
    when 'naranjo' then 'NAR'
    when 'playagrande' then 'PGR'
    when 'polochic' then 'POL'
    when 'salama' then 'SAL'
    when 'sanmarcos' then 'SMA'
    when 'supermercados' then 'SUP'
    when 'tacana' then 'TAC'
    when 'villanueva' then 'VNU'
    when 'xela' then 'XEL'
    when 'lamariposa' then 'LMA'
    when 'plantacuyotenango' then 'PCU'
    when 'atanasio' then 'ATA'
    else upper(left(regexp_replace(coalesce(p_agencia, ''), '[^A-Za-z0-9]', '', 'g') || 'XXX', 3))
  end;
$$;
grant execute on function public.dc_codigo_agencia(text) to authenticated;
revoke execute on function public.dc_codigo_agencia(text) from public, anon;

-- 2) Catálogo de proveedores por agencia
create table if not exists public.app_proveedores (
  id         uuid primary key default gen_random_uuid(),
  agencia    text not null,
  nombre     text not null check (length(trim(nombre)) between 2 and 80),
  codigo     text not null check (codigo ~ '^[A-Z0-9]{2,5}$'),
  activo     boolean not null default true,
  creado_por text,
  creado_el  timestamptz not null default now()
);
create unique index if not exists app_proveedores_codigo_uq on public.app_proveedores (agencia, codigo);
create unique index if not exists app_proveedores_nombre_uq on public.app_proveedores (agencia, lower(trim(nombre)));
alter table public.app_proveedores enable row level security;

drop policy if exists "Proveedores ver" on public.app_proveedores;
drop policy if exists "Proveedores crear" on public.app_proveedores;
drop policy if exists "Proveedores editar" on public.app_proveedores;
drop policy if exists "Proveedores eliminar" on public.app_proveedores;
create policy "Proveedores ver" on public.app_proveedores for select to authenticated
  using (public.is_app_user() and public.can_access_agency(agencia));
create policy "Proveedores crear" on public.app_proveedores for insert to authenticated
  with check (public.is_app_user() and public.can_access_agency(agencia)
              and (public.is_agency_admin(agencia) or public.dc_tiene_permiso('trucks')));
create policy "Proveedores editar" on public.app_proveedores for update to authenticated
  using (public.is_agency_admin(agencia)) with check (public.is_agency_admin(agencia));
create policy "Proveedores eliminar" on public.app_proveedores for delete to authenticated
  using (public.is_agency_admin(agencia));
grant select, insert, update, delete on public.app_proveedores to authenticated;

-- Usuarios de solo consulta (Fase 14): tampoco crean proveedores.
do $$
begin
  if to_regprocedure('public.dc_solo_lectura()') is not null then
    execute 'drop policy if exists "Solo consulta: no crea" on public.app_proveedores';
    execute 'create policy "Solo consulta: no crea" on public.app_proveedores as restrictive for insert to authenticated
             with check (not public.dc_solo_lectura())';
  end if;
end $$;

-- Quién creó cada proveedor (lo pone la base, no la app).
create or replace function public.dc_proveedor_creador()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.codigo := upper(trim(new.codigo));
  new.nombre := trim(new.nombre);
  if tg_op = 'INSERT' then
    select coalesce(nullif(nombre, ''), username) into new.creado_por from public.app_users where id = auth.uid();
    new.creado_el := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_proveedor_creador on public.app_proveedores;
create trigger trg_proveedor_creador before insert or update on public.app_proveedores
  for each row execute function public.dc_proveedor_creador();

-- 3) Contador por agencia + proveedor (nadie lo toca desde la app)
create table if not exists public.app_correlativos_rentados (
  agencia text not null,
  codigo  text not null,
  ultimo  integer not null default 0,
  primary key (agencia, codigo)
);
alter table public.app_correlativos_rentados enable row level security;

-- Entrega el siguiente ID (R-TRX-XEL-001). Solo para usuarios de esa agencia
-- con permiso de Camiones (o administradores) y un proveedor del catálogo.
create or replace function public.dc_siguiente_id_rentado(p_agencia text, p_codigo text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_cod text := upper(trim(coalesce(p_codigo, '')));
  v_n   integer;
begin
  if auth.uid() is null or not public.is_app_user() or not public.can_access_agency(p_agencia) then
    raise exception 'NO_AUTORIZADO: sin acceso a la agencia %.', p_agencia;
  end if;
  if not (public.is_agency_admin(p_agencia) or public.dc_tiene_permiso('trucks')
          or public.dc_tiene_permiso('canManualAddTrucks', true)) then
    raise exception 'NO_AUTORIZADO: se necesita permiso de Camiones.';
  end if;
  if not exists (select 1 from public.app_proveedores where agencia = p_agencia and codigo = v_cod and activo) then
    raise exception 'PROVEEDOR_NO_EXISTE: el proveedor % no está en el catálogo de %.', v_cod, p_agencia;
  end if;
  insert into public.app_correlativos_rentados as c (agencia, codigo, ultimo)
  values (p_agencia, v_cod, 1)
  on conflict (agencia, codigo) do update set ultimo = c.ultimo + 1
  returning ultimo into v_n;
  return 'R-' || v_cod || '-' || public.dc_codigo_agencia(p_agencia) || '-' || lpad(v_n::text, 3, '0');
end $$;
revoke all on function public.dc_siguiente_id_rentado(text, text) from public, anon;
grant execute on function public.dc_siguiente_id_rentado(text, text) to authenticated;

-- Respaldo diario: incluir el catálogo (si la función de respaldo ya lo recorre
-- por nombre, no hace falta; queda en el respaldo manual de la app).

-- Verificación (debe decir SÍ)
select 'Catálogo de proveedores' as revision,
       case when to_regclass('public.app_proveedores') is not null then 'SÍ' else 'NO' end as activo
union all
select 'Generador de ID para rentados',
       case when to_regprocedure('public.dc_siguiente_id_rentado(text,text)') is not null then 'SÍ' else 'NO' end;
