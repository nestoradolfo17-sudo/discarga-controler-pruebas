-- DISCARGA CONTROLER — Fase 8: Módulo de Recargas
--
-- Crea la tabla "app_recargas" donde se guarda el registro de recargas
-- (número de ruta, piloto, auxiliares, fecha, tipo Simple/Doble/Triple y
-- comentarios). Mismo formato que las demás tablas: id + data (jsonb).
--
-- Autorización: toda recarga nace "Pendiente" y solo un ADMINISTRADOR puede
-- pasarla a "Autorizada" o "Rechazada" (la base lo hace cumplir, no solo la
-- pantalla). Si un usuario no administrador cambia algo de una recarga ya
-- revisada (Pendiente/Rechazada), vuelve a quedar "Pendiente". Una recarga
-- AUTORIZADA solo la puede modificar o eliminar un administrador.
--
-- Correlativo: cada recarga recibe un número único y consecutivo (REC-000001),
-- lo asigna la base para que nunca se repita aunque registren varios a la vez.
--
-- Cómo correrlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Es seguro correrlo más de una vez. NO toca ni borra ninguna otra tabla.

-- 1) Tabla
create table if not exists public.app_recargas (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists app_recargas_fecha_idx on public.app_recargas ((data->>'fecha'));

-- 2) Seguridad: igual que las demás tablas. Si ya se corrió la Fase 2 (permisos
--    por agencia en la base), cada usuario ve/crea/edita solo las recargas de
--    sus agencias. Si no, basta con ser usuario activo de la app. Eliminar:
--    administrador o usuario con permiso "Puede eliminar".
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
         and (u.is_admin or (u.can_delete and coalesce(data->>''estado'', '''') <> ''Autorizada''))))', cond);
end $$;

-- 2b) Control de autorización (lo hace cumplir la base de datos).
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
  select exists (
    select 1 from public.app_users u where u.id = auth.uid() and u.activo and u.is_admin
  ) into es_admin;
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
    raise exception 'RECARGA_AUTORIZADA: Solo un administrador puede modificar una recarga autorizada.';
  end if;
  -- Alta o cambio de un usuario no administrador: siempre queda Pendiente.
  new.data := (new.data - limpiar) || jsonb_build_object('estado', 'Pendiente');
  return new;
end $$;

drop trigger if exists trg_recargas_control on public.app_recargas;
create trigger trg_recargas_control
  before insert or update on public.app_recargas
  for each row execute function public.dc_recargas_control();

-- 2c) Correlativo único (REC-000001, REC-000002, ...). Lo asigna la base al
--     crear la recarga y nunca cambia después.
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

-- Recargas que ya existían sin correlativo: se numeran por orden de registro.
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

-- 3) Tiempo real (para ver al momento las recargas que registran otros).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_recargas'
  ) then
    alter publication supabase_realtime add table public.app_recargas;
  end if;
end $$;

-- 4) Bitácora de cambios (si ya se corrió la Fase 3).
do $$
begin
  if exists (select 1 from pg_proc where proname = 'audit_changes') then
    drop trigger if exists trg_audit_changes on public.app_recargas;
    create trigger trg_audit_changes after insert or update or delete on public.app_recargas
      for each row execute function public.audit_changes();
  end if;
end $$;

-- 5) Verificación: debe mostrar la tabla con 0 filas (o las que ya existan).
select 'app_recargas' as tabla, count(*) as filas from public.app_recargas;
