import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Route,
  Truck,
  Staff,
  ToastMessage,
  StaffPuesto,
  ResourceStatus,
  AssignmentType,
  TruckUnavailableReason,
  StaffUnavailableReason,
  StaffEstatus,
  AppUser,
  TablePermissions,
  MotivoDevolucionReason,
  CajaAbiertaReason,
  ClientePendiente,
  RouteClientEntry,
} from './types';
import { INITIAL_ROUTES, INITIAL_TRUCKS, INITIAL_STAFF, INITIAL_USERS } from './data/initialData';
import {
  isSupabaseConfigured,
  fetchSharedCollection,
  pushSharedCollection,
  subscribeToSharedCollection,
  deleteSharedRecords,
  setSyncErrorHandler,
  SyncKeyFn,
  SyncedRow,
  SyncableTable,
} from './services/sync';
import { TRUCK_REASON_REMUNERA, STAFF_REASON_REMUNERA } from './data/unavailableReasons';
import { exportRoutesToExcel } from './utils/excel';
import { formatDateToGuatemala, formatDateTimeToGuatemala, getTomorrowGuatemalaDate } from './utils/date';
import { getRouteKey, routeMatchesKey } from './utils/routeKey';
import {
  getSessionUserId,
  onAuthChange,
  signIn,
  signOut,
  verifyOwnPassword,
  fetchProfiles,
  subscribeToProfiles,
  adminCreateUser,
  adminSetPassword,
  adminRenameUser,
  adminDeleteUser,
  adminUpdateProfile,
  normalizeUsername,
} from './services/auth';
import { Navbar } from './components/Navbar';
import { StatsCards, LiquidatedStatsStrip } from './components/StatsCards';
import { TabNav, ActiveTab } from './components/TabNav';
import { RoutesTable } from './components/RoutesTable';
import { ResourcesView } from './components/ResourcesView';
import { BatchImportView, BatchImportTarget } from './components/BatchImportView';
import { AGENCIA_LOCATION_OPTIONS } from './data/agencies';
import { ClientesImportView } from './components/ClientesImportView';
import { LiquidatedBoardView, LiquidatedKpis } from './components/LiquidatedBoardView';
import { NewRouteModal } from './components/modals/NewRouteModal';
import { NewTrasladoRouteModal } from './components/modals/NewTrasladoRouteModal';
import { RouteTypeSelectModal } from './components/modals/RouteTypeSelectModal';
import { SplitRouteModal } from './components/modals/SplitRouteModal';
import { RevertSplitModal } from './components/modals/RevertSplitModal';
import { AssignModal } from './components/modals/AssignModal';
import { LiquidateModal } from './components/modals/LiquidateModal';
import { FinalizeCajaAbiertaModal } from './components/modals/FinalizeCajaAbiertaModal';
import { ReceiptModal } from './components/modals/ReceiptModal';
import { NewTruckModal } from './components/modals/NewTruckModal';
import { NewStaffModal } from './components/modals/NewStaffModal';
import { DailySummaryModal } from './components/modals/DailySummaryModal';
import { ClosingActaModal } from './components/modals/ClosingActaModal';
import { DeleteRoutesModal } from './components/modals/DeleteRoutesModal';
import { UnassignedResourcesModal } from './components/modals/UnassignedResourcesModal';
import { ToastContainer } from './components/ToastContainer';
import { LoginScreen } from './components/auth/LoginScreen';
import { UsersView } from './components/UsersView';
import { DashboardView } from './components/DashboardView';

const STORAGE_KEY_ROUTES = 'rutamaster_routes_v6';
const STORAGE_KEY_TRUCKS = 'rutamaster_trucks_v6';
const STORAGE_KEY_STAFF = 'rutamaster_staff_v6';
const STORAGE_KEY_HISTORY = 'rutamaster_history_v6';
const STORAGE_KEY_USERS = 'rutamaster_users_v1';
const STORAGE_KEY_SESSION = 'rutamaster_session_v1';

