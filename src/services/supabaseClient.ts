import { createClient, SupabaseClient } from '@supabase/supabase-js';

// --- Conexión opcional a Supabase (fase de pruebas compartidas) ---
//
// Estas dos variables se configuran en un archivo .env.local (para desarrollo
// en tu computadora) o en las variables de entorno del sitio en Netlify (para
// la versión publicada). Ver ".env.example" en la raíz del proyecto.
//
// Corrección/diseño intencional: si estas variables NO están configuradas, la
// aplicación sigue funcionando exactamente igual que antes (todo en
// localStorage, un usuario por navegador, sin red). Esto evita que agregar
// Supabase rompa el desarrollo local sin credenciales o cualquier copia de la
// app que alguien siga usando sin base de datos compartida.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        // Esta fase de pruebas no usa Supabase Auth (la app sigue con su propio
        // login de usuario/contraseña contra la tabla "app_users"), así que se
        // desactiva la persistencia de sesión de Supabase para no interferir.
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;
