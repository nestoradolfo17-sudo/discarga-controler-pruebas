/* Control ZR dentro de DISCARGA CONTROLER.
   Implementa window.claude.use("db" | "user" | "assets" | "downloads") —la
   interfaz que usa la aplicación ZR— sobre la sesión y la base de datos
   (Supabase) de DISCARGA CONTROLER. La página se abre SIEMPRE dentro de la app
   (módulo ZR del menú); la app le pasa la conexión por window.parent.__ZR_BRIDGE. */
(function () {
  "use strict";
  window.ZR_WEB = true;

  // --- Conexión con la app principal ---
  const bridgeP = new Promise((ok) => {
    let n = 0;
    const t = setInterval(() => {
      let b = null;
      try { b = window.parent !== window ? window.parent.__ZR_BRIDGE : null; } catch (e) { b = null; }
      if (b) { clearInterval(t); ok(b); }
      else if (++n > 100) {
        clearInterval(t);
        document.documentElement.innerHTML =
          '<body style="font-family:system-ui,sans-serif;padding:40px;color:#0f172a"><h2>Control ZR</h2><p>Abra ZR desde el menú de <b>DISCARGA CONTROLER</b>.</p><p><a href="' + location.origin + '/">Ir a DISCARGA CONTROLER</a></p></body>';
      }
    }, 50);
  });

  // Copia "limpia" de los datos (evita objetos de la otra ventana).
  const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const SEG = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
  const bad = () => { throw { code: "invalid_argument", message: "Ruta no válida" }; };
  // Si la tabla de ZR no existe aún en Supabase, se avisa claramente.
  let avisoTabla = false;
  const faltaTabla = () => {
    if (avisoTabla) return; avisoTabla = true;
    const poner = () => { const b = document.getElementById("banner"); if (b) { b.hidden = false; b.textContent = "La base de datos de ZR aún no está creada: un administrador debe correr supabase/fase11_zr.sql en Supabase. Mientras tanto no se guarda nada."; } };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", poner); else poner();
  };
  const err = (e) => {
    const m = String((e && (e.message || e.code)) || e || "");
    if (/PGRST205|42P01|app_zr.*(does not exist|schema cache)|Could not find the (table|function)/i.test(m)) { faltaTabla(); return { code: "unavailable", message: m }; }
    if (/row-level security|permission|42501|not allowed|forbidden|Solo el administrador|necesita una solicitud|otra agencia/i.test(m)) return { code: "invalid_argument", message: m };
    if (/JWT|session|auth/i.test(m)) return { code: "unauthenticated" };
    return { code: "unavailable", message: m };
  };
  const nuevoId = () => {
    const a = new Uint8Array(15); crypto.getRandomValues(a);
    return Array.from(a, (x) => "abcdefghijklmnopqrstuvwxyz0123456789"[x % 36]).join("").slice(0, 20);
  };

  // --- Tiempo real: un canal para toda la tabla; avisa por colección ---
  const subs = {};
  let canal = null;
  async function escuchar() {
    if (canal) return;
    const B = await bridgeP;
    canal = B.supabase
      .channel("zr-" + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "*", schema: "public", table: "app_zr" }, (p) => {
        const r = (p.new && p.new.col ? p.new : p.old) || {};
        if (r.agencia && r.agencia !== B.agencia) return; // otra agencia
        const c = r.col;
        const avisar = (k) => (subs[k] || new Set()).forEach((f) => { try { f(); } catch (e) {} });
        if (c) avisar(c); else Object.keys(subs).forEach(avisar);
      })
      .subscribe();
    window.addEventListener("pagehide", () => { try { B.supabase.removeChannel(canal); } catch (e) {} });
  }
  function sub(c, fn) { escuchar(); (subs[c] = subs[c] || new Set()).add(fn); return () => subs[c].delete(fn); }

  // --- Datos (tabla app_zr: col + doc + data) ---
  async function leerDoc(c, id) {
    const B = await bridgeP;
    const { data, error } = await B.supabase.from("app_zr").select("data").eq("agencia", B.agencia).eq("col", c).eq("doc", id).maybeSingle();
    if (error) throw err(error);
    return data ? clone(data.data) : undefined;
  }
  async function leerCol(c) {
    const B = await bridgeP;
    const out = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await B.supabase.from("app_zr").select("doc,data").eq("agencia", B.agencia).eq("col", c).order("doc").range(desde, desde + 999);
      if (error) throw err(error);
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return clone(out.map((x) => ({ id: x.doc, data: x.data })));
  }
  async function guardar(c, id, data) {
    const B = await bridgeP;
    const { error } = await B.supabase.from("app_zr").upsert({ agencia: B.agencia, col: c, doc: id, data: clone(data) }, { onConflict: "agencia,col,doc" });
    if (error) throw err(error);
  }
  async function actualizar(c, id, parcial) {
    const B = await bridgeP;
    const { data, error } = await B.supabase.rpc("zr_actualizar", { p_agencia: B.agencia, p_col: c, p_doc: id, p_datos: clone(parcial) });
    if (error) throw err(error);
    if (data === false) throw { code: "not_found" };
  }
  async function borrar(c, id) {
    const B = await bridgeP;
    const { error } = await B.supabase.from("app_zr").delete().eq("agencia", B.agencia).eq("col", c).eq("doc", id);
    if (error) throw err(error);
  }

  const docSnap = (id, d) => ({ id, exists: d !== undefined, data: () => d });
  const colSnap = (list) => ({ docs: list.map((x) => ({ id: x.id, exists: true, data: () => x.data })), size: list.length, empty: !list.length });
  function partir(p) { const a = String(p).split("/"); return [a[0], a.slice(1).join("/")]; }

  function docRef(path) {
    const [c, id] = partir(path);
    if (!SEG.test(c) || !SEG.test(id)) bad();
    const ref = {
      id, path,
      get: async () => docSnap(id, await leerDoc(c, id)),
      set: (data) => guardar(c, id, data),
      update: (data) => actualizar(c, id, data),
      delete: () => borrar(c, id),
      onSnapshot(cb, onErr) {
        let t = null;
        const run = () => { clearTimeout(t); t = setTimeout(() => ref.get().then(cb).catch((e) => onErr && onErr(e)), 60); };
        run(); return sub(c, run);
      },
    };
    return ref;
  }
  function colRef(c) {
    if (!SEG.test(c)) bad();
    const ref = {
      get: async () => colSnap(await leerCol(c)),
      add: async (data) => { const id = nuevoId(); await guardar(c, id, data); return docRef(c + "/" + id); },
      doc: (id) => docRef(c + "/" + id),
      onSnapshot(cb, onErr) {
        let t = null;
        const run = () => { clearTimeout(t); t = setTimeout(() => ref.get().then(cb).catch((e) => onErr && onErr(e)), 80); };
        run(); return sub(c, run);
      },
    };
    return ref;
  }
  const db = { doc: docRef, collection: colRef };

  // --- Usuario: el de la sesión de DISCARGA CONTROLER ---
  const user = {
    isOwner: async () => !!(await bridgeP).me.admin,
    canEdit: async () => true,
    can: async () => true,
    id: async () => (await bridgeP).me.id,
    name: async () => (await bridgeP).me.name || "",
    me: async () => { const m = (await bridgeP).me; return { id: m.id, name: m.name, email: m.email || null }; },
    profiles: async (ids) => clone(await (await bridgeP).profiles([].concat(ids || []))),
    search: async (q) => clone(await (await bridgeP).searchUsers(String(q || ""))),
  };

  // --- Archivos (fotos y PDF) en el almacenamiento privado "zr" ---
  const TIPOS = /^(image\/(png|jpeg|gif|webp)|application\/pdf)$/;
  const assets = {
    upload: async (file, opts) => {
      const B = await bridgeP;
      const type = (opts && opts.type) || file.type || "application/octet-stream";
      if (!TIPOS.test(type)) throw { code: "unsupported_type" };
      if (file.size > 20 * 1024 * 1024) throw { code: "too_large" };
      const a = new Uint8Array(16); crypto.getRandomValues(a);
      const id = Array.from(a, (x) => x.toString(16).padStart(2, "0")).join("");
      const cuerpo = B.blob(await file.arrayBuffer(), type);
      const { error } = await B.supabase.storage.from("zr").upload(B.agencia + "/" + id, cuerpo, { contentType: type, upsert: false });
      if (error) { const m = String(error.message || ""); if (/size|large/i.test(m)) throw { code: "too_large" }; if (/mime|type/i.test(m)) throw { code: "unsupported_type" }; throw err(error); }
      return { id, url: "/_blob/" + id, sizeBytes: file.size, contentType: type };
    },
    delete: async (id) => { const B = await bridgeP; await B.supabase.storage.from("zr").remove([B.agencia + "/" + String(id)]); },
    list: async () => ({ assets: [], usage: {} }),
  };

  // Los enlaces "/_blob/<id>" abren el archivo con un enlace temporal (1 hora).
  document.addEventListener("click", async (e) => {
    const a = e.target && e.target.closest && e.target.closest('a[href^="/_blob/"]');
    if (!a) return;
    e.preventDefault();
    const id = a.getAttribute("href").slice(7);
    const w = window.open("", "_blank");
    try {
      const B = await bridgeP;
      const { data, error } = await B.supabase.storage.from("zr").createSignedUrl(B.agencia + "/" + id, 3600);
      if (error || !data) throw error || new Error("sin enlace");
      if (w) { w.opener = null; w.location.href = data.signedUrl; } else location.href = data.signedUrl;
    } catch (x) {
      if (w) w.close();
      alert("No se encontró el archivo. Las fotos cargadas en la versión anterior de Control ZR no se trasladaron.");
    }
  }, true);

  const downloads = {
    save: async ({ filename, data }) => {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = filename || "descarga";
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      return { status: "saved" };
    },
  };

  window.claude = { use: async (n) => ({ db, user, assets, downloads })[n] || null };

  // Pilotos: conductores activos de Personal de DISCARGA en las agencias del usuario.
  window.__zrPilotos = (cb) => {
    bridgeP.then((B) => {
      const enviar = (l) => { try { cb(clone(l || [])); } catch (e) {} };
      enviar(B.pilotos());
      B.onPilotos(enviar);
    });
  };

  // Verificación de la contraseña del usuario (la de DISCARGA CONTROLER) para
  // eliminar o autorizar dentro de ZR.
  window.__zrVerificar = async (pw) => { try { return !!(await (await bridgeP).verifyPassword(String(pw || ""))); } catch (e) { return false; } };

  // Aviso de versión DEMO.
  bridgeP.then((B) => { window.__zrAgencia = B.agencia; });
  bridgeP.then((B) => {
    if (!B.demo) return;
    const poner = () => { const b = document.getElementById("banner"); if (b) { b.hidden = false; b.textContent = "Versión DEMO: puede probar todo, pero los cambios no se guardan."; } };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", poner); else poner();
  });
})();
