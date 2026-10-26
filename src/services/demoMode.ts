// --- Versión DEMO (presentaciones, prácticas y capacitación) · rama "demo" ---
//
// La versión DEMO se publica desde la rama "demo" de GitHub y Netlify la sirve
// en https://demo--discargacontroler.netlify.app. Muestra los datos reales (lee
// la misma base), pero NUNCA escribe en ella:
//
//  - Todo lo que se haga (asignar, liquidar, crear, borrar, cargas masivas...)
//    se ve en pantalla como si se hubiera guardado, pero solo vive en la
//    memoria del navegador. Al recargar la página vuelve a mostrar lo real.
//  - El bloqueo está en la conexión misma con Supabase (`demoFetch`): cualquier
//    solicitud que no sea de lectura se responde aquí, sin salir a internet.
//    Así queda protegido todo, incluso funciones que se agreguen después.
//  - Solo se permite iniciar sesión (y renovar la sesión) y las lecturas.

// ¿Es DEMO? Se decide al PUBLICAR, no por la dirección web: Netlify también
// sirve cada publicación en una dirección propia ("<código>--discargacontroler
// .netlify.app") y ahí la dirección no empieza con "demo--"; antes, abrir el
// demo por esa dirección guardaba en los datos reales. Reglas:
//   • Rama "demo", o cualquier publicación de Netlify que NO sea la de
//     producción (otras ramas, vistas previas de cambios) → DEMO (solo lectura).
//   • VITE_DEMO_MODE=true → DEMO.
//   • La dirección "demo--..." → DEMO (respaldo).
//   • Solo la publicación de producción (rama main) escribe datos reales.
const netlifyContext = (() => {
  try {
    return typeof __NETLIFY_CONTEXT__ === 'string' ? __NETLIFY_CONTEXT__ : '';
  } catch {
    return '';
  }
})();
const netlifyBranch = (() => {
  try {
    return typeof __NETLIFY_BRANCH__ === 'string' ? __NETLIFY_BRANCH__ : '';
  } catch {
    return '';
  }
})();

export const isDemoMode: boolean = (() => {
  try {
    if (import.meta.env.VITE_DEMO_MODE === 'true') return true;
    if (netlifyBranch === 'demo') return true;
    if (netlifyContext && netlifyContext !== 'production') return true;
    return typeof window !== 'undefined' && window.location.hostname.startsWith('demo--');
  } catch {
    return false;
  }
})();

// Usuario de SOLO CONSULTA (permiso "soloLectura"): misma protección que el
// DEMO, activada al iniciar sesión con ese usuario (ver App.tsx).
let soloConsulta = false;
export const setSoloConsulta = (v: boolean) => {
  soloConsulta = v;
};
export const isSoloConsulta = () => soloConsulta;

export const DEMO_BLOCK_MESSAGE = 'Versión DEMO: esta acción no se aplica a los datos reales.';

// Funciones de la base que solo LEEN y que el demo puede llamar.
const READ_ONLY_RPCS = new Set(['estado_espacio']);

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Respuesta de "guardado" que no toca la base (la app sigue como si se guardó). */
const fakeOk = (method: string) => (method === 'POST' ? new Response(null, { status: 201 }) : new Response(null, { status: 204 }));

export const demoFetch: typeof fetch = async (input, init) => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  let path = '';
  try {
    path = new URL(url).pathname;
  } catch {
    path = url;
  }
  const isRead = method === 'GET' || method === 'HEAD';

  // Inicio de sesión y renovación del token: permitidos (no cambian datos).
  if (path.startsWith('/auth/v1/')) {
    if (path.startsWith('/auth/v1/token') && method === 'POST') return fetch(input, init);
    if (path.startsWith('/auth/v1/logout')) return new Response(null, { status: 204 });
    if (isRead) return fetch(input, init);
    return json(403, { error: DEMO_BLOCK_MESSAGE, msg: DEMO_BLOCK_MESSAGE, message: DEMO_BLOCK_MESSAGE });
  }

  // Funciones de servidor (crear/eliminar usuarios, contraseñas): bloqueadas.
  if (path.startsWith('/functions/v1/')) {
    return json(403, { error: DEMO_BLOCK_MESSAGE });
  }

  // Funciones de la base (RPC): solo las de lectura.
  if (path.startsWith('/rest/v1/rpc/')) {
    const name = path.slice('/rest/v1/rpc/'.length).split('?')[0];
    if (READ_ONLY_RPCS.has(name)) return fetch(input, init);
    // Solo consulta (fuera del DEMO): sí registra su última conexión.
    if (name === 'touch_last_login' && soloConsulta && !isDemoMode) return fetch(input, init);
    return new Response(null, { status: 204 });
  }

  // Tablas y archivos: lecturas sí; escrituras se "aceptan" sin enviarse.
  if (path.startsWith('/rest/v1/') || path.startsWith('/storage/v1/')) {
    if (isRead) return fetch(input, init);
    return fakeOk(method);
  }

  // Cualquier otra cosa: solo lectura.
  if (isRead) return fetch(input, init);
  return json(403, { error: DEMO_BLOCK_MESSAGE });
};

/** Conexión de la app: normal, o de solo lectura si es DEMO o usuario de solo consulta. */
export const appFetch: typeof fetch = (input, init) =>
  isDemoMode || soloConsulta ? demoFetch(input, init) : fetch(input, init);
