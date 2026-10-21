import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { verifyOwnPassword } from '../services/auth';
import { isDemoMode } from '../services/demoMode';
import type { AppUser } from '../types';

// --- Módulo ZR (Control de pagos de zonas rojas) ---
// La aplicación ZR vive en /zr/index.html y se muestra aquí dentro. Usa la
// sesión de DISCARGA CONTROLER (mismo usuario y contraseña) y guarda sus datos
// en Supabase (tabla app_zr y almacenamiento "zr"). Esta pantalla le pasa la
// conexión por window.__ZR_BRIDGE (ver public/zr/zr-bridge.js).

declare global {
  interface Window {
    __ZR_BRIDGE?: unknown;
  }
}

export const ZRView: React.FC<{ usuario: AppUser }> = ({ usuario }) => {
  const [listo, setListo] = useState(false);
  const [completa, setCompleta] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;
    window.__ZR_BRIDGE = {
      supabase: sb,
      demo: isDemoMode,
      me: {
        id: usuario.id,
        name: usuario.nombre || usuario.username,
        email: null,
        admin: !!usuario.isAdmin,
      },
      // Confirma la contraseña de la propia cuenta (para eliminar o autorizar en ZR).
      verifyPassword: (pw: string) => verifyOwnPassword(usuario.username, pw),
      // Usuarios de DISCARGA para agregarlos en ZR → Usuarios (solo administradores de ZR).
      searchUsers: async (q: string) => {
        const { data } = await sb.rpc('zr_buscar_usuarios', { q });
        return ((data as { id: string; nombre: string; usuario: string }[]) || []).map((u) => ({ id: u.id, name: u.nombre, email: u.usuario }));
      },
      profiles: async (ids: string[]) => {
        const out: Record<string, { id: string; name: string; email: null }> = {};
        const uuids = ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x));
        if (uuids.length) {
          const { data } = await sb.rpc('zr_nombres', { ids: uuids });
          ((data as { id: string; nombre: string }[]) || []).forEach((u) => (out[u.id] = { id: u.id, name: u.nombre, email: null }));
        }
        ids.forEach((id) => (out[id] = out[id] || { id, name: '', email: null }));
        return out;
      },
      // Archivo creado en esta ventana (para subirlo con la conexión de la app).
      blob: (buf: ArrayBuffer, type: string) => new Blob([buf], { type }),
    };
    setListo(true);
    return () => {
      delete window.__ZR_BRIDGE;
    };
  }, [usuario]);

  useEffect(() => {
    const f = () => setCompleta(document.fullscreenElement === caja.current);
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);

  const alternar = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void caja.current?.requestFullscreen?.();
  };

  if (!supabase) {
    return <div className="p-6 text-sm text-slate-600">ZR necesita la conexión con la base de datos.</div>;
  }

  return (
    <div ref={caja} className="relative bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={alternar}
        title={completa ? 'Salir de pantalla completa' : 'Ver ZR en pantalla completa'}
        aria-label={completa ? 'Salir de pantalla completa' : 'Ver ZR en pantalla completa'}
        className="absolute top-2 right-2 z-10 min-h-[36px] min-w-[36px] rounded-lg bg-white/90 border border-slate-200 shadow-sm flex items-center justify-center text-slate-600 hover:bg-white cursor-pointer"
      >
        {completa ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      </button>
      {listo && (
        <iframe
          title="Control ZR"
          src="/zr/index.html"
          className="w-full block border-0"
          style={{ height: completa ? '100vh' : 'max(640px, calc(100vh - 150px))' }}
        />
      )}
    </div>
  );
};
