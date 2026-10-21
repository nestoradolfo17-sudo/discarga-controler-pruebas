# Usuarios y permisos — DISCARGA CONTROLER

## Cómo funciona

| Pieza | Qué hace |
|---|---|
| **Supabase Auth** | Guarda las contraseñas cifradas. Nadie las puede ver, ni el administrador. |
| **Tabla `app_users`** | Perfil de cada usuario: usuario, nombre, administrador, permisos por pantalla, permiso de eliminar, agencias, activo, último acceso. **Sin contraseñas.** |
| **Función `admin-users`** | Única forma de **crear, renombrar, cambiar contraseña o eliminar** usuarios. Corre en el servidor de Supabase y rechaza a cualquiera que no sea administrador. |
| **Reglas de la base (RLS)** | Rutas, camiones, personal e historial solo se pueden leer/modificar con sesión iniciada y perfil **activo**. Un usuario normal solo ve su propio perfil; el administrador ve todos. Nadie puede darse permisos a sí mismo. Siempre debe quedar al menos un administrador activo. |

- No hay registro público: **solo el administrador crea usuarios**, desde la pantalla **Usuarios** de la app.
- Los usuarios entran con su **nombre de usuario** (ej. `jperez`) y contraseña. Internamente Supabase usa `jperez@usuarios.discarga.app`, pero nadie tiene que escribir eso ni se envían correos.
- Formato de usuario: 3 a 30 caracteres, minúsculas, números, `.` `-` `_` (sin espacios ni tildes). Contraseña: mínimo 8 caracteres (las contraseñas actuales de 6 siguen funcionando hasta que se cambien).

### Permisos por usuario (pantalla Usuarios)

| Permiso | Controla |
|---|---|
| Dashboard, Tablero de Rutas, Rutas Liquidadas, Camiones, Personal, Carga Masiva | Qué pantallas ve |
| Subir Excel de Camiones / Personal | Carga masiva de recursos |
| Puede eliminar | Borrar rutas, camiones, personal |
| Agencias | Todas, o solo las que marques |
| Administrador de agencias | En las agencias marcadas: eliminar, revertir y **aprobar** (recargas, préstamos que salen de esa agencia, cambio de segmento y de estatus de camión). No gestiona usuarios. Solo lo asigna el administrador general. |
| Administrador | Todo lo anterior en todas las agencias + gestionar usuarios |

Los cambios de permisos se aplican al instante, incluso si el usuario ya está conectado. Si eliminas un usuario, se le cierra la sesión.

---

## Instalación (una sola vez, en este orden)

> ⚠️ Haz los pasos 1–5 **seguidos** y en el mismo rato. Después del paso 3 la versión vieja de la app deja de poder leer datos hasta que Netlify publique la nueva (paso 5).

### 1. Desactivar el registro público
Supabase → **Authentication → Sign In / Providers** → apaga **"Allow new users to sign up"** → Save.
(Deja el proveedor **Email** activado.)

### 2. Crear el acceso del primer administrador
Supabase → **Authentication → Users → Add user → Create new user**
- Email: `admin@usuarios.discarga.app`
- Password: la que elijas (mínimo 6)
- ✔ **Auto Confirm User**

### 3. Ejecutar el SQL
Supabase → **SQL Editor → New query** → pega todo `supabase/usuarios_auth.sql` → **Run**.
Al final debe mostrar una fila: `admin | Administrador | true | true`.

### 4. Publicar la función `admin-users`
Supabase → **Edge Functions → Deploy a new function → Via Editor**
- Nombre: `admin-users` (exacto)
- Borra el ejemplo y pega todo `supabase/functions/admin-users/index.ts`
- **Deploy**
- En los detalles de la función → apaga **"Enforce JWT verification"** / **"Verify JWT"** (la función ya verifica ella misma que seas administrador) → Save.

