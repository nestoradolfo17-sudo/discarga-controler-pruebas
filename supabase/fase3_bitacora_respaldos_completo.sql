-- DISCARGA CONTROLER — Fase 3 + freno de espacio de Fase 4 (todo en uno)
-- Copia TODO este texto, pégalo en Supabase → SQL Editor → New query → Run.
-- NO borra rutas, camiones, personal ni usuarios. Seguro de repetir.
-- Ejecutar en Supabase → SQL Editor → New query → Run. Seguro de repetir.
--
-- Punto 18: bitácora automática de cambios (quién, qué y cuándo).
-- Punto 19: respaldo diario automático dentro de Supabase (últimos 14 días).

-- ════════════════════════════════════════════════════════════════════════
-- PUNTO 18 — Bitácora de cambios
-- ════════════════════════════════════════════════════════════════════════
create table if not exists public.app_audit_log (
  id            bigserial primary key,
  fecha         timestamptz not null default now(),
  tabla         text not null,
  registro      text not null,
  accion        text not null,            -- INSERT / UPDATE / DELETE
  usuario_id    uuid,
  usuario       text,
  estado_antes  text,
  estado_despues text,
  detalle       jsonb                     -- resumen del cambio (o el registro completo si se borró)
);
create index if not exists app_audit_log_fecha_idx on public.app_audit_log (fecha desc);
create index if not exists app_audit_log_registro_idx on public.app_audit_log (registro);

alter table public.app_audit_log enable row level security;
drop policy if exists "Solo admin ve la bitácora" on public.app_audit_log;
create policy "Solo admin ve la bitácora" on public.app_audit_log
  for select to authenticated using (public.is_app_admin());
-- Nadie la modifica desde la app: solo la escribe el trigger de abajo.

create or replace function public.audit_changes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_user text;
  v_detalle jsonb;
begin
  if tg_op = 'UPDATE' and old.data is not distinct from new.data then
    return new;
  end if;
  select username into v_user from public.app_users where id = auth.uid();

  if tg_op = 'DELETE' then
    v_detalle := old.data;                       -- lo borrado queda guardado completo
  elsif tg_table_name in ('app_routes', 'app_historical_routes') then
    v_detalle := jsonb_build_object(
      'ruta', new.data->>'id',
      'fecha', new.data->>'fecha',
      'agencia', new.data->>'agencia',
      'asignacion', new.data->'asignacion',
      'liquidacion', case when new.data->'liquidacion' is null or jsonb_typeof(new.data->'liquidacion') <> 'object' then null
                     else jsonb_build_object(
                       'cajasEntregadas', new.data->'liquidacion'->'cajasEntregadas',
                       'cajasDevueltas',  new.data->'liquidacion'->'cajasDevueltas',
                       'motivo',          new.data->'liquidacion'->'motivoDevolucion',
                       'cajaAbierta',     new.data->'liquidacion'->'cajaAbierta',
                       'auditor',         new.data->'liquidacion'->'auditor') end);
  else
    v_detalle := jsonb_build_object(
      'nombre', coalesce(new.data->>'nombre', new.data->>'placa'),
      'agencia', new.data->>'agencia',
      'estatus', new.data->>'estatus',
      'motivoNoAsignado', new.data->>'motivoNoAsignado');
  end if;

  insert into public.app_audit_log (tabla, registro, accion, usuario_id, usuario, estado_antes, estado_despues, detalle)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    v_user,
    case when tg_op <> 'INSERT' then old.data->>'estado' end,
    case when tg_op <> 'DELETE' then new.data->>'estado' end,
    v_detalle
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['app_routes','app_historical_routes','app_trucks','app_staff'] loop
    execute format('drop trigger if exists trg_audit_changes on public.%I', t);
    execute format('create trigger trg_audit_changes after insert or update or delete on public.%I
                    for each row execute function public.audit_changes()', t);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════════════
-- PUNTO 19 — Respaldo diario
-- ════════════════════════════════════════════════════════════════════════
-- Guarda cada día una copia completa de las 4 tablas y conserva 14 días.
-- (Complementa, no reemplaza, la descarga manual de respaldo que el
-- administrador tiene en la pantalla Usuarios.)
create table if not exists public.app_backups (
  id        bigserial primary key,
  fecha     timestamptz not null default now(),
  tabla     text not null,
  filas     integer not null,
  datos     jsonb not null
);
alter table public.app_backups enable row level security;
drop policy if exists "Solo admin ve respaldos" on public.app_backups;
create policy "Solo admin ve respaldos" on public.app_backups
  for select to authenticated using (public.is_app_admin());

create or replace function public.take_daily_backup()
returns void language plpgsql security definer set search_path = public as $$
declare t text; n integer; d jsonb;
begin
  -- Freno de espacio (Fase 4): sobre 400 MB no crea respaldo nuevo.
  if pg_database_size(current_database()) < 400 * 1024 * 1024 then
    foreach t in array array['app_routes','app_historical_routes','app_trucks','app_staff'] loop
      execute format('select count(*), coalesce(jsonb_agg(jsonb_build_object(''id'', id, ''data'', data)), ''[]''::jsonb) from public.%I', t)
        into n, d;
      insert into public.app_backups (tabla, filas, datos) values (t, n, d);
    end loop;
  else
    raise notice 'Base de datos sobre 400 MB: se omite el respaldo de hoy para proteger el espacio.';
  end if;
  delete from public.app_backups   where fecha < now() - interval '14 days';
  delete from public.app_audit_log where fecha < now() - interval '180 days';
end $$;
revoke all on function public.take_daily_backup() from public, anon, authenticated;

-- Programación diaria (08:00 UTC = 02:00 hora de Guatemala) con pg_cron.
-- Si pg_cron no está activado, este bloque solo avisa: actívalo en
-- Database → Extensions → pg_cron y vuelve a ejecutar este archivo.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'discarga-respaldo-diario';
  perform cron.schedule('discarga-respaldo-diario', '0 8 * * *', 'select public.take_daily_backup()');
  raise notice 'Respaldo diario programado (02:00 hora de Guatemala).';
exception when others then
  raise notice 'No se pudo programar el respaldo diario (%). Activa pg_cron en Database → Extensions y vuelve a ejecutar.', sqlerrm;
end $$;

-- Primer respaldo ahora mismo.
select public.take_daily_backup();

-- Verificación
select tabla, filas, fecha from public.app_backups order by fecha desc limit 4;

-- Espacio usado después del primer respaldo
select * from public.estado_espacio();
