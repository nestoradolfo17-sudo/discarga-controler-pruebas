-- DISCARGA CONTROLER — Diagnóstico: ¿qué fases están aplicadas en esta base?
--
-- SOLO LEE. No crea, no cambia y no borra nada. Se puede correr las veces que
-- quieras, en producción o en pruebas.
-- Cómo: Supabase → SQL Editor → New query → pega TODO → Run.
-- Resultado 1: una fila por fase con "SÍ" / "NO".
-- Resultado 2: tablas de la app SIN seguridad por filas (RLS); debe salir vacío.

with fn as (
  select p.proname, p.prosrc
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
)
select orden, fase, que_revisa, case when ok then 'SÍ' else 'NO' end as aplicada
from (values
  (1,  'Usuarios (usuarios_auth.sql)', 'Perfiles y función de administrador',
        exists (select 1 from fn where proname = 'is_app_admin')),
  (2,  'Fase 2 (fase2_seguridad.sql)', 'Permisos por agencia y de eliminar EN LA BASE',
        exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'app_routes' and policyname = 'Ver por agencia')),
  (3,  'Fase 2 / 6', 'Bloqueo de camión o persona en dos rutas a la vez',
        exists (select 1 from pg_trigger where tgname = 'trg_check_route_resources' and not tgisinternal)),
  (4,  'Fase 3 (bitácora y respaldos)', 'Bitácora de cambios (quién, qué, cuándo)',
        exists (select 1 from pg_trigger where tgname = 'trg_audit_changes' and tgrelid = to_regclass('public.app_routes'))),
  (5,  'Fase 3 (bitácora y respaldos)', 'Respaldo diario dentro de Supabase',
        exists (select 1 from fn where proname = 'take_daily_backup')),
  (6,  'Fase 6 (asignación por fecha)', 'Cada ruta pertenece a la jornada de su fecha',
        exists (select 1 from fn where proname = 'route_jornada')),
  (7,  'Fase 7 (tiempo real por agencia)', 'Columna agencia_key en rutas',
        exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'app_routes' and column_name = 'agencia_key')),
  (8,  'Fase 8 (recargas)', 'Tabla de recargas',
        to_regclass('public.app_recargas') is not null),
  (9,  'Fase 8 (versión actual)', 'Recargas: aprueba también el admin de la agencia',
        exists (select 1 from fn where proname = 'dc_recargas_control' and prosrc like '%is_agency_admin%' and prosrc like '%no se puede modificar%')),
  (10, 'Fase 9 (préstamos)', 'Tabla de préstamos',
        to_regclass('public.app_prestamos') is not null),
  (11, 'Fase 9 (versión actual)', 'Préstamos: extensión y admin de la agencia origen',
        exists (select 1 from fn where proname = 'dc_prestamos_control' and prosrc like '%historialExtensiones%' and prosrc like '%is_agency_admin%')),
  (12, 'Fase 10 (admin de agencias)', 'Columna admin_agencies en usuarios',
        exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'app_users' and column_name = 'admin_agencies')),
  (13, 'Fase 11 (módulo ZR)', 'Base de datos de ZR por agencia (tabla app_zr)',
        exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'app_zr' and column_name = 'agencia')),
  (14, 'Fase 11 (módulo ZR)', 'ZR: autorizaciones controladas por la base',
        exists (select 1 from pg_trigger where tgname = 'trg_zr_control' and not tgisinternal)),
  (15, 'Fase 11 (módulo ZR)', 'ZR: almacenamiento de fotos y PDF',
        exists (select 1 from storage.buckets where id = 'zr'))
) as t(orden, fase, que_revisa, ok)
order by orden;

-- Tablas de la app sin seguridad por filas (debe salir vacío).
select c.relname as tabla_sin_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'app_%' and not c.relrowsecurity;

-- Administradores activos (conviene que haya 2: el principal y uno de respaldo).
select username, nombre, last_login
from public.app_users
where is_admin and activo
order by username;
