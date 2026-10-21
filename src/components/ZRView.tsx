import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2, Building2 } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { verifyOwnPassword } from '../services/auth';
import { isDemoMode } from '../services/demoMode';
import { AGENCIA_LOCATION_OPTIONS } from '../data/agencies';
import type { AppUser } from '../types';

// --- Módulo ZR (Control de pagos de zonas rojas) ---
// La aplicación ZR vive en /zr/index.html y se muestra aquí dentro, siempre
// para UNA agencia (cada agencia tiene sus propios datos de ZR). Usa la sesión
// de DISCARGA CONTROLER y guarda en Supabase (tabla app_zr y almacenamiento
// "zr"). Las mismas reglas que Recargas y Préstamos:
//   • ve las agencias a las que tiene acceso;
//   • administra (autoriza, elimina) el administrador general o el de la agencia.
// La conexión se le pasa por window.__ZR_BRIDGE (ver public/zr/zr-bridge.js).

declare global {
  interface Window {
    __ZR_BRIDGE?: unknown;
  }
}

const CLAVE_AGENCIA = 'dc_zr_agencia';

/** Agencias en las que el usuario puede usar ZR. */
export function agenciasZr(u: AppUser): string[] {
  const admin = u.adminAgencies || [];
  if (u.isAdmin) return [...AGENCIA_LOCATION_OPTIONS];
  const conPermiso = u.permissions?.zr ? (u.agencyAccess === 'all' || !u.agencyAccess ? AGENCIA_LOCATION_OPTIONS : u.agencyAccess) : [];
  const set = new Set([...conPermiso, ...admin]);
  return AGENCIA_LOCATION_OPTIONS.filter((a) => set.has(a)).concat([...set].filter((a) => !AGENCIA_LOCATION_OPTIONS.includes(a)));
}

export const ZRView: React.FC<{ usuario: AppUser; agenciaSugerida?: string }> = ({ usuario, agenciaSugerida }) => {
  const agencias = useMemo(() => agenciasZr(usuario), [usuario]);
  const [agencia, setAgencia] = useState<string>(() => {
    if (agenciaSugerida && agenciaSugerida !== 'TODAS' && agencias.includes(agenciaSugerida)) return agenciaSugerida;
    try {
      const g = localStorage.getItem(CLAVE_AGENCIA);
      if (g && agencias.includes(g)) return g;
    } catch {
      /* sin almacenamiento */
    }
    return agencias.includes('Atanasio') ? 'Atanasio' : agencias[0] || '';
  });
  const [listo, setListo] = useState('');
  const [completa, setCompleta] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  // Si cambia la agencia de la barra superior, ZR la sigue (si tiene acceso).
  useEffect(() => {
    if (agenciaSugerida && agenciaSugerida !== 'TODAS' && agencias.includes(agenciaSugerida)) setAgencia(agenciaSugerida);
  }, [agenciaSugerida, agencias]);

  const esAdminAgencia = !!usuario.isAdmin || (usuario.adminAgencies || []).includes(agencia);

  useEffect(() => {
    if (!supabase || !agencia) return;
    const sb = supabase;
    try {
      localStorage.setItem(CLAVE_AGENCIA, agencia);
    } catch {
      /* sin almacenamiento */
    }
    window.__ZR_BRIDGE = {
      supabase: sb,
      demo: isDemoMode,
      agencia,
      me: {
        id: usuario.id,
        name: usuario.nombre || usuario.username,
        email: null,
        // Administrador de ZR en esta agencia: general o administrador de la agencia.
        admin: esAdminAgencia,
      },
      // Confirma la contraseña de la propia cuenta (para eliminar o autorizar en ZR).
      verifyPassword: (pw: string) => verifyOwnPassword(usuario.username, pw),
      // Usuarios de DISCARGA para agregarlos en ZR → Usuarios (solo el administrador de la agencia).
      searchUsers: async (q: string) => {
        const { data } = await sb.rpc('zr_buscar_usuarios', { p_agencia: agencia, q });
        return ((data as { id: string; nombre: string; usuario: string }[]) || []).map((u) => ({ id: u.id, name: u.nombre, email: u.usuario }));
      },
      profiles: async (ids: string[]) => {
        const out: Record<string, { id: string; name: string; email: null }> = {};
        const uuids = ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x));
        if (uuids.length) {
          const { data } = await sb.rpc('zr_nombres', { p_agencia: agencia, ids: uuids });
          ((data as { id: string; nombre: string }[]) || []).forEach((u) => (out[u.id] = { id: u.id, name: u.nombre, email: null }));
        }
        ids.forEach((id) => (out[id] = out[id] || { id, name: '', email: null }));
        return out;
      },
      // Archivo creado en esta ventana (para subirlo con la conexión de la app).
      blob: (buf: ArrayBuffer, type: string) => new Blob([buf], { type }),
    };
    setListo(agencia);
    return () => {
      delete window.__ZR_BRIDGE;
    };
  }, [usuario, agencia, esAdminAgencia]);

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
  if (!agencias.length) {
    return <div className="p-6 text-sm text-slate-600">No tiene agencias asignadas para usar ZR. Pida al administrador que le dé acceso.</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Building2 className="w-4 h-4 text-slate-500" />
          Agencia de ZR
          <select
            value={agencia}
            onChange={(e) => setAgencia(e.target.value)}
            disabled={agencias.length < 2}
            className="min-h-[40px] px-3 border border-slate-300 rounded-lg bg-white text-sm font-semibold disabled:bg-slate-50"
          >
            {agencias.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <span className={`text-[11px] font-bold px-2 py-1 rounded-md border ${esAdminAgencia ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
          {usuario.isAdmin ? 'Administrador general' : esAdminAgencia ? `Administrador de ${agencia}` : 'Usuario'}
        </span>
        <span className="text-[11px] text-slate-500">
          Autoriza y elimina: administrador general o administrador de la agencia.
        </span>
      </div>
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
            key={listo}
            title={`Control ZR · ${listo}`}
            src="/zr/index.html"
            className="w-full block border-0"
            style={{ height: completa ? '100vh' : 'max(640px, calc(100vh - 200px))' }}
          />
        )}
      </div>
    </div>
  );
};
