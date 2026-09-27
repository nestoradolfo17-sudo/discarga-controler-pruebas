-- DISCARGA CONTROLER — Fase 1 de correcciones (análisis de errores)
-- Ejecutar en Supabase → SQL Editor → New query → Run.
-- Seguro de repetir: cada paso revisa antes de actuar.

-- ─── PASO A (punto 6): ¿Sigue duplicado el personal? ──────────────────────
-- Si "filas" es mucho mayor que "personas", ejecuta también el archivo
-- supabase/limpiar_duplicados_personal.sql (guarda un respaldo antes de limpiar).
select count(*) as filas,
       count(distinct coalesce(nullif(regexp_replace(coalesce(data->>'dpi',''), '\s', '', 'g'), ''), 'NOMBRE:' || upper(trim(data->>'nombre')))) as personas
from public.app_staff;

-- ─── PASO B (punto 5): borrar la tabla vieja de usuarios ──────────────────
-- Tenía las contraseñas anteriores en texto visible. Ya no la usa la app
-- (los usuarios están en Supabase Auth + app_users). Bórrala cuando ya hayas
-- vuelto a crear a todos los usuarios en la pantalla Usuarios.
drop table if exists public.app_users_legacy;

-- Verificación: debe quedar sin filas.
select table_name from information_schema.tables
where table_schema = 'public' and table_name = 'app_users_legacy';
