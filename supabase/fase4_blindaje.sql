-- DISCARGA CONTROLER — Fase 4: Blindaje de rendimiento y espacio
-- Ejecutar en Supabase → SQL Editor → New query → pegar → Run.
-- NO borra rutas, camiones, personal ni usuarios. Es seguro ejecutarlo varias veces.
--
-- Qué hace:
--   1) Índices en updated_at → la carga del historial (últimos 45 días) deja de
--      recorrer toda la tabla. Menos CPU, menos tiempo de espera en las tablets.
--   2) Función public.estado_espacio() → consulta rápida del % usado del plan Free.
--   3) Respaldo diario "con freno": si la base supera 400 MB (80 % del límite Free)
--      NO crea un respaldo nuevo (para no llenar la base y que la app deje de guardar),
--      solo conserva los existentes. La retención sigue igual que en Fase 3
--      (14 días de respaldos, 180 días de bitácora).

-- 1) Índices -----------------------------------------------------------------
create index if not exists app_routes_updated_at_idx            on public.app_routes (updated_at desc);
create index if not exists app_historical_routes_updated_at_idx on public.app_historical_routes (updated_at desc);

-- 2) Estado del espacio ------------------------------------------------------
create or replace function public.estado_espacio()
returns table (mb_usados numeric, pct_limite_free numeric, alerta text)
language sql stable security definer set search_path = public as $$
  select
    round(pg_database_size(current_database()) / 1024.0 / 1024.0, 1),
    round(pg_database_size(current_database()) / (500 * 1024.0 * 1024.0) * 100, 1),
    case
      when pg_database_size(current_database()) > 450 * 1024 * 1024 then 'CRÍTICO: más de 450 MB — actuar hoy'
      when pg_database_size(current_database()) > 350 * 1024 * 1024 then 'ATENCIÓN: más de 350 MB — planificar limpieza o plan Pro'
      else 'OK'
    end;
$$;
revoke all on function public.estado_espacio() from public, anon;
grant execute on function public.estado_espacio() to authenticated;

-- 3) Respaldo diario con freno de espacio (solo si la Fase 3 ya está instalada)
do $$
begin
  if to_regclass('public.app_backups') is null then
    raise notice 'Fase 3 no instalada: se omite el ajuste del respaldo diario.';
    return;
  end if;

  execute $f$
  create or replace function public.take_daily_backup()
  returns void language plpgsql security definer set search_path = public as $b$
  declare t text; n integer; d jsonb;
  begin
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
  end $b$;
  $f$;
  raise notice 'Respaldo diario actualizado con freno de espacio (400 MB).';
end $$;

-- Verificación
select * from public.estado_espacio();

-- ---------------------------------------------------------------------------
-- OPCIONAL (NO se ejecuta: está comentado). Solo si el diagnóstico muestra que
-- app_backups o app_audit_log ocupan mucho espacio. BORRA respaldos/bitácora
-- antiguos (NO borra rutas). Antes, descarga un respaldo desde la app.
-- Para usarlo: quita los dos guiones "--" del inicio de cada línea y Run.
--
-- delete from public.app_backups   where fecha < now() - interval '7 days';
-- delete from public.app_audit_log where fecha < now() - interval '90 days';
