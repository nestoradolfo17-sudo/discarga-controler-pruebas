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
2. (Una sola vez) para traer los datos de la versión anterior de Control ZR (agencia Atanasio): pega TODO `zr_datos_iniciales.sql` → **Run**.
3. En **Usuarios** de DISCARGA CONTROLER activa el permiso **ZR** a quien lo use. Ve ZR de las agencias a las que tiene acceso.

Reglas (iguales a Recargas y Préstamos):
- Cada agencia tiene sus propios datos de ZR; arriba del módulo se elige la agencia.
- **Autoriza, rechaza y elimina** el administrador general o el **administrador de esa agencia** (se asigna en Usuarios de DISCARGA). La base de datos lo hace cumplir.
- El administrador de agencia entra a ZR de sus agencias aunque no tenga el permiso ZR marcado.
- ZR ya no tiene sección de Usuarios: quién entra y a qué agencias se da solo en **Usuarios y permisos** de DISCARGA CONTROLER (permiso ZR + agencias). Quien entra ve todo ZR; autorizar y eliminar es del administrador general o de la agencia.
- ZR entra con el **mismo usuario y contraseña** de DISCARGA CONTROLER; para eliminar o autorizar se confirma con esa contraseña.
- Fotos y PDF: almacenamiento privado `zr`, una carpeta por agencia (máx. 20 MB, solo imágenes y PDF).
- Los datos de ZR no entran en el respaldo diario automático de la Fase 3: descarga un respaldo desde Supabase (Table Editor → app_zr → Export).

## Recargas: se autorizan hasta liquidar (Fase 12)

1. Supabase → **SQL Editor → New query** → pega TODO el contenido de `supabase/fase12_recargas_en_ruta.sql` → **Run**. Al final debe salir **true**. No cambia ninguna recarga guardada.

Reglas:
- Un viaje de Recarga del Tablero se registra al **asignarlo**, pero queda **En ruta (sin liquidar)**: se ve en Recargas, no se puede autorizar y no aparece en la campana.
- Al **liquidar** el viaje (cualquier cierre, también Contingencia) pasa a **Por autorizar**.
- Las recargas manuales (botón "Nueva recarga") siguen igual: quedan por autorizar de una vez.

## Camión de apoyo (caminos angostos)

No requiere correr nada en Supabase.
- En el Tablero, en una ruta **En Tránsito**: menú **⋯ → Camión de apoyo**. Se elige camión, piloto, auxiliares, motivo, cajas que lleva (opcional) y hora de salida.
- La ruta sigue siendo una sola (no se duplican cajas). El camión y la tripulación de apoyo quedan **En Ruta** hasta que se liquida la ruta; entonces quedan libres solos.
- Se ve en el Tablero (etiqueta "+1 apoyo"), en el detalle de la ruta, en los Excel (columna "Camión de Apoyo") y en el Dashboard (tarjeta "Camiones de apoyo").

## Seguridad (Fase 13)

1. Supabase → **SQL Editor → New query** → pega TODO el contenido de `supabase/fase13_seguridad.sql` → **Run**. Al final deben salir 3 filas con **SÍ** y "Solo alerta (no bloquea)". No cambia nada para los usuarios.
2. (Recomendado) pega y corre `supabase/borrar_contrasenas_antiguas.sql`: borra la tabla vieja con contraseñas en texto (la app no la usa).
3. Revisión de seguridad completa (solo lee): `supabase/diagnostico_seguridad_rls.sql`.

Qué hace la Fase 13:
- Registra en la bitácora quién crea, cambia (permisos, agencias, administrador, activo) o elimina usuarios.
- Si alguien que no es administrador cambia los resultados de una liquidación cerrada, deja una **ALERTA** en la bitácora (por ahora no bloquea). Para ver las alertas: `select fecha, usuario, detalle from public.app_audit_log where accion = 'ALERTA_LIQUIDACION' order by fecha desc;`
- Cuando no salgan alertas de trabajo normal, se activa el bloqueo: `update public.app_seguridad_config set valor = 'si' where clave = 'bloquear_cambios_liquidacion';`
- Las funciones de la base ya no se pueden usar sin iniciar sesión.

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
