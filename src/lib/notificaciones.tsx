"use client";

/**
 * Notificaciones de navegador para mensajes dirigidos al usuario actual.
 *
 * Cuando otro miembro escribe un mensaje en el hilo de un entregable y
 * me etiqueta explícitamente (`paraQuien` contiene mi nombre), mostramos
 * una notificación nativa del navegador si la pestaña está oculta o
 * desfocalizada. Evita tener que vigilar el chat para no perderse
 * peticiones de información.
 *
 * Permisos: al primer uso, pedimos permiso de forma lazy y silenciosa.
 * Si el usuario lo deniega, el hook simplemente no hace nada.
 */
import { useEffect, useRef } from "react";
import { useAppState } from "./context";
import { useUsuario } from "./usuario";

export function useNotificacionesMensajesDirigidos(): void {
  const state = useAppState();
  const { nombre: currentUser } = useUsuario();

  // Guarda el ISO del último mensaje que "ya vimos" al montar, para que
  // al refrescar la app no se disparen notificaciones por el histórico.
  const bootstrappedRef = useRef(false);
  const lastSeenRef = useRef<string>("");

  useEffect(() => {
    if (!currentUser) return;
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;

    const mensajes = state.mensajes ?? [];

    if (!bootstrappedRef.current) {
      // En el primer render tomamos como "ya visto" el mensaje más reciente.
      const max = mensajes.reduce((m, x) => {
        const t = x.editado ?? x.creado ?? "";
        return t > m ? t : m;
      }, "");
      lastSeenRef.current = max || new Date().toISOString();
      bootstrappedRef.current = true;
      return;
    }

    const candidatos = mensajes.filter((m) => {
      const t = m.editado ?? m.creado ?? "";
      if (!t || t <= lastSeenRef.current) return false;
      if (m.autor === currentUser) return false;
      const dirigidoAMi = Array.isArray(m.paraQuien) && m.paraQuien.includes(currentUser);
      if (!dirigidoAMi) return false;
      // Nunca notificamos mensajes resueltos (es ruido).
      if (m.estado === "resuelto") return false;
      // Si ya lo marqué como leído (p. ej. otra pestaña), no notificar.
      if (Array.isArray(m.leidoPor) && m.leidoPor.includes(currentUser)) return false;
      return true;
    });

    // Actualizamos el "último visto" aunque no notifiquemos (pestaña visible).
    const nuevoMax = candidatos.reduce(
      (m, x) => {
        const t = x.editado ?? x.creado ?? "";
        return t > m ? t : m;
      },
      lastSeenRef.current,
    );
    if (nuevoMax !== lastSeenRef.current) lastSeenRef.current = nuevoMax;

    if (candidatos.length === 0) return;

    // Pedimos permiso sólo si hay algo real que notificar (menos fricción).
    const dispara = (permitido: boolean) => {
      if (!permitido) return;
      const visible = !document.hidden;
      if (visible) return;
      for (const m of candidatos) {
        const autor = m.autor || "Alguien";
        const texto = (m.texto ?? "").slice(0, 140);
        try {
          new Notification(`Mensaje de ${autor}`, {
            body: texto,
            tag: m.id,
          });
        } catch {
          // noop (iOS Safari no soporta el constructor).
        }
      }
    };

    if (Notification.permission === "granted") {
      dispara(true);
    } else if (Notification.permission === "default") {
      void Notification.requestPermission().then((perm) => dispara(perm === "granted"));
    }
  }, [state.mensajes, currentUser]);
}
