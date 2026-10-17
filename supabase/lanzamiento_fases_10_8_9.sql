-- DISCARGA CONTROLER — Lanzamiento: Fases 10 + 8 + 9 en un solo paso
-- (administrador de agencias, recargas y préstamos en su versión actual).
-- Pega TODO en Supabase → SQL Editor → New query → Run. Seguro de repetir.
-- No borra ni cambia rutas, camiones, personal ni usuarios.
alter table public.app_users add column if not exists admin_agencies jsonb not null default '[]'::jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'app_users_admin_agencies_lista') then
    alter table public.app_users
      add constraint app_users_admin_agencies_lista
      check (jsonb_typeof(admin_agencies) = 'array') not valid;
  end if;
end $$;
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
create table if not exists public.app_recargas (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists app_recargas_fecha_idx on public.app_recargas ((data->>'fecha'));
alter table public.app_recargas enable row level security;
drop policy if exists "Ver por agencia" on public.app_recargas;
drop policy if exists "Crear por agencia" on public.app_recargas;
drop policy if exists "Editar por agencia" on public.app_recargas;
drop policy if exists "Eliminar" on public.app_recargas;
drop policy if exists "Usuarios activos" on public.app_recargas;
do $$
declare
  cond text := 'public.is_app_user()';
begin
  if exists (select 1 from pg_proc where proname = 'can_access_agency') then
    cond := 'public.is_app_user() and public.can_access_agency(data->>''agencia'')';
  end if;
  execute format('create policy "Ver por agencia" on public.app_recargas for select to authenticated using (%s)', cond);
  execute format('create policy "Crear por agencia" on public.app_recargas for insert to authenticated with check (%s)', cond);
  execute format('create policy "Editar por agencia" on public.app_recargas for update to authenticated using (%s) with check (%s)', cond, cond);
  execute format(
    'create policy "Eliminar" on public.app_recargas for delete to authenticated using (%s and exists (
       select 1 from public.app_users u where u.id = auth.uid() and u.activo
         and (public.is_agency_admin(data->>''agencia'') or (u.can_delete and coalesce(data->>''estado'', '''') <> ''Autorizada''))))', cond);
end $$;
create or replace function public.dc_recargas_control()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  es_admin boolean;
  limpiar text[] := array['estado', 'autorizadoPor', 'autorizadoEn', 'motivoRechazo'];
begin
  -- Sin usuario (SQL Editor / procesos internos): sin restricción.
  if auth.uid() is null then
    return new;
  end if;
  -- Una recarga AUTORIZADA ya no se modifica (nadie, ni administradores); solo
  -- se puede eliminar (regla "Eliminar"). Guardar sin cambios reales sí pasa.
  if tg_op = 'UPDATE' and coalesce(old.data->>'estado', '') = 'Autorizada'
     and (old.data - 'editadoPor' - 'editadoEn') is distinct from (new.data - 'editadoPor' - 'editadoEn') then
    raise exception 'RECARGA_AUTORIZADA: Una recarga autorizada no se puede modificar. Si está mal, un administrador debe eliminarla y registrarla de nuevo.';
  end if;
  -- Administrador general, o administrador de la agencia de la recarga (la de
  -- antes y la de después, si se cambia de agencia).
  es_admin := public.is_agency_admin(new.data->>'agencia')
    and (tg_op = 'INSERT' or public.is_agency_admin(old.data->>'agencia'));
  if es_admin then
    return new;
  end if;
  -- Guardado sin cambios reales (solo quién/cuándo editó): se deja igual.
  if tg_op = 'UPDATE'
     and (old.data - 'editadoPor' - 'editadoEn') = (new.data - 'editadoPor' - 'editadoEn') then
    return new;
  end if;
  -- Una recarga ya AUTORIZADA solo la modifica un administrador.
  if tg_op = 'UPDATE' and coalesce(old.data->>'estado', '') = 'Autorizada' then
    raise exception 'RECARGA_AUTORIZADA: Solo un administrador (general o de la agencia) puede modificar una recarga autorizada.';
  end if;
  -- Alta o cambio de un usuario no administrador: siempre queda Pendiente.
  new.data := (new.data - limpiar) || jsonb_build_object('estado', 'Pendiente');
  return new;
end $$;
drop trigger if exists trg_recargas_control on public.app_recargas;
create trigger trg_recargas_control
  before insert or update on public.app_recargas
  for each row execute function public.dc_recargas_control();
create sequence if not exists public.app_recargas_correlativo_seq;
create or replace function public.dc_recargas_correlativo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.data ? 'correlativo' then
    new.data := new.data || jsonb_build_object('correlativo', old.data->'correlativo');
  elsif not (new.data ? 'correlativo') or jsonb_typeof(new.data->'correlativo') <> 'number' then
    new.data := new.data || jsonb_build_object('correlativo', nextval('public.app_recargas_correlativo_seq'));
  end if;
  return new;
end $$;
drop trigger if exists trg_recargas_correlativo on public.app_recargas;
create trigger trg_recargas_correlativo
  before insert or update on public.app_recargas
  for each row execute function public.dc_recargas_correlativo();
do $$
declare r record;
begin
  for r in
    select id from public.app_recargas
    where not (data ? 'correlativo')
    order by coalesce(data->>'creadoEn', ''), id
  loop
    update public.app_recargas set data = data || jsonb_build_object('correlativo', nextval('public.app_recargas_correlativo_seq'))
    where id = r.id;
  end loop;
end $$;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_recargas'
  ) then
    alter publication supabase_realtime add table public.app_recargas;
  end if;
end $$;
do $$
begin
  if exists (select 1 from pg_proc where proname = 'audit_changes') then
    drop trigger if exists trg_audit_changes on public.app_recargas;
    create trigger trg_audit_changes after insert or update or delete on public.app_recargas
      for each row execute function public.audit_changes();
  end if;
end $$;
create table if not exists public.app_prestamos (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_prestamos enable row level security;
drop policy if exists "Ver por agencia" on public.app_prestamos;
drop policy if exists "Crear por agencia" on public.app_prestamos;
drop policy if exists "Editar por agencia" on public.app_prestamos;
drop policy if exists "Eliminar" on public.app_prestamos;
do $$
declare
  cond text := 'public.is_app_user()';
begin
  if exists (select 1 from pg_proc where proname = 'can_access_agency') then
    cond := 'public.is_app_user() and (public.can_access_agency(data->>''agenciaOrigen'') or public.can_access_agency(data->>''agenciaDestino''))';
  end if;
  execute format('create policy "Ver por agencia" on public.app_prestamos for select to authenticated using (%s)', cond);
  execute format('create policy "Crear por agencia" on public.app_prestamos for insert to authenticated with check (%s)', cond);
  execute format('create policy "Editar por agencia" on public.app_prestamos for update to authenticated using (%s) with check (%s)', cond, cond);
  execute format(
    'create policy "Eliminar" on public.app_prestamos for delete to authenticated using (%s and exists (
       select 1 from public.app_users u where u.id = auth.uid() and u.activo
         and (public.is_agency_admin(data->>''agenciaOrigen'') or (u.can_delete and coalesce(data->>''estado'', '''') <> ''Autorizado''))))', cond);
end $$;
create or replace function public.dc_prestamos_control()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  es_admin boolean;
  aut text[] := array['estado', 'autorizadoPor', 'autorizadoEn', 'motivoRechazo'];
  dev text[] := array['devuelto', 'devueltoPor', 'devueltoEn', 'comentarioDevolucion', 'editadoPor', 'editadoEn'];
begin
  if auth.uid() is null then
    return new; -- SQL Editor / procesos internos
  end if;
  -- Administrador general, o administrador de la agencia ORIGEN (la de antes y
  -- la de después, si se cambia).
  es_admin := public.is_agency_admin(new.data->>'agenciaOrigen')
    and (tg_op = 'INSERT' or public.is_agency_admin(old.data->>'agenciaOrigen'));
  if es_admin then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.data := (new.data - aut) || jsonb_build_object('estado', 'Pendiente');
    return new;
  end if;
  -- Una devolución registrada solo la puede deshacer un administrador.
  if coalesce((old.data->>'devuelto')::boolean, false) and not coalesce((new.data->>'devuelto')::boolean, false) then
    raise exception 'PRESTAMO_DEVUELTO: Solo un administrador (general o de la agencia origen) puede deshacer una devolución.';
  end if;
  -- Solo cambió la devolución (o quién/cuándo editó): se permite y se conserva
  -- la autorización tal como estaba.
  if (old.data - dev) = (new.data - dev) then
    return new;
  end if;
  new.data := new.data - aut;
  -- Extensión: solo cambia la fecha final (a una posterior) y su historial.
  -- Se permite a cualquiera y el préstamo vuelve a Pendiente.
  if (old.data - dev - aut - 'fechaFin' - 'historialExtensiones') = (new.data - dev - 'fechaFin' - 'historialExtensiones')
     and coalesce(new.data->>'fechaFin', '') > coalesce(old.data->>'fechaFin', '') then
    new.data := new.data || jsonb_build_object('estado', 'Pendiente');
    return new;
  end if;
  if coalesce(old.data->>'estado', '') = 'Autorizado' then
    raise exception 'PRESTAMO_AUTORIZADO: Solo un administrador (general o de la agencia origen) puede modificar un préstamo autorizado (sí puedes registrar la devolución).';
  end if;
  -- Cualquier otro cambio de un usuario no administrador: vuelve a Pendiente.
  new.data := new.data || jsonb_build_object('estado', 'Pendiente');
  return new;
end $$;
drop trigger if exists trg_prestamos_control on public.app_prestamos;
create trigger trg_prestamos_control
  before insert or update on public.app_prestamos
  for each row execute function public.dc_prestamos_control();
create sequence if not exists public.app_prestamos_correlativo_seq;
create or replace function public.dc_prestamos_correlativo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.data ? 'correlativo' then
    new.data := new.data || jsonb_build_object('correlativo', old.data->'correlativo');
  elsif not (new.data ? 'correlativo') or jsonb_typeof(new.data->'correlativo') <> 'number' then
    new.data := new.data || jsonb_build_object('correlativo', nextval('public.app_prestamos_correlativo_seq'));
  end if;
  return new;
end $$;
drop trigger if exists trg_prestamos_correlativo on public.app_prestamos;
create trigger trg_prestamos_correlativo
  before insert or update on public.app_prestamos
  for each row execute function public.dc_prestamos_correlativo();
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_prestamos'
  ) then
    alter publication supabase_realtime add table public.app_prestamos;
  end if;
end $$;
do $$
begin
  if exists (select 1 from pg_proc where proname = 'audit_changes') then
    drop trigger if exists trg_audit_changes on public.app_prestamos;
    create trigger trg_audit_changes after insert or update or delete on public.app_prestamos
      for each row execute function public.audit_changes();
  end if;
end $$;

-- Verificación: las 3 filas deben decir SÍ.
select 'Fase 10 (admin de agencias)' as fase,
       case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'app_users' and column_name = 'admin_agencies') then 'SÍ' else 'NO' end as aplicada
union all
select 'Fase 8 (recargas, versión actual)',
       case when exists (select 1 from pg_proc where proname = 'dc_recargas_control' and prosrc like '%is_agency_admin%' and prosrc like '%no se puede modificar%') then 'SÍ' else 'NO' end
union all
select 'Fase 9 (préstamos, versión actual)',
       case when exists (select 1 from pg_proc where proname = 'dc_prestamos_control' and prosrc like '%historialExtensiones%' and prosrc like '%is_agency_admin%') then 'SÍ' else 'NO' end;