export default function App() {
  const [routes, setRoutes] = useState<Route[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ROUTES);
      return saved ? JSON.parse(saved) : INITIAL_ROUTES;
    } catch {
      return INITIAL_ROUTES;
    }
  });

  const [trucks, setTrucks] = useState<Truck[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TRUCKS);
      return saved ? JSON.parse(saved) : INITIAL_TRUCKS;
    } catch {
      return INITIAL_TRUCKS;
    }
  });

  const [staff, setStaff] = useState<Staff[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_STAFF);
      return saved ? JSON.parse(saved) : INITIAL_STAFF;
    } catch {
      return INITIAL_STAFF;
    }
  });

  const [historicalRoutes, setHistoricalRoutes] = useState<Route[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_HISTORY);
      const list: Route[] = saved ? JSON.parse(saved) : [];
      // Ensure initial liquidated routes exist in history
      INITIAL_ROUTES.filter((r) => r.estado === 'Liquidada').forEach((r) => {
        if (!list.some((hr) => String(hr.id) === String(r.id))) {
          list.unshift(JSON.parse(JSON.stringify(r)));
        }
      });
      return list;
    } catch {
      return [];
    }
  });

  // --- Control de acceso (usuarios y sesión) ---
  // Con Supabase configurado, los usuarios vienen de la tabla de perfiles
  // "app_users" DESPUÉS de iniciar sesión (ver services/auth.ts); nunca se
  // guardan en el navegador ni se precargan con usuarios de ejemplo.
  const [users, setUsers] = useState<AppUser[]>(() => {
    if (isSupabaseConfigured) return [];
    try {
      const saved = localStorage.getItem(STORAGE_KEY_USERS);
      return saved ? JSON.parse(saved) : INITIAL_USERS;
    } catch {
      return INITIAL_USERS;
    }
  });

  const [currentUsername, setCurrentUsername] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY_SESSION);
    } catch {
      return null;
    }
  });

  // --- Sesión con Supabase Auth ---
  // authUserId: id del usuario autenticado en Supabase (null = sin sesión).
  // authChecked: ya se revisó si había una sesión guardada en este navegador.
  // profilesLoaded: ya se leyó la tabla de perfiles tras iniciar sesión.
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(!isSupabaseConfigured);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [loginNotice, setLoginNotice] = useState('');

  const currentUser = useMemo(() => {
    if (isSupabaseConfigured) {
      return users.find((u) => u.id === authUserId && u.activo !== false) || null;
    }
    return users.find((u) => u.username.toLowerCase() === (currentUsername || '').toLowerCase()) || null;
  }, [users, currentUsername, authUserId]);

  // Recuperar la sesión guardada y escuchar inicios/cierres de sesión.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    getSessionUserId().then((id) => {
      if (!active) return;
      setAuthUserId(id);
      setAuthChecked(true);
    });
    const unsubscribe = onAuthChange((id) => {
      if (active) setAuthUserId(id);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Cargar perfiles al iniciar sesión. La base de datos decide qué se ve: el
  // administrador recibe todos los perfiles, un usuario normal solo el suyo.
  useEffect(() => {
    if (!isSupabaseConfigured || !authUserId) {
      setProfilesLoaded(false);
      return;
    }
    let active = true;
    setProfilesLoaded(false);
    fetchProfiles().then((list) => {
      if (!active) return;
      if (list) setUsers(list);
      else setLoginNotice('No se pudo leer tu perfil de usuario. Revisa tu conexión e intenta de nuevo.');
      setProfilesLoaded(true);
    });
    const unsubscribe = subscribeToProfiles((updater) => setUsers((prev) => updater(prev)));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [authUserId]);

  // Sesión válida pero sin perfil ACTIVO (usuario eliminado o desactivado por
  // el administrador, incluso mientras estaba conectado): se cierra la sesión.
  useEffect(() => {
    if (!isSupabaseConfigured || !authUserId || !profilesLoaded || currentUser) return;
    setLoginNotice((prev) => prev || 'Tu usuario no tiene acceso activo. Consulta con el administrador.');
    void signOut();
  }, [authUserId, profilesLoaded, currentUser]);

  // --- Sincronización compartida (Supabase) — fase de pruebas ---
  // Corrección/diseño intencional: si VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
  // no están configuradas (ver src/services/supabaseClient.ts), todo este bloque
  // queda inactivo y la aplicación funciona exactamente igual que antes (solo
  // localStorage, un usuario por navegador). Esto evita que agregar la base de
  // datos compartida cambie el comportamiento de nadie que siga sin configurarla.
  const [isRemoteReady, setIsRemoteReady] = useState(!isSupabaseConfigured);
  // Corrección: este ref ya NO guarda un set de "ids anteriores" — ver la nota
  // de seguridad en pushSharedCollection (services/sync.ts): el borrado en
  // Supabase ya nunca se infiere comparando snapshots, así que ya no hace
  // falta rastrear qué claves había "antes" solo para poder borrar por
  // diferencia. Solo se usa para detectar si la colección realmente cambió
  // (comparando el JSON) antes de molestarse en subirla de nuevo.
  //
  // Mejora: además del JSON completo, se guarda el JSON de CADA registro
  // (byKey) tal como quedó la última vez que se sincronizó. Así, cuando cambia
  // una colección, solo se suben a Supabase los registros que realmente
  // cambiaron — antes se subía la colección COMPLETA en cada cambio (miles de
  // colaboradores por un solo clic), lo que además de lento era peligroso:
  // si otro usuario había modificado un registro distinto hace un segundo,
  // esa subida completa podía pisar su cambio con la copia vieja local.
  //
  // `blocked`: la lectura inicial de esa tabla falló. En ese caso NO se sube
  // nada de esa tabla (la copia local puede estar desactualizada y pisaría
  // los datos reales de todos) hasta que el usuario recargue la página.
  type SyncRef = { json: string; byKey: Map<string, string>; blocked: boolean };
  const emptySyncRef = (): SyncRef => ({ json: '', byKey: new Map(), blocked: false });
  const routesSyncRef = useRef<SyncRef>(emptySyncRef());
  const historySyncRef = useRef<SyncRef>(emptySyncRef());
  const trucksSyncRef = useRef<SyncRef>(emptySyncRef());
  const staffSyncRef = useRef<SyncRef>(emptySyncRef());
  const usersSyncRef = useRef<SyncRef>(emptySyncRef());

  // Construye el mapa clave → JSON de una colección completa.
  const buildSyncedMap = <T,>(items: T[], getKey: SyncKeyFn<T>) => {
    const map = new Map<string, string>();
    items.forEach((item) => map.set(getKey(item), JSON.stringify(item)));
    return map;
  };

  // Marca como "ya sincronizado" el resultado de aplicar un cambio recibido
  // por tiempo real (para no volver a subir lo que otro usuario acaba de
  // guardar). Solo recalcula los registros que cambiaron de referencia.
  const markRemoteApplied = <T,>(
    ref: { current: SyncRef },
    prev: T[],
    next: T[],
    getKey: SyncKeyFn<T>
  ) => {
    const prevByKey = new Map<string, T>();
    prev.forEach((item) => prevByKey.set(getKey(item), item));
    const byKey = new Map(ref.current.byKey);
    const nextKeys = new Set<string>();
    next.forEach((item) => {
      const k = getKey(item);
      nextKeys.add(k);
      if (prevByKey.get(k) !== item) byKey.set(k, JSON.stringify(item));
    });
    prevByKey.forEach((_, k) => {
      if (!nextKeys.has(k)) byKey.delete(k);
    });
    ref.current = { json: JSON.stringify(next), byKey, blocked: ref.current.blocked };
  };
  // Corrección: cada sincronización hacia Supabase de una colección sube (hace
  // upsert de) los registros actuales — ver pushSharedCollection en
  // services/sync.ts. Si dos actualizaciones seguidas de la MISMA colección
  // (por ejemplo, dos acciones en el Tablero de Rutas hechas con pocos
  // segundos de diferencia) quedaban "en vuelo" al mismo tiempo y la red las
  // resolvía fuera de orden, la más lenta podía sobrescribir en Supabase el
  // resultado de la más rápida con datos ya desactualizados. Esta cola (una
  // por colección) obliga a que cada sincronización espere a que termine la
  // anterior antes de empezar la siguiente, para que nunca compitan entre sí.
  const routesPushQueueRef = useRef<Promise<void>>(Promise.resolve());
  const historyPushQueueRef = useRef<Promise<void>>(Promise.resolve());
  const trucksPushQueueRef = useRef<Promise<void>>(Promise.resolve());
  const staffPushQueueRef = useRef<Promise<void>>(Promise.resolve());
  const usersPushQueueRef = useRef<Promise<void>>(Promise.resolve());

  // Sube una colección a Supabase solo si su contenido realmente cambió desde
  // la última vez que se sincronizó (en cualquier dirección: una edición local
  // o un cambio recibido por tiempo real de otro usuario). Esta comparación es
  // lo que evita un ciclo infinito: al recibir por tiempo real un cambio que
  // este mismo navegador acaba de subir, el contenido ya coincide con lo
  // último sincronizado y no se vuelve a subir.
  //
  // Corrección de seguridad importante: esta función SOLO hace upsert (agregar
  // o actualizar). Ya NO calcula ni pasa ninguna "clave anterior" para que
  // pushSharedCollection borre por diferencia — ver la nota de seguridad en
  // pushSharedCollection (services/sync.ts) sobre por qué ese borrado
  // implícito se eliminó por completo tras causar pérdidas reales de datos.
  // Cuando una acción del usuario realmente borra un registro a propósito
  // (eliminar un camión, una ruta, un colaborador, etc.), esa acción llama
  // directamente a `deleteSharedRecords` con la clave exacta de lo borrado,
  // en vez de depender de que este helper "adivine" qué se quitó comparando
  // el arreglo de antes con el de ahora.
  const pushIfChanged = useCallback(
    <T,>(
      table: SyncableTable,
      items: T[],
      getKey: SyncKeyFn<T>,
      ref: { current: SyncRef },
      queueRef: { current: Promise<void> }
    ) => {
      if (!isSupabaseConfigured || !isRemoteReady) return;
      // Lectura inicial fallida: no subir nada de esta tabla (ver `blocked`).
      if (ref.current.blocked) return;
      const json = JSON.stringify(items);
      if (json === ref.current.json) return;

      // Solo los registros nuevos o modificados desde la última sincronización.
      // Si por error hubiera dos registros con la misma clave, se sube solo el
      // último (Supabase rechaza un lote que toca dos veces la misma fila, y
      // eso hacía fallar la subida COMPLETA de la colección).
      const prevByKey = ref.current.byKey;
      const nextByKey = new Map<string, string>();
      const changedByKey = new Map<string, T>();
      items.forEach((item) => {
        const k = getKey(item);
        const itemJson = JSON.stringify(item);
        nextByKey.set(k, itemJson);
        if (prevByKey.get(k) !== itemJson) changedByKey.set(k, item);
        else changedByKey.delete(k);
      });
      ref.current = { json, byKey: nextByKey, blocked: false };
      const changed = Array.from(changedByKey.values());
      if (changed.length === 0) return;

      // Encadenada detrás de la sincronización anterior de esta misma colección
      // (ver el comentario de las *PushQueueRef arriba) para que nunca se
      // ejecuten dos en paralelo compitiendo por el mismo registro.
      queueRef.current = queueRef.current
        .catch(() => {})
        .then(async () => {
          const ok = await pushSharedCollection(table, changed, getKey);
          if (!ok) {
            // No se guardó: se "olvida" que estaban sincronizados para que el
            // próximo cambio en esta colección los vuelva a intentar subir.
            changed.forEach((item) => ref.current.byKey.delete(getKey(item)));
            ref.current.json = '';
          }
        });
    },
    [isRemoteReady]
  );

  // Claves de sincronización por tabla (ver SyncKeyFn en services/sync.ts). Todas
  // usan el "id" del objeto tal cual, EXCEPTO Rutas e Historial: ahí se usa la
  // clave compuesta id+fecha (getRouteKey) porque el mismo número de ruta puede
  // repetirse legítimamente en fechas distintas.
  //
  // Corrección crítica: antes Rutas/Historial se guardaban en Supabase usando
  // solo el número de ruta ("id") como clave de la fila. Como ese número se
  // repite día a día (rutas recurrentes cargadas por Excel), dos rutas activas
  // el mismo momento pero de fechas distintas competían por la MISMA fila en
  // Supabase: guardar una sobrescribía silenciosamente a la otra, y al
  // eliminarla/depurarla (por ejemplo, al importar el Excel del día siguiente)
  // se borraba la fila compartida, afectando a la ruta de la OTRA fecha también.
  // Esto ocurría aunque el resto de la aplicación ya identificara cada ruta
  // correctamente por id+fecha en memoria — el problema estaba únicamente en
  // cómo se guardaba/borraba en la base de datos compartida.
  const routeSyncKey: SyncKeyFn<Route> = getRouteKey;
  const defaultSyncKey = <T extends { id: string }>(item: T) => item.id;

  // Carga inicial desde Supabase (una sola vez al montar). Si alguna colección
  // llega vacía (primera vez que esta app se conecta a la base de datos), se
  // siembra con los mismos datos con los que ya arrancaba en modo local, para
  // no perder el punto de partida — y se sube esa siembra de una vez.
  //
  // Con Supabase Auth, las tablas solo se pueden leer con sesión iniciada (si
  // se leyeran antes, la base de datos respondería "vacío" y la app creería
  // que no hay datos). Por eso la carga espera a que exista `authUserId`, y
  // se hace una sola vez por pestaña (dataLoadStartedRef).
  const dataLoadStartedRef = useRef(false);
  useEffect(() => {
    // Se espera también al perfil ACTIVO: un usuario sin acceso recibiría
    // tablas "vacías" (por seguridad) y la app las confundiría con datos reales.
    if (!isSupabaseConfigured || !authUserId || !currentUser || dataLoadStartedRef.current) return;
    dataLoadStartedRef.current = true;
    const cancelled = false;

    (async () => {
      try {
        const [remoteRoutes, remoteHistory, remoteTrucks, remoteStaff] = await Promise.all([
          fetchSharedCollection<Route>('app_routes'),
          fetchSharedCollection<Route>('app_historical_routes'),
          fetchSharedCollection<Truck>('app_trucks'),
          fetchSharedCollection<Staff>('app_staff'),
        ]);
        if (cancelled) return;

        // Corrección: fetchSharedCollection devuelve `null` cuando la lectura falla
        // (red/Supabase momentáneamente inalcanzable — algo común justo en una carga
        // en frío, como un Ctrl+F5 o una ventana de incógnito recién abierta tras un
        // deploy) y devuelve `[]` cuando la tabla de verdad está vacía. Antes ambos
        // casos se trataban igual: se sembraba con los datos locales/de ejemplo y esa
        // siembra se subía a Supabase. El problema es que, si la lectura fallaba
        // habiendo ya datos reales compartidos, el navegador quedaba "creyendo" que
        // esa siembra local era el estado real; en cuanto alguien hacía cualquier
        // cambio después, la sincronización comparaba contra ese set de claves
        // equivocado y terminaba BORRANDO en Supabase las rutas/camiones/personal
        // reales que no estuvieran en la siembra accidental. Ahora, si la lectura
        // falla, no se toca nada: se sigue mostrando lo que ya había en
        // memoria/localStorage y no se sube ni se borra nada hasta lograr una
        // lectura real y confiable (en la siguiente recarga).
        function reconcileInitialLoad<T>(
          table: SyncableTable,
          remoteRows: SyncedRow<T>[] | null,
          localList: T[],
          setter: (list: T[]) => void,
          ref: { current: SyncRef },
          getKey: SyncKeyFn<T>
        ) {
          if (remoteRows === null) {
            // Corrección: antes, aunque esta lectura fallara, en cuanto la app
            // quedaba "lista" la sincronización normal subía la copia local
            // (posiblemente vieja o de ejemplo) y PISABA los datos reales en
            // Supabase. Ahora esta tabla queda bloqueada para escritura.
            ref.current = { json: '', byKey: new Map(), blocked: true };
            console.error(
              `No se pudo leer "${table}" de Supabase; no se subirán cambios de esta tabla hasta recargar la página.`
            );
            return;
          }
          // Si un mismo registro quedó guardado dos veces (con la clave anterior y
          // con la nueva — p. ej. al cambiar el formato de clave de rutas para
          // incluir la agencia), se conserva UNA sola copia: la que ya está
          // guardada bajo la clave correcta; si ninguna lo está, la última leída.
          const dedupedByKey = new Map<string, SyncedRow<T>>();
          remoteRows.forEach((row) => {
            const k = getKey(row.data);
            const current = dedupedByKey.get(k);
            if (!current || (current.key !== k && row.key === k) || (current.key !== k && row.key !== k)) {
              dedupedByKey.set(k, row);
            }
          });
          const remoteList = Array.from(dedupedByKey.values()).map((row) => row.data);
          const finalList = remoteList.length > 0 ? remoteList : localList;
          setter(finalList);
          ref.current = {
            json: JSON.stringify(finalList),
            byKey: buildSyncedMap(finalList, getKey),
            blocked: false,
          };
          if (remoteList.length === 0) {
            void pushSharedCollection(table, finalList, getKey);
            return;
          }
          // Corrección: limpieza única de filas guardadas con un esquema de clave
          // anterior (ver el comentario sobre routeSyncKey más arriba). Si una fila
          // remota fue guardada bajo una clave que ya no coincide con la que hoy se
          // calcularía para esos mismos datos (por ejemplo, el número de ruta solo,
          // sin la fecha), se re-sube esa colección bajo la clave correcta y luego
          // se elimina EXPLÍCITAMENTE (por su clave exacta, nunca por diferencia de
          // arreglos) la fila vieja. En cargas siguientes esto ya no encuentra nada
          // que migrar (es una operación segura de repetir).
          const finalKeys = new Set(finalList.map(getKey));
          const legacyKeys = remoteRows.filter((row) => !finalKeys.has(row.key)).map((row) => row.key);
          if (legacyKeys.length > 0) {
            void pushSharedCollection(table, finalList, getKey).then(() =>
              deleteSharedRecords(table, legacyKeys)
            );
          }
        }

        reconcileInitialLoad('app_routes', remoteRoutes, routes, setRoutes, routesSyncRef, routeSyncKey);
        reconcileInitialLoad(
          'app_historical_routes',
          remoteHistory,
          historicalRoutes,
          setHistoricalRoutes,
          historySyncRef,
          routeSyncKey
        );
        reconcileInitialLoad('app_trucks', remoteTrucks, trucks, setTrucks, trucksSyncRef, defaultSyncKey);
        reconcileInitialLoad('app_staff', remoteStaff, staff, setStaff, staffSyncRef, defaultSyncKey);
      } catch (e) {
        console.error('Error cargando datos compartidos de Supabase:', e);
      } finally {
        if (!cancelled) setIsRemoteReady(true);
      }
    })();
    // Solo debe ejecutarse una vez al montar: intencionalmente no depende de
    // routes/trucks/staff/etc. (se usan solo como semilla si Supabase está vacío).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId, currentUser]);

  // Suscripción en tiempo real: refleja cambios hechos por otros usuarios de
  // prueba (en otra computadora) sin necesidad de recargar la página.
  useEffect(() => {
    if (!isSupabaseConfigured || !isRemoteReady) return;

    const unsubscribers = [
      subscribeToSharedCollection<Route>('app_routes', (updater) => {
        setRoutes((prev) => {
          const next = updater(prev);
          markRemoteApplied(routesSyncRef, prev, next, routeSyncKey);
          return next;
        });
      }, routeSyncKey),
      subscribeToSharedCollection<Route>('app_historical_routes', (updater) => {
        setHistoricalRoutes((prev) => {
          const next = updater(prev);
          markRemoteApplied(historySyncRef, prev, next, routeSyncKey);
          return next;
        });
      }, routeSyncKey),
      subscribeToSharedCollection<Truck>('app_trucks', (updater) => {
        setTrucks((prev) => {
          const next = updater(prev);
          markRemoteApplied(trucksSyncRef, prev, next, defaultSyncKey);
          return next;
        });
      }, defaultSyncKey),
      subscribeToSharedCollection<Staff>('app_staff', (updater) => {
        setStaff((prev) => {
          const next = updater(prev);
          markRemoteApplied(staffSyncRef, prev, next, defaultSyncKey);
          return next;
        });
      }, defaultSyncKey),
    ];

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [isRemoteReady]);

  useEffect(() => {
    // Con Supabase, los perfiles se guardan en "app_users" mediante las
    // acciones de administrador (services/auth.ts), no por sincronización.
    if (isSupabaseConfigured) return;
    try {
      localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    } catch (e) {
      console.error(e);
    }
    pushIfChanged('app_users', users, defaultSyncKey, usersSyncRef, usersPushQueueRef);
  }, [users, pushIfChanged]);

  const handleLogin = async (username: string, password: string): Promise<boolean | string> => {
    if (isSupabaseConfigured) {
      setLoginNotice('');
      const error = await signIn(username, password);
      return error ?? true;
    }
    const match = users.find(
      (u) => u.username.toLowerCase() === username.toLowerCase() && u.password === password
    );
    if (!match) return false;
    setCurrentUsername(match.username);
    // Corrección: se registra la fecha/hora del último acceso exitoso, para poder
    // revisar en Usuarios cuentas inactivas o confirmar cuándo entró alguien.
    const loginTimestamp = new Date().toISOString();
    setUsers((prev) =>
      prev.map((u) => (u.id === match.id ? { ...u, lastLogin: loginTimestamp } : u))
    );
    try {
      localStorage.setItem(STORAGE_KEY_SESSION, match.username);
    } catch (e) {
      console.error(e);
    }
    return true;
  };

  const handleLogout = () => {
    if (isSupabaseConfigured) {
      // Recargar deja la aplicación limpia (sin datos en memoria del usuario anterior).
      void signOut().finally(() => window.location.reload());
      return;
    }
    setCurrentUsername(null);
    try {
      localStorage.removeItem(STORAGE_KEY_SESSION);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateUser = (data: {
    username: string;
    password: string;
    nombre?: string;
    isAdmin: boolean;
    permissions: TablePermissions;
    canDelete: boolean;
    agencyAccess: 'all' | string[];
  }): boolean | Promise<boolean> => {
    if (isSupabaseConfigured) {
      return adminCreateUser(data)
        .then((created) => {
          setUsers((prev) => (prev.some((u) => u.id === created.id) ? prev : [...prev, created]));
          showToast(`Usuario "${created.username}" creado exitosamente.`, 'success');
          return true;
        })
        .catch((e: Error) => {
          showToast(e.message, 'error');
          return false;
        });
    }
    const newUser: AppUser = {
      id: `U-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      username: data.username,
      nombre: data.nombre,
      password: data.password,
      isAdmin: data.isAdmin,
      permissions: data.permissions,
      canDelete: data.canDelete,
      agencyAccess: data.agencyAccess,
      createdAt: new Date().toISOString(),
      // Corrección: se registra quién dio de alta la cuenta (siempre un
      // administrador, ya que solo ellos pueden crear usuarios).
      createdBy: currentUser?.nombre || currentUser?.username || 'Sistema',
    };
    setUsers((prev) => [...prev, newUser]);
    showToast(`Usuario "${data.username}" creado exitosamente.`, 'success');
    return true;
  };

  const handleUpdateUser = (
    userId: string,
    updates: Partial<
      Pick<AppUser, 'permissions' | 'canDelete' | 'isAdmin' | 'agencyAccess' | 'username' | 'nombre'>
    >
  ) => {
    if (isSupabaseConfigured) {
      void (async () => {
        try {
          const target = users.find((u) => u.id === userId);
          const { username: requestedUsername, ...profilePatch } = updates;
          if ('nombre' in updates) profilePatch.nombre = updates.nombre?.trim() || undefined;
          const newUsername =
            requestedUsername !== undefined && target && requestedUsername.trim() !== target.username
              ? normalizeUsername(requestedUsername)
              : undefined;
          if (newUsername) await adminRenameUser(userId, newUsername);
          await adminUpdateProfile(userId, profilePatch);
          setUsers((prev) =>
            prev.map((u) =>
              u.id === userId ? { ...u, ...profilePatch, ...(newUsername ? { username: newUsername } : {}) } : u
            )
          );
          if (requestedUsername !== undefined || 'nombre' in updates) {
            showToast('Datos de usuario actualizados.', 'success');
          }
        } catch (e) {
          showToast(`No se pudo actualizar el usuario: ${(e as Error).message}`, 'error');
        }
      })();
      return;
    }
    let finalUpdates: typeof updates = updates;

    if (updates.username !== undefined) {
      const trimmed = updates.username.trim();
      if (!trimmed) {
        showToast('El nombre de usuario no puede quedar vacío.', 'error');
        return;
      }
      const duplicate = users.some(
        (u) => u.id !== userId && u.username.toLowerCase() === trimmed.toLowerCase()
      );
      if (duplicate) {
        showToast('Ya existe un usuario con ese nombre.', 'error');
        return;
      }
      finalUpdates = { ...finalUpdates, username: trimmed };
    }
    if (updates.nombre !== undefined) {
      finalUpdates = { ...finalUpdates, nombre: updates.nombre.trim() || undefined };
    }

    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, ...finalUpdates } : u)));

    // Si el usuario en sesión cambió su propio nombre de usuario, se actualiza la
    // sesión activa para que no quede desincronizada (evita un "logout" implícito).
    if (finalUpdates.username && currentUser && userId === currentUser.id) {
      setCurrentUsername(finalUpdates.username);
      try {
        localStorage.setItem(STORAGE_KEY_SESSION, finalUpdates.username);
      } catch (e) {
        console.error(e);
      }
    }

    if (finalUpdates.username || finalUpdates.nombre !== undefined) {
      showToast('Datos de usuario actualizados.', 'success');
    }
  };

  const handleResetPassword = (userId: string, newPassword: string) => {
    if (isSupabaseConfigured) {
      adminSetPassword(userId, newPassword)
        .then(() => showToast('Contraseña actualizada.', 'success'))
        .catch((e: Error) => showToast(e.message, 'error'));
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, password: newPassword } : u)));
    showToast('Contraseña actualizada.', 'success');
  };

  const handleDeleteUser = (userId: string) => {
    if (isSupabaseConfigured) {
      const target = users.find((u) => u.id === userId);
      if (userId === currentUser?.id) {
        showToast('No puedes eliminar tu propio usuario.', 'error');
        return;
      }
      adminDeleteUser(userId)
        .then(() => {
          setUsers((prev) => prev.filter((u) => u.id !== userId));
          showToast(`Usuario "${target?.username || ''}" eliminado.`, 'info');
        })
        .catch((e: Error) => showToast(e.message, 'error'));
      return;
    }
    let didDelete = false;
    setUsers((prev) => {
      const target = prev.find((u) => u.id === userId);
      if (!target) return prev;
      const remainingAdmins = prev.filter((u) => u.isAdmin && u.id !== userId).length;
      if (target.isAdmin && remainingAdmins === 0) {
        showToast('Debe existir al menos un usuario administrador.', 'error');
        return prev;
      }
      showToast(`Usuario "${target.username}" eliminado.`, 'info');
      didDelete = true;
      return prev.filter((u) => u.id !== userId);
    });
    // Borrado explícito en Supabase (ver la nota de seguridad en
    // pushSharedCollection): la sincronización normal ya nunca borra por su
    // cuenta, así que cada acción que realmente elimina algo debe pedirlo
    // directamente, con la clave exacta de lo que se quitó.
    if (didDelete) {
      void deleteSharedRecords('app_users', [userId]);
    }
  };

  // Confirmación de acciones delicadas en Usuarios con la contraseña del admin.
  const handleVerifyPassword = async (password: string): Promise<boolean> => {
    if (!currentUser) return false;
    if (isSupabaseConfigured) return verifyOwnPassword(currentUser.username, password);
    return password === currentUser.password;
  };

  // Permisos efectivos del usuario en sesión (un administrador siempre tiene acceso total)
  const canView = (key: keyof TablePermissions) => !!currentUser && (currentUser.isAdmin || currentUser.permissions[key]);
  const canDeleteData = !!currentUser && (currentUser.isAdmin || currentUser.canDelete);
  // Corrección: la carga masiva de Excel (Camiones/Personal) se controla con un
  // permiso independiente, pero AGREGAR MANUALMENTE ya no es un permiso aparte:
  // si el usuario puede visualizar Camiones/Personal (permiso "trucks"/"staff"),
  // automáticamente puede agregar manualmente en esa tabla — la única pregunta
  // adicional que se le hace al administrador es si además puede cargar Excel
  // masivo. Se usa "!== false" (no "=== true") para el permiso de Excel a
  // propósito: los usuarios creados antes de este cambio no tienen este campo
  // guardado todavía (queda undefined), y así se les sigue permitiendo lo que ya
  // podían hacer hasta que un administrador los restrinja explícitamente en
  // "Usuarios".
  const canManualAddTrucks = canView('trucks');
  const canManualAddStaff = canView('staff');
  const canBulkUploadTrucks =
    !!currentUser &&
    (currentUser.isAdmin || (canView('trucks') && currentUser.permissions.canBulkUploadTrucks !== false));
  const canBulkUploadStaff =
    !!currentUser &&
    (currentUser.isAdmin || (canView('staff') && currentUser.permissions.canBulkUploadStaff !== false));

  // Control de acceso por agencia: un usuario sin acceso "all" (o sin el campo,
  // por compatibilidad con datos previos) solo puede ver rutas de las agencias
  // que el administrador le haya asignado en el apartado "Usuarios".
  const canViewAgency = (agencyName: string) => {
    if (!currentUser) return true;
    if (currentUser.isAdmin) return true;
    const access = currentUser.agencyAccess;
    if (!access || access === 'all') return true;
    return Array.isArray(access) && access.includes(agencyName);
  };

  // Agencias a las que el usuario en sesión puede CARGAR rutas por Excel: todas
  // para un administrador o un usuario con acceso "all"; si no, solo las que
  // tiene asignadas en Usuarios.
  const importAgencyOptions = useMemo(() => {
    if (!currentUser) return [] as string[];
    const access = currentUser.agencyAccess;
    if (currentUser.isAdmin || !access || access === 'all') return AGENCIA_LOCATION_OPTIONS;
    return AGENCIA_LOCATION_OPTIONS.filter((ag) => Array.isArray(access) && access.includes(ag)).concat(
      (Array.isArray(access) ? access : []).filter((ag) => !AGENCIA_LOCATION_OPTIONS.includes(ag))
    );
  }, [currentUser]);

  const [activeTab, setActiveTab] = useState<ActiveTab>('board');
  // Menú lateral oculto/visible (se recuerda en este navegador).
  const [railCollapsed, setRailCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('dc_rail_collapsed') === '1';
    } catch {
      return false;
    }
  });
  const toggleRail = () => {
    setRailCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('dc_rail_collapsed', next ? '1' : '0');
      } catch {
        /* sin almacenamiento: solo dura esta sesión */
      }
      return next;
    });
  };
  // Indicadores del módulo de Rutas Liquidadas (los calcula esa vista según sus filtros).
  const [liqKpis, setLiqKpis] = useState<LiquidatedKpis | null>(null);

  // Si el usuario en sesión no tiene permiso para ver la pestaña activa (por ejemplo,
  // justo después de iniciar sesión o si el administrador le quitó un permiso),
  // se redirige automáticamente a la primera pestaña a la que sí tenga acceso.
  useEffect(() => {
    if (!currentUser) return;
    const tabPermissionKey: Partial<Record<ActiveTab, keyof TablePermissions>> = {
      dashboard: 'dashboard',
      board: 'board',
      liquidated: 'liquidated',
      trucks: 'trucks',
      staff: 'staff',
      batch: 'batch',
    };
    if (activeTab === 'users') {
      if (!currentUser.isAdmin) setActiveTab('board');
      return;
    }
    const key = tabPermissionKey[activeTab];
    if (key && !canView(key)) {
      const fallback = (['dashboard', 'board', 'liquidated', 'trucks', 'staff', 'batch'] as ActiveTab[]).find(
        (t) => canView(tabPermissionKey[t] as keyof TablePermissions)
      );
      setActiveTab(fallback || (currentUser.isAdmin ? 'users' : 'board'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, activeTab]);

  const [selectedAgency, setSelectedAgency] = useState<string>('TODAS');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Modals state
  const [isNewRouteModalOpen, setIsNewRouteModalOpen] = useState(false);
  const [isRouteTypeSelectModalOpen, setIsRouteTypeSelectModalOpen] = useState(false);
  const [isTrasladoRouteModalOpen, setIsTrasladoRouteModalOpen] = useState(false);
  const [splitRouteTarget, setSplitRouteTarget] = useState<Route | null>(null);
  const [revertSplitTarget, setRevertSplitTarget] = useState<Route | null>(null);
  const [assignTarget, setAssignTarget] = useState<Route | null>(null);
  const [liquidateTarget, setLiquidateTarget] = useState<Route | null>(null);
  // Ruta seleccionada para registrar su "Liquidación Final" (cierre del pendiente
  // de validar caja/boleta de una liquidación previa en estado Caja Abierta).
  const [finalizeCajaAbiertaTarget, setFinalizeCajaAbiertaTarget] = useState<Route | null>(null);
  const [receiptTarget, setReceiptTarget] = useState<Route | null>(null);
  const [receiptConsolidatedSiblings, setReceiptConsolidatedSiblings] = useState<Route[] | undefined>(undefined);
  const [isNewTruckModalOpen, setIsNewTruckModalOpen] = useState(false);
  const [isNewStaffModalOpen, setIsNewStaffModalOpen] = useState(false);
  const [isDailySummaryModalOpen, setIsDailySummaryModalOpen] = useState(false);
  const [dailySummaryMode, setDailySummaryMode] = useState<'inicio' | 'fin'>('inicio');
  const [isClosingActaModalOpen, setIsClosingActaModalOpen] = useState(false);
  const [deleteRoutesTargetIds, setDeleteRoutesTargetIds] = useState<string[] | null>(null);
  const [isUnassignedResourcesModalOpen, setIsUnassignedResourcesModalOpen] = useState(false);

  const handleOpenDailySummary = (mode: 'inicio' | 'fin' = 'inicio') => {
    setDailySummaryMode(mode);
    setIsDailySummaryModalOpen(true);
  };

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ROUTES, JSON.stringify(routes));
    } catch (e) {
      console.error(e);
    }
    pushIfChanged('app_routes', routes, routeSyncKey, routesSyncRef, routesPushQueueRef);
  }, [routes, pushIfChanged]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_TRUCKS, JSON.stringify(trucks));
    } catch (e) {
      console.error(e);
    }
    pushIfChanged('app_trucks', trucks, defaultSyncKey, trucksSyncRef, trucksPushQueueRef);
  }, [trucks, pushIfChanged]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_STAFF, JSON.stringify(staff));
    } catch (e) {
      console.error(e);
    }
    pushIfChanged('app_staff', staff, defaultSyncKey, staffSyncRef, staffPushQueueRef);
  }, [staff, pushIfChanged]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(historicalRoutes));
    } catch (e) {
      console.error(e);
    }
    pushIfChanged('app_historical_routes', historicalRoutes, routeSyncKey, historySyncRef, historyPushQueueRef);
  }, [historicalRoutes, pushIfChanged]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // Avisos en pantalla cuando falla la lectura/escritura en la base de datos
  // compartida (ver setSyncErrorHandler en services/sync.ts). Se limita a un
  // aviso cada 10 segundos para no llenar la pantalla si la red se cae.
  const lastSyncToastRef = useRef(0);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    setSyncErrorHandler((message) => {
      const now = Date.now();
      if (now - lastSyncToastRef.current < 10000) return;
      lastSyncToastRef.current = now;
      showToast(`⚠ ${message} Revisa tu conexión y recarga la página.`, 'error');
    });
    return () => setSyncErrorHandler(null);
  }, [showToast]);

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Distinct agencies (solo las que el usuario en sesión tiene permiso de ver)
  // Corrección: antes solo aparecían agencias que ya tuvieran rutas cargadas, así
  // que una agencia nueva (p. ej. Barberena) no se podía elegir en el filtro
  // superior, el Resumen Diario ni el Acta de Cierre hasta tener datos. Ahora
  // se parte de la lista oficial (data/agencies.ts) y se agregan las que
  // aparezcan en los datos con otro nombre.
  const agencies = useMemo(() => {
    const set = new Set<string>(AGENCIA_LOCATION_OPTIONS);
    routes.forEach((r) => {
      if (r.agencia) set.add(r.agencia);
    });
    historicalRoutes.forEach((r) => {
      if (r.agencia) set.add(r.agencia);
    });
    return Array.from(set).filter((ag) => canViewAgency(ag));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, historicalRoutes, currentUser]);

  // Filtro superior de Agencia: solo las agencias que tienen rutas ACTIVAS en el
  // Tablero (todo lo que no está Liquidada) y que el usuario en sesión tiene
  // permiso de ver. El Resumen Diario y el Acta de Cierre siguen usando la lista
  // completa (`agencies`).
  const boardAgencies = useMemo(() => {
    const set = new Set<string>();
    routes.forEach((r) => {
      if (r.agencia && r.estado !== 'Liquidada' && canViewAgency(r.agencia)) set.add(r.agencia);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, currentUser]);

  // Si la agencia elegida en el filtro superior ya no tiene rutas activas (o el
  // usuario perdió el permiso), se vuelve a "Todas las Agencias".
  useEffect(() => {
    if (selectedAgency !== 'TODAS' && !boardAgencies.includes(selectedAgency)) {
      setSelectedAgency('TODAS');
    }
  }, [boardAgencies, selectedAgency]);

  // Unified collection of all liquidated routes (including each completed trip: Primer Viaje and Revisita)
  const allLiquidatedRoutes = useMemo(() => {
    const list: Route[] = [];
    const map = new Map<string, Route>();

    // Cada registro se identifica por su ID de ruta MÁS su fecha de liquidación (o un
    // marcador "activa" cuando aún no se ha liquidado). Esto evita que una ruta nueva
    // del día de hoy que reutiliza el mismo número/ID que una ruta ya liquidada y
    // archivada de un día anterior "tape" ese registro histórico en el tablero de
    // Rutas Liquidadas (los números de ruta del Excel suelen repetirse día a día).
    const keyFor = (r: Route) => {
      const liqDate = r.fechaLiquidacion || r.liquidacion?.fechaLiquidacion;
      return liqDate ? `${r.id}__${liqDate}__${r.agencia || ''}` : `${r.id}__activa__${r.agencia || ''}`;
    };

    // Merge historicalRoutes and routes (active state takes precedence if updated)
    historicalRoutes.forEach((r) => {
      map.set(keyFor(r), r);
    });
    routes.forEach((r) => {
      map.set(keyFor(r), r);
    });

    map.forEach((r) => {
      const pastDispatches = r.historialDespachos || [];

      if (pastDispatches.length > 0) {
        // Output each previous completed dispatch as an individual liquidated trip record
        pastDispatches.forEach((d) => {
          const isFirstTrip = d.intento === 1;
          const wasRecarga =
            d.tipoAsignacion === 'Recarga' ||
            (isFirstTrip && (r.esRecarga || r.tipoAsignacion === 'Recarga'));
          const priorTripTipo: AssignmentType =
            wasRecarga ? 'Recarga' : isFirstTrip ? 'Primer Viaje' : 'Revisita';
          const priorTripRoute: Route = {
            ...r,
            id: r.id,
            estado: 'Liquidada',
            tipoAsignacion: priorTripTipo,
            esRecarga: priorTripTipo === 'Recarga',
            esReasignacion: priorTripTipo === 'Revisita',
            historialDespachos: [],
            tripNumber: d.intento,
            totalTrips: r.totalTrips || (pastDispatches.length + (r.estado === 'Liquidada' ? 1 : 0)),
            paradas:
              ((d.guiasExitosas || 0) + (d.guiasRechazadas || 0)) > 0
                ? (d.guiasExitosas || 0) + (d.guiasRechazadas || 0)
                : r.paradasOriginales || r.paradas,
            cajasFisicas:
              (d.cajasEntregadas + d.cajasDevueltas) > 0
                ? d.cajasEntregadas + d.cajasDevueltas
                : r.cajasOriginales || r.cajasFisicas,
            fecha: r.fecha,
            fechaOriginalRuta: r.fechaOriginalRuta || r.fecha,
            fechaAsignacion: d.fechaAsignacion || r.fechaAsignacion || r.asignacion?.fechaAsignacion,
            fechaLiquidacion: d.fechaRetorno,
            asignacion: {
              camionPlaca: d.camionPlaca,
              camionId: d.camionId,
              conductor: d.conductor,
              auxiliar1: d.auxiliares?.[0] || null,
              auxiliar2: d.auxiliares?.[1] || null,
              auxiliar3: d.auxiliares?.[2] || null,
              auxiliar4: d.auxiliares?.[3] || null,
              horaSalida: d.horaSalida || '06:00',
              fechaAsignacion: d.fechaAsignacion || r.fechaAsignacion || r.asignacion?.fechaAsignacion,
              tipoAsignacion: priorTripTipo,
            },
            ultimoDespacho: {
              camionPlaca: d.camionPlaca,
              camionId: d.camionId,
              conductor: d.conductor,
              auxiliar1: d.auxiliares?.[0] || null,
              auxiliar2: d.auxiliares?.[1] || null,
              auxiliar3: d.auxiliares?.[2] || null,
              auxiliar4: d.auxiliares?.[3] || null,
              horaSalida: d.horaSalida || '06:00',
              tipoAsignacion: priorTripTipo,
            },
            liquidacion: {
              guiasExitosas: d.guiasExitosas ?? 0,
              guiasRechazadas: d.guiasRechazadas ?? 0,
              cajasEntregadas: d.cajasEntregadas,
              cajasDevueltas: d.cajasDevueltas,
              motivoDevolucion: d.motivoDevolucion,
              auditor: d.auditor,
              fechaLiquidacion: d.fechaRetorno,
            },
            motivoDevolucion: d.motivoDevolucion,
          };
          list.push(priorTripRoute);
        });

        // If the route itself is also liquidated, add the final completed trip
        if (r.estado === 'Liquidada') {
          const finalTripLiq = r.liquidacion;
          const isFullDelivered =
            (!finalTripLiq?.cajasDevueltas || finalTripLiq.cajasDevueltas === 0) &&
            (!finalTripLiq?.guiasRechazadas || finalTripLiq.guiasRechazadas === 0);
          const cleanMotivo = isFullDelivered ? '' : (finalTripLiq?.motivoDevolucion || '');

          const finalTripTipo: AssignmentType =
            r.asignacion?.tipoAsignacion ||
            r.tipoAsignacion ||
            (r.esRecarga ? 'Recarga' : r.esReasignacion ? 'Revisita' : 'Primer Viaje');

          const finalTripRoute: Route = {
            ...r,
            id: r.id,
            estado: 'Liquidada',
            fecha: r.fecha,
            fechaOriginalRuta: r.fechaOriginalRuta || r.fecha,
            fechaAsignacion: r.fechaAsignacion || r.asignacion?.fechaAsignacion,
            fechaLiquidacion: r.fechaLiquidacion || r.liquidacion?.fechaLiquidacion,
            tipoAsignacion: finalTripTipo,
            esRecarga: finalTripTipo === 'Recarga',
            esReasignacion: finalTripTipo === 'Revisita',
            historialDespachos: [],
            tripNumber: pastDispatches.length + 1,
            totalTrips: r.totalTrips || (pastDispatches.length + 1),
            motivoDevolucion: cleanMotivo,
            asignacion: r.asignacion
              ? {
                  ...r.asignacion,
                  tipoAsignacion: finalTripTipo,
                }
              : null,
            ultimoDespacho: r.ultimoDespacho
              ? {
                  ...r.ultimoDespacho,
                  tipoAsignacion: finalTripTipo,
                }
              : null,
            liquidacion: finalTripLiq
              ? {
                  ...finalTripLiq,
                  motivoDevolucion: cleanMotivo,
                }
              : null,
          };
          list.push(finalTripRoute);
        }
      } else if (r.estado === 'Liquidada') {
        // Normal single liquidated route
        const tipoAsig: AssignmentType =
          r.esRecarga || r.tipoAsignacion === 'Recarga' || r.asignacion?.tipoAsignacion === 'Recarga'
            ? 'Recarga'
            : r.aPiso || r.tipoAsignacion === 'Ruta a Piso'
            ? 'Ruta a Piso'
            : r.tipoAsignacion === 'Revisita' || r.esReasignacion || r.asignacion?.tipoAsignacion === 'Revisita'
            ? 'Revisita'
            : 'Primer Viaje';

        list.push({
          ...r,
          fecha: r.fecha,
          fechaOriginalRuta: r.fechaOriginalRuta || r.fecha,
          fechaAsignacion: r.fechaAsignacion || r.asignacion?.fechaAsignacion,
          fechaLiquidacion: r.fechaLiquidacion || r.liquidacion?.fechaLiquidacion,
          tipoAsignacion: tipoAsig,
        });
      }
    });

    return list
      .filter((r) => canViewAgency(r.agencia))
      .sort((a, b) => {
        // Si pertenecen a la misma ruta matriz/ID, el primer despacho (Recarga) aparece primero y luego la Revisita
        if (a.id === b.id && a.tripNumber && b.tripNumber) {
          return a.tripNumber - b.tripNumber;
        }
        const timeA = a.liquidacion?.fechaLiquidacion
          ? new Date(a.liquidacion.fechaLiquidacion).getTime()
          : 0;
        const timeB = b.liquidacion?.fechaLiquidacion
          ? new Date(b.liquidacion.fechaLiquidacion).getTime()
          : 0;
        return timeB - timeA;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, historicalRoutes, currentUser]);

  // Filtered routes for the active dashboard (Liquidated routes are excluded and moved to Tablero de Rutas Liquidadas)
  const filteredActiveRoutes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return routes.filter((r) => {
      // Liquidated routes disappear from active board
      if (r.estado === 'Liquidada') return false;

      if (!canViewAgency(r.agencia)) return false;

      const matchesAgency = selectedAgency === 'TODAS' || r.agencia === selectedAgency;
      if (!matchesAgency) return false;

      if (!q) return true;

      const asig = r.asignacion;
      const matchSearch =
        String(r.id).toLowerCase().includes(q) ||
        String(r.agencia || '').toLowerCase().includes(q) ||
        String(r.mercado || '').toLowerCase().includes(q) ||
        String(r.segmento || '').toLowerCase().includes(q) ||
        (r.fecha && String(r.fecha).toLowerCase().includes(q)) ||
        (asig && asig.camionPlaca.toLowerCase().includes(q)) ||
        (asig && asig.conductor.toLowerCase().includes(q)) ||
        (asig && asig.auxiliar1 && asig.auxiliar1.toLowerCase().includes(q)) ||
        (asig && asig.auxiliar2 && asig.auxiliar2.toLowerCase().includes(q)) ||
        (asig && asig.auxiliar3 && asig.auxiliar3.toLowerCase().includes(q));

      return matchSearch;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, selectedAgency, searchQuery, currentUser]);

  // Rutas del día (todos los estados) visibles para el usuario, respetando la
  // agencia seleccionada en la barra superior y su permiso de acceso por agencia.
  // Se reutiliza tanto en las estadísticas del tablero como en el Dashboard.
  const dashboardRoutes = useMemo(
    () =>
      routes.filter(
        (r) => (selectedAgency === 'TODAS' || r.agencia === selectedAgency) && canViewAgency(r.agencia)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routes, selectedAgency, currentUser]
  );

  // Rutas liquidadas visibles para el usuario, respetando la agencia seleccionada.
  const dashboardLiquidatedRoutes = useMemo(
    () => allLiquidatedRoutes.filter((r) => selectedAgency === 'TODAS' || r.agencia === selectedAgency),
    [allLiquidatedRoutes, selectedAgency]
  );

  // Camiones y Personal visibles según la agencia seleccionada en la barra superior.
  // Los registros que todavía no tengan agencia asignada (creados antes de este
  // campo) se mantienen siempre visibles para que se puedan corregir por Carga
  // Masiva de Excel, sin importar el filtro de agencia activo.
  //
  // Corrección: además del filtro de la barra superior, se aplica el permiso de
  // agencia del usuario (canViewAgency). Antes, un usuario restringido a una sola
  // agencia podía dejar el selector en "-- Todas las Agencias --" (disponible
  // para todos) y ver igual los camiones/personal de agencias a las que no tenía
  // acceso — el permiso solo se aplicaba a las Rutas, no a estos dos módulos.
  const visibleTrucks = useMemo(
    () =>
      trucks.filter(
        (t) =>
          (selectedAgency === 'TODAS' || t.agencia === selectedAgency) &&
          (!t.agencia || canViewAgency(t.agencia))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trucks, selectedAgency, currentUser]
  );
  const visibleStaff = useMemo(
    () =>
      staff.filter(
        (s) =>
          (selectedAgency === 'TODAS' || s.agencia === selectedAgency) &&
          (!s.agencia || canViewAgency(s.agencia))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [staff, selectedAgency, currentUser]
  );

  // Rutas activas (no liquidadas) visibles para el usuario SIN aplicar el filtro de
  // agencia seleccionada arriba, usadas para mostrar la distribución entre agencias
  // en el Dashboard.
  const activeRoutesVisibleAllAgencies = useMemo(
    () => routes.filter((r) => r.estado !== 'Liquidada' && canViewAgency(r.agencia)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routes, currentUser]
  );

  // Dashboard KPI stats
  const stats = useMemo(() => {
    const todayDateStr = formatDateToGuatemala(new Date());

    // Identificar la fecha operativa activa de la jornada (detectando la fecha predominante en las rutas)
    const dateCounts: Record<string, number> = {};
    routes.forEach((r) => {
      const d = r.fecha ? formatDateToGuatemala(r.fecha) : null;
      if (d) dateCounts[d] = (dateCounts[d] || 0) + 1;
    });
    const predominantDate = Object.entries(dateCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const activeOperationDate = predominantDate || todayDateStr;

    const scoped = dashboardRoutes;
    const liqScoped = dashboardLiquidatedRoutes;

    // Identificador de ruta trasladada a piso (queda en bodega para mañana)
    const isFloor = (r: Route) =>
      Boolean(
        r.aPiso ||
        r.tipoAsignacion === 'Ruta a Piso' ||
        r.asignacion?.tipoAsignacion === 'Ruta a Piso'
      );

    // 1. Rutas Pendientes estrictamente por asignar camión y tripulación para salir a reparto hoy
    // Las rutas trasladadas a piso NO se cuentan como pendientes por asignar hoy
    const pendientesCount = scoped.filter(
      (r) => r.estado === 'Pendiente' && !isFloor(r)
    ).length;

    // 2. Rutas en Tránsito en la jornada
    const transitoCount = scoped.filter((r) => r.estado === 'En Tránsito').length;

    // 3. Rutas Abiertas / Con Devolución en la jornada
    const abiertasCount = scoped.filter((r) => r.estado === 'Abierta').length;

    // 4. Rutas a Piso del Día:
    // Rutas activas del tablero que fueron enviadas a piso en la jornada actual
    const isFloorOfToday = (r: Route) => {
      if (!isFloor(r)) return false;
      const pDate = r.fechaPiso ? formatDateToGuatemala(r.fechaPiso) : null;
      const rDate = r.fecha ? formatDateToGuatemala(r.fecha) : null;
      const origDate = r.fechaOriginalRuta ? formatDateToGuatemala(r.fechaOriginalRuta) : null;
      return (
        pDate === todayDateStr ||
        pDate === activeOperationDate ||
        rDate === todayDateStr ||
        rDate === activeOperationDate ||
        origDate === todayDateStr ||
        origDate === activeOperationDate
      );
    };

    const pisoHoyCount = scoped.filter((r) => isFloorOfToday(r)).length;

    // 5. Liquidadas en el día (lo realizado efectivamente en la jornada de hoy)
    const liqHoy = liqScoped.filter((r) => {
      const liqDateStr = r.liquidacion?.fechaLiquidacion
        ? formatDateToGuatemala(r.liquidacion.fechaLiquidacion)
        : r.fechaLiquidacion
        ? formatDateToGuatemala(r.fechaLiquidacion)
        : null;

      const rDateStr = r.fecha ? formatDateToGuatemala(r.fecha) : null;
      const origDateStr = r.fechaOriginalRuta ? formatDateToGuatemala(r.fechaOriginalRuta) : null;

      return (
        liqDateStr === todayDateStr ||
        liqDateStr === activeOperationDate ||
        rDateStr === todayDateStr ||
        rDateStr === activeOperationDate ||
        origDateStr === todayDateStr ||
        origDateStr === activeOperationDate
      );
    });

    // Consolidación de todas las rutas de la jornada para el cálculo de Cajas Físicas del Día
    const allDayMap = new Map<string, Route>();
    scoped.forEach((r) => allDayMap.set(String(r.id), r));
    liqHoy.forEach((r) => {
      if (!allDayMap.has(String(r.id))) {
        allDayMap.set(String(r.id), r);
      }
    });

    const dayRoutesList = Array.from(allDayMap.values());
    const cajasFisicasTotalHoy = dayRoutesList.reduce((acc, r) => {
      const c = Number(r.cajasFisicas || r.cajasOriginales || 0);
      return acc + (isNaN(c) ? 0 : c);
    }, 0);

    const cajasEntregadasTotalHoy = liqHoy.reduce((acc, r) => {
      const c = Number(r.liquidacion?.cajasEntregadas ?? (r.cajasFisicas || 0));
      return acc + (isNaN(c) ? 0 : c);
    }, 0);

    return {
      pendientes: pendientesCount,
      transito: transitoCount,
      abiertas: abiertasCount,
      liquidadas: liqHoy.length,
      liquidadasTotal: liqScoped.length,
      pisoHoy: pisoHoyCount,
      fechaHoy: activeOperationDate,
      cajasFisicasHoy: cajasFisicasTotalHoy,
      cajasEntregadasHoy: cajasEntregadasTotalHoy,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, dashboardRoutes, dashboardLiquidatedRoutes]);

  // Actions
  const handleCreateRoute = (newRouteData: Partial<Route>) => {
    const id = String(newRouteData.id);
    if (routes.some((r) => String(r.id) === id)) {
      showToast(`El ID de ruta ${id} ya está registrado`, 'error');
      return;
    }

    const routeDate = formatDateToGuatemala(newRouteData.fecha || new Date());
    const created: Route = {
      id,
      agencia: newRouteData.agencia || 'Mercado Abierto',
      mercado: newRouteData.mercado || 'Mercado Abierto',
      fecha: routeDate,
      fechaOriginalRuta: routeDate,
      viaje: newRouteData.viaje || '02:00',
      servicio: newRouteData.servicio || '08:00',
      descanso: newRouteData.descanso || '00:45',
      total: newRouteData.total || '10:45',
      distancia: newRouteData.distancia || 30.0,
      paradas: newRouteData.paradas || 1,
      equipoFrio: newRouteData.equipoFrio || 0,
      capacidadPorc: newRouteData.capacidadPorc || '100%',
      cajas12Oz: newRouteData.cajas12Oz || 0,
      pesoKg: newRouteData.pesoKg || 0,
      cajasFisicas: newRouteData.cajasFisicas || 0,
      estado: 'Pendiente',
      asignacion: null,
      liquidacion: null,
      fechaCarga: formatDateTimeToGuatemala(new Date()),
      fechaCreacion: formatDateTimeToGuatemala(new Date()),
      tipoRuta: newRouteData.tipoRuta || 'Entrega',
      origen: newRouteData.origen,
      destino: newRouteData.destino,
      razonTraslado: newRouteData.razonTraslado,
      razonTrasladoDetalle: newRouteData.razonTrasladoDetalle,
    };

    setRoutes((prev) => [created, ...prev]);
    setIsNewRouteModalOpen(false);
    setIsTrasladoRouteModalOpen(false);
    showToast(`Ruta ${created.id} creada en estado Pendiente`, 'success');
  };

  const handleConfirmSplit = (originalRoute: Route, childRoutes: Route[]) => {
    setRoutes((prev) => {
      const idx = prev.findIndex((r) => getRouteKey(r) === getRouteKey(originalRoute));
      if (idx === -1) return prev;
      const copy = [...prev];
      copy.splice(idx, 1, ...childRoutes);
      return copy;
    });
    setSplitRouteTarget(null);
    // Borrado explícito en Supabase: la ruta original queda reemplazada por sus
    // viajes hijos bajo IDs distintos, así que su clave compuesta (id+fecha) ya
    // no aparece en el arreglo — hay que pedir su borrado a propósito en vez de
    // depender de una sincronización que infiera la diferencia.
    void deleteSharedRecords('app_routes', [getRouteKey(originalRoute)]);
    showToast(
      `Ruta ${originalRoute.id} dividida en ${childRoutes.length} viajes independientes.`,
      'success'
    );
  };

  const handleConfirmRevert = (parentRouteId: string) => {
    const siblings = routes.filter(
      (r) =>
        r.parentRouteId === parentRouteId ||
        (r.isSplitRoute && String(r.id).startsWith(parentRouteId + '.'))
    );

    if (siblings.length === 0) return;

    if (siblings.some((s) => s.estado === 'Liquidada')) {
      showToast('No se puede revertir porque al menos uno de los viajes ya fue liquidado.', 'error');
      setRevertSplitTarget(null);
      return;
    }

    // Corrección: antes solo se bloqueaba la reversión si un viaje ya estaba
    // Liquidado, pero un viaje "En Tránsito" significa que el camión ya salió
    // físicamente con esa carga — revertir en ese momento reconstruye la ruta
    // matriz y podía perder el contexto operativo de ese viaje en curso.
    if (siblings.some((s) => s.estado === 'En Tránsito')) {
      showToast(
        'No se puede revertir porque al menos uno de los viajes ya está En Tránsito (el camión ya salió con esa carga).',
        'error'
      );
      setRevertSplitTarget(null);
      return;
    }

    // Free resources considering other active routes sharing trucks or staff
    const otherActiveRoutes = routes.filter(
      (r) => !siblings.some((s) => String(s.id) === String(r.id)) && r.estado === 'En Tránsito' && r.asignacion
    );

    siblings.forEach((s) => {
      if (s.asignacion) {
        if (s.asignacion.camionId) {
          const remainingUsingTruck = otherActiveRoutes.filter(
            (r) => r.asignacion?.camionId === s.asignacion?.camionId
          );
          setTrucks((prev) =>
            prev.map((t) => {
              if (t.id === s.asignacion?.camionId) {
                if (remainingUsingTruck.length > 0) {
                  return {
                    ...t,
                    estado: 'En Ruta',
                    rutaActual: remainingUsingTruck.map((r) => r.id).join(', '),
                  };
                }
                return { ...t, estado: 'Disponible', rutaActual: null };
              }
              return t;
            })
          );
        }
        const crewNames = [
          s.asignacion.conductor,
          s.asignacion.auxiliar1,
          s.asignacion.auxiliar2,
          s.asignacion.auxiliar3,
          s.asignacion.auxiliar4,
        ].filter(Boolean) as string[];

        setStaff((prev) =>
          prev.map((st) => {
            if (crewNames.includes(st.nombre)) {
              if (st.estado === 'Baja') return st;
              const stillInOther = otherActiveRoutes.some((r) =>
                [
                  r.asignacion?.conductor,
                  r.asignacion?.auxiliar1,
                  r.asignacion?.auxiliar2,
                  r.asignacion?.auxiliar3,
                  r.asignacion?.auxiliar4,
                ].includes(st.nombre)
              );
              return stillInOther ? { ...st, estado: 'En Ruta' } : { ...st, estado: 'Disponible' };
            }
            return st;
          })
        );
      }
    });

    // Corrección: al revertir una partición, cualquier historial de despacho
    // (entregas/devoluciones ya registradas) que se hubiera acumulado en los
    // viajes individuales se descartaba silenciosamente al reconstruir la ruta
    // matriz. Ahora se conserva, combinando el historial de todos los viajes.
    const combinedHistorial = siblings.reduce<typeof siblings[number]['historialDespachos']>(
      (acc, s) => (s.historialDespachos && s.historialDespachos.length > 0 ? [...(acc || []), ...s.historialDespachos] : acc),
      undefined
    );

    let restoredRoute: Route;
    if (siblings[0].originalRouteData) {
      restoredRoute = {
        ...JSON.parse(JSON.stringify(siblings[0].originalRouteData)),
        estado: 'Pendiente',
        asignacion: null,
        liquidacion: null,
        ...(combinedHistorial ? { historialDespachos: combinedHistorial } : {}),
      };
    } else {
      const sumParadas = siblings.reduce((acc, s) => acc + (parseInt(String(s.paradas)) || 0), 0);
      const sumCajas = siblings.reduce(
        (acc, s) => acc + (parseFloat(String(s.cajasFisicas)) || 0),
        0
      );
      restoredRoute = {
        id: parentRouteId,
        agencia: siblings[0].agencia,
        mercado: siblings[0].mercado || 'Mercado Abierto',
        fecha: siblings[0].fecha,
        viaje: siblings[0].viaje || '02:00',
        servicio: siblings[0].servicio || '08:00',
        descanso: siblings[0].descanso || '00:45',
        total: siblings[0].total || '10:45',
        distancia: siblings[0].distancia || '30.0',
        paradas: sumParadas,
        equipoFrio: siblings[0].equipoFrio || 0,
        capacidadPorc: siblings[0].capacidadPorc || '100%',
        cajas12Oz: siblings[0].cajas12Oz || 0,
        pesoKg: siblings[0].pesoKg || 0,
        cajasFisicas: sumCajas,
        estado: 'Pendiente',
        asignacion: null,
        liquidacion: null,
        fechaCarga: siblings[0].fechaCarga || new Date().toISOString().slice(0, 16).replace('T', ' '),
        fechaCreacion:
          siblings[0].fechaCreacion || new Date().toISOString().slice(0, 16).replace('T', ' '),
        ...(combinedHistorial ? { historialDespachos: combinedHistorial } : {}),
      };
    }

    setRoutes((prev) => {
      const firstIdx = prev.findIndex(
        (r) =>
          r.parentRouteId === parentRouteId ||
          (r.isSplitRoute && String(r.id).startsWith(parentRouteId + '.'))
      );
      const filtered = prev.filter(
        (r) =>
          !(
            r.parentRouteId === parentRouteId ||
            (r.isSplitRoute && String(r.id).startsWith(parentRouteId + '.'))
          )
      );
      filtered.splice(firstIdx >= 0 ? firstIdx : 0, 0, restoredRoute);
      return filtered;
    });

    // Borrado explícito en Supabase: los viajes individuales (hijos) quedan
    // reemplazados por la ruta matriz restaurada, así que sus claves compuestas
    // ya no aparecen en el arreglo — se borran a propósito, nunca por diferencia.
    void deleteSharedRecords('app_routes', siblings.map((s) => getRouteKey(s)));

    setRevertSplitTarget(null);
    showToast(`Partición revertida con éxito. Restaurada ruta matriz ${parentRouteId}.`, 'success');
  };

  // Corrección: el mismo ID de ruta puede repetirse en fechas distintas (ruta
  // recurrente cargada día tras día). Antes esta función buscaba/actualizaba las
  // rutas comparando solo por "id", así que asignar una fila podía terminar
  // aplicando la misma asignación también a otra fila con el mismo ID pero de otra
  // fecha. Ahora se identifica la fila exacta con ID + Fecha (ver
  // src/utils/routeKey.ts).
  const handleConfirmAssignment = (
    routeId: string,
    fecha: string,
    assignment: {
      truckId: string;
      truckPlaca: string;
      driverName: string;
      helper1?: string;
      helper2?: string;
      helper3?: string;
      helper4?: string;
      horaSalida: string;
      tipoAsignacion: AssignmentType;
    }
  ) => {
    const targetRoute = routes.find((r) => routeMatchesKey(r, routeId, fecha));
    const intentoNum = (targetRoute?.historialDespachos?.length || 0) + 1;
    const hasPriorAssignment = Boolean(
      targetRoute?.asignacion ||
      targetRoute?.ultimoDespacho ||
      ((targetRoute?.historialDespachos?.length || 0) > 0) ||
      targetRoute?.estado === 'Abierta' ||
      targetRoute?.estado === 'En Tránsito' ||
      targetRoute?.esReasignacion ||
      ((targetRoute?.retornosCount || 0) > 0) ||
      Boolean(targetRoute?.fechaAsignacion) ||
      targetRoute?.tipoAsignacion === 'Revisita'
    );
    let effectiveTipo: AssignmentType =
      assignment.tipoAsignacion ||
      (targetRoute?.estado === 'Abierta' ? 'Revisita' : 'Primer Viaje');
    if (effectiveTipo === 'Revisita' && !hasPriorAssignment) {
      effectiveTipo = 'Primer Viaje';
    }
    const isRecarga = effectiveTipo === 'Recarga';
    const isRevisita = effectiveTipo === 'Revisita';
    const fechaHoraAsignacion = formatDateTimeToGuatemala(new Date());

    setRoutes((prev) =>
      prev.map((r) => {
        if (routeMatchesKey(r, routeId, fecha)) {
          const originalDate = r.fechaOriginalRuta || r.fecha;
          return {
            ...r,
            fechaOriginalRuta: originalDate,
            fecha: originalDate,
            estado: 'En Tránsito',
            tipoAsignacion: effectiveTipo,
            esRecarga: isRecarga,
            esReasignacion: isRevisita,
            aPiso: effectiveTipo === 'Ruta a Piso',
            fechaAsignacion: fechaHoraAsignacion,
            asignacion: {
              camionId: assignment.truckId,
              camionPlaca: assignment.truckPlaca,
              conductor: assignment.driverName,
              auxiliar1: assignment.helper1 || null,
              auxiliar2: assignment.helper2 || null,
              auxiliar3: assignment.helper3 || null,
              auxiliar4: assignment.helper4 || null,
              horaSalida: assignment.horaSalida,
              fechaDespacho: formatDateToGuatemala(new Date()),
              fechaAsignacion: fechaHoraAsignacion,
              tipoAsignacion: effectiveTipo,
            },
          };
        }
        return r;
      })
    );

    // Update Truck status - Si el camión ya está cargado con otra ruta activa, conservar todas las rutas asignadas
    setTrucks((prev) =>
      prev.map((t) => {
        if (t.id === assignment.truckId) {
          const otherActiveUsingTruck = routes
            .filter(
              (r) =>
                r.estado === 'En Tránsito' &&
                !routeMatchesKey(r, routeId, fecha) &&
                r.asignacion?.camionId === assignment.truckId
            )
            .map((r) => String(r.id));
          const allAssignedIds = Array.from(new Set([...otherActiveUsingTruck, String(routeId)]));
          return {
            ...t,
            estado: 'En Ruta',
            rutaActual: allAssignedIds.join(', '),
            motivoNoAsignado: null,
            motivoNoAsignadoFecha: null,
            remuneraNoAsignado: null,
          };
        }
        return t;
      })
    );

    // Update Driver & Helpers status
    setStaff((prev) =>
      prev.map((st) => {
        const isAssignedNow = [
          assignment.driverName,
          assignment.helper1,
          assignment.helper2,
          assignment.helper3,
          assignment.helper4,
        ].includes(st.nombre);
        if (isAssignedNow) {
          return {
            ...st,
            estado: 'En Ruta',
            motivoNoAsignado: null,
            motivoNoAsignadoFecha: null,
            remuneraNoAsignado: null,
          };
        }
        return st;
      })
    );

    // Verificar si esta asignación comparte camión con otra ruta activa (Optimización de Carga)
    const otherRoutesWithSameTruck = routes.filter(
      (r) =>
        !routeMatchesKey(r, routeId, fecha) &&
        r.estado === 'En Tránsito' &&
        r.asignacion?.camionId === assignment.truckId
    );

    setAssignTarget(null);
    if (isRecarga) {
      showToast(
        `Ruta ${routeId} asignada como RECARGA ${intentoNum > 1 ? `(Despacho #${intentoNum})` : '(Segundo Viaje)'} a la unidad ${assignment.truckPlaca} y tripulación.`,
        'success'
      );
    } else if (effectiveTipo === 'Revisita') {
      showToast(
        `Ruta ${routeId} despachada como REVISITA (Reasignación despacho #${intentoNum}) con unidad ${assignment.truckPlaca} y piloto ${assignment.driverName}.`,
        'success'
      );
    } else if (otherRoutesWithSameTruck.length > 0) {
      showToast(
        `Ruta ${routeId} despachada en unidad ${assignment.truckPlaca} (Optimización de Carga compartida con Ruta ${otherRoutesWithSameTruck.map((r) => r.id).join(', ')}).`,
        'success'
      );
    } else {
      showToast(`Ruta ${routeId} despachada con unidad ${assignment.truckPlaca} (Primer Viaje).`, 'success');
    }
  };

  // Corrección: mismo motivo que handleConfirmAssignment — se identifica la fila
  // exacta con ID + Fecha para no afectar otra fila con el mismo ID en otra fecha.
  const handleMoveToFloor = (
    routeId: string,
    fecha: string,
    tomorrowDate: string,
    motivo: string = 'Ruta a Piso para despacho de mañana'
  ) => {
    const targetRoute = routes.find((r) => routeMatchesKey(r, routeId, fecha));
    if (!targetRoute) return;

    // Liberar camión o personal si estaban asignados previamente, verificando si otras rutas activas los siguen usando
    const asig = targetRoute.asignacion || targetRoute.ultimoDespacho;
    const otherActiveRoutes = routes.filter(
      (r) => !routeMatchesKey(r, routeId, fecha) && r.estado === 'En Tránsito' && r.asignacion
    );

    if (asig) {
      if (asig.camionId) {
        const remainingRoutesUsingTruck = otherActiveRoutes.filter(
          (r) => r.asignacion?.camionId === asig.camionId
        );
        setTrucks((prev) =>
          prev.map((t) => {
            if (t.id === asig.camionId) {
              if (remainingRoutesUsingTruck.length > 0) {
                return {
                  ...t,
                  estado: 'En Ruta',
                  rutaActual: remainingRoutesUsingTruck.map((r) => r.id).join(', '),
                };
              }
              return { ...t, estado: 'Disponible', rutaActual: null };
            }
            return t;
          })
        );
      }
      const crewNames = [asig.conductor, asig.auxiliar1, asig.auxiliar2, asig.auxiliar3, asig.auxiliar4].filter(Boolean) as string[];
      setStaff((prev) =>
        prev.map((st) => {
          if (crewNames.includes(st.nombre)) {
            if (st.estado === 'Baja') return st;
            const stillInOtherRoute = otherActiveRoutes.some((r) =>
              [r.asignacion?.conductor, r.asignacion?.auxiliar1, r.asignacion?.auxiliar2, r.asignacion?.auxiliar3, r.asignacion?.auxiliar4].includes(st.nombre)
            );
            return stillInOtherRoute ? { ...st, estado: 'En Ruta' } : { ...st, estado: 'Disponible' };
          }
          return st;
        })
      );
    }

    setRoutes((prev) =>
      prev.map((r) => {
        if (routeMatchesKey(r, routeId, fecha)) {
          const originalDate = r.fechaOriginalRuta || r.fecha;
          return {
            ...r,
            fechaOriginalRuta: originalDate,
            fecha: originalDate, // Permanece siempre la fecha de ruta original
            fechaReprogramada: tomorrowDate,
            estado: 'Pendiente',
            asignacion: null,
            tipoAsignacion: 'Ruta a Piso',
            esRecarga: false,
            aPiso: true,
            fechaPiso: formatDateTimeToGuatemala(new Date()),
            motivoPiso: motivo,
          };
        }
        return r;
      })
    );

    setAssignTarget(null);
    const origDate = targetRoute?.fechaOriginalRuta || targetRoute?.fecha || '';
    showToast(
      `Ruta ${routeId} guardada a Piso. Permanece con su fecha de ruta original (${origDate}) y reprogramada para mañana (${tomorrowDate}).`,
      'info'
    );
  };

  // Corrección: la selección múltiple del Tablero de Rutas solo permitía eliminar en
  // lote; se agrega la acción masiva "Enviar a Piso" (guardar varias rutas en bodega
  // para despacho de mañana) sin tocar el flujo de eliminación existente. Igual que la
  // acción individual "A Piso" (ver el uso de onMoveToFloor en RoutesTable.tsx), esta
  // acción NO solicita contraseña — solo "Eliminar" la requiere (ver DeleteAuthModal).
  // Corrección: routeIds aquí son claves compuestas ID+Fecha (ver
  // src/utils/routeKey.ts), no solo el ID — el mismo ID de ruta puede repetirse en
  // fechas distintas, así que filtrar solo por ID podía enviar a Piso también otra
  // fila con el mismo ID pero de otra fecha.
  const handleBulkMoveToFloor = (routeIds: string[]) => {
    const keysSet = new Set(routeIds);

    // Solo se pueden enviar a Piso rutas que no estén ya en Piso ni Liquidadas (para una
    // ruta ya en Piso existe la opción individual "Modificar / Sacar de Piso").
    const eligibleRoutes = routes.filter(
      (r) => keysSet.has(getRouteKey(r)) && r.estado !== 'Liquidada' && !r.aPiso
    );
    const skippedCount = keysSet.size - eligibleRoutes.length;

    if (eligibleRoutes.length === 0) {
      showToast(
        'Ninguna de las rutas seleccionadas se puede enviar a Piso (ya están a Piso o Liquidadas).',
        'error'
      );
      return;
    }

    const eligibleKeysSet = new Set(eligibleRoutes.map((r) => getRouteKey(r)));

    // Rutas activas que permanecen sin cambios, para liberar camión/personal
    // correctamente (mismo criterio que handleConfirmDeleteRoutes).
    const remainingActiveRoutes = routes.filter(
      (r) => !eligibleKeysSet.has(getRouteKey(r)) && r.estado === 'En Tránsito' && r.asignacion
    );

    eligibleRoutes.forEach((moveRoute) => {
      const asig = moveRoute.asignacion || moveRoute.ultimoDespacho;
      if (!asig) return;

      if (asig.camionId) {
        const remainingUsingTruck = remainingActiveRoutes.filter(
          (r) => r.asignacion?.camionId === asig.camionId
        );
        setTrucks((prev) =>
          prev.map((t) => {
            if (t.id === asig.camionId) {
              if (remainingUsingTruck.length > 0) {
                return {
                  ...t,
                  estado: 'En Ruta',
                  rutaActual: remainingUsingTruck.map((r) => r.id).join(', '),
                };
              }
              return { ...t, estado: 'Disponible', rutaActual: null };
            }
            return t;
          })
        );
      }

      const crewNames = [asig.conductor, asig.auxiliar1, asig.auxiliar2, asig.auxiliar3, asig.auxiliar4].filter(
        Boolean
      ) as string[];
      setStaff((prev) =>
        prev.map((st) => {
          if (crewNames.includes(st.nombre)) {
            if (st.estado === 'Baja') return st;
            const stillInOtherRoute = remainingActiveRoutes.some((r) =>
              [
                r.asignacion?.conductor,
                r.asignacion?.auxiliar1,
                r.asignacion?.auxiliar2,
                r.asignacion?.auxiliar3,
                r.asignacion?.auxiliar4,
              ].includes(st.nombre)
            );
            return stillInOtherRoute ? { ...st, estado: 'En Ruta' } : { ...st, estado: 'Disponible' };
          }
          return st;
        })
      );
    });

    setRoutes((prev) =>
      prev.map((r) => {
        if (!eligibleKeysSet.has(getRouteKey(r))) return r;
        const originalDate = r.fechaOriginalRuta || r.fecha;
        const tomorrowDate = getTomorrowGuatemalaDate(r.fecha);
        return {
          ...r,
          fechaOriginalRuta: originalDate,
          fecha: originalDate, // Permanece siempre la fecha de ruta original
          fechaReprogramada: tomorrowDate,
          estado: 'Pendiente',
          asignacion: null,
          tipoAsignacion: 'Ruta a Piso',
          esRecarga: false,
          aPiso: true,
          fechaPiso: formatDateTimeToGuatemala(new Date()),
          motivoPiso: 'Ruta a Piso para despacho de mañana (acción masiva)',
        };
      })
    );

    showToast(
      `${eligibleRoutes.length} ruta(s) enviada(s) a Piso para despacho de mañana` +
        (skippedCount > 0 ? ` (${skippedCount} omitida(s): ya estaban a Piso o Liquidadas).` : '.'),
      'success'
    );
  };

  // Corrección: routeIdsToDelete aquí son claves compuestas ID+Fecha (ver
  // src/utils/routeKey.ts), no solo el ID — el mismo ID de ruta puede repetirse en
  // fechas distintas, así que filtrar solo por ID podía eliminar también otra fila
  // con el mismo ID pero de otra fecha.
  const handleConfirmDeleteRoutes = (routeIdsToDelete: string[]) => {
    const keysSet = new Set(routeIdsToDelete);

    // Rutas que se van a eliminar
    const deletingRoutes = routes.filter((r) => keysSet.has(getRouteKey(r)));

    // Rutas activas que permanecen sin eliminar
    const remainingActiveRoutes = routes.filter(
      (r) => !keysSet.has(getRouteKey(r)) && r.estado === 'En Tránsito' && r.asignacion
    );

    // Liberar camiones y personal si estaban asignados y ninguna otra ruta activa los retiene
    deletingRoutes.forEach((delRoute) => {
      const asig = delRoute.asignacion;
      if (asig) {
        if (asig.camionId) {
          const remainingUsingTruck = remainingActiveRoutes.filter(
            (r) => r.asignacion?.camionId === asig.camionId
          );
          setTrucks((prev) =>
            prev.map((t) => {
              if (t.id === asig.camionId) {
                if (remainingUsingTruck.length > 0) {
                  return {
                    ...t,
                    estado: 'En Ruta',
                    rutaActual: remainingUsingTruck.map((r) => r.id).join(', '),
                  };
                }
                return { ...t, estado: 'Disponible', rutaActual: null };
              }
              return t;
            })
          );
        }

        const crewNames = [asig.conductor, asig.auxiliar1, asig.auxiliar2, asig.auxiliar3, asig.auxiliar4].filter(
          Boolean
        ) as string[];
        setStaff((prev) =>
          prev.map((st) => {
            if (crewNames.includes(st.nombre)) {
              if (st.estado === 'Baja') return st;
              const stillInOther = remainingActiveRoutes.some((r) =>
                [
                  r.asignacion?.conductor,
                  r.asignacion?.auxiliar1,
                  r.asignacion?.auxiliar2,
                  r.asignacion?.auxiliar3,
                  r.asignacion?.auxiliar4,
                ].includes(st.nombre)
              );
              return stillInOther ? { ...st, estado: 'En Ruta' } : { ...st, estado: 'Disponible' };
            }
            return st;
          })
        );
      }
    });

    // Eliminar de la lista de rutas
    setRoutes((prev) => prev.filter((r) => !keysSet.has(getRouteKey(r))));
    // Eliminar del historial si estuviera presente
    setHistoricalRoutes((prev) => prev.filter((r) => !keysSet.has(getRouteKey(r))));

    // Borrado explícito en Supabase, en ambas tablas (la ruta eliminada puede
    // estar en cualquiera de las dos, o en ambas) — con las claves exactas que
    // el usuario confirmó eliminar, nunca por diferencia de arreglos.
    void deleteSharedRecords('app_routes', routeIdsToDelete);
    void deleteSharedRecords('app_historical_routes', routeIdsToDelete);

    setDeleteRoutesTargetIds(null);
    showToast(
      routeIdsToDelete.length === 1
        ? `Ruta ${deletingRoutes[0]?.id ?? routeIdsToDelete[0]} eliminada del tablero.`
        : `Se eliminaron ${routeIdsToDelete.length} rutas del tablero.`,
      'success'
    );
  };

  // Corrección: mismo motivo que handleConfirmAssignment/handleMoveToFloor — el
  // mismo ID de ruta puede repetirse en fechas distintas, así que se identifica la
  // fila exacta con ID + Fecha (ver src/utils/routeKey.ts) para no liquidar también
  // otra fila con el mismo ID pero de otra fecha.
  const handleConfirmLiquidation = (
    routeId: string,
    fecha: string,
    data: {
      guiasExitosas: number;
      guiasRechazadas: number;
      cajasEntregadas: number;
      cajasDevueltas: number;
      motivoDevolucion: string;
      motivosSeleccionados: MotivoDevolucionReason[];
      motivoDetalle?: string;
      auditor: string;
      isRutaAbierta?: boolean;
      // Nuevo estado "Caja Abierta": la ruta se liquida igual que un cierre
      // definitivo, pero queda marcada como pendiente de validar la caja/boleta.
      isCajaAbierta?: boolean;
      motivoCajaAbierta?: CajaAbiertaReason;
      // Comentario libre y opcional, disponible para las 3 modalidades de cierre.
      comentario?: string;
      // Clientes marcados puntualmente como pendientes (Ruta Abierta / Caja
      // Abierta), cada uno con su motivo — ver ClientePendiente en types.ts.
      clientesPendientes?: ClientePendiente[];
    }
  ) => {
    const targetRoute = routes.find((r) => routeMatchesKey(r, routeId, fecha));
    if (!targetRoute) return;

    // Free Truck and Staff, considerando si otras rutas activas siguen utilizando la unidad o tripulación (Optimización / Carga compartida)
    const otherActiveRoutes = routes.filter(
      (r) => !routeMatchesKey(r, routeId, fecha) && r.estado === 'En Tránsito' && r.asignacion
    );

    if (targetRoute.asignacion?.camionId) {
      const remainingRoutesUsingTruck = otherActiveRoutes.filter(
        (r) => r.asignacion?.camionId === targetRoute.asignacion?.camionId
      );
      setTrucks((prev) =>
        prev.map((t) => {
          if (t.id === targetRoute.asignacion?.camionId) {
            if (remainingRoutesUsingTruck.length > 0) {
              return {
                ...t,
                estado: 'En Ruta',
                rutaActual: remainingRoutesUsingTruck.map((r) => r.id).join(', '),
              };
            }
            return { ...t, estado: 'Disponible', rutaActual: null };
          }
          return t;
        })
      );
    }
    if (targetRoute.asignacion) {
      const asig = targetRoute.asignacion;
      const crewNames = [asig.conductor, asig.auxiliar1, asig.auxiliar2, asig.auxiliar3, asig.auxiliar4].filter(Boolean) as string[];
      setStaff((prev) =>
        prev.map((st) => {
          if (crewNames.includes(st.nombre)) {
            if (st.estado === 'Baja') return st;
            const stillInOtherRoute = otherActiveRoutes.some((r) =>
              [
                r.asignacion?.conductor,
                r.asignacion?.auxiliar1,
                r.asignacion?.auxiliar2,
                r.asignacion?.auxiliar3,
                r.asignacion?.auxiliar4,
              ].includes(st.nombre)
            );
            return stillInOtherRoute ? { ...st, estado: 'En Ruta' } : { ...st, estado: 'Disponible' };
          }
          return st;
        })
      );
    }

    const isRutaAbierta = !!data.isRutaAbierta;

    if (isRutaAbierta) {
      const prevDispatches = targetRoute.historialDespachos || [];
      const intentoNum = prevDispatches.length + 1;
      const currentTripTipo: AssignmentType =
        targetRoute.asignacion?.tipoAsignacion ||
        targetRoute.tipoAsignacion ||
        (targetRoute.esRecarga ? 'Recarga' : intentoNum === 1 ? 'Primer Viaje' : 'Revisita');
      const dispatchRecord = {
        intento: intentoNum,
        camionPlaca: targetRoute.asignacion?.camionPlaca || 'Sin placa asignada',
        camionId: targetRoute.asignacion?.camionId,
        conductor: targetRoute.asignacion?.conductor || 'Sin piloto',
        auxiliares: [
          targetRoute.asignacion?.auxiliar1,
          targetRoute.asignacion?.auxiliar2,
          targetRoute.asignacion?.auxiliar3,
          targetRoute.asignacion?.auxiliar4,
        ].filter(Boolean) as string[],
        horaSalida: targetRoute.asignacion?.horaSalida,
        fechaAsignacion: targetRoute.fechaAsignacion || targetRoute.asignacion?.fechaAsignacion,
        fechaRetorno: formatDateTimeToGuatemala(new Date()),
        cajasEntregadas: data.cajasEntregadas,
        cajasDevueltas: data.cajasDevueltas,
        guiasExitosas: data.guiasExitosas,
        guiasRechazadas: data.guiasRechazadas,
        motivoDevolucion: data.motivoDevolucion || 'Devolución (Reasignación)',
        motivosSeleccionados: data.motivosSeleccionados,
        motivoDetalle: data.motivoDetalle,
        auditor: data.auditor,
        tipoAsignacion: currentTripTipo,
        comentario: data.comentario,
        clientesPendientes: data.clientesPendientes,
      };

      // Corrección: si se marcaron clientes puntuales como pendientes, la ruta
      // que sigue vigente (para Revisita) debe traer ya solo esos clientes en su
      // lista de referencia — no la lista completa original, que ya no
      // corresponde a lo que falta por entregar. Si no se usó el selector de
      // clientes (data.clientesPendientes vacío), se deja la lista tal cual
      // estaba, igual que siempre.
      const clientesRutaRestante =
        data.clientesPendientes && data.clientesPendientes.length > 0
          ? data.clientesPendientes.map((cp) => ({ codigo: cp.codigo, nombre: cp.nombre, cajas: cp.cajas || 0 }))
          : targetRoute.clientesRuta;

      const updatedRoute: Route = {
        ...targetRoute,
        estado: 'Abierta',
        asignacion: null, // Released so it can be reassigned to a new crew
        ultimoDespacho: targetRoute.asignacion || targetRoute.ultimoDespacho,
        historialDespachos: [...prevDispatches, dispatchRecord],
        retornosCount: (targetRoute.retornosCount || 0) + 1,
        motivoDevolucion: data.motivoDevolucion || 'Devolución (Reasignación)',
        cajasDevueltasAcumuladas:
          (targetRoute.cajasDevueltasAcumuladas || 0) + data.cajasDevueltas,
        cajasOriginales: targetRoute.cajasOriginales || targetRoute.cajasFisicas,
        cajasFisicas: data.cajasDevueltas > 0 ? data.cajasDevueltas : targetRoute.cajasFisicas,
        paradasOriginales: targetRoute.paradasOriginales || targetRoute.paradas,
        paradas: data.guiasRechazadas > 0 ? data.guiasRechazadas : targetRoute.paradas,
        clientesRuta: clientesRutaRestante,
        tipoAsignacion: currentTripTipo,
        esReasignacion: currentTripTipo === 'Revisita',
        esRecarga: currentTripTipo === 'Recarga',
        liquidacion: null,
      };

      setRoutes((prev) =>
        prev.map((r) => (routeMatchesKey(r, routeId, fecha) ? updatedRoute : r))
      );
      setLiquidateTarget(null);

      showToast(
        `Ruta ${targetRoute.id} registrada como RUTA ABIERTA (Retorno #${intentoNum}). Piloto, auxiliares y unidad quedaron libres. La ruta se mantiene en el tablero para reasignarse.`,
        'info'
      );
      return;
    }

    const fechaHoraLiquidacion = formatDateTimeToGuatemala(new Date());
    const isFullDelivered =
      (data.cajasDevueltas === 0 || !data.cajasDevueltas) &&
      (data.guiasRechazadas === 0 || !data.guiasRechazadas);
    const cleanMotivo = isFullDelivered ? '' : (data.motivoDevolucion || '');

    const updatedRoute: Route = {
      ...targetRoute,
      estado: 'Liquidada',
      fechaLiquidacion: fechaHoraLiquidacion,
      motivoDevolucion: cleanMotivo,
      liquidacion: {
        guiasExitosas: data.guiasExitosas,
        guiasRechazadas: data.guiasRechazadas,
        cajasEntregadas: data.cajasEntregadas,
        cajasDevueltas: data.cajasDevueltas,
        motivoDevolucion: cleanMotivo,
        motivosSeleccionados: isFullDelivered ? [] : data.motivosSeleccionados,
        motivoDetalle: isFullDelivered ? undefined : data.motivoDetalle,
        auditor: data.auditor,
        // Corrección: se guarda además el usuario real de la sesión que ejecutó la
        // liquidación (no editable), para trazabilidad, sin restringir el campo
        // "auditor" (que sigue siendo texto libre a propósito).
        liquidadoPorUsuario: currentUser?.username,
        fechaLiquidacion: fechaHoraLiquidacion,
        comentario: data.comentario,
        // Nuevo estado "Caja Abierta": la ruta queda liquidada normalmente, pero
        // marcada como pendiente de validar la caja/boleta del punto de venta.
        cajaAbierta: !!data.isCajaAbierta,
        motivoCajaAbierta: data.motivoCajaAbierta,
        clientesPendientes: data.clientesPendientes,
        // Primer registro del historial de status: se guarda la fecha exacta del
        // status inicial con el que queda esta liquidación (Liquidada o Caja
        // Abierta), para poder mostrar más adelante una línea de tiempo completa
        // en el Tablero de Rutas Liquidadas (ver Liquidación Final más abajo).
        historialEstados: [
          {
            estado: data.isCajaAbierta ? 'Caja Abierta' : 'Liquidada',
            fecha: fechaHoraLiquidacion,
          },
        ],
      },
    };

    setRoutes((prev) => prev.map((r) => (routeMatchesKey(r, routeId, fecha) ? updatedRoute : r)));

    // Archive into historicalRoutes
    setHistoricalRoutes((prev) => {
      const idx = prev.findIndex((hr) => routeMatchesKey(hr, routeId, fecha));
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = updatedRoute;
        return copy;
      }
      return [updatedRoute, ...prev];
    });

    setLiquidateTarget(null);

    // Corrección: si la ruta se liquidó con el nuevo estado "Caja Abierta", se
    // avisa explícitamente el motivo para que quede claro que falta validar la
    // caja/boleta, en vez del mensaje genérico de liquidación completa.
    const cajaAbiertaSuffix = data.isCajaAbierta
      ? ` CAJA ABIERTA: pendiente de validar (${data.motivoCajaAbierta}).`
      : '';

    // Check if part of split
    if (targetRoute.isSplitRoute && targetRoute.parentRouteId) {
      const siblings = routes.filter((r) => r.parentRouteId === targetRoute.parentRouteId);
      const allSettled = siblings.every(
        (s) => String(s.id) === String(routeId) || s.estado === 'Liquidada'
      );
      if (allSettled) {
        showToast(
          `¡Completados todos los viajes de la ruta ${targetRoute.parentRouteId}!${cajaAbiertaSuffix}`,
          data.isCajaAbierta ? 'info' : 'success'
        );
        handleViewConsolidatedReceipt(targetRoute.parentRouteId);
        return;
      } else {
        showToast(`Línea ${targetRoute.id} liquidada y transferida al Tablero de Rutas Liquidadas.${cajaAbiertaSuffix}`, 'info');
      }
    } else {
      showToast(
        `Ruta ${targetRoute.id} completamente liquidada y transferida al Tablero de Rutas Liquidadas.${cajaAbiertaSuffix}`,
        data.isCajaAbierta ? 'info' : 'success'
      );
    }

    // Open receipt modal
    handleViewSettlementReceipt(routeId, updatedRoute);
  };

  // Registra la "Liquidación Final" de una ruta que había quedado en Caja
  // Abierta (pendiente de validar la caja/boleta del punto de venta). No toca
  // ningún dato operativo ya liquidado (cajas, paradas, motivo, auditor, etc.):
  // solo marca el pendiente como resuelto y agrega la fecha + comentario de
  // cierre al historial de estados, para trazabilidad en el Tablero de Rutas
  // Liquidadas. Busca la ruta tanto en "routes" (por si sigue vigente en el
  // tablero activo) como en "historicalRoutes" (donde vive de forma permanente
  // una vez que el día se cierra y se archiva), y actualiza ambas listas donde
  // corresponda para que el cambio se refleje sin importar de cuál venga.
  const handleFinalizeCajaAbierta = (routeId: string, fecha: string, comentarioFinal?: string) => {
    const target =
      routes.find((r) => routeMatchesKey(r, routeId, fecha)) ||
      historicalRoutes.find((r) => routeMatchesKey(r, routeId, fecha));

    if (!target || !target.liquidacion?.cajaAbierta) {
      showToast('No se encontró una liquidación en Caja Abierta pendiente para esta ruta', 'error');
      return;
    }
    if (target.liquidacion.cajaAbiertaResuelta) {
      showToast('Esta ruta ya tiene registrada su Liquidación Final', 'info');
      setFinalizeCajaAbiertaTarget(null);
      return;
    }

    const fechaFinal = formatDateTimeToGuatemala(new Date());
    const updatedRoute: Route = {
      ...target,
      liquidacion: {
        ...target.liquidacion,
        cajaAbiertaResuelta: true,
        fechaLiquidacionFinal: fechaFinal,
        comentarioLiquidacionFinal: comentarioFinal,
        historialEstados: [
          ...(target.liquidacion.historialEstados || []),
          { estado: 'Liquidación Final', fecha: fechaFinal },
        ],
      },
    };

    setRoutes((prev) => prev.map((r) => (routeMatchesKey(r, routeId, fecha) ? updatedRoute : r)));
    setHistoricalRoutes((prev) => prev.map((r) => (routeMatchesKey(r, routeId, fecha) ? updatedRoute : r)));
    setFinalizeCajaAbiertaTarget(null);
    showToast(`Ruta ${routeId}: Liquidación Final registrada. Caja Abierta resuelta.`, 'success');
  };

  const handleCommitBatchRoutes = (importedRoutes: Route[], target: BatchImportTarget) => {
    // Seguridad: la agencia destino debe estar entre las permitidas al usuario.
    if (!importAgencyOptions.includes(target.agencia)) {
      showToast(`No tienes permiso para cargar rutas a la agencia "${target.agencia}".`, 'error');
      return;
    }
    // La carga es POR AGENCIA: el archivado de rutas liquidadas y el reemplazo
    // del tablero solo afectan a la agencia seleccionada; las rutas de las
    // demás agencias quedan exactamente como estaban.
    const inScope = (r: Route) => r.agencia === target.agencia;

    // Preservar rutas que sigan vigentes al pasar a un nuevo día:
    // - En Tránsito o Abierta (con devolución pendiente de reasignar)
    // - Pendiente (incluye rutas "a Piso" reprogramadas), que deben seguir apareciendo
    //   en el tablero hasta que se asignen, liquiden o el usuario las elimine manualmente.
    const activeRunningBacklog = routes.filter(
      (r) => r.estado === 'En Tránsito' || r.estado === 'Abierta' || r.estado === 'Pendiente'
    );

    // Archivar rutas liquidadas anteriores.
    // La comparación de duplicados usa ID + fecha de liquidación (no solo el ID), porque
    // los números de ruta del Excel suelen repetirse día a día: si solo se comparara por
    // ID, la liquidación de "hoy" para la ruta 102201 se descartaría en cuanto ya existiera
    // una liquidación archivada de un día anterior con ese mismo número.
    routes
      .filter((r) => r.estado === 'Liquidada' && inScope(r))
      .forEach((liqR) => {
        const liqDate = liqR.fechaLiquidacion || liqR.liquidacion?.fechaLiquidacion;
        setHistoricalRoutes((prev) => {
          const alreadyArchived = prev.some((hr) => {
            if (String(hr.id) !== String(liqR.id) || (hr.agencia || '') !== (liqR.agencia || '')) return false;
            const hrLiqDate = hr.fechaLiquidacion || hr.liquidacion?.fechaLiquidacion;
            return hrLiqDate === liqDate;
          });
          if (!alreadyArchived) {
            return [liqR, ...prev];
          }
          return prev;
        });
      });

    // Rutas importadas del archivo del día:
    // Si no sigue vigente (en tránsito, abierta o pendiente sin resolver), se carga con los datos del Excel
    //
    // Corrección: antes esta comparación era SOLO por ID de ruta (sin la fecha), lo
    // cual asumía que un mismo número de ruta nunca se repetía mientras hubiera una
    // ruta vigente con ese número. En la práctica el cliente SÍ reutiliza los mismos
    // números de ruta día tras día (p. ej. "158201" existe en Resumen 19, 20, 21...),
    // así que en cuanto una ruta con ese ID quedaba "Pendiente" sin asignar, TODA
    // importación futura con ese mismo número — de cualquier día distinto — se
    // descartaba en silencio (0 rutas nuevas), porque se trataba como si fuera "la
    // misma ruta todavía en curso". Ahora se compara por ID + Fecha (ver
    // getRouteKey): solo se preserva la ruta vigente y se descarta el duplicado del
    // Excel cuando de verdad es la MISMA ruta del MISMO día (evita perder el avance
    // de una asignación en curso si se vuelve a subir el archivo de ese día), pero
    // ya no bloquea la carga de rutas nuevas de otro día que por coincidencia
    // reutilizan el mismo número.
    const runningKeys = new Set(activeRunningBacklog.map((r) => getRouteKey(r)));
    const freshDailyRoutes = importedRoutes.filter((r) => !runningKeys.has(getRouteKey(r)));

    // Claves de las rutas que salen del tablero activo en este import (las ya
    // Liquidadas, que se acaban de archivar arriba en historicalRoutes). Se
    // capturan ANTES de reemplazar "routes" para poder pedir su borrado
    // explícito de "app_routes" — la sincronización normal ya nunca borra por
    // su cuenta (ver la nota de seguridad en pushSharedCollection).
    const archivedKeys = routes
      .filter((r) => r.estado === 'Liquidada' && inScope(r))
      .map((r) => getRouteKey(r));
    // Se conserva todo menos las liquidadas de la agencia cargada (que ya se
    // archivaron arriba): rutas vigentes de todas las agencias y liquidadas de
    // otras agencias que aún no han hecho su propia carga del día.
    // Corrección: si el Excel trae rutas que YA estaban cargadas (mismo número,
    // fecha y agencia — p. ej. se vuelve a subir el archivo del día para
    // agregar el detalle de clientes), la ruta existente se conserva, pero ahora
    // se le agrega la lista de clientes del archivo si todavía no tenía. Antes
    // esa lista se descartaba junto con la fila duplicada. No se reemplaza una
    // lista que ya existía (en una liquidación parcial queda reducida a los
    // clientes pendientes y no debe perderse ese avance).
    const importedClientesByKey = new Map(
      importedRoutes
        .filter((r) => r.clientesRuta && r.clientesRuta.length > 0)
        .map((r) => [getRouteKey(r), r.clientesRuta!] as const)
    );
    let clientesAgregados = 0;
    const keptRoutes = routes
      .filter((r) => !(r.estado === 'Liquidada' && inScope(r)))
      .map((r) => {
        const clientes = importedClientesByKey.get(getRouteKey(r));
        if (clientes && (!r.clientesRuta || r.clientesRuta.length === 0)) {
          clientesAgregados++;
          return { ...r, clientesRuta: clientes };
        }
        return r;
      });

    setRoutes([...freshDailyRoutes, ...keptRoutes]);
    setActiveTab('board');
    if (archivedKeys.length > 0) {
      void deleteSharedRecords('app_routes', archivedKeys);
    }

    const scopedBacklog = activeRunningBacklog.filter(inScope);
    const scopedPendientes = scopedBacklog.filter((r) => r.estado === 'Pendiente').length;
    const destino = `${target.agencia} · ${target.segmento}`;
    const msg =
      scopedBacklog.length > 0
        ? `Se importaron ${freshDailyRoutes.length} rutas a ${destino}. Se preservaron ${scopedBacklog.length} ruta(s) vigente(s) de ${target.agencia}${
            scopedPendientes > 0 ? ` (${scopedPendientes} pendiente(s) de días anteriores)` : ''
          }.`
        : `Se importaron ${freshDailyRoutes.length} rutas a ${destino}, listas para asignar.`;
    showToast(
      clientesAgregados > 0
        ? `${msg} Se agregó la lista de clientes a ${clientesAgregados} ruta(s) que ya estaban cargadas.`
        : msg,
      'success'
    );
  };

  // Agrega/actualiza la lista de clientes de referencia (clientesRuta) de rutas
  // que YA existen en el sistema (activas o ya archivadas en historicalRoutes),
  // emparejadas por clave ID+Fecha (ver getRouteKey). No crea rutas nuevas, no
  // toca cajas/paradas/estado/liquidación de ninguna ruta — es puramente
  // informativo/de referencia (ver ClientesImportView).
  const handleImportClientesPorRuta = (updates: { routeKey: string; clientesRuta: RouteClientEntry[] }[]) => {
    if (updates.length === 0) return;
    const byKey = new Map(updates.map((u) => [u.routeKey, u.clientesRuta]));

    setRoutes((prev) =>
      prev.map((r) => {
        const match = byKey.get(getRouteKey(r));
        return match ? { ...r, clientesRuta: match } : r;
      })
    );
    setHistoricalRoutes((prev) =>
      prev.map((r) => {
        const match = byKey.get(getRouteKey(r));
        return match ? { ...r, clientesRuta: match } : r;
      })
    );
  };

  const handleCreateTruck = (truckData: {
    placa: string;
    agencia: string;
    proveedor: string;
    ton: string;
    bahias: string;
    capacidad: string;
  }) => {
    // Corrección: antes el ID interno del camión se generaba como `T-${Date.now()}`,
    // sin relación visible con el vehículo, y además se pedía escribir un "ID
    // Camión" aparte a mano. Ahora ya no se pide: el ID se genera solo a partir de
    // la Placa ("TR-" + Placa) y ese mismo valor se usa también como "ID Camión"
    // para que se vea en el consolidado de Camiones. Como el ID depende
    // directamente de la Placa, se valida que no exista ya un camión con esa
    // misma Placa (evitaría dos registros con el mismo ID).
    const newTruckId = `TR-${truckData.placa}`;
    if (trucks.some((t) => t.id === newTruckId || t.placa === truckData.placa)) {
      showToast(`Ya existe un camión registrado con la placa ${truckData.placa}.`, 'error');
      return;
    }

    const newT: Truck = {
      id: newTruckId,
      idCamion: newTruckId,
      placa: truckData.placa,
      agencia: truckData.agencia,
      proveedor: truckData.proveedor || undefined,
      capacidad: truckData.capacidad,
      ton: truckData.ton || undefined,
      bahias: truckData.bahias || undefined,
      estado: 'Disponible',
      rutaActual: null,
    };
    setTrucks((prev) => [...prev, newT]);
    setIsNewTruckModalOpen(false);
    showToast(`Camión ${newT.placa} agregado a la agencia ${newT.agencia}`, 'success');
  };

  const handleCreateStaff = (staffData: {
    dpi: string;
    codigo: string;
    nombre: string;
    agencia: string;
    puesto: StaffPuesto;
    codigoCorto: string;
    telefono: string;
    estatus: StaffEstatus;
  }) => {
    const newS: Staff = {
      id: `S-${Date.now()}`,
      dpi: staffData.dpi || 'N/A',
      codigo: staffData.codigo || undefined,
      nombre: staffData.nombre,
      agencia: staffData.agencia,
      puesto: staffData.puesto,
      rol: staffData.puesto === 'APP' ? 'Auxiliar' : 'Conductor',
      codigoCorto: staffData.codigoCorto || undefined,
      telefono: staffData.telefono,
      estado: 'Disponible',
      estatus: staffData.estatus || 'ALTA',
    };
    setStaff((prev) => [...prev, newS]);
    setIsNewStaffModalOpen(false);
    showToast(`Colaborador ${newS.nombre} (${newS.puesto}) registrado en ${newS.agencia}`, 'success');
  };

  const handleUpdateStaffEstatus = (staffId: string, newEstatus: StaffEstatus) => {
    // Corrección: el estatus de planilla (ALTA/BAJA) y el estado operativo del
    // día solo deben poder cambiarse desde aquí si el usuario tiene permiso de
    // carga de Excel de personal (canBulkUploadStaff) — el selector ya se
    // deshabilita en ResourcesView para ese caso, pero se valida también aquí
    // para no depender únicamente del control visual.
    if (!canBulkUploadStaff) {
      showToast('No tienes permiso para modificar el estatus de personal.', 'error');
      return;
    }
    const target = staff.find((s) => s.id === staffId);
    if (!target) return;
    setStaff((prev) => prev.map((s) => (s.id === staffId ? { ...s, estatus: newEstatus } : s)));
    showToast(
      `${target.nombre}: estatus de planilla cambiado a ${newEstatus}`,
      newEstatus === 'BAJA' ? 'info' : 'success'
    );
  };

  const handleImportStaffBatch = (importedStaff: Staff[]) => {
    if (!importedStaff || importedStaff.length === 0) return;

    setStaff((prev) => {
      const updatedList = [...prev];
      let newCount = 0;
      let updatedCount = 0;

      importedStaff.forEach((imp) => {
        // Find existing by DPI (if valid) or Name
        const matchIdx = updatedList.findIndex((existing) => {
          const dpiMatch =
            existing.dpi &&
            existing.dpi !== 'N/A' &&
            imp.dpi &&
            imp.dpi !== 'N/A' &&
            existing.dpi.replace(/\s+/g, '') === imp.dpi.replace(/\s+/g, '');
          const nameMatch =
            existing.nombre.trim().toLowerCase() === imp.nombre.trim().toLowerCase();
          return dpiMatch || nameMatch;
        });

        if (matchIdx >= 0) {
          // Corrección: la carga masiva de Personal ya NO sobrescribe registros que
          // ya existían en el sistema (antes actualizaba los campos del colaborador
          // encontrado). Ahora simplemente se omite esa fila del Excel y se cuenta
          // como "ya existente", para no borrar/editar datos previamente cargados.
          updatedCount++;
        } else {
          updatedList.push({
            id: `S-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            dpi: imp.dpi || 'N/A',
            nombre: imp.nombre,
            agencia: imp.agencia || undefined,
            puesto: imp.puesto,
            rol: imp.rol,
            telefono: imp.telefono || '-',
            estado: imp.estado || 'Disponible',
            // Mismo campo faltante que en la actualización: se capturaban en el
            // Excel pero nunca llegaban a guardarse en un colaborador nuevo.
            codigo: imp.codigo,
            codigoCorto: imp.codigoCorto,
            estatus: imp.estatus || 'ALTA',
          });
          newCount++;
        }
      });

      const message =
        updatedCount > 0
          ? `Carga masiva completada: ${newCount} colaboradores agregados y ${updatedCount} omitidos (ya existían en el sistema).`
          : `Carga masiva completada: ${newCount} colaboradores agregados desde Excel.`;
      showToast(message, 'success');

      return updatedList;
    });
  };

  const handleImportTrucksBatch = (importedTrucks: Truck[]) => {
    if (!importedTrucks || importedTrucks.length === 0) return;

    setTrucks((prev) => {
      const updatedList = [...prev];
      let newCount = 0;
      let updatedCount = 0;

      importedTrucks.forEach((imp) => {
        // Buscar coincidencia existente por ID de Camión (si es válido) o por Placa
        const matchIdx = updatedList.findIndex((existing) => {
          const idCamionMatch =
            existing.idCamion &&
            imp.idCamion &&
            String(existing.idCamion).trim() === String(imp.idCamion).trim();
          const placaMatch =
            existing.placa &&
            imp.placa &&
            existing.placa.replace(/\s+/g, '').toUpperCase() ===
              imp.placa.replace(/\s+/g, '').toUpperCase();
          return idCamionMatch || placaMatch;
        });

        if (matchIdx >= 0) {
          // Corrección: la carga masiva de Camiones ya NO sobrescribe registros que
          // ya existían en el sistema (antes actualizaba los campos del camión
          // encontrado). Ahora simplemente se omite esa fila del Excel y se cuenta
          // como "ya existente", para no borrar/editar datos previamente cargados.
          updatedCount++;
        } else {
          updatedList.push({
            id: `T-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            idCamion: imp.idCamion || undefined,
            placa: imp.placa,
            agencia: imp.agencia || undefined,
            capacidad: imp.capacidad || '0',
            ton: imp.ton || undefined,
            bahias: imp.bahias || undefined,
            estado: imp.estado || 'Disponible',
            rutaActual: null,
          });
          newCount++;
        }
      });

      const message =
        updatedCount > 0
          ? `Carga masiva completada: ${newCount} camiones agregados y ${updatedCount} omitidos (ya existían en el sistema).`
          : `Carga masiva completada: ${newCount} camiones agregados desde Excel.`;
      showToast(message, 'success');

      return updatedList;
    });
  };

  const handleDeleteTrucks = (truckIds: string[]) => {
    if (!truckIds || truckIds.length === 0) return;
    const idSet = new Set(truckIds);
    const removed = trucks.filter((t) => idSet.has(t.id));
    setTrucks((prev) => prev.filter((t) => !idSet.has(t.id)));
    // Borrado explícito en Supabase con las claves exactas confirmadas por el
    // usuario (ver la nota de seguridad en pushSharedCollection).
    void deleteSharedRecords('app_trucks', truckIds);
    if (removed.length === 1) {
      showToast(`Camión ${removed[0].placa} eliminado`, 'info');
    } else {
      showToast(`${removed.length} camiones eliminados`, 'info');
    }
  };

  const handleDeleteStaffMembers = (staffIds: string[]) => {
    if (!staffIds || staffIds.length === 0) return;
    const idSet = new Set(staffIds);
    const removed = staff.filter((s) => idSet.has(s.id));
    setStaff((prev) => prev.filter((s) => !idSet.has(s.id)));
    // Borrado explícito en Supabase con las claves exactas confirmadas por el
    // usuario (ver la nota de seguridad en pushSharedCollection).
    void deleteSharedRecords('app_staff', staffIds);
    if (removed.length === 1) {
      showToast(`Colaborador ${removed[0].nombre} eliminado`, 'info');
    } else {
      showToast(`${removed.length} colaboradores eliminados`, 'info');
    }
  };

  const handleUpdateStaffStatus = (staffId: string, newStatus: ResourceStatus) => {
    // Corrección: mismo resguardo que en handleUpdateStaffEstatus — el estado
    // operativo del día tampoco debe poder cambiarse sin permiso de carga de
    // Excel de personal.
    if (!canBulkUploadStaff) {
      showToast('No tienes permiso para modificar el estatus de personal.', 'error');
      return;
    }
    const target = staff.find((s) => s.id === staffId);
    if (!target) return;

    setStaff((prev) =>
      prev.map((s) => (s.id === staffId ? { ...s, estado: newStatus } : s))
    );

    if (newStatus === 'Baja') {
      showToast(`Colaborador ${target.nombre} dado de BAJA`, 'info');
    } else if (newStatus === 'Disponible') {
      showToast(`Colaborador ${target.nombre} activado a DISPONIBLE`, 'success');
    } else {
      showToast(`Estado de ${target.nombre} actualizado a ${newStatus}`, 'info');
    }
  };

  const handleSetTruckReason = (truckId: string, reason: TruckUnavailableReason | null) => {
    const target = trucks.find((t) => t.id === truckId);
    setTrucks((prev) =>
      prev.map((t) =>
        t.id === truckId
          ? {
              ...t,
              motivoNoAsignado: reason,
              motivoNoAsignadoFecha: reason ? formatDateTimeToGuatemala(new Date()) : null,
              // Se registra la clasificación de Remunera vigente al momento de asignar el
              // motivo, para el reporte de costos que se construirá más adelante.
              remuneraNoAsignado: reason ? TRUCK_REASON_REMUNERA[reason] : null,
            }
          : t
      )
    );
    if (reason) {
      showToast(`Camión ${target?.placa || truckId} marcado como "${reason}"`, 'info');
    }
  };

  const handleSetStaffReason = (staffId: string, reason: StaffUnavailableReason | null) => {
    const target = staff.find((s) => s.id === staffId);
    setStaff((prev) =>
      prev.map((s) =>
        s.id === staffId
          ? {
              ...s,
              motivoNoAsignado: reason,
              motivoNoAsignadoFecha: reason ? formatDateTimeToGuatemala(new Date()) : null,
              remuneraNoAsignado: reason ? STAFF_REASON_REMUNERA[reason] : null,
            }
          : s
      )
    );
    if (reason) {
      showToast(`${target?.nombre || staffId} marcado con motivo "${reason}"`, 'info');
    }
  };

  // Corrección de seguridad crítica: "Restablecer Datos de Ejemplo" reemplaza
  // TODO el contenido de Rutas, Camiones y Personal por los datos de ejemplo
  // con los que arranca la app en modo local — algo razonable únicamente
  // cuando NO hay una base de datos compartida configurada (modo de un solo
  // navegador, sin Supabase). Con Supabase configurado, este botón terminaba
  // reemplazando en TODAS las pantallas conectadas los datos reales cargados
  // por el equipo con datos de ejemplo, con un solo clic y sin ninguna
  // confirmación — esto ya causó pérdidas reales de Rutas, Camiones y
  // Personal. Ahora esta función se niega a ejecutarse si Supabase está
  // configurado (además, el botón que la dispara ya no se muestra en ese caso
  // — ver TabNav.tsx / allowResetDemo), como segunda capa de protección.
  const handleResetDemo = () => {
    if (isSupabaseConfigured) {
      showToast(
        'Restablecer a datos de ejemplo está deshabilitado: esta base de datos es compartida y contiene datos reales de todos los usuarios.',
        'error'
      );
      return;
    }
    setRoutes(JSON.parse(JSON.stringify(INITIAL_ROUTES)));
    setTrucks(JSON.parse(JSON.stringify(INITIAL_TRUCKS)));
    setStaff(JSON.parse(JSON.stringify(INITIAL_STAFF)));
    setHistoricalRoutes([]);
    showToast('Datos restaurados al reporte de ejemplo', 'info');
  };

  const handleExportActiveRoutesExcel = () => {
    if (activeTab === 'liquidated') {
      const success = exportRoutesToExcel(allLiquidatedRoutes, staff);
      if (success) {
        showToast('Reporte de rutas liquidadas descargado en Excel', 'success');
      } else {
        showToast('No hay rutas liquidadas para exportar', 'error');
      }
      return;
    }
    const success = exportRoutesToExcel(filteredActiveRoutes, staff);
    if (success) {
      showToast('Reporte Excel descargado con desglose de tripulación', 'success');
    } else {
      showToast('No hay rutas activas para exportar', 'error');
    }
  };

  // Corrección: se agrega "fecha" (opcional, al final para no romper la llamada
  // existente desde LiquidatedBoardView que ya pasa el objeto de ruta directo en
  // directRoute) porque el mismo ID de ruta puede repetirse en fechas distintas —
  // sin esto, ver el acta desde el Tablero de Rutas podía abrir la de otra fila con
  // el mismo ID pero de otra fecha.
  const handleViewSettlementReceipt = (routeId: string, directRoute?: Route, fecha?: string) => {
    const matchesTarget = (r: Route) =>
      fecha !== undefined ? routeMatchesKey(r, routeId, fecha) : String(r.id) === String(routeId);
    const target =
      directRoute ||
      routes.find(matchesTarget) ||
      allLiquidatedRoutes.find(matchesTarget) ||
      historicalRoutes.find(matchesTarget);

    if (!target) {
      showToast('No se encontró la información de la ruta', 'error');
      return;
    }
    setReceiptTarget(target);
    setReceiptConsolidatedSiblings(undefined);
  };

  const handleViewConsolidatedReceipt = (parentRouteId: string) => {
    const allKnown = [...routes, ...allLiquidatedRoutes];
    const uniqueMap = new Map<string, Route>();
    allKnown.forEach((r) => {
      if (r.parentRouteId === parentRouteId) {
        uniqueMap.set(String(r.id), r);
      }
    });
    const siblings = Array.from(uniqueMap.values());
    if (siblings.length === 0) return;
    setReceiptTarget(siblings[0]);
    setReceiptConsolidatedSiblings(siblings);
  };

  // Agencia heredada del contexto activo del usuario (selector superior).
  // Si el usuario tiene "TODAS" seleccionado (sin agencia específica), se usa
  // la primera agencia conocida como respaldo.
  const effectiveAgencyForCreation = useMemo(() => {
    return selectedAgency !== 'TODAS' ? selectedAgency : (agencies[0] || 'Mercado Abierto');
  }, [selectedAgency, agencies]);

  // Correlativo automático para Rutas de Entrega: formato M0000XXXXX (5 dígitos de correlativo)
  const nextEntregaRouteId = useMemo(() => {
    const allIds = [...routes, ...historicalRoutes].map((r) => String(r.id));
    let maxN = 0;
    allIds.forEach((id) => {
      const m = /^M0000(\d{5})$/.exec(id);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxN) maxN = n;
      }
    });
    return `M0000${String(maxN + 1).padStart(5, '0')}`;
  }, [routes, historicalRoutes]);

  // Correlativo automático para Rutas de Traslado: formato TL00000XXX (3 dígitos de correlativo)
  const nextTrasladoRouteId = useMemo(() => {
    const allIds = [...routes, ...historicalRoutes].map((r) => String(r.id));
    let maxN = 0;
    allIds.forEach((id) => {
      const m = /^TL00000(\d{3})$/.exec(id);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxN) maxN = n;
      }
    });
    return `TL00000${String(maxN + 1).padStart(3, '0')}`;
  }, [routes, historicalRoutes]);

  // Recursos disponibles (camiones y personal) que aún no tienen motivo de no-asignación.
  // Corrección: se cuenta sobre visibleTrucks/visibleStaff (ya filtrados por la agencia
  // del usuario) en vez de las listas completas, para que el número en la insignia de
  // "Fin de Asignación" coincida con lo que ese usuario realmente puede ver al abrir el modal.
  const pendingReasonsCount = useMemo(() => {
    const pendingTrucks = visibleTrucks.filter((t) => t.estado === 'Disponible' && !t.motivoNoAsignado).length;
    const pendingStaff = visibleStaff.filter((s) => s.estado === 'Disponible' && !s.motivoNoAsignado).length;
    return pendingTrucks + pendingStaff;
  }, [visibleTrucks, visibleStaff]);

  // Mientras se carga la base de datos compartida (solo aplica cuando Supabase
  // está configurado — ver src/services/supabaseClient.ts) se muestra una
  // pantalla de carga en vez del login, para no permitir el ingreso con datos
  // de usuarios todavía incompletos.
  const loadingScreen = (message: string) => (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 border-slate-300 border-t-blue-600 rounded-full animate-spin mx-auto" />
        <p className="text-sm font-semibold text-slate-600">{message}</p>
      </div>
    </div>
  );

  // Orden con Supabase: 1) revisar sesión guardada → 2) login → 3) leer perfil
  // → 4) cargar datos compartidos. Los datos solo se leen con sesión iniciada.
  if (isSupabaseConfigured && !authChecked) {
    return loadingScreen('Verificando sesión...');
  }

  if (isSupabaseConfigured && authUserId && !profilesLoaded) {
    return loadingScreen('Cargando tu perfil...');
  }

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} notice={loginNotice} />;
  }

  if (isSupabaseConfigured && !isRemoteReady) {
    return loadingScreen('Cargando datos compartidos...');
  }

  return (
    <div className="bg-gradient-to-b from-slate-100 to-slate-50 text-slate-800 antialiased min-h-screen flex flex-col font-sans">
      <Navbar
        agencies={boardAgencies}
        selectedAgency={selectedAgency}
        onSelectAgency={setSelectedAgency}
        onOpenNewRouteModal={() => setIsRouteTypeSelectModalOpen(true)}
        onOpenDailySummaryModal={handleOpenDailySummary}
        currentUsername={currentUser.nombre || currentUser.username}
        isAdmin={currentUser.isAdmin}
        onLogout={handleLogout}
      />

      {/* Rediseño para tablet: navegación en una barra lateral fija (en vez de
          una fila completa arriba) e indicadores compactos en la misma fila de la
          búsqueda, para que el Tablero de Rutas use casi toda la pantalla. */}
      <div className={`flex-1 flex w-full min-h-0 ${(isDailySummaryModalOpen || isClosingActaModalOpen) ? 'no-print print:hidden' : ''}`}>
        <aside className={`${railCollapsed ? 'hidden' : 'hidden md:block'} w-[88px] shrink-0 bg-white/90 border-r border-slate-200 h-[calc(100dvh-68px)] sticky top-[68px] overflow-y-auto z-20`}>
          <TabNav
            mode="rail"
            onToggleRail={toggleRail}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onExportExcel={handleExportActiveRoutesExcel}
          onResetDemo={handleResetDemo}
          allowResetDemo={!isSupabaseConfigured}
          onOpenUnassignedResourcesModal={() => setIsUnassignedResourcesModalOpen(true)}
          pendingReasonsCount={pendingReasonsCount}
          activeCount={filteredActiveRoutes.length}
          liquidatedCount={allLiquidatedRoutes.length}
          trucksCount={visibleTrucks.length}
          staffCount={visibleStaff.length}
          usersCount={users.length}
          showDashboard={canView('dashboard')}
          showBoard={canView('board')}
          showLiquidated={canView('liquidated')}
          showTrucks={canView('trucks')}
          showStaff={canView('staff')}
          showBatch={canView('batch')}
          showUsers={!!currentUser.isAdmin}
          isAdmin={!!currentUser.isAdmin}
        />
        </aside>

      <main className="flex-1 min-w-0 h-[calc(100dvh-68px)] overflow-y-auto flex flex-col gap-2.5 px-2 sm:px-3 md:px-4 py-2.5">
        <div className="md:hidden shrink-0">
          <TabNav
            mode="bar"
          activeTab={activeTab}
          onTabChange={setActiveTab}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onExportExcel={handleExportActiveRoutesExcel}
          onResetDemo={handleResetDemo}
          allowResetDemo={!isSupabaseConfigured}
          onOpenUnassignedResourcesModal={() => setIsUnassignedResourcesModalOpen(true)}
          pendingReasonsCount={pendingReasonsCount}
          activeCount={filteredActiveRoutes.length}
          liquidatedCount={allLiquidatedRoutes.length}
          trucksCount={visibleTrucks.length}
          staffCount={visibleStaff.length}
          usersCount={users.length}
          showDashboard={canView('dashboard')}
          showBoard={canView('board')}
          showLiquidated={canView('liquidated')}
          showTrucks={canView('trucks')}
          showStaff={canView('staff')}
          showBatch={canView('batch')}
          showUsers={!!currentUser.isAdmin}
          isAdmin={!!currentUser.isAdmin}
        />
        </div>

        <div className="shrink-0">
          <TabNav
            mode="toolbar"
            railCollapsed={railCollapsed}
            onToggleRail={toggleRail}
            leading={
              // Indicadores según la sección: los principales (pendientes, tránsito,
              // etc.) en el Tablero de Rutas; los de liquidación en Rutas Liquidadas.
              activeTab === 'board' ? (
              <StatsCards
                compact
          pendientes={stats.pendientes}
          transito={stats.transito}
          abiertas={stats.abiertas}
          liquidadas={stats.liquidadas}
          liquidadasTotal={stats.liquidadasTotal}
          pisoHoy={stats.pisoHoy}
          fechaHoy={stats.fechaHoy}
          cajasFisicasHoy={stats.cajasFisicasHoy}
          cajasEntregadasHoy={stats.cajasEntregadasHoy}
          onSelectTab={setActiveTab}
        />
              ) : activeTab === 'liquidated' && liqKpis ? (
                <LiquidatedStatsStrip {...liqKpis} />
              ) : null
            }
          activeTab={activeTab}
          onTabChange={setActiveTab}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onExportExcel={handleExportActiveRoutesExcel}
          onResetDemo={handleResetDemo}
          allowResetDemo={!isSupabaseConfigured}
          onOpenUnassignedResourcesModal={() => setIsUnassignedResourcesModalOpen(true)}
          pendingReasonsCount={pendingReasonsCount}
          activeCount={filteredActiveRoutes.length}
          liquidatedCount={allLiquidatedRoutes.length}
          trucksCount={visibleTrucks.length}
          staffCount={visibleStaff.length}
          usersCount={users.length}
          showDashboard={canView('dashboard')}
          showBoard={canView('board')}
          showLiquidated={canView('liquidated')}
          showTrucks={canView('trucks')}
          showStaff={canView('staff')}
          showBatch={canView('batch')}
          showUsers={!!currentUser.isAdmin}
          isAdmin={!!currentUser.isAdmin}
        />
        </div>

        {activeTab === 'dashboard' && (
          <DashboardView
            routes={dashboardRoutes}
            activeRoutesByAgency={activeRoutesVisibleAllAgencies}
            liquidatedRoutes={dashboardLiquidatedRoutes}
            trucks={visibleTrucks}
            staff={visibleStaff}
            stats={stats}
            selectedAgency={selectedAgency}
          />
        )}

        {activeTab === 'board' && (
          <div className="flex-1 min-h-[320px]">
          <RoutesTable
            fillHeight
            routes={filteredActiveRoutes}
            allRoutes={routes}
            trucks={trucks}
            staff={staff}
            onOpenAssignModal={(id, fecha) => {
              const r = routes.find((item) => routeMatchesKey(item, id, fecha));
              if (r) setAssignTarget(r);
            }}
            onOpenLiquidateModal={(id, fecha) => {
              const r = routes.find((item) => routeMatchesKey(item, id, fecha));
              if (r) setLiquidateTarget(r);
            }}
            onOpenSplitRouteModal={(id, fecha) => {
              const r = routes.find((item) => routeMatchesKey(item, id, fecha));
              if (r) setSplitRouteTarget(r);
            }}
            onOpenRevertSplitModal={(id, fecha) => {
              const r = routes.find((item) => routeMatchesKey(item, id, fecha));
              if (r) setRevertSplitTarget(r);
            }}
            onViewSettlementReceipt={(id, fecha) => handleViewSettlementReceipt(id, undefined, fecha)}
            onViewConsolidatedReceipt={(parentRouteId) =>
              handleViewConsolidatedReceipt(parentRouteId)
            }
            onOpenNewRouteModal={() => setIsRouteTypeSelectModalOpen(true)}
            onMoveToFloor={handleMoveToFloor}
            onBulkMoveToFloor={handleBulkMoveToFloor}
            onOpenDeleteModal={canDeleteData ? (ids) => setDeleteRoutesTargetIds(ids) : undefined}
          />
          </div>
        )}

        {activeTab === 'liquidated' && (
          <LiquidatedBoardView
            onKpisChange={setLiqKpis}
            liquidatedRoutes={allLiquidatedRoutes}
            allRoutes={routes}
            staff={staff}
            allAgencies={agencies}
            onViewSettlementReceipt={(id, routeObj) => handleViewSettlementReceipt(id, routeObj)}
            onViewConsolidatedReceipt={(parentRouteId) =>
              handleViewConsolidatedReceipt(parentRouteId)
            }
            onOpenFinalizeCajaAbierta={(routeObj) => setFinalizeCajaAbiertaTarget(routeObj)}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'trucks' && (
          <ResourcesView
            mode="trucks"
            trucks={visibleTrucks}
            staff={visibleStaff}
            defaultAgencia={effectiveAgencyForCreation}
            onOpenNewTruckModal={() => setIsNewTruckModalOpen(true)}
            onOpenNewStaffModal={() => setIsNewStaffModalOpen(true)}
            onUpdateStaffStatus={handleUpdateStaffStatus}
            onUpdateStaffEstatus={handleUpdateStaffEstatus}
            onImportStaffBatch={handleImportStaffBatch}
            onImportTrucksBatch={handleImportTrucksBatch}
            onDeleteTrucks={handleDeleteTrucks}
            onDeleteStaffMembers={handleDeleteStaffMembers}
            onShowToast={showToast}
            canDelete={canDeleteData}
            canBulkUploadTrucks={canBulkUploadTrucks}
            canManualAddTrucks={canManualAddTrucks}
            canBulkUploadStaff={canBulkUploadStaff}
            canManualAddStaff={canManualAddStaff}
          />
        )}

        {activeTab === 'staff' && (
          <ResourcesView
            mode="staff"
            trucks={visibleTrucks}
            staff={visibleStaff}
            defaultAgencia={effectiveAgencyForCreation}
            onOpenNewTruckModal={() => setIsNewTruckModalOpen(true)}
            onOpenNewStaffModal={() => setIsNewStaffModalOpen(true)}
            onUpdateStaffStatus={handleUpdateStaffStatus}
            onUpdateStaffEstatus={handleUpdateStaffEstatus}
            onImportStaffBatch={handleImportStaffBatch}
            onImportTrucksBatch={handleImportTrucksBatch}
            onDeleteTrucks={handleDeleteTrucks}
            onDeleteStaffMembers={handleDeleteStaffMembers}
            onShowToast={showToast}
            canDelete={canDeleteData}
            canBulkUploadTrucks={canBulkUploadTrucks}
            canManualAddTrucks={canManualAddTrucks}
            canBulkUploadStaff={canBulkUploadStaff}
            canManualAddStaff={canManualAddStaff}
          />
        )}

        {activeTab === 'batch' && (
          <div className="space-y-6">
            <BatchImportView
              existingRoutes={routes}
              agencyOptions={importAgencyOptions}
              onCommitRoutes={handleCommitBatchRoutes}
              onShowToast={showToast}
            />
            <ClientesImportView
              routes={routes}
              historicalRoutes={historicalRoutes}
              agencyOptions={importAgencyOptions}
              onCommitClientesRuta={handleImportClientesPorRuta}
              onShowToast={showToast}
            />
          </div>
        )}

        {activeTab === 'users' && currentUser.isAdmin && (
          <UsersView
            users={users}
            currentUser={currentUser}
            onCreateUser={handleCreateUser}
            onUpdateUser={handleUpdateUser}
            onResetPassword={handleResetPassword}
            onDeleteUser={handleDeleteUser}
            onVerifyPassword={handleVerifyPassword}
          />
        )}
      </main>
      </div>

      {/* Modals */}
      <RouteTypeSelectModal
        isOpen={isRouteTypeSelectModalOpen}
        onClose={() => setIsRouteTypeSelectModalOpen(false)}
        onSelectEntrega={() => {
          setIsRouteTypeSelectModalOpen(false);
          setIsNewRouteModalOpen(true);
        }}
        onSelectTraslado={() => {
          setIsRouteTypeSelectModalOpen(false);
          setIsTrasladoRouteModalOpen(true);
        }}
      />

      <NewRouteModal
        isOpen={isNewRouteModalOpen}
        onClose={() => setIsNewRouteModalOpen(false)}
        onSubmit={handleCreateRoute}
        nextSuggestedId={nextEntregaRouteId}
        agencia={effectiveAgencyForCreation}
      />

      <NewTrasladoRouteModal
        isOpen={isTrasladoRouteModalOpen}
        onClose={() => setIsTrasladoRouteModalOpen(false)}
        onSubmit={handleCreateRoute}
        nextSuggestedId={nextTrasladoRouteId}
        agencia={effectiveAgencyForCreation}
      />

      <SplitRouteModal
        isOpen={!!splitRouteTarget}
        onClose={() => setSplitRouteTarget(null)}
        route={splitRouteTarget}
        onConfirmSplit={handleConfirmSplit}
      />

      <RevertSplitModal
        isOpen={!!revertSplitTarget}
        onClose={() => setRevertSplitTarget(null)}
        route={revertSplitTarget}
        siblings={
          revertSplitTarget
            ? routes.filter(
                (r) =>
                  r.parentRouteId ===
                    (revertSplitTarget.parentRouteId || String(revertSplitTarget.id).split('.')[0]) ||
                  (r.isSplitRoute &&
                    String(r.id).startsWith(
                      (revertSplitTarget.parentRouteId ||
                        String(revertSplitTarget.id).split('.')[0]) + '.'
                    ))
              )
            : []
        }
        onConfirmRevert={handleConfirmRevert}
      />

      <AssignModal
        isOpen={!!assignTarget}
        onClose={() => setAssignTarget(null)}
        route={assignTarget}
        trucks={trucks}
        staff={staff}
        activeRoutes={routes}
        historyRoutes={historicalRoutes}
        onConfirmAssignment={handleConfirmAssignment}
        onMoveToFloor={handleMoveToFloor}
        onShowToast={showToast}
      />

      <LiquidateModal
        isOpen={!!liquidateTarget}
        onClose={() => setLiquidateTarget(null)}
        route={liquidateTarget}
        defaultAuditor={currentUser?.nombre || currentUser?.username || ''}
        onConfirmLiquidation={handleConfirmLiquidation}
      />

      <FinalizeCajaAbiertaModal
        isOpen={!!finalizeCajaAbiertaTarget}
        onClose={() => setFinalizeCajaAbiertaTarget(null)}
        route={finalizeCajaAbiertaTarget}
        onConfirmFinalize={handleFinalizeCajaAbierta}
      />

      <ReceiptModal
        isOpen={!!receiptTarget}
        onClose={() => {
          setReceiptTarget(null);
          setReceiptConsolidatedSiblings(undefined);
        }}
        route={receiptTarget}
        consolidatedSiblings={receiptConsolidatedSiblings}
        staff={staff}
      />

      <NewTruckModal
        isOpen={isNewTruckModalOpen}
        onClose={() => setIsNewTruckModalOpen(false)}
        defaultAgencia={effectiveAgencyForCreation}
        onSubmit={handleCreateTruck}
      />

      <NewStaffModal
        isOpen={isNewStaffModalOpen}
        onClose={() => setIsNewStaffModalOpen(false)}
        defaultAgencia={effectiveAgencyForCreation}
        onSubmit={handleCreateStaff}
      />

      <DailySummaryModal
        isOpen={isDailySummaryModalOpen}
        onClose={() => setIsDailySummaryModalOpen(false)}
        routes={routes.filter((r) => canViewAgency(r.agencia))}
        allLiquidatedRoutes={allLiquidatedRoutes}
        staff={visibleStaff}
        trucks={visibleTrucks}
        selectedAgency={selectedAgency}
        agencies={agencies}
        fechaHoy={stats.fechaHoy}
        initialMode={dailySummaryMode}
        onOpenClosingActa={() => {
          setIsDailySummaryModalOpen(false);
          setIsClosingActaModalOpen(true);
        }}
      />

      <ClosingActaModal
        isOpen={isClosingActaModalOpen}
        onClose={() => setIsClosingActaModalOpen(false)}
        routes={routes.filter((r) => canViewAgency(r.agencia))}
        allLiquidatedRoutes={allLiquidatedRoutes}
        selectedAgency={selectedAgency}
        agencies={agencies}
        fechaHoy={stats.fechaHoy}
        quienLiquida={currentUser?.nombre || currentUser?.username || 'Operador de Agencia'}
      />

      <DeleteRoutesModal
        isOpen={!!deleteRoutesTargetIds && deleteRoutesTargetIds.length > 0}
        onClose={() => setDeleteRoutesTargetIds(null)}
        routeIds={deleteRoutesTargetIds || []}
        routes={routes}
        onConfirmDelete={handleConfirmDeleteRoutes}
      />

      <UnassignedResourcesModal
        isOpen={isUnassignedResourcesModalOpen}
        onClose={() => setIsUnassignedResourcesModalOpen(false)}
        trucks={visibleTrucks}
        staff={visibleStaff}
        routes={routes}
        onSetTruckReason={handleSetTruckReason}
        onSetStaffReason={handleSetStaffReason}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