Si al crear un usuario la app muestra *"Falta configurar la llave secreta"* o *"Invalid API key"*:
Edge Functions → **Secrets** → Add new secret → Nombre `SERVICE_KEY`, Valor: tu llave **secreta** (Project Settings → API Keys → `sb_secret_...` o `service_role`). **Nunca** pongas esa llave en la app ni en Netlify.

### 5. Publicar la app
GitHub Desktop → commit + push → esperar a Netlify (1–3 min) → abrir https://discargacontroler.netlify.app/ con **Ctrl+F5**.

### 6. Entrar y crear a los demás
- Entra con usuario `admin` y la contraseña del paso 2.
- Pantalla **Usuarios** → crea a cada persona con sus permisos y agencias.
- Los usuarios anteriores **no se migran** (tenían la contraseña en texto visible). Hay que volver a crearlos; la tabla vieja queda cerrada como respaldo en `app_users_legacy`.

---

## Administrador de agencias (Fase 10)

1. Supabase → **SQL Editor → New query** → pega TODO el contenido de `supabase/fase10_admin_agencias.sql` → **Run**. Después vuelve a correr, igual, `fase8_recargas.sql` y `fase9_prestamos.sql`.
2. Edge Functions → `admin-users` → **Code** → reemplaza todo por el nuevo `supabase/functions/admin-users/index.ts` → **Deploy**.
3. En **Usuarios**, el administrador general marca las agencias en "Administrador de agencias" (al crear el usuario o en la columna *Admin. de agencias*). Solo puede administrar agencias que también puede ver.

## Módulo ZR (Fase 11)

1. Supabase → **SQL Editor → New query** → pega TODO el contenido de `supabase/fase11_zr.sql` → **Run**. Al final deben salir 3 filas con **SÍ**.
2. (Una sola vez) para traer los datos de la versión anterior de Control ZR: pega TODO `zr_datos_iniciales.sql` → **Run**.
3. En **Usuarios** de DISCARGA CONTROLER, activa el permiso **ZR** a cada persona que use el módulo (el administrador general ya lo tiene).
4. Dentro de ZR → **Usuarios** se asignan los accesos de ZR (Operación, Análisis, Configuración, Carga) y quién es administrador de ZR.

- ZR entra con el **mismo usuario y contraseña** de DISCARGA CONTROLER (ya no tiene contraseñas propias).
- Para eliminar o autorizar dentro de ZR se confirma con la contraseña de DISCARGA CONTROLER.
- Fotos y PDF: almacenamiento privado `zr` (máx. 20 MB, solo imágenes y PDF).
- Los datos de ZR no entran en el respaldo diario automático de la Fase 3: descarga un respaldo desde Supabase (Table Editor → app_zr → Export) junto con los demás.

## ¿Qué fases tiene aplicada mi base?
Supabase → SQL Editor → pega `supabase/diagnostico_fases.sql` → Run. Solo lee: muestra cada fase con SÍ/NO, las tablas sin seguridad por filas (debe salir vacío) y los administradores activos.

## Problemas comunes

| Mensaje | Causa / solución |
|---|---|
| "Usuario o contraseña incorrectos" | Revisa minúsculas. Si es el admin, confirma que el correo del paso 2 sea exactamente `admin@usuarios.discarga.app`. |
| "Tu usuario no tiene acceso activo" | Tiene acceso en Auth pero no perfil en `app_users` (o fue desactivado). Para el admin: vuelve a ejecutar el SQL del paso 3. |
| "No se encontró la función admin-users" | Paso 4 no hecho o el nombre no es exacto. |
| "Sesión no válida" al crear usuarios | Cierra sesión y vuelve a entrar. |
| La app carga pero sin datos | El SQL del paso 3 se ejecutó pero el usuario no tiene perfil activo. |
| "Falta correr ... fase10_admin_agencias.sql" | Paso 1 de la Fase 10. |


## Pendiente para más adelante
- Filtrar datos por agencia **en la base de datos** (hoy lo filtra la app). Es la siguiente capa de seguridad.
- Botón "Desactivar" (el campo `activo` ya existe en la base).
