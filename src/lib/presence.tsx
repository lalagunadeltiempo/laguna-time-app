"use client";

/**
 * Presencia ligera para la colaboración entre Gabi y Beltrán.
 *
 * Una sola suscripción al canal Supabase Realtime `workspace-laguna:presence`.
 * Cada miembro anuncia su usuario y el ID del entregable que está viendo (si
 * hay). El provider expone:
 *  - `byEntregable`: Map<entregableId, usuarios[]> (excluye al usuario actual)
 *  - `online`: usuarios conectados (excluye al actual)
 *  - `setFoco(entregableId | null)`: llamar al montar/desmontar la ficha.
 *
 * Si Realtime no está disponible (sin env de Supabase, tabla sin replicación,
 * etc.), todos los métodos degradan a no-op y los hooks devuelven estructuras
 * vacías: la UI simplemente no pinta chips, pero nada rompe.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getSupabase } from "./supabase";
import { WORKSPACE_ID } from "./store";
import { useUsuario } from "./usuario";

export interface PresenciaEstado {
  /** Usuarios presentes en un entregable (sin incluir al usuario actual). */
  byEntregable: Map<string, string[]>;
  /** Lista de usuarios online (sin incluir al usuario actual). */
  online: string[];
}

interface PresenciaContextValue extends PresenciaEstado {
  /**
   * Declara el foco del usuario actual. `null` para "no estoy dentro de ningún
   * entregable". La ficha del entregable debería llamar a esto al montar con
   * su id, y con `null` en el cleanup.
   */
  setFoco: (entregableId: string | null) => void;
}

const EMPTY_STATE: PresenciaEstado = {
  byEntregable: new Map(),
  online: [],
};

const PresenciaContext = createContext<PresenciaContextValue>({
  ...EMPTY_STATE,
  setFoco: () => {},
});

interface PresencePayload {
  user: string;
  entregableId?: string | null;
  ts: string;
}

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { nombre: currentUser } = useUsuario();
  const [estado, setEstado] = useState<PresenciaEstado>(EMPTY_STATE);
  const focoRef = useRef<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null);

  // Construye `byEntregable` / `online` a partir del state interno del canal.
  const recomputar = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (channel: any) => {
      if (!channel || !currentUser) return;
      const raw = channel.presenceState?.() as Record<string, PresencePayload[]> | undefined;
      if (!raw) return;
      const byEntregable = new Map<string, string[]>();
      const onlineSet = new Set<string>();
      for (const entries of Object.values(raw)) {
        for (const p of entries) {
          if (!p?.user) continue;
          if (p.user === currentUser) continue;
          onlineSet.add(p.user);
          if (p.entregableId) {
            const arr = byEntregable.get(p.entregableId) ?? [];
            if (!arr.includes(p.user)) arr.push(p.user);
            byEntregable.set(p.entregableId, arr);
          }
        }
      }
      setEstado({ byEntregable, online: Array.from(onlineSet).sort() });
    },
    [currentUser],
  );

  useEffect(() => {
    if (!currentUser) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const channel = supabase.channel(`${WORKSPACE_ID}:presence`, {
      config: { presence: { key: currentUser } },
    });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => recomputar(channel))
      .on("presence", { event: "join" }, () => recomputar(channel))
      .on("presence", { event: "leave" }, () => recomputar(channel))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .subscribe(async (status: any) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user: currentUser,
            entregableId: focoRef.current,
            ts: new Date().toISOString(),
          } satisfies PresencePayload);
        }
      });

    // Cuando el usuario cierra la pestaña/navegador, mandamos un
    // `untrack` explícito para que el resto de clientes no lo vean como
    // "fantasma" mientras Supabase caduca su presencia por timeout.
    const onBeforeUnload = () => {
      try {
        void channel.untrack();
      } catch {
        // noop
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      try {
        supabase.removeChannel(channel);
      } catch {
        // noop
      }
      channelRef.current = null;
      setEstado(EMPTY_STATE);
    };
  }, [currentUser, recomputar]);

  const setFoco = useCallback(
    (entregableId: string | null) => {
      if (focoRef.current === entregableId) return;
      focoRef.current = entregableId;
      const channel = channelRef.current;
      if (!channel || !currentUser) return;
      try {
        void channel.track({
          user: currentUser,
          entregableId,
          ts: new Date().toISOString(),
        } satisfies PresencePayload);
      } catch {
        // noop
      }
    },
    [currentUser],
  );

  const value = useMemo<PresenciaContextValue>(
    () => ({ ...estado, setFoco }),
    [estado, setFoco],
  );
  return <PresenciaContext.Provider value={value}>{children}</PresenciaContext.Provider>;
}

export function usePresencia(): PresenciaEstado {
  const ctx = useContext(PresenciaContext);
  return { byEntregable: ctx.byEntregable, online: ctx.online };
}

/**
 * Publica el foco del usuario actual mientras este hook esté montado.
 * Úsalo en la ficha del entregable: al abrirla, todos los otros clientes
 * verán tu avatar en la cabecera (y en la tarjeta de HOY).
 */
export function useFocoEntregable(entregableId: string | undefined): void {
  const { setFoco } = useContext(PresenciaContext);
  useEffect(() => {
    if (!entregableId) return;
    setFoco(entregableId);
    return () => setFoco(null);
  }, [entregableId, setFoco]);
}

/** Lista (sin el usuario actual) de miembros que tienen abierta esta ficha. */
export function usePresenciaEntregable(entregableId: string | undefined): string[] {
  const { byEntregable } = useContext(PresenciaContext);
  if (!entregableId) return [];
  return byEntregable.get(entregableId) ?? [];
}
