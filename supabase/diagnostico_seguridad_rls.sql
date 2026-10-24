-- DISCARGA CONTROLER — Auditoría de seguridad y RLS (SOLO LECTURA)
--
-- Cómo correrlo: Supabase → SQL Editor → New query → pega TODO este contenido
-- (no el nombre del archivo) → Run. No cambia ni borra nada.
-- El resultado es UNA tabla: cada fila es una revisión con su estado
--   OK        → bien
--   REVISAR   → no es grave, pero conviene corregir
--   RIESGO    → corregir pronto
-- y el detalle de lo encontrado.

with
tablas as (
  select c.oid, c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as forzado
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
),
pol as (
  select tablename, policyname, roles::text[] as roles, cmd, coalesce(qual, '') as qual, coalesce(with_check, '') as wc
  from pg_policies where schemaname = 'public'
),
fn as (
  select p.oid, p.proname, p.prosecdef, p.proconfig,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
)
select * from (
  -- 1. Tablas sin RLS
  select 1 as orden, 'Tablas sin seguridad por fila (RLS)' as revision,
         case when count(*) = 0 then 'OK' else 'RIESGO' end as estado,
         coalesce(string_agg(relname, ', '), 'Todas las tablas tienen RLS') as detalle
  from tablas where not rls

  union all
  -- 2. Políticas abiertas (true) o para anon / public
  select 2, 'Políticas abiertas a cualquiera (true / anon / public)',
         case when count(*) = 0 then 'OK' else 'RIESGO' end,
         coalesce(string_agg(tablename || ' · ' || policyname || ' (' || cmd || ')', '; '), 'Ninguna')
  from pol
  where qual in ('true', '(true)') or wc in ('true', '(true)') or roles && array['anon', 'public']

  union all
  -- 3. Tablas con RLS pero sin políticas (nadie puede usarlas desde la app)
  select 3, 'Tablas cerradas (RLS sin políticas)', 'REVISAR',
         coalesce(string_agg(t.relname, ', '), 'Ninguna')
  from tablas t where t.rls and not exists (select 1 from pol where pol.tablename = t.relname)

  union all
  -- 4. Tabla vieja con contraseñas en texto
  select 4, 'Tabla antigua app_users_legacy (contraseñas en texto)',
         case when to_regclass('public.app_users_legacy') is null then 'OK' else 'RIESGO' end,
         case when to_regclass('public.app_users_legacy') is null then 'No existe'
              else 'Existe: contiene las contraseñas anteriores. Borrarla (ver propuesta, punto 1).' end

  union all
  -- 5. Funciones SECURITY DEFINER que puede ejecutar "anon" (sin iniciar sesión)
  select 5, 'Funciones privilegiadas ejecutables sin sesión (anon)',
         case when count(*) = 0 then 'OK' else 'REVISAR' end,
         coalesce(string_agg(proname, ', ' order by proname), 'Ninguna')
  from fn where prosecdef and anon_exec

  union all
  -- 6. Funciones sin search_path fijo
  select 6, 'Funciones sin search_path fijo',
         case when count(*) = 0 then 'OK' else 'REVISAR' end,
         coalesce(string_agg(proname, ', ' order by proname), 'Ninguna')
  from fn where not exists (select 1 from unnest(coalesce(proconfig, array[]::text[])) x where x like 'search_path=%')

  union all
  -- 7. Accesos de Auth sin perfil (registros por fuera de la app)
  select 7, 'Cuentas de acceso sin perfil en app_users',
         case when count(*) = 0 then 'OK' else 'RIESGO' end,
         coalesce(string_agg(u.email, ', '), 'Ninguna (no hay registros por fuera de la app)')
  from auth.users u left join public.app_users a on a.id = u.id
  where a.id is null

  union all
  -- 8. Correos que no son del dominio interno
  select 8, 'Cuentas con correo fuera de @usuarios.discarga.app',
         case when count(*) = 0 then 'OK' else 'REVISAR' end,
         coalesce(string_agg(email, ', '), 'Ninguna')
  from auth.users where email not ilike '%@usuarios.discarga.app'

  union all
  -- 9. Administradores generales activos
  select 9, 'Administradores generales activos',
         case when count(*) between 2 and 3 then 'OK' when count(*) = 1 then 'REVISAR' else 'REVISAR' end,
         count(*) || ': ' || coalesce(string_agg(username, ', '), '')
  from public.app_users where is_admin and activo

  union all
  -- 10. Usuarios activos que no entran hace más de 60 días
  select 10, 'Usuarios activos sin entrar hace +60 días',
         case when count(*) = 0 then 'OK' else 'REVISAR' end,
         count(*) || coalesce(': ' || string_agg(username, ', '), '')
  from public.app_users where activo and (last_login is null or last_login < now() - interval '60 days')

  union all
  -- 11. Usuarios con permiso de crear usuarios o de eliminar
  select 11, 'Usuarios no admin con "crear usuarios" o "eliminar datos"', case when count(*) = 0 then 'OK' else 'REVISAR' end,
         coalesce(string_agg(username || case when (permissions->>'canCreateUsers')::boolean then ' [crear usuarios]' else '' end
                                       || case when can_delete then ' [eliminar]' else '' end, ', '), 'Ninguno')
  from public.app_users
  where activo and not is_admin and (coalesce((permissions->>'canCreateUsers')::boolean, false) or can_delete)

  union all
  -- 12. Almacenamiento público
  select 12, 'Carpetas de archivos públicas (Storage)',
         case when count(*) = 0 then 'OK' else 'RIESGO' end,
         coalesce(string_agg(id, ', '), 'Ninguna: los archivos solo se abren con sesión')
  from storage.buckets where public

  union all
  -- 13. Cambios de usuarios/permisos registrados en bitácora
  select 13, 'Bitácora de cambios en usuarios (app_users)',
         case when exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                           where c.relname = 'app_users' and t.tgname = 'trg_audit_usuarios') then 'OK' else 'REVISAR' end,
         case when exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                           where c.relname = 'app_users' and t.tgname = 'trg_audit_usuarios')
              then 'Activa' else 'No se registra quién da o quita permisos (ver propuesta, punto 6)' end

  union all
  -- 14. Respaldo diario
  select 14, 'Respaldo diario programado',
         case when exists (select 1 from pg_extension where extname = 'pg_cron') then 'OK' else 'RIESGO' end,
         case when exists (select 1 from pg_extension where extname = 'pg_cron')
              then 'pg_cron activo (revisa la última fecha en app_backups)' else 'pg_cron no está activo: no hay respaldo automático' end

  union all
  -- 15. Último respaldo
  select 15, 'Último respaldo guardado',
         case when to_regclass('public.app_backups') is null then 'RIESGO'
              when ((xpath('/row/m/text()', query_to_xml('select max(fecha) as m from public.app_backups', false, true, '')))[1]::text)::timestamptz
                   > now() - interval '2 days' then 'OK' else 'RIESGO' end,
         case when to_regclass('public.app_backups') is null then 'No existe la tabla de respaldos'
              else coalesce('Último: ' || to_char(((xpath('/row/m/text()', query_to_xml('select max(fecha) as m from public.app_backups', false, true, '')))[1]::text)::timestamptz
                   at time zone 'America/Guatemala', 'DD/MM/YYYY HH24:MI'), 'Ninguno') end
) r
order by orden;
