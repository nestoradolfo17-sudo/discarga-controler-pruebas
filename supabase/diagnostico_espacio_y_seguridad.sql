-- DISCARGA CONTROLER — Diagnóstico de espacio y seguridad (SOLO LECTURA)
-- Ejecutar en Supabase → SQL Editor → New query → pegar → Run.
-- No modifica ni borra nada: solo consulta. Se puede ejecutar cuantas veces se quiera.
-- Cada bloque devuelve una tabla de resultados (en el SQL Editor aparecen como pestañas).

-- 1) Tamaño total de la base de datos (límite del plan Free: 500 MB)
select
  pg_size_pretty(pg_database_size(current_database())) as tamano_total,
  round(pg_database_size(current_database()) / 1024.0 / 1024.0, 1) as mb_usados,
  round(pg_database_size(current_database()) / (500 * 1024.0 * 1024.0) * 100, 1) as pct_del_limite_free_500mb;

-- 2) Tamaño y filas por tabla de la app (incluye índices y datos comprimidos)
select
  c.relname as tabla,
  pg_size_pretty(pg_total_relation_size(c.oid)) as tamano_total,
  round(pg_total_relation_size(c.oid) / 1024.0 / 1024.0, 2) as mb,
  c.reltuples::bigint as filas_aprox
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc;

-- 3) Respaldos diarios guardados dentro de la base (pueden ocupar mucho espacio)
select
  count(*) as respaldos_guardados,
  min(fecha) as mas_antiguo,
  max(fecha) as mas_reciente,
  pg_size_pretty(sum(pg_column_size(datos))::bigint) as espacio_de_los_respaldos
from public.app_backups;
-- (Si da error "relation app_backups does not exist", la Fase 3 aún no se ha ejecutado.)

-- 4) ¿Está programado el respaldo diario? (requiere la extensión pg_cron)
select jobname, schedule, active
from cron.job
where jobname = 'discarga-respaldo-diario';
-- (Si da error "schema cron does not exist", pg_cron no está activado: no hay respaldo automático.)

-- 5) Seguridad: ¿todas las tablas tienen RLS (seguridad por fila) activado?
select c.relname as tabla, c.relrowsecurity as rls_activado
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;

-- 6) Seguridad: políticas activas. Si aparece alguna llamada
--    "Acceso temporal de pruebas" o con roles {anon}, la base está ABIERTA.
select tablename as tabla, policyname as politica, roles, cmd as operacion
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 7) Usuarios de la app (cuántos activos / administradores)
select
  count(*) as usuarios,
  count(*) filter (where activo) as activos,
  count(*) filter (where is_admin and activo) as administradores_activos
from public.app_users;
