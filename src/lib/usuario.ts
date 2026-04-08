"use client";

import { createContext, useContext } from "react";
import type { RolUsuario } from "./types";

interface UsuarioCtx {
  userId: string;
  nombre: string;
  rol: RolUsuario;
}

export const UsuarioContext = createContext<UsuarioCtx>({
  userId: "local",
  nombre: "Gabi",
  rol: "admin",
});

export function useUsuario() {
  return useContext(UsuarioContext);
}

export function useIsMentor() {
  const { rol } = useUsuario();
  return rol === "mentor";
}

/** @deprecated — use useUsuario().nombre instead */
export const USUARIO_ACTUAL = "Gabi";
