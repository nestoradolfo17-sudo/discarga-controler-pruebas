-- DISCARGA CONTROLER — Fase 9: Préstamo de personal y camiones entre agencias
--
-- Crea la tabla "app_prestamos" (mismo formato que las demás: id + data jsonb).
-- Un préstamo mueve por un rango de fechas pilotos, auxiliares y/o camiones de
-- una agencia (origen) a otra (destino).
--
-- Reglas que hace cumplir la base de datos:
--  • Cualquier usuario activo puede crear un préstamo: siempre nace "Pendiente".
--  • Solo un ADMINISTRADOR lo pasa a "Autorizado" o "Rechazado".
--  • Cualquier usuario puede registrar la DEVOLUCIÓN (aunque esté autorizado).
--  • Un préstamo AUTORIZADO solo lo modifica o elimina un administrador
--    (salvo registrar la devolución).
--  • Correlativo único PRE-000001, PRE-000002, ... (no se repite ni cambia).
--
-- Cómo correrlo: Supabase → SQL Editor → New query → pega todo → Run.
-- Es seguro correrlo más de una vez. NO toca ni borra ninguna otra tabla.

-- 1) Tabla
create table if not exists public.app_prestamos (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- 2) Seguridad. Lo ven y editan los usuarios de la agencia ORIGEN o DESTINO
--    (si ya se corrió la Fase 2); si no, cualquier usuario activo de la app.
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
         and (u.is_admin or (u.can_delete and coalesce(data->>''estado'', '''') <> ''Autorizado''))))', cond);
end $$;

-- 3) Control de autorización y devolución.
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
  select exists (
    select 1 from public.app_users u where u.id = auth.uid() and u.activo and u.is_admin
  ) into es_admin;
  if es_admin then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.data := (new.data - aut) || jsonb_build_object('estado', 'Pendiente');
    return new;
  end if;

  -- Una devolución registrada solo la puede deshacer un administrador.
  if coalesce((old.data->>'devuelto')::boolean, false) and not coalesce((new.data->>'devuelto')::boolean, false) then
    raise exception 'PRESTAMO_DEVUELTO: Solo un administrador puede deshacer una devolución.';
  end if;

  -- Solo cambió la devolución (o quién/cuándo editó): se permite y se conserva
  -- la autorización tal como estaba.
  if (old.data - dev) = (new.data - dev) then
    return new;
  end if;
  new.data := new.data - aut;
  if coalesce(old.data->>'estado', '') = 'Autorizado' then
    raise exception 'PRESTAMO_AUTORIZADO: Solo un administrador puede modificar un préstamo autorizado (sí puedes registrar la devolución).';
  end if;
  -- Cualquier otro cambio de un usuario no administrador: vuelve a Pendiente.
  new.data := new.data || jsonb_build_object('estado', 'Pendiente');
  return new;
end $$;

drop trigger if exists trg_prestamos_control on public.app_prestamos;
create trigger trg_prestamos_control
  before insert or update on public.app_prestamos
  for each row execute function public.dc_prestamos_control();

-- 4) Correlativo único PRE-000001 (lo asigna la base y nunca cambia).
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

-- 5) Tiempo real.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_prestamos'
  ) then
    alter publication supabase_realtime add table public.app_prestamos;
  end if;
end $$;

-- 6) Bitácora de cambios (si ya se corrió la Fase 3).
do $$
begin
  if exists (select 1 from pg_proc where proname = 'audit_changes') then
    drop trigger if exists trg_audit_changes on public.app_prestamos;
    create trigger trg_audit_changes after insert or update or delete on public.app_prestamos
      for each row execute function public.audit_changes();
  end if;
end $$;

-- 7) Verificación: debe mostrar la tabla con 0 filas (o las que ya existan).
select 'app_prestamos' as tabla, count(*) as filas from public.app_prestamos;
