-- DISCARGA CONTROLER — Limpieza de colaboradores duplicados en "app_staff"
--
-- CONTEXTO: Supabase solo devolvía 1000 filas por consulta y la app no
-- paginaba, así que cada Carga Masiva de Excel no encontraba a los
-- colaboradores que habían quedado fuera de esas 1000 filas y los volvía a
-- crear con un id nuevo. Resultado (23/09/2026): 13,823 filas para solo
-- 2,604 personas reales (cada persona hasta 7 veces).
--
-- ORDEN IMPORTANTE:
--   1) Primero publica la versión corregida de la app (commit + push y
--      esperar a que Netlify termine), y pide a todos que recarguen la página.
--      Si alguien sigue con la versión vieja abierta, puede volver a subir
--      copias duplicadas.
--   2) Luego ejecuta este script en Supabase → SQL Editor → New query.
--
-- Qué hace: guarda un RESPALDO completo de la tabla y, por cada persona
-- (mismo DPI; si no tiene DPI, mismo nombre), conserva SOLO la copia
-- actualizada más recientemente y elimina las demás.
-- Las rutas guardan a los colaboradores por NOMBRE, no por id, así que
-- ninguna asignación existente se pierde.

-- PASO 1 — Respaldo (si algo sale mal, los datos originales quedan aquí).
create table if not exists app_staff_respaldo_20260923 as
  select * from app_staff;

-- PASO 2 — Vista previa: cuántas filas hay, cuántas personas y cuántas se borrarían.
with ranked as (
  select
    id,
    row_number() over (
      partition by coalesce(
        nullif(nullif(regexp_replace(coalesce(data->>'dpi', ''), '\s', '', 'g'), ''), 'N/A'),
        'NOMBRE:' || upper(trim(coalesce(data->>'nombre', '')))
      )
      order by updated_at desc, id desc
    ) as rn
  from app_staff
)
select
  count(*)                          as filas_actuales,
  count(*) filter (where rn = 1)    as personas_que_quedan,
  count(*) filter (where rn > 1)    as duplicados_a_borrar
from ranked;

-- PASO 3 — Borrar los duplicados (conserva la copia más reciente de cada persona).
with ranked as (
  select
    id,
    row_number() over (
      partition by coalesce(
        nullif(nullif(regexp_replace(coalesce(data->>'dpi', ''), '\s', '', 'g'), ''), 'N/A'),
        'NOMBRE:' || upper(trim(coalesce(data->>'nombre', '')))
      )
      order by updated_at desc, id desc
    ) as rn
  from app_staff
)
delete from app_staff
where id in (select id from ranked where rn > 1);

-- PASO 4 — Verificación: debe dar el mismo número de filas que de personas.
select count(*) as filas, count(distinct data->>'dpi') as dpis_distintos from app_staff;

-- Si todo se ve bien después de unos días de uso, se puede borrar el respaldo:
--   drop table app_staff_respaldo_20260923;
