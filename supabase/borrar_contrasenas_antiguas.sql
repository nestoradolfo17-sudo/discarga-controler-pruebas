-- DISCARGA CONTROLER — Borrar la tabla antigua de contraseñas (app_users_legacy)
--
-- Al pasar a Supabase Auth (usuarios_auth.sql), la tabla de usuarios anterior
-- se renombró a "app_users_legacy" y se conservó como respaldo. Esa tabla
-- guardaba las CONTRASEÑAS EN TEXTO, legibles desde el panel de Supabase y en
-- exportaciones de la base. La app ya NO la usa para nada.
--
-- Este script la BORRA de forma definitiva. Córrelo solo si estás de acuerdo.
-- No toca usuarios actuales, rutas, camiones, personal ni nada más.
--
-- Cómo correrlo: Supabase → SQL Editor → New query → pega TODO este contenido
-- → Run. Si la tabla no existe, solo avisa y no hace nada.
--
-- Recomendado después: pedir a los usuarios que todavía tengan la misma
-- contraseña de antes que la cambien (desde Usuarios → cambiar contraseña).

do $$
begin
  if to_regclass('public.app_users_legacy') is not null then
    drop table public.app_users_legacy;
    raise notice 'Listo: se borró la tabla app_users_legacy.';
  else
    raise notice 'La tabla app_users_legacy no existe: no hay nada que borrar.';
  end if;
end $$;

select case when to_regclass('public.app_users_legacy') is null then 'SÍ: ya no existe' else 'NO: sigue existiendo' end
  as tabla_de_contrasenas_antiguas_borrada;
