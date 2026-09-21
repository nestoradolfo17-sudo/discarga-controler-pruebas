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
} from './types';
import { INITIAL_ROUTES, INITIAL_TRUCKS, INITIAL_STAFF, INITIAL_USERS } from './data/initialData';
import {
  isSupabaseConfigured,
  fetchSharedCollection,
  pushSharedCollection,
  subscribeToSharedCollection,
  SyncIdHolder,
  SyncableTable,
} from './services/sync';
import { TRUCK_REASON_REMUNERA, STAFF_REASON_REMUNERA } from './data/unavailableReasons';
import { exportRoutesToExcel } from './utils/excel';
import { formatDateToGuatemala, formatDateTimeToGuatemala } from './utils/date';
import { Navbar } from './components/Navbar';
import { StatsCards } from './components/StatsCards';
import { TabNav, ActiveTab } from './components/TabNav';
import { RoutesTable } from './components/RoutesTable';
import { ResourcesView } from './components/ResourcesView';
import { BatchImportView } from './components/BatchImportView';
import { LiquidatedBoardView } from './components/LiquidatedBoardView';
import { NewRouteModal } from './components/modals/NewRouteModal';
import { NewTrasladoRouteModal } from './components/modals/NewTrasladoRouteModal';
import { RouteTypeSelectModal } from './components/modals/RouteTypeSelectModal';
import { SplitRouteModal } from './components/modals/SplitRouteModal';
import { RevertSplitModal } from './components/modals/RevertSplitModal';
import { AssignModal } from './components/modals/AssignModal';
import { LiquidateModal } from './components/modals/LiquidateModal';
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
  const [users, setUsers] = useState<AppUser[]>(() => {
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

  const currentUser = useMemo(
    () => users.find((u) => u.username.toLowerCase() === (currentUsername || '').toLowerCase()) || null,
    [users, currentUsername]
  );

  // --- Sincronización compartida (Supabase) — fase de pruebas ---
  // Corrección/diseño intencional: si VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
  // no están configuradas (ver src/services/supabaseClient.ts), todo este bloque
  // queda inactivo y la aplicación funciona exactamente igual que antes (solo
  // localStorage, un usuario por navegador). Esto evita que agregar la base de
  // datos compartida cambie el comportamiento de nadie que siga sin configurarla.
  const [isRemoteReady, setIsRemoteReady] = useState(!isSupabaseConfigured);
  const routesSyncRef = useRef<SyncIdHolder & { json: string }>({ json: '', ids: null });
  const historySyncRef = useRef<SyncIdHolder & { json: string }>({ json: '', ids: null });
  const trucksSyncRef = useRef<SyncIdHolder & { json: string }>({ json: '', ids: null });
  const staffSyncRef = useRef<SyncIdHolder & { json: string }>({ json: '', ids: null });
  const usersSyncRef = useRef<SyncIdHolder & { json: string }>({ json: '', ids: null });

  // Sube una colección a Supabase solo si su contenido realmente cambió desde
  // la última vez que se sincronizó (en cualquier dirección: una edición local
  // o un cambio recibido por tiempo real de otro usuario). Esta comparación es
  // lo que evita un ciclo infinito: al recibir por tiempo real un cambio que
  // este mismo navegador acaba de subir, el contenido ya coincide con lo
  // último sincronizado y no se vuelve a subir.
  const pushIfChanged = useCallback(
    <T extends { id: string }>(
      table: SyncableTable,
      items: T[],
      ref: { current: SyncIdHolder & { json: string } }
    ) => {
      if (!isSupabaseConfigured || !isRemoteReady) return;
      const json = JSON.stringify(items);
      if (json === ref.current.json) return;
      ref.current.json = json;
      void pushSharedCollection(table, items, ref.current);
    },
    [isRemoteReady]
  );

  // Carga inicial desde Supabase (una sola vez al montar). Si alguna colección
  // llega vacía (primera vez que esta app se conecta a la base de datos), se
  // siembra con los mismos datos con los que ya arrancaba en modo local, para
  // no perder el punto de partida — y se sube esa siembra de una vez.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;

    (async () => {
      try {
        const [remoteRoutes, remoteHistory, remoteTrucks, remoteStaff, remoteUsers] = await Promise.all([
          fetchSharedCollection<Route>('app_routes'),
          fetchSharedCollection<Route>('app_historical_routes'),
          fetchSharedCollection<Truck>('app_trucks'),
          fetchSharedCollection<Staff>('app_staff'),
          fetchSharedCollection<AppUser>('app_users'),
        ]);
        if (cancelled) return;

        const finalRoutes = remoteRoutes && remoteRoutes.length > 0 ? remoteRoutes : routes;
        const finalHistory = remoteHistory && remoteHistory.length > 0 ? remoteHistory : historicalRoutes;
        const finalTrucks = remoteTrucks && remoteTrucks.length > 0 ? remoteTrucks : trucks;
        const finalStaff = remoteStaff && remoteStaff.length > 0 ? remoteStaff : staff;
        const finalUsers = remoteUsers && remoteUsers.length > 0 ? remoteUsers : users;

        setRoutes(finalRoutes);
        setHistoricalRoutes(finalHistory);
        setTrucks(finalTrucks);
        setStaff(finalStaff);
        setUsers(finalUsers);

        routesSyncRef.current = { json: JSON.stringify(finalRoutes), ids: new Set(finalRoutes.map((r) => r.id)) };
        historySyncRef.current = { json: JSON.stringify(finalHistory), ids: new Set(finalHistory.map((r) => r.id)) };
        trucksSyncRef.current = { json: JSON.stringify(finalTrucks), ids: new Set(finalTrucks.map((t) => t.id)) };
        staffSyncRef.current = { json: JSON.stringify(finalStaff), ids: new Set(finalStaff.map((s) => s.id)) };
        usersSyncRef.current = { json: JSON.stringify(finalUsers), ids: new Set(finalUsers.map((u) => u.id)) };

        const emptyIdHolder: SyncIdHolder = { ids: null };
        if (!remoteRoutes || remoteRoutes.length === 0) void pushSharedCollection('app_routes', finalRoutes, emptyIdHolder);
        if (!remoteHistory || remoteHistory.length === 0)
          void pushSharedCollection('app_historical_routes', finalHistory, { ids: null });
        if (!remoteTrucks || remoteTrucks.length === 0) void pushSharedCollection('app_trucks', finalTrucks, { ids: null });
        if (!remoteStaff || remoteStaff.length === 0) void pushSharedCollection('app_staff', finalStaff, { ids: null });
        if (!remoteUsers || remoteUsers.length === 0) void pushSharedCollection('app_users', finalUsers, { ids: null });
      } catch (e) {
        console.error('Error cargando datos compartidos de Supabase:', e);
      } finally {
        if (!cancelled) setIsRemoteReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Solo debe ejecutarse una vez al montar: intencionalmente no depende de
    // routes/trucks/staff/etc. (se usan solo como semilla si Supabase está vacío).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Suscripción en tiempo real: refleja cambios hechos por otros usuarios de
  // prueba (en otra computadora) sin necesidad de recargar la página.
  useEffect(() => {
    if (!isSupabaseConfigured || !isRemoteReady) return;

    const unsubscribers = [
      subscribeToSharedCollection<Route>('app_routes', (updater) => {
        setRoutes((prev) => {
          const next = updater(prev);
          routesSyncRef.current = { json: JSON.stringify(next), ids: new Set(next.map((r) => r.id)) };
          return next;
        });
      }),
      subscribeToSharedCollection<Route>('app_historical_routes', (updater) => {
        setHistoricalRoutes((prev) => {
          const next = updater(prev);
          historySyncRef.current = { json: JSON.stringify(next), ids: new Set(next.map((r) => r.id)) };
          return next;
        });
      }),
      subscribeToSharedCollection<Truck>('app_trucks', (updater) => {
        setTrucks((prev) => {
          const next = updater(prev);
          trucksSyncRef.current = { json: JSON.stringify(next), ids: new Set(next.map((t) => t.id)) };
          return next;
        });
      }),
      subscribeToSharedCollection<Staff>('app_staff', (updater) => {
        setStaff((prev) => {
          const next = updater(prev);
          staffSyncRef.current = { json: JSON.stringify(next), ids: new Set(next.map((s) => s.id)) };
          return next;
        });
      }),
      subscribeToSharedCollection<AppUser>('app_users', (updater) => {
        setUsers((prev) => {
          const next = updater(prev);
          usersSyncRef.current = { json: JSON.stringify(next), ids: new Set(next.map((u) => u.id)) };
          return next;
        });
      }),
    ];

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [isRemoteReady]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    } catch (e) {
      console.error(e);
    }
    pushIfChanged('app_users', users, usersSyncRef);
  }, [users, pushIfChanged]);

  const handleLogin = (username: string, password: string): boolean => {
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
  }) => {
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
  };

  const handleUpdateUser = (
    userId: string,
    updates: Partial<
      Pick<AppUser, 'permissions' | 'canDelete' | 'isAdmin' | 'agencyAccess' | 'username' | 'nombre'>
    >
  ) => {
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
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, password: newPassword } : u)));
    showToast('Contraseña actualizada.', 'success');
  };

  const handleDeleteUser = (userId: string) => {
    setUsers((prev) => {
      const target = prev.find((u) => u.id === userId);
      if (!target) return prev;
      const remainingAdmins = prev.filter((u) => u.isAdmin && u.id !== userId).length;
      if (target.isAdmin && remainingAdmins === 0) {
        showToast('Debe existir al menos un usuario administrador.', 'error');
        return prev;
      }
      showToast(`Usuario "${target.username}" eliminado.`, 'info');
      return prev.filter((u) => u.id !== userId);
    });
  };

  // Permisos efectivos del usuario en sesión (un administrador siempre tiene acceso total)
  const canView = (key: keyof TablePermissions) => !!currentUser && (currentUser.isAdmin || currentUser.permissions[key]);
  const canDeleteData = !!currentUser && (currentUser.isAdmin || currentUser.canDelete);

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

  const [activeTab, setActiveTab] = useState<ActiveTab>('board');

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
    pushIfChanged('app_routes', routes, routesSyncRef);
  }, [routes, pushIfChanged]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_TRUCKS, JSON.stringify(trucks));
    } catch (e) {
      console.error(e);
    }
    pushIfChanged('app_trucks', trucks, trucksSyncRef);
  }, [trucks, pushIfChanged]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_STAFF, JSON.stringify(staff));
    } catch (e) {
      console.error(e);
    }
    pushIfChanged('app_staff', staff, staffSyncRef);
  }, [staff, pushIfChanged]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(historicalRoutes));
    } catch (e) {
      console.error(e);
    }
    pushIfChanged('app_historical_routes', historicalRoutes, historySyncRef);
  }, [historicalRoutes, pushIfChanged]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Distinct agencies (solo las que el usuario en sesión tiene permiso de ver)
  const agencies = useMemo(() => {
    const set = new Set<string>();
    routes.forEach((r) => {
      if (r.agencia) set.add(r.agencia);
    });
    historicalRoutes.forEach((r) => {
      if (r.agencia) set.add(r.agencia);
    });
    return Array.from(set).filter((ag) => canViewAgency(ag));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, historicalRoutes, currentUser]);

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
      return liqDate ? `${r.id}__${liqDate}` : `${r.id}__activa`;
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
      const idx = prev.findIndex((r) => String(r.id) === String(originalRoute.id));
      if (idx === -1) return prev;
      const copy = [...prev];
      copy.splice(idx, 1, ...childRoutes);
      return copy;
    });
    setSplitRouteTarget(null);
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

    setRevertSplitTarget(null);
    showToast(`Partición revertida con éxito. Restaurada ruta matriz ${parentRouteId}.`, 'success');
  };

  const handleConfirmAssignment = (
    routeId: string,
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
    const targetRoute = routes.find((r) => String(r.id) === String(routeId));
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
        if (String(r.id) === String(routeId)) {
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
                String(r.id) !== String(routeId) &&
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
        String(r.id) !== String(routeId) &&
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

  const handleMoveToFloor = (
    routeId: string,
    tomorrowDate: string,
    motivo: string = 'Ruta a Piso para despacho de mañana'
  ) => {
    const targetRoute = routes.find((r) => String(r.id) === String(routeId));
    if (!targetRoute) return;

    // Liberar camión o personal si estaban asignados previamente, verificando si otras rutas activas los siguen usando
    const asig = targetRoute.asignacion || targetRoute.ultimoDespacho;
    const otherActiveRoutes = routes.filter(
      (r) => String(r.id) !== String(routeId) && r.estado === 'En Tránsito' && r.asignacion
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
        if (String(r.id) === String(routeId)) {
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

  const handleConfirmDeleteRoutes = (routeIdsToDelete: string[]) => {
    const idsSet = new Set(routeIdsToDelete.map(String));

    // Rutas que se van a eliminar
    const deletingRoutes = routes.filter((r) => idsSet.has(String(r.id)));

    // Rutas activas que permanecen sin eliminar
    const remainingActiveRoutes = routes.filter(
      (r) => !idsSet.has(String(r.id)) && r.estado === 'En Tránsito' && r.asignacion
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
    setRoutes((prev) => prev.filter((r) => !idsSet.has(String(r.id))));
    // Eliminar del historial si estuviera presente
    setHistoricalRoutes((prev) => prev.filter((r) => !idsSet.has(String(r.id))));

    setDeleteRoutesTargetIds(null);
    showToast(
      routeIdsToDelete.length === 1
        ? `Ruta ${routeIdsToDelete[0]} eliminada del tablero.`
        : `Se eliminaron ${routeIdsToDelete.length} rutas del tablero.`,
      'success'
    );
  };

  const handleConfirmLiquidation = (
    routeId: string,
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
    }
  ) => {
    const targetRoute = routes.find((r) => String(r.id) === String(routeId));
    if (!targetRoute) return;

    // Free Truck and Staff, considerando si otras rutas activas siguen utilizando la unidad o tripulación (Optimización / Carga compartida)
    const otherActiveRoutes = routes.filter(
      (r) => String(r.id) !== String(routeId) && r.estado === 'En Tránsito' && r.asignacion
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
      };

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
        tipoAsignacion: currentTripTipo,
        esReasignacion: currentTripTipo === 'Revisita',
        esRecarga: currentTripTipo === 'Recarga',
        liquidacion: null,
      };

      setRoutes((prev) =>
        prev.map((r) => (String(r.id) === String(routeId) ? updatedRoute : r))
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
      },
    };

    setRoutes((prev) => prev.map((r) => (String(r.id) === String(routeId) ? updatedRoute : r)));

    // Archive into historicalRoutes
    setHistoricalRoutes((prev) => {
      const idx = prev.findIndex((hr) => String(hr.id) === String(routeId));
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = updatedRoute;
        return copy;
      }
      return [updatedRoute, ...prev];
    });

    setLiquidateTarget(null);

    // Check if part of split
    if (targetRoute.isSplitRoute && targetRoute.parentRouteId) {
      const siblings = routes.filter((r) => r.parentRouteId === targetRoute.parentRouteId);
      const allSettled = siblings.every(
        (s) => String(s.id) === String(routeId) || s.estado === 'Liquidada'
      );
      if (allSettled) {
        showToast(
          `¡Completados todos los viajes de la ruta ${targetRoute.parentRouteId}!`,
          'success'
        );
        handleViewConsolidatedReceipt(targetRoute.parentRouteId);
        return;
      } else {
        showToast(`Línea ${targetRoute.id} liquidada y transferida al Tablero de Rutas Liquidadas.`, 'info');
      }
    } else {
      showToast(`Ruta ${targetRoute.id} completamente liquidada y transferida al Tablero de Rutas Liquidadas.`, 'success');
    }

    // Open receipt modal
    handleViewSettlementReceipt(routeId, updatedRoute);
  };

  const handleCommitBatchRoutes = (importedRoutes: Route[]) => {
    // Preservar rutas que sigan vigentes al pasar a un nuevo día:
    // - En Tránsito o Abierta (con devolución pendiente de reasignar)
    // - Pendiente (incluye rutas "a Piso" reprogramadas), que deben seguir apareciendo
    //   en el tablero hasta que se asignen, liquiden o el usuario las elimine manualmente.
    const activeRunningBacklog = routes.filter(
      (r) => r.estado === 'En Tránsito' || r.estado === 'Abierta' || r.estado === 'Pendiente'
    );
    const pendientesCarriedOver = activeRunningBacklog.filter((r) => r.estado === 'Pendiente').length;

    // Archivar rutas liquidadas anteriores.
    // La comparación de duplicados usa ID + fecha de liquidación (no solo el ID), porque
    // los números de ruta del Excel suelen repetirse día a día: si solo se comparara por
    // ID, la liquidación de "hoy" para la ruta 102201 se descartaría en cuanto ya existiera
    // una liquidación archivada de un día anterior con ese mismo número.
    routes
      .filter((r) => r.estado === 'Liquidada')
      .forEach((liqR) => {
        const liqDate = liqR.fechaLiquidacion || liqR.liquidacion?.fechaLiquidacion;
        setHistoricalRoutes((prev) => {
          const alreadyArchived = prev.some((hr) => {
            if (String(hr.id) !== String(liqR.id)) return false;
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
    const runningIds = new Set(activeRunningBacklog.map((r) => String(r.id)));
    const freshDailyRoutes = importedRoutes.filter((r) => !runningIds.has(String(r.id)));

    setRoutes([...freshDailyRoutes, ...activeRunningBacklog]);
    setActiveTab('board');

    const msg =
      activeRunningBacklog.length > 0
        ? `Se importaron ${freshDailyRoutes.length} rutas del día para asignar. Se preservaron ${activeRunningBacklog.length} ruta(s) vigente(s)${
            pendientesCarriedOver > 0 ? ` (${pendientesCarriedOver} pendiente(s) de días anteriores)` : ''
          }.`
        : `Se importaron ${freshDailyRoutes.length} rutas del día listas para asignar.`;
    showToast(msg, 'success');
  };

  const handleCreateTruck = (truckData: {
    idCamion: string;
    placa: string;
    agencia: string;
    ton: string;
    bahias: string;
    capacidad: string;
  }) => {
    const newT: Truck = {
      id: `T-${Date.now()}`,
      idCamion: truckData.idCamion || undefined,
      placa: truckData.placa,
      agencia: truckData.agencia,
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
          const current = updatedList[matchIdx];
          const newStatus = current.estado === 'En Ruta' ? 'En Ruta' : imp.estado;
          updatedList[matchIdx] = {
            ...current,
            dpi: imp.dpi !== 'N/A' && imp.dpi ? imp.dpi : current.dpi,
            nombre: imp.nombre || current.nombre,
            agencia: imp.agencia || current.agencia,
            puesto: imp.puesto || current.puesto,
            rol: imp.rol || current.rol,
            telefono: imp.telefono && imp.telefono !== '-' ? imp.telefono : current.telefono,
            estado: newStatus,
            // Corrección: estos tres campos ya venían parseados y visibles en la
            // vista previa de la carga masiva, pero antes se descartaban aquí y
            // nunca se guardaban (ej. marcar a alguien como BAJA por Excel no
            // tenía ningún efecto real). Ahora sí se actualizan.
            codigo: imp.codigo || current.codigo,
            codigoCorto: imp.codigoCorto || current.codigoCorto,
            estatus: imp.estatus || current.estatus,
          };
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
          ? `Carga masiva completada: ${newCount} colaboradores agregados y ${updatedCount} actualizados desde Excel.`
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
          const current = updatedList[matchIdx];
          const newEstado = current.estado === 'En Ruta' ? 'En Ruta' : imp.estado;
          updatedList[matchIdx] = {
            ...current,
            idCamion: imp.idCamion || current.idCamion,
            placa: imp.placa || current.placa,
            agencia: imp.agencia || current.agencia,
            capacidad: imp.capacidad || current.capacidad,
            ton: imp.ton !== undefined && imp.ton !== '' ? imp.ton : current.ton,
            bahias: imp.bahias !== undefined && imp.bahias !== '' ? imp.bahias : current.bahias,
            estado: newEstado,
          };
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
          ? `Carga masiva completada: ${newCount} camiones agregados y ${updatedCount} actualizados desde Excel.`
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
    if (removed.length === 1) {
      showToast(`Colaborador ${removed[0].nombre} eliminado`, 'info');
    } else {
      showToast(`${removed.length} colaboradores eliminados`, 'info');
    }
  };

  const handleUpdateStaffStatus = (staffId: string, newStatus: ResourceStatus) => {
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

  const handleResetDemo = () => {
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

  const handleViewSettlementReceipt = (routeId: string, directRoute?: Route) => {
    const target =
      directRoute ||
      routes.find((r) => String(r.id) === String(routeId)) ||
      allLiquidatedRoutes.find((r) => String(r.id) === String(routeId)) ||
      historicalRoutes.find((r) => String(r.id) === String(routeId));

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
  if (isSupabaseConfigured && !isRemoteReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-slate-300 border-t-blue-600 rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600">Cargando datos compartidos...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <div className="bg-gradient-to-b from-slate-100 to-slate-50 text-slate-800 antialiased min-h-screen flex flex-col font-sans">
      <Navbar
        agencies={agencies}
        selectedAgency={selectedAgency}
        onSelectAgency={setSelectedAgency}
        onOpenNewRouteModal={() => setIsRouteTypeSelectModalOpen(true)}
        onOpenDailySummaryModal={handleOpenDailySummary}
        currentUsername={currentUser.nombre || currentUser.username}
        isAdmin={currentUser.isAdmin}
        onLogout={handleLogout}
      />

      <main className={`flex-1 w-full max-w-[1920px] mx-auto px-2.5 sm:px-4 md:px-6 lg:px-10 py-3 md:py-4 space-y-3 md:space-y-4 ${(isDailySummaryModalOpen || isClosingActaModalOpen) ? 'no-print print:hidden' : ''}`}>
        <StatsCards
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

        <TabNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onExportExcel={handleExportActiveRoutesExcel}
          onResetDemo={handleResetDemo}
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
          <RoutesTable
            routes={filteredActiveRoutes}
            allRoutes={routes}
            trucks={trucks}
            staff={staff}
            onOpenAssignModal={(id) => {
              const r = routes.find((item) => String(item.id) === String(id));
              if (r) setAssignTarget(r);
            }}
            onOpenLiquidateModal={(id) => {
              const r = routes.find((item) => String(item.id) === String(id));
              if (r) setLiquidateTarget(r);
            }}
            onOpenSplitRouteModal={(id) => {
              const r = routes.find((item) => String(item.id) === String(id));
              if (r) setSplitRouteTarget(r);
            }}
            onOpenRevertSplitModal={(id) => {
              const r = routes.find((item) => String(item.id) === String(id));
              if (r) setRevertSplitTarget(r);
            }}
            onViewSettlementReceipt={(id) => handleViewSettlementReceipt(id)}
            onViewConsolidatedReceipt={(parentRouteId) =>
              handleViewConsolidatedReceipt(parentRouteId)
            }
            onOpenNewRouteModal={() => setIsRouteTypeSelectModalOpen(true)}
            onMoveToFloor={handleMoveToFloor}
            onOpenDeleteModal={canDeleteData ? (ids) => setDeleteRoutesTargetIds(ids) : undefined}
          />
        )}

        {activeTab === 'liquidated' && (
          <LiquidatedBoardView
            liquidatedRoutes={allLiquidatedRoutes}
            allRoutes={routes}
            staff={staff}
            allAgencies={agencies}
            onViewSettlementReceipt={(id, routeObj) => handleViewSettlementReceipt(id, routeObj)}
            onViewConsolidatedReceipt={(parentRouteId) =>
              handleViewConsolidatedReceipt(parentRouteId)
            }
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
          />
        )}

        {activeTab === 'batch' && (
          <BatchImportView
            existingRoutes={routes}
            onCommitRoutes={handleCommitBatchRoutes}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'users' && currentUser.isAdmin && (
          <UsersView
            users={users}
            currentUser={currentUser}
            onCreateUser={handleCreateUser}
            onUpdateUser={handleUpdateUser}
            onResetPassword={handleResetPassword}
            onDeleteUser={handleDeleteUser}
          />
        )}
      </main>

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
