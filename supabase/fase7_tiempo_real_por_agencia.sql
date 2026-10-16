-- ============================================================================
-- FASE 7 · Tiempo real por agencia
-- ----------------------------------------------------------------------------
-- Para qué: hoy cada usuario conectado recibe en vivo TODOS los cambios de
-- TODAS las agencias. Con 150 usuarios eso multiplica los mensajes de tiempo
-- real y el tráfico de Supabase. Con esta fase, un usuario limitado a ciertas
-- agencias solo recibe los cambios de sus agencias (la app lo hace sola en
-- cuanto detecta la columna nueva; los administradores siguen recibiendo todo).
--
-- Qué hace (NO borra ni cambia datos de rutas, camiones ni personal):
--   1. Agrega a app_routes, app_historical_routes, app_trucks y app_staff una
--      columna "agencia_key" (la agencia en minúsculas y sin espacios, p. ej.
--      "Villa Nueva" -> "villanueva"), con su índice.
--   2. Un trigger la mantiene al día sola en cada alta o cambio.
--   3. La llena en las filas que ya existen.
--
-- CUÁNDO CORRERLO: fuera del horario de operación (noche), con la app cerrada
-- o con pocos usuarios: el paso 3 toca todas las filas una vez y, mientras
-- corre (unos segundos), las tablas quedan bloqueadas para escritura.
--
-- Se puede correr más de una vez sin problema.
-- ============================================================================

create or replace function public.dc_agencia_key(txt text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(coalesce(txt, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

create or replace function public.dc_set_agencia_key()
returns trigger
language plpgsql
as $$
begin
  new.agencia_key := public.dc_agencia_key(new.data->>'agencia');
  return new;
end
$$;

do $$
declare
  t text;
begin
  foreach t in array array['app_routes', 'app_historical_routes', 'app_trucks', 'app_staff'] loop
    -- 1. Columna + índice
    execute format('alter table public.%I add column if not exists agencia_key text', t);
    execute format('create index if not exists %I on public.%I (agencia_key)', t || '_agencia_key_idx', t);

    -- 3. Llenar las filas existentes SIN disparar los demás triggers
    --    (validación de recursos, bitácora, etc.): solo se agrega la clave.
    execute format('alter table public.%I disable trigger user', t);
    execute format(
      'update public.%I set agencia_key = public.dc_agencia_key(data->>''agencia'') '
      'where agencia_key is distinct from public.dc_agencia_key(data->>''agencia'')',
      t
    );
    execute format('alter table public.%I enable trigger user', t);

    -- 2. Trigger que la mantiene al día
    execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_agencia_key', t);
    execute format(
      'create trigger %I before insert or update of data on public.%I '
      'for each row execute function public.dc_set_agencia_key()',
      'trg_' || t || '_agencia_key', t
    );
  end loop;
end
$$;

-- Verificación: cuántas filas por agencia quedaron con su clave (debe salir
-- una fila por agencia y ninguna con agencia_key vacía salvo registros sin agencia).
select 'app_routes' as tabla, agencia_key, count(*) from public.app_routes group by 2
union all
select 'app_trucks', agencia_key, count(*) from public.app_trucks group by 2
union all
select 'app_staff', agencia_key, count(*) from public.app_staff group by 2
order by 1, 2;
